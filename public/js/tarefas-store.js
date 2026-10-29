import { hoje } from '/shared/tempo.js';
import { proximaOcorrencia, compararTarefas } from '/shared/tarefas.js';
import { api } from './api.js';
import { mostrarAviso, esconderAviso, avisoDeFalha } from './aviso.js';

/* Fonte única das tarefas da empresa: a tela de Tarefas, o bloco do Hoje e o pomodoro leem daqui.
   Toda gravação passa pelo servidor antes de mudar o mapa, então a tela nunca mostra o que não foi salvo.
   Junto ficam os clientes, os colegas (para o responsável) e a configuração das tarefas na empresa. */
const STATUS_PADRAO = ['a_fazer', 'em_andamento', 'aguardando', 'concluida'];

const tarefas = new Map();
const clientes = new Map();
const ouvintes = new Set();
const ouvintesDoFoco = new Set();
let jaCarregou = false;
let colegas = [];
let config = { status: STATUS_PADRAO, usaCommits: false };
let sessao = { id: null, empresaId: null, ehAdm: false };

function notificar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

/**
 * @description Registra quem quer saber das mudanças
 * @param {() => void} ouvinte
 */
export function assinar(ouvinte) {
  ouvintes.add(ouvinte);
}

/**
 * @description Avisa só quando o foco de uma tarefa é somado (a cada ~5 s com o pomodoro rodando).
 *   Canal separado: repintar as telas nesse ritmo fecharia selects abertos e cortaria o arraste do Kanban
 * @param {(id: string) => void} ouvinte
 */
export function assinarFoco(ouvinte) {
  ouvintesDoFoco.add(ouvinte);
}

/**
 * @description Tarefa pelo id, ou null
 * @param {string|null} id
 * @returns {object|null}
 */
export function obter(id) {
  return (id && tarefas.get(id)) ?? null;
}

/**
 * @description Todas as tarefas, na ordem de trabalho
 * @returns {object[]}
 */
export function listar() {
  return [...tarefas.values()].sort(compararTarefas);
}

/**
 * @description Tarefas da empresa que estão com o usuário logado (responsável), na ordem de trabalho
 * @returns {object[]}
 */
export function minhas() {
  return listar().filter((tarefa) => tarefa.responsavelId === sessao.id);
}

/**
 * @description Tarefas abertas do usuário logado, na ordem de trabalho (para o pomodoro)
 * @returns {object[]}
 */
export function abertas() {
  return minhas().filter((tarefa) => tarefa.status !== 'concluida');
}

/**
 * @description Define quem está logado (antes de carregar): id, empresa e se é o ADM
 * @param {{id: string, empresaId: string, ehAdm: boolean}} dados
 */
export function definirSessao(dados) {
  sessao = { ...dados };
}

/** @returns {{id: string|null, empresaId: string|null, ehAdm: boolean}} */
export function quemSou() {
  return sessao;
}

/** @returns {{status: string[], usaCommits: boolean}} configuração das tarefas na empresa */
export function configuracao() {
  return config;
}

/** @returns {Array<{id: string, nome: string}>} colegas ativos da empresa */
export function listarColegas() {
  return colegas;
}

/**
 * @description Nome de um colega pelo id ('' quando não é colega ativo)
 * @param {string|null} id
 * @returns {string}
 */
export function nomeDoColega(id) {
  return colegas.find((colega) => colega.id === id)?.nome ?? '';
}

/** @returns {object[]} todos os clientes da empresa, arquivados inclusive, por nome */
export function todosOsClientes() {
  return [...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** @returns {object[]} clientes não arquivados, por nome */
export function clientesAtivos() {
  return [...clientes.values()].filter((cliente) => !cliente.arquivado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* O nome que aparece é o do cadastro: renomear o cliente vale para as tarefas sem regravar cada uma. */
function comNomeDoCliente(tarefa) {
  const cadastrado = tarefa.clienteId && clientes.get(tarefa.clienteId);
  return cadastrado ? { ...tarefa, cliente: cadastrado.nome } : tarefa;
}

/**
 * @description Recarrega tudo do servidor: tarefas, clientes, colegas e configuração
 */
export async function carregar() {
  // sem empresa (ex.: super ADM fora de uma) a RLS não devolve nada: fica a configuração padrão
  const [lista, listaDeClientes, listaDeColegas, configDaEmpresa] = await Promise.all([
    api.listarTarefas(), api.listarClientes(), api.listarColegas(),
    sessao.empresaId ? api.configDasTarefas(sessao.empresaId) : { status: STATUS_PADRAO, usaCommits: false },
  ]);
  clientes.clear();
  listaDeClientes.forEach((cliente) => clientes.set(cliente.id, cliente));
  colegas = listaDeColegas;
  config = configDaEmpresa;
  tarefas.clear();
  lista.forEach((tarefa) => tarefas.set(tarefa.id, comNomeDoCliente(tarefa)));
  jaCarregou = true;
  notificar();
}

/**
 * @description As tarefas já vieram do servidor ao menos uma vez (antes disso, "não achei" não quer dizer "apagada")
 * @returns {boolean}
 */
export function carregado() {
  return jaCarregou;
}

/* O cliente é digitado pelo nome: acha no cadastro (sem diferenciar maiúsculas) ou cria um novo. */
async function clienteDoNome(nome) {
  const limpo = String(nome ?? '').trim();
  if (!limpo) {
    return null;
  }
  const chave = limpo.toLocaleLowerCase('pt-BR');
  const existente = [...clientes.values()].find((cliente) => cliente.nome.trim().toLocaleLowerCase('pt-BR') === chave);
  if (existente) {
    return existente;
  }
  try {
    const criado = await api.criarCliente(limpo);
    clientes.set(criado.id, criado);
    return criado;
  } catch (erro) {
    // outra pessoa criou o mesmo cliente no meio tempo (nome único na empresa): relê e usa o dela
    (await api.listarClientes()).forEach((cliente) => clientes.set(cliente.id, cliente));
    const criadoPorOutro = [...clientes.values()].find((cliente) => cliente.nome.trim().toLocaleLowerCase('pt-BR') === chave);
    if (criadoPorOutro) {
      return criadoPorOutro;
    }
    throw erro;
  }
}

async function gravar(tarefa) {
  const cliente = await clienteDoNome(tarefa.cliente);
  const gravada = comNomeDoCliente(await api.salvarTarefa({
    ...tarefa, cliente: cliente?.nome ?? '', clienteId: cliente?.id ?? null,
  }));
  tarefas.set(gravada.id, gravada);
  esconderAviso();
  notificar();
  return gravada;
}

/**
 * @description Grava a tarefa; ao virar concluída, uma tarefa recorrente já ganha a próxima ocorrência.
 *   Erro de validação ou do servidor sobe para a tela mostrar
 * @param {object} tarefa
 * @returns {Promise<object>} a versão gravada
 */
export async function salvar(tarefa) {
  const estavaConcluida = obter(tarefa.id)?.status === 'concluida';
  const gravada = await gravar(tarefa);
  const proxima = !estavaConcluida && gravada.status === 'concluida' ? proximaOcorrencia(gravada, hoje()) : null;
  if (proxima && !ocorrenciaJaExiste(proxima)) {
    try {
      await gravar(proxima);
    } catch (erro) {
      mostrarAviso(avisoDeFalha(`criar a próxima ocorrência de "${gravada.titulo}" (a tarefa foi concluída)`, erro));
    }
  }
  return gravada;
}

/* Concluir, reabrir e concluir de novo não pode criar a mesma ocorrência duas vezes. As tarefas são da
   empresa: a mesma recorrente de outra pessoa (outro responsável) não conta. */
function ocorrenciaJaExiste(proxima) {
  return [...tarefas.values()].some((tarefa) => tarefa.status !== 'concluida'
    && tarefa.responsavelId === proxima.responsavelId
    && tarefa.titulo === proxima.titulo && tarefa.cliente === proxima.cliente
    && tarefa.recorrencia === proxima.recorrencia && tarefa.prazo === proxima.prazo);
}

/**
 * @description Muda só o status da tarefa (concluir, reabrir, mover no Kanban)
 * @param {string} id
 * @param {string} status
 */
export async function mudarStatus(id, status) {
  const atual = obter(id);
  if (atual && atual.status !== status) {
    await salvar({ ...atual, status });
  }
}

/**
 * @description Apaga a tarefa no servidor e na tela
 * @param {string} id
 */
export async function apagar(id) {
  await api.apagarTarefa(id);
  tarefas.delete(id);
  notificar();
}

/**
 * @description Soma o foco do pomodoro na tarefa; falha só avisa, para não travar o relógio
 * @param {string} id
 * @param {number} ms
 * @param {number} pomodoros
 * @returns {Promise<boolean>} false quando o envio falhou e o lote deve voltar para o pendente
 */
export async function somarFoco(id, ms, pomodoros) {
  if (!obter(id) || (ms <= 0 && pomodoros <= 0)) {
    return true;
  }
  try {
    await api.somarFoco(id, ms, pomodoros);
  } catch (erro) {
    mostrarAviso(avisoDeFalha('somar o foco na tarefa', erro));
    return false;
  }
  const atual = obter(id);
  if (atual) {
    tarefas.set(id, { ...atual, focoMs: atual.focoMs + ms, pomodoros: atual.pomodoros + pomodoros });
    ouvintesDoFoco.forEach((ouvinte) => ouvinte(id));
  }
  return true;
}
