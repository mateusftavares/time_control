import { hoje, paraMin, hhmm, agoraMin, MINUTOS_POR_DIA } from '/shared/tempo.js';
import {
  MARCACOES, NOMES_DAS_MARCACOES, ALMOCO_MINIMO,
  cargaPadraoDe, calcularDiaEmAndamento, validarMarcacoes, trabalhado,
} from '/shared/regras.js';
import { jornadaDe, textoTolerancia } from '/shared/jornada.js';
import * as store from './registros.js';
import { elementos, textoComDestaque, teclaLimpa } from './util.js';
import { tituloPonto } from './titulo.js';
import { telaAtual } from './navegacao.js';

const ORIGEM = 'ponto';
const CAMPOS = [...MARCACOES, 'carga'];
const MEIO_DIA = 12 * 60;
const INICIO_SEM_CHEGADA = 8 * 60;
const JANELA_MINIMA = 10 * 60;
const JANELA_MAXIMA = 18 * 60;
const JANELA_LONGA = 12 * 60;
const PASSO_DAS_HORAS = 120;
const PASSO_DAS_HORAS_NA_JANELA_LONGA = 180;
const NOME_DO_SEGMENTO = {
  trabalho: 'trabalhado', almoco: 'almoço', previsto: 'a trabalhar', 'almoco-previsto': 'almoço previsto',
};

const el = elementos([
  'hojeTitulo', 'hojeSub', 'agora', 'btnBater', 'btnBaterTexto', 'menuPrevisao',
  'cardPonto', 'previsao', 'pontoSub', 'fasePill', 'percentual', 'trilho', 'trilhoHoras',
  'chegada', 'almocoIni', 'almocoFim', 'saida', 'carga',
  'erroChegada', 'erroAlmocoIni', 'erroAlmocoFim', 'erroSaida',
  'trabalhado', 'capTrabalhado', 'labelRestante', 'restante', 'capRestante', 'almoco', 'capAlmoco',
  'formula', 'btnLimpar',
]);

const ERRO = { chegada: el.erroChegada, almocoIni: el.erroAlmocoIni, almocoFim: el.erroAlmocoFim, saida: el.erroSaida };
const CARTAO = Object.fromEntries(MARCACOES.map((campo) => [campo, document.querySelector(`.marcacao[data-campo="${campo}"]`)]));

let diaAtual = hoje();
let tipoDoDia = 'normal';
let ultimaPintura = '';

function lerMinutos() {
  return Object.fromEntries(CAMPOS.map((campo) => [campo, paraMin(el[campo].value)]));
}

function registroDoDia() {
  const registro = { dia: diaAtual, tipo: tipoDoDia };
  CAMPOS.forEach((campo) => {
    registro[campo] = el[campo].value || null;
  });
  return registro;
}

/**
 * @description Preenche os campos com um registro; sem registro, limpa as marcações e volta à jornada do dia
 * @param {object|null} registro
 */
function preencher(registro) {
  tipoDoDia = registro?.tipo ?? 'normal';
  MARCACOES.forEach((campo) => {
    el[campo].value = registro?.[campo] ?? '';
  });
  el.carga.value = registro?.carga ?? hhmm(cargaPadraoDe(diaAtual));
}

/* Feriado, folga e compensação não guardam marcação: quem bate um horário está dizendo que trabalhou. */
function salvar() {
  if (MARCACOES.some((campo) => el[campo].value)) {
    tipoDoDia = 'normal';
  }
  store.salvarAdiado(registroDoDia(), ORIGEM);
}

function trocarDeDiaSeVirou() {
  if (hoje() !== diaAtual) {
    diaAtual = hoje();
    preencher(store.obter(diaAtual));
  }
}

function proximaMarcacao() {
  return MARCACOES.find((campo) => !el[campo].value) ?? null;
}

function baterPonto() {
  const campo = proximaMarcacao();
  if (!campo) {
    return;
  }
  el[campo].value = hhmm(agoraMin());
  salvar();
  render();
}

function tituloDoDia() {
  const texto = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date())
    .replace('-feira', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * @description Cálculo do dia; com a saída batida, o trabalhado é o do banco de horas, que desconta o almoço mínimo
 * @param {object} marcacoes - em minutos
 * @param {number} agora
 */
function calcularDia(marcacoes, agora) {
  const calculo = calcularDiaEmAndamento(marcacoes, agora);
  if (marcacoes.saida === null) {
    return calculo;
  }
  const minutos = trabalhado(registroDoDia());
  return { ...calculo, trabalhado: minutos, restante: calculo.carga - minutos, almocoDevendo: 0 };
}

/* O almoço ainda não tirado entra ao meio-dia, se couber; o que falta do mínimo de um almoço curto vai para o fim. */
function previsaoDoResto(marcacoes, calculo, agora) {
  const resto = [];
  const almocoQueFalta = calculo.almocoDevendo;
  let cursor = agora;
  let trabalhoQueFalta = Math.max(0, calculo.restante);

  if (calculo.emAlmoco) {
    resto.push({ de: cursor, ate: cursor + almocoQueFalta, tipo: 'almoco-previsto' });
    cursor += almocoQueFalta;
  } else if (almocoQueFalta > 0 && marcacoes.almocoIni === null) {
    const inicioDoAlmoco = Math.min(Math.max(cursor, MEIO_DIA), cursor + trabalhoQueFalta);
    resto.push({ de: cursor, ate: inicioDoAlmoco, tipo: 'previsto' });
    trabalhoQueFalta -= inicioDoAlmoco - cursor;
    resto.push({ de: inicioDoAlmoco, ate: inicioDoAlmoco + almocoQueFalta, tipo: 'almoco-previsto' });
    cursor = inicioDoAlmoco + almocoQueFalta;
  }

  resto.push({ de: cursor, ate: cursor + trabalhoQueFalta, tipo: 'previsto' });

  if (almocoQueFalta > 0 && marcacoes.almocoIni !== null && !calculo.emAlmoco) {
    const fim = cursor + trabalhoQueFalta;
    resto.push({ de: fim, ate: fim + almocoQueFalta, tipo: 'almoco-previsto' });
  }
  return resto;
}

function segmentosDoDia(marcacoes, calculo, agora) {
  const fimReal = marcacoes.saida ?? agora;
  const segmentos = [];

  if (marcacoes.almocoIni !== null) {
    segmentos.push({ de: marcacoes.chegada, ate: Math.min(marcacoes.almocoIni, fimReal), tipo: 'trabalho' });
    segmentos.push({ de: marcacoes.almocoIni, ate: Math.min(marcacoes.almocoFim ?? fimReal, fimReal), tipo: 'almoco' });
    if (marcacoes.almocoFim !== null) {
      segmentos.push({ de: marcacoes.almocoFim, ate: fimReal, tipo: 'trabalho' });
    }
  } else {
    segmentos.push({ de: marcacoes.chegada, ate: fimReal, tipo: 'trabalho' });
  }

  if (marcacoes.saida === null) {
    segmentos.push(...previsaoDoResto(marcacoes, calculo, agora));
  }
  return segmentos.filter((segmento) => segmento.ate > segmento.de);
}

function janelaDoDia(inicioDoDia, segmentos, agora) {
  const inicio = Math.floor(inicioDoDia / 60) * 60;
  const ultimo = Math.max(agora, ...segmentos.map((segmento) => segmento.ate));
  const fim = Math.min(inicio + JANELA_MAXIMA, Math.max(inicio + JANELA_MINIMA, Math.ceil(ultimo / 60) * 60));
  return { inicio, fim };
}

function rotulosDasHoras(inicio, fim) {
  const passo = fim - inicio > JANELA_LONGA ? PASSO_DAS_HORAS_NA_JANELA_LONGA : PASSO_DAS_HORAS;
  const horas = [];
  for (let minuto = inicio; minuto < fim; minuto += passo) {
    horas.push(minuto);
  }
  horas.push(fim);
  return horas;
}

function pintarLinhaDoDia(marcacoes, calculo, agora) {
  const segmentos = marcacoes.chegada === null || !calculo ? [] : segmentosDoDia(marcacoes, calculo, agora);
  const { inicio, fim } = janelaDoDia(marcacoes.chegada ?? INICIO_SEM_CHEGADA, segmentos, agora);
  const porcento = (minuto) => Math.min(100, Math.max(0, ((minuto - inicio) / (fim - inicio)) * 100));

  const barras = segmentos.map((segmento) => {
    const barra = document.createElement('span');
    barra.className = `segmento segmento-${segmento.tipo}`;
    barra.style.left = porcento(segmento.de) + '%';
    barra.style.width = (porcento(segmento.ate) - porcento(segmento.de)) + '%';
    return barra;
  });

  if (calculo && marcacoes.chegada !== null && marcacoes.saida === null) {
    const marcador = document.createElement('span');
    marcador.className = 'marcador-agora';
    marcador.style.left = porcento(agora) + '%';
    barras.push(marcador);
  }
  el.trilho.replaceChildren(...barras);
  el.trilho.setAttribute('aria-label', segmentos.length
    ? 'Linha do dia: ' + segmentos.map((s) => `${NOME_DO_SEGMENTO[s.tipo]} de ${hhmm(s.de)} a ${hhmm(s.ate)}`).join(', ')
    : 'Linha do dia: sem marcações');

  el.trilhoHoras.replaceChildren(...rotulosDasHoras(inicio, fim).map((minuto) => {
    const rotulo = document.createElement('span');
    rotulo.textContent = String(Math.floor(minuto / 60) % 24).padStart(2, '0') + 'h';
    rotulo.style.left = porcento(minuto) + '%';
    return rotulo;
  }));
}

function pintarMarcacoes(erros) {
  const proxima = proximaMarcacao();

  MARCACOES.forEach((campo) => {
    let estado = '';
    if (erros[campo]) {
      estado = 'erro';
    } else if (el[campo].value) {
      estado = 'feito';
    } else if (campo === proxima) {
      estado = 'proxima';
    }
    CARTAO[campo].dataset.estado = estado;
    ERRO[campo].textContent = erros[campo];
  });

  el.btnBater.disabled = proxima === null;
  el.btnBaterTexto.textContent = proxima === null ? 'Dia encerrado' : 'Bater ponto: ' + NOMES_DAS_MARCACOES[proxima];
}

function pintarVazio(marcacoes, temErro) {
  el.cardPonto.dataset.fase = 'vazio';
  el.fasePill.textContent = temErro ? 'Corrija as marcações' : 'Informe a chegada';
  el.previsao.textContent = '--:--';
  el.pontoSub.textContent = temErro ? 'Há uma marcação fora de ordem.' : 'Bata a chegada para começar';
  el.percentual.textContent = '';
  el.trabalhado.textContent = '--:--';
  el.restante.textContent = '--:--';
  el.restante.className = 'numero-valor mono';
  el.almoco.textContent = '--:--';
  el.capAlmoco.textContent = 'mínimo de 1h';
  el.formula.textContent = 'previsão = agora + o que falta de jornada + o que falta de almoço';
  el.menuPrevisao.textContent = '';
  tituloPonto('');
  pintarLinhaDoDia(marcacoes, null, agoraMin());
}

function legendaDoAlmoco(marcacoes, calculo) {
  if (marcacoes.saida !== null) {
    return calculo.almocoTirado < ALMOCO_MINIMO ? 'descontado o mínimo de 1h' : 'mínimo de 1h cumprido';
  }
  if (calculo.almocoDevendo > 0) {
    return `falta ${hhmm(calculo.almocoDevendo)} do mínimo`;
  }
  return calculo.emAlmoco ? 'em andamento' : 'mínimo de 1h cumprido';
}

function pintarNumeros(marcacoes, calculo) {
  el.trabalhado.textContent = hhmm(calculo.trabalhado);
  el.capTrabalhado.textContent = calculo.emAlmoco ? 'congelado durante o almoço'
    : (marcacoes.saida !== null ? 'dia fechado' : 'antes e depois do almoço');

  const excedeu = calculo.restante < 0;
  el.labelRestante.textContent = excedeu ? 'Excedente' : 'Falta';
  el.restante.textContent = hhmm(Math.abs(calculo.restante));
  el.restante.className = 'numero-valor mono ' + (excedeu ? 'cor-positivo' : 'cor-acento');
  el.capRestante.textContent = excedeu ? 'além da jornada' : 'jornada menos trabalhado';

  el.almoco.textContent = hhmm(calculo.almocoTirado);
  el.capAlmoco.textContent = legendaDoAlmoco(marcacoes, calculo);
}

function pintarDiaEncerrado(marcacoes, calculo) {
  el.cardPonto.dataset.fase = 'encerrado';
  el.fasePill.textContent = 'Dia encerrado';
  el.previsao.textContent = hhmm(marcacoes.saida);
  textoComDestaque(el.pontoSub, ['Saiu às ', hhmm(marcacoes.saida), ' · trabalhou ', hhmm(calculo.trabalhado)]);
  el.formula.textContent = `trabalhado = (saída − chegada) − almoço (mínimo de 1h) = ${hhmm(calculo.trabalhado)}`;
  el.menuPrevisao.textContent = '';
  tituloPonto('');
}

function pintarDiaEmAndamento(calculo, agora) {
  const previsao = hhmm(((calculo.previsao % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA);
  el.previsao.textContent = previsao;
  el.menuPrevisao.textContent = previsao;
  el.formula.textContent = `previsão = ${hhmm(agora)} + ${hhmm(Math.max(0, calculo.restante))} de jornada`
    + ` + ${hhmm(calculo.almocoDevendo)} de almoço`;

  if (calculo.emAlmoco) {
    el.cardPonto.dataset.fase = 'almoco';
    el.fasePill.textContent = 'Em almoço';
    textoComDestaque(el.pontoSub, ['Em almoço há ', hhmm(calculo.almocoTirado), ' · a previsão empurra até você voltar']);
  } else if (calculo.restante <= 0) {
    el.cardPonto.dataset.fase = 'cumprido';
    el.fasePill.textContent = 'Jornada cumprida';
    textoComDestaque(el.pontoSub, calculo.restante < 0
      ? ['Você passou ', hhmm(-calculo.restante), ' da jornada']
      : ['Bateu a jornada ', 'agora']);
  } else {
    el.cardPonto.dataset.fase = 'trabalhando';
    el.fasePill.textContent = 'Trabalhando';
    textoComDestaque(el.pontoSub, calculo.almocoDevendo > 0
      ? ['Faltam ', hhmm(calculo.restante), ' de trabalho e ', hhmm(calculo.almocoDevendo), ' de almoço']
      : ['Faltam ', hhmm(calculo.restante), ' de trabalho']);
  }

  tituloPonto(previsao + ' · saída');
}

/* O relógio roda a cada segundo, mas a tela só muda por minuto ou por edição: sem mudança, não repinta. */
function render() {
  trocarDeDiaSeVirou();

  const agora = agoraMin();
  const pintura = [diaAtual, agora, ...CAMPOS.map((campo) => el[campo].value)].join('|');
  if (pintura === ultimaPintura) {
    return;
  }
  ultimaPintura = pintura;

  const marcacoes = lerMinutos();
  const erros = validarMarcacoes(marcacoes, agora);
  const temErro = MARCACOES.some((campo) => erros[campo]);

  el.agora.textContent = hhmm(agora);
  el.hojeTitulo.textContent = tituloDoDia();
  el.hojeSub.textContent = `Jornada de ${hhmm(marcacoes.carga ?? 0)} · almoço mínimo de ${ALMOCO_MINIMO / 60}h`
    + ` · ${textoTolerancia(jornadaDe(diaAtual))}`;
  pintarMarcacoes(erros);

  if (marcacoes.chegada === null || temErro) {
    pintarVazio(marcacoes, temErro);
    return;
  }

  const calculo = calcularDia(marcacoes, agora);
  const percentual = calculo.carga > 0 ? Math.min(100, (calculo.trabalhado / calculo.carga) * 100) : 0;
  el.percentual.textContent = `${percentual.toFixed(0)}% da jornada`;
  pintarNumeros(marcacoes, calculo);

  if (marcacoes.saida !== null) {
    pintarDiaEncerrado(marcacoes, calculo);
  } else {
    pintarDiaEmAndamento(calculo, agora);
  }
  pintarLinhaDoDia(marcacoes, calculo, agora);
}

function atalhoDeEnter(evento) {
  if (evento.key !== 'Enter' || !teclaLimpa(evento) || telaAtual() !== 'hoje') {
    return;
  }
  // Enter dentro de um campo ou botão é do próprio elemento, não do ponto
  if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(evento.target?.tagName)) {
    return;
  }
  evento.preventDefault();
  baterPonto();
}

/**
 * @description Liga a tela Hoje; o registro de hoje vem do store, já carregado
 */
export function iniciarPonto() {
  preencher(store.obter(diaAtual));

  store.assinar(({ dia, origem }) => {
    if (origem !== ORIGEM && (dia === null || dia === diaAtual)) {
      preencher(store.obter(diaAtual));
      ultimaPintura = '';
      render();
    }
  });

  CAMPOS.forEach((campo) => {
    el[campo].addEventListener('input', () => {
      salvar();
      render();
    });
  });

  // sem o blur, o foco fica no botão e um Enter ou Espaço logo depois bateria a próxima marcação
  el.btnBater.addEventListener('click', () => {
    el.btnBater.blur();
    baterPonto();
  });
  el.btnLimpar.addEventListener('click', () => {
    MARCACOES.forEach((campo) => {
      el[campo].value = '';
    });
    salvar();
    render();
  });
  document.addEventListener('keydown', atalhoDeEnter);

  render();
  setInterval(render, 1000);

  // aba em segundo plano estrangula o timer; redesenhar ao voltar o foco fecha a janela
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render();
    }
  });
  window.addEventListener('focus', render);
}
