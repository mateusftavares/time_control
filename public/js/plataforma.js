import { elementos } from './util.js';
import { chamarFuncao } from './funcoes.js';

/* Aba Todas as empresas (só o super ADM): criar empresa com o ADM, convidar, renomear, desativar e
   transferir o ADM. A função /api/empresas confere o super ADM e nunca devolve dados de trabalho. */

const ROTULO_PAPEL = { usuario: 'Usuário', admin: 'ADM' };

const el = elementos([
  'empresasCorpo', 'empresasEstado', 'empresasAtualizar',
  'novaEmpresaForm', 'novaEmpresaNome', 'novaEmpresaAdmNome', 'novaEmpresaAdmEmail', 'novaEmpresaEnviar', 'novaEmpresaEstado',
]);

let minhaEmpresa = null;
let carregou = false;
let ocupado = false;
const abertas = new Set();

const chamar = (pedido) => chamarFuncao('/api/empresas', pedido);

function texto(tag, conteudo, classe) {
  const elemento = document.createElement(tag);
  elemento.textContent = conteudo;
  if (classe) {
    elemento.className = classe;
  }
  return elemento;
}

function botao(rotulo, classe, aoClicar) {
  const elemento = texto('button', rotulo, `botao botao-pequeno ${classe}`);
  elemento.type = 'button';
  elemento.addEventListener('click', aoClicar);
  return elemento;
}

function situacaoDoMembro(membro) {
  if (!membro.ativo) {
    return texto('span', 'Inativo', 'situacao inativo');
  }
  return membro.convitePendente ? texto('span', 'Convidado', 'situacao pendente') : texto('span', 'Ativo', 'situacao ativo');
}

function linhaDoMembro(empresa, membro) {
  const linha = document.createElement('div');
  linha.className = 'membro-empresa';
  const email = texto('span', membro.email);
  email.title = membro.email;
  const acao = membro.papel !== 'admin' && membro.ativo
    ? botao('Tornar ADM', 'botao-fantasma', () => transferirAdm(empresa, membro))
    : document.createElement('span');
  linha.append(texto('span', membro.nome || '—'), email, texto('span', ROTULO_PAPEL[membro.papel] ?? membro.papel), situacaoDoMembro(membro), acao);
  return linha;
}

function formularioDeConvite(empresa) {
  const form = document.createElement('form');
  form.className = 'atribuir convite-empresa';
  form.noValidate = true;
  const nome = document.createElement('input');
  nome.maxLength = 100;
  nome.placeholder = 'Nome';
  nome.setAttribute('aria-label', `Nome do convidado para ${empresa.nome}`);
  const email = document.createElement('input');
  email.type = 'email';
  email.maxLength = 254;
  email.placeholder = 'E-mail';
  email.setAttribute('aria-label', `E-mail do convidado para ${empresa.nome}`);
  const enviar = texto('button', 'Convidar', 'botao botao-secundario botao-pequeno');
  enviar.type = 'submit';
  form.append(nome, email, enviar);
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    convidar(empresa, nome.value.trim(), email.value.trim());
  });
  return form;
}

function cabecaDaEmpresa(empresa) {
  const resumo = document.createElement('summary');
  const nome = texto('b', empresa.nome);
  const situacao = texto('span', empresa.ativa ? 'Ativa' : 'Desativada', `situacao ${empresa.ativa ? 'ativo' : 'inativo'}`);
  const adm = empresa.adm
    ? `ADM: ${empresa.adm.nome || empresa.adm.email}${empresa.adm.convitePendente ? ' (convite pendente)' : ''}`
    : 'sem ADM';
  resumo.append(nome, situacao, texto('span', `${adm} · ${empresa.membros.length} membro(s)`, 'texto-mudo pequeno'));
  return resumo;
}

function cartaoDaEmpresa(empresa) {
  const detalhes = document.createElement('details');
  detalhes.className = 'empresa-item';
  detalhes.open = abertas.has(empresa.id);
  detalhes.addEventListener('toggle', () => (detalhes.open ? abertas.add(empresa.id) : abertas.delete(empresa.id)));

  const acoes = document.createElement('div');
  acoes.className = 'empresa-item-acoes';
  acoes.append(botao('Renomear', 'botao-fantasma', () => renomear(empresa)));
  if (empresa.id !== minhaEmpresa) {
    acoes.append(empresa.ativa
      ? botao('Desativar', 'botao-perigo', () => alternarAtiva(empresa))
      : botao('Reativar', 'botao-secundario', () => alternarAtiva(empresa)));
  }

  const membros = document.createElement('div');
  membros.className = 'membros-empresa';
  membros.replaceChildren(...empresa.membros.map((membro) => linhaDoMembro(empresa, membro)));
  detalhes.append(cabecaDaEmpresa(empresa), acoes, membros, formularioDeConvite(empresa));
  return detalhes;
}

function pintarEstado(mensagem) {
  el.empresasEstado.textContent = mensagem;
  el.empresasEstado.hidden = !mensagem;
}

function travar(travado) {
  ocupado = travado;
  el.empresasCorpo.querySelectorAll('button, input').forEach((controle) => {
    controle.disabled = travado;
  });
  el.empresasAtualizar.disabled = travado;
}

async function carregar() {
  travar(true);
  pintarEstado('Carregando…');
  try {
    const { empresas } = await chamar({ acao: 'listar' });
    el.empresasCorpo.replaceChildren(...empresas.map(cartaoDaEmpresa));
    pintarEstado(empresas.length ? '' : 'Nenhuma empresa.');
    carregou = true;
  } catch (erro) {
    pintarEstado(`Não foi possível listar as empresas: ${erro.message}.`);
  } finally {
    travar(false);
  }
}

/* Executa a ação e recarrega a lista; erro vira alerta. Devolve se deu certo. */
async function executar(pedido, acao) {
  if (ocupado) {
    return false;
  }
  travar(true);
  try {
    await chamar(pedido);
    return true;
  } catch (erro) {
    window.alert(`Não foi possível ${acao}: ${erro.message}.`);
    return false;
  } finally {
    await carregar();
  }
}

function renomear(empresa) {
  const nome = window.prompt('Novo nome da empresa:', empresa.nome);
  if (nome !== null && nome.trim() && nome.trim() !== empresa.nome) {
    executar({ acao: 'renomear', empresaId: empresa.id, nomeEmpresa: nome.trim() }, 'renomear a empresa');
  }
}

function alternarAtiva(empresa) {
  const pergunta = empresa.ativa
    ? `Desativar "${empresa.nome}"? Todos os ${empresa.membros.length} membro(s) perdem o acesso na hora. Os dados ficam guardados.`
    : `Reativar "${empresa.nome}"? Os membros ativos voltam a entrar.`;
  if (window.confirm(pergunta)) {
    executar({ acao: empresa.ativa ? 'desativar' : 'reativar', empresaId: empresa.id }, empresa.ativa ? 'desativar' : 'reativar');
  }
}

async function transferirAdm(empresa, membro) {
  const daMinha = empresa.id === minhaEmpresa;
  if (!window.confirm(`Tornar ${membro.email} o ADM de "${empresa.nome}"? O ADM atual passa a usuário.`
    + (daMinha ? ' É a sua empresa: se o ADM for você, a página recarrega sem as abas de ADM.' : ''))) {
    return;
  }
  const deuCerto = await executar({ acao: 'transferirAdm', empresaId: empresa.id, id: membro.id }, 'transferir o papel de ADM');
  if (deuCerto && daMinha) {
    location.reload();
  }
}

function convidar(empresa, nome, email) {
  if (!email) {
    window.alert('Informe o e-mail do convidado.');
    return;
  }
  executar({ acao: 'convidar', empresaId: empresa.id, nome, email }, 'convidar');
}

function pintarNovaEmpresa(mensagem, classe = '') {
  el.novaEmpresaEstado.textContent = mensagem;
  el.novaEmpresaEstado.className = `texto-mudo pequeno ${classe}`;
}

async function criarEmpresa(evento) {
  evento.preventDefault();
  const nomeEmpresa = el.novaEmpresaNome.value.trim();
  const email = el.novaEmpresaAdmEmail.value.trim();
  if (!nomeEmpresa || !email || !el.novaEmpresaAdmEmail.checkValidity()) {
    pintarNovaEmpresa('Informe o nome da empresa e um e-mail válido para o ADM.', 'erro');
    return;
  }
  el.novaEmpresaEnviar.disabled = true;
  pintarNovaEmpresa('Criando…');
  try {
    await chamar({ acao: 'criar', nomeEmpresa, email, nome: el.novaEmpresaAdmNome.value.trim() });
    pintarNovaEmpresa(`Empresa criada e convite enviado para ${email}.`, 'ok');
    el.novaEmpresaForm.reset();
    await carregar();
  } catch (erro) {
    pintarNovaEmpresa(`Não foi possível criar: ${erro.message}.`, 'erro');
  } finally {
    el.novaEmpresaEnviar.disabled = false;
  }
}

/**
 * @description Carrega a lista na primeira vez que a aba abre
 */
export function abrirPlataforma() {
  if (!carregou && !ocupado) {
    carregar();
  }
}

/**
 * @description Liga a aba Todas as empresas (só o super ADM chega aqui)
 * @param {{empresa_id: string}} perfil - o super ADM logado
 */
export function iniciarPlataforma(perfil) {
  minhaEmpresa = perfil.empresa_id;
  el.empresasAtualizar.addEventListener('click', carregar);
  el.novaEmpresaForm.addEventListener('submit', criarEmpresa);
}
