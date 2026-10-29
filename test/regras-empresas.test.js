import test from 'node:test';
import assert from 'node:assert/strict';
import { validarPedidoEmpresa, recusaDeDesativar, montarEmpresas } from '../src/regras-empresas.js';

const EMPRESA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMPRESA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

test('validarPedidoEmpresa: criar exige nome da empresa e e-mail do ADM, e normaliza', () => {
  assert.deepEqual(validarPedidoEmpresa({ acao: 'criar', nomeEmpresa: ' Padaria ', email: ' Dono@X.com ', nome: ' Ana ' }).pedido,
    { acao: 'criar', nomeEmpresa: 'Padaria', email: 'dono@x.com', nome: 'Ana' });
  assert.equal(validarPedidoEmpresa({ acao: 'criar', nomeEmpresa: '', email: 'a@b.com' }).ok, false);
  assert.equal(validarPedidoEmpresa({ acao: 'criar', nomeEmpresa: 'x'.repeat(101), email: 'a@b.com' }).ok, false);
  assert.equal(validarPedidoEmpresa({ acao: 'criar', nomeEmpresa: 'Linha\nquebrada', email: 'a@b.com' }).ok, false);
  assert.equal(validarPedidoEmpresa({ acao: 'criar', nomeEmpresa: 'Padaria', email: 'invalido' }).ok, false);
});

test('validarPedidoEmpresa: ações sobre uma empresa exigem o id dela; transferir exige o id do membro', () => {
  assert.equal(validarPedidoEmpresa({ acao: 'desativar', empresaId: '1 or 1=1' }).ok, false);
  assert.deepEqual(validarPedidoEmpresa({ acao: 'reativar', empresaId: EMPRESA_A, extra: 1 }).pedido, { acao: 'reativar', empresaId: EMPRESA_A });
  assert.deepEqual(validarPedidoEmpresa({ acao: 'renomear', empresaId: EMPRESA_A, nomeEmpresa: ' Nova ' }).pedido,
    { acao: 'renomear', empresaId: EMPRESA_A, nomeEmpresa: 'Nova' });
  assert.equal(validarPedidoEmpresa({ acao: 'transferirAdm', empresaId: EMPRESA_A, id: 'x' }).ok, false);
  assert.deepEqual(validarPedidoEmpresa({ acao: 'convidar', empresaId: EMPRESA_A, email: 'a@b.com' }).pedido,
    { acao: 'convidar', empresaId: EMPRESA_A, email: 'a@b.com', nome: '' });
  assert.equal(validarPedidoEmpresa({ acao: 'apagarTudo' }).ok, false);
  assert.equal(validarPedidoEmpresa(null).ok, false);
});

test('recusaDeDesativar: o super ADM não desativa a própria empresa', () => {
  assert.equal(recusaDeDesativar(EMPRESA_A, EMPRESA_A).status, 409);
  assert.equal(recusaDeDesativar(EMPRESA_B, EMPRESA_A), null);
});

test('montarEmpresas: membros por empresa, ADM destacado e ordem por nome', () => {
  const lista = montarEmpresas(
    [{ id: EMPRESA_A, nome: 'Zeta', ativa: true }, { id: EMPRESA_B, nome: 'Alfa', ativa: false }],
    [
      { id: ID_A, nome: 'Ana', email: 'ana@x.com', papel: 'admin', ativo: true, empresa_id: EMPRESA_A },
      { id: ID_B, nome: 'Bia', email: 'bia@x.com', papel: 'usuario', ativo: true, empresa_id: EMPRESA_A },
    ],
    [{ id: ID_A, email: 'ana@x.com', last_sign_in_at: '2026-10-01T10:00:00Z' }, { id: ID_B, email: 'bia@x.com', invited_at: '2026-10-20T10:00:00Z' }],
  );
  assert.deepEqual(lista.map((empresa) => empresa.nome), ['Alfa', 'Zeta']);
  assert.equal(lista[0].adm, null);
  assert.equal(lista[0].membros.length, 0);
  assert.equal(lista[1].adm.nome, 'Ana');
  assert.equal(lista[1].membros.find((membro) => membro.nome === 'Bia').convitePendente, true);
});
