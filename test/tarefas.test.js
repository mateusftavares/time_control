import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarTarefa, proximoPrazo, proximaOcorrencia, situacaoDoPrazo, compararTarefas, tarefasDoDia,
  paraTarefa, linhaDeTarefa, progressoDoChecklist, tarefaVazia,
} from '../public/shared/tarefas.js';

const tarefa = (campos) => ({ ...tarefaVazia(), titulo: 'Excluir etapa', ...campos });

test('normalizarTarefa exige título e apara os textos', () => {
  assert.equal(normalizarTarefa(tarefa({ titulo: '   ' })).ok, false);
  const { ok, tarefa: limpa } = normalizarTarefa(tarefa({ titulo: '  Excluir etapa ', cliente: ' Vendemmia ' }));
  assert.equal(ok, true);
  assert.equal(limpa.titulo, 'Excluir etapa');
  assert.equal(limpa.cliente, 'Vendemmia');
});

test('normalizarTarefa recusa status, prioridade, prazo e recorrência fora da lista', () => {
  for (const campos of [{ status: 'feito' }, { prioridade: 'maxima' }, { prazo: '2026-02-30' }, { recorrencia: 'anual' }]) {
    assert.equal(normalizarTarefa(tarefa(campos)).ok, false, JSON.stringify(campos));
  }
});

test('commits: aceita hash curto ou longo, branch com barra e data; descarta linha em branco', () => {
  const { ok, tarefa: limpa } = normalizarTarefa(tarefa({
    commits: [
      { hash: '0CCA8936D', branch: 'DEV/mateus_tavares_10x_new_arch', data: '2026-10-29' },
      { hash: '', branch: '', data: null },
      { hash: '', branch: '', data: '2026-10-29' },
    ],
  }));
  assert.equal(ok, true);
  assert.deepEqual(limpa.commits, [{ hash: '0cca8936d', branch: 'DEV/mateus_tavares_10x_new_arch', data: '2026-10-29' }]);
});

test('commits: recusa hash que não é hexadecimal, branch com espaço e data inválida', () => {
  assert.equal(normalizarTarefa(tarefa({ commits: [{ hash: 'abc', branch: '', data: null }] })).ok, false);
  assert.equal(normalizarTarefa(tarefa({ commits: [{ hash: 'zzzzzzz', branch: '', data: null }] })).ok, false);
  assert.equal(normalizarTarefa(tarefa({ commits: [{ hash: 'abcdef1', branch: 'minha branch', data: null }] })).ok, false);
  assert.equal(normalizarTarefa(tarefa({ commits: [{ hash: 'abcdef1', branch: '', data: '2026-13-01' }] })).ok, false);
});

test('checklist descarta itens vazios e guarda o feito como booleano', () => {
  const { tarefa: limpa } = normalizarTarefa(tarefa({
    checklist: [{ texto: ' testar no local ', feito: 'sim' }, { texto: '' }, { texto: 'build17', feito: true }],
  }));
  assert.deepEqual(limpa.checklist, [{ texto: 'testar no local', feito: false }, { texto: 'build17', feito: true }]);
  assert.deepEqual(progressoDoChecklist(limpa), { feitos: 1, total: 2 });
});

test('proximoPrazo diário, semanal e mensal anda até passar de hoje', () => {
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'diaria', prazo: '2026-10-29' }), '2026-10-29'), '2026-10-30');
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'diaria', prazo: '2026-10-20' }), '2026-10-29'), '2026-10-30');
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'semanal', prazo: '2026-10-27' }), '2026-10-29'), '2026-11-03');
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'mensal', prazo: '2026-10-31' }), '2026-10-31'), '2026-11-30');
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'mensal', prazo: '2026-01-31' }), '2026-02-15'), '2026-02-28');
  assert.equal(proximoPrazo(tarefa({ recorrencia: 'semanal', prazo: null }), '2026-10-29'), '2026-11-05');
  assert.equal(proximoPrazo(tarefa({ recorrencia: null, prazo: '2026-10-29' }), '2026-10-29'), null);
});

test('proximaOcorrencia copia o essencial, desmarca o checklist e zera commits e foco', () => {
  const nova = proximaOcorrencia(tarefa({
    id: 'x', recorrencia: 'semanal', prazo: '2026-10-29', status: 'concluida', cliente: 'LeverPro',
    checklist: [{ texto: 'relatório', feito: true }], commits: [{ hash: 'abcdef1', branch: '', data: null }],
    focoMs: 60000, pomodoros: 2,
  }), '2026-10-29');
  assert.equal(nova.id, null);
  assert.equal(nova.status, 'a_fazer');
  assert.equal(nova.prazo, '2026-11-05');
  assert.equal(nova.cliente, 'LeverPro');
  assert.deepEqual(nova.checklist, [{ texto: 'relatório', feito: false }]);
  assert.deepEqual(nova.commits, []);
  assert.equal(nova.focoMs, 0);
});

test('situacaoDoPrazo', () => {
  assert.equal(situacaoDoPrazo('2026-10-28', '2026-10-29'), 'vencida');
  assert.equal(situacaoDoPrazo('2026-10-29', '2026-10-29'), 'hoje');
  assert.equal(situacaoDoPrazo('2026-10-30', '2026-10-29'), 'futura');
  assert.equal(situacaoDoPrazo(null, '2026-10-29'), null);
});

test('compararTarefas: prioridade, depois prazo com vazio por último', () => {
  const lista = [
    tarefa({ titulo: 'sem prazo', prioridade: 'alta' }),
    tarefa({ titulo: 'baixa', prioridade: 'baixa', prazo: '2026-10-01' }),
    tarefa({ titulo: 'alta cedo', prioridade: 'alta', prazo: '2026-10-28' }),
    tarefa({ titulo: 'urgente', prioridade: 'urgente', prazo: '2026-12-01' }),
  ].sort(compararTarefas);
  assert.deepEqual(lista.map((t) => t.titulo), ['urgente', 'alta cedo', 'sem prazo', 'baixa']);
});

test('tarefasDoDia: vencidas, de hoje e em andamento; nunca as concluídas', () => {
  const lista = tarefasDoDia([
    tarefa({ titulo: 'vencida', prazo: '2026-10-27' }),
    tarefa({ titulo: 'futura', prazo: '2026-11-10' }),
    tarefa({ titulo: 'andamento', status: 'em_andamento' }),
    tarefa({ titulo: 'feita', prazo: '2026-10-27', status: 'concluida' }),
  ], '2026-10-29');
  assert.deepEqual(lista.map((t) => t.titulo).sort(), ['andamento', 'vencida']);
});

test('paraTarefa e linhaDeTarefa: a linha gravada não leva foco nem datas do servidor', () => {
  const linha = {
    id: 'u', titulo: 'T', cliente: null, status: 'a_fazer', prioridade: 'normal', prazo: null, recorrencia: null,
    anotacoes: null, checklist: null, commits: [], foco_ms: '90000', pomodoros: 3, concluida_em: null, criado_em: 'x',
  };
  const registro = paraTarefa(linha);
  assert.equal(registro.focoMs, 90000);
  assert.deepEqual(registro.checklist, []);
  const gravada = linhaDeTarefa(registro);
  assert.equal('foco_ms' in gravada, false);
  assert.equal('concluida_em' in gravada, false);
  assert.equal('id' in gravada, false);
  assert.equal('user_id' in gravada, false, 'o criador é do servidor');
  assert.equal('empresa_id' in gravada, false, 'a empresa é do servidor');
});

test('tarefa da empresa: responsável e cliente vão e voltam; id inválido é recusado', () => {
  const RESP = '11111111-1111-4111-8111-111111111111';
  const CLI = '22222222-2222-4222-8222-222222222222';
  const registro = paraTarefa({ id: 'u', titulo: 'T', cliente: 'ACME', cliente_id: CLI, responsavel_id: RESP, user_id: RESP,
    status: 'a_fazer', prioridade: 'normal', checklist: [], commits: [] });
  assert.equal(registro.clienteId, CLI);
  assert.equal(registro.responsavelId, RESP);
  assert.equal(registro.criadorId, RESP);
  const linha = linhaDeTarefa(normalizarTarefa(registro).tarefa);
  assert.equal(linha.cliente_id, CLI);
  assert.equal(linha.responsavel_id, RESP);
  assert.equal(normalizarTarefa(tarefa({ responsavelId: '1 or 1=1' })).ok, false);
  assert.equal(normalizarTarefa(tarefa({ clienteId: 'x' })).ok, false);
  assert.equal(normalizarTarefa(tarefa({ responsavelId: null, clienteId: null })).ok, true);
});
