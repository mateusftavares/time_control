import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerToken, idValido, normalizarEmail, recusaDaMudanca, validarPedido, montarListaUsuarios,
} from '../src/regras-usuarios.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

const ADM = { id: ID_A, papel: 'admin', ativo: true };
const ATIVO = { id: ID_B, papel: 'usuario', ativo: true };
const INATIVO = { id: ID_C, papel: 'usuario', ativo: false };

test('alvo fora da empresa do ADM não existe para ele', () => {
  assert.equal(recusaDaMudanca(undefined, ID_A, { acao: 'desativar' }).status, 404);
});

test('o ADM não pode ser rebaixado nem desativado: só transferindo o papel', () => {
  assert.equal(recusaDaMudanca(ADM, ID_A, { acao: 'alterarPapel', papel: 'usuario' }).status, 409);
  assert.equal(recusaDaMudanca(ADM, ID_A, { acao: 'desativar' }).status, 409);
  assert.equal(recusaDaMudanca(ADM, ID_A, { acao: 'alterarPapel', papel: 'admin' }).status, 409);
});

test('transferir o ADM só para um membro ativo', () => {
  assert.equal(recusaDaMudanca(ATIVO, ID_A, { acao: 'alterarPapel', papel: 'admin' }), null);
  assert.equal(recusaDaMudanca(INATIVO, ID_A, { acao: 'alterarPapel', papel: 'admin' }).status, 409);
});

test('usuário comum pode ser desativado, reativado e mantido como usuário', () => {
  assert.equal(recusaDaMudanca(ATIVO, ID_A, { acao: 'desativar' }), null);
  assert.equal(recusaDaMudanca(INATIVO, ID_A, { acao: 'reativar' }), null);
  assert.equal(recusaDaMudanca(ATIVO, ID_A, { acao: 'alterarPapel', papel: 'usuario' }), null);
});

test('lerToken aceita só "Bearer <token>"', () => {
  assert.equal(lerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(lerToken('bearer xyz'), 'xyz');
  assert.equal(lerToken('Basic abc'), null);
  assert.equal(lerToken('Bearer'), null);
  assert.equal(lerToken(null), null);
});

test('idValido e normalizarEmail', () => {
  assert.equal(idValido(ID_A), true);
  assert.equal(idValido('1 or 1=1'), false);
  assert.equal(normalizarEmail('  Fulano@Exemplo.COM '), 'fulano@exemplo.com');
  assert.equal(normalizarEmail('sem-arroba'), null);
  assert.equal(normalizarEmail('<script>@x.com'), null);
  assert.equal(normalizarEmail(42), null);
});

test('validarPedido: ações conhecidas e campos obrigatórios', () => {
  assert.deepEqual(validarPedido({ acao: 'listar' }), { ok: true, pedido: { acao: 'listar' } });
  assert.equal(validarPedido({ acao: 'apagarTudo' }).ok, false);
  assert.equal(validarPedido(null).ok, false);
  assert.equal(validarPedido({ acao: 'desativar', id: 'x' }).ok, false);
  assert.deepEqual(validarPedido({ acao: 'reativar', id: ID_B, extra: 1 }), { ok: true, pedido: { acao: 'reativar', id: ID_B } });
  assert.equal(validarPedido({ acao: 'alterarPapel', id: ID_B, papel: 'dono' }).ok, false);
  assert.deepEqual(validarPedido({ acao: 'alterarPapel', id: ID_B, papel: 'admin' }).pedido, { acao: 'alterarPapel', id: ID_B, papel: 'admin' });
});

test('validarPedido: convite normaliza e-mail e nome, sempre como usuário', () => {
  assert.deepEqual(validarPedido({ acao: 'convidar', email: ' A@B.com ', nome: ' Ana ' }).pedido,
    { acao: 'convidar', email: 'a@b.com', nome: 'Ana' });
  assert.equal(validarPedido({ acao: 'convidar', email: 'a@b.com', papel: 'usuario' }).ok, true);
  assert.equal(validarPedido({ acao: 'convidar', email: 'a@b.com', papel: 'admin' }).ok, false);
  assert.equal(validarPedido({ acao: 'convidar', email: 'a@b.com', nome: 'x'.repeat(101) }).ok, false);
  assert.equal(validarPedido({ acao: 'convidar', email: 'a@b.com', nome: 'linha\nquebrada' }).ok, false);
  assert.equal(validarPedido({ acao: 'convidar', email: 'a@b.com', papel: 'root' }).ok, false);
  assert.equal(validarPedido({ acao: 'convidar', email: 'invalido' }).ok, false);
});

test('montarListaUsuarios junta Auth e perfis, ordena por nome e marca convite pendente', () => {
  const auth = [
    { id: ID_A, email: 'zeca@x.com', last_sign_in_at: '2026-10-01T10:00:00Z', invited_at: null },
    { id: ID_B, email: 'ana@x.com', last_sign_in_at: null, invited_at: '2026-10-20T10:00:00Z' },
    { id: 'sem-perfil', email: 'orfao@x.com' },
  ];
  const lista = montarListaUsuarios(auth, [
    { id: ID_A, nome: 'Zeca', email: 'zeca@x.com', papel: 'admin', ativo: true },
    { id: ID_B, nome: 'Ana', email: 'ana@x.com', papel: 'usuario', ativo: true },
  ]);
  assert.deepEqual(lista.map((u) => u.nome), ['Ana', 'Zeca']);
  assert.equal(lista[0].convitePendente, true);
  assert.equal(lista[1].ultimoAcesso, '2026-10-01T10:00:00Z');
  assert.equal(lista[1].convitePendente, false);
});
