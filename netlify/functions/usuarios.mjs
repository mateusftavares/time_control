import { createClient } from '@supabase/supabase-js';
import {
  lerToken, validarPedido, recusaDaMudanca, montarListaUsuarios,
} from '../../src/regras-usuarios.js';

/* Única peça com a service role: ela ignora a RLS, então tudo aqui passa antes pela checagem de
   que quem chama é o ADM ativo de uma empresa ativa, e só toca perfis dessa empresa. */
const TAMANHO_MAXIMO_CORPO = 4096;
const USUARIOS_POR_PAGINA = 1000;
const BANIMENTO_SEM_PRAZO = '876000h';
const MENSAGEM_SEM_ADM = 'a empresa precisa de um ADM ativo';

export const config = { path: '/api/usuarios' };

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function responder(status, corpo) {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function clienteAdmin() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new ErroHttp(500, 'função sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY configuradas');
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function falhou(erro, acao) {
  console.error(`usuarios: falha ao ${acao}`, erro);
  return new ErroHttp(502, `não foi possível ${acao}`);
}

async function lerCorpo(req) {
  const texto = await req.text();
  if (texto.length > TAMANHO_MAXIMO_CORPO) {
    throw new ErroHttp(413, 'pedido grande demais');
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroHttp(400, 'JSON inválido');
  }
}

/**
 * @description Confere o JWT no Supabase Auth e exige que o dono seja o ADM ativo de uma empresa ativa
 * @returns {Promise<{id: string, empresaId: string}>}
 */
async function exigirAdmin(supabase, req) {
  const token = lerToken(req.headers.get('authorization'));
  if (!token) {
    throw new ErroHttp(401, 'sessão ausente');
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new ErroHttp(401, 'sessão inválida ou expirada');
  }

  const { data: perfil, error: erroPerfil } = await supabase
    .from('perfis').select('papel, ativo, empresa_id, empresas(ativa)').eq('id', data.user.id).maybeSingle();
  if (erroPerfil) {
    throw falhou(erroPerfil, 'ler o perfil de quem chamou');
  }
  if (!perfil || perfil.papel !== 'admin' || !perfil.ativo || !perfil.empresa_id || perfil.empresas?.ativa !== true) {
    throw new ErroHttp(403, 'só o ADM ativo da empresa gerencia usuários');
  }
  return { id: data.user.id, empresaId: perfil.empresa_id };
}

async function perfisDaEmpresa(supabase, empresaId) {
  const { data, error } = await supabase.from('perfis').select('id, nome, email, papel, ativo').eq('empresa_id', empresaId);
  if (error) {
    throw falhou(error, 'ler os perfis');
  }
  return data;
}

async function todosOsUsuariosAuth(supabase) {
  const usuarios = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: USUARIOS_POR_PAGINA });
    if (error) {
      throw falhou(error, 'listar os usuários');
    }
    usuarios.push(...data.users);
    if (data.users.length < USUARIOS_POR_PAGINA) {
      return usuarios;
    }
  }
}

/**
 * @description Perfil-alvo da mesma empresa do ADM, já conferido contra as regras do pedido
 * @returns {Promise<object>}
 */
async function exigirAlvo(supabase, adm, pedido) {
  const alvo = (await perfisDaEmpresa(supabase, adm.empresaId)).find((perfil) => perfil.id === pedido.id);
  const recusa = recusaDaMudanca(alvo, adm.id, pedido);
  if (recusa) {
    throw new ErroHttp(recusa.status, recusa.erro);
  }
  return alvo;
}

function erroDoBanco(error, acao) {
  if (String(error.message).includes(MENSAGEM_SEM_ADM)) {
    return new ErroHttp(409, MENSAGEM_SEM_ADM);
  }
  return falhou(error, acao);
}

/* O trigger manter_adm_da_empresa é a última barreira (corrida entre dois pedidos); a mensagem dele vira 409. */
async function atualizarPerfil(supabase, adm, id, campos, acao) {
  const { error } = await supabase.from('perfis').update(campos).eq('id', id).eq('empresa_id', adm.empresaId);
  if (error) {
    throw erroDoBanco(error, acao);
  }
}

function enderecoDoSite(req) {
  return (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/+$/, '');
}

const ACOES = {
  async listar(supabase, adm) {
    const [usuarios, perfis] = await Promise.all([todosOsUsuariosAuth(supabase), perfisDaEmpresa(supabase, adm.empresaId)]);
    return { usuarios: montarListaUsuarios(usuarios, perfis) };
  },

  /* O perfil nasce sem empresa (trigger do Auth) e entra na do ADM aqui; se isso falhar, o convite é desfeito. */
  async convidar(supabase, adm, { email, nome }, req) {
    // e-mail com perfil (mesmo convite pendente, de qualquer empresa) não é reconvidado: o Auth reaproveitaria a conta
    const { data: existentes, error: erroBusca } = await supabase.from('perfis').select('id').eq('email', email).limit(1);
    if (erroBusca) {
      throw falhou(erroBusca, 'conferir se o e-mail já existe');
    }
    if (existentes.length) {
      throw new ErroHttp(409, 'já existe um usuário com esse e-mail');
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo: `${enderecoDoSite(req)}/definir-senha.html`,
    });
    if (error) {
      if (error.status === 422 || /already/i.test(error.message)) {
        throw new ErroHttp(409, 'já existe um usuário com esse e-mail');
      }
      throw falhou(error, 'enviar o convite');
    }
    const { data: colocados, error: erroEmpresa } = await supabase.from('perfis')
      .update({ empresa_id: adm.empresaId }).eq('id', data.user.id).is('empresa_id', null).select('id');
    if (erroEmpresa || colocados?.length !== 1) {
      // 0 linhas = o perfil já tem empresa (convite simultâneo de outro ADM): não é conta deste pedido, não apaga
      if (erroEmpresa) {
        await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      }
      throw falhou(erroEmpresa ?? new Error('perfil do convidado ausente ou já com empresa'),
        'colocar o convidado na empresa (convite desfeito)');
    }
    return { id: data.user.id };
  },

  /* Virar ADM é transferência: quem pediu passa a usuário na mesma transação. */
  async alterarPapel(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    if (pedido.papel === 'admin') {
      const { error } = await supabase.rpc('transferir_adm', { p_novo: alvo.id });
      if (error) {
        throw erroDoBanco(error, 'transferir o papel de ADM');
      }
    }
    return { id: alvo.id, papel: pedido.papel };
  },

  /* Primeiro o perfil (a RLS corta os dados na hora), depois o ban (impede login e refresh do token). */
  async desativar(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    await atualizarPerfil(supabase, adm, alvo.id, { ativo: false }, 'desativar o perfil');
    const { error } = await supabase.auth.admin.updateUserById(alvo.id, { ban_duration: BANIMENTO_SEM_PRAZO });
    if (error) {
      throw falhou(error, 'bloquear o login (o perfil já foi desativado)');
    }
    return { id: alvo.id, ativo: false };
  },

  async reativar(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    const { error } = await supabase.auth.admin.updateUserById(alvo.id, { ban_duration: 'none' });
    if (error) {
      throw falhou(error, 'desbloquear o login');
    }
    await atualizarPerfil(supabase, adm, alvo.id, { ativo: true }, 'reativar o perfil');
    return { id: alvo.id, ativo: true };
  },
};

/**
 * @description POST /api/usuarios { acao, ... }: listar, convidar, alterarPapel, desativar, reativar; só o ADM
 *   ativo da empresa, e só sobre os membros dela
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function usuarios(req) {
  try {
    if (req.method !== 'POST') {
      throw new ErroHttp(405, 'use POST');
    }

    const supabase = clienteAdmin();
    const adm = await exigirAdmin(supabase, req);

    const validacao = validarPedido(await lerCorpo(req));
    if (!validacao.ok) {
      throw new ErroHttp(400, validacao.erro);
    }

    const { pedido } = validacao;
    return responder(200, await ACOES[pedido.acao](supabase, adm, pedido, req));
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return responder(erro.status, { erro: erro.message });
    }
    console.error('usuarios: erro inesperado', erro);
    return responder(500, { erro: 'erro interno' });
  }
}
