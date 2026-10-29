import { elementos } from './util.js';
import { tokenAtual, sair } from './sessao.js';
import { aoTrocarDeTela, telaAtual } from './navegacao.js';

const ENDERECO = '/api/usuarios';
const ROTULO_PAPEL = { usuario: 'Usuário', admin: 'ADM' };
const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const el = elementos([
  'usuariosCorpo', 'usuariosEstado', 'usuariosAtualizar',
  'conviteForm', 'conviteNome', 'conviteEmail', 'conviteEnviar', 'conviteEstado', 'usuariosEmpresa',
]);

let idDoAdmin = null;
let carregou = false;
let ocupado = false;

/**
 * @description Chama a função de servidor de usuários (Netlify), que confere se quem chama é admin ativo
 * @param {object} pedido - { acao, ... }
 * @returns {Promise<object>}
 */
async function chamar(pedido) {
  let resposta;
  try {
    resposta = await fetch(ENDERECO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAtual()}` },
      body: JSON.stringify(pedido),
    });
  } catch {
    throw new Error('a função de usuários não respondeu');
  }

  const dados = await resposta.json().catch(() => null);
  if (resposta.status === 401) {
    sair('expirada');
  }
  if (!resposta.ok) {
    throw new Error(dados?.erro ?? `HTTP ${resposta.status}`);
  }
  return dados;
}

function texto(tag, conteudo, classe) {
  const elemento = document.createElement(tag);
  elemento.textContent = conteudo;
  if (classe) {
    elemento.className = classe;
  }
  return elemento;
}

function celulaNome(usuario) {
  const celula = texto('span', usuario.nome || '—');
  celula.title = usuario.nome;
  if (usuario.id === idDoAdmin) {
    celula.append(texto('span', '(você)', 'usuario-voce'));
  }
  return celula;
}

function celulaPapel(usuario) {
  const seletor = document.createElement('select');
  seletor.setAttribute('aria-label', `Papel de ${usuario.email}`);
  Object.entries(ROTULO_PAPEL).forEach(([valor, rotulo]) => {
    const opcao = texto('option', rotulo);
    opcao.value = valor;
    opcao.selected = valor === usuario.papel;
    seletor.append(opcao);
  });
  // o ADM só deixa de ser ADM promovendo outro membro (transferência)
  seletor.dataset.travado = String(usuario.papel === 'admin' || !usuario.ativo);
  seletor.disabled = seletor.dataset.travado === 'true';
  seletor.addEventListener('change', () => alterarPapel(usuario, seletor));
  return seletor;
}

function celulaSituacao(usuario) {
  if (!usuario.ativo) {
    return texto('span', 'Inativo', 'situacao inativo');
  }
  return usuario.convitePendente ? texto('span', 'Convidado', 'situacao pendente') : texto('span', 'Ativo', 'situacao ativo');
}

function celulaAcao(usuario) {
  const botao = texto('button', usuario.ativo ? 'Desativar' : 'Reativar',
    `botao botao-pequeno ${usuario.ativo ? 'botao-perigo' : 'botao-secundario'}`);
  botao.type = 'button';
  botao.addEventListener('click', () => alternarAtivo(usuario));
  return botao;
}

function linhaDoUsuario(usuario) {
  const linha = document.createElement('div');
  linha.className = 'linha-usuario';

  const email = texto('span', usuario.email);
  email.title = usuario.email;
  const ultimoAcesso = usuario.ultimoAcesso ? FORMATO_DATA_HORA.format(new Date(usuario.ultimoAcesso)) : 'nunca';

  linha.append(celulaNome(usuario), email, celulaPapel(usuario), celulaSituacao(usuario),
    texto('span', ultimoAcesso, 'mono texto-secundario'), celulaAcao(usuario));
  return linha;
}

function pintarEstado(mensagem) {
  el.usuariosEstado.textContent = mensagem;
  el.usuariosEstado.hidden = !mensagem;
}

function travar(travado) {
  ocupado = travado;
  el.usuariosCorpo.querySelectorAll('button, select').forEach((controle) => {
    controle.disabled = travado || controle.dataset.travado === 'true';
  });
  el.usuariosAtualizar.disabled = travado;
}

async function carregar() {
  travar(true);
  pintarEstado('Carregando…');
  try {
    const { usuarios } = await chamar({ acao: 'listar' });
    el.usuariosCorpo.replaceChildren(...usuarios.map(linhaDoUsuario));
    pintarEstado(usuarios.length ? '' : 'Nenhum usuário.');
    carregou = true;
  } catch (erro) {
    pintarEstado(`Não foi possível listar os usuários: ${erro.message}.`);
  } finally {
    travar(false);
  }
}

async function executarEAtualizar(pedido, acao) {
  if (ocupado) {
    return;
  }
  travar(true);
  try {
    await chamar(pedido);
  } catch (erro) {
    window.alert(`Não foi possível ${acao}: ${erro.message}.`);
  }
  await carregar();
}

/* A empresa tem um ADM só: promover alguém é transferir, e quem transferiu perde a tela de Usuários. */
async function alterarPapel(usuario, seletor) {
  const papel = seletor.value;
  const confirmou = papel === 'admin' && window.confirm(
    `Transferir o papel de ADM para ${usuario.email}? Você passa a ser usuário e deixa de gerenciar a empresa.`);
  if (!confirmou || ocupado) {
    seletor.value = usuario.papel;
    return;
  }
  travar(true);
  try {
    await chamar({ acao: 'alterarPapel', id: usuario.id, papel });
    location.reload();
  } catch (erro) {
    window.alert(`Não foi possível transferir o papel: ${erro.message}.`);
    await carregar();
  }
}

function alternarAtivo(usuario) {
  const pergunta = usuario.ativo
    ? `Desativar ${usuario.email}? O acesso é cortado na hora e o login fica bloqueado. Os dados ficam guardados.`
    : `Reativar ${usuario.email}?`;
  if (window.confirm(pergunta)) {
    executarEAtualizar({ acao: usuario.ativo ? 'desativar' : 'reativar', id: usuario.id },
      usuario.ativo ? 'desativar' : 'reativar');
  }
}

function pintarConvite(mensagem, classe = '') {
  el.conviteEstado.textContent = mensagem;
  el.conviteEstado.className = `texto-mudo pequeno ${classe}`;
}

async function convidar(evento) {
  evento.preventDefault();
  if (!el.conviteEmail.checkValidity() || !el.conviteEmail.value.trim()) {
    pintarConvite('Informe um e-mail válido.', 'erro');
    el.conviteEmail.focus();
    return;
  }

  el.conviteEnviar.disabled = true;
  pintarConvite('Enviando…');
  try {
    await chamar({
      acao: 'convidar',
      nome: el.conviteNome.value.trim(),
      email: el.conviteEmail.value.trim(),
    });
    pintarConvite(`Convite enviado para ${el.conviteEmail.value.trim()}.`, 'ok');
    el.conviteForm.reset();
    await carregar();
  } catch (erro) {
    pintarConvite(`Não foi possível convidar: ${erro.message}.`, 'erro');
  } finally {
    el.conviteEnviar.disabled = false;
  }
}

/**
 * @description Liga a tela de Usuários (só o ADM da empresa); a lista carrega na primeira vez que a tela abre
 * @param {{id: string, empresas: {nome: string}}} perfil - o ADM logado
 */
export function iniciarUsuarios(perfil) {
  idDoAdmin = perfil.id;
  el.usuariosEmpresa.textContent = perfil.empresas.nome;
  el.usuariosAtualizar.addEventListener('click', carregar);
  el.conviteForm.addEventListener('submit', convidar);

  aoTrocarDeTela((tela) => {
    if (tela === 'usuarios' && !carregou && !ocupado) {
      carregar();
    }
  });
  if (telaAtual() === 'usuarios') {
    carregar();
  }
}
