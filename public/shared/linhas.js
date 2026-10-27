/* Ponte entre o registro do app (camelCase) e a linha das tabelas (snake_case), usada
   pelo navegador e pelo script de migração. */
export const COLUNAS_DIAS = 'dia, tipo, chegada, almoco_ini, almoco_fim, saida, carga, atualizado_em';

/**
 * @description Linha da tabela `dias` para o registro do app
 * @param {object} linha
 * @returns {object}
 */
export function paraRegistro(linha) {
  return {
    dia: linha.dia,
    tipo: linha.tipo,
    chegada: linha.chegada,
    almocoIni: linha.almoco_ini,
    almocoFim: linha.almoco_fim,
    saida: linha.saida,
    carga: linha.carga,
    atualizadoEm: linha.atualizado_em ?? null,
  };
}

/**
 * @description Registro do app (já normalizado) para a linha da tabela `dias` de um usuário
 * @param {object} registro
 * @param {string} userId
 * @returns {object}
 */
export function paraLinha(registro, userId) {
  return {
    user_id: userId,
    dia: registro.dia,
    tipo: registro.tipo,
    chegada: registro.chegada,
    almoco_ini: registro.almocoIni,
    almoco_fim: registro.almocoFim,
    saida: registro.saida,
    carga: registro.carga,
  };
}

/**
 * @description Um registro por dia, o último vence: o upsert do Postgres recusa o mesmo dia duas vezes no lote
 * @param {object[]} registros
 * @returns {object[]}
 */
export function umPorDia(registros) {
  return [...new Map(registros.map((registro) => [registro.dia, registro])).values()];
}

export const COLUNAS_JORNADAS = 'vigente_desde, tolerancia_antes, tolerancia_depois, modo, semana';

/**
 * @description Linha da tabela `jornadas` para a versão de jornada do app
 * @param {object} linha
 * @returns {object}
 */
export function paraJornada(linha) {
  return {
    vigenteDesde: linha.vigente_desde,
    toleranciaAntes: linha.tolerancia_antes,
    toleranciaDepois: linha.tolerancia_depois,
    modo: linha.modo,
    semana: linha.semana,
  };
}

/**
 * @description Versão de jornada (já normalizada) para a linha da tabela `jornadas` de um usuário
 * @param {object} jornada
 * @param {string} userId
 * @returns {object}
 */
export function linhaDeJornada(jornada, userId) {
  return {
    user_id: userId,
    vigente_desde: jornada.vigenteDesde,
    tolerancia_antes: jornada.toleranciaAntes,
    tolerancia_depois: jornada.toleranciaDepois,
    modo: jornada.modo,
    semana: jornada.semana,
  };
}
