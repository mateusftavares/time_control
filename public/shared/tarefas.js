import { iso, diaValido } from './tempo.js';

/* Regras das tarefas sem depender do navegador: validação, recorrência, ordem e prazo.
   Usadas pela tela e pelos testes. */

export const STATUS = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  commit_realizado: 'Commit realizado',
  pendente_teste: 'Pendente de teste',
  aguardando: 'Aguardando',
  concluida: 'Concluída',
};
export const PRIORIDADES = {
  urgente: 'Urgente',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
};
export const RECORRENCIAS = {
  diaria: 'Todo dia',
  semanal: 'Toda semana',
  mensal: 'Todo mês',
};

export const LIMITES = {
  titulo: 200,
  cliente: 80,
  anotacoes: 10000,
  itensChecklist: 50,
  textoItem: 200,
  commits: 30,
  branch: 120,
};

const PESO_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const HASH_DE_COMMIT = /^[0-9a-f]{7,40}$/i;
const NOME_DE_BRANCH = /^[A-Za-z0-9._\/-]+$/;
const CONTROLE = /[\u0000-\u001F\u007F]/;

const texto = (valor) => String(valor ?? '').trim();

/**
 * @description Tarefa nova, vazia
 * @returns {object}
 */
export function tarefaVazia() {
  return {
    id: null,
    titulo: '',
    cliente: '',
    status: 'a_fazer',
    prioridade: 'normal',
    prazo: null,
    recorrencia: null,
    anotacoes: '',
    checklist: [],
    commits: [],
    focoMs: 0,
    pomodoros: 0,
    concluidaEm: null,
    criadoEm: null,
  };
}

function itemDoChecklist(item, indice, erros) {
  const textoDoItem = texto(item?.texto);
  if (!textoDoItem) {
    return null;
  }
  if (textoDoItem.length > LIMITES.textoItem || CONTROLE.test(textoDoItem)) {
    erros.push(`item ${indice + 1} do checklist: até ${LIMITES.textoItem} caracteres, sem quebras de linha`);
  }
  return { texto: textoDoItem, feito: item?.feito === true };
}

function commitValido(commit, indice, erros) {
  const hash = texto(commit?.hash).toLowerCase();
  const branch = texto(commit?.branch);
  const data = commit?.data || null;
  // a data já nasce preenchida com hoje: sem código e sem branch, a linha conta como em branco
  if (!hash && !branch) {
    return null;
  }

  const rotulo = `commit ${indice + 1}`;
  if (!HASH_DE_COMMIT.test(hash)) {
    erros.push(`${rotulo}: o código deve ter de 7 a 40 caracteres hexadecimais`);
  }
  if (branch && (branch.length > LIMITES.branch || !NOME_DE_BRANCH.test(branch))) {
    erros.push(`${rotulo}: a branch aceita letras, números, ponto, hífen, sublinhado e barra`);
  }
  if (data !== null && !diaValido(data)) {
    erros.push(`${rotulo}: data inválida`);
  }
  return { hash, branch, data };
}

/**
 * @description Confere e limpa uma tarefa vinda da tela; itens e commits em branco são descartados
 * @param {object} entrada
 * @returns {{ok: boolean, tarefa: object, erros: string[]}}
 */
export function normalizarTarefa(entrada) {
  const erros = [];
  const origem = { ...tarefaVazia(), ...entrada };

  const titulo = texto(origem.titulo);
  if (!titulo) {
    erros.push('o título é obrigatório');
  } else if (titulo.length > LIMITES.titulo || CONTROLE.test(titulo)) {
    erros.push(`o título deve ter até ${LIMITES.titulo} caracteres, sem quebras de linha`);
  }

  const cliente = texto(origem.cliente);
  if (cliente.length > LIMITES.cliente || CONTROLE.test(cliente)) {
    erros.push(`o cliente/projeto deve ter até ${LIMITES.cliente} caracteres`);
  }
  if (!(origem.status in STATUS)) {
    erros.push('status inválido');
  }
  if (!(origem.prioridade in PRIORIDADES)) {
    erros.push('prioridade inválida');
  }
  const prazo = origem.prazo || null;
  if (prazo !== null && !diaValido(prazo)) {
    erros.push('prazo inválido');
  }
  const recorrencia = origem.recorrencia || null;
  if (recorrencia !== null && !(recorrencia in RECORRENCIAS)) {
    erros.push('recorrência inválida');
  }

  const anotacoes = String(origem.anotacoes ?? '');
  if (anotacoes.length > LIMITES.anotacoes) {
    erros.push(`as anotações devem ter até ${LIMITES.anotacoes} caracteres`);
  }

  const checklist = (Array.isArray(origem.checklist) ? origem.checklist : [])
    .map((item, indice) => itemDoChecklist(item, indice, erros)).filter(Boolean);
  if (checklist.length > LIMITES.itensChecklist) {
    erros.push(`o checklist aceita até ${LIMITES.itensChecklist} itens`);
  }
  const commits = (Array.isArray(origem.commits) ? origem.commits : [])
    .map((commit, indice) => commitValido(commit, indice, erros)).filter(Boolean);
  if (commits.length > LIMITES.commits) {
    erros.push(`a tarefa aceita até ${LIMITES.commits} commits`);
  }

  const tarefa = {
    ...origem, titulo, cliente, prazo, recorrencia, anotacoes, checklist, commits,
  };
  return { ok: erros.length === 0, tarefa, erros };
}

export const COLUNAS_TAREFAS = 'id, titulo, cliente, status, prioridade, prazo, recorrencia, anotacoes, '
  + 'checklist, commits, foco_ms, pomodoros, concluida_em, criado_em';

/**
 * @description Linha da tabela `tarefas` para a tarefa do app
 * @param {object} linha
 * @returns {object}
 */
export function paraTarefa(linha) {
  return {
    id: linha.id,
    titulo: linha.titulo,
    cliente: linha.cliente ?? '',
    status: linha.status,
    prioridade: linha.prioridade,
    prazo: linha.prazo,
    recorrencia: linha.recorrencia,
    anotacoes: linha.anotacoes ?? '',
    checklist: Array.isArray(linha.checklist) ? linha.checklist : [],
    commits: Array.isArray(linha.commits) ? linha.commits : [],
    focoMs: Number(linha.foco_ms) || 0,
    pomodoros: Number(linha.pomodoros) || 0,
    concluidaEm: linha.concluida_em ?? null,
    criadoEm: linha.criado_em ?? null,
  };
}

/**
 * @description Tarefa do app (já normalizada) para a linha gravada; foco e datas são do servidor
 * @param {object} tarefa
 * @returns {object}
 */
export function linhaDeTarefa(tarefa) {
  return {
    titulo: tarefa.titulo,
    cliente: tarefa.cliente,
    status: tarefa.status,
    prioridade: tarefa.prioridade,
    prazo: tarefa.prazo,
    recorrencia: tarefa.recorrencia,
    anotacoes: tarefa.anotacoes,
    checklist: tarefa.checklist,
    commits: tarefa.commits,
  };
}

function somarDias(dia, quantos) {
  const [ano, mes, d] = dia.split('-').map(Number);
  return iso(new Date(ano, mes - 1, d + quantos));
}

/* Dia 31 num mês de 30 dias cai no último dia do mês, sem pular para o seguinte. */
function somarMes(dia, diaDoMes) {
  const [ano, mes] = dia.split('-').map(Number);
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return iso(new Date(ano, mes, Math.min(diaDoMes, ultimoDia)));
}

/**
 * @description Prazo da próxima ocorrência: anda a partir do prazo atual (ou de hoje) até passar de hoje
 * @param {object} tarefa - com recorrencia e prazo
 * @param {string} hojeIso - AAAA-MM-DD
 * @returns {string|null} null quando a tarefa não se repete
 */
export function proximoPrazo(tarefa, hojeIso) {
  if (!tarefa.recorrencia) {
    return null;
  }
  const inicio = tarefa.prazo || hojeIso;
  const diaDoMes = Number(inicio.slice(8, 10));
  let prazo = inicio;
  do {
    if (tarefa.recorrencia === 'diaria') {
      prazo = somarDias(prazo, 1);
    } else if (tarefa.recorrencia === 'semanal') {
      prazo = somarDias(prazo, 7);
    } else {
      prazo = somarMes(prazo, diaDoMes);
    }
  } while (prazo <= hojeIso);
  return prazo;
}

/**
 * @description Cópia da tarefa recorrente para a próxima ocorrência: checklist desmarcado, sem commits nem foco
 * @param {object} tarefa
 * @param {string} hojeIso
 * @returns {object|null}
 */
export function proximaOcorrencia(tarefa, hojeIso) {
  const prazo = proximoPrazo(tarefa, hojeIso);
  if (!prazo) {
    return null;
  }
  return {
    ...tarefaVazia(),
    titulo: tarefa.titulo,
    cliente: tarefa.cliente,
    prioridade: tarefa.prioridade,
    recorrencia: tarefa.recorrencia,
    anotacoes: tarefa.anotacoes,
    checklist: tarefa.checklist.map((item) => ({ texto: item.texto, feito: false })),
    prazo,
  };
}

/**
 * @description Situação do prazo em relação a hoje
 * @param {string|null} prazo
 * @param {string} hojeIso
 * @returns {'vencida'|'hoje'|'futura'|null}
 */
export function situacaoDoPrazo(prazo, hojeIso) {
  if (!prazo) {
    return null;
  }
  if (prazo < hojeIso) {
    return 'vencida';
  }
  return prazo === hojeIso ? 'hoje' : 'futura';
}

/**
 * @description Ordem de trabalho: prioridade, depois prazo (sem prazo por último), depois a mais antiga
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compararTarefas(a, b) {
  const porPrioridade = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
  if (porPrioridade !== 0) {
    return porPrioridade;
  }
  if (a.prazo !== b.prazo) {
    if (!a.prazo) return 1;
    if (!b.prazo) return -1;
    return a.prazo < b.prazo ? -1 : 1;
  }
  return String(a.criadoEm ?? '').localeCompare(String(b.criadoEm ?? ''));
}

/**
 * @description Tarefas para a tela Hoje: abertas que vencem até hoje ou que estão em andamento
 * @param {object[]} tarefas
 * @param {string} hojeIso
 * @returns {object[]}
 */
export function tarefasDoDia(tarefas, hojeIso) {
  return tarefas
    .filter((tarefa) => tarefa.status !== 'concluida'
      && (tarefa.status === 'em_andamento' || (tarefa.prazo && tarefa.prazo <= hojeIso)))
    .sort(compararTarefas);
}

/**
 * @description Progresso do checklist, ex.: { feitos: 2, total: 5 }
 * @param {object} tarefa
 * @returns {{feitos: number, total: number}}
 */
export function progressoDoChecklist(tarefa) {
  return {
    feitos: tarefa.checklist.filter((item) => item.feito).length,
    total: tarefa.checklist.length,
  };
}
