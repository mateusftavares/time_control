export const CORES_DE_DESTAQUE = [
  { valor: 'azul', nome: 'Azul' },
  { valor: 'amarelo', nome: 'Amarelo' },
  { valor: 'verde', nome: 'Verde' },
  { valor: 'vermelho', nome: 'Vermelho' },
];
export const COR_PADRAO = 'azul';

/**
 * @description Diz se o valor é uma das cores de destaque aceitas
 * @param {unknown} cor
 * @returns {boolean}
 */
export function corValida(cor) {
  return CORES_DE_DESTAQUE.some((opcao) => opcao.valor === cor);
}

/**
 * @description Aplica a cor de destaque no documento; o CSS troca os tokens --acento pelo atributo data-cor
 * @param {string} cor
 */
export function aplicarCor(cor) {
  document.documentElement.dataset.cor = corValida(cor) ? cor : COR_PADRAO;
}
