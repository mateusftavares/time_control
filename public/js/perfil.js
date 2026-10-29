import { hoje } from '/shared/tempo.js';
import {
  jornadaDe, definirJornadas, resumoDaJornada, versoesEfetivas,
} from '/shared/jornada.js';
import { api } from './api.js';
import { supabase } from './supabase.js';
import * as store from './registros.js';
import { elementos } from './util.js';
import { PREFERENCIAS, aplicarPreferencia } from './aparencia.js';

const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024;
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const LADO_DA_FOTO_PX = 256;
const QUALIDADE_DA_FOTO = 0.88;
const SENHA_MINIMA = 8;

const el = elementos([
  'navAvatar', 'perfilAvatar', 'perfilSub', 'fotoArquivo', 'fotoRemover',
  'formNome', 'perfilNome', 'nomeSalvar', 'perfilEstado',
  'aparencia', 'aparenciaEstado',
  'formTrocarSenha', 'senhaUsuario', 'senhaAtual', 'senhaNova', 'senhaConfirma', 'senhaSalvar', 'senhaEstado',
  'minhaJornada',
]);

let perfil = null;

function estado(alvo, texto, tipo = '') {
  alvo.textContent = texto;
  alvo.className = `texto-mudo pequeno estado ${tipo}`;
}

function dataCurta(dia) {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/* ---------- foto e nome ---------- */

function pintarAvatar(alvo, url) {
  const inicial = (perfil.nome || perfil.email || '?').trim().charAt(0) || '?';
  if (!url) {
    alvo.replaceChildren(document.createTextNode(inicial));
    return;
  }
  const imagem = document.createElement('img');
  imagem.alt = '';
  imagem.src = url;
  imagem.addEventListener('error', () => alvo.replaceChildren(document.createTextNode(inicial)));
  alvo.replaceChildren(imagem);
}

async function pintarFotos() {
  const url = await api.urlDaFoto(perfil.avatarPath);
  pintarAvatar(el.navAvatar, url);
  pintarAvatar(el.perfilAvatar, url);
  el.fotoRemover.hidden = !perfil.avatarPath;
}

/* Recorta no centro e redesenha em JPEG: a foto fica pequena e perde o EXIF (que pode trazer a localização). */
async function reduzirFoto(arquivo) {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = LADO_DA_FOTO_PX;
  tela.height = LADO_DA_FOTO_PX;
  tela.getContext('2d').drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado,
    0, 0, LADO_DA_FOTO_PX, LADO_DA_FOTO_PX);
  bitmap.close();
  return new Promise((resolver, rejeitar) => {
    tela.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('não deu para ler a imagem'))), 'image/jpeg', QUALIDADE_DA_FOTO);
  });
}

async function trocarFoto() {
  const [arquivo] = el.fotoArquivo.files;
  el.fotoArquivo.value = '';
  if (!arquivo) {
    return;
  }
  if (!TIPOS_DE_FOTO.includes(arquivo.type)) {
    estado(el.perfilEstado, 'Use uma imagem JPEG, PNG ou WebP.', 'erro');
    return;
  }
  if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO) {
    estado(el.perfilEstado, 'A imagem passa de 2 MB.', 'erro');
    return;
  }

  estado(el.perfilEstado, 'Enviando a foto…');
  try {
    perfil.avatarPath = await api.enviarFoto(await reduzirFoto(arquivo));
    await pintarFotos();
    estado(el.perfilEstado, 'Foto atualizada.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível trocar a foto: ${erro.message}.`, 'erro');
  }
}

async function removerFoto() {
  if (!window.confirm('Remover a sua foto?')) {
    return;
  }
  try {
    await api.removerFoto();
    perfil.avatarPath = null;
    await pintarFotos();
    estado(el.perfilEstado, 'Foto removida.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível remover a foto: ${erro.message}.`, 'erro');
  }
}

async function salvarNome(evento) {
  evento.preventDefault();
  el.nomeSalvar.disabled = true;
  try {
    perfil.nome = await api.salvarNome(el.perfilNome.value);
    el.perfilNome.value = perfil.nome;
    await pintarFotos();
    estado(el.perfilEstado, 'Nome salvo.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível salvar o nome: ${erro.message}.`, 'erro');
  } finally {
    el.nomeSalvar.disabled = false;
  }
}

/* ---------- aparência: cor de destaque, cartões e fundo ---------- */

const grupoDaPreferencia = (chave) => el.aparencia.querySelector(`[data-preferencia="${chave}"]`);

function pintarPreferencia(chave) {
  grupoDaPreferencia(chave).querySelectorAll('button').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.valor === perfil.aparencia[chave]));
  });
}

function botaoDeOpcao(chave, { valor, nome }) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.dataset.valor = valor;
  if (chave === 'cor') {
    const amostra = document.createElement('span');
    botao.className = 'cor-opcao';
    amostra.className = 'cor-amostra';
    amostra.setAttribute('aria-hidden', 'true');
    botao.append(amostra);
  }
  botao.append(nome);
  botao.addEventListener('click', () => trocarPreferencia(chave, valor));
  return botao;
}

function montarAparencia() {
  Object.entries(PREFERENCIAS).forEach(([chave, { opcoes }]) => {
    grupoDaPreferencia(chave).replaceChildren(...opcoes.map((opcao) => botaoDeOpcao(chave, opcao)));
    pintarPreferencia(chave);
  });
}

async function trocarPreferencia(chave, valor) {
  const anterior = perfil.aparencia[chave];
  if (valor === anterior) {
    return;
  }
  perfil.aparencia[chave] = valor;
  aplicarPreferencia(chave, valor);
  pintarPreferencia(chave);
  try {
    await api.salvarPreferencia(chave, valor);
    estado(el.aparenciaEstado, 'Aparência salva.', 'ok');
  } catch (erro) {
    perfil.aparencia[chave] = anterior;
    aplicarPreferencia(chave, anterior);
    pintarPreferencia(chave);
    estado(el.aparenciaEstado, `Não foi possível salvar a aparência: ${erro.message}.`, 'erro');
  }
}

/* ---------- senha ---------- */

/* O supabase-js 2.45 não confere a senha atual no updateUser: um login com ela prova que é o dono. */
async function trocarSenha(evento) {
  evento.preventDefault();
  const [atual, nova, confirma] = [el.senhaAtual.value, el.senhaNova.value, el.senhaConfirma.value];
  if (!atual) {
    estado(el.senhaEstado, 'Informe a senha atual.', 'erro');
    return;
  }
  if (nova.length < SENHA_MINIMA) {
    estado(el.senhaEstado, `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, 'erro');
    return;
  }
  if (nova !== confirma) {
    estado(el.senhaEstado, 'As duas senhas novas não são iguais.', 'erro');
    return;
  }
  if (nova === atual) {
    estado(el.senhaEstado, 'A nova senha precisa ser diferente da atual.', 'erro');
    return;
  }

  el.senhaSalvar.disabled = true;
  estado(el.senhaEstado, 'Conferindo…');
  try {
    const conferida = await supabase.auth.signInWithPassword({ email: perfil.email, password: atual });
    if (conferida.error) {
      estado(el.senhaEstado, conferida.error.status === 429 ? 'Muitas tentativas. Espere alguns minutos.' : 'Senha atual incorreta.', 'erro');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      estado(el.senhaEstado, `Não foi possível trocar a senha: ${error.message}.`, 'erro');
      return;
    }
    el.formTrocarSenha.reset();
    el.senhaUsuario.value = perfil.email;
    estado(el.senhaEstado, 'Senha trocada.', 'ok');
  } finally {
    el.senhaSalvar.disabled = false;
  }
}

/* ---------- jornada (só leitura: quem altera é o ADM da empresa) ---------- */

let minhasAtribuicoes = [];

function pintarMinhaJornada() {
  const atual = minhasAtribuicoes.filter((atribuicao) => atribuicao.desde <= hoje()).at(-1);
  const vigente = jornadaDe(hoje());
  const titulo = document.createElement('b');
  titulo.textContent = atual ? `${atual.nome} · desde ${dataCurta(atual.desde)}` : 'Sem jornada atribuída: vale o padrão';
  const resumo = document.createElement('span');
  resumo.className = 'texto-secundario';
  resumo.textContent = resumoDaJornada(vigente);
  const historico = minhasAtribuicoes.length > 1 || (minhasAtribuicoes.length === 1 && !atual)
    ? minhasAtribuicoes.map((atribuicao) => {
      const item = document.createElement('li');
      item.textContent = `${atribuicao.nome} · desde ${dataCurta(atribuicao.desde)}`;
      return item;
    })
    : [];
  const lista = document.createElement('ul');
  lista.className = 'minha-jornada-historico texto-mudo pequeno';
  lista.replaceChildren(...historico);
  el.minhaJornada.replaceChildren(titulo, resumo, ...(historico.length ? [lista] : []));
}

/**
 * @description Carrega as jornadas atribuídas ao usuário logado; as regras do banco passam a usá-las
 */
export async function carregarJornadas() {
  const { atribuicoes, versoesPorModelo } = await api.minhaJornada();
  minhasAtribuicoes = atribuicoes;
  definirJornadas(versoesEfetivas(atribuicoes, versoesPorModelo));
  if (perfil) {
    pintarMinhaJornada();
  }
}

/**
 * @description Recarrega a jornada do usuário logado e recalcula o banco (depois que o ADM muda jornadas)
 */
export async function recarregarMinhaJornada() {
  await carregarJornadas();
  store.recalcular();
}

/**
 * @description Liga a tela Meu perfil (nome, foto, senha, aparência, jornada) e o avatar da navegação
 * @param {{id: string, nome: string, email: string, avatarPath: string|null}} dados
 */
export function iniciarPerfil(dados) {
  perfil = { ...dados, aparencia: { ...dados.aparencia } };
  el.perfilSub.textContent = perfil.email;
  el.perfilNome.value = perfil.nome;
  el.senhaUsuario.value = perfil.email;
  pintarAvatar(el.navAvatar, null);
  pintarAvatar(el.perfilAvatar, null);
  pintarFotos();
  montarAparencia();

  el.fotoArquivo.addEventListener('change', trocarFoto);
  el.fotoRemover.addEventListener('click', removerFoto);
  el.formNome.addEventListener('submit', salvarNome);
  el.formTrocarSenha.addEventListener('submit', trocarSenha);
  pintarMinhaJornada();
}
