/* Protótipo da tela de Tarefas: dados de exemplo, sem Supabase. Parâmetros de URL:
   ?abrir=<id> abre a tarefa, &aba=atividade escolhe a aba, &visao=kanban troca a visão. */

const HOJE = '2026-10-29';
const STATUS = {
  a_fazer: 'A fazer', em_andamento: 'Em andamento', commit_realizado: 'Commit realizado',
  pendente_teste: 'Pendente de teste', aguardando: 'Aguardando', concluida: 'Concluída',
};
const PRIORIDADES = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const PESO = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

const TAREFAS = [
  {
    id: 113, titulo: 'TimEver: redesign de Tarefas no formato do OpenProject', cliente: 'TimEver', status: 'em_andamento',
    prioridade: 'alta', prazo: '2026-10-29', recorrencia: null, focoMin: 50,
    anotacoes: 'Tabela + detalhe com abas. Tela dividida só acima de 1400px; folha no tablet; tela cheia no celular.',
    checklist: [{ texto: 'Protótipo nos três tamanhos', feito: true }, { texto: 'Aprovação do visual', feito: false }, { texto: 'Histórico de status', feito: false }, { texto: 'Comentários', feito: false }],
    commits: [],
    atividade: [
      { tipo: 'criada', quando: '2026-10-29T10:12' },
      { tipo: 'status', de: 'a_fazer', para: 'em_andamento', quando: '2026-10-29T15:40' },
      { tipo: 'comentario', texto: 'Decidido: não usar o código do OpenProject, só o padrão de tela.', quando: '2026-10-29T16:05' },
    ],
  },
  {
    id: 112, titulo: 'Workflow: excluir etapa de aprovação no editor de fluxos', cliente: 'LeverPro 10x', status: 'commit_realizado',
    prioridade: 'alta', prazo: '2026-10-28', recorrencia: null, focoMin: 95,
    anotacoes: 'Botão de lixeira ao lado do lápis, mesma permissão de excluir o workflow. Ao excluir a 4, a 5 vira a nova 4.',
    checklist: [{ texto: 'Botão ao lado do lápis', feito: true }, { texto: 'Renumerar etapas seguintes', feito: true }, { texto: 'Gate code-reviewer + security', feito: true }],
    commits: [{ hash: '0cca8936d', branch: 'DEV/mateus_tavares_10x_new_arch', data: '2026-10-29' }],
    atividade: [
      { tipo: 'criada', quando: '2026-10-27T09:02' },
      { tipo: 'campo', campo: 'Prazo', de: '—', para: '28/10', quando: '2026-10-27T09:03' },
      { tipo: 'status', de: 'a_fazer', para: 'em_andamento', quando: '2026-10-29T09:30' },
      { tipo: 'comentario', texto: 'Excluir a etapa do meio precisa renumerar a ordem e os nomes padrão "Etapa N".', quando: '2026-10-29T10:14' },
      { tipo: 'status', de: 'em_andamento', para: 'commit_realizado', quando: '2026-10-29T11:52' },
    ],
  },
  {
    id: 111, titulo: 'Workflow: abas Workflows e Pacotes bloqueadas para Visualizador e Planejador', cliente: 'LeverPro 10x', status: 'commit_realizado',
    prioridade: 'normal', prazo: '2026-10-28', recorrencia: null, focoMin: 40, anotacoes: '', checklist: [],
    commits: [{ hash: '8956305af', branch: 'DEV/mateus_tavares_10x_new_arch', data: '2026-10-29' }],
    atividade: [{ tipo: 'criada', quando: '2026-10-27T09:05' }, { tipo: 'status', de: 'a_fazer', para: 'commit_realizado', quando: '2026-10-29T13:20' }],
  },
  {
    id: 108, titulo: 'Detalhamento: nova coluna Histórico na seleção de colunas', cliente: 'LeverPro 10x', status: 'pendente_teste',
    prioridade: 'normal', prazo: null, recorrencia: null, focoMin: 180, anotacoes: '', checklist: [],
    commits: [{ hash: '2ae2186fa', branch: 'DEV/mateus_tavares_10x_new_arch', data: '2026-10-24' }],
    atividade: [{ tipo: 'criada', quando: '2026-10-22T08:40' }, { tipo: 'status', de: 'commit_realizado', para: 'pendente_teste', quando: '2026-10-27T17:02' }],
  },
  {
    id: 104, titulo: 'ESPRO P49: ƒx sem herança de abertura', cliente: 'ESPRO', status: 'aguardando',
    prioridade: 'urgente', prazo: '2026-10-25', recorrencia: null, focoMin: 210,
    anotacoes: 'Plano pronto. Aguardando respostas P1–P8 do diretor.', checklist: [{ texto: 'Plano', feito: true }, { texto: 'Respostas P1–P8', feito: false }], commits: [],
    atividade: [{ tipo: 'criada', quando: '2026-10-19T14:00' }, { tipo: 'status', de: 'em_andamento', para: 'aguardando', quando: '2026-10-20T18:10' }],
  },
  {
    id: 101, titulo: 'Varredura de SQL injection nas procedures', cliente: 'LeverPro 10x', status: 'aguardando',
    prioridade: 'alta', prazo: null, recorrencia: null, focoMin: 160, anotacoes: '', checklist: [], commits: [],
    atividade: [{ tipo: 'criada', quando: '2026-10-28T09:00' }],
  },
  {
    id: 99, titulo: 'PH / TOTVS: offset — testar e espelhar na 10x', cliente: 'LeverPro legado', status: 'a_fazer',
    prioridade: 'normal', prazo: '2026-11-04', recorrencia: null, focoMin: 0, anotacoes: '', checklist: [], commits: [],
    atividade: [{ tipo: 'criada', quando: '2026-10-15T11:20' }],
  },
  {
    id: 97, titulo: 'Conferir o banco de horas da semana', cliente: 'TimEver', status: 'a_fazer',
    prioridade: 'baixa', prazo: '2026-10-31', recorrencia: 'semanal', focoMin: 0, anotacoes: '', checklist: [], commits: [],
    atividade: [{ tipo: 'criada', quando: '2026-10-24T08:00' }],
  },
  {
    id: 90, titulo: 'Vendemmia: permissão de cenário', cliente: 'LeverPro 10x', status: 'concluida',
    prioridade: 'alta', prazo: '2026-10-28', recorrencia: null, focoMin: 300, anotacoes: '', checklist: [],
    commits: [{ hash: '7d9de5742', branch: 'master10x', data: '2026-10-28' }],
    atividade: [{ tipo: 'criada', quando: '2026-10-21T10:00' }, { tipo: 'status', de: 'pendente_teste', para: 'concluida', quando: '2026-10-28T19:00' }],
  },
];

const estado = {
  visao: 'tabela', filtro: 'abertas', agrupar: 'status', busca: '',
  aberta: null, aba: 'geral', cheio: false, fechados: new Set(),
};
const el = Object.fromEntries(['area', 'principal', 'divisor', 'detalhe', 'veu', 'menuStatus', 'tarefasSub', 'busca', 'agrupar']
  .map((id) => [id, document.getElementById(id)]));

/* ---------- utilidades ---------- */
function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') elemento.className = valor;
    else if (chave.startsWith('on')) elemento.addEventListener(chave.slice(2), valor);
    else elemento.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho !== null && filho !== undefined && filho !== false) elemento.append(filho instanceof Node ? filho : String(filho));
  }
  return elemento;
}

const CAMINHOS = {
  seta: ['M6 9l6 6 6-6'], fechar: ['M6 6l12 12', 'M18 6L6 18'], voltar: ['M15 6l-6 6 6 6'],
  expandir: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'], recolher: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
  mais: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], estrela: ['M12 5v14', 'M5 12h14'], troca: ['M7 7h11l-3-3', 'M17 17H6l3 3'],
  lapis: ['M4 20h4L19 9l-4-4L4 16z'],
};
function icone(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of CAMINHOS[nome]) {
    const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caminho.setAttribute('d', d);
    svg.append(caminho);
  }
  return svg;
}
function iconePlay() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cheio');
  const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  caminho.setAttribute('d', 'M8 5v14l11-7z');
  svg.append(caminho);
  return svg;
}

const data = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const dataHora = (iso) => `${data(iso)} às ${iso.slice(11, 16)}`;
const foco = (min) => (min ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : '—');
const modo = () => (innerWidth >= 1400 ? 'largo' : innerWidth >= 792 ? 'medio' : 'estreito');
const situacao = (prazo) => (!prazo ? null : prazo < HOJE ? 'vencida' : prazo === HOJE ? 'hoje' : 'futura');

function visiveis() {
  const termo = estado.busca.trim().toLowerCase();
  return TAREFAS.filter((tarefa) => {
    if (estado.filtro === 'abertas' && tarefa.status === 'concluida') return false;
    if (estado.filtro === 'concluidas' && tarefa.status !== 'concluida') return false;
    if (estado.filtro === 'hoje' && (tarefa.status === 'concluida' || !tarefa.prazo || tarefa.prazo > HOJE)) return false;
    return !termo || `${tarefa.titulo} ${tarefa.cliente}`.toLowerCase().includes(termo);
  }).sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade] || String(a.prazo ?? '9').localeCompare(String(b.prazo ?? '9')));
}

function grupos(tarefas) {
  if (estado.agrupar === 'nenhum') return [{ chave: 'todas', titulo: null, tarefas }];
  const chaves = estado.agrupar === 'status' ? Object.keys(STATUS) : [...new Set(tarefas.map((t) => t.cliente))].sort();
  return chaves
    .map((chave) => ({
      chave,
      titulo: estado.agrupar === 'status' ? STATUS[chave] : chave,
      tarefas: tarefas.filter((t) => (estado.agrupar === 'status' ? t.status : t.cliente) === chave),
    }))
    .filter((grupo) => grupo.tarefas.length);
}

/* ---------- peças ---------- */
function etiquetaStatus(tarefa) {
  return h('button', {
    class: 'etiqueta-status', type: 'button', 'data-status': tarefa.status, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: (evento) => { evento.stopPropagation(); abrirMenu(evento.currentTarget, tarefa); },
  }, STATUS[tarefa.status], icone('seta'));
}
function prazo(tarefa) {
  return h('span', { class: 'tarefa-prazo mono pequeno', 'data-situacao': situacao(tarefa.prazo) }, data(tarefa.prazo));
}
function botaoFocar(tarefa) {
  return h('button', {
    class: 'botao-icone tarefa-focar', type: 'button', 'aria-label': `Focar em ${tarefa.titulo}`,
    onclick: (evento) => evento.stopPropagation(),
  }, iconePlay());
}
function botaoGrupo(grupo, filhos) {
  const fechado = estado.fechados.has(grupo.chave);
  return h('button', {
    class: 'grupo-botao', type: 'button', 'aria-expanded': String(!fechado),
    onclick: () => { fechado ? estado.fechados.delete(grupo.chave) : estado.fechados.add(grupo.chave); render(); },
  }, icone('seta'), grupo.titulo, h('span', { class: 'grupo-contador' }, filhos));
}

/* ---------- visões ---------- */
function renderTabela(tarefas) {
  const corpo = h('tbody');
  for (const grupo of grupos(tarefas)) {
    if (grupo.titulo) {
      corpo.append(h('tr', { class: 'grupo' }, h('td', { colspan: '8' }, botaoGrupo(grupo, grupo.tarefas.length))));
    }
    if (estado.fechados.has(grupo.chave)) continue;
    for (const tarefa of grupo.tarefas) {
      corpo.append(h('tr', {
        class: 'linha', 'data-prioridade': tarefa.prioridade, 'data-status': tarefa.status,
        'aria-selected': String(estado.aberta === tarefa.id), tabindex: '0',
        onclick: () => abrir(tarefa.id),
        onkeydown: (evento) => { if (evento.key === 'Enter') abrir(tarefa.id); },
      },
      h('td', { class: 'col-id' }, h('span', { class: 'mono' }, `#${tarefa.id}`)),
      h('td', { class: 'col-titulo' }, h('span', { class: 'tarefa-titulo' }, tarefa.titulo), h('span', { class: 'sub-cliente' }, tarefa.cliente)),
      h('td', { class: 'col-cliente' }, tarefa.cliente),
      h('td', { class: 'col-status' }, etiquetaStatus(tarefa)),
      h('td', { class: 'col-prioridade' }, h('span', { class: 'prioridade', 'data-prioridade': tarefa.prioridade }, PRIORIDADES[tarefa.prioridade])),
      h('td', { class: 'col-prazo' }, prazo(tarefa)),
      h('td', { class: 'col-foco mono' }, foco(tarefa.focoMin)),
      h('td', { class: 'col-acao' }, botaoFocar(tarefa))));
    }
  }
  const cabeca = h('thead', {}, h('tr', {},
    h('th', { class: 'col-id' }, 'ID'), h('th', { class: 'col-titulo' }, 'Título'), h('th', { class: 'col-cliente' }, 'Cliente'),
    h('th', { class: 'col-status' }, 'Status'), h('th', { class: 'col-prioridade' }, 'Prioridade'), h('th', { class: 'col-prazo' }, 'Prazo'),
    h('th', { class: 'col-foco' }, 'Foco'), h('th', { class: 'col-acao' }, h('span', { class: 'so-leitor' }, 'Ações'))));
  return h('section', { class: 'cartao tabela-envolve', 'aria-label': 'Tabela de tarefas' }, h('table', { class: 'tabela-tarefas' }, cabeca, corpo));
}

function cartaoTarefa(tarefa) {
  const feitos = tarefa.checklist.filter((item) => item.feito).length;
  return h('div', {
    class: 'cartao-tarefa', role: 'button', tabindex: '0', 'data-prioridade': tarefa.prioridade,
    onclick: () => abrir(tarefa.id), onkeydown: (evento) => { if (evento.key === 'Enter') abrir(tarefa.id); },
  },
  h('span', { class: 'tarefa-titulo' }, tarefa.titulo),
  h('span', { class: 'tarefa-meta' }, h('span', { class: 'mono' }, `#${tarefa.id}`), tarefa.cliente,
    tarefa.checklist.length ? `☑ ${feitos}/${tarefa.checklist.length}` : null, tarefa.focoMin ? `◷ ${foco(tarefa.focoMin)}` : null),
  h('span', { class: 'cartao-tarefa-rodape' }, etiquetaStatus(tarefa), prazo(tarefa), botaoFocar(tarefa)));
}

function renderCartoes(tarefas) {
  return h('div', { class: 'lista-cartoes' }, grupos(tarefas).map((grupo) => h('section', { class: 'lista-grupo' },
    grupo.titulo ? botaoGrupo(grupo, grupo.tarefas.length) : null,
    estado.fechados.has(grupo.chave) ? null : grupo.tarefas.map(cartaoTarefa))));
}

function renderKanban(tarefas) {
  return h('section', { class: 'tarefas-kanban', 'aria-label': 'Quadro de tarefas' }, Object.keys(STATUS).map((status) => {
    const daColuna = tarefas.filter((tarefa) => tarefa.status === status);
    return h('div', { class: 'kanban-coluna' },
      h('div', { class: 'kanban-cabeca' }, h('span', { class: 'etiqueta-status', 'data-status': status }, STATUS[status]),
        h('span', { class: 'grupo-contador' }, daColuna.length)),
      h('div', { class: 'kanban-cartoes' }, daColuna.map((tarefa) => h('div', {
        class: 'tarefa-cartao', role: 'button', tabindex: '0', 'data-prioridade': tarefa.prioridade, 'data-status': tarefa.status,
        onclick: () => abrir(tarefa.id),
      }, h('span', { class: 'tarefa-titulo' }, tarefa.titulo),
      h('span', { class: 'tarefa-meta' }, tarefa.cliente, prazo(tarefa))))));
  }));
}

/* ---------- detalhe ---------- */
function abaGeral(tarefa) {
  const propriedade = (rotulo, campo) => [h('dt', {}, rotulo), h('dd', {}, campo)];
  const seletor = (opcoes, valor) => h('select', { class: 'campo-inline' },
    Object.entries(opcoes).map(([chave, texto]) => h('option', { value: chave, selected: chave === valor }, texto)));
  const feitos = tarefa.checklist.filter((item) => item.feito).length;

  return [
    h('section', { class: 'secao' },
      h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Detalhes'), h('span', { class: 'salvo' }, 'Salvo automaticamente')),
      h('dl', { class: 'propriedades' },
        propriedade('Status', seletor(STATUS, tarefa.status)),
        propriedade('Prioridade', seletor(PRIORIDADES, tarefa.prioridade)),
        propriedade('Cliente', h('input', { class: 'campo-inline', value: tarefa.cliente })),
        propriedade('Prazo', h('input', { class: 'campo-inline', type: 'date', value: tarefa.prazo ?? '' })),
        propriedade('Repetição', seletor({ '': 'Não se repete', diaria: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês' }, tarefa.recorrencia ?? '')),
        propriedade('Foco', h('span', { class: 'mono pequeno', style: 'padding-left:8px' }, `${foco(tarefa.focoMin)} · ${Math.round(tarefa.focoMin / 25)} pomodoros`)))),
    h('section', { class: 'secao' },
      h('span', { class: 'rotulo' }, 'Descrição'),
      h('textarea', { class: 'descricao', placeholder: 'Contexto, links, o que o cliente pediu…' }, tarefa.anotacoes)),
    h('section', { class: 'secao' },
      h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Checklist'),
        tarefa.checklist.length ? h('span', { class: 'texto-mudo pequeno' }, `${feitos} de ${tarefa.checklist.length}`) : null),
      tarefa.checklist.length ? h('div', { class: 'barra-progresso' }, h('i', { style: `width:${(feitos / tarefa.checklist.length) * 100}%` })) : null,
      h('div', { class: 'checklist-proto' }, tarefa.checklist.map((item) => h('label', {},
        h('input', { type: 'checkbox', checked: item.feito }), h('span', {}, item.texto)))),
      h('div', { class: 'tarefa-form tarefa-adicionar' }, h('input', { placeholder: 'Novo item e Enter', 'aria-label': 'Novo item do checklist' }))),
    h('section', { class: 'secao' },
      h('div', { class: 'secao-cabeca' }, h('span', { class: 'rotulo' }, 'Commits'), h('button', { class: 'botao-texto', type: 'button' }, '+ Adicionar commit')),
      tarefa.commits.length
        ? tarefa.commits.map((commit) => h('div', { class: 'commit-proto' },
          h('span', { class: 'mono' }, commit.hash.slice(0, 9)), h('span', { class: 'branch' }, commit.branch), h('span', { class: 'mono pequeno texto-mudo' }, data(commit.data))))
        : h('span', { class: 'texto-mudo pequeno' }, 'Nenhum commit ainda.')),
  ];
}

function evento(item) {
  if (item.tipo === 'comentario') {
    return h('li', { class: 'evento evento-comentario' }, h('span', { class: 'evento-marcador' }, 'M'),
      h('div', { class: 'evento-texto' }, h('div', { class: 'evento-linha' }, h('b', {}, 'Você comentou'), h('time', {}, dataHora(item.quando))),
        h('div', { class: 'balao' }, item.texto)));
  }
  const linha = {
    criada: [h('span', {}, 'Tarefa criada')],
    status: [h('span', {}, 'Status'), h('span', { class: 'etiqueta-status', 'data-status': item.de }, STATUS[item.de]),
      h('span', { class: 'seta' }, '→'), h('span', { class: 'etiqueta-status', 'data-status': item.para }, STATUS[item.para])],
    campo: [h('span', {}, item.campo), h('span', { class: 'texto-mudo' }, item.de), h('span', { class: 'seta' }, '→'), h('b', {}, item.para)],
  }[item.tipo];
  const marcador = { criada: 'estrela', status: 'troca', campo: 'lapis' }[item.tipo];
  return h('li', { class: 'evento' }, h('span', { class: 'evento-marcador' }, icone(marcador)),
    h('div', { class: 'evento-texto' }, h('div', { class: 'evento-linha' }, linha), h('time', {}, dataHora(item.quando))));
}

function abaAtividade(tarefa) {
  return [
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Filtrar atividade' },
      h('button', { type: 'button', 'aria-pressed': 'true' }, 'Tudo'),
      h('button', { type: 'button', 'aria-pressed': 'false' }, 'Comentários'),
      h('button', { type: 'button', 'aria-pressed': 'false' }, 'Mudanças')),
    h('form', { class: 'comentar', onsubmit: (ev) => ev.preventDefault() },
      h('label', { class: 'so-leitor', for: 'novoComentario' }, 'Novo comentário'),
      h('textarea', { id: 'novoComentario', placeholder: 'Escreva um comentário: o que o cliente respondeu, o que falta…' }),
      h('button', { class: 'botao botao-primario botao-pequeno', type: 'submit' }, 'Comentar')),
    h('ol', { class: 'linha-tempo' }, [...tarefa.atividade].reverse().map(evento)),
  ];
}

const ABAS = [
  { chave: 'geral', titulo: 'Visão geral' },
  { chave: 'atividade', titulo: 'Atividade', contador: (t) => t.atividade.length },
  { chave: 'relacoes', titulo: 'Relações', fase: 'fase 2' },
  { chave: 'horas', titulo: 'Horas', fase: 'fase 3' },
  { chave: 'arquivos', titulo: 'Arquivos', fase: 'fase 4' },
];

function renderDetalhe() {
  const tarefa = TAREFAS.find((item) => item.id === estado.aberta);
  el.detalhe.hidden = !tarefa;
  el.detalhe.classList.toggle('cheio', Boolean(tarefa) && estado.cheio);
  el.area.dataset.detalhe = tarefa && !estado.cheio ? 'aberto' : 'fechado';
  el.divisor.hidden = !tarefa || estado.cheio || modo() !== 'largo';
  el.veu.hidden = !tarefa || (modo() === 'largo' && !estado.cheio);
  document.querySelector('.capsula').style.visibility = tarefa && modo() === 'estreito' ? 'hidden' : '';
  if (!tarefa) {
    el.detalhe.replaceChildren();
    return;
  }

  const topo = h('header', { class: 'detalhe-topo' },
    h('button', { class: 'botao-icone botao-voltar', type: 'button', 'aria-label': 'Voltar para a lista', onclick: fechar }, icone('voltar')),
    h('span', { class: 'mono' }, `#${tarefa.id}`), etiquetaStatus(tarefa),
    h('div', { class: 'detalhe-topo-acoes' },
      h('button', { class: 'botao-icone so-largo', type: 'button', 'aria-label': 'Focar nesta tarefa', title: 'Focar nesta tarefa' }, iconePlay()),
      h('button', { class: 'botao-icone', type: 'button', 'aria-label': 'Mais ações', title: 'Duplicar, apagar…' }, icone('mais')),
      h('button', {
        class: 'botao-icone so-largo', type: 'button', 'aria-label': estado.cheio ? 'Recolher' : 'Abrir em tela cheia',
        title: estado.cheio ? 'Recolher' : 'Tela cheia', onclick: () => { estado.cheio = !estado.cheio; renderDetalhe(); },
      }, icone(estado.cheio ? 'recolher' : 'expandir')),
      h('button', { class: 'botao-icone so-largo', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, icone('fechar'))));

  const titulo = h('textarea', { class: 'detalhe-titulo', id: 'detalheTitulo', rows: '1', 'aria-label': 'Título', maxlength: '200' }, tarefa.titulo);

  const abas = h('nav', { class: 'abas', role: 'tablist', 'aria-label': 'Seções da tarefa' }, ABAS.map((aba) => h('button', {
    class: 'aba', type: 'button', role: 'tab', 'aria-selected': String(estado.aba === aba.chave), 'aria-disabled': aba.fase ? 'true' : null,
    onclick: () => { estado.aba = aba.chave; renderDetalhe(); },
  }, aba.titulo, aba.contador ? h('span', { class: 'contador' }, aba.contador(tarefa)) : null, aba.fase ? h('span', { class: 'fase' }, aba.fase) : null)));

  const aba = ABAS.find((item) => item.chave === estado.aba);
  const conteudo = estado.aba === 'geral' ? abaGeral(tarefa)
    : estado.aba === 'atividade' ? abaAtividade(tarefa)
      : [h('div', { class: 'em-breve' }, h('b', {}, aba.titulo), `Chega na ${aba.fase}. A aba já fica reservada no lugar.`)];

  const rodape = h('footer', { class: 'detalhe-rodape' },
    h('button', { class: 'botao botao-secundario', type: 'button' }, 'Mudar status'),
    h('button', { class: 'botao botao-primario', type: 'button' }, iconePlay(), 'Focar'));

  el.detalhe.replaceChildren(topo, titulo, abas, h('div', { class: 'detalhe-corpo', role: 'tabpanel' }, conteudo), rodape);
}

/* ---------- menu de status ---------- */
function abrirMenu(botao, tarefa) {
  fecharMenu();
  botao.setAttribute('aria-expanded', 'true');
  el.menuStatus.replaceChildren(...Object.entries(STATUS).map(([chave, texto]) => h('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': String(chave === tarefa.status),
    onclick: () => { tarefa.atividade.push({ tipo: 'status', de: tarefa.status, para: chave, quando: `${HOJE}T${new Date().toTimeString().slice(0, 5)}` }); tarefa.status = chave; fecharMenu(); render(); },
  }, h('span', { class: 'etiqueta-status', 'data-status': chave }, texto))));
  el.menuStatus.hidden = false;
  const caixa = botao.getBoundingClientRect();
  const largura = el.menuStatus.offsetWidth;
  const altura = el.menuStatus.offsetHeight;
  el.menuStatus.style.left = `${Math.max(8, Math.min(caixa.left, innerWidth - largura - 8))}px`;
  el.menuStatus.style.top = `${caixa.bottom + altura + 12 > innerHeight ? caixa.top - altura - 6 : caixa.bottom + 6}px`;
  el.menuStatus.querySelector('[aria-checked="true"]')?.focus();
}
function fecharMenu() {
  el.menuStatus.hidden = true;
  document.querySelectorAll('.etiqueta-status[aria-expanded="true"]').forEach((botao) => botao.setAttribute('aria-expanded', 'false'));
}

/* ---------- ações ---------- */
function abrir(id) {
  estado.aberta = id;
  render();
}
function fechar() {
  estado.aberta = null;
  estado.cheio = false;
  render();
}

function render() {
  const tarefas = visiveis();
  el.tarefasSub.textContent = `${tarefas.length} tarefa(s) · protótipo com dados de exemplo`;
  const visao = estado.visao === 'kanban' ? renderKanban(tarefas) : modo() === 'estreito' ? renderCartoes(tarefas) : renderTabela(tarefas);
  el.principal.replaceChildren(visao);
  renderDetalhe();
}

function ligarSegmentado(id, chave) {
  document.getElementById(id).addEventListener('click', (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    estado[chave] = botao.dataset[chave];
    botao.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
    render();
  });
}

function ligarDivisor() {
  const raiz = document.documentElement;
  try {
    const salvo = localStorage.getItem('prototipo-largura-detalhe');
    if (salvo) raiz.style.setProperty('--largura-detalhe', `${Number(salvo)}px`);
  } catch { /* sem armazenamento: fica a largura padrão */ }

  el.divisor.addEventListener('pointerdown', (inicio) => {
    el.divisor.setPointerCapture(inicio.pointerId);
    el.divisor.classList.add('arrastando');
    const direita = el.area.getBoundingClientRect().right;
    const mover = (ev) => {
      const largura = Math.round(Math.min(Math.max(direita - ev.clientX, 420), el.area.clientWidth * 0.62));
      raiz.style.setProperty('--largura-detalhe', `${largura}px`);
    };
    const soltar = () => {
      el.divisor.classList.remove('arrastando');
      el.divisor.removeEventListener('pointermove', mover);
      try { localStorage.setItem('prototipo-largura-detalhe', parseInt(raiz.style.getPropertyValue('--largura-detalhe'), 10)); } catch { /* idem */ }
    };
    el.divisor.addEventListener('pointermove', mover);
    el.divisor.addEventListener('pointerup', soltar, { once: true });
  });
}

function iniciar() {
  const parametros = new URLSearchParams(location.search);
  const abrirId = Number(parametros.get('abrir'));
  if (TAREFAS.some((tarefa) => tarefa.id === abrirId)) estado.aberta = abrirId;
  if (ABAS.some((aba) => aba.chave === parametros.get('aba'))) estado.aba = parametros.get('aba');
  if (parametros.get('visao') === 'kanban') {
    estado.visao = 'kanban';
    document.querySelectorAll('#visao button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.visao === 'kanban')));
  }

  ligarSegmentado('visao', 'visao');
  ligarSegmentado('filtro', 'filtro');
  el.agrupar.addEventListener('change', () => { estado.agrupar = el.agrupar.value; render(); });
  el.busca.addEventListener('input', () => { estado.busca = el.busca.value; render(); });
  document.getElementById('tarefaRapida').addEventListener('submit', (ev) => ev.preventDefault());
  el.veu.addEventListener('click', fechar);
  document.addEventListener('pointerdown', (ev) => {
    if (!el.menuStatus.hidden && !el.menuStatus.contains(ev.target) && !ev.target.closest('.etiqueta-status')) fecharMenu();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!el.menuStatus.hidden) fecharMenu();
    else if (estado.aberta) fechar();
  });
  let modoAtual = modo();
  addEventListener('resize', () => {
    fecharMenu();
    if (modo() !== modoAtual) { modoAtual = modo(); render(); }
  });
  ligarDivisor();
  render();
}

iniciar();
