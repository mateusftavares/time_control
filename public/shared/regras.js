import { paraMin, diaDaSemana } from './tempo.js';

export const CARGA_PADRAO = 480;
export const ALMOCO_MINIMO = 60;

/* A tolerância zera o saldo do dia, mas não abate: 11 min de atraso valem 11. */
export const TOLERANCIA = 10;

/* A jornada mudou: até fevereiro/26 eram 08:48 por dia, de março em diante 08:00. */
export const JORNADAS = [{ antesDe: '2026-03-01', minutos: 528 }];

/* Fevereiro/26 é o primeiro mês na empresa: o histórico não vai além disso. */
export const INICIO_HISTORICO = '2026-02';

export const TIPOS = ['normal', 'feriado', 'folga', 'compensacao'];
export const MARCACOES = ['chegada', 'almocoIni', 'almocoFim', 'saida'];
export const NOMES_DAS_MARCACOES = { chegada: 'chegada', almocoIni: 'saída p/ almoço', almocoFim: 'volta do almoço', saida: 'saída' };

/**
 * @description Jornada em minutos vigente num dia
 * @param {string} dia - AAAA-MM-DD
 * @returns {number}
 */
export function cargaPadraoDe(dia) {
  const vigente = JORNADAS.find((jornada) => String(dia) < jornada.antesDe);
  return vigente ? vigente.minutos : CARGA_PADRAO;
}

/**
 * @description Segunda a sexta
 * @param {string} dia - AAAA-MM-DD
 * @returns {boolean}
 */
export function ehUtil(dia) {
  const semana = diaDaSemana(dia);
  return semana >= 1 && semana <= 5;
}

/**
 * @description Almoço descontado de um dia fechado: o marcado, com piso de 1h
 * @param {object} registro
 * @returns {number}
 */
export function almocoDescontado(registro) {
  const inicio = paraMin(registro.almocoIni);
  const fim = paraMin(registro.almocoFim);
  const marcado = inicio !== null && fim !== null ? Math.max(0, fim - inicio) : 0;
  return Math.max(ALMOCO_MINIMO, marcado);
}

/**
 * @description Minutos trabalhados num dia com chegada e saída; null se faltar uma delas
 * @param {object} registro
 * @returns {number|null}
 */
export function trabalhado(registro) {
  const chegada = paraMin(registro.chegada);
  const saida = paraMin(registro.saida);
  if (chegada === null || saida === null) {
    return null;
  }
  return Math.max(0, saida - chegada - almocoDescontado(registro));
}

/**
 * @description Carga do registro, ou a jornada vigente no dia quando não informada
 * @param {object} registro
 * @returns {number}
 */
export function carga(registro) {
  const informada = paraMin(registro && registro.carga);
  return informada === null ? cargaPadraoDe(registro && registro.dia) : informada;
}

/**
 * @description Situação de um dia no banco de horas; saldo null quando o dia ainda não conta
 * @param {object|undefined} registro
 * @returns {{estado: string, trabalhado: number|null, saldo: number|null}}
 */
export function avaliar(registro) {
  if (!registro) {
    return { estado: 'pendente', trabalhado: null, saldo: null };
  }
  if (registro.tipo === 'feriado' || registro.tipo === 'folga') {
    return { estado: registro.tipo, trabalhado: null, saldo: 0 };
  }
  if (registro.tipo === 'compensacao') {
    return { estado: 'compensacao', trabalhado: null, saldo: -carga(registro) };
  }

  const minutos = trabalhado(registro);
  if (minutos === null) {
    const temMarcacao = MARCACOES.some((campo) => registro[campo]);
    return { estado: temMarcacao ? 'aberto' : 'pendente', trabalhado: null, saldo: null };
  }

  const bruto = minutos - carga(registro);
  return { estado: 'normal', trabalhado: minutos, saldo: Math.abs(bruto) <= TOLERANCIA ? 0 : bruto };
}

/**
 * @description Dia em andamento: o almoço tem piso de 1h, então a previsão empurra o que ainda falta cumprir dele
 * @param {{chegada: number, almocoIni: number|null, almocoFim: number|null, saida: number|null, carga: number|null}} marcacoes - em minutos
 * @param {number} agora - minutos desde a meia-noite
 */
export function calcularDiaEmAndamento(marcacoes, agora) {
  const fimDoDia = marcacoes.saida !== null ? marcacoes.saida : agora;
  let almocoTirado = 0;

  if (marcacoes.almocoIni !== null) {
    const voltou = marcacoes.almocoFim !== null ? marcacoes.almocoFim : fimDoDia;
    almocoTirado = Math.max(0, Math.min(voltou, fimDoDia) - marcacoes.almocoIni);
  }

  const emAlmoco = marcacoes.almocoIni !== null && marcacoes.almocoFim === null && marcacoes.saida === null;
  const minutosTrabalhados = Math.max(0, Math.max(0, fimDoDia - marcacoes.chegada) - almocoTirado);
  const almocoDevendo = Math.max(0, ALMOCO_MINIMO - almocoTirado);
  const cargaDoDia = marcacoes.carga === null ? 0 : marcacoes.carga;

  return {
    almocoTirado,
    almocoDevendo,
    emAlmoco,
    trabalhado: minutosTrabalhados,
    carga: cargaDoDia,
    restante: cargaDoDia - minutosTrabalhados,
    previsao: agora + Math.max(0, cargaDoDia - minutosTrabalhados) + almocoDevendo,
  };
}

/**
 * @description Marcações fora de ordem ou no futuro; cada campo traz o motivo, ou '' quando ok
 * @param {object} marcacoes - em minutos
 * @param {number} agora - minutos desde a meia-noite
 * @returns {{chegada: string, almocoIni: string, almocoFim: string, saida: string}}
 */
export function validarMarcacoes(marcacoes, agora) {
  const erros = { chegada: '', almocoIni: '', almocoFim: '', saida: '' };

  MARCACOES.forEach((campo) => {
    if (marcacoes[campo] !== null && marcacoes[campo] > agora) {
      erros[campo] = 'está no futuro';
    }
  });

  if (!erros.almocoIni && marcacoes.almocoIni !== null) {
    if (marcacoes.chegada === null) {
      erros.almocoIni = 'informe a chegada antes';
    } else if (marcacoes.almocoIni < marcacoes.chegada) {
      erros.almocoIni = 'antes da chegada';
    }
  }

  if (!erros.almocoFim && marcacoes.almocoFim !== null) {
    if (marcacoes.almocoIni === null) {
      erros.almocoFim = 'informe a saída para o almoço';
    } else if (marcacoes.almocoFim < marcacoes.almocoIni) {
      erros.almocoFim = 'antes da saída';
    }
  }

  if (!erros.saida && marcacoes.saida !== null) {
    if (marcacoes.chegada === null) {
      erros.saida = 'informe a chegada antes';
    } else if (marcacoes.saida < marcacoes.chegada) {
      erros.saida = 'antes da chegada';
    } else if (marcacoes.almocoFim !== null && marcacoes.saida < marcacoes.almocoFim) {
      erros.saida = 'antes da volta do almoço';
    }
  }

  return erros;
}
