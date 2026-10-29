import { HASH_INICIAL } from './hash-inicial.js';
import { exigirSessao, carregarPerfil, sair } from './sessao.js';
import { supabase } from './supabase.js';
import { elementos } from './util.js';
import * as store from './registros.js';
import { iniciarNavegacao, liberarTela } from './navegacao.js';
import { iniciarPonto } from './ponto.js';
import { iniciarMes } from './mes.js';
import { iniciarImportacao } from './importacao.js';
import { iniciarPomodoro, gravarPomodoroAoSair } from './pomodoro.js';
import { iniciarTarefas } from './tarefas.js';
import { iniciarEmpresa } from './empresa.js';
import { iniciarPerfil, carregarJornadas } from './perfil.js';
import { mostrarAviso, avisoDeFalha } from './aviso.js';
import { aparenciaDoPerfil, aplicarAparencia } from './aparencia.js';

const el = elementos(['btnSair', 'menuEmpresa']);

function desligarBotoes() {
  document.querySelectorAll('button').forEach((botao) => {
    botao.disabled = botao !== el.btnSair;
  });
}

/* Sem perfil, desativado ou sem empresa ativa: a RLS já corta os dados, aqui só se sai. */
async function perfilOuSair() {
  try {
    const perfil = await carregarPerfil();
    if (!perfil || !perfil.ativo || !perfil.empresas) {
      await sair('inativo');
      return null;
    }
    return perfil;
  } catch (erro) {
    mostrarAviso(avisoDeFalha('carregar o seu perfil', erro));
    return undefined;
  }
}

const LINKS_DE_SENHA = ['invite', 'recovery'];

/* Convite feito pelo dashboard do Supabase cai na raiz do site: quem chega por um link de
   convite ou recuperação vai definir a senha antes de usar o app. */
function desviarLinkDeSenha(sessao) {
  if (HASH_INICIAL.has('error')) {
    location.replace(`/definir-senha.html#${HASH_INICIAL}`);
    return true;
  }
  if (sessao && LINKS_DE_SENHA.includes(HASH_INICIAL.get('type'))) {
    location.replace('/definir-senha.html');
    return true;
  }
  return false;
}

async function iniciar() {
  if (desviarLinkDeSenha(null)) {
    return;
  }
  const sessao = await exigirSessao();
  if (!sessao || desviarLinkDeSenha(sessao)) {
    return;
  }

  /* O supabase-js segura um lock enquanto avisa os ouvintes: chamar o auth aqui dentro trava; daí o setTimeout. */
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') {
      setTimeout(() => sair(), 0);
    }
  });
  el.btnSair.addEventListener('click', () => sair());

  const perfil = await perfilOuSair();
  if (perfil === null) {
    return;
  }

  aplicarAparencia(aparenciaDoPerfil(perfil));
  document.body.removeAttribute('data-autenticando');
  if (perfil?.papel === 'admin' || perfil?.super_admin) {
    liberarTela('empresa');
    el.menuEmpresa.hidden = false;
    iniciarEmpresa(perfil);
  }
  iniciarNavegacao();

  /* Sem as jornadas, o banco seria calculado com o padrão e mostraria um histórico errado: falha igual ao histórico. */
  try {
    await carregarJornadas();
    await store.carregar();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('carregar o histórico', erro) + ' Recarregue a página para tentar de novo.');
    desligarBotoes();
    return;
  }

  iniciarPerfil({
    id: sessao.user.id,
    nome: perfil?.nome ?? '',
    email: perfil?.email || sessao.user.email,
    avatarPath: perfil?.avatar_path ?? null,
    aparencia: aparenciaDoPerfil(perfil),
  });
  iniciarPonto();
  iniciarMes();
  iniciarImportacao();
  iniciarTarefas({ id: sessao.user.id, empresaId: perfil?.empresa_id ?? null, ehAdm: perfil?.papel === 'admin' });
  iniciarPomodoro();

  window.addEventListener('pagehide', () => {
    store.enviarPendentesAoSair();
    gravarPomodoroAoSair();
  });
}

iniciar();
