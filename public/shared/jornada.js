import { paraMin, diaDaSemana, diaValido, hhmm } from './tempo.js';

export const MODOS_TOLERANCIA = ['acumulativo', 'individual'];
export const TOLERANCIA_MAXIMA = 120;
export const HORARIOS_DO_EXPEDIENTE = ['entrada', 'almocoIni', 'almocoFim', 'saida'];

/* Ordem de exibição: a semana do app começa na segunda; o índice da semana segue o Date (0 = domingo). */
export const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];
export const NOMES_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const FORMATO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @description Expediente de um dia sem trabalho
 * @returns {{trabalha: false, entrada: null, almocoIni: null, almocoFim: null, saida: null}}
 */
export function semExpediente() {
  return { trabalha: false, entrada: null, almocoIni: null, almocoFim: null, saida: null };
}

/**
 * @description Semana de segunda a sexta com o mesmo horário, sábado e domingo de folga
 * @returns {object[]} 7 expedientes, índice 0 = domingo
 */
export function semanaComercial(entrada, almocoIni, almocoFim, saida) {
  return Array.from({ length: 7 }, (_, semana) => (semana >= 1 && semana <= 5
    ? { trabalha: true, entrada, almocoIni, almocoFim, saida }
    : semExpediente()));
}

/* Padrão de quem ainda não configurou nada: o modelo atual do app (08:00 por dia, seg–sex, 10/10 acumulativo). */
export const JORNADA_PADRAO = Object.freeze({
  vigenteDesde: null,
  toleranciaAntes: 10,
  toleranciaDepois: 10,
  modo: 'acumulativo',
  semana: Object.freeze(semanaComercial('08:00', '12:00', '13:00', '17:00')),
});

let versoesAtivas = [];

/**
 * @description Define as versões de jornada do usuário logado, usadas quando as funções não recebem versões
 * @param {object[]} versoes
 */
export function definirJornadas(versoes) {
  versoesAtivas = [...versoes].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
}

/**
 * @description Versões de jornada em uso, da mais antiga para a mais nova
 * @returns {object[]}
 */
export function jornadasAtivas() {
  return versoesAtivas;
}

/**
 * @description Versão vigente num dia: a de maior "vigente desde" que não passa do dia; antes da primeira, o padrão
 * @param {string} dia - AAAA-MM-DD
 * @param {object[]} [versoes]
 * @returns {object}
 */
export function jornadaDe(dia, versoes = versoesAtivas) {
  let vigente = null;
  versoes.forEach((versao) => {
    if (versao.vigenteDesde <= dia && (!vigente || versao.vigenteDesde > vigente.vigenteDesde)) {
      vigente = versao;
    }
  });
  return vigente ?? JORNADA_PADRAO;
}

/**
 * @description Horário oficial do dia da semana de uma data, pela versão vigente
 * @param {string} dia
 * @param {object[]} [versoes]
 * @returns {object}
 */
export function expedienteDe(dia, versoes = versoesAtivas) {
  return jornadaDe(dia, versoes).semana[diaDaSemana(dia)];
}

/**
 * @description Minutos de trabalho de um expediente: da entrada à saída, menos o almoço oficial; 0 sem expediente
 * @param {object} expediente
 * @returns {number}
 */
export function cargaDoExpediente(expediente) {
  if (!expediente?.trabalha) {
    return 0;
  }
  const almoco = expediente.almocoIni && expediente.almocoFim
    ? paraMin(expediente.almocoFim) - paraMin(expediente.almocoIni)
    : 0;
  return paraMin(expediente.saida) - paraMin(expediente.entrada) - almoco;
}

/**
 * @description Jornada em minutos de um dia, pela versão vigente; 0 em dia sem expediente
 * @param {string} dia
 * @param {object[]} [versoes]
 * @returns {number}
 */
export function cargaPadraoDe(dia, versoes = versoesAtivas) {
  return cargaDoExpediente(expedienteDe(dia, versoes));
}

/**
 * @description Dia com expediente na versão vigente (sem registro, conta como "sem marcação")
 * @param {string} dia
 * @param {object[]} [versoes]
 * @returns {boolean}
 */
export function ehUtil(dia, versoes = versoesAtivas) {
  return expedienteDe(dia, versoes).trabalha === true;
}

/**
 * @description Primeiro mês coberto pelas versões (AAAA-MM), ou null sem versões
 * @param {object[]} [versoes]
 * @returns {string|null}
 */
export function inicioDoHistorico(versoes = versoesAtivas) {
  const datas = versoes.map((versao) => versao.vigenteDesde).sort();
  return datas.length ? datas[0].slice(0, 7) : null;
}

/**
 * @description Tolerância em texto curto, para as legendas
 * @param {object} jornada
 * @returns {string}
 */
export function textoTolerancia(jornada) {
  const { toleranciaAntes: antes, toleranciaDepois: depois } = jornada;
  const minutos = antes === depois ? `${antes} min` : `${antes}/${depois} min`;
  return jornada.modo === 'individual' ? `tolerância de ${minutos} por marcação` : `tolerância de ${minutos} por dia`;
}

/**
 * @description Resumo de uma versão, ex.: "seg–sex 08:00–17:00 · 08:00/dia · tolerância de 10 min por dia"
 * @param {object} jornada
 * @returns {string}
 */
export function resumoDaJornada(jornada) {
  const trabalhados = ORDEM_DA_SEMANA.filter((semana) => jornada.semana[semana].trabalha);
  const cargas = [...new Set(trabalhados.map((semana) => cargaDoExpediente(jornada.semana[semana])))];
  const dias = trabalhados.length === 0
    ? 'sem expediente'
    : `${trabalhados.length} dia(s) por semana`;
  const carga = cargas.length === 1 ? ` · ${hhmm(cargas[0])}/dia` : '';
  return `${dias}${carga} · ${textoTolerancia(jornada)}`;
}

function horarioOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  return typeof valor === 'string' && FORMATO_HORARIO.test(valor) ? valor : undefined;
}

function normalizarExpediente(entrada, nome, erros) {
  const origem = entrada && typeof entrada === 'object' ? entrada : {};
  if (origem.trabalha !== true) {
    return semExpediente();
  }

  const expediente = { trabalha: true };
  HORARIOS_DO_EXPEDIENTE.forEach((campo) => {
    expediente[campo] = horarioOuNulo(origem[campo]);
    if (expediente[campo] === undefined) {
      erros.push(`${nome}: horário inválido`);
      expediente[campo] = null;
    }
  });

  const [entradaMin, iniMin, fimMin, saidaMin] = HORARIOS_DO_EXPEDIENTE.map((campo) => paraMin(expediente[campo]));
  if (entradaMin === null || saidaMin === null) {
    erros.push(`${nome}: informe a entrada e a saída`);
  } else if (saidaMin <= entradaMin) {
    erros.push(`${nome}: a saída precisa ser depois da entrada`);
  }
  if ((iniMin === null) !== (fimMin === null)) {
    erros.push(`${nome}: informe o início e o fim do almoço, ou nenhum dos dois`);
  } else if (iniMin !== null && entradaMin !== null && saidaMin !== null
    && !(entradaMin <= iniMin && iniMin < fimMin && fimMin <= saidaMin)) {
    erros.push(`${nome}: o almoço precisa estar dentro do expediente`);
  }
  return expediente;
}

function toleranciaValida(valor) {
  return Number.isInteger(valor) && valor >= 0 && valor <= TOLERANCIA_MAXIMA;
}

/**
 * @description Valida e normaliza uma versão de jornada vinda da tela ou do banco
 * @param {unknown} entrada
 * @returns {{ok: true, jornada: object} | {ok: false, erros: string[]}}
 */
export function normalizarJornada(entrada) {
  const origem = entrada && typeof entrada === 'object' ? entrada : {};
  const erros = [];

  if (!diaValido(origem.vigenteDesde)) {
    erros.push('"válida a partir de" deve ser uma data válida');
  }
  ['toleranciaAntes', 'toleranciaDepois'].forEach((campo) => {
    if (!toleranciaValida(origem[campo])) {
      erros.push(`tolerância deve ser um número inteiro de 0 a ${TOLERANCIA_MAXIMA} minutos`);
    }
  });
  if (!MODOS_TOLERANCIA.includes(origem.modo)) {
    erros.push(`modo deve ser um de: ${MODOS_TOLERANCIA.join(', ')}`);
  }
  if (!Array.isArray(origem.semana) || origem.semana.length !== 7) {
    erros.push('a semana precisa ter os 7 dias');
  }

  const semana = Array.from({ length: 7 }, (_, indice) => normalizarExpediente(
    Array.isArray(origem.semana) ? origem.semana[indice] : null, NOMES_DA_SEMANA[indice], erros));

  const jornada = {
    vigenteDesde: origem.vigenteDesde,
    toleranciaAntes: origem.toleranciaAntes,
    toleranciaDepois: origem.toleranciaDepois,
    modo: origem.modo,
    semana,
  };
  return erros.length ? { ok: false, erros: [...new Set(erros)] } : { ok: true, jornada };
}
