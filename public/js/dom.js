/* Montagem de elementos sem HTML em texto: todo conteúdo entra como texto (append/textContent) e todo
   atributo por setAttribute. Usado pelas telas que mostram dados digitados por outras pessoas. */

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @description Cria um elemento com atributos, ouvintes (chaves "on...") e filhos (texto ou nós)
 * @param {string} tag
 * @param {object} [atributos] - valores null/undefined/false são ignorados; true vira atributo vazio
 * @param {...(Node|string|number|null|false|Array)} filhos
 * @returns {HTMLElement}
 */
export function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  Object.entries(atributos).forEach(([chave, valor]) => {
    if (valor === null || valor === undefined || valor === false) {
      return;
    }
    if (chave.startsWith('on') && typeof valor === 'function') {
      elemento.addEventListener(chave.slice(2), valor);
    } else if (chave === 'class') {
      elemento.className = valor;
    } else if (chave === 'value') {
      elemento.value = valor;
    } else if (chave === 'checked' || chave === 'disabled' || chave === 'selected') {
      elemento[chave] = Boolean(valor);
    } else {
      elemento.setAttribute(chave, valor === true ? '' : String(valor));
    }
  });
  filhos.flat(Infinity).forEach((filho) => {
    if (filho !== null && filho !== undefined && filho !== false) {
      elemento.append(filho instanceof Node ? filho : String(filho));
    }
  });
  return elemento;
}

const CAMINHOS = {
  seta: ['M6 9l6 6 6-6'],
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
  voltar: ['M15 6l-6 6 6 6'],
  expandir: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  recolher: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
  criada: ['M12 5v14', 'M5 12h14'],
  status: ['M7 7h11l-3-3', 'M17 17H6l3 3'],
  campo: ['M4 20h4L19 9l-4-4L4 16z'],
  lixo: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
};

/**
 * @description Ícone de traço (stroke) pelos caminhos fixos acima
 * @param {keyof CAMINHOS} nome
 * @returns {SVGElement}
 */
export function icone(nome) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  CAMINHOS[nome].forEach((d) => {
    const caminho = document.createElementNS(SVG, 'path');
    caminho.setAttribute('d', d);
    svg.append(caminho);
  });
  return svg;
}

/**
 * @description Ícone de play preenchido (focar no pomodoro)
 * @returns {SVGElement}
 */
export function iconePlay() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cheio');
  const caminho = document.createElementNS(SVG, 'path');
  caminho.setAttribute('d', 'M8 5.5v13l10-6.5z');
  svg.append(caminho);
  return svg;
}
