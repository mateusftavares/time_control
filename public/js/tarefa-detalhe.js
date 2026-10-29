import { hoje, rotuloDia } from '/shared/tempo.js';
import { STATUS, PRIORIDADES, RECORRENCIAS, normalizarTarefa, progressoDoChecklist } from '/shared/tarefas.js';
import * as store from './tarefas-store.js';
import { api } from './api.js';
import { h, icone, iconePlay } from './dom.js';
import { focarEm, tarefaEmFoco } from './pomodoro.js';

/* Painel da tarefa no formato do OpenProject: abas Visão geral (salva sozinha a cada campo) e Atividade
   (histórico gravado pelo servidor + comentários). Ao lado da lista em tela larga, folha por cima no tablet,
   tela cheia no celular; o botão de expandir leva a qualquer um deles para a tela cheia.
   Todo handler lê a tarefa na hora (gravada + pendente): o painel nem sempre repinta enquanto alguém digita. */

const LARGURA_MINIMA = 420;
const CHAVE_DA_LARGURA = 'timever.tarefas.largura';
const ESPERA_DIGITACAO_MS = 700;
const ROTULO_DO_CAMPO = { titulo: 'Título', prazo: 'Prazo', prioridade: 'Prioridade', responsavel: 'Responsável', cliente: 'Cliente' };
const ABAS = [
  { chave: 'geral', titulo: 'Visão geral' },
  { chave: 'atividade', titulo: 'Atividade' },
  { chave: 'relacoes', titulo: 'Relações', breve: true },
  { chave: 'horas', titulo: 'Horas', breve: true },
  { chave: 'arquivos', titulo: 'Arquivos', breve: true },
];

const estado = {
  id: null, aba: 'geral', cheio: false, filtro: 'tudo',
  pendentes: {}, temporizador: null, gravando: Promise.resolve(true), ultimoErro: '',
  situacao: '', atividade: new Map(), rascunhos: new Map(), pintadoPara: '', adiado: false,
};
let el = null;
let abrirMenuDeStatus = () => {};
const ouvintes = new Set();

const modo = () => (innerWidth >= 1400 ? 'largo' : innerWidth >= 792 ? 'medio' : 'estreito');
const dataCurta = (dia) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '—');
const horario = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nomeDe = (userId) => (userId ? store.nomeDoColega(userId) || 'ex-membro' : 'o sistema');

function temControle(tarefa) {
  const { id, ehAdm } = store.quemSou();
  return ehAdm || tarefa.criadorId === id || tarefa.responsavelId === id;
}

/* O que aparece é o gravado mais o que ainda está esperando para ser salvo. */
function tarefaAtual() {
  const gravada = store.obter(estado.id);
  return gravada ? { ...gravada, ...estado.pendentes } : null;
}

function statusEmUso(atual) {
  const emUso = store.configuracao().status;
  return Object.entries(STATUS).filter(([chave]) => emUso.includes(chave) || chave === atual);
}

/* ---------- salvar sozinho ---------- */

function pintarSituacao(texto, tipo = '', id = estado.id) {
  if (id !== estado.id) {
    return;
  }
  estado.situacao = texto;
  const alvo = el.detalhe.querySelector('.salvo');
  if (alvo) {
    alvo.textContent = texto;
    alvo.dataset.tipo = tipo;
  }
}

async function gravarAgora() {
  clearTimeout(estado.temporizador);
  estado.temporizador = null;
  const id = estado.id;
  const mudancas = { ...estado.pendentes };
  const base = store.obter(id);
  if (!base || !Object.keys(mudancas).length) {
    return true;
  }
  const { ok, erros } = normalizarTarefa({ ...base, ...mudancas });
  if (!ok) {
    estado.ultimoErro = erros[0];
    pintarSituacao(`Não salvo: ${erros[0]}`, 'erro', id);
    return false;
  }
  pintarSituacao('Salvando…', '', id);
  try {
    await store.salvar({ ...store.obter(id), ...mudancas });
    const salva = store.obter(id);
    Object.keys(mudancas).forEach((chave) => {
      // linha de commit ou item em branco não é gravada (a validação descarta): enquanto houver, a lista da tela
      // tem mais itens que a gravada e fica pendente (comparar o conteúdo não serve: o jsonb reordena as chaves)
      const temLinhaEmBranco = ['commits', 'checklist'].includes(chave)
        && mudancas[chave].length !== (salva?.[chave]?.length ?? 0);
      if (estado.id === id && estado.pendentes[chave] === mudancas[chave] && !temLinhaEmBranco) {
        delete estado.pendentes[chave];
      }
    });
    pintarSituacao('Salvo automaticamente', 'ok', id);
    return true;
  } catch (erro) {
    estado.ultimoErro = erro.message;
    pintarSituacao(`Não salvo: ${erro.message}`, 'erro', id);
    return false;
  }
}

/* Uma gravação por vez: duas da mesma tarefa em voo poderiam chegar fora de ordem ao servidor. */
function gravarPendentes() {
  estado.gravando = estado.gravando.then(gravarAgora, gravarAgora);
  return estado.gravando;
}

/**
 * @description Guarda a mudança de um campo; texto espera a digitação parar, o resto grava na hora
 * @param {object} mudanca - campos da tarefa
 * @param {boolean} [esperar]
 */
function mudar(mudanca, esperar = false) {
  Object.assign(estado.pendentes, mudanca);
  clearTimeout(estado.temporizador);
  pintarSituacao('Alterado…');
  estado.temporizador = setTimeout(gravarPendentes, esperar ? ESPERA_DIGITACAO_MS : 0);
}

/* Antes de trocar ou fechar: grava o pendente; se não deu, pergunta antes de descartar. */
async function liberarTarefaAtual() {
  if (!estado.id || (!Object.keys(estado.pendentes).length && !estado.temporizador)) {
    return true;
  }
  if (await gravarPendentes()) {
    return true;
  }
  return window.confirm(`As últimas alterações desta tarefa não foram salvas (${estado.ultimoErro}). Descartar e continuar?`);
}

/* ---------- visão geral ---------- */

function seletor(opcoes, valor, aoMudar, extras = {}) {
  return h('select', { class: 'campo-inline', onchange: (evento) => aoMudar(evento.target.value), ...extras },
    opcoes.map(([chave, texto]) => h('option', { value: chave, selected: chave === valor }, texto)));
}

function textoDoFoco(tarefa) {
  const minutos = Math.round(tarefa.focoMs / 60000);
  const tempo = minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
  return tarefa.focoMs || tarefa.pomodoros ? `${tempo} · ${tarefa.pomodoros} pomodoro(s) ` : 'sem foco registrado ';
}

function focoResumo(tarefa) {
  return h('span', { class: 'foco-resumo' }, textoDoFoco(tarefa),
    tarefa.status === 'concluida' ? null : h('button', { class: 'botao-texto', type: 'button', onclick: () => focarEm(tarefa.id) },
      tarefa.id === tarefaEmFoco() ? 'em foco agora' : 'focar nesta tarefa'));
}

function propriedades(tarefa) {
  const colegas = store.listarColegas();
  const responsaveis = [['', 'Sem responsável'], ...colegas.map((colega) => [colega.id,
    colega.id === store.quemSou().id ? `${colega.nome} (você)` : colega.nome])];
  if (tarefa.responsavelId && !colegas.some((colega) => colega.id === tarefa.responsavelId)) {
    responsaveis.push([tarefa.responsavelId, 'ex-membro']);
  }
  const par = (rotulo, campo) => [h('dt', {}, rotulo), h('dd', {}, campo)];
  return h('dl', { class: 'propriedades' },
    par('Status', seletor(statusEmUso(tarefa.status), tarefa.status, (status) => mudar({ status }))),
    par('Prioridade', seletor(Object.entries(PRIORIDADES), tarefa.prioridade, (prioridade) => mudar({ prioridade }))),
    par('Responsável', seletor(responsaveis, tarefa.responsavelId ?? '', (id) => mudar({ responsavelId: id || null }),
      { disabled: !temControle(tarefa), title: temControle(tarefa) ? null : 'Só quem criou, o responsável ou o ADM troca o responsável' })),
    // cliente grava ao sair do campo: gravar durante a digitação criaria clientes com o nome pela metade
    par('Cliente', h('input', { class: 'campo-inline', value: tarefa.cliente, maxlength: '80', list: 'detalheClientes',
      autocomplete: 'off', 'aria-label': 'Cliente', onchange: (evento) => mudar({ cliente: evento.target.value }) })),
    par('Prazo', h('input', { class: 'campo-inline', type: 'date', value: tarefa.prazo ?? '', 'aria-label': 'Prazo',
      onchange: (evento) => mudar({ prazo: evento.target.value || null }) })),
    par('Repetição', seletor([['', 'Não se repete'], ...Object.entries(RECORRENCIAS)], tarefa.recorrencia ?? '',
      (recorrencia) => mudar({ recorrencia: recorrencia || null }))),
    par('Foco', focoResumo(tarefa)),
    h('datalist', { id: 'detalheClientes' }, store.clientesAtivos().map((cliente) => h('option', { value: cliente.nome }))));
}

/* Checklist e commits mudam a partir da tarefa de agora e repintam só a própria seção. */
function trocarLista(campo, transformar, { refocar = false } = {}) {
  mudar({ [campo]: transformar(tarefaAtual()[campo]) });
  const secao = el.detalhe.querySelector(`[data-secao="${campo}"]`);
  const nova = campo === 'checklist' ? secaoChecklist(tarefaAtual()) : secaoCommits(tarefaAtual());
  if (secao && nova) {
    secao.replaceWith(nova);
  }
  if (refocar) {
    nova?.querySelector('.campo-adicionar')?.focus();
  }
}

function secaoChecklist(tarefa) {
  const { feitos, total } = progressoDoChecklist(tarefa);
  return h('section', { class: 'secao', 'data-secao': 'checklist' },
    h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Checklist'),
      total ? h('span', { class: 'texto-mudo pequeno' }, `${feitos} de ${total}`) : null),
    total ? h('div', { class: 'barra-progresso' }, h('i', { style: `width:${(feitos / total) * 100}%` })) : null,
    h('div', { class: 'checklist-detalhe' }, tarefa.checklist.map((item, indice) => h('div', { class: 'checklist-linha' },
      h('label', {}, h('input', { type: 'checkbox', checked: item.feito,
        onchange: (evento) => trocarLista('checklist', (lista) => lista.map((outro, i) => (i === indice ? { ...outro, feito: evento.target.checked } : outro))) }),
      h('span', {}, item.texto)),
      h('button', { class: 'botao-icone', type: 'button', 'aria-label': `Remover o item ${item.texto}`,
        onclick: () => trocarLista('checklist', (lista) => lista.filter((_, i) => i !== indice)) }, icone('fechar'))))),
    h('input', { class: 'campo-adicionar', maxlength: '200', placeholder: 'Novo item e Enter', 'aria-label': 'Novo item do checklist',
      onkeydown: (evento) => {
        const texto = evento.target.value.trim();
        if (evento.key === 'Enter' && texto) {
          evento.preventDefault();
          trocarLista('checklist', (lista) => [...lista, { texto, feito: false }], { refocar: true });
        }
      } }));
}

function secaoCommits(tarefa) {
  if (!store.configuracao().usaCommits && !tarefa.commits.length) {
    return null;
  }
  // editar um campo não repinta (o valor já está no campo); só incluir e remover repintam a seção
  const alterar = (indice, campo, valor) => mudar({
    commits: tarefaAtual().commits.map((commit, i) => (i === indice ? { ...commit, [campo]: valor } : commit)),
  });
  return h('section', { class: 'secao', 'data-secao': 'commits' },
    h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Commits'),
      h('button', { class: 'botao-texto', type: 'button', onclick: () => trocarLista('commits', (lista) => [...lista, { hash: '', branch: '', data: hoje() }]) },
        '+ Adicionar commit')),
    tarefa.commits.length ? tarefa.commits.map((commit, indice) => h('div', { class: 'commit-detalhe' },
      h('input', { class: 'campo-inline mono', value: commit.hash, maxlength: '40', placeholder: 'código', 'aria-label': 'Código do commit',
        spellcheck: 'false', onchange: (evento) => alterar(indice, 'hash', evento.target.value) }),
      h('input', { class: 'campo-inline', value: commit.branch, maxlength: '120', placeholder: 'branch', 'aria-label': 'Branch',
        spellcheck: 'false', onchange: (evento) => alterar(indice, 'branch', evento.target.value) }),
      h('input', { class: 'campo-inline', type: 'date', value: commit.data ?? '', 'aria-label': 'Data do commit',
        onchange: (evento) => alterar(indice, 'data', evento.target.value || null) }),
      h('button', { class: 'botao-icone', type: 'button', 'aria-label': 'Remover o commit',
        onclick: () => trocarLista('commits', (lista) => lista.filter((_, i) => i !== indice)) }, icone('fechar'))))
      : h('span', { class: 'texto-mudo pequeno' }, 'Nenhum commit ainda.'));
}

function abaGeral(tarefa) {
  return [
    h('section', { class: 'secao' },
      h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Detalhes'),
        h('span', { class: 'salvo', 'aria-live': 'polite', 'data-tipo': estado.situacao.startsWith('Não') ? 'erro' : '' },
          estado.situacao || 'Salvo automaticamente')),
      propriedades(tarefa)),
    h('section', { class: 'secao' }, h('span', { class: 'rotulo' }, 'Descrição'),
      h('textarea', { class: 'descricao', maxlength: '10000', placeholder: 'Contexto, links, o que o cliente pediu…', 'aria-label': 'Descrição',
        oninput: (evento) => mudar({ anotacoes: evento.target.value }, true) }, tarefa.anotacoes)),
    secaoChecklist(tarefa),
    secaoCommits(tarefa),
  ];
}

/* ---------- atividade ---------- */

function valorDoCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === '') {
    return '—';
  }
  if (campo === 'prazo') {
    return dataCurta(valor);
  }
  if (campo === 'prioridade') {
    return PRIORIDADES[valor] ?? valor;
  }
  return campo === 'responsavel' ? nomeDe(valor) : valor;
}

const etiqueta = (status) => h('span', { class: 'etiqueta-status', 'data-status': status }, STATUS[status] ?? status);

function evento(item) {
  const { id: eu, ehAdm } = store.quemSou();
  if (item.tipo === 'comentario') {
    return h('li', { class: 'evento evento-comentario' },
      h('span', { class: 'evento-marcador' }, nomeDe(item.userId).trim().charAt(0).toUpperCase() || '?'),
      h('div', { class: 'evento-texto' },
        h('div', { class: 'evento-linha' }, h('b', {}, `${nomeDe(item.userId)} comentou`), h('time', {}, horario(item.criadoEm)),
          item.userId === eu || ehAdm ? h('button', { class: 'botao-texto', type: 'button', onclick: () => apagarComentario(item) }, 'apagar') : null),
        h('div', { class: 'balao' }, item.texto)));
  }
  const linha = {
    criada: [h('span', {}, `${nomeDe(item.userId)} criou a tarefa`)],
    status: [h('span', {}, 'Status'), etiqueta(item.de), h('span', { class: 'seta' }, '→'), etiqueta(item.para)],
    campo: [h('span', {}, ROTULO_DO_CAMPO[item.campo] ?? item.campo), h('span', { class: 'texto-mudo' }, valorDoCampo(item.campo, item.de)),
      h('span', { class: 'seta' }, '→'), h('b', {}, valorDoCampo(item.campo, item.para))],
  }[item.tipo] ?? [h('span', {}, item.tipo)];
  return h('li', { class: 'evento' }, h('span', { class: 'evento-marcador' }, icone(item.tipo === 'criada' ? 'criada' : item.tipo === 'status' ? 'status' : 'campo')),
    h('div', { class: 'evento-texto' }, h('div', { class: 'evento-linha' }, linha),
      h('time', {}, `${item.tipo === 'criada' ? '' : `${nomeDe(item.userId)} · `}${horario(item.criadoEm)}`)));
}

function abaAtividade() {
  const lista = estado.atividade.get(estado.id);
  const filtros = { tudo: () => true, comentarios: (item) => item.tipo === 'comentario', mudancas: (item) => item.tipo !== 'comentario' };
  const id = estado.id;
  // o rascunho sobrevive às repinturas (tempo real, troca de aba)
  const textoNovo = h('textarea', { id: 'novoComentario', maxlength: '4000', placeholder: 'Escreva um comentário: o que o cliente respondeu, o que falta…',
    oninput: (evento) => estado.rascunhos.set(id, evento.target.value) }, estado.rascunhos.get(id) ?? '');
  return [
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Filtrar atividade' }, Object.entries({ tudo: 'Tudo', comentarios: 'Comentários', mudancas: 'Mudanças' })
      .map(([chave, texto]) => h('button', { type: 'button', 'aria-pressed': String(estado.filtro === chave),
        onclick: () => { estado.filtro = chave; pintar(); } }, texto))),
    h('form', { class: 'comentar', onsubmit: (ev) => { ev.preventDefault(); enviarComentario(textoNovo); } },
      h('label', { class: 'so-leitor', for: 'novoComentario' }, 'Novo comentário'), textoNovo,
      h('button', { class: 'botao botao-primario botao-pequeno', type: 'submit' }, 'Comentar')),
    lista === undefined ? h('p', { class: 'texto-mudo pequeno' }, 'Carregando…')
      : h('ol', { class: 'linha-tempo' }, [...lista].reverse().filter(filtros[estado.filtro]).map(evento)),
  ];
}

async function carregarAtividade(id) {
  try {
    estado.atividade.set(id, await api.listarAtividade(id));
  } catch (erro) {
    estado.atividade.set(id, estado.atividade.get(id) ?? []);
    pintarSituacao(`Não foi possível carregar a atividade: ${erro.message}`, 'erro', id);
  }
  if (estado.id === id) {
    sincronizar();
  }
}

function guardarAtividade(item) {
  const lista = estado.atividade.get(item.tarefaId);
  if (lista && !lista.some((outro) => outro.id === item.id)) {
    lista.push(item);
  }
}

async function enviarComentario(campo) {
  const texto = campo.value.trim();
  const id = estado.id;
  if (!texto) {
    return;
  }
  try {
    guardarAtividade(await api.comentar(id, texto));
    estado.rascunhos.delete(id);
    if (estado.id === id) {
      campo.value = '';
      pintar();
    }
  } catch (erro) {
    pintarSituacao(`Comentário não enviado: ${erro.message}`, 'erro', id);
  }
}

async function apagarComentario(item) {
  if (!window.confirm('Apagar este comentário?')) {
    return;
  }
  try {
    await api.apagarComentario(item.id);
    estado.atividade.forEach((lista, id) => estado.atividade.set(id, lista.filter((outro) => outro.id !== item.id)));
    pintar();
  } catch (erro) {
    pintarSituacao(`Não foi possível apagar: ${erro.message}`, 'erro');
  }
}

/* ---------- moldura do painel ---------- */

function topo(tarefa) {
  return h('header', { class: 'detalhe-topo' },
    h('button', { class: 'botao-icone botao-voltar', type: 'button', 'aria-label': 'Voltar para a lista', onclick: () => fecharTarefa() }, icone('voltar')),
    h('button', { class: 'etiqueta-status', type: 'button', 'data-status': tarefa.status, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      'aria-label': `Status: ${STATUS[tarefa.status] ?? tarefa.status}. Mudar`, onclick: (ev) => abrirMenuDeStatus(ev.currentTarget, tarefa.id) },
    STATUS[tarefa.status] ?? tarefa.status, icone('seta')),
    tarefa.prazo ? h('span', { class: 'texto-mudo pequeno' }, `prazo ${rotuloDia(tarefa.prazo)}`) : null,
    h('div', { class: 'detalhe-topo-acoes' },
      tarefa.status === 'concluida' ? null : h('button', { class: 'botao-icone so-largo', type: 'button', 'aria-label': 'Focar nesta tarefa',
        title: 'Focar no pomodoro', onclick: () => focarEm(tarefa.id) }, iconePlay()),
      h('button', { class: 'botao-icone so-largo', type: 'button', 'aria-label': estado.cheio ? 'Recolher' : 'Abrir em tela cheia',
        title: estado.cheio ? 'Recolher' : 'Tela cheia', onclick: () => { estado.cheio = !estado.cheio; pintar(); } }, icone(estado.cheio ? 'recolher' : 'expandir')),
      temControle(tarefa) ? h('button', { class: 'botao-icone', type: 'button', 'aria-label': 'Apagar a tarefa', title: 'Apagar', onclick: () => apagarTarefa(tarefa) }, icone('lixo')) : null,
      h('button', { class: 'botao-icone so-largo', type: 'button', 'aria-label': 'Fechar', onclick: () => fecharTarefa() }, icone('fechar'))));
}

async function apagarTarefa(tarefa) {
  if (!window.confirm(`Apagar a tarefa "${tarefa.titulo}"? Não dá para desfazer.`)) {
    return;
  }
  try {
    clearTimeout(estado.temporizador);
    estado.temporizador = null;
    estado.pendentes = {};
    await store.apagar(tarefa.id);
    fecharTarefa({ gravar: false });
  } catch (erro) {
    pintarSituacao(`Não foi possível apagar: ${erro.message}`, 'erro');
  }
}

function abas(tarefa) {
  const total = estado.atividade.get(tarefa.id)?.length;
  return h('nav', { class: 'abas', role: 'tablist', 'aria-label': 'Seções da tarefa' }, ABAS.map((aba) => h('button', {
    class: 'aba', type: 'button', role: 'tab', id: `aba-${aba.chave}`, 'aria-controls': 'painelDaTarefa',
    'aria-selected': String(estado.aba === aba.chave), 'aria-disabled': aba.breve ? 'true' : null,
    onclick: () => {
      if (aba.breve) {
        return;
      }
      estado.aba = aba.chave;
      pintar();
      // relê ao entrar: o histórico é gravado pelo servidor e pode ter mudado desde a última leitura
      if (aba.chave === 'atividade') {
        carregarAtividade(tarefa.id);
      }
    },
  }, aba.titulo, aba.chave === 'atividade' && total ? h('span', { class: 'contador' }, total) : null,
  aba.breve ? h('span', { class: 'fase' }, 'em breve') : null)));
}

function rodape(tarefa) {
  return h('footer', { class: 'detalhe-rodape' },
    h('button', { class: 'botao botao-secundario', type: 'button', onclick: (ev) => abrirMenuDeStatus(ev.currentTarget, tarefa.id) }, 'Mudar status'),
    tarefa.status === 'concluida' ? null : h('button', { class: 'botao botao-primario', type: 'button', onclick: () => focarEm(tarefa.id) }, iconePlay(), 'Focar'));
}

function aplicarModo(aberta) {
  const largo = modo() === 'largo';
  el.detalhe.hidden = !aberta;
  el.detalhe.classList.toggle('cheio', aberta && estado.cheio);
  el.area.dataset.detalhe = aberta && !estado.cheio && largo ? 'aberto' : 'fechado';
  el.divisor.hidden = !(aberta && !estado.cheio && largo);
  el.veu.hidden = !aberta || (largo && !estado.cheio);
  document.querySelector('.capsula')?.classList.toggle('escondida', aberta && modo() === 'estreito');
}

/* Com o usuário digitando num campo do painel, repintar apagaria o cursor: espera ele sair do campo. */
function editando() {
  const ativo = document.activeElement;
  return el.detalhe.contains(ativo) && ativo.matches('textarea, select, input:not([type="checkbox"])');
}

/**
 * @description Redesenha o painel da tarefa aberta (ou o esconde, se nenhuma), mantendo a rolagem
 */
export function pintar() {
  const tarefa = tarefaAtual();
  aplicarModo(Boolean(tarefa));
  if (!tarefa) {
    el.detalhe.replaceChildren();
    estado.pintadoPara = '';
    return;
  }
  const chave = `${tarefa.id}:${estado.aba}`;
  const rolagem = estado.pintadoPara === chave ? el.detalhe.querySelector('.detalhe-corpo')?.scrollTop ?? 0 : 0;
  const titulo = h('textarea', { class: 'detalhe-titulo', rows: '1', maxlength: '200', 'aria-label': 'Título',
    oninput: (evento) => mudar({ titulo: evento.target.value }, true),
    onkeydown: (evento) => { if (evento.key === 'Enter') { evento.preventDefault(); evento.target.blur(); } } }, tarefa.titulo);
  const conteudo = estado.aba === 'atividade' ? abaAtividade() : abaGeral(tarefa);
  const corpo = h('div', { class: 'detalhe-corpo', role: 'tabpanel', id: 'painelDaTarefa', 'aria-labelledby': `aba-${estado.aba}` }, conteudo);
  el.detalhe.replaceChildren(topo(tarefa), titulo, abas(tarefa), corpo, rodape(tarefa));
  corpo.scrollTop = rolagem;
  estado.pintadoPara = chave;
  ouvintes.forEach((ouvinte) => ouvinte());
}

/**
 * @description Atualiza só o tempo de foco da tarefa aberta (o pomodoro soma a cada poucos segundos)
 */
export function atualizarFoco() {
  const tarefa = tarefaAtual();
  const atual = el.detalhe.querySelector('.foco-resumo');
  if (tarefa && atual) {
    atual.replaceWith(focoResumo(tarefa));
  }
}

/**
 * @description Acompanha mudanças da tarefa (salva aqui, por outra aba ou por um colega). Com alguém digitando,
 *   atualiza só o cabeçalho; o resto espera
 */
export function sincronizar() {
  if (!estado.id) {
    return;
  }
  if (!store.obter(estado.id)) {
    fecharTarefa({ gravar: false });
    return;
  }
  if (editando()) {
    el.detalhe.querySelector('.detalhe-topo')?.replaceWith(topo(tarefaAtual()));
    estado.adiado = true;
    return;
  }
  estado.adiado = false;
  pintar();
}

/**
 * @description Abre a tarefa no painel; antes grava o que estava pendente na anterior
 * @param {string} id
 */
export async function abrirTarefa(id) {
  if (estado.id === id) {
    pintar();
    return;
  }
  if (!(await liberarTarefaAtual())) {
    return;
  }
  clearTimeout(estado.temporizador);
  estado.temporizador = null;
  estado.aba = 'geral';
  estado.id = id;
  estado.pendentes = {};
  estado.situacao = '';
  if (!estado.atividade.has(id)) {
    carregarAtividade(id);
  }
  pintar();
}

/**
 * @description Fecha o painel; por padrão grava antes o que estava pendente (e pergunta se não deu)
 * @param {{gravar?: boolean}} [opcoes]
 */
export async function fecharTarefa({ gravar = true } = {}) {
  if (gravar && !(await liberarTarefaAtual())) {
    return;
  }
  clearTimeout(estado.temporizador);
  estado.temporizador = null;
  estado.id = null;
  estado.pendentes = {};
  estado.cheio = false;
  pintar();
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** @returns {string|null} id da tarefa aberta no painel */
export function tarefaAberta() {
  return estado.id;
}

/**
 * @description Avisa quando o painel abre, fecha ou repinta (a lista marca a linha aberta)
 * @param {() => void} ouvinte
 */
export function aoMudarPainel(ouvinte) {
  ouvintes.add(ouvinte);
}

function ligarDivisor() {
  try {
    const salva = Number(localStorage.getItem(CHAVE_DA_LARGURA));
    if (salva >= LARGURA_MINIMA) {
      el.area.style.setProperty('--largura-detalhe', `${salva}px`);
    }
  } catch { /* sem armazenamento: fica a largura padrão */ }
  el.divisor.addEventListener('pointerdown', (inicio) => {
    el.divisor.setPointerCapture(inicio.pointerId);
    el.divisor.classList.add('arrastando');
    const direita = el.area.getBoundingClientRect().right;
    let largura = el.detalhe.getBoundingClientRect().width;
    const mover = (ev) => {
      largura = Math.round(Math.min(Math.max(direita - ev.clientX, LARGURA_MINIMA), el.area.clientWidth * 0.62));
      el.area.style.setProperty('--largura-detalhe', `${largura}px`);
    };
    el.divisor.addEventListener('pointermove', mover);
    el.divisor.addEventListener('pointerup', () => {
      el.divisor.classList.remove('arrastando');
      el.divisor.removeEventListener('pointermove', mover);
      try { localStorage.setItem(CHAVE_DA_LARGURA, String(largura)); } catch { /* idem */ }
    }, { once: true });
  });
}

/**
 * @description Liga o painel da tarefa
 * @param {{abrirMenuDeStatus: (botao: HTMLElement, id: string) => void}} dependencias
 */
export function iniciarDetalhe(dependencias) {
  abrirMenuDeStatus = dependencias.abrirMenuDeStatus;
  el = {
    area: document.getElementById('tarefasArea'), detalhe: document.getElementById('tarefaDetalhe'),
    divisor: document.getElementById('tarefasDivisor'), veu: document.getElementById('tarefasVeu'),
  };
  ligarDivisor();
  el.veu.addEventListener('click', () => fecharTarefa());
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && estado.id && document.getElementById('tarefaStatusMenu').hidden) {
      fecharTarefa();
    }
  });
  let modoAtual = modo();
  addEventListener('resize', () => {
    if (modo() !== modoAtual) {
      modoAtual = modo();
      pintar();
    }
  });
  // mudança que chegou enquanto alguém digitava: repinta quando o foco sai do painel (não ao ir para um
  // botão dele, que seria recriado no meio do clique)
  el.detalhe.addEventListener('focusout', (evento) => {
    if (estado.adiado && !el.detalhe.contains(evento.relatedTarget)) {
      setTimeout(() => estado.adiado && !editando() && sincronizar(), 0);
    }
  });
  store.assinarAtividade((item) => {
    guardarAtividade(item);
    if (item.tarefaId === estado.id && estado.aba === 'atividade') {
      sincronizar();
    }
  });
  addEventListener('pagehide', () => { gravarPendentes(); });
}
