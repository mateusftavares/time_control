import { createClient } from '@supabase/supabase-js';
import {
  lerToken, validarPedido, deixariaSemAdmin, montarListaUsuarios,
} from '../../src/regras-usuarios.js';

/* Única peça com a service role: ela ignora a RLS, então tudo aqui passa antes pela
   checagem de que quem chama é um admin ativo. */
const TAMANHO_MAXIMO_CORPO = 4096;
const USUARIOS_POR_PAGINA = 1000;
const BANIMENTO_SEM_PRAZO = '876000h';
const MENSAGEM_ULTIMO_ADMIN = 'o sistema precisa de pelo menos um admin ativo';

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
 * @description Confere o JWT no Supabase Auth e exige que o dono seja admin ativo
 * @returns {Promise<string>} id do admin
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
    .from('perfis').select('papel, ativo').eq('id', data.user.id).maybeSingle();
  if (erroPerfil) {
    throw falhou(erroPerfil, 'ler o perfil de quem chamou');
  }
  if (!perfil || perfil.papel !== 'admin' || !perfil.ativo) {
    throw new ErroHttp(403, 'só um admin ativo gerencia usuários');
  }
  return data.user.id;
}

async function todosOsPerfis(supabase) {
  const { data, error } = await supabase.from('perfis').select('id, nome, email, papel, ativo');
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

async function exigirQueSobreAdmin(supabase, id, mudanca) {
  const perfis = await todosOsPerfis(supabase);
  if (!perfis.some((perfil) => perfil.id === id)) {
    throw new ErroHttp(404, 'usuário não encontrado');
  }
  if (deixariaSemAdmin(perfis, id, mudanca)) {
    throw new ErroHttp(409, MENSAGEM_ULTIMO_ADMIN);
  }
}

/* O trigger manter_um_admin é a última barreira (corrida entre dois admins); a mensagem dele vira 409. */
async function atualizarPerfil(supabase, id, campos, acao) {
  const { error } = await supabase.from('perfis').update(campos).eq('id', id);
  if (error) {
    if (String(error.message).includes(MENSAGEM_ULTIMO_ADMIN)) {
      throw new ErroHttp(409, MENSAGEM_ULTIMO_ADMIN);
    }
    throw falhou(error, acao);
  }
}

function enderecoDoSite(req) {
  return (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/+$/, '');
}

const ACOES = {
  async listar(supabase) {
    const [usuarios, perfis] = await Promise.all([todosOsUsuariosAuth(supabase), todosOsPerfis(supabase)]);
    return { usuarios: montarListaUsuarios(usuarios, perfis) };
  },

  async convidar(supabase, { email, nome, papel }, req) {
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
    if (papel === 'admin') {
      await atualizarPerfil(supabase, data.user.id, { papel }, 'definir o papel do convidado');
    }
    return { id: data.user.id };
  },

  async alterarPapel(supabase, { id, papel }) {
    await exigirQueSobreAdmin(supabase, id, { papel });
    await atualizarPerfil(supabase, id, { papel }, 'alterar o papel');
    return { id, papel };
  },

  /* Primeiro o perfil (a RLS corta os dados na hora), depois o ban (impede login e refresh do token). */
  async desativar(supabase, { id }) {
    await exigirQueSobreAdmin(supabase, id, { ativo: false });
    await atualizarPerfil(supabase, id, { ativo: false }, 'desativar o perfil');
    const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: BANIMENTO_SEM_PRAZO });
    if (error) {
      throw falhou(error, 'bloquear o login (o perfil já foi desativado)');
    }
    return { id, ativo: false };
  },

  async reativar(supabase, { id }) {
    const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: 'none' });
    if (error) {
      throw falhou(error, 'desbloquear o login');
    }
    await atualizarPerfil(supabase, id, { ativo: true }, 'reativar o perfil');
    return { id, ativo: true };
  },
};

/**
 * @description POST /api/usuarios { acao, ... }: listar, convidar, alterarPapel, desativar, reativar; só admin ativo
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function usuarios(req) {
  try {
    if (req.method !== 'POST') {
      throw new ErroHttp(405, 'use POST');
    }

    const supabase = clienteAdmin();
    await exigirAdmin(supabase, req);

    const validacao = validarPedido(await lerCorpo(req));
    if (!validacao.ok) {
      throw new ErroHttp(400, validacao.erro);
    }

    const { pedido } = validacao;
    return responder(200, await ACOES[pedido.acao](supabase, pedido, req));
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return responder(erro.status, { erro: erro.message });
    }
    console.error('usuarios: erro inesperado', erro);
    return responder(500, { erro: 'erro interno' });
  }
}
