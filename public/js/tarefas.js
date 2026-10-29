import { hoje, rotuloDia } from '/shared/tempo.js';
import {
  STATUS, PRIORIDADES, RECORRENCIAS, tarefaVazia, situacaoDoPrazo, tarefasDoDia, progressoDoChecklist,
} from '/shared/tarefas.js';
import * as store from './tarefas-store.js';
import { elementos, escapar } from './util.js';
import { mostrarAviso, avisoDeFalha } from './aviso.js';
import { focarEm, tarefaEmFoco, aoMudarTarefaEmFoco } from './pomodoro.js';

const el = elementos([
  'tarefasSub', 'tarefasVisao', 'tarefaRapida', 'tarefaRapidaTitulo', 'tarefasFiltro', 'tarefasResponsavel', 'tarefasCliente',
  'tarefasBusca',
  'tarefasLista', 'tarefasLinhas', 'tarefasKanban', 'hojeTarefas',
  'tarefaEditor', 'tarefaEditorRotulo', 'tarefaEditorTitulo', 'tarefaFechar', 'tarefaForm',
  'tTitulo', 'tCliente', 'tClientes', 'tResponsavel', 'tStatus', 'tPrioridade', 'tPrazo', 'tRecorrencia', 'tAnotacoes',
  'tChecklist', 'tChecklistProgresso', 'tNovoItem', 'tBlocoCommits', 'tCommits', 'tNovoCommit', 'tFoco', 'tFocar',
  'tarefaEstado', 'tarefaSalvar', 'tarefaApagar', 'tarefaStatusMenu',
]);

const CHAVE_DA_VISAO = 'timever.tarefas.visao';
const CONCLUIDAS_NO_KANBAN = 15;
const AVISO_SALVO_MS = 1500;
const MINUTO = 60 * 1000;
const SVG_ABRIR_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
const SVG_FOCAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"></path></svg>';
const SVG_REMOVER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>';

const FILTROS = {
  abertas: (lista) => lista.filter((tarefa) => tarefa.status !== 'concluida'),
  hoje: (lista) => tarefasDoDia(lista, hoje()),
  concluidas: (lista) => lista.filter((tarefa) => tarefa.status === 'concluida')
    .sort((a, b) => String(b.concluidaEm).localeCompare(String(a.concluidaEm))),
  todas: (lista) => lista,
};

let visao = lerVisao();
let filtro = 'abertas';
let responsavel = 'eu';
let cliente = '';
let busca = '';
let editada = null;
let instantaneoDoEditor = '';

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

/* Só aparece quando a tarefa não é de quem está olhando: "→ Ana" ou "sem responsável". */
function rotuloDoResponsavel(tarefa) {
  if (tarefa.responsavelId === store.quemSou().id) {
    return '';
  }
  const nome = tarefa.responsavelId ? store.nomeDoColega(tarefa.responsavelId) || 'ex-membro' : 'sem responsável';
  return `<span class="tarefa-responsavel">→ ${escapar(nome)}</span>`;
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
  el.tClientes.replaceChildren(...store.clientesAtivos().map((cadastrado) => new Option(cadastrado.nome)));
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

function pintarLista() {
  const lista = tarefasFiltradas();
  el.tarefasLinhas.innerHTML = lista.length
    ? lista.map(htmlDaLinha).join('')
    : '<p class="texto-mudo tarefas-vazio">Nenhuma tarefa aqui.</p>';
}

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
  sincronizarEditor();
}

/* Concluir pela lista, mover no Kanban ou apagar com o editor aberto: o editor acompanha, para o
   Salvar não devolver o status antigo nem tentar gravar uma tarefa que já não existe. */
function sincronizarEditor() {
  if (!editada?.id) {
    return;
  }
  const atual = store.obter(editada.id);
  if (!atual) {
    fecharEditor();
    return;
  }
  if (atual.status !== editada.status) {
    const estavaSujo = editorSujo();
    editada.status = atual.status;
    el.tStatus.value = atual.status;
    if (!estavaSujo) {
      instantaneoDoEditor = JSON.stringify(dadosDoEditor());
    }
  }
  pintarFocoDoEditor();
}

/* ---------- editor ---------- */

function opcoes(select, mapa, vazio) {
  const lista = Object.entries(mapa).map(([valor, rotulo]) => new Option(rotulo, valor));
  select.replaceChildren(...(vazio ? [new Option(vazio, '')] : []), ...lista);
}

function mostrarEstado(texto, tipo = '') {
  el.tarefaEstado.textContent = texto;
  el.tarefaEstado.className = `texto-mudo pequeno estado ${tipo}`.trim();
}

function pintarChecklist() {
  const { feitos, total } = progressoDoChecklist(editada);
  el.tChecklistProgresso.textContent = total ? `${feitos}/${total}` : '';
  el.tChecklist.innerHTML = editada.checklist.map((item, indice) => '<div class="checklist-item">'
    + `<label class="caixa"><input type="checkbox" data-indice="${indice}"${item.feito ? ' checked' : ''}>`
    + `<span>${escapar(item.texto)}</span></label>`
    + `<button class="botao-icone" type="button" data-remover="${indice}" aria-label="Remover o item ${escapar(item.texto)}">${SVG_REMOVER}</button>`
    + '</div>').join('');
}

function pintarCommits() {
  el.tCommits.innerHTML = editada.commits.map((commit, indice) => `<div class="commit-linha" data-indice="${indice}">`
    + `<label>Código<input class="mono" data-campo="hash" value="${escapar(commit.hash)}" maxlength="40" autocomplete="off" spellcheck="false" placeholder="0cca8936d"></label>`
    + `<label>Branch<input data-campo="branch" value="${escapar(commit.branch)}" maxlength="120" autocomplete="off" spellcheck="false" placeholder="DEV/minha_branch"></label>`
    + `<label>Data<input type="date" data-campo="data" value="${escapar(commit.data ?? '')}"></label>`
    + `<button class="botao-icone" type="button" data-remover="${indice}" aria-label="Remover o commit">${SVG_REMOVER}</button>`
    + '</div>').join('') || '<p class="texto-mudo pequeno">Nenhum commit registrado.</p>';
}

function pintarFocoDoEditor() {
  const atual = store.obter(editada.id) ?? editada;
  el.tFoco.textContent = resumoDoFoco(atual) || 'Sem foco registrado';
  el.tFocar.disabled = !editada.id || atual.status === 'concluida';
  el.tFocar.textContent = editada.id && editada.id === tarefaEmFoco() ? 'Em foco agora' : 'Focar nesta tarefa';
}

/* Apagar e trocar o responsável: quem criou, o responsável ou o ADM (o servidor confere de novo). */
function temControle(tarefa) {
  const { id, ehAdm } = store.quemSou();
  return ehAdm || tarefa.criadorId === id || tarefa.responsavelId === id;
}

const podeApagar = (tarefa) => Boolean(tarefa.id) && temControle(tarefa);

function preencherResponsavel() {
  const colegas = store.listarColegas();
  const foraDaLista = editada.responsavelId && !colegas.some((colega) => colega.id === editada.responsavelId)
    ? [new Option('ex-membro', editada.responsavelId)] : [];
  el.tResponsavel.replaceChildren(new Option('Sem responsável', ''), ...foraDaLista,
    ...colegas.map((colega) => new Option(colega.id === store.quemSou().id ? `${colega.nome} (você)` : colega.nome, colega.id)));
  el.tResponsavel.value = editada.responsavelId ?? '';
  el.tResponsavel.disabled = Boolean(editada.id) && !temControle(editada);
  el.tResponsavel.title = el.tResponsavel.disabled ? 'Só quem criou, o responsável ou o ADM troca o responsável' : '';
}

function preencherEditor() {
  el.tarefaEditorRotulo.textContent = editada.id ? 'Editar tarefa' : 'Nova tarefa';
  el.tarefaEditorTitulo.textContent = editada.titulo || 'Nova tarefa';
  el.tTitulo.value = editada.titulo;
  el.tCliente.value = editada.cliente;
  preencherResponsavel();
  opcoes(el.tStatus, statusEmUso(editada.status));
  el.tStatus.value = editada.status;
  el.tBlocoCommits.hidden = !store.configuracao().usaCommits && editada.commits.length === 0;
  el.tPrioridade.value = editada.prioridade;
  el.tPrazo.value = editada.prazo ?? '';
  el.tRecorrencia.value = editada.recorrencia ?? '';
  el.tAnotacoes.value = editada.anotacoes;
  el.tNovoItem.value = '';
  el.tarefaApagar.hidden = !podeApagar(editada);
  mostrarEstado('');
  pintarChecklist();
  pintarCommits();
  pintarFocoDoEditor();
  instantaneoDoEditor = JSON.stringify(dadosDoEditor());
}

function editorSujo() {
  return Boolean(editada) && JSON.stringify(dadosDoEditor()) !== instantaneoDoEditor;
}

/* X, Esc e clique fora: com alteração não salva, pergunta antes de descartar. */
function pedirParaFechar() {
  if (!editorSujo() || confirm('Descartar as alterações não salvas desta tarefa?')) {
    fecharEditor();
  }
}

function abrirEditor(tarefa) {
  editada = structuredClone(tarefa);
  preencherEditor();
  if (!el.tarefaEditor.open) {
    el.tarefaEditor.showModal();
  }
  el.tTitulo.focus();
}

/* Fechar pelo X, pelo Esc ou clicando fora: o evento "close" do dialog solta a tarefa editada. */
function fecharEditor() {
  if (el.tarefaEditor.open) {
    el.tarefaEditor.close();
  }
}

function dadosDoEditor() {
  return {
    ...editada,
    titulo: el.tTitulo.value,
    cliente: el.tCliente.value,
    responsavelId: el.tResponsavel.value || null,
    status: el.tStatus.value,
    prioridade: el.tPrioridade.value,
    prazo: el.tPrazo.value || null,
    recorrencia: el.tRecorrencia.value || null,
    anotacoes: el.tAnotacoes.value,
  };
}

async function salvarEditor(evento) {
  evento.preventDefault();
  el.tarefaSalvar.disabled = true;
  try {
    const gravada = await store.salvar(dadosDoEditor());
    if (!el.tarefaEditor.open) {
      return;
    }
    editada = structuredClone(gravada);
    preencherEditor();
    mostrarEstado('Tarefa salva.', 'ok');
    setTimeout(() => el.tarefaEstado.textContent === 'Tarefa salva.' && mostrarEstado(''), AVISO_SALVO_MS);
  } catch (erro) {
    mostrarEstado(`Não foi possível salvar: ${erro.message}.`, 'erro');
  } finally {
    el.tarefaSalvar.disabled = false;
  }
}

async function apagarEditada() {
  if (!editada?.id || !confirm(`Apagar a tarefa "${editada.titulo}"? Não dá para desfazer.`)) {
    return;
  }
  try {
    await store.apagar(editada.id);
    fecharEditor();
  } catch (erro) {
    mostrarEstado(`Não foi possível apagar: ${erro.message}.`, 'erro');
  }
}

function adicionarItem(evento) {
  if (evento.key !== 'Enter') {
    return;
  }
  evento.preventDefault();
  const texto = el.tNovoItem.value.trim();
  if (texto) {
    editada.checklist.push({ texto, feito: false });
    el.tNovoItem.value = '';
    pintarChecklist();
  }
}

function mexerNoChecklist(evento) {
  const marcador = evento.target.closest('input[data-indice]');
  if (marcador) {
    editada.checklist[Number(marcador.dataset.indice)].feito = marcador.checked;
    pintarChecklist();
    return;
  }
  const remover = evento.target.closest('[data-remover]');
  if (remover) {
    editada.checklist.splice(Number(remover.dataset.remover), 1);
    pintarChecklist();
  }
}

function mexerNosCommits(evento) {
  const remover = evento.target.closest('[data-remover]');
  if (remover && evento.type === 'click') {
    editada.commits.splice(Number(remover.dataset.remover), 1);
    pintarCommits();
    return;
  }
  const campo = evento.target.closest('input[data-campo]');
  if (campo && evento.type === 'input') {
    const indice = Number(campo.closest('.commit-linha').dataset.indice);
    editada.commits[indice][campo.dataset.campo] = campo.value || (campo.dataset.campo === 'data' ? null : '');
  }
}

function novoCommit() {
  editada.commits.push({ hash: '', branch: '', data: hoje() });
  pintarCommits();
  el.tCommits.querySelector('.commit-linha:last-child input')?.focus();
}

/* ---------- ações nas linhas e cartões ---------- */

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

function agirNaTarefa(evento) {
  const botao = evento.target.closest('[data-acao]');
  const id = botao?.closest('[data-id]')?.dataset.id;
  if (!id) {
    return;
  }
  if (botao.dataset.acao === 'status') {
    abrirMenuDeStatus(botao, id);
  } else if (botao.dataset.acao === 'focar') {
    focarEm(id);
  } else {
    abrirEditor(store.obter(id));
  }
}

async function adicionarRapido(evento) {
  evento.preventDefault();
  const titulo = el.tarefaRapidaTitulo.value.trim();
  if (!titulo) {
    return;
  }
  try {
    await store.salvar({ ...tarefaVazia(), titulo, responsavelId: store.quemSou().id, prazo: filtro === 'hoje' ? hoje() : null });
    el.tarefaRapidaTitulo.value = '';
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
  el.tarefasResponsavel.addEventListener('change', () => {
    responsavel = el.tarefasResponsavel.value;
    render();
  });
  el.tarefasCliente.addEventListener('change', () => {
    cliente = el.tarefasCliente.value;
    render();
  });
  el.tarefasBusca.addEventListener('input', () => {
    busca = el.tarefasBusca.value.trim().toLowerCase();
    render();
  });
}

function ligarEditor() {
  el.tarefaForm.addEventListener('submit', salvarEditor);
  el.tarefaFechar.addEventListener('click', pedirParaFechar);
  // Esc tratado no teclado: depois de um cancel recusado, o Chrome fecha o dialog no Esc seguinte sem perguntar
  el.tarefaEditor.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      pedirParaFechar();
    }
  });
  el.tarefaEditor.addEventListener('cancel', (evento) => evento.preventDefault());
  el.tarefaEditor.addEventListener('close', () => {
    editada = null;
  });
  // fecha só se o clique começou e terminou no fundo: selecionar texto e soltar fora não conta
  let comecouNoFundo = false;
  const noFundo = (evento) => {
    const caixa = el.tarefaEditor.getBoundingClientRect();
    return evento.target === el.tarefaEditor && (evento.clientX < caixa.left || evento.clientX > caixa.right
      || evento.clientY < caixa.top || evento.clientY > caixa.bottom);
  };
  el.tarefaEditor.addEventListener('pointerdown', (evento) => {
    comecouNoFundo = noFundo(evento);
  });
  el.tarefaEditor.addEventListener('click', (evento) => {
    if (comecouNoFundo && noFundo(evento)) {
      pedirParaFechar();
    }
    comecouNoFundo = false;
  });
  el.tarefaApagar.addEventListener('click', apagarEditada);
  el.tNovoItem.addEventListener('keydown', adicionarItem);
  el.tChecklist.addEventListener('change', mexerNoChecklist);
  el.tChecklist.addEventListener('click', mexerNoChecklist);
  el.tCommits.addEventListener('input', mexerNosCommits);
  el.tCommits.addEventListener('click', mexerNosCommits);
  el.tNovoCommit.addEventListener('click', novoCommit);
  el.tFocar.addEventListener('click', () => editada?.id && focarEm(editada.id));
  el.tTitulo.addEventListener('input', () => {
    el.tarefaEditorTitulo.textContent = el.tTitulo.value.trim() || 'Nova tarefa';
  });
}

/**
 * @description Liga a tela de Tarefas e o bloco do Hoje, e carrega as tarefas da empresa do servidor
 * @param {{id: string, empresaId: string, ehAdm: boolean}} quem - o usuário logado
 */
export async function iniciarTarefas(quem) {
  store.definirSessao(quem);
  opcoes(el.tPrioridade, PRIORIDADES);
  opcoes(el.tRecorrencia, RECORRENCIAS, 'Não se repete');

  [el.tarefasLinhas, el.hojeTarefas, el.tarefasKanban].forEach((area) => area.addEventListener('click', agirNaTarefa));
  el.tarefasKanban.addEventListener('keydown', (evento) => {
    if ((evento.key === 'Enter' || evento.key === ' ') && evento.target.matches('[role="button"][data-acao]')) {
      evento.preventDefault();
      agirNaTarefa(evento);
    }
  });
  el.tarefaRapida.addEventListener('submit', adicionarRapido);
  ligarFiltros();
  ligarEditor();
  ligarKanban();
  ligarMenuDeStatus();

  store.assinar(render);
  store.assinarFoco((id) => editada?.id === id && pintarFocoDoEditor());
  aoMudarTarefaEmFoco(render);
  render();

  try {
    await store.carregar();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('carregar as tarefas', erro));
    el.tarefasSub.textContent = 'Não foi possível carregar as tarefas.';
  }
}
