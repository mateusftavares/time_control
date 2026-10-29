import test from 'node:test';
import assert from 'node:assert/strict';
import { diasDoMes, mesesDoHistorico, totaisDosDias, resumoDoBanco } from '../public/shared/banco.js';
import { definirJornadas, semanaComercial } from '../public/shared/jornada.js';

const versao = (vigenteDesde, saida) => ({
  vigenteDesde, toleranciaAntes: 10, toleranciaDepois: 10, modo: 'acumulativo',
  semana: semanaComercial('08:00', '12:00', '13:00', saida),
});
const VERSOES = [versao('2026-09-01', '17:00')];
const dia = (data, campos) => ({ dia: data, tipo: 'normal', chegada: '08:00', almocoIni: '12:00', almocoFim: '13:00', saida: '17:00', carga: null, ...campos });
const REGISTROS = new Map([
  ['2026-10-01', dia('2026-10-01', { saida: '18:00' })], // +1h
  ['2026-10-02', dia('2026-10-02', { saida: '16:30' })], // -30min
  ['2026-10-03', dia('2026-10-03', { chegada: '09:00', almocoIni: null, almocoFim: null, saida: '11:00' })], // sábado com registro
  ['2026-09-30', dia('2026-09-30')],
].map(([chave, registro]) => [chave, registro]));

test('diasDoMes: úteis até hoje e fim de semana só com registro', () => {
  const dias = diasDoMes('2026-10', REGISTROS, '2026-10-06', VERSOES);
  assert.deepEqual(dias, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']);
});

test('mesesDoHistorico: do mês atual até o início da jornada', () => {
  assert.deepEqual(mesesDoHistorico(REGISTROS, '2026-10-06', VERSOES), ['2026-10', '2026-09']);
});

test('totaisDosDias e resumoDoBanco: saldo, trabalhado, fechados e sem marcação', () => {
  const totais = totaisDosDias(['2026-10-01', '2026-10-02', '2026-10-05'], REGISTROS, VERSOES);
  assert.equal(totais.saldo, 30);
  assert.equal(totais.fechados, 2);
  assert.equal(totais.pendentes, 1);
  const resumo = resumoDoBanco(REGISTROS, '2026-10-06', VERSOES);
  assert.equal(resumo.meses[0].anoMes, '2026-10');
  assert.equal(resumo.pendentes, resumo.meses.reduce((soma, mes) => soma + mes.totais.pendentes, 0));
  assert.equal(resumo.banco, resumo.meses.reduce((soma, mes) => soma + mes.totais.saldo, 0));
});

test('com as versões omitidas usa as do usuário logado: mesmo resultado que passando as mesmas versões', () => {
  definirJornadas(VERSOES);
  assert.deepEqual(resumoDoBanco(REGISTROS, '2026-10-06'), resumoDoBanco(REGISTROS, '2026-10-06', VERSOES));
  definirJornadas([]);
});
