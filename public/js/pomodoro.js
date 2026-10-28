import { hoje } from '/shared/tempo.js';
import { DURACAO, DESCANSOS_POR_CICLO, MOTIVOS_PAUSA, estadoVazio, sanitizarEstado } from '/shared/pomodoro.js';
import { api } from './api.js';
import { elementos, escapar, textoComDestaque, teclaLimpa } from './util.js';
import { tituloPomodoro } from './titulo.js';
import { mostrarAviso, esconderAviso, avisoDeFalha } from './aviso.js';
import { telaAtual } from './navegacao.js';

const MINUTO = 60 * 1000;
const INTERVALO_GRAVACAO_MS = 5000;
const RAIO_DO_ANEL = 48;
const COMPRIMENTO_DO_ANEL = 2 * Math.PI * RAIO_DO_ANEL;

const FASE = {
  foco: { rotulo: 'Foco' },
  descanso: { rotulo: 'Descanso' },
  longo: { rotulo: 'Descanso longo' },
};

const el = elementos([
  'cardPomo', 'phasePill', 'clock', 'clockNote', 'stageSub', 'anelProgresso', 'cycleTrack',
  'btnMain', 'btnPause', 'btnSkip', 'btnReset', 'btnResume', 'pauseBar', 'pauseWhy', 'pauseElapsed',
  'reasonPanel', 'reasonGrid', 'btnCancelPause', 'btnSound', 'soundLabel', 'btnAuto',
  'statPomos', 'statFocus', 'reasonList', 'reasonEmpty',
  'ladoPomodoro', 'ladoPomoFase', 'ladoPomoTempo', 'ladoPomoBotao', 'pomoAbrir', 'pomoPopup',
]);

/* Os campos do estado seguem em inglês (phase, remaining, breaks...) porque é o formato já gravado no banco. */
let estado = estadoVazio();
let diaDoEstado = hoje();
let ultimoTique = Date.now();
let ultimaGravacao = 0;

const duracaoDaFase = () => DURACAO[estado.phase];
const proximoDescansoEhLongo = () => (estado.breaks + 1) % DESCANSOS_POR_CICLO === 0;

function mmss(ms) {
  const segundos = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(segundos / 60)).padStart(2, '0') + ':' + String(segundos % 60).padStart(2, '0');
}

async function gravar(opcoes) {
  ultimaGravacao = Date.now();
  try {
    await api.salvarPomodoro(diaDoEstado, estado, opcoes);
    esconderAviso();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('salvar o pomodoro', erro));
  }
}

/**
 * @description Retoma o estado do servidor: um foco em andamento continua de onde o relógio está,
 *   e uma pausa não cobra o tempo em que o navegador ficou fechado
 */
async function carregar() {
  const salvo = await api.lerPomodoro(diaDoEstado);
  if (!salvo) {
    return;
  }

  estado = sanitizarEstado(salvo);
  if (estado.running && !estado.paused && estado.endsAt) {
    estado.remaining = Math.max(0, estado.endsAt - Date.now());
    if (estado.remaining === 0) {
      estado.running = false;
      estado.endsAt = null;
    }
  } else {
    estado.running = false;
    estado.endsAt = null;
  }
  if (estado.paused) {
    estado.pausedAt = Date.now();
  }
}

function bipar(vezes) {
  if (!estado.sound) {
    return;
  }
  try {
    const contexto = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < vezes; i++) {
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      const inicio = contexto.currentTime + i * 0.26;
      oscilador.type = 'sine';
      oscilador.frequency.setValueAtTime(i === vezes - 1 ? 660 : 520, inicio);
      volume.gain.setValueAtTime(0.0001, inicio);
      volume.gain.exponentialRampToValueAtTime(0.22, inicio + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);
      oscilador.connect(volume);
      volume.connect(contexto.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + 0.24);
    }
    setTimeout(() => contexto.close(), vezes * 300 + 400);
  } catch {
    // áudio bloqueado pelo navegador
  }
}

function pintarMostrador(fase, total) {
  const passado = total - estado.remaining;

  el.cardPomo.dataset.phase = estado.phase;
  el.cardPomo.dataset.paused = String(estado.paused);
  el.phasePill.textContent = estado.paused ? 'Em pausa' : fase.rotulo;
  el.clock.textContent = mmss(estado.remaining);
  el.clockNote.textContent = estado.paused ? 'relógio congelado' : `de ${mmss(total)}`;
  el.anelProgresso.style.strokeDashoffset = COMPRIMENTO_DO_ANEL * (1 - Math.min(1, passado / total));

  if (estado.phase === 'foco') {
    textoComDestaque(el.stageSub, ['Pomodoro ', String(estado.pomodoros + 1), ' · próximo descanso de ',
      proximoDescansoEhLongo() ? '10 min' : '5 min']);
  } else if (estado.phase === 'longo') {
    textoComDestaque(el.stageSub, ['Fim do ciclo · depois deste, a contagem ', 'recomeça']);
  } else {
    const curtosQueFaltam = DESCANSOS_POR_CICLO - (estado.breaks % DESCANSOS_POR_CICLO) - 1;
    textoComDestaque(el.stageSub, ['Faltam ', String(curtosQueFaltam), ' descanso(s) curto(s) até o longo']);
  }
}

function desenharCiclo() {
  const posicao = estado.breaks % DESCANSOS_POR_CICLO;
  const emDescanso = estado.phase !== 'foco';

  el.cycleTrack.replaceChildren(...Array.from({ length: DESCANSOS_POR_CICLO }, (_, indice) => {
    const traco = document.createElement('span');
    if (indice < posicao) {
      traco.className = 'ciclo-feito';
    } else if (indice === posicao && emDescanso) {
      traco.className = 'ciclo-atual';
    } else if (indice === DESCANSOS_POR_CICLO - 1) {
      traco.className = 'ciclo-longo';
    }
    return traco;
  }));
  el.cycleTrack.setAttribute('aria-label', `Descansos do ciclo: ${posicao} de ${DESCANSOS_POR_CICLO} feitos`);
}

/* Pular durante a pausa trocaria a fase com o relógio ainda congelado: na pausa, só se volta pela barra. */
function pintarControles(fase, total) {
  el.btnMain.textContent = (estado.remaining === total ? 'Começar ' : 'Retomar ') + fase.rotulo.toLowerCase();
  el.btnMain.hidden = estado.running || estado.paused;
  el.btnPause.hidden = !estado.running;
  el.btnSkip.hidden = estado.paused;

  el.pauseBar.hidden = !estado.paused;
  if (estado.paused) {
    el.pauseWhy.textContent = 'Em pausa · ' + estado.reason;
    el.pauseElapsed.textContent = mmss(Date.now() - estado.pausedAt);
  }
}

function pintarEstatisticas() {
  el.statPomos.textContent = estado.pomodoros;
  el.statFocus.textContent = Math.floor(estado.focusMs / MINUTO);

  const total = MOTIVOS_PAUSA.reduce((soma, motivo) => soma + estado.pauseMs[motivo], 0);
  const maior = Math.max(...MOTIVOS_PAUSA.map((motivo) => estado.pauseMs[motivo]));

  el.reasonEmpty.hidden = total > 0;
  el.reasonList.innerHTML = total === 0 ? '' : MOTIVOS_PAUSA
    .filter((motivo) => estado.pauseMs[motivo] > 0)
    .map((motivo) => {
      const percentual = (estado.pauseMs[motivo] / maior) * 100;
      return `<div class="motivo-linha"><span>${escapar(motivo)}</span>`
        + `<span class="motivo-medidor"><span data-percentual="${percentual.toFixed(1)}"></span></span>`
        + `<span class="motivo-tempo mono">${mmss(estado.pauseMs[motivo])}</span></div>`;
    }).join('');
  el.reasonList.querySelectorAll('[data-percentual]').forEach((barra) => {
    barra.style.width = `${barra.dataset.percentual}%`;
  });
}

function pintarLateral(fase) {
  const ativo = estado.running || estado.paused;
  el.ladoPomodoro.dataset.phase = estado.paused ? 'pausa' : estado.phase;
  el.ladoPomodoro.dataset.ativo = String(ativo);
  el.ladoPomoFase.textContent = ativo ? (estado.paused ? 'Em pausa' : fase.rotulo) : 'Pomodoro';
  el.ladoPomoTempo.textContent = mmss(estado.remaining);

  if (estado.running) {
    el.ladoPomoBotao.textContent = 'Pausar';
  } else if (estado.paused) {
    el.ladoPomoBotao.textContent = 'Voltar ao trabalho';
  } else {
    el.ladoPomoBotao.textContent = 'Começar ' + fase.rotulo.toLowerCase();
  }

  tituloPomodoro(ativo ? `${mmss(estado.remaining)} · ${el.phasePill.textContent}` : '');
}

function render() {
  const fase = FASE[estado.phase];
  const total = duracaoDaFase();

  pintarMostrador(fase, total);
  desenharCiclo();
  pintarControles(fase, total);
  pintarEstatisticas();
  pintarLateral(fase);
}

function comecarContagem() {
  if (estado.paused) {
    return;
  }
  estado.running = true;
  estado.endsAt = Date.now() + estado.remaining;
  gravar();
  render();
}

function avancar(concluiu) {
  if (estado.phase === 'foco') {
    if (concluiu) {
      estado.pomodoros++;
    }
    estado.phase = proximoDescansoEhLongo() ? 'longo' : 'descanso';
  } else {
    estado.breaks++;
    estado.phase = 'foco';
  }
  estado.remaining = duracaoDaFase();
  estado.endsAt = null;
  estado.running = false;

  if (estado.auto) {
    comecarContagem();
  } else {
    gravar();
    render();
  }
}

function pausar(motivo) {
  if (!estado.running || estado.paused) {
    return;
  }
  estado.remaining = Math.max(0, estado.endsAt - Date.now());
  estado.endsAt = null;
  estado.running = false;
  estado.paused = true;
  estado.reason = motivo;
  estado.pausedAt = Date.now();
  gravar();
  render();
}

function retomar() {
  if (!estado.paused) {
    return;
  }
  estado.paused = false;
  estado.reason = null;
  estado.pausedAt = null;
  comecarContagem();
}

function abrirPopup(aberto) {
  el.pomoPopup.hidden = !aberto;
  el.pomoAbrir.setAttribute('aria-expanded', String(aberto));
  if (!aberto) {
    el.reasonPanel.hidden = true;
  }
}

function fecharPopupPorFora(evento) {
  if (!el.pomoPopup.hidden && !el.pomoPopup.contains(evento.target) && !el.ladoPomodoro.contains(evento.target)) {
    abrirPopup(false);
  }
}

function fecharPopupComEsc(evento) {
  if (evento.key === 'Escape' && !el.pomoPopup.hidden) {
    abrirPopup(false);
    el.pomoAbrir.focus();
  }
}

function painelDeMotivo(aberto) {
  el.reasonPanel.hidden = !aberto;
  if (aberto) {
    abrirPopup(true);
    el.reasonGrid.querySelector('button')?.focus();
    el.reasonPanel.scrollIntoView({ block: 'nearest' });
  }
}

function pedirPausa() {
  if (estado.running && !estado.paused) {
    painelDeMotivo(true);
  }
}

/* Cada dia tem o seu pomodoro: na virada, o dia que acabou é gravado como está e o novo começa zerado. */
function trocarDeDiaSeVirou() {
  if (hoje() === diaDoEstado) {
    return;
  }
  gravar();
  const { sound, auto } = estado;
  diaDoEstado = hoje();
  estado = { ...estadoVazio(), sound, auto };
}

function tique() {
  trocarDeDiaSeVirou();

  const agora = Date.now();
  const delta = Math.max(0, agora - ultimoTique);
  ultimoTique = agora;

  if (estado.paused && estado.reason) {
    estado.pauseMs[estado.reason] += delta;
  } else if (estado.running) {
    // depois de o computador suspender, o delta pode ser de horas: o foco só conta até onde ele acabaria
    if (estado.phase === 'foco') {
      estado.focusMs += Math.min(delta, estado.remaining);
    }
    estado.remaining = Math.max(0, estado.endsAt - agora);
    if (estado.remaining === 0) {
      bipar(estado.phase === 'foco' ? 2 : 1);
      avancar(true);
      return;
    }
  }
  render();

  // grava de tempos em tempos: fechar a aba no meio de um foco ou de uma pausa longa
  // não pode perder o tempo já acumulado
  if ((estado.running || estado.paused) && agora - ultimaGravacao > INTERVALO_GRAVACAO_MS) {
    gravar();
  }
}

function pintarAlternancias() {
  el.btnSound.setAttribute('aria-pressed', String(estado.sound));
  el.soundLabel.textContent = estado.sound ? 'Som' : 'Mudo';
  el.btnAuto.setAttribute('aria-pressed', String(estado.auto));
}

function alternar(campo) {
  estado[campo] = !estado[campo];
  pintarAlternancias();
  gravar();
}

function atalhoDeEspaco(evento) {
  if (evento.code !== 'Space' || !teclaLimpa(evento) || telaAtual() !== 'hoje' || !el.reasonPanel.hidden) {
    return;
  }
  // a página tem campos de horário: espaço dentro deles não pode comandar o timer
  if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(evento.target?.tagName)) {
    return;
  }
  evento.preventDefault();
  if (estado.paused) {
    retomar();
  } else if (estado.running) {
    pedirPausa();
  } else {
    comecarContagem();
  }
}

function acaoDaLateral() {
  if (estado.running) {
    pedirPausa();
  } else if (estado.paused) {
    retomar();
  } else {
    comecarContagem();
  }
}

function ligarEventos() {
  el.btnMain.addEventListener('click', comecarContagem);
  el.btnSkip.addEventListener('click', () => avancar(false));
  el.btnResume.addEventListener('click', retomar);
  el.btnPause.addEventListener('click', pedirPausa);
  el.btnCancelPause.addEventListener('click', () => painelDeMotivo(false));
  el.ladoPomoBotao.addEventListener('click', acaoDaLateral);
  el.pomoAbrir.addEventListener('click', () => abrirPopup(el.pomoPopup.hidden));
  document.addEventListener('pointerdown', fecharPopupPorFora);
  document.addEventListener('keydown', fecharPopupComEsc);

  el.reasonGrid.innerHTML = MOTIVOS_PAUSA
    .map((motivo) => `<button class="motivo" type="button" data-reason="${escapar(motivo)}">${escapar(motivo)}</button>`)
    .join('');
  el.reasonGrid.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.motivo');
    if (botao) {
      painelDeMotivo(false);
      pausar(botao.dataset.reason);
    }
  });

  el.btnReset.addEventListener('click', () => {
    const { sound, auto } = estado;
    estado = { ...estadoVazio(), sound, auto };
    painelDeMotivo(false);
    gravar();
    render();
  });

  el.btnSound.addEventListener('click', () => alternar('sound'));
  el.btnAuto.addEventListener('click', () => alternar('auto'));
  document.addEventListener('keydown', atalhoDeEspaco);
}

/**
 * @description Grava o estado já, sem esperar o próximo intervalo; para o `pagehide`, quando a aba está fechando
 */
export function gravarPomodoroAoSair() {
  if (estado.running || estado.paused) {
    gravar({ keepalive: true });
  }
}

/**
 * @description Carrega o pomodoro do dia e liga o relógio. Se o carregamento falhar, o pomodoro fica
 *   desligado: começar do zero e gravar por cima apagaria o dia salvo no servidor
 */
export async function iniciarPomodoro() {
  try {
    await carregar();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('carregar o pomodoro', erro) + ' Recarregue a página para usá-lo.');
    [el.btnMain, el.btnPause, el.btnSkip, el.ladoPomoBotao].forEach((botao) => {
      botao.disabled = true;
    });
    return;
  }

  ligarEventos();
  pintarAlternancias();
  ultimoTique = Date.now();
  render();
  setInterval(tique, 250);
}
