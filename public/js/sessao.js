import { supabase } from './supabase.js';

const PAGINA_DE_LOGIN = '/login.html';
let sessaoAtual = null;
let saindo = false;

supabase.auth.onAuthStateChange((evento, sessao) => {
  sessaoAtual = sessao;
});

/**
 * @description Vai para o login; `motivo` aparece lá como aviso (ex.: sessão expirada)
 * @param {string} [motivo]
 */
export function irParaLogin(motivo) {
  const destino = motivo ? `${PAGINA_DE_LOGIN}?motivo=${encodeURIComponent(motivo)}` : PAGINA_DE_LOGIN;
  location.replace(destino);
}

/**
 * @description Sessão atual, ou manda para o login e devolve null
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function exigirSessao() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    irParaLogin();
    return null;
  }
  sessaoAtual = data.session;
  return data.session;
}

/**
 * @description Access token em memória, para as chamadas com keepalive que não passam pelo supabase-js
 * @returns {string|null}
 */
export function tokenAtual() {
  return sessaoAtual?.access_token ?? null;
}

/**
 * @description Id do usuário logado
 * @returns {string|null}
 */
export function idDoUsuario() {
  return sessaoAtual?.user?.id ?? null;
}

/**
 * @description Perfil do usuário logado (nome, e-mail, papel, ativo); a RLS só devolve o próprio
 * @returns {Promise<{id: string, nome: string, email: string, papel: string, ativo: boolean}|null>}
 */
export async function carregarPerfil() {
  const { data, error } = await supabase
    .from('perfis').select('id, nome, email, papel, ativo').eq('id', idDoUsuario()).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/**
 * @description Encerra a sessão neste navegador e volta ao login
 * @param {string} [motivo]
 */
export async function sair(motivo) {
  if (saindo) {
    return;
  }
  saindo = true;
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  irParaLogin(motivo);
}
