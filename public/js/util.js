/**
 * @description Busca elementos por id e devolve um objeto { id: elemento }; falha na hora se algum id não existir
 * @param {string[]} ids
 * @returns {Record<string, HTMLElement>}
 */
export function elementos(ids) {
  return Object.fromEntries(ids.map((id) => {
    const elemento = document.getElementById(id);
    if (!elemento) {
      throw new Error(`elemento #${id} não existe no index.html`);
    }
    return [id, elemento];
  }));
}

/**
 * @description Escapa texto para interpolar em HTML
 * @param {unknown} valor
 * @returns {string}
 */
export function escapar(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @description Texto com trechos em negrito, sem innerHTML: as partes ímpares viram <b>
 * @param {HTMLElement} alvo
 * @param {string[]} partes
 */
export function textoComDestaque(alvo, partes) {
  alvo.replaceChildren(...partes.map((parte, indice) => {
    if (indice % 2 === 0) {
      return document.createTextNode(parte);
    }
    const negrito = document.createElement('b');
    negrito.textContent = parte;
    return negrito;
  }));
}

/**
 * @description Tecla de atalho de verdade: sem Ctrl/Alt/Meta e sem a repetição de quem segura a tecla
 * @param {KeyboardEvent} evento
 * @returns {boolean}
 */
export function teclaLimpa(evento) {
  return !evento.repeat && !evento.ctrlKey && !evento.metaKey && !evento.altKey;
}
