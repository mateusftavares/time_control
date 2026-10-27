import { avaliar, MARCACOES } from '../public/shared/regras.js';

const CAMPOS_COMPARADOS = ['tipo', ...MARCACOES, 'carga'];

/**
 * @description Banco de horas de uma lista de registros, pelas mesmas regras do app: total e saldo por mês
 * @param {object[]} registros
 * @returns {{dias: number, acumulado: number, porMes: Record<string, number>}}
 */
export function resumoDoBanco(registros) {
  const porMes = {};
  let acumulado = 0;

  registros.forEach((registro) => {
    const { saldo } = avaliar(registro);
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
