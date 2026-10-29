import { createClient } from '@supabase/supabase-js';
import { lerToken } from './regras-usuarios.js';

/* Peças comuns às funções do Netlify que usam a service role (usuários e empresas). A service role ignora
   a RLS: cada função confere quem chama (autenticar) antes de tocar em qualquer dado. */
const TAMANHO_MAXIMO_CORPO = 4096;
const USUARIOS_POR_PAGINA = 1000;
export const MENSAGEM_SEM_ADM = 'a empresa precisa de um ADM ativo';

/**
 * @description Erro com o status HTTP que a função devolve
 */
export class ErroHttp extends Error {
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

/**
 * @description Registra a falha no log do Netlify e devolve um 502 sem detalhes internos
 * @param {unknown} erro
 * @param {string} acao - "não foi possível <acao>"
 * @returns {ErroHttp}
 */
export function falhou(erro, acao) {
  console.error(`falha ao ${acao}`, erro);
  return new ErroHttp(502, `não foi possível ${acao}`);
}

/**
 * @description Erro do banco para a resposta: a trava de ADM da empresa vira 409, o resto 502
 * @param {{message: string}} error
 * @param {string} acao
 * @returns {ErroHttp}
 */
export function erroDoBanco(error, acao) {
  if (String(error.message).includes(MENSAGEM_SEM_ADM)) {
    return new ErroHttp(409, MENSAGEM_SEM_ADM);
  }
  return falhou(error, acao);
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
 * @description Confere o JWT no Supabase Auth e lê o perfil de quem chama
 * @param {object} supabase - cliente com a service role
 * @param {Request} req
 * @returns {Promise<{id: string, perfil: object|null}>}
 */
export async function autenticar(supabase, req) {
  const token = lerToken(req.headers.get('authorization'));
  if (!token) {
    throw new ErroHttp(401, 'sessão ausente');
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new ErroHttp(401, 'sessão inválida ou expirada');
  }
  const { data: perfil, error: erroPerfil } = await supabase.from('perfis')
    .select('papel, ativo, super_admin, empresa_id, empresas(ativa)').eq('id', data.user.id).maybeSingle();
  if (erroPerfil) {
    throw falhou(erroPerfil, 'ler o perfil de quem chamou');
  }
  return { id: data.user.id, perfil };
}

/**
 * @description Todos os usuários do Auth (paginado)
 * @param {object} supabase
 * @returns {Promise<object[]>}
 */
export async function todosOsUsuariosAuth(supabase) {
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

function enderecoDoSite(req) {
  return (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/+$/, '');
}

/**
 * @description Convida um e-mail novo e o coloca na empresa com o papel pedido. O perfil nasce sem empresa
 *   (trigger do Auth) e entra nela aqui; se isso falhar por erro, o convite é desfeito
 * @param {object} supabase
 * @param {{email: string, nome: string, empresaId: string, papel?: string}} convite
 * @param {Request} req
 * @returns {Promise<{id: string}>}
 */
export async function convidarParaEmpresa(supabase, { email, nome, empresaId, papel = 'usuario' }, req) {
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
    .update({ empresa_id: empresaId, papel }).eq('id', data.user.id).is('empresa_id', null).select('id');
  if (erroEmpresa || colocados?.length !== 1) {
    // 0 linhas = o perfil já tem empresa (convite simultâneo de outro ADM): não é conta deste pedido, não apaga
    if (erroEmpresa) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    }
    throw falhou(erroEmpresa ?? new Error('perfil do convidado ausente ou já com empresa'),
      'colocar o convidado na empresa (convite desfeito)');
  }
  return { id: data.user.id };
}

/**
 * @description Corpo comum das funções: só POST, cliente com service role, checagem de quem chama,
 *   validação do pedido e a ação; erros viram respostas JSON
 * @param {Request} req
 * @param {{exigir: Function, validar: Function, acoes: object, nome: string}} definicao
 * @returns {Promise<Response>}
 */
export async function atender(req, { exigir, validar, acoes, nome }) {
  try {
    if (req.method !== 'POST') {
      throw new ErroHttp(405, 'use POST');
    }
    const supabase = clienteAdmin();
    const quem = await exigir(supabase, req);
    const validacao = validar(await lerCorpo(req));
    if (!validacao.ok) {
      throw new ErroHttp(400, validacao.erro);
    }
    const { pedido } = validacao;
    return responder(200, await acoes[pedido.acao](supabase, quem, pedido, req));
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return responder(erro.status, { erro: erro.message });
    }
    console.error(`${nome}: erro inesperado`, erro);
    return responder(500, { erro: 'erro interno' });
  }
}
