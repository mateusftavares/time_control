const elemento = () => document.getElementById('aviso');

/**
 * @description Mostra a faixa de erro no topo (Supabase fora do ar, gravação recusada)
 * @param {string} texto
 */
export function mostrarAviso(texto) {
  elemento().textContent = texto;
  elemento().hidden = false;
}

/**
 * @description Esconde a faixa de erro, depois de uma chamada que deu certo
 */
export function esconderAviso() {
  elemento().hidden = true;
}

/**
 * @description Texto do aviso para uma falha de API
 * @param {string} acao - o que se tentava fazer, ex.: "salvar o dia"
 * @param {import('./api.js').ErroApi} erro
 * @returns {string}
 */
export function avisoDeFalha(acao, erro) {
  return erro.status === 0
    ? `Não foi possível ${acao}: o Supabase não respondeu. Confira a conexão com a internet.`
    : `Não foi possível ${acao}: ${erro.message}.`;
}
