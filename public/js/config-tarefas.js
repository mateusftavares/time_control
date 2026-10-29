import { STATUS } from '/shared/tarefas.js';
import { api } from './api.js';
import * as store from './tarefas-store.js';
import { elementos } from './util.js';

/* Aba Tarefas da tela Configurações (só o ADM): status em uso, bloco de commits e cadastro de clientes.
   Depois de cada mudança a store recarrega, e a tela de Tarefas acompanha. */

const OBRIGATORIOS = ['a_fazer', 'concluida'];

const el = elementos([
  'configStatus', 'configCommits', 'configSalvar', 'configEstado', 'clientesCorpo', 'clientesEstado',
]);

let carregou = false;

function estado(alvo, texto, tipo = '') {
  alvo.textContent = texto;
  alvo.className = `texto-mudo pequeno estado ${tipo}`;
}

function pintarConfiguracao() {
  const { status, usaCommits } = store.configuracao();
  el.configStatus.replaceChildren(...Object.entries(STATUS).map(([chave, rotulo]) => {
    const caixa = document.createElement('label');
    caixa.className = 'caixa';
    const marcador = document.createElement('input');
    marcador.type = 'checkbox';
    marcador.value = chave;
    marcador.checked = status.includes(chave) || OBRIGATORIOS.includes(chave);
    marcador.disabled = OBRIGATORIOS.includes(chave);
    const etiqueta = document.createElement('span');
    etiqueta.className = 'etiqueta-status';
    etiqueta.dataset.status = chave;
    etiqueta.textContent = rotulo;
    caixa.append(marcador, etiqueta);
    return caixa;
  }));
  el.configCommits.checked = usaCommits;
}

async function salvarConfiguracao() {
  const status = [...el.configStatus.querySelectorAll('input:checked')].map((marcador) => marcador.value);
  el.configSalvar.disabled = true;
  try {
    await api.salvarConfigDasTarefas(store.quemSou().empresaId, { status, usaCommits: el.configCommits.checked });
    await store.carregar();
    pintar();
    estado(el.configEstado, 'Configuração salva.', 'ok');
  } catch (erro) {
    estado(el.configEstado, `Não foi possível salvar: ${erro.message}.`, 'erro');
  } finally {
    el.configSalvar.disabled = false;
  }
}

function botao(rotulo, classe, aoClicar) {
  const elemento = document.createElement('button');
  elemento.type = 'button';
  elemento.className = `botao botao-pequeno ${classe}`;
  elemento.textContent = rotulo;
  elemento.addEventListener('click', aoClicar);
  return elemento;
}

function linhaDoCliente(cliente, tarefasDele) {
  const linha = document.createElement('form');
  linha.className = `cliente-linha${cliente.arquivado ? ' inativa' : ''}`;
  linha.noValidate = true;
  const nome = document.createElement('input');
  nome.value = cliente.nome;
  nome.maxLength = 80;
  nome.setAttribute('aria-label', `Nome do cliente ${cliente.nome}`);
  const uso = document.createElement('span');
  uso.className = 'texto-mudo pequeno';
  uso.textContent = `${tarefasDele} tarefa(s)${cliente.arquivado ? ' · arquivado' : ''}`;
  const renomear = document.createElement('button');
  renomear.type = 'submit';
  renomear.className = 'botao botao-pequeno botao-fantasma';
  renomear.textContent = 'Renomear';
  linha.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (nome.value.trim() && nome.value.trim() !== cliente.nome) {
      alterar(() => api.alterarCliente(cliente.id, { nome: nome.value }), 'Cliente renomeado.');
    }
  });
  linha.append(nome, uso, renomear,
    botao(cliente.arquivado ? 'Reativar' : 'Arquivar', 'botao-secundario',
      () => alterar(() => api.alterarCliente(cliente.id, { arquivado: !cliente.arquivado }),
        cliente.arquivado ? 'Cliente reativado.' : 'Cliente arquivado.')),
    botao('Apagar', 'botao-perigo', () => apagar(cliente, tarefasDele)));
  return linha;
}

function pintarClientes() {
  const contagem = new Map();
  store.listar().forEach((tarefa) => tarefa.clienteId && contagem.set(tarefa.clienteId, (contagem.get(tarefa.clienteId) ?? 0) + 1));
  const lista = store.todosOsClientes();
  el.clientesCorpo.replaceChildren(...lista.map((cliente) => linhaDoCliente(cliente, contagem.get(cliente.id) ?? 0)));
  if (!lista.length) {
    estado(el.clientesEstado, 'Nenhum cliente ainda: eles nascem quando alguém digita um cliente novo numa tarefa.');
  }
}

function pintar() {
  pintarConfiguracao();
  pintarClientes();
}

async function alterar(acao, mensagem) {
  try {
    await acao();
    await store.carregar();
    pintar();
    estado(el.clientesEstado, mensagem, 'ok');
  } catch (erro) {
    estado(el.clientesEstado, `Não foi possível: ${erro.message}.`, 'erro');
  }
}

function apagar(cliente, tarefasDele) {
  const aviso = tarefasDele
    ? ` ${tarefasDele} tarefa(s) ficam sem cliente no cadastro (o nome antigo continua escrito nelas). Para só esconder, use Arquivar.`
    : '';
  if (window.confirm(`Apagar o cliente "${cliente.nome}"?${aviso}`)) {
    alterar(() => api.apagarCliente(cliente.id), 'Cliente apagado.');
  }
}

/**
 * @description Pinta a aba na primeira vez que ela abre (carrega as tarefas se ainda não vieram)
 */
export async function abrirConfigTarefas() {
  if (carregou) {
    return;
  }
  carregou = true;
  try {
    if (!store.carregado()) {
      await store.carregar();
    }
    pintar();
  } catch (erro) {
    carregou = false;
    estado(el.configEstado, `Não foi possível carregar: ${erro.message}.`, 'erro');
  }
}

/**
 * @description Liga a aba Tarefas (só o ADM chega aqui); a store avisa quando as tarefas mudam
 */
export function iniciarConfigTarefas() {
  el.configSalvar.addEventListener('click', salvarConfiguracao);
  store.assinar(() => carregou && pintarClientes());
}
