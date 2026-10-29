import { hhmm, textoSaldo, rotuloDia } from '/shared/tempo.js';
import { avaliar } from '/shared/regras.js';
import { lerEspelho, registroDe, conferir } from '/shared/espelho.js';
import { normalizarRegistro } from '/shared/registro.js';
import * as store from './registros.js';
import { elementos, escapar } from './util.js';
import { mostrarAviso, avisoDeFalha } from './aviso.js';

const ESPERA_DIGITACAO_MS = 250;

const ICONE = {
  ok: '<svg class="imp-icone ok" viewBox="0 0 24 24" role="img" aria-label="Confere"><path d="M5 12l4 4L19 6"></path></svg>',
  alerta: '<svg class="imp-icone alerta" viewBox="0 0 24 24" role="img" aria-label="Diverge do oficial"><path d="M12 8v5"></path><path d="M12 17h.01"></path><circle cx="12" cy="12" r="9"></circle></svg>',
  erro: '<svg class="imp-icone erro" viewBox="0 0 24 24" role="img" aria-label="Inválido"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>',
  pular: '<svg class="imp-icone pular" viewBox="0 0 24 24" role="img" aria-label="Já registrado"><path d="M5 12h14"></path></svg>',
};

const CABECA_DA_LISTA = '<div class="imp-linha cabeca-tabela"><span>Dia</span><span>Batidas</span>'
  + '<span class="num">Trabalhado</span><span class="num">Saldo</span><span></span></div>';

const el = elementos([
  'impTexto', 'impSobrescrever', 'impLimpar', 'impResumo', 'impLista', 'impGravar',
  'btnImportar', 'importarDialogo', 'importarFechar',
]);

let lidos = [];
let timerDeLeitura = null;
let mensagemDaGravacao = null;

/**
 * @description Classifica cada dia lido: inválido, já existente (pulado) ou a gravar, e confere contra o TiqueTaque
 */
function analisar() {
  const sobrescrever = el.impSobrescrever.checked;

  return lidos
    .map((lido) => ({ lido, registro: registroDe(lido) }))
    .filter((item) => item.registro)
    .map(({ lido, registro }) => {
      const validacao = normalizarRegistro(registro);
      const conferencia = conferir(lido, registro);
      const pular = Boolean(store.obter(registro.dia)) && !sobrescrever;
      let situacao = 'ok';
      if (!validacao.ok) {
        situacao = 'invalido';
      } else if (pular) {
        situacao = 'pular';
      } else if (!conferencia.ok) {
        situacao = 'diverge';
      }

      return {
        registro,
        situacao,
        erros: validacao.ok ? [] : validacao.erros,
        conferencia,
        avaliacao: validacao.ok ? avaliar(registro) : { trabalhado: null, saldo: null },
      };
    });
}

const vaiGravar = (item) => item.situacao === 'ok' || item.situacao === 'diverge';

function detalheDoItem({ registro, situacao, erros, conferencia }) {
  const batidas = registro.tipo === 'feriado'
    ? 'feriado'
    : [registro.chegada, registro.almocoIni, registro.almocoFim, registro.saida].filter(Boolean).join(' ');

  if (situacao === 'invalido') {
    return `${batidas} · ${erros.join('; ')}`;
  }
  if (situacao === 'pular') {
    return `${batidas} · já registrado`;
  }
  if (situacao === 'diverge') {
    return conferencia.oficial === null ? `${batidas} · incompleto` : `${batidas} · oficial ${textoSaldo(conferencia.oficial)}`;
  }
  return batidas;
}

function linhaDaPrevia(item) {
  const icone = { ok: ICONE.ok, diverge: ICONE.alerta, invalido: ICONE.erro, pular: ICONE.pular }[item.situacao];
  return `<div class="imp-linha" data-situacao="${item.situacao}">`
    + `<span class="dia">${escapar(rotuloDia(item.registro.dia))}</span>`
    + `<span class="imp-batidas">${escapar(detalheDoItem(item))}</span>`
    + `<span class="num">${item.avaliacao.trabalhado === null ? '—' : hhmm(item.avaliacao.trabalhado)}</span>`
    + `<span class="num">${textoSaldo(item.avaliacao.saldo)}</span>`
    + icone
    + '</div>';
}

function chip(classe, texto) {
  return `<span class="chip ${classe}">${texto}</span>`;
}

function previa() {
  const analise = analisar();
  const gravaveis = analise.filter(vaiGravar);
  const contar = (situacao) => analise.filter((item) => item.situacao === situacao).length;
  const ignorados = lidos.length - analise.length;

  if (!lidos.length) {
    el.impResumo.innerHTML = mensagemDaGravacao ? chip('ok', mensagemDaGravacao) : '';
    el.impLista.innerHTML = '<p class="texto-mudo">Cole o espelho ao lado para conferir.</p>';
  } else {
    el.impResumo.innerHTML = chip('acento', `${gravaveis.length} a gravar`)
      + (contar('pular') ? chip('', `${contar('pular')} já registrados, mantidos`) : '')
      + (ignorados ? chip('', `${ignorados} de fim de semana, ignorados`) : '')
      + (contar('invalido') ? chip('erro', `${contar('invalido')} inválido(s), fora da gravação`) : '')
      + (contar('diverge') ? chip('alerta', `${contar('diverge')} diverge(m) do oficial`) : '')
      + (gravaveis.length && !contar('diverge') ? chip('ok', 'conferência bateu em todos') : '');
    el.impLista.innerHTML = analise.length
      ? CABECA_DA_LISTA + analise.map(linhaDaPrevia).join('')
      : '<p class="texto-mudo">Nada reconhecido no texto colado.</p>';
  }

  el.impGravar.disabled = gravaveis.length === 0;
  el.impGravar.textContent = gravaveis.length === 0 ? 'Nada a gravar' : `Gravar ${gravaveis.length} dia(s)`;
}

function lerTexto() {
  mensagemDaGravacao = null;
  lidos = lerEspelho(el.impTexto.value);
  previa();
}

function limpar() {
  clearTimeout(timerDeLeitura);
  el.impTexto.value = '';
  lidos = [];
  previa();
}

async function gravar() {
  clearTimeout(timerDeLeitura);
  lidos = lerEspelho(el.impTexto.value);
  const registros = analisar().filter(vaiGravar).map((item) => item.registro);
  if (!registros.length) {
    previa();
    return;
  }
  el.impGravar.disabled = true;

  try {
    const { gravados } = await store.gravarLote(registros, el.impSobrescrever.checked);
    limpar();
    mensagemDaGravacao = `${gravados} dia(s) gravados`;
    previa();
  } catch (erro) {
    mostrarAviso(avisoDeFalha('gravar a importação', erro));
    el.impGravar.disabled = false;
  }
}

/* Pop-up aberto pelo botão da tela Ponto. Fechar não apaga o que foi colado: dá para voltar e gravar. */
function ligarPopup() {
  el.btnImportar.addEventListener('click', () => {
    el.importarDialogo.showModal();
    el.impTexto.focus();
  });
  el.importarFechar.addEventListener('click', () => el.importarDialogo.close());
  // fecha só se o clique começou e terminou no fundo: selecionar texto e soltar fora não conta
  let comecouNoFundo = false;
  const noFundo = (evento) => {
    const caixa = el.importarDialogo.getBoundingClientRect();
    return evento.target === el.importarDialogo && (evento.clientX < caixa.left || evento.clientX > caixa.right
      || evento.clientY < caixa.top || evento.clientY > caixa.bottom);
  };
  el.importarDialogo.addEventListener('pointerdown', (evento) => {
    comecouNoFundo = noFundo(evento);
  });
  el.importarDialogo.addEventListener('click', (evento) => {
    if (comecouNoFundo && noFundo(evento)) {
      el.importarDialogo.close();
    }
    comecouNoFundo = false;
  });
}

/**
 * @description Liga o pop-up de importação do espelho do TiqueTaque; lê o texto sozinho enquanto ele é colado
 */
export function iniciarImportacao() {
  ligarPopup();
  el.impTexto.addEventListener('input', () => {
    clearTimeout(timerDeLeitura);
    timerDeLeitura = setTimeout(lerTexto, ESPERA_DIGITACAO_MS);
  });
  el.impSobrescrever.addEventListener('change', previa);
  el.impLimpar.addEventListener('click', limpar);
  el.impGravar.addEventListener('click', gravar);

  // a prévia depende do que já está gravado: muda quando o banco muda
  store.assinar(() => {
    if (lidos.length) {
      previa();
    }
  });
}
