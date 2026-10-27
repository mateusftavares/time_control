import test from 'node:test';
import assert from 'node:assert/strict';
import { textoDoErroDeAuth } from '../public/js/acesso.js';

test('textoDoErroDeAuth traduz os erros mais comuns do Supabase Auth', () => {
  assert.equal(textoDoErroDeAuth({ message: 'Invalid login credentials', status: 400 }), 'E-mail ou senha incorretos.');
  assert.match(textoDoErroDeAuth({ message: 'User is banned', status: 400 }), /desativado/);
  assert.match(textoDoErroDeAuth({ message: 'x', status: 429 }), /Muitas tentativas/);
  assert.match(textoDoErroDeAuth({ message: 'Password should be at least 8 characters', status: 422 }), /Senha fraca/);
  assert.match(textoDoErroDeAuth({ message: 'TypeError: Failed to fetch', status: 0 }), /não respondeu/);
  assert.equal(textoDoErroDeAuth({ message: 'algo novo' }), 'Não deu certo. Tente de novo em instantes.');
});
