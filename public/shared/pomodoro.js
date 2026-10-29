const MINUTO = 60 * 1000;

export const DURACAO = {
  foco: 25 * MINUTO,
  descanso: 5 * MINUTO,
  longo: 10 * MINUTO,
};

/* A cada 5 descansos, o quinto é o longo. */
export const DESCANSOS_POR_CICLO = 5;

export const MOTIVOS_PAUSA = ['Treinamento', 'Reunião', 'Almoço', 'Outro'];
export const FASES = Object.keys(DURACAO);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @description Estado de um dia sem nenhum pomodoro
 * @returns {object}
 */
export function estadoVazio() {
  return {
    phase: 'foco',
    running: false,
    paused: false,
    reason: null,
    remaining: DURACAO.foco,
    endsAt: null,
    pausedAt: null,
    breaks: 0,
    pomodoros: 0,
    focusMs: 0,
    pauseMs: Object.fromEntries(MOTIVOS_PAUSA.map((motivo) => [motivo, 0])),
    sound: true,
    auto: true,
    tarefa: null,
  };
}

const numero = (valor, padrao = 0) => (Number.isFinite(valor) && valor >= 0 ? valor : padrao);
const numeroOuNulo = (valor) => (Number.isFinite(valor) && valor >= 0 ? valor : null);

/**
 * @description Guarda só os campos conhecidos do estado, com o tipo certo; o que faltar vem do estado vazio
 * @param {unknown} entrada
 * @returns {object}
 */
export function sanitizarEstado(entrada) {
  const origem = entrada && typeof entrada === 'object' ? entrada : {};
  const pausas = origem.pauseMs && typeof origem.pauseMs === 'object' ? origem.pauseMs : {};
  const vazio = estadoVazio();

  return {
    phase: FASES.includes(origem.phase) ? origem.phase : vazio.phase,
    running: origem.running === true,
    paused: origem.paused === true,
    reason: MOTIVOS_PAUSA.includes(origem.reason) ? origem.reason : null,
    remaining: numero(origem.remaining, vazio.remaining),
    endsAt: numeroOuNulo(origem.endsAt),
    pausedAt: numeroOuNulo(origem.pausedAt),
    breaks: numero(origem.breaks),
    pomodoros: numero(origem.pomodoros),
    focusMs: numero(origem.focusMs),
    pauseMs: Object.fromEntries(MOTIVOS_PAUSA.map((motivo) => [motivo, numero(pausas[motivo])])),
    sound: origem.sound !== false,
    auto: origem.auto !== false,
    tarefa: typeof origem.tarefa === 'string' && UUID.test(origem.tarefa) ? origem.tarefa : null,
  };
}
