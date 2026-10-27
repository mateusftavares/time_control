/**
 * @description Data local no formato AAAA-MM-DD
 * @param {Date} data
 * @returns {string}
 */
export function iso(data) {
  return data.getFullYear() + '-'
    + String(data.getMonth() + 1).padStart(2, '0') + '-'
    + String(data.getDate()).padStart(2, '0');
}

/**
 * @description Hoje, no fuso local, como AAAA-MM-DD
 * @returns {string}
 */
export function hoje() {
  return iso(new Date());
}

/**
 * @description "HH:MM" para minutos desde a meia-noite; null quando vazio ou inválido
 * @param {string|null|undefined} texto
 * @returns {number|null}
 */
export function paraMin(texto) {
  if (!texto) {
    return null;
  }

  const partes = String(texto).split(':');
  if (partes.length < 2) {
    return null;
  }

  const horas = parseInt(partes[0], 10);
  const minutos = parseInt(partes[1], 10);
  return Number.isNaN(horas) || Number.isNaN(minutos) ? null : horas * 60 + minutos;
}

/**
 * @description Minutos para "HH:MM", com "-" quando negativo
 * @param {number} minutos
 * @returns {string}
 */
export function hhmm(minutos) {
  const total = Math.abs(Math.round(minutos));
  const sinal = minutos < 0 ? '-' : '';
  return sinal + String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/**
 * @description Minutos para "HH:MM" com "+" explícito quando positivo
 * @param {number} minutos
 * @returns {string}
 */
export function comSinal(minutos) {
  return (minutos > 0 ? '+' : '') + hhmm(minutos);
}

/**
 * @description Saldo para exibir: "00:00" quando zerado, "—" quando o dia ainda não conta
 * @param {number|null} saldo - em minutos
 * @returns {string}
 */
export function textoSaldo(saldo) {
  if (saldo === null) {
    return '—';
  }
  return saldo === 0 ? '00:00' : comSinal(saldo);
}

export const MINUTOS_POR_DIA = 1440;

/**
 * @description Minutos desde a meia-noite, agora
 * @returns {number}
 */
export function agoraMin() {
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes();
}

/**
 * @description Dia da semana (0 = domingo) de uma data AAAA-MM-DD, sem cair no fuso UTC
 * @param {string} dia
 * @returns {number}
 */
export function diaDaSemana(dia) {
  const [ano, mes, d] = String(dia).split('-').map(Number);
  return new Date(ano, mes - 1, d).getDay();
}

/**
 * @description Soma meses a um AAAA-MM
 * @param {string} anoMes
 * @param {number} passos
 * @returns {string}
 */
export function somaMes(anoMes, passos) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const data = new Date(ano, mes - 1 + passos, 1);
  return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0');
}

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * @description "DD/MM ddd" de uma data AAAA-MM-DD, ex.: "14/10 qua"
 * @param {string} dia
 * @returns {string}
 */
export function rotuloDia(dia) {
  const [, mes, d] = String(dia).split('-');
  return `${d}/${mes} ${DIAS_SEMANA[diaDaSemana(dia)]}`;
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
