import { idValido, normalizarEmail, montarListaUsuarios, TAMANHO_MAXIMO_NOME } from './regras-usuarios.js';

export const ACOES_EMPRESAS = ['listar', 'criar', 'convidar', 'renomear', 'desativar', 'reativar', 'transferirAdm'];
export const TAMANHO_MAXIMO_EMPRESA = 100;

const CARACTERES_DE_CONTROLE = /[\u0000-\u001F\u007F]/;

function textoValido(valor, maximo, obrigatorio) {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if ((obrigatorio && !limpo) || limpo.length > maximo || CARACTERES_DE_CONTROLE.test(limpo)) {
    return null;
  }
  return limpo;
}

function validarPessoa(origem) {
  const email = normalizarEmail(origem.email);
  if (!email) {
    return { erro: 'e-mail inválido' };
  }
  const nome = textoValido(origem.nome ?? '', TAMANHO_MAXIMO_NOME, false);
  if (nome === null) {
    return { erro: `nome deve ter até ${TAMANHO_MAXIMO_NOME} caracteres, sem quebras de linha` };
  }
  return { email, nome };
}

/**
 * @description Valida o corpo de uma chamada à função de empresas (só o super ADM chega aqui)
 * @param {unknown} corpo
 * @returns {{ok: true, pedido: object} | {ok: false, erro: string}}
 */
export function validarPedidoEmpresa(corpo) {
  const origem = corpo && typeof corpo === 'object' ? corpo : {};
  const { acao } = origem;
  if (!ACOES_EMPRESAS.includes(acao)) {
    return { ok: false, erro: `acao deve ser uma de: ${ACOES_EMPRESAS.join(', ')}` };
  }
  if (acao === 'listar') {
    return { ok: true, pedido: { acao } };
  }

  const nomeDaEmpresa = textoValido(origem.nomeEmpresa, TAMANHO_MAXIMO_EMPRESA, true);
  if (acao === 'criar') {
    if (nomeDaEmpresa === null) {
      return { ok: false, erro: `o nome da empresa deve ter de 1 a ${TAMANHO_MAXIMO_EMPRESA} caracteres` };
    }
    const adm = validarPessoa(origem);
    return adm.erro ? { ok: false, erro: adm.erro } : { ok: true, pedido: { acao, nomeEmpresa: nomeDaEmpresa, ...adm } };
  }

  if (!idValido(origem.empresaId)) {
    return { ok: false, erro: 'empresa inválida' };
  }
  const base = { acao, empresaId: origem.empresaId };
  if (acao === 'convidar') {
    const pessoa = validarPessoa(origem);
    return pessoa.erro ? { ok: false, erro: pessoa.erro } : { ok: true, pedido: { ...base, ...pessoa } };
  }
  if (acao === 'renomear') {
    return nomeDaEmpresa === null
      ? { ok: false, erro: `o nome da empresa deve ter de 1 a ${TAMANHO_MAXIMO_EMPRESA} caracteres` }
      : { ok: true, pedido: { ...base, nomeEmpresa: nomeDaEmpresa } };
  }
  if (acao === 'transferirAdm') {
    return idValido(origem.id) ? { ok: true, pedido: { ...base, id: origem.id } } : { ok: false, erro: 'id de usuário inválido' };
  }
  return { ok: true, pedido: base };
}

/**
 * @description Por que o super ADM não pode desativar a empresa: a própria, porque perderia o acesso
 * @param {string} empresaId
 * @param {string|null} empresaDoSuperAdm
 * @returns {{status: number, erro: string}|null}
 */
export function recusaDeDesativar(empresaId, empresaDoSuperAdm) {
  return empresaId === empresaDoSuperAdm
    ? { status: 409, erro: 'você não pode desativar a sua própria empresa (perderia o acesso)' }
    : null;
}

/**
 * @description Empresas com o ADM e os membros de cada uma, para a tela do super ADM
 * @param {object[]} empresas - linhas de `empresas`
 * @param {object[]} perfis - linhas de `perfis` com empresa_id
 * @param {object[]} usuariosAuth - de auth.admin.listUsers
 * @returns {object[]} ordenadas por nome
 */
export function montarEmpresas(empresas, perfis, usuariosAuth) {
  return empresas
    .map((empresa) => {
      const membros = montarListaUsuarios(usuariosAuth, perfis.filter((perfil) => perfil.empresa_id === empresa.id));
      return {
        id: empresa.id,
        nome: empresa.nome,
        ativa: empresa.ativa,
        criadoEm: empresa.criado_em,
        adm: membros.find((membro) => membro.papel === 'admin') ?? null,
        membros,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
