import test from 'node:test';
import assert from 'node:assert/strict';
import { lerEspelho, registroDe, conferir } from '../public/shared/espelho.js';

const ESPELHO = `01/08/2026
sáb
DIA COMP.

03/08/2026
seg
08:00 12:00 13:30 17:22

04/08/2026
ter
08:00 10:00 10:15 12:00 13:00 17:30
Banco de horas:
+0h30min

07/09/2026
seg
FERIADO`;

test('lerEspelho separa dias, batidas, rótulos e o saldo oficial', () => {
  const dias = lerEspelho(ESPELHO);
  assert.equal(dias.length, 4);
  assert.deepEqual(dias[0], { dia: '2026-08-01', batidas: [], rotulo: 'naoUtil', oficial: null });
  assert.deepEqual(dias[1].batidas, ['08:00', '12:00', '13:30', '17:22']);
  assert.equal(dias[2].oficial, 30);
  assert.equal(dias[3].rotulo, 'feriado');
});

test('registroDe: o maior intervalo do meio é o almoço', () => {
  const [, , comCafe] = lerEspelho(ESPELHO);
  const registro = registroDe(comCafe);
  assert.equal(registro.chegada, '08:00');
  assert.equal(registro.almocoIni, '12:00');
  assert.equal(registro.almocoFim, '13:00');
  assert.equal(registro.saida, '17:30');
});

test('registroDe ignora dia não útil e marca feriado', () => {
  const [compensado, , , feriado] = lerEspelho(ESPELHO);
  assert.equal(registroDe(compensado), null);
  assert.equal(registroDe(feriado).tipo, 'feriado');
});

test('conferir: sem linha de banco o oficial é zero (8 min a menos ficam na tolerância)', () => {
  const [, normal] = lerEspelho(ESPELHO);
  const resultado = conferir(normal, registroDe(normal));
  assert.equal(resultado.oficial, 0);
  assert.equal(resultado.ok, true);
});

test('conferir: aponta divergência quando o oficial não bate', () => {
  const [, normal] = lerEspelho(ESPELHO);
  const resultado = conferir({ ...normal, oficial: 45 }, registroDe(normal));
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'diverge do oficial');
});

test('conferir: bate quando o saldo calculado é o oficial', () => {
  const [, , comCafe] = lerEspelho(ESPELHO);
  const registro = registroDe(comCafe);
  assert.equal(conferir(comCafe, registro).ok, true);
});
