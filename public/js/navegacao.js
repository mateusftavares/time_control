const TELAS = ['hoje', 'ponto', 'tarefas', 'perfil'];
const TELAS_RESTRITAS = ['configuracoes'];
const ouvintes = new Set();

/**
 * @description Libera uma tela que só alguns usuários veem (ex.: Configurações, só para o ADM e o super ADM)
 * @param {string} tela
 */
export function liberarTela(tela) {
  if (TELAS_RESTRITAS.includes(tela) && !TELAS.includes(tela)) {
    TELAS.push(tela);
  }
}

/**
 * @description Tela pedida no endereço (#hoje, #ponto, #tarefas, #perfil, #configuracoes); Hoje quando não reconhece
 * @returns {string}
 */
export function telaAtual() {
  const pedida = location.hash.slice(1);
  return TELAS.includes(pedida) ? pedida : 'hoje';
}

/**
 * @description Avisa quando a tela muda
 * @param {(tela: string) => void} ouvinte
 */
export function aoTrocarDeTela(ouvinte) {
  ouvintes.add(ouvinte);
}

/**
 * @description Vai para uma tela
 * @param {string} tela
 */
export function irPara(tela) {
  location.hash = tela;
}

function mostrar() {
  const tela = telaAtual();

  document.querySelectorAll('.tela').forEach((secao) => {
    secao.hidden = secao.dataset.view !== tela;
  });
  document.querySelectorAll('.capsula-item').forEach((item) => {
    const ativo = item.dataset.view === tela;
    item.classList.toggle('ativo', ativo);
    if (ativo) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  ouvintes.forEach((ouvinte) => ouvinte(tela));
}

/**
 * @description Liga a troca de telas pelo endereço
 */
export function iniciarNavegacao() {
  window.addEventListener('hashchange', mostrar);
  mostrar();
}
