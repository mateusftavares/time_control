import { hoje, hhmm, textoSaldo, rotuloDia, MESES } from '/shared/tempo.js';
import { avaliar } from '/shared/regras.js';
import { versoesEfetivas, resumoDaJornada, jornadaDe } from '/shared/jornada.js';
import { resumoDoBanco, ROTULO_DO_ESTADO, ESTADOS_ABONADOS } from '/shared/banco.js';
import { api } from './api.js';
import { elementos } from './util.js';

/* Aba Equipe da tela Ponto (só o ADM): banco de horas e histórico de cada membro, só leitura.
   O cálculo é o mesmo do "Meu ponto", com os dias e a jornada da pessoa escolhida. */

const el = elementos([
  'pontoAbas', 'pontoMeu', 'pontoEquipe', 'filtros', 'btnImportar',
  'equipeMembro', 'equipeJornada', 'equipeEstado',
  'equipeBanco', 'equipeBancoCap', 'equipeMes', 'equipeMesCap', 'equipeTrabalhado', 'equipePendentes', 'equipeCorpo',
]);

let carregou = false;
let pedido = 0;
let mesesAbertos = new Set();

const classeSaldo = (saldo) => (saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : 'zero');
const COR_DO_SINAL = { pos: 'cor-positivo', neg: 'cor-negativo', zero: 'cor-zero' };
const nomeDoMes = (anoMes) => `${MESES[Number(anoMes.slice(5, 7)) - 1]} ${anoMes.slice(0, 4)}`;

function estado(texto, tipo = '') {
  el.equipeEstado.textContent = texto;
  el.equipeEstado.className = `texto-mudo pequeno estado ${tipo}`;
}

function span(conteudo, classe) {
  const elemento = document.createElement('span');
  elemento.textContent = conteudo;
  if (classe) {
    elemento.className = classe;
  }
  return elemento;
}

const celula = (valor) => (valor ? span(valor, 'num') : span('—', 'num vazio'));

function pintarValor(elemento, saldo) {
  elemento.textContent = textoSaldo(saldo);
  elemento.classList.remove(...Object.values(COR_DO_SINAL));
  elemento.classList.add(COR_DO_SINAL[classeSaldo(saldo)]);
}

function linhaDoDia(dia, registros, versoes) {
  const registro = registros.get(dia) ?? null;
  const avaliacao = avaliar(registro, versoes);
  const marcacoes = ESTADOS_ABONADOS.includes(avaliacao.estado) ? null : registro;
  const linha = document.createElement('div');
  linha.className = 'linha-tabela linha-dia linha-leitura';
  linha.dataset.hoje = String(dia === hoje());
  const etiqueta = span(ROTULO_DO_ESTADO[avaliacao.estado], 'etiqueta');
  etiqueta.dataset.tipo = avaliacao.estado;
  const situacao = document.createElement('span');
  situacao.append(etiqueta);
  linha.append(span(rotuloDia(dia), 'dia'), situacao,
    celula(marcacoes?.chegada), celula(marcacoes?.almocoIni), celula(marcacoes?.almocoFim), celula(marcacoes?.saida),
    celula(avaliacao.trabalhado === null ? null : hhmm(avaliacao.trabalhado)),
    avaliacao.saldo === null ? span('—', 'num vazio') : span(textoSaldo(avaliacao.saldo), `num saldo ${classeSaldo(avaliacao.saldo)}`));
  return linha;
}

function grupoDoMes(mes, registros, versoes) {
  const aberto = mesesAbertos.has(mes.anoMes);
  const cabeca = document.createElement('button');
  cabeca.type = 'button';
  cabeca.className = 'linha-tabela mes-cabeca';
  cabeca.setAttribute('aria-expanded', String(aberto));
  const nome = span(nomeDoMes(mes.anoMes), 'mes-nome');
  const seta = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  seta.setAttribute('viewBox', '0 0 24 24');
  seta.setAttribute('aria-hidden', 'true');
  const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  caminho.setAttribute('d', 'M6 9l6 6 6-6');
  seta.append(caminho);
  nome.prepend(seta);
  const resumo = mes.totais.pendentes > 0
    ? `${mes.totais.pendentes} sem marcação · ${mes.totais.fechados} fechados`
    : `${mes.totais.fechados} dias fechados`;
  cabeca.append(nome, span(resumo, 'mes-resumo'), span(hhmm(mes.totais.trabalhado), 'num mono'),
    span(textoSaldo(mes.totais.saldo), `num mono saldo ${classeSaldo(mes.totais.saldo)}`));

  const grupo = document.createElement('div');
  grupo.append(cabeca);
  if (aberto && mes.dias.length) {
    const dias = document.createElement('div');
    dias.className = 'mes-dias';
    dias.append(...mes.dias.map((dia) => linhaDoDia(dia, registros, versoes)));
    grupo.append(dias);
  }
  cabeca.addEventListener('click', () => {
    if (aberto) {
      mesesAbertos.delete(mes.anoMes);
    } else {
      mesesAbertos.add(mes.anoMes);
    }
    grupo.replaceWith(grupoDoMes(mes, registros, versoes));
  });
  return grupo;
}

function pintarPessoa({ registros, versoes, atribuicoes }) {
  const resumo = resumoDoBanco(registros, hoje(), versoes);
  const [atual] = resumo.meses;
  const vigente = atribuicoes.filter((atribuicao) => atribuicao.desde <= hoje()).at(-1);
  el.equipeJornada.textContent = `${vigente ? vigente.nome : 'Sem jornada atribuída (padrão)'} · ${resumoDaJornada(jornadaDe(hoje(), versoes))}`;

  pintarValor(el.equipeBanco, resumo.banco);
  el.equipeBancoCap.textContent = `${resumo.meses.length} meses somados · ${registros.size} dias registrados`;
  pintarValor(el.equipeMes, atual.totais.saldo);
  el.equipeMesCap.textContent = `${atual.totais.fechados} dias fechados em ${nomeDoMes(atual.anoMes)}`;
  el.equipeTrabalhado.textContent = hhmm(atual.totais.trabalhado);
  el.equipePendentes.textContent = String(resumo.pendentes);
  el.equipePendentes.className = `numero-valor grande mono ${resumo.pendentes ? 'cor-erro' : 'cor-positivo'}`;
  el.equipeCorpo.replaceChildren(...resumo.meses.map((mes) => grupoDoMes(mes, registros, versoes)));
}

/* Só a resposta do último pedido pinta: trocar de pessoa rápido não mistura os dados de duas. */
async function mostrarPessoa(userId) {
  const meu = ++pedido;
  if (!userId) {
    return;
  }
  estado('Carregando…');
  try {
    const [dias, jornada] = await Promise.all([api.listarDias(userId), api.minhaJornada(userId)]);
    if (meu !== pedido) {
      return;
    }
    mesesAbertos = new Set([hoje().slice(0, 7)]);
    pintarPessoa({
      registros: new Map(dias.map((registro) => [registro.dia, registro])),
      versoes: versoesEfetivas(jornada.atribuicoes, jornada.versoesPorModelo),
      atribuicoes: jornada.atribuicoes,
    });
    estado('');
  } catch (erro) {
    if (meu === pedido) {
      estado(`Não foi possível carregar o ponto: ${erro.message}.`, 'erro');
    }
  }
}

/**
 * @description Carrega a lista de membros na primeira vez que a aba abre e mostra o primeiro
 */
export async function abrirEquipe() {
  if (carregou) {
    return;
  }
  carregou = true;
  try {
    const membros = await api.membrosDaEmpresa();
    el.equipeMembro.replaceChildren(...membros.map((membro) => {
      const opcao = new Option(`${membro.nome || membro.email}${membro.ativo ? '' : ' (inativo)'}`, membro.id);
      opcao.title = membro.email;
      return opcao;
    }));
    await mostrarPessoa(el.equipeMembro.value);
  } catch (erro) {
    carregou = false;
    estado(`Não foi possível listar a equipe: ${erro.message}.`, 'erro');
  }
}

/* Os filtros e o Importar são do "Meu ponto": na aba Equipe somem. */
function mostrarAba(aba) {
  el.pontoAbas.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.aba === aba));
  });
  el.pontoMeu.hidden = aba !== 'meu';
  el.pontoEquipe.hidden = aba !== 'equipe';
  el.filtros.hidden = aba !== 'meu';
  el.btnImportar.hidden = aba !== 'meu';
  if (aba === 'equipe') {
    abrirEquipe();
  }
}

/**
 * @description Liga a aba Equipe da tela Ponto (só o ADM chega aqui) e mostra as abas Meu ponto / Equipe
 */
export function iniciarEquipe() {
  el.pontoAbas.hidden = false;
  el.pontoAbas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-aba]');
    if (botao) {
      mostrarAba(botao.dataset.aba);
    }
  });
  el.equipeMembro.addEventListener('change', () => mostrarPessoa(el.equipeMembro.value));
}
