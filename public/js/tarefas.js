import { hoje, rotuloDia } from '/shared/tempo.js';
import { STATUS, PRIORIDADES, RECORRENCIAS, tarefaVazia, situacaoDoPrazo, tarefasDoDia, progressoDoChecklist } from '/shared/tarefas.js';
import * as store from './tarefas-store.js';
import { elementos, escapar } from './util.js';
import { h, icone, iconePlay } from './dom.js';
import { mostrarAviso, avisoDeFalha } from './aviso.js';
import { focarEm, tarefaEmFoco, aoMudarTarefaEmFoco } from './pomodoro.js';
import { irPara } from './navegacao.js';
import { iniciarDetalhe, abrirTarefa, tarefaAberta, sincronizar, atualizarFoco, aoMudarPainel } from './tarefa-detalhe.js';

/* Tela de Tarefas: lista em tabela agrupada (cartões no celular) ou Kanban, com o painel da tarefa ao lado.
   O bloco "Tarefas de hoje" da tela Hoje também sai daqui. */

const el = elementos([
  'tarefasSub', 'tarefasVisao', 'tarefaRapida', 'tarefaRapidaTitulo', 'tarefasFiltro', 'tarefasAgrupar', 'tarefasResponsavel',
  'tarefasCliente', 'tarefasBusca', 'tarefasLista', 'tarefasKanban', 'hojeTarefas', 'tarefaStatusMenu',
]);

const CHAVE_DA_VISAO = 'timever.tarefas.visao';
const CONCLUIDAS_NO_KANBAN = 15;
const MINUTO = 60 * 1000;
const SVG_ABRIR_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
const SVG_FOCAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"></path></svg>';
const COLUNAS = ['col-titulo', 'col-cliente', 'col-responsavel', 'col-status', 'col-prioridade', 'col-prazo', 'col-foco', 'col-acao'];

const FILTROS = {
  abertas: (lista) => lista.filter((tarefa) => tarefa.status !== 'concluida'),
  hoje: (lista) => tarefasDoDia(lista, hoje()),
  concluidas: (lista) => lista.filter((tarefa) => tarefa.status === 'concluida')
    .sort((a, b) => String(b.concluidaEm).localeCompare(String(a.concluidaEm))),
  todas: (lista) => lista,
};

let visao = lerVisao();
let filtro = 'abertas';
let agrupar = 'status';
let responsavel = 'eu';
let cliente = '';
let busca = '';
const gruposFechados = new Set();

function lerVisao() {
  try {
    return localStorage.getItem(CHAVE_DA_VISAO) === 'kanban' ? 'kanban' : 'lista';
  } catch {
    return 'lista';
  }
}

function guardarVisao() {
  try {
    localStorage.setItem(CHAVE_DA_VISAO, visao);
  } catch {
    // armazenamento bloqueado: a visão volta a ser a lista no próximo acesso
  }
}

const estreita = () => innerWidth < 792;

/**
 * @description Tempo de foco para exibir, ex.: "25 min", "1h15"
 * @param {number} ms
 * @returns {string}
 */
function textoDoFoco(ms) {
  const minutos = Math.round(ms / MINUTO);
  if (minutos < 60) {
    return `${minutos} min`;
  }
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
}

function resumoDoFoco(tarefa) {
  if (tarefa.focoMs <= 0 && tarefa.pomodoros <= 0) {
    return '';
  }
  const pomodoros = tarefa.pomodoros === 1 ? '1 pomodoro' : `${tarefa.pomodoros} pomodoros`;
  return `${pomodoros} · ${textoDoFoco(tarefa.focoMs)}`;
}

function rotuloDoPrazo(prazo) {
  const situacao = situacaoDoPrazo(prazo, hoje());
  if (situacao === 'hoje') {
    return 'hoje';
  }
  return situacao === 'vencida' ? `venceu ${rotuloDia(prazo)}` : rotuloDia(prazo);
}

function nomeDoResponsavel(tarefa) {
  if (!tarefa.responsavelId) {
    return 'sem responsável';
  }
  return tarefa.responsavelId === store.quemSou().id ? 'você' : store.nomeDoColega(tarefa.responsavelId) || 'ex-membro';
}

/* ---------- linhas em HTML (Hoje e Kanban): todo texto passa por escapar() ---------- */

/* Só aparece quando a tarefa não é de quem está olhando: "→ Ana" ou "sem responsável". */
function rotuloDoResponsavel(tarefa) {
  if (tarefa.responsavelId === store.quemSou().id) {
    return '';
  }
  return `<span class="tarefa-responsavel">→ ${escapar(nomeDoResponsavel(tarefa))}</span>`;
}

function metaDaTarefa(tarefa) {
  const { feitos, total } = progressoDoChecklist(tarefa);
  const foco = resumoDoFoco(tarefa);
  return [
    rotuloDoResponsavel(tarefa),
    tarefa.cliente && `<span class="chip">${escapar(tarefa.cliente)}</span>`,
    tarefa.prazo && `<span class="tarefa-prazo" data-situacao="${situacaoDoPrazo(tarefa.prazo, hoje())}">${escapar(rotuloDoPrazo(tarefa.prazo))}</span>`,
    total > 0 && `<span>${feitos}/${total} itens</span>`,
    tarefa.commits.length > 0 && `<span>${tarefa.commits.length} commit${tarefa.commits.length > 1 ? 's' : ''}</span>`,
    tarefa.recorrencia && `<span>${escapar(RECORRENCIAS[tarefa.recorrencia])}</span>`,
    foco && `<span>${escapar(foco)}</span>`,
  ].filter(Boolean).join('');
}

/* O status só muda escolhendo no menu: um clique solto não conclui a tarefa por engano. */
function botaoStatus(tarefa) {
  return `<button class="etiqueta-status" type="button" data-acao="status" data-status="${escapar(tarefa.status)}" `
    + `aria-haspopup="menu" aria-expanded="false" title="Mudar o status" `
    + `aria-label="Status de ${escapar(tarefa.titulo)}: ${escapar(STATUS[tarefa.status])}. Mudar">`
    + `${escapar(STATUS[tarefa.status])}${SVG_ABRIR_MENU}</button>`;
}

function botaoFocar(tarefa) {
  if (tarefa.status === 'concluida') {
    return '';
  }
  return `<button class="botao-icone tarefa-focar" type="button" data-acao="focar" title="Focar no pomodoro" `
    + `aria-label="Focar em ${escapar(tarefa.titulo)}">${SVG_FOCAR}</button>`;
}

function atributosDaTarefa(tarefa) {
  return `data-id="${escapar(tarefa.id)}" data-prioridade="${escapar(tarefa.prioridade)}" `
    + `data-status="${escapar(tarefa.status)}" data-foco="${tarefa.id === tarefaEmFoco()}"`;
}

function htmlDaLinha(tarefa) {
  return `<div class="tarefa-linha" ${atributosDaTarefa(tarefa)}>`
    + `<button class="tarefa-abrir" type="button" data-acao="abrir">`
    + `<span class="tarefa-titulo">${escapar(tarefa.titulo)}</span>`
    + `<span class="tarefa-meta">${metaDaTarefa(tarefa)}</span></button>`
    + botaoStatus(tarefa)
    + botaoFocar(tarefa)
    + '</div>';
}

/* No cartão, "abrir" é um div com role de botão: o Firefox não começa a arrastar a partir de um <button>. */
function htmlDoCartao(tarefa) {
  return `<article class="tarefa-cartao" draggable="true" ${atributosDaTarefa(tarefa)}>`
    + `<div class="tarefa-abrir" role="button" tabindex="0" data-acao="abrir">`
    + `<span class="tarefa-titulo">${escapar(tarefa.titulo)}</span>`
    + `<span class="tarefa-meta">${metaDaTarefa(tarefa)}</span></div>`
    + `<div class="tarefa-cartao-acoes">${botaoStatus(tarefa)}${botaoFocar(tarefa)}</div>`
    + '</article>';
}

/* ---------- filtros ---------- */

function bateComBusca(tarefa) {
  if (!busca) {
    return true;
  }
  const campos = [tarefa.titulo, tarefa.cliente, tarefa.anotacoes,
    ...tarefa.commits.flatMap((commit) => [commit.hash, commit.branch])];
  return campos.some((campo) => String(campo ?? '').toLowerCase().includes(busca));
}

/* Status que a tela oferece: os em uso na empresa, mais o atual da tarefa (se a empresa deixou de usá-lo). */
function statusEmUso(atual = null) {
  const emUso = store.configuracao().status;
  return Object.fromEntries(Object.entries(STATUS).filter(([chave]) => emUso.includes(chave) || chave === atual));
}

function daPessoa(tarefa) {
  if (responsavel === 'todas') {
    return true;
  }
  if (responsavel === 'sem') {
    return !tarefa.responsavelId;
  }
  return tarefa.responsavelId === (responsavel === 'eu' ? store.quemSou().id : responsavel);
}

function tarefasFiltradas(nomeDoFiltro = filtro) {
  return FILTROS[nomeDoFiltro](store.listar())
    .filter(daPessoa)
    .filter((tarefa) => !cliente || tarefa.cliente === cliente)
    .filter(bateComBusca);
}

function pintarResponsaveis() {
  const colegas = store.listarColegas().filter((colega) => colega.id !== store.quemSou().id);
  if (!['eu', 'todas', 'sem'].includes(responsavel) && !colegas.some((colega) => colega.id === responsavel)) {
    responsavel = 'eu';
  }
  el.tarefasResponsavel.replaceChildren(new Option('Minhas', 'eu'), new Option('Toda a empresa', 'todas'),
    new Option('Sem responsável', 'sem'), ...colegas.map((colega) => new Option(colega.nome, colega.id)));
  el.tarefasResponsavel.value = responsavel;
}

function pintarClientes() {
  const clientes = [...new Set(store.listar().map((tarefa) => tarefa.cliente).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (cliente && !clientes.includes(cliente)) {
    cliente = '';
  }
  el.tarefasCliente.replaceChildren(new Option('Todos os clientes', ''), ...clientes.map((nome) => new Option(nome, nome)));
  el.tarefasCliente.value = cliente;
}

function pintarResumo() {
  const lista = store.minhas();
  const abertas = lista.filter((tarefa) => tarefa.status !== 'concluida');
  const vencidas = abertas.filter((tarefa) => situacaoDoPrazo(tarefa.prazo, hoje()) === 'vencida').length;
  const partes = [`${abertas.length} aberta${abertas.length === 1 ? '' : 's'}`];
  if (vencidas > 0) {
    partes.push(`${vencidas} vencida${vencidas === 1 ? '' : 's'}`);
  }
  partes.push(`${tarefasDoDia(lista, hoje()).length} para hoje`);
  el.tarefasSub.textContent = `Com você: ${partes.join(' · ')}`;
}

/* ---------- lista: tabela agrupada (cartões no celular) ---------- */

function chaveDoGrupo(tarefa) {
  if (agrupar === 'status') {
    return tarefa.status;
  }
  if (agrupar === 'cliente') {
    return tarefa.cliente || '';
  }
  return agrupar === 'responsavel' ? tarefa.responsavelId ?? '' : 'todas';
}

function tituloDoGrupo(chave) {
  if (agrupar === 'status') {
    return STATUS[chave] ?? chave;
  }
  if (agrupar === 'cliente') {
    return chave || 'Sem cliente';
  }
  return nomeDoResponsavel({ responsavelId: chave || null });
}

function grupos(lista) {
  if (agrupar === 'nenhum') {
    return [{ chave: 'todas', titulo: null, tarefas: lista }];
  }
  const ordem = agrupar === 'status' ? Object.keys(STATUS) : [...new Set(lista.map(chaveDoGrupo))]
    .sort((a, b) => tituloDoGrupo(a).localeCompare(tituloDoGrupo(b), 'pt-BR'));
  return ordem.map((chave) => ({ chave, titulo: tituloDoGrupo(chave), tarefas: lista.filter((tarefa) => chaveDoGrupo(tarefa) === chave) }))
    .filter((grupo) => grupo.tarefas.length);
}

const grupoFechado = (grupo) => gruposFechados.has(`${agrupar}:${grupo.chave}`);

function botaoDoGrupo(grupo) {
  const fechado = grupoFechado(grupo);
  return h('button', { class: 'grupo-botao', type: 'button', 'aria-expanded': String(!fechado),
    onclick: () => {
      const chave = `${agrupar}:${grupo.chave}`;
      if (fechado) {
        gruposFechados.delete(chave);
      } else {
        gruposFechados.add(chave);
      }
      render();
    } }, icone('seta'), grupo.titulo, h('span', { class: 'grupo-contador' }, grupo.tarefas.length));
}

function prazoDaTarefa(tarefa) {
  return tarefa.prazo
    ? h('span', { class: 'tarefa-prazo mono pequeno', 'data-situacao': situacaoDoPrazo(tarefa.prazo, hoje()) }, rotuloDoPrazo(tarefa.prazo))
    : h('span', { class: 'texto-apagado' }, '—');
}

function acoesDaTarefa(tarefa) {
  const status = h('button', { class: 'etiqueta-status', type: 'button', 'data-acao': 'status', 'data-status': tarefa.status,
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Status de ${tarefa.titulo}: ${STATUS[tarefa.status] ?? tarefa.status}. Mudar` },
  STATUS[tarefa.status] ?? tarefa.status, icone('seta'));
  const focar = tarefa.status === 'concluida' ? h('span', {})
    : h('button', { class: 'botao-icone tarefa-focar', type: 'button', 'data-acao': 'focar', 'aria-label': `Focar em ${tarefa.titulo}` }, iconePlay());
  return { status, focar };
}

function linhaDaTabela(tarefa) {
  const { status, focar } = acoesDaTarefa(tarefa);
  return h('tr', { class: 'linha', 'data-id': tarefa.id, 'data-prioridade': tarefa.prioridade, 'data-status': tarefa.status,
    'data-foco': String(tarefa.id === tarefaEmFoco()), 'aria-current': String(tarefa.id === tarefaAberta()), tabindex: '0' },
  h('td', { class: 'col-titulo' }, h('span', { class: 'tarefa-titulo' }, tarefa.titulo),
    h('span', { class: 'sub-linha' }, [tarefa.cliente, nomeDoResponsavel(tarefa)].filter(Boolean).join(' · '))),
  h('td', { class: 'col-cliente' }, tarefa.cliente || '—'),
  h('td', { class: 'col-responsavel' }, nomeDoResponsavel(tarefa)),
  h('td', { class: 'col-status' }, status),
  h('td', { class: 'col-prioridade' }, h('span', { class: 'prioridade', 'data-prioridade': tarefa.prioridade }, PRIORIDADES[tarefa.prioridade])),
  h('td', { class: 'col-prazo' }, prazoDaTarefa(tarefa)),
  h('td', { class: 'col-foco mono' }, tarefa.focoMs ? textoDoFoco(tarefa.focoMs) : '—'),
  h('td', { class: 'col-acao' }, focar));
}

function pintarTabela(lista) {
  const corpo = h('tbody', {}, grupos(lista).map((grupo) => [
    grupo.titulo ? h('tr', { class: 'grupo' }, h('td', { colspan: '8' }, botaoDoGrupo(grupo))) : null,
    grupoFechado(grupo) ? null : grupo.tarefas.map(linhaDaTabela),
  ]));
  const cabeca = h('thead', {}, h('tr', {}, ['Título', 'Cliente', 'Responsável', 'Status', 'Prioridade', 'Prazo', 'Foco', '']
    .map((texto, i) => h('th', { class: COLUNAS[i] }, texto || h('span', { class: 'so-leitor' }, 'Ações')))));
  el.tarefasLista.replaceChildren(h('table', { class: 'tabela-tarefas' }, cabeca, corpo));
}

function cartaoDaLista(tarefa) {
  const { status, focar } = acoesDaTarefa(tarefa);
  const { feitos, total } = progressoDoChecklist(tarefa);
  return h('div', { class: 'cartao-tarefa', role: 'button', tabindex: '0', 'data-id': tarefa.id, 'data-acao': 'abrir',
    'data-prioridade': tarefa.prioridade, 'aria-current': String(tarefa.id === tarefaAberta()) },
  h('span', { class: 'tarefa-titulo' }, tarefa.titulo),
  h('span', { class: 'tarefa-meta' }, [tarefa.cliente, nomeDoResponsavel(tarefa), total ? `${feitos}/${total} itens` : null,
    tarefa.focoMs ? textoDoFoco(tarefa.focoMs) : null].filter(Boolean).join(' · ')),
  h('span', { class: 'cartao-tarefa-rodape' }, status, prazoDaTarefa(tarefa), focar));
}

function pintarCartoes(lista) {
  el.tarefasLista.replaceChildren(h('div', { class: 'lista-cartoes' }, grupos(lista).map((grupo) => h('section', { class: 'lista-grupo' },
    grupo.titulo ? botaoDoGrupo(grupo) : null,
    grupoFechado(grupo) ? null : grupo.tarefas.map(cartaoDaLista)))));
}

function pintarLista() {
  const lista = tarefasFiltradas();
  if (!lista.length) {
    el.tarefasLista.replaceChildren(h('p', { class: 'texto-mudo tarefas-vazio' }, 'Nenhuma tarefa aqui.'));
    return;
  }
  if (estreita()) {
    pintarCartoes(lista);
  } else {
    pintarTabela(lista);
  }
}

/* ---------- kanban e Hoje ---------- */

function pintarKanban() {
  const lista = tarefasFiltradas('todas');
  const emUso = store.configuracao().status;
  const colunas = Object.entries(STATUS)
    .filter(([status]) => emUso.includes(status) || lista.some((tarefa) => tarefa.status === status));
  el.tarefasKanban.style.setProperty('--colunas', String(colunas.length));
  el.tarefasKanban.innerHTML = colunas.map(([status, rotulo]) => {
    let daColuna = lista.filter((tarefa) => tarefa.status === status);
    if (status === 'concluida') {
      daColuna = FILTROS.concluidas(daColuna).slice(0, CONCLUIDAS_NO_KANBAN);
    }
    return `<section class="kanban-coluna" data-coluna="${status}" aria-label="${escapar(rotulo)}">`
      + `<div class="kanban-cabeca"><span class="etiqueta-status" data-status="${status}">${escapar(rotulo)}</span>`
      + `<span class="texto-mudo pequeno">${daColuna.length}</span></div>`
      + `<div class="kanban-cartoes">${daColuna.map(htmlDoCartao).join('')}</div></section>`;
  }).join('');
}

function pintarHoje() {
  const lista = tarefasDoDia(store.minhas(), hoje());
  el.hojeTarefas.innerHTML = lista.length
    ? lista.map(htmlDaLinha).join('')
    : '<p class="texto-mudo pequeno tarefas-vazio">Nada vencendo hoje nem em andamento.</p>';
}

function pintarVisao() {
  el.tarefasVisao.querySelectorAll('button').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.visao === visao));
  });
  el.tarefasLista.hidden = visao !== 'lista';
  el.tarefasKanban.hidden = visao !== 'kanban';
  el.tarefasFiltro.hidden = visao !== 'lista';
  el.tarefasAgrupar.closest('label').hidden = visao !== 'lista';
}

function render() {
  fecharMenuDeStatus();
  pintarResumo();
  pintarResponsaveis();
  pintarClientes();
  pintarVisao();
  if (visao === 'lista') {
    pintarLista();
  } else {
    pintarKanban();
  }
  pintarHoje();
  sincronizar();
}

/* ---------- menu de status: um só, posicionado junto ao botão clicado ---------- */

let menuAberto = null;

function fecharMenuDeStatus({ devolverFoco = false } = {}) {
  if (!menuAberto) {
    return;
  }
  menuAberto.botao.setAttribute('aria-expanded', 'false');
  if (devolverFoco && menuAberto.botao.isConnected) {
    menuAberto.botao.focus();
  }
  menuAberto = null;
  el.tarefaStatusMenu.hidden = true;
}

function posicionarMenu(botao) {
  const ancora = botao.getBoundingClientRect();
  const menu = el.tarefaStatusMenu.getBoundingClientRect();
  const cabeEmbaixo = ancora.bottom + 6 + menu.height <= window.innerHeight;
  const topo = cabeEmbaixo ? ancora.bottom + 6 : Math.max(8, ancora.top - 6 - menu.height);
  const esquerda = Math.min(Math.max(8, ancora.right - menu.width), window.innerWidth - menu.width - 8);
  el.tarefaStatusMenu.style.top = `${topo}px`;
  el.tarefaStatusMenu.style.left = `${esquerda}px`;
}

function abrirMenuDeStatus(botao, id) {
  const reabrindoOMesmo = menuAberto?.botao === botao;
  fecharMenuDeStatus();
  const tarefa = store.obter(id);
  if (reabrindoOMesmo || !tarefa) {
    return;
  }
  el.tarefaStatusMenu.innerHTML = Object.entries(statusEmUso(tarefa.status)).map(([status, rotulo]) => `<button type="button" role="menuitemradio" `
    + `data-status="${status}" aria-checked="${status === tarefa.status}">`
    + `<span class="etiqueta-status" data-status="${status}">${escapar(rotulo)}</span></button>`).join('');
  el.tarefaStatusMenu.hidden = false;
  posicionarMenu(botao);
  botao.setAttribute('aria-expanded', 'true');
  menuAberto = { botao, id };
  el.tarefaStatusMenu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
}

async function escolherStatus(evento) {
  const opcao = evento.target.closest('[data-status][role="menuitemradio"]');
  if (!opcao || !menuAberto) {
    return;
  }
  const { id } = menuAberto;
  fecharMenuDeStatus();
  try {
    await store.mudarStatus(id, opcao.dataset.status);
  } catch (erro) {
    mostrarAviso(avisoDeFalha('mudar o status da tarefa', erro));
  }
}

function ligarMenuDeStatus() {
  el.tarefaStatusMenu.addEventListener('click', escolherStatus);
  document.addEventListener('pointerdown', (evento) => {
    if (menuAberto && !el.tarefaStatusMenu.contains(evento.target) && evento.target !== menuAberto.botao
      && !menuAberto.botao.contains(evento.target)) {
      fecharMenuDeStatus();
    }
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && menuAberto) {
      fecharMenuDeStatus({ devolverFoco: true });
    }
  });
  window.addEventListener('resize', () => fecharMenuDeStatus());
  document.addEventListener('scroll', () => fecharMenuDeStatus(), true);
}

/* ---------- ações nas linhas, cartões e no Hoje ---------- */

function agirNaTarefa(evento) {
  const alvo = evento.target.closest('[data-acao]') ?? evento.target.closest('tr.linha');
  const id = alvo?.closest('[data-id]')?.dataset.id;
  if (!id) {
    return;
  }
  const acao = alvo.dataset.acao ?? 'abrir';
  if (acao === 'status') {
    abrirMenuDeStatus(alvo, id);
  } else if (acao === 'focar') {
    focarEm(id);
  } else {
    // do Hoje, abrir leva para a tela de Tarefas, onde fica o painel
    if (el.hojeTarefas.contains(alvo)) {
      irPara('tarefas');
    }
    abrirTarefa(id);
  }
}

async function adicionarRapido(evento) {
  evento.preventDefault();
  const titulo = el.tarefaRapidaTitulo.value.trim();
  if (!titulo) {
    return;
  }
  try {
    const criada = await store.salvar({ ...tarefaVazia(), titulo, responsavelId: store.quemSou().id, prazo: filtro === 'hoje' ? hoje() : null });
    el.tarefaRapidaTitulo.value = '';
    abrirTarefa(criada.id);
  } catch (erro) {
    mostrarAviso(avisoDeFalha('criar a tarefa', erro));
  }
}

/* ---------- kanban: arrastar o cartão para outra coluna muda o status ---------- */

function ligarKanban() {
  el.tarefasKanban.addEventListener('dragstart', (evento) => {
    const cartao = evento.target.closest('.tarefa-cartao');
    if (cartao) {
      evento.dataTransfer.setData('text/plain', cartao.dataset.id);
      evento.dataTransfer.effectAllowed = 'move';
      cartao.classList.add('arrastando');
    }
  });
  el.tarefasKanban.addEventListener('dragend', (evento) => {
    evento.target.closest('.tarefa-cartao')?.classList.remove('arrastando');
    el.tarefasKanban.querySelectorAll('.kanban-coluna').forEach((coluna) => coluna.classList.remove('alvo'));
  });
  el.tarefasKanban.addEventListener('dragover', (evento) => {
    const coluna = evento.target.closest('.kanban-coluna');
    if (coluna) {
      evento.preventDefault();
      el.tarefasKanban.querySelectorAll('.kanban-coluna').forEach((outra) => outra.classList.toggle('alvo', outra === coluna));
    }
  });
  el.tarefasKanban.addEventListener('drop', async (evento) => {
    const coluna = evento.target.closest('.kanban-coluna');
    const id = evento.dataTransfer.getData('text/plain');
    if (!coluna || !store.obter(id)) {
      return;
    }
    evento.preventDefault();
    try {
      await store.mudarStatus(id, coluna.dataset.coluna);
    } catch (erro) {
      mostrarAviso(avisoDeFalha('mover a tarefa', erro));
    }
  });
}

function ligarFiltros() {
  el.tarefasVisao.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-visao]');
    if (botao) {
      visao = botao.dataset.visao;
      guardarVisao();
      render();
    }
  });
  el.tarefasFiltro.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-filtro]');
    if (botao) {
      filtro = botao.dataset.filtro;
      el.tarefasFiltro.querySelectorAll('button').forEach((outro) => {
        outro.setAttribute('aria-pressed', String(outro === botao));
      });
      render();
    }
  });
  const aoMudar = (alvo, aplicar) => alvo.addEventListener(alvo.tagName === 'INPUT' ? 'input' : 'change', () => {
    aplicar(alvo.value);
    render();
  });
  aoMudar(el.tarefasAgrupar, (valor) => { agrupar = valor; });
  aoMudar(el.tarefasResponsavel, (valor) => { responsavel = valor; });
  aoMudar(el.tarefasCliente, (valor) => { cliente = valor; });
  aoMudar(el.tarefasBusca, (valor) => { busca = valor.trim().toLowerCase(); });
}

function ligarAreas() {
  [el.tarefasLista, el.hojeTarefas, el.tarefasKanban].forEach((area) => area.addEventListener('click', agirNaTarefa));
  [el.tarefasLista, el.tarefasKanban].forEach((area) => area.addEventListener('keydown', (evento) => {
    if ((evento.key === 'Enter' || evento.key === ' ') && evento.target.matches('[role="button"][data-acao], tr.linha')) {
      evento.preventDefault();
      agirNaTarefa(evento);
    }
  }));
  let estreitaAntes = estreita();
  addEventListener('resize', () => {
    if (estreita() !== estreitaAntes) {
      estreitaAntes = estreita();
      render();
    }
  });
}

/**
 * @description Liga a tela de Tarefas, o painel e o bloco do Hoje, e carrega as tarefas da empresa do servidor
 * @param {{id: string, empresaId: string, ehAdm: boolean}} quem - o usuário logado
 */
export async function iniciarTarefas(quem) {
  store.definirSessao(quem);
  iniciarDetalhe({ abrirMenuDeStatus });
  ligarAreas();
  el.tarefaRapida.addEventListener('submit', adicionarRapido);
  ligarFiltros();
  ligarKanban();
  ligarMenuDeStatus();

  store.assinar(render);
  // o pomodoro soma foco a cada poucos segundos: no painel, só o texto do foco da tarefa aberta muda
  store.assinarFoco((id) => id === tarefaAberta() && atualizarFoco());
  aoMudarTarefaEmFoco(render);
  aoMudarPainel(() => {
    const aberta = tarefaAberta();
    el.tarefasLista.querySelectorAll('[data-id]').forEach((linha) => {
      linha.setAttribute('aria-current', String(linha.dataset.id === aberta));
    });
  });
  render();

  try {
    await store.carregar();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('carregar as tarefas', erro));
    el.tarefasSub.textContent = 'Não foi possível carregar as tarefas.';
  }
}
