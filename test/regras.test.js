import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliar, cargaPadraoDe, calcularDiaEmAndamento, validarMarcacoes, ehUtil } from '../public/shared/regras.js';

const dia = (campos) => ({ dia: '2026-10-14', tipo: 'normal', carga: '08:00', ...campos });

test('dia normal: trabalhado desconta o almoço e o saldo é a diferença da carga', () => {
  const resultado = avaliar(dia({ chegada: '08:00', almocoIni: '12:00', almocoFim: '13:00', saida: '17:30' }));
  assert.deepEqual(resultado, { estado: 'normal', trabalhado: 510, saldo: 30 });
});

test('tolerância de 10 min zera o saldo, mas não abate o que passa dela', () => {
  assert.equal(avaliar(dia({ chegada: '08:10', almocoIni: '12:00', almocoFim: '13:00', saida: '17:00' })).saldo, 0);
  assert.equal(avaliar(dia({ chegada: '08:11', almocoIni: '12:00', almocoFim: '13:00', saida: '17:00' })).saldo, -11);
});

test('almoço tem piso de 1h, mesmo marcado a menos ou sem marcar', () => {
  assert.equal(avaliar(dia({ chegada: '08:00', almocoIni: '12:00', almocoFim: '12:30', saida: '17:00' })).trabalhado, 480);
  assert.equal(avaliar(dia({ chegada: '08:00', saida: '17:00' })).trabalhado, 480);
});

test('feriado e folga valem saldo zero; compensação consome a carga', () => {
  assert.deepEqual(avaliar(dia({ tipo: 'feriado' })), { estado: 'feriado', trabalhado: null, saldo: 0 });
  assert.equal(avaliar(dia({ tipo: 'compensacao' })).saldo, -480);
});

test('dia sem registro é pendente; com marcação incompleta fica em aberto', () => {
  assert.equal(avaliar(undefined).estado, 'pendente');
  assert.equal(avaliar(dia({ chegada: '08:00' })).estado, 'aberto');
});

test('jornada de 08:48 até fevereiro/26 e 08:00 a partir de março', () => {
  assert.equal(cargaPadraoDe('2026-02-27'), 528);
  assert.equal(cargaPadraoDe('2026-03-02'), 480);
  assert.equal(avaliar({ dia: '2026-02-27', tipo: 'compensacao' }).saldo, -528);
});

test('ehUtil: segunda a sexta', () => {
  assert.equal(ehUtil('2026-10-16'), true);
  assert.equal(ehUtil('2026-10-17'), false);
  assert.equal(ehUtil('2026-10-18'), false);
});

test('dia em andamento: previsão soma o que falta de carga e de almoço', () => {
  const calculo = calcularDiaEmAndamento({ chegada: 480, almocoIni: null, almocoFim: null, saida: null, carga: 480 }, 600);
  assert.equal(calculo.trabalhado, 120);
  assert.equal(calculo.previsao, 600 + 360 + 60);
});

test('dia em andamento: durante o almoço o trabalhado congela', () => {
  const calculo = calcularDiaEmAndamento({ chegada: 480, almocoIni: 720, almocoFim: null, saida: null, carga: 480 }, 750);
  assert.equal(calculo.emAlmoco, true);
  assert.equal(calculo.trabalhado, 240);
  assert.equal(calculo.almocoDevendo, 30);
});

test('validarMarcacoes aponta futuro e ordem errada', () => {
  const erros = validarMarcacoes({ chegada: 600, almocoIni: 540, almocoFim: null, saida: 900 }, 800);
  assert.equal(erros.almocoIni, 'antes da chegada');
  assert.equal(erros.saida, 'está no futuro');
  assert.equal(erros.chegada, '');
});
