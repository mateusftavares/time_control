import { hoje, hhmm, textoSaldo, rotuloDia, diaDaSemana, somaMes, DIAS_SEMANA, MESES } from '/shared/tempo.js';
import { avaliar, carga as cargaDoRegistro, ehUtil, cargaPadraoDe, TOLERANCIA, INICIO_HISTORICO } from '/shared/regras.js';
import * as store from './registros.js';
import { elementos, escapar } from './util.js';

const ORIGEM = 'mes';
const ROTULO = {
  pendente: 'Sem marcação', aberto: 'Em aberto', normal: 'Trabalhado',
  feriado: 'Feriado', folga: 'Folga', compensacao: 'Compensação',
};
const ABONADOS = ['feriado', 'folga', 'compensacao'];
const FILTROS = {
  todos: () => true,
  pendentes: (avaliacao) => avaliacao.estado === 'pendente',
  abonados: (avaliacao) => ABONADOS.includes(avaliacao.estado),
};
const MESES_NO_GRAFICO = 12;
const ALTURA_MAXIMA_BARRA_PX = 46;
const VERIFICAR_VIRADA_MS = 30 * 1000;
const AVISO_SALVO_MS = 1500;

const el = elementos([
  'bancoSub', 'filtros', 'saldoMes', 'saldoCap', 'trabalhadoRotulo', 'totalTrabalhado', 'capDias',
  'totalPendentes', 'capPendentes', 'mesCorpo', 'mesEstado',
  'editor', 'diaTitulo', 'diaFechar', 'tipoGrid', 'diaMarcacoes', 'dChegada', 'dAlmocoIni', 'dAlmocoFim', 'dSaida',
  'previaTrabalhado', 'previaSaldo', 'previaNota', 'diaSalvar', 'diaApagar',
  'ladoBanco', 'ladoMes', 'ladoPendentes', 'hojeBanco', 'hojeBancoCap', 'grafico', 'graficoMeses',
]);

const mesesAbertos = new Set([hoje().slice(0, 7)]);
let diaDaTela = hoje();
let filtro = 'todos';
let diaEditado = null;
let tipoEditado = 'normal';

const COR_DO_SINAL = { pos: 'cor-positivo', neg: 'cor-negativo', zero: 'cor-zero' };
const classeSaldo = (saldo) => (saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : 'zero');
const corDoSaldo = (saldo) => COR_DO_SINAL[classeSaldo(saldo)];
const nomeDoMes = (anoMes) => MESES[Number(anoMes.slice(5, 7)) - 1];

function mesComAno(anoMes) {
  return `${nomeDoMes(anoMes)} ${anoMes.slice(0, 4)}`;
}

/* Dias úteis do mês até hoje: é isso que faz um dia trabalhado e não registrado
   aparecer sozinho como "sem marcação". Fim de semana só entra se tiver registro. */
function diasDoMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const limite = hoje();
  const dias = [];

  for (let d = 1; d <= ultimo; d++) {
    const dia = `${anoMes}-${String(d).padStart(2, '0')}`;
    if (dia > limite) {
      break;
    }
    if (ehUtil(dia) || store.obter(dia)) {
      dias.push(dia);
    }
  }
  return dias;
}

/* Do mês mais antigo até o atual, do mais recente para o mais velho. */
function mesesDisponiveis() {
  const atual = hoje().slice(0, 7);
  let maisAntigo = INICIO_HISTORICO < atual ? INICIO_HISTORICO : atual;

  store.todos().forEach((registro) => {
    const anoMes = registro.dia.slice(0, 7);
    if (anoMes < maisAntigo) {
      maisAntigo = anoMes;
    }
  });

  const meses = [];
  for (let cursor = atual; cursor >= maisAntigo; cursor = somaMes(cursor, -1)) {
    meses.push(cursor);
  }
  return meses;
}

function totaisDe(dias) {
  const totais = { saldo: 0, trabalhado: 0, fechados: 0, pendentes: 0 };

  dias.forEach((dia) => {
    const avaliacao = avaliar(store.obter(dia));
    if (avaliacao.estado === 'pendente') {
      totais.pendentes++;
      return;
    }
    if (avaliacao.saldo === null) {
      return;
    }
    totais.saldo += avaliacao.saldo;
    totais.fechados++;
    totais.trabalhado += avaliacao.trabalhado ?? 0;
  });

  return totais;
}

function celula(valor) {
  return valor ? `<span class="num">${escapar(valor)}</span>` : '<span class="num vazio">—</span>';
}

function linhaDoDia(dia) {
  const avaliacao = avaliar(store.obter(dia));
  const marcacoes = ABONADOS.includes(avaliacao.estado) ? null : store.obter(dia);
  const ehHoje = dia === hoje();
  const rotulo = ehHoje && avaliacao.estado === 'aberto' ? 'Em aberto · hoje' : ROTULO[avaliacao.estado];
  const saldo = avaliacao.saldo === null
    ? '<span class="num vazio">—</span>'
    : `<span class="num saldo ${classeSaldo(avaliacao.saldo)}">${textoSaldo(avaliacao.saldo)}</span>`;

  return `<button type="button" class="linha-tabela linha-dia" data-dia="${escapar(dia)}" data-hoje="${ehHoje}" aria-current="${dia === diaEditado}">`
    + `<span class="dia">${escapar(rotuloDia(dia))}</span>`
    + `<span><span class="etiqueta" data-tipo="${avaliacao.estado}">${rotulo}</span></span>`
    + celula(marcacoes?.chegada) + celula(marcacoes?.almocoIni)
    + celula(marcacoes?.almocoFim) + celula(marcacoes?.saida)
    + celula(avaliacao.trabalhado === null ? null : hhmm(avaliacao.trabalhado))
    + saldo
    + '</button>';
}

function grupoDoMes(anoMes, dias, totais) {
  const aberto = filtro !== 'todos' || mesesAbertos.has(anoMes);
  const resumo = totais.pendentes > 0
    ? `${totais.pendentes} sem marcação · ${totais.fechados} fechados`
    : `${totais.fechados} dias fechados`;

  const comFiltro = filtro !== 'todos' ? ' disabled' : '';
  return `<button type="button" class="linha-tabela mes-cabeca" data-mes="${escapar(anoMes)}" aria-expanded="${aberto}"${comFiltro}>`
    + '<span class="mes-nome"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>'
    + `${mesComAno(anoMes)}</span>`
    + `<span class="mes-resumo">${resumo}</span>`
    + `<span class="num mono">${hhmm(totais.trabalhado)}</span>`
    + `<span class="num mono saldo ${classeSaldo(totais.saldo)}">${textoSaldo(totais.saldo)}</span>`
    + '</button>'
    + (aberto && dias.length ? `<div class="mes-dias">${dias.map(linhaDoDia).join('')}</div>` : '');
}

function pintarValor(elemento, saldo) {
  elemento.textContent = textoSaldo(saldo);
  elemento.classList.remove('cor-positivo', 'cor-negativo', 'cor-zero');
  elemento.classList.add(corDoSaldo(saldo));
}

function pintarGrafico(meses, totaisPorMes) {
  const cronologicos = [...meses].reverse().slice(-MESES_NO_GRAFICO);
  const maior = Math.max(1, ...cronologicos.map((anoMes) => Math.abs(totaisPorMes.get(anoMes).saldo)));
  const atual = hoje().slice(0, 7);

  el.grafico.replaceChildren(...cronologicos.map((anoMes) => {
    const saldo = totaisPorMes.get(anoMes).saldo;
    const coluna = document.createElement('div');
    const barra = document.createElement('span');
    coluna.className = 'grafico-coluna';
    coluna.title = `${mesComAno(anoMes)}: ${textoSaldo(saldo)}`;
    barra.className = 'grafico-barra ' + (saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : 'zero');
    if (saldo !== 0) {
      barra.style.height = Math.max(2, Math.round((Math.abs(saldo) / maior) * ALTURA_MAXIMA_BARRA_PX)) + 'px';
    }
    coluna.append(barra);
    return coluna;
  }));
  el.grafico.setAttribute('aria-label', 'Saldo por mês: '
    + cronologicos.map((anoMes) => `${nomeDoMes(anoMes)} ${textoSaldo(totaisPorMes.get(anoMes).saldo)}`).join(', '));

  el.graficoMeses.replaceChildren(...cronologicos.map((anoMes) => {
    const rotulo = document.createElement('span');
    rotulo.textContent = nomeDoMes(anoMes).slice(0, 3);
    rotulo.className = anoMes === atual ? 'atual' : '';
    return rotulo;
  }));
}

function periodoDoHistorico(meses) {
  const [ultimo, primeiro] = [meses[0], meses[meses.length - 1]];
  return primeiro.slice(0, 4) === ultimo.slice(0, 4)
    ? `${nomeDoMes(primeiro)} a ${nomeDoMes(ultimo)} de ${ultimo.slice(0, 4)}`
    : `${mesComAno(primeiro)} a ${mesComAno(ultimo)}`;
}

function pintarResumos(meses, totaisPorMes) {
  const banco = meses.reduce((soma, anoMes) => soma + totaisPorMes.get(anoMes).saldo, 0);
  const pendentes = meses.reduce((soma, anoMes) => soma + totaisPorMes.get(anoMes).pendentes, 0);
  const mesAtual = totaisPorMes.get(meses[0]);

  el.bancoSub.textContent = `${periodoDoHistorico(meses)} · ${store.todos().size} dias registrados`;
  pintarValor(el.saldoMes, banco);
  el.saldoCap.textContent = `${meses.length} meses somados · tolerância de ${TOLERANCIA} min por dia`;
  el.trabalhadoRotulo.textContent = `Trabalhado em ${nomeDoMes(meses[0])}`;
  el.totalTrabalhado.textContent = hhmm(mesAtual.trabalhado);
  el.capDias.textContent = `${mesAtual.fechados} dias fechados · saldo do mês ${textoSaldo(mesAtual.saldo)}`;
  el.totalPendentes.textContent = pendentes;
  el.totalPendentes.className = 'numero-valor grande mono ' + (pendentes ? 'cor-erro' : 'cor-positivo');
  el.capPendentes.textContent = pendentes ? 'precisam de correção' : `tudo em dia desde ${nomeDoMes(meses[meses.length - 1])}`;

  pintarValor(el.ladoBanco, banco);
  pintarValor(el.ladoMes, mesAtual.saldo);
  el.ladoPendentes.textContent = pendentes ? `${pendentes} dia(s)` : 'nenhum';
  el.ladoPendentes.className = pendentes ? 'cor-erro' : 'cor-positivo';

  pintarValor(el.hojeBanco, banco);
  el.hojeBancoCap.textContent = `acumulado desde ${nomeDoMes(meses[meses.length - 1])}`;
  pintarGrafico(meses, totaisPorMes);
}

function render() {
  const meses = mesesDisponiveis();
  const totaisPorMes = new Map(meses.map((anoMes) => [anoMes, totaisDe(diasDoMes(anoMes))]));
  const passaNoFiltro = (dia) => FILTROS[filtro](avaliar(store.obter(dia)));

  const html = meses.map((anoMes) => {
    const dias = diasDoMes(anoMes).filter(passaNoFiltro);
    return filtro !== 'todos' && dias.length === 0 ? '' : grupoDoMes(anoMes, dias, totaisPorMes.get(anoMes));
  }).join('');

  el.mesCorpo.innerHTML = html;
  el.mesEstado.hidden = html !== '';
  el.mesEstado.textContent = filtro === 'pendentes' ? 'Nenhum dia sem marcação: tudo em dia.' : 'Nenhum dia abonado no período.';
  pintarResumos(meses, totaisPorMes);
}

function marcacoesDoEditor() {
  return {
    chegada: el.dChegada.value || null,
    almocoIni: el.dAlmocoIni.value || null,
    almocoFim: el.dAlmocoFim.value || null,
    saida: el.dSaida.value || null,
  };
}

function pintarPrevia(trabalhado, saldo, nota) {
  el.previaTrabalhado.textContent = trabalhado;
  el.previaSaldo.textContent = textoSaldo(saldo);
  el.previaSaldo.className = 'mono ' + (saldo === null ? 'cor-zero' : corDoSaldo(saldo));
  el.previaNota.textContent = nota;
}

/* A jornada do dia pode ter sido mudada na tela Hoje; a prévia usa a mesma que o salvar vai gravar. */
function jornadaDoDiaEditado() {
  return store.obter(diaEditado)?.carga ?? hhmm(cargaPadraoDe(diaEditado));
}

function previaDoEditor() {
  if (tipoEditado === 'compensacao') {
    pintarPrevia('—', -cargaDoRegistro({ dia: diaEditado, carga: jornadaDoDiaEditado() }), 'O dia consome a jornada inteira do banco.');
    return;
  }
  if (tipoEditado !== 'normal') {
    pintarPrevia('—', 0, 'Dia abonado: não mexe no banco.');
    return;
  }

  const avaliacao = avaliar({ dia: diaEditado, tipo: 'normal', carga: jornadaDoDiaEditado(), ...marcacoesDoEditor() });
  if (avaliacao.trabalhado === null) {
    pintarPrevia('—', null, 'Informe chegada e saída para fechar o dia.');
    return;
  }
  pintarPrevia(hhmm(avaliacao.trabalhado), avaliacao.saldo,
    avaliacao.saldo === 0 ? `dentro da tolerância de ${TOLERANCIA} min` : '');
}

function pintarTipos() {
  el.tipoGrid.querySelectorAll('.tipo').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.tipo === tipoEditado));
  });
  el.diaMarcacoes.hidden = tipoEditado !== 'normal';
  previaDoEditor();
}

function abrirEditor(dia) {
  const registro = store.obter(dia) ?? {};
  diaEditado = dia;
  tipoEditado = registro.tipo ?? 'normal';
  el.dChegada.value = registro.chegada ?? '';
  el.dAlmocoIni.value = registro.almocoIni ?? '';
  el.dAlmocoFim.value = registro.almocoFim ?? '';
  el.dSaida.value = registro.saida ?? '';

  const [ano, mes, d] = dia.split('-');
  const semana = DIAS_SEMANA[diaDaSemana(dia)];
  el.diaTitulo.textContent = `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d}/${mes}/${ano}`;
  el.diaSalvar.textContent = 'Salvar dia';
  el.editor.hidden = false;
  pintarTipos();
  render();
  (tipoEditado === 'normal' ? el.dChegada : el.tipoGrid.querySelector('[aria-pressed="true"]')).focus();
}

/* O render recria as linhas; o foco volta para a linha do dia que estava aberto, para seguir pelo teclado. */
function fecharEditor() {
  const diaQueFechou = diaEditado;
  diaEditado = null;
  el.editor.hidden = true;
  render();
  el.mesCorpo.querySelector(`[data-dia="${CSS.escape(diaQueFechou)}"]`)?.focus();
}

function apagarDia() {
  const [, mes, d] = diaEditado.split('-');
  if (!window.confirm(`Apagar o registro de ${d}/${mes}? O dia volta a contar como sem marcação.`)) {
    return;
  }
  store.apagar(diaEditado, ORIGEM);
  fecharEditor();
}

function salvarEditor() {
  const ehNormal = tipoEditado === 'normal';
  const marcacoes = marcacoesDoEditor();

  store.salvar({
    dia: diaEditado,
    tipo: tipoEditado,
    carga: jornadaDoDiaEditado(),
    chegada: ehNormal ? marcacoes.chegada : null,
    almocoIni: ehNormal ? marcacoes.almocoIni : null,
    almocoFim: ehNormal ? marcacoes.almocoFim : null,
    saida: ehNormal ? marcacoes.saida : null,
  }, ORIGEM);

  el.diaSalvar.textContent = 'Salvo';
  setTimeout(() => {
    el.diaSalvar.textContent = 'Salvar dia';
  }, AVISO_SALVO_MS);
}

function trocarFiltro(novo) {
  filtro = novo;
  el.filtros.querySelectorAll('[data-filtro]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.filtro === filtro));
  });
  render();
}

/**
 * @description Liga o histórico, o editor de dia e os resumos do banco (barra lateral e tela Hoje)
 */
export function iniciarMes() {
  store.assinar(render);

  el.mesCorpo.addEventListener('click', (evento) => {
    const linha = evento.target.closest('[data-dia]');
    if (linha) {
      abrirEditor(linha.dataset.dia);
      return;
    }

    const cabecalho = evento.target.closest('[data-mes]');
    if (cabecalho && filtro === 'todos') {
      const anoMes = cabecalho.dataset.mes;
      if (mesesAbertos.has(anoMes)) {
        mesesAbertos.delete(anoMes);
      } else {
        mesesAbertos.add(anoMes);
      }
      render();
    }
  });

  el.filtros.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-filtro]');
    if (botao) {
      trocarFiltro(botao.dataset.filtro);
    }
  });

  el.tipoGrid.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.tipo');
    if (botao) {
      tipoEditado = botao.dataset.tipo;
      pintarTipos();
    }
  });
  ['dChegada', 'dAlmocoIni', 'dAlmocoFim', 'dSaida'].forEach((id) => el[id].addEventListener('input', previaDoEditor));
  el.diaFechar.addEventListener('click', fecharEditor);
  el.diaSalvar.addEventListener('click', salvarEditor);
  el.diaApagar.addEventListener('click', apagarDia);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !el.editor.hidden) {
      fecharEditor();
    }
  });

  // com a página aberta na virada, o dia novo (e, no dia 1º, o mês novo) precisa aparecer sozinho
  setInterval(() => {
    if (hoje() !== diaDaTela) {
      diaDaTela = hoje();
      mesesAbertos.add(diaDaTela.slice(0, 7));
      render();
    }
  }, VERIFICAR_VIRADA_MS);

  render();
}
