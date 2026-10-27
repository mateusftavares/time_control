import { HASH_INICIAL } from './hash-inicial.js';
import { supabase } from './supabase.js';
import { elementos } from './util.js';
import { mensagem, textoDoErroDeAuth } from './acesso.js';

const PAGINA_DO_APP = '/index.html';
const TAMANHO_MINIMO = 8;
const ESPERA_ANTES_DE_ENTRAR_MS = 1200;

const el = elementos([
  'definirSub', 'formSenha', 'mensagemSenha', 'novaSenha', 'confirmaSenha', 'btnSalvarSenha', 'mensagemLink', 'rodapeLink',
]);

function linkInvalido(texto) {
  el.definirSub.textContent = 'Não foi possível usar este link.';
  mensagem(el.mensagemLink, texto, 'erro');
  el.rodapeLink.hidden = false;
}

async function salvar(evento) {
  evento.preventDefault();
  const senha = el.novaSenha.value;
  if (senha.length < TAMANHO_MINIMO) {
    mensagem(el.mensagemSenha, `A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`, 'erro');
    return;
  }
  if (senha !== el.confirmaSenha.value) {
    mensagem(el.mensagemSenha, 'As duas senhas não são iguais.', 'erro');
    return;
  }

  el.btnSalvarSenha.disabled = true;
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    mensagem(el.mensagemSenha, textoDoErroDeAuth(error), 'erro');
    el.btnSalvarSenha.disabled = false;
    return;
  }

  el.formSenha.reset();
  mensagem(el.mensagemSenha, 'Senha salva. Entrando…', 'ok');
  setTimeout(() => location.replace(PAGINA_DO_APP), ESPERA_ANTES_DE_ENTRAR_MS);
}

async function iniciar() {
  if (HASH_INICIAL.has('error')) {
    const expirado = HASH_INICIAL.get('error_code') === 'otp_expired';
    linkInvalido(expirado
      ? 'O link expirou ou já foi usado. Peça um novo em "Esqueci a senha" (ou um novo convite ao administrador).'
      : 'O link é inválido. Peça um novo em "Esqueci a senha" (ou um novo convite ao administrador).');
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    linkInvalido('Abra esta página pelo link do e-mail de convite ou de recuperação de senha.');
    return;
  }

  el.definirSub.textContent = `Conta ${data.session.user.email ?? ''}`.trim();
  el.formSenha.hidden = false;
  el.formSenha.addEventListener('submit', salvar);
  el.novaSenha.focus();
}

iniciar();
