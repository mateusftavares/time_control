import { somaMes } from './tempo.js';
import { avaliar, ehUtil } from './regras.js';
import { inicioDoHistorico } from './jornada.js';

export const ROTULO_DO_ESTADO = {
  pendente: 'Sem marcação', aberto: 'Em aberto', normal: 'Trabalhado',
  feriado: 'Feriado', folga: 'Folga', compensacao: 'Compensação',
};
export const ESTADOS_ABONADOS = ['feriado', 'folga', 'compensacao'];

/* Banco de horas de uma pessoa a partir dos registros e das versões de jornada dela: a tela Banco usa os
   do usuário logado (versões omitidas = as dele) e a visão da equipe usa os de cada membro. */

/**
 * @description Dias do mês que entram no histórico até hoje: os úteis (sem registro contam como "sem marcação")
 *   e os de fim de semana que tiverem registro
 * @param {string} anoMes - AAAA-MM
 * @param {Map<string, object>} registros - por dia
 * @param {string} hojeIso
 * @param {object[]} [versoes]
 * @returns {string[]}
 */
export function diasDoMes(anoMes, registros, hojeIso, versoes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const dias = [];
  for (let d = 1; d <= ultimo; d++) {
    const dia = `${anoMes}-${String(d).padStart(2, '0')}`;
    if (dia > hojeIso) {
      break;
    }
    if (ehUtil(dia, versoes) || registros.has(dia)) {
      dias.push(dia);
    }
  }
  return dias;
}

/**
 * @description Meses do histórico, do atual para o mais antigo (o início da jornada ou o registro mais velho)
 * @param {Map<string, object>} registros
 * @param {string} hojeIso
 * @param {object[]} [versoes]
 * @returns {string[]}
 */
export function mesesDoHistorico(registros, hojeIso, versoes) {
  const atual = hojeIso.slice(0, 7);
  const inicio = inicioDoHistorico(versoes);
  let maisAntigo = inicio && inicio < atual ? inicio : atual;
  registros.forEach((registro) => {
    const anoMes = registro.dia.slice(0, 7);
    if (anoMes < maisAntigo) {
      maisAntigo = anoMes;
    }
  });
  const meses = [];
  for (let cursor = atual; cursor >= maisAntigo; cursor = somaMes(cursor, -1)) {
    meses.push(cursor);
  }
  return meses;
}

/**
 * @description Saldo, trabalhado, dias fechados e sem marcação de uma lista de dias
 * @param {string[]} dias
 * @param {Map<string, object>} registros
 * @param {object[]} [versoes]
 * @returns {{saldo: number, trabalhado: number, fechados: number, pendentes: number}}
 */
export function totaisDosDias(dias, registros, versoes) {
  const totais = { saldo: 0, trabalhado: 0, fechados: 0, pendentes: 0 };
  dias.forEach((dia) => {
    const avaliacao = avaliar(registros.get(dia) ?? null, versoes);
    if (avaliacao.estado === 'pendente') {
      totais.pendentes++;
      return;
    }
    if (avaliacao.saldo === null) {
      return;
    }
    totais.saldo += avaliacao.saldo;
    totais.fechados++;
    totais.trabalhado += avaliacao.trabalhado ?? 0;
  });
  return totais;
}

/**
 * @description Resumo do banco de horas: meses com os dias e os totais de cada um, banco acumulado e dias sem marcação
 * @param {Map<string, object>} registros
 * @param {string} hojeIso
 * @param {object[]} [versoes]
 * @returns {{meses: Array<{anoMes: string, dias: string[], totais: object}>, banco: number, pendentes: number}}
 */
export function resumoDoBanco(registros, hojeIso, versoes) {
  const meses = mesesDoHistorico(registros, hojeIso, versoes).map((anoMes) => {
    const dias = diasDoMes(anoMes, registros, hojeIso, versoes);
    return { anoMes, dias, totais: totaisDosDias(dias, registros, versoes) };
  });
  return {
    meses,
    banco: meses.reduce((soma, mes) => soma + mes.totais.saldo, 0),
    pendentes: meses.reduce((soma, mes) => soma + mes.totais.pendentes, 0),
  };
}
