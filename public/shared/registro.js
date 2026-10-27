import { TIPOS, MARCACOES, NOMES_DAS_MARCACOES } from './regras.js';

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATO_DURACAO = /^\d{2}:[0-5]\d$/;

/**
 * @description Data AAAA-MM-DD que existe no calendário
 * @param {unknown} dia
 * @returns {boolean}
 */
export function diaValido(dia) {
  const partes = typeof dia === 'string' && dia.match(FORMATO_DIA);
  if (!partes) {
    return false;
  }

  const [ano, mes, d] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(ano, mes - 1, d);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === d;
}

/**
 * @description Texto no formato esperado, ou null quando vazio; undefined quando é de outro tipo ou formato
 * @param {unknown} valor
 * @param {RegExp} formato
 * @returns {string|null|undefined}
 */
function textoNoFormato(valor, formato) {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  return typeof valor === 'string' && formato.test(valor) ? valor : undefined;
}

/**
 * @description Valida e normaliza um registro de dia vindo de fora (API, importação, migração)
 * @param {unknown} entrada
 * @returns {{ok: true, registro: object} | {ok: false, erros: string[]}}
 */
export function normalizarRegistro(entrada) {
  const erros = [];
  const origem = entrada && typeof entrada === 'object' ? entrada : {};

  if (!diaValido(origem.dia)) {
    erros.push('dia deve ser uma data AAAA-MM-DD válida');
  }

  const tipo = origem.tipo ?? 'normal';
  if (!TIPOS.includes(tipo)) {
    erros.push(`tipo deve ser um de: ${TIPOS.join(', ')}`);
  }

  const registro = { dia: origem.dia, tipo };

  MARCACOES.forEach((campo) => {
    const valor = textoNoFormato(origem[campo], FORMATO_HORARIO);
    if (valor === undefined) {
      erros.push(`${NOMES_DAS_MARCACOES[campo]} deve ser um horário HH:MM`);
    }
    registro[campo] = tipo === 'normal' ? valor ?? null : null;
  });

  const carga = textoNoFormato(origem.carga, FORMATO_DURACAO);
  if (carga === undefined) {
    erros.push('jornada deve ser uma duração HH:MM');
  }
  registro.carga = carga ?? null;

  return erros.length ? { ok: false, erros } : { ok: true, registro };
}
