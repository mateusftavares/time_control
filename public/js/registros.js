import { api } from './api.js';
import { mostrarAviso, esconderAviso, avisoDeFalha } from './aviso.js';

/* Fonte única dos dias na tela: ponto e banco de horas leem e escrevem aqui, e o servidor
   é atualizado por trás. Quem assina recebe { dia, origem } a cada mudança. */
const registros = new Map();
const ouvintes = new Set();
const gravacoesAdiadas = new Map();
const ESPERA_DIGITACAO_MS = 800;

function notificar(mudanca) {
  ouvintes.forEach((ouvinte) => ouvinte(mudanca));
}

async function enviar(registro, opcoes) {
  try {
    await api.salvarDia(registro, opcoes);
    esconderAviso();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('salvar o dia ' + registro.dia, erro));
  }
}

function cancelarGravacaoAdiada(dia) {
  clearTimeout(gravacoesAdiadas.get(dia));
  gravacoesAdiadas.delete(dia);
}

/**
 * @description Registra quem quer saber das mudanças
 * @param {(mudanca: {dia: string|null, origem: string}) => void} ouvinte - dia null quando tudo foi recarregado
 */
export function assinar(ouvinte) {
  ouvintes.add(ouvinte);
}

/**
 * @description Registro de um dia, ou null
 * @param {string} dia - AAAA-MM-DD
 */
export function obter(dia) {
  return registros.get(dia) ?? null;
}

/**
 * @description Todos os registros carregados, por dia
 * @returns {Map<string, object>}
 */
export function todos() {
  return registros;
}

/**
 * @description Recarrega todos os dias do servidor; dias com gravação ainda pendente ficam com a versão da tela
 */
export async function carregar() {
  const lista = await api.listarDias();
  const pendentes = [...gravacoesAdiadas.keys()].map((dia) => registros.get(dia)).filter(Boolean);

  registros.clear();
  lista.forEach((registro) => registros.set(registro.dia, registro));
  pendentes.forEach((registro) => registros.set(registro.dia, registro));
  notificar({ dia: null, origem: 'servidor' });
}

/**
 * @description Grava um dia na hora
 * @param {object} registro
 * @param {string} origem - quem pediu, para o próprio módulo não reagir à sua mudança
 */
export async function salvar(registro, origem) {
  cancelarGravacaoAdiada(registro.dia);
  registros.set(registro.dia, registro);
  notificar({ dia: registro.dia, origem });
  await enviar(registro);
}

/**
 * @description Atualiza a tela na hora e junta rajadas de digitação numa gravação só
 * @param {object} registro
 * @param {string} origem
 */
export function salvarAdiado(registro, origem) {
  registros.set(registro.dia, registro);
  notificar({ dia: registro.dia, origem });

  clearTimeout(gravacoesAdiadas.get(registro.dia));
  gravacoesAdiadas.set(registro.dia, setTimeout(() => {
    gravacoesAdiadas.delete(registro.dia);
    const atual = registros.get(registro.dia);
    if (atual) {
      enviar(atual);
    }
  }, ESPERA_DIGITACAO_MS));
}

/**
 * @description Manda já as gravações adiadas; para o `pagehide`, quando a aba está fechando
 */
export function enviarPendentesAoSair() {
  [...gravacoesAdiadas.keys()].forEach((dia) => {
    cancelarGravacaoAdiada(dia);
    const registro = registros.get(dia);
    if (registro) {
      enviar(registro, { keepalive: true });
    }
  });
}

/**
 * @description Apaga o registro de um dia
 * @param {string} dia
 * @param {string} origem
 */
export async function apagar(dia, origem) {
  cancelarGravacaoAdiada(dia);
  registros.delete(dia);
  notificar({ dia, origem });

  try {
    await api.apagarDia(dia);
    esconderAviso();
  } catch (erro) {
    if (erro.status !== 404) {
      mostrarAviso(avisoDeFalha('apagar o dia ' + dia, erro));
    }
  }
}

/**
 * @description Grava vários dias de uma vez (importação) e recarrega do servidor
 * @param {object[]} lista
 * @param {boolean} sobrescrever - substitui os dias que já existem
 * @returns {Promise<{gravados: number, mantidos: number}>} rejeita só se a gravação falhar
 */
export async function gravarLote(lista, sobrescrever) {
  const resultado = await api.gravarLote(lista, sobrescrever);

  try {
    await carregar();
    esconderAviso();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('recarregar o histórico (os dias importados foram gravados)', erro));
  }
  return resultado;
}
