import { paraMin } from './tempo.js';
import { jornadaDe, expedienteDe, cargaPadraoDe } from './jornada.js';

export { cargaPadraoDe, ehUtil } from './jornada.js';

export const ALMOCO_MINIMO = 60;

export const TIPOS = ['normal', 'feriado', 'folga', 'compensacao'];
export const MARCACOES = ['chegada', 'almocoIni', 'almocoFim', 'saida'];
export const NOMES_DAS_MARCACOES = { chegada: 'chegada', almocoIni: 'saída p/ almoço', almocoFim: 'volta do almoço', saida: 'saída' };

/* Marcação do registro ↔ horário oficial do expediente. */
const HORARIO_OFICIAL = { chegada: 'entrada', almocoIni: 'almocoIni', almocoFim: 'almocoFim', saida: 'saida' };

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
 * @param {object[]} [versoes] - versões de jornada; sem elas, as do usuário logado
 * @returns {number}
 */
export function carga(registro, versoes) {
  const informada = paraMin(registro && registro.carga);
  return informada === null ? cargaPadraoDe(registro && registro.dia, versoes) : informada;
}

/**
 * @description Diferença (em minutos, negativa = antes) que a tolerância absorve; passou do limite, conta inteira
 * @param {number} diferenca
 * @param {number} antes - minutos tolerados para menos/antes
 * @param {number} depois - minutos tolerados para mais/depois
 * @returns {boolean}
 */
export function dentroDaTolerancia(diferenca, antes, depois) {
  return diferenca < 0 ? -diferenca <= antes : diferenca <= depois;
}

/**
 * @description Modo individual: cada marcação a até `antes` min antes ou `depois` min depois do horário
 *   oficial vale como o horário oficial; fora disso, vale a marcação
 * @param {object} registro
 * @param {object} expediente - horário oficial do dia
 * @param {number} antes
 * @param {number} depois
 * @returns {object} cópia do registro com as marcações ajustadas
 */
export function ajustarMarcacoes(registro, expediente, antes, depois) {
  const ajustado = { ...registro };
  if (!expediente?.trabalha) {
    return ajustado;
  }
  MARCACOES.forEach((campo) => {
    const marcado = paraMin(registro[campo]);
    const oficial = paraMin(expediente[HORARIO_OFICIAL[campo]]);
    if (marcado !== null && oficial !== null && dentroDaTolerancia(marcado - oficial, antes, depois)) {
      ajustado[campo] = expediente[HORARIO_OFICIAL[campo]];
    }
  });
  return ajustado;
}

function saldoComTolerancia(registro, minutos, cargaDoDia, versoes) {
  const jornada = jornadaDe(registro.dia, versoes);
  const { toleranciaAntes: antes, toleranciaDepois: depois } = jornada;

  if (jornada.modo === 'individual') {
    const ajustado = ajustarMarcacoes(registro, expedienteDe(registro.dia, versoes), antes, depois);
    return trabalhado(ajustado) - cargaDoDia;
  }

  const bruto = minutos - cargaDoDia;
  return dentroDaTolerancia(bruto, antes, depois) ? 0 : bruto;
}

/**
 * @description Situação de um dia no banco de horas; saldo null quando o dia ainda não conta.
 *   Acumulativo: a tolerância vale sobre o saldo do dia. Individual: vale em cada marcação
 * @param {object|undefined} registro
 * @param {object[]} [versoes] - versões de jornada; sem elas, as do usuário logado
 * @returns {{estado: string, trabalhado: number|null, saldo: number|null}}
 */
export function avaliar(registro, versoes) {
  if (!registro) {
    return { estado: 'pendente', trabalhado: null, saldo: null };
  }
  if (registro.tipo === 'feriado' || registro.tipo === 'folga') {
    return { estado: registro.tipo, trabalhado: null, saldo: 0 };
  }
  if (registro.tipo === 'compensacao') {
    return { estado: 'compensacao', trabalhado: null, saldo: -carga(registro, versoes) };
  }

  const minutos = trabalhado(registro);
  if (minutos === null) {
    const temMarcacao = MARCACOES.some((campo) => registro[campo]);
    return { estado: temMarcacao ? 'aberto' : 'pendente', trabalhado: null, saldo: null };
  }

  return { estado: 'normal', trabalhado: minutos, saldo: saldoComTolerancia(registro, minutos, carga(registro, versoes), versoes) };
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
