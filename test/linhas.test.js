import test from 'node:test';
import assert from 'node:assert/strict';
import { paraRegistro, paraLinha, umPorDia } from '../public/shared/linhas.js';
import { normalizarRegistro } from '../public/shared/registro.js';
import { resumoDoBanco, compararDias, mesesDivergentes } from '../scripts/conferencia.js';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const dia = (campos) => ({ dia: '2026-10-14', tipo: 'normal', chegada: null, almocoIni: null, almocoFim: null, saida: null, carga: '08:00', ...campos });

test('paraLinha e paraRegistro fazem a volta completa', () => {
  const registro = dia({ chegada: '08:00', almocoIni: '12:00', almocoFim: '13:00', saida: '17:00' });
  const linha = paraLinha(registro, USUARIO);
  assert.equal(linha.user_id, USUARIO);
  assert.equal(linha.almoco_ini, '12:00');
  assert.deepEqual(paraRegistro(linha), { ...registro, atualizadoEm: null });
});

test('linha do SQLite antigo passa pela validação do app', () => {
  const linha = { dia: '2026-10-14', tipo: 'feriado', chegada: '08:00', almoco_ini: null, almoco_fim: null, saida: null, carga: null };
  const { ok, registro } = normalizarRegistro(paraRegistro(linha));
  assert.equal(ok, true);
  assert.equal(registro.chegada, null, 'feriado descarta as marcações, como o CHECK da tabela exige');
});

test('umPorDia deixa o último registro de cada dia', () => {
  const lista = umPorDia([dia({ saida: '17:00' }), dia({ dia: '2026-10-15' }), dia({ saida: '18:00' })]);
  assert.equal(lista.length, 2);
  assert.equal(lista.find((r) => r.dia === '2026-10-14').saida, '18:00');
});

test('resumoDoBanco soma o saldo por mês e ignora dias que não contam', () => {
  const resumo = resumoDoBanco([
    dia({ dia: '2026-09-30', chegada: '08:00', almocoIni: '12:00', almocoFim: '13:00', saida: '17:30' }),
    dia({ dia: '2026-10-01', tipo: 'compensacao' }),
    dia({ dia: '2026-10-02', chegada: '08:00' }),
  ]);
  assert.equal(resumo.dias, 3);
  assert.deepEqual(resumo.porMes, { '2026-09': 30, '2026-10': -480 });
  assert.equal(resumo.acumulado, -450);
});

test('compararDias e mesesDivergentes apontam o que não foi migrado igual', () => {
  const origem = [dia({ dia: '2026-10-01', tipo: 'folga' }), dia({ dia: '2026-10-02', tipo: 'feriado' }), dia({ dia: '2026-10-05', tipo: 'compensacao' })];
  const destino = [dia({ dia: '2026-10-01', tipo: 'folga' }), dia({ dia: '2026-10-05', tipo: 'folga' }), dia({ dia: '2026-10-06', tipo: 'folga' })];
  assert.deepEqual(compararDias(origem, destino), { faltando: ['2026-10-02'], sobrando: ['2026-10-06'], diferentes: ['2026-10-05'] });
  assert.deepEqual(mesesDivergentes(resumoDoBanco(origem), resumoDoBanco(destino)), [{ mes: '2026-10', origem: -480, destino: 0 }]);
  assert.deepEqual(mesesDivergentes(resumoDoBanco(origem), resumoDoBanco(origem)), []);
});
