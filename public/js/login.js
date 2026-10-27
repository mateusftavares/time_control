import { CONFIGURADO } from './config.js';
import { supabase, lembrarSessao, definirLembrarSessao } from './supabase.js';
import { elementos } from './util.js';
import { mensagem, textoDoErroDeAuth } from './acesso.js';

const PAGINA_DO_APP = '/index.html';
const MOTIVOS = {
  expirada: ['Sua sessão expirou. Entre de novo.', 'info'],
  inativo: ['Seu acesso está desativado. Fale com o administrador.', 'erro'],
};

const el = elementos([
  'telaEntrar', 'formEntrar', 'mensagemEntrar', 'email', 'senha', 'lembrar', 'irEsqueci', 'btnEntrar',
  'telaEsqueci', 'formEsqueci', 'mensagemEsqueci', 'emailEsqueci', 'btnEsqueci', 'voltarEntrar',
]);

function mostrarTela(esqueci) {
  el.telaEntrar.hidden = esqueci;
  el.telaEsqueci.hidden = !esqueci;
  (esqueci ? el.emailEsqueci : el.email).focus();
}

async function entrar(evento) {
  evento.preventDefault();
  const email = el.email.value.trim();
  if (!email || !el.senha.value) {
    mensagem(el.mensagemEntrar, 'Informe o e-mail e a senha.', 'erro');
    return;
  }

  el.btnEntrar.disabled = true;
  mensagem(el.mensagemEntrar, '');
  definirLembrarSessao(el.lembrar.checked);

  const { error } = await supabase.auth.signInWithPassword({ email, password: el.senha.value });
  if (error) {
    mensagem(el.mensagemEntrar, textoDoErroDeAuth(error), 'erro');
    el.senha.value = '';
    el.btnEntrar.disabled = false;
    return;
  }
  location.replace(PAGINA_DO_APP);
}

/* A resposta é a mesma exista ou não o e-mail: a tela não revela quem tem conta. */
async function pedirLink(evento) {
  evento.preventDefault();
  const email = el.emailEsqueci.value.trim();
  if (!email || !el.emailEsqueci.checkValidity()) {
    mensagem(el.mensagemEsqueci, 'Informe um e-mail válido.', 'erro');
    return;
  }

  el.btnEsqueci.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/definir-senha.html`,
  });
  el.btnEsqueci.disabled = false;

  if (error && (error.status === 429 || error.status === 0 || /fetch/i.test(error.message))) {
    mensagem(el.mensagemEsqueci, textoDoErroDeAuth(error), 'erro');
    return;
  }
  mensagem(el.mensagemEsqueci, 'Se esse e-mail tiver acesso, o link chega em instantes. Confira também o spam.', 'ok');
}

async function iniciar() {
  el.lembrar.checked = lembrarSessao();
  el.formEntrar.addEventListener('submit', entrar);
  el.formEsqueci.addEventListener('submit', pedirLink);
  el.irEsqueci.addEventListener('click', () => {
    el.emailEsqueci.value = el.email.value.trim();
    mostrarTela(true);
  });
  el.voltarEntrar.addEventListener('click', () => mostrarTela(false));

  if (!CONFIGURADO) {
    mensagem(el.mensagemEntrar, 'Supabase não configurado: preencha public/js/config.js.', 'erro');
    el.btnEntrar.disabled = true;
    el.btnEsqueci.disabled = true;
    return;
  }

  const motivo = MOTIVOS[new URLSearchParams(location.search).get('motivo')];
  if (motivo) {
    mensagem(el.mensagemEntrar, ...motivo);
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    location.replace(PAGINA_DO_APP);
  }
}

iniciar();
