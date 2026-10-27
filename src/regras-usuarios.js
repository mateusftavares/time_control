export const PAPEIS = ['admin', 'usuario'];
export const ACOES = ['listar', 'convidar', 'alterarPapel', 'desativar', 'reativar'];
export const TAMANHO_MAXIMO_NOME = 100;

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const TAMANHO_MAXIMO_EMAIL = 254;
const CARACTERES_DE_CONTROLE = /[\u0000-\u001F\u007F]/;

const ehAdminAtivo = (perfil) => perfil.papel === 'admin' && perfil.ativo === true;

/**
 * @description Token do cabeçalho Authorization ("Bearer <jwt>"), ou null
 * @param {string|null|undefined} cabecalho
 * @returns {string|null}
 */
export function lerToken(cabecalho) {
  const partes = String(cabecalho ?? '').match(/^Bearer\s+(\S+)$/i);
  return partes ? partes[1] : null;
}

/**
 * @description Identificador de usuário no formato do Supabase Auth
 * @param {unknown} id
 * @returns {boolean}
 */
export function idValido(id) {
  return typeof id === 'string' && FORMATO_UUID.test(id);
}

/**
 * @description E-mail aparado e em minúsculas, ou null quando não parece um e-mail
 * @param {unknown} email
 * @returns {string|null}
 */
export function normalizarEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }
  const limpo = email.trim().toLowerCase();
  return limpo.length <= TAMANHO_MAXIMO_EMAIL && FORMATO_EMAIL.test(limpo) ? limpo : null;
}

/**
 * @description Se a mudança num perfil deixaria o sistema sem nenhum admin ativo
 * @param {Array<{id: string, papel: string, ativo: boolean}>} perfis - todos os perfis
 * @param {string} id - perfil alterado
 * @param {{papel?: string, ativo?: boolean}} mudanca
 * @returns {boolean}
 */
export function deixariaSemAdmin(perfis, id, mudanca) {
  const depois = perfis.map((perfil) => (perfil.id === id ? { ...perfil, ...mudanca } : perfil));
  return !depois.some(ehAdminAtivo);
}

/**
 * @description Valida o corpo de uma chamada à função de usuários
 * @param {unknown} corpo
 * @returns {{ok: true, pedido: object} | {ok: false, erro: string}}
 */
export function validarPedido(corpo) {
  const origem = corpo && typeof corpo === 'object' ? corpo : {};
  const { acao } = origem;

  if (!ACOES.includes(acao)) {
    return { ok: false, erro: `acao deve ser uma de: ${ACOES.join(', ')}` };
  }
  if (acao === 'listar') {
    return { ok: true, pedido: { acao } };
  }
  if (acao === 'convidar') {
    return validarConvite(origem);
  }
  if (!idValido(origem.id)) {
    return { ok: false, erro: 'id de usuário inválido' };
  }
  if (acao === 'alterarPapel' && !PAPEIS.includes(origem.papel)) {
    return { ok: false, erro: `papel deve ser um de: ${PAPEIS.join(', ')}` };
  }
  return { ok: true, pedido: acao === 'alterarPapel' ? { acao, id: origem.id, papel: origem.papel } : { acao, id: origem.id } };
}

function validarConvite(origem) {
  const email = normalizarEmail(origem.email);
  if (!email) {
    return { ok: false, erro: 'e-mail inválido' };
  }

  const nome = typeof origem.nome === 'string' ? origem.nome.trim() : '';
  if (nome.length > TAMANHO_MAXIMO_NOME || CARACTERES_DE_CONTROLE.test(nome)) {
    return { ok: false, erro: `nome deve ter até ${TAMANHO_MAXIMO_NOME} caracteres, sem quebras de linha` };
  }

  const papel = origem.papel ?? 'usuario';
  if (!PAPEIS.includes(papel)) {
    return { ok: false, erro: `papel deve ser um de: ${PAPEIS.join(', ')}` };
  }

  return { ok: true, pedido: { acao: 'convidar', email, nome, papel } };
}

/**
 * @description Junta os usuários do Auth com os perfis, para a tela de Usuários
 * @param {Array<object>} usuariosAuth - de auth.admin.listUsers
 * @param {Array<object>} perfis - linhas da tabela perfis
 * @returns {Array<{id: string, nome: string, email: string, papel: string, ativo: boolean, ultimoAcesso: string|null, convitePendente: boolean}>}
 */
export function montarListaUsuarios(usuariosAuth, perfis) {
  const perfilPorId = new Map(perfis.map((perfil) => [perfil.id, perfil]));

  return usuariosAuth
    .filter((usuario) => perfilPorId.has(usuario.id))
    .map((usuario) => {
      const perfil = perfilPorId.get(usuario.id);
      return {
        id: usuario.id,
        nome: perfil.nome,
        email: usuario.email ?? perfil.email,
        papel: perfil.papel,
        ativo: perfil.ativo,
        ultimoAcesso: usuario.last_sign_in_at ?? null,
        convitePendente: !usuario.last_sign_in_at && Boolean(usuario.invited_at),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.email.localeCompare(b.email));
}
