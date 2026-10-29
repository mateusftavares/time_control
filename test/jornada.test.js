import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JORNADA_PADRAO, jornadaDe, cargaPadraoDe, cargaDoExpediente, ehUtil, inicioDoHistorico, versoesEfetivas,
  normalizarJornada, semanaComercial, semExpediente, textoTolerancia,
} from '../public/shared/jornada.js';
import { avaliar, ajustarMarcacoes, dentroDaTolerancia } from '../public/shared/regras.js';
import { iso } from '../public/shared/tempo.js';
import * as legado from '../scripts/regras-legado.js';

const { VERSOES_EQUIVALENTES } = legado;

const versao = (campos) => ({
  vigenteDesde: '2026-01-01',
  toleranciaAntes: 10,
  toleranciaDepois: 10,
  modo: 'acumulativo',
  semana: semanaComercial('08:00', '12:00', '13:00', '17:00'),
  ...campos,
});
const quarta = (campos) => ({ dia: '2026-10-14', tipo: 'normal', carga: '08:00', almocoIni: '12:00', almocoFim: '13:00', ...campos });

test('vigência: cada dia usa a versão de maior "vigente desde" que não passa dele', () => {
  const versoes = [versao({ vigenteDesde: '2026-03-01', toleranciaAntes: 1 }), versao({ vigenteDesde: '2026-02-01', toleranciaAntes: 2 })];
  assert.equal(jornadaDe('2026-01-31', versoes), JORNADA_PADRAO, 'antes da primeira vigência vale o padrão');
  assert.equal(jornadaDe('2026-02-01', versoes).toleranciaAntes, 2);
  assert.equal(jornadaDe('2026-02-28', versoes).toleranciaAntes, 2);
  assert.equal(jornadaDe('2026-03-01', versoes).toleranciaAntes, 1);
  assert.equal(jornadaDe('2030-01-01', versoes).toleranciaAntes, 1);
  assert.equal(inicioDoHistorico(versoes), '2026-02');
  assert.equal(inicioDoHistorico([]), null);
});

test('carga do dia vem do expediente: entrada à saída menos o almoço oficial; 0 sem expediente', () => {
  const semana = semanaComercial('08:00', '12:00', '13:00', '17:48');
  semana[6] = { trabalha: true, entrada: '08:00', almocoIni: null, almocoFim: null, saida: '12:00' };
  const versoes = [versao({ semana })];
  assert.equal(cargaPadraoDe('2026-10-14', versoes), 528);
  assert.equal(cargaPadraoDe('2026-10-17', versoes), 240, 'sábado de meio período, sem almoço');
  assert.equal(cargaPadraoDe('2026-10-18', versoes), 0, 'domingo sem expediente');
  assert.equal(ehUtil('2026-10-17', versoes), true);
  assert.equal(ehUtil('2026-10-18', versoes), false);
  assert.equal(cargaDoExpediente(semExpediente()), 0);
});

test('padrão de quem não configurou: seg–sex 08:00–12:00 e 13:00–17:00, 10/10 acumulativo', () => {
  assert.equal(cargaPadraoDe('2026-10-14', []), 480);
  assert.equal(ehUtil('2026-10-17', []), false);
  assert.equal(textoTolerancia(JORNADA_PADRAO), 'tolerância de 10 min por dia');
});

test('dentroDaTolerancia: negativo usa o "antes", positivo usa o "depois", limite incluído', () => {
  assert.equal(dentroDaTolerancia(-5, 5, 0), true);
  assert.equal(dentroDaTolerancia(-6, 5, 100), false);
  assert.equal(dentroDaTolerancia(15, 0, 15), true);
  assert.equal(dentroDaTolerancia(16, 100, 15), false);
  assert.equal(dentroDaTolerancia(0, 0, 0), true);
});

test('acumulativo: a tolerância vale sobre o saldo do dia, separada para menos (antes) e para mais (depois)', () => {
  const versoes = [versao({ toleranciaAntes: 5, toleranciaDepois: 15 })];
  assert.equal(avaliar(quarta({ chegada: '08:05', saida: '17:00' }), versoes).saldo, 0, '5 min a menos: dentro');
  assert.equal(avaliar(quarta({ chegada: '08:06', saida: '17:00' }), versoes).saldo, -6, '6 a menos: conta inteiro');
  assert.equal(avaliar(quarta({ chegada: '08:00', saida: '17:15' }), versoes).saldo, 0, '15 a mais: dentro');
  assert.equal(avaliar(quarta({ chegada: '08:00', saida: '17:16' }), versoes).saldo, 16);
  assert.equal(avaliar(quarta({ chegada: '08:30', saida: '17:35' }), versoes).saldo, 0, 'atraso compensado no fim do dia');
});

test('individual: cada marcação perto do horário oficial vale como o oficial; longe dele, vale a marcação', () => {
  const versoes = [versao({ modo: 'individual', toleranciaAntes: 10, toleranciaDepois: 5 })];
  const expediente = versoes[0].semana[3];

  assert.deepEqual(
    ajustarMarcacoes(quarta({ chegada: '07:50', almocoIni: '12:05', almocoFim: '13:06', saida: '17:04' }), expediente, 10, 5),
    quarta({ chegada: '08:00', almocoIni: '12:00', almocoFim: '13:06', saida: '17:00' }),
  );
  assert.equal(avaliar(quarta({ chegada: '07:50', saida: '17:04' }), versoes).saldo, 0, 'chegou 10 antes e saiu 4 depois: zero');
  assert.equal(avaliar(quarta({ chegada: '07:50', saida: '17:04' }), versoes).trabalhado, 494, 'o trabalhado mostrado é o real');
  assert.equal(avaliar(quarta({ chegada: '08:06', saida: '17:00' }), versoes).saldo, -6, 'atraso de 6 > 5: conta inteiro');
  assert.equal(avaliar(quarta({ chegada: '07:45', saida: '17:00' }), versoes).saldo, 15, 'chegou 15 antes > 10: conta inteiro');
  assert.equal(avaliar(quarta({ chegada: '08:00', almocoIni: '12:00', almocoFim: '13:05', saida: '17:00' }), versoes).saldo, 0,
    'volta do almoço 5 min depois: dentro');
});

test('acumulativo e individual divergem quando os desvios se compensam ou se somam', () => {
  const acumulativo = [versao()];
  const individual = [versao({ modo: 'individual' })];
  const atrasoCompensado = quarta({ chegada: '08:15', saida: '17:20' });
  assert.equal(avaliar(atrasoCompensado, acumulativo).saldo, 0, '+5 no dia: dentro');
  assert.equal(avaliar(atrasoCompensado, individual).saldo, 5, 'nenhuma marcação dentro dos 10 min: vale o real');

  const pequenosDesvios = quarta({ chegada: '07:52', saida: '17:09' });
  assert.equal(avaliar(pequenosDesvios, acumulativo).saldo, 17, '+17 no dia: fora');
  assert.equal(avaliar(pequenosDesvios, individual).saldo, 0, 'cada marcação dentro: zero');
});

test('individual em dia sem expediente: sem horário oficial, nada é ajustado', () => {
  const versoes = [versao({ modo: 'individual' })];
  const sabado = { dia: '2026-10-17', tipo: 'normal', carga: null, chegada: '09:00', almocoIni: null, almocoFim: null, saida: '13:00' };
  assert.deepEqual(avaliar(sabado, versoes), { estado: 'normal', trabalhado: 180, saldo: 180 });
});

test('normalizarJornada valida horários, ordem do almoço, tolerância e modo', () => {
  const valida = versao({ vigenteDesde: '2026-11-01' });
  assert.deepEqual(normalizarJornada(valida), { ok: true, jornada: valida });

  const comErro = (campos) => normalizarJornada({ ...valida, ...campos }).ok;
  assert.equal(comErro({ vigenteDesde: '2026-02-30' }), false);
  assert.equal(comErro({ toleranciaAntes: -1 }), false);
  assert.equal(comErro({ toleranciaDepois: 121 }), false);
  assert.equal(comErro({ toleranciaDepois: 2.5 }), false);
  assert.equal(comErro({ modo: 'outro' }), false);
  assert.equal(comErro({ semana: valida.semana.slice(1) }), false);

  const semana = (expediente) => valida.semana.map((dia, indice) => (indice === 1 ? { ...dia, ...expediente } : dia));
  assert.equal(comErro({ semana: semana({ saida: '07:00' }) }), false);
  assert.equal(comErro({ semana: semana({ almocoFim: null }) }), false);
  assert.equal(comErro({ semana: semana({ almocoIni: '18:00', almocoFim: '19:00' }) }), false);
  assert.equal(comErro({ semana: semana({ entrada: '25:00' }) }), false);
  assert.equal(comErro({ semana: semana({ almocoIni: null, almocoFim: null }) }), true);

  const folgaComHorario = normalizarJornada({ ...valida, semana: valida.semana.map((dia, i) => (i === 0 ? { trabalha: false, entrada: '08:00' } : dia)) });
  assert.equal(folgaComHorario.ok, true);
  assert.deepEqual(folgaComHorario.jornada.semana[0], semExpediente(), 'dia sem expediente descarta horários');
});

/* Gerador determinístico: marcações em volta dos limites da tolerância, para comparar as duas regras. */
function* registrosDeTeste() {
  let semente = 7;
  const aleatorio = (limite) => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente % limite;
  };
  const hora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

  for (let data = new Date(2026, 1, 1); data <= new Date(2026, 11, 31); data.setDate(data.getDate() + 1)) {
    const dia = iso(data);
    const util = legado.ehUtil(dia);
    for (let i = 0; i < 6; i++) {
      const chegada = 7 * 60 + 30 + aleatorio(90);
      const almocoIni = 11 * 60 + 30 + aleatorio(60);
      const almocoFim = almocoIni + 30 + aleatorio(90);
      const saida = 16 * 60 + 30 + aleatorio(120);
      const cargas = util ? [null, '08:48', '08:00', '06:00'] : ['08:48', '08:00'];
      const carga = cargas[aleatorio(cargas.length)];
      const tipo = ['normal', 'normal', 'normal', 'feriado', 'folga', 'compensacao'][aleatorio(6)];
      const semAlmoco = aleatorio(4) === 0;
      yield {
        dia,
        tipo,
        carga,
        chegada: hora(chegada),
        almocoIni: semAlmoco ? null : hora(almocoIni),
        almocoFim: semAlmoco ? null : hora(almocoFim),
        saida: aleatorio(8) === 0 ? null : hora(saida),
      };
    }
  }
}

test('equivalência: as vigências semeadas dão o mesmo saldo das regras antigas, dia a dia', () => {
  let comparados = 0;
  for (const registro of registrosDeTeste()) {
    assert.deepEqual(avaliar(registro, VERSOES_EQUIVALENTES), legado.avaliar(registro), JSON.stringify(registro));
    comparados++;
  }
  assert.ok(comparados > 1900);
});

test('equivalência: dias úteis, carga padrão em dia útil e início do histórico', () => {
  for (let data = new Date(2026, 1, 1); data <= new Date(2027, 11, 31); data.setDate(data.getDate() + 1)) {
    const dia = iso(data);
    assert.equal(ehUtil(dia, VERSOES_EQUIVALENTES), legado.ehUtil(dia), dia);
    if (legado.ehUtil(dia)) {
      assert.equal(cargaPadraoDe(dia, VERSOES_EQUIVALENTES), legado.cargaPadraoDe(dia), dia);
    }
  }
  assert.equal(inicioDoHistorico(VERSOES_EQUIVALENTES), legado.INICIO_HISTORICO);
});

test('fora da equivalência só fica a carga vazia em fim de semana ou antes de fevereiro: a migração grava essa carga', () => {
  const sabadoSemCarga = { dia: '2026-10-17', tipo: 'compensacao', carga: null };
  assert.notEqual(avaliar(sabadoSemCarga, VERSOES_EQUIVALENTES).saldo, legado.avaliar(sabadoSemCarga).saldo);
  const congelado = { ...sabadoSemCarga, carga: '08:00' };
  assert.equal(avaliar(congelado, VERSOES_EQUIVALENTES).saldo, legado.avaliar(sabadoSemCarga).saldo);
});

test('versoesEfetivas: modelo atribuído desde a primeira vigência reproduz as vigências do usuário', () => {
  const versoes = [versao({ vigenteDesde: '2026-02-01', toleranciaAntes: 2 }), versao({ vigenteDesde: '2026-03-01', toleranciaAntes: 3 })];
  const efetivas = versoesEfetivas([{ desde: '2026-02-01', modeloId: 'm' }], new Map([['m', versoes]]));
  assert.deepEqual(efetivas, versoes);
});

test('versoesEfetivas: trocar de modelo corta as versões do anterior e começa pela vigente do novo', () => {
  const a = [versao({ vigenteDesde: '2026-01-01', toleranciaAntes: 1 }), versao({ vigenteDesde: '2026-06-01', toleranciaAntes: 6 })];
  const b = [versao({ vigenteDesde: '2025-01-01', toleranciaAntes: 20 }), versao({ vigenteDesde: '2026-08-01', toleranciaAntes: 28 })];
  const efetivas = versoesEfetivas(
    [{ desde: '2026-05-01', modeloId: 'b' }, { desde: '2026-01-15', modeloId: 'a' }],
    new Map([['a', a], ['b', b]]),
  );
  assert.deepEqual(efetivas.map((v) => [v.vigenteDesde, v.toleranciaAntes]),
    [['2026-01-15', 1], ['2026-05-01', 20], ['2026-08-01', 28]]);
  assert.equal(jornadaDe('2026-07-10', efetivas).toleranciaAntes, 20, 'a versão de junho do modelo antigo não vale mais');
  assert.equal(jornadaDe('2026-01-10', efetivas), JORNADA_PADRAO, 'antes da primeira atribuição vale o padrão');
});

test('versoesEfetivas: modelo sem versão no início do período vale o padrão até a primeira dele; sem atribuição, nada', () => {
  const efetivas = versoesEfetivas([{ desde: '2026-01-01', modeloId: 'm' }], new Map([['m', [versao({ vigenteDesde: '2026-03-01' })]]]));
  assert.deepEqual(efetivas.map((v) => v.vigenteDesde), ['2026-01-01', '2026-03-01']);
  assert.equal(efetivas[0].semana, JORNADA_PADRAO.semana);
  assert.deepEqual(versoesEfetivas([], new Map()), []);
});
