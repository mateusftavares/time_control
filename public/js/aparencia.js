/* Cada preferência vira um atributo no <html> (data-cor, data-superficie, data-fundo) e o CSS troca os tokens. */
export const PREFERENCIAS = {
  cor: {
    coluna: 'cor_destaque',
    padrao: 'azul',
    opcoes: [
      { valor: 'azul', nome: 'Azul' },
      { valor: 'amarelo', nome: 'Amarelo' },
      { valor: 'verde', nome: 'Verde' },
      { valor: 'vermelho', nome: 'Vermelho' },
    ],
  },
  superficie: {
    coluna: 'superficie',
    padrao: 'opaco',
    opcoes: [
      { valor: 'opaco', nome: 'Opaco' },
      { valor: 'sutil', nome: 'Vidro sutil' },
      { valor: 'liquido', nome: 'Vidro líquido' },
    ],
  },
  fundo: {
    coluna: 'fundo',
    padrao: 'liso',
    opcoes: [
      { valor: 'liso', nome: 'Liso' },
      { valor: 'cinza', nome: 'Manchas cinza' },
      { valor: 'colorido', nome: 'Manchas coloridas' },
    ],
  },
};

/**
 * @description Diz se o valor é uma das opções aceitas para a preferência
 * @param {string} chave - cor, superficie ou fundo
 * @param {unknown} valor
 * @returns {boolean}
 */
export function opcaoValida(chave, valor) {
  return Boolean(PREFERENCIAS[chave]?.opcoes.some((opcao) => opcao.valor === valor));
}

/**
 * @description Lê a aparência gravada no perfil; valor ausente ou desconhecido vira o padrão
 * @param {object|null} perfil - linha de `perfis`
 * @returns {{cor: string, superficie: string, fundo: string}}
 */
export function aparenciaDoPerfil(perfil) {
  return Object.fromEntries(Object.entries(PREFERENCIAS).map(([chave, { coluna, padrao }]) => {
    const valor = perfil?.[coluna];
    return [chave, opcaoValida(chave, valor) ? valor : padrao];
  }));
}

/**
 * @description Aplica uma preferência de aparência no documento
 * @param {string} chave - cor, superficie ou fundo
 * @param {string} valor
 */
export function aplicarPreferencia(chave, valor) {
  document.documentElement.dataset[chave] = opcaoValida(chave, valor) ? valor : PREFERENCIAS[chave].padrao;
}

/**
 * @description Aplica a aparência inteira (cor, cartões e fundo) no documento
 * @param {{cor: string, superficie: string, fundo: string}} aparencia
 */
export function aplicarAparencia(aparencia) {
  Object.entries(aparencia).forEach(([chave, valor]) => aplicarPreferencia(chave, valor));
}
