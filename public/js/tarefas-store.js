import { hoje } from '/shared/tempo.js';
import { proximaOcorrencia, compararTarefas } from '/shared/tarefas.js';
import { api } from './api.js';
import { mostrarAviso, esconderAviso, avisoDeFalha } from './aviso.js';

/* Fonte única das tarefas: a tela de Tarefas, o bloco do Hoje e o pomodoro leem daqui.
   Toda gravação passa pelo servidor antes de mudar o mapa, então a tela nunca mostra o que não foi salvo. */
const tarefas = new Map();
const ouvintes = new Set();
const ouvintesDoFoco = new Set();
let jaCarregou = false;

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
 * @description Tarefas ainda abertas, na ordem de trabalho
 * @returns {object[]}
 */
export function abertas() {
  return listar().filter((tarefa) => tarefa.status !== 'concluida');
}

/**
 * @description Recarrega tudo do servidor
 */
export async function carregar() {
  const lista = await api.listarTarefas();
  tarefas.clear();
  lista.forEach((tarefa) => tarefas.set(tarefa.id, tarefa));
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

async function gravar(tarefa) {
  const gravada = await api.salvarTarefa(tarefa);
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

/* Concluir, reabrir e concluir de novo não pode criar a mesma ocorrência duas vezes. */
function ocorrenciaJaExiste(proxima) {
  return [...tarefas.values()].some((tarefa) => tarefa.status !== 'concluida'
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
