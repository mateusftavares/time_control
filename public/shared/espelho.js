import { paraMin, hhmm } from './tempo.js';
import { avaliar, cargaPadraoDe } from './regras.js';

const FORMATO_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const FORMATO_DURACAO = /^([+-]?)(\d{1,2})h(\d{2})min$/i;

/**
 * @description Lê o espelho do TiqueTaque colado como texto: uma linha por item (data, dia da semana,
 *   batidas ou rótulo) e às vezes "Banco de horas:" seguido da duração oficial do saldo
 * @param {string} texto
 * @returns {Array<{dia: string, batidas: string[], rotulo: string|null, oficial: number|null}>}
 */
export function lerEspelho(texto) {
  const linhas = String(texto).replace(/\t/g, '\n').split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const dias = [];
  let atual = null;
  let esperandoSaldo = false;

  linhas.forEach((linha) => {
    const data = linha.match(FORMATO_DATA);
    if (data) {
      atual = { dia: `${data[3]}-${data[2]}-${data[1]}`, batidas: [], rotulo: null, oficial: null };
      esperandoSaldo = false;
      dias.push(atual);
      return;
    }
    if (!atual) {
      return;
    }

    if (/FERIADO/i.test(linha)) {
      atual.rotulo = 'feriado';
      return;
    }
    if (/^DSR$/i.test(linha) || /DIA\s+COMP/i.test(linha)) {
      atual.rotulo = 'naoUtil';
      return;
    }
    if (/^Banco de horas/i.test(linha)) {
      esperandoSaldo = true;
      return;
    }
    if (/Descanso Semanal/i.test(linha)) {
      esperandoSaldo = false;
      return;
    }

    const duracao = linha.match(FORMATO_DURACAO);
    if (duracao) {
      // só a duração logo após "Banco de horas:" é saldo — a do DSR não é
      if (esperandoSaldo) {
        const minutos = Number(duracao[2]) * 60 + Number(duracao[3]);
        atual.oficial = duracao[1] === '-' ? -minutos : minutos;
        esperandoSaldo = false;
      }
      return;
    }

    const horas = linha.match(/\d{2}:\d{2}/g);
    if (horas) {
      atual.batidas.push(...horas);
    }
  });

  return dias;
}

/**
 * @description Registro de dia a partir de um dia lido do espelho; quatro batidas é o padrão e,
 *   havendo mais, o maior intervalo do meio é o almoço. Null para fim de semana ou dia sem batidas
 * @param {{dia: string, batidas: string[], rotulo: string|null}} lido
 * @returns {object|null}
 */
export function registroDe(lido) {
  if (lido.rotulo === 'naoUtil') {
    return null;
  }

  const base = { dia: lido.dia, carga: hhmm(cargaPadraoDe(lido.dia)) };

  if (lido.rotulo === 'feriado') {
    return { ...base, tipo: 'feriado', chegada: null, almocoIni: null, almocoFim: null, saida: null };
  }

  const batidas = lido.batidas;
  if (batidas.length < 2) {
    return null;
  }

  let almocoIni = null;
  let almocoFim = null;
  let maiorIntervalo = -1;

  for (let i = 1; i + 1 <= batidas.length - 2; i += 2) {
    const intervalo = paraMin(batidas[i + 1]) - paraMin(batidas[i]);
    if (intervalo > maiorIntervalo) {
      maiorIntervalo = intervalo;
      almocoIni = batidas[i];
      almocoFim = batidas[i + 1];
    }
  }

  return {
    ...base,
    tipo: 'normal',
    chegada: batidas[0],
    almocoIni,
    almocoFim,
    saida: batidas[batidas.length - 1],
  };
}

/**
 * @description Confere o saldo calculado contra o oficial do TiqueTaque, que só imprime a linha de banco
 *   quando estoura a tolerância: ausência dela significa saldo zero
 * @param {{oficial: number|null}} lido
 * @param {object|null} registro
 * @returns {{ok: boolean, oficial: number|null, motivo: string}}
 */
export function conferir(lido, registro) {
  if (!registro || registro.tipo !== 'normal') {
    return { ok: true, oficial: null, motivo: '' };
  }

  const { saldo } = avaliar(registro);
  if (saldo === null) {
    return { ok: false, oficial: null, motivo: 'incompleto' };
  }

  const oficial = lido.oficial === null ? 0 : lido.oficial;
  return saldo === oficial
    ? { ok: true, oficial, motivo: '' }
    : { ok: false, oficial, motivo: 'diverge do oficial' };
}
