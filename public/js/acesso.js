/**
 * @description Mostra uma mensagem num <p class="mensagem">; tipo 'erro', 'ok' ou 'info'; texto vazio esconde
 * @param {HTMLElement} alvo
 * @param {string} texto
 * @param {string} [tipo]
 */
export function mensagem(alvo, texto, tipo = 'info') {
  alvo.textContent = texto;
  alvo.className = `mensagem ${tipo}`;
}

/**
 * @description Texto amigável para um erro do Supabase Auth
 * @param {{message?: string, status?: number}} erro
 * @returns {string}
 */
export function textoDoErroDeAuth(erro) {
  const texto = String(erro?.message ?? '');
  if (erro?.status === 429 || /rate limit/i.test(texto)) {
    return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  }
  if (/invalid login credentials/i.test(texto)) {
    return 'E-mail ou senha incorretos.';
  }
  if (/banned/i.test(texto)) {
    return 'Seu acesso está desativado. Fale com o administrador.';
  }
  if (/email not confirmed/i.test(texto)) {
    return 'Seu convite ainda não foi aceito. Use o link do e-mail de convite.';
  }
  if (/should be different/i.test(texto)) {
    return 'A senha nova precisa ser diferente da atual.';
  }
  if (/password/i.test(texto) && /(weak|least|characters)/i.test(texto)) {
    return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  }
  if (erro?.status === 0 || /fetch/i.test(texto)) {
    return 'O Supabase não respondeu. Confira a conexão.';
  }
  return 'Não deu certo. Tente de novo em instantes.';
}
