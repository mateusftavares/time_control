import { avaliar, MARCACOES } from '../public/shared/regras.js';

const CAMPOS_COMPARADOS = ['tipo', ...MARCACOES, 'carga'];

/**
 * @description Banco de horas de uma lista de registros, pelas mesmas regras do app: total e saldo por mês
 * @param {object[]} registros
 * @param {(registro: object) => {saldo: number|null}} [regra] - avaliação de um dia; padrão: avaliar com as jornadas ativas
 * @returns {{dias: number, acumulado: number, porMes: Record<string, number>}}
 */
export function resumoDoBanco(registros, regra = avaliar) {
  const porMes = {};
  let acumulado = 0;

  registros.forEach((registro) => {
    const { saldo } = regra(registro);
    if (saldo === null) {
      return;
    }
    const mes = registro.dia.slice(0, 7);
    porMes[mes] = (porMes[mes] ?? 0) + saldo;
    acumulado += saldo;
  });

  return { dias: registros.length, acumulado, porMes };
}

/**
 * @description Diferenças entre os registros da origem e do destino, dia a dia
 * @param {object[]} origem
 * @param {object[]} destino
 * @returns {{faltando: string[], sobrando: string[], diferentes: string[]}}
 */
export function compararDias(origem, destino) {
  const doDestino = new Map(destino.map((registro) => [registro.dia, registro]));
  const daOrigem = new Set(origem.map((registro) => registro.dia));

  const faltando = [];
  const diferentes = [];
  origem.forEach((registro) => {
    const outro = doDestino.get(registro.dia);
    if (!outro) {
      faltando.push(registro.dia);
    } else if (CAMPOS_COMPARADOS.some((campo) => (registro[campo] ?? null) !== (outro[campo] ?? null))) {
      diferentes.push(registro.dia);
    }
  });
  const sobrando = destino.map((registro) => registro.dia).filter((dia) => !daOrigem.has(dia));

  return { faltando, sobrando, diferentes };
}

/**
 * @description Meses cujo saldo difere entre dois resumos
 * @param {{porMes: Record<string, number>}} a
 * @param {{porMes: Record<string, number>}} b
 * @returns {Array<{mes: string, origem: number, destino: number}>}
 */
export function mesesDivergentes(a, b) {
  const meses = [...new Set([...Object.keys(a.porMes), ...Object.keys(b.porMes)])].sort();
  return meses
    .map((mes) => ({ mes, origem: a.porMes[mes] ?? 0, destino: b.porMes[mes] ?? 0 }))
    .filter(({ origem, destino }) => origem !== destino);
}

/**
 * @description Dias cujo saldo muda entre duas regras (ex.: a antiga fixa e a nova por vigência)
 * @param {object[]} registros
 * @param {(registro: object) => {saldo: number|null}} regraA
 * @param {(registro: object) => {saldo: number|null}} regraB
 * @returns {Array<{dia: string, a: number|null, b: number|null}>}
 */
export function diasComSaldoDiferente(registros, regraA, regraB) {
  return registros
    .map((registro) => ({ dia: registro.dia, a: regraA(registro).saldo, b: regraB(registro).saldo }))
    .filter(({ a, b }) => a !== b);
}
