import { hoje, hhmm } from '/shared/tempo.js';
import {
  JORNADA_PADRAO, ORDEM_DA_SEMANA, NOMES_DA_SEMANA, HORARIOS_DO_EXPEDIENTE,
  jornadaDe, cargaDoExpediente, normalizarJornada, resumoDaJornada,
} from '/shared/jornada.js';
import { api } from './api.js';
import { elementos } from './util.js';
import { recarregarMinhaJornada } from './perfil.js';

/* Aba Jornadas da tela Empresa (só o ADM): modelos de jornada, as vigências de cada um e quem usa qual. */

const EXPLICACAO_DO_MODO = {
  acumulativo: 'Acumulativo: soma o dia inteiro e compara com a carga. Se o saldo do dia ficar até "antes" minutos abaixo '
    + 'ou até "depois" minutos acima, vira zero; passou disso, conta inteiro.',
  individual: 'Individual: compara cada marcação (entrada, almoço, volta, saída) com o horário oficial. Marcação até '
    + '"antes" minutos adiantada ou até "depois" minutos atrasada vale como o horário oficial; fora disso, vale o horário batido.',
};

const el = elementos([
  'jornadaModelos', 'formModeloNovo', 'modeloNovoNome', 'modelosEstado',
  'jornadaEditor', 'jornadaTitulo', 'formModeloNome', 'modeloNome', 'modeloApagar',
  'jornadaNova', 'jornadaVersoes', 'formJornada', 'jornadaDesde', 'jornadaDias', 'tolAntes', 'tolDepois',
  'modoTolerancia', 'modoExplicacao', 'jornadaApagar', 'jornadaEstado', 'jornadaSalvar', 'pessoasJornada',
]);

let dados = { modelos: [], versoesPorModelo: new Map(), atribuicoes: [], membros: [] };
let modeloId = null;
let vigenciaEditada = null;
let modoEditado = 'acumulativo';
let carregou = false;

function estado(alvo, texto, tipo = '') {
  alvo.textContent = texto;
  alvo.className = `texto-mudo pequeno estado ${tipo}`;
}

function dataCurta(dia) {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

const versoesDo = (id) => [...(dados.versoesPorModelo.get(id) ?? [])].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
const nomeDoModelo = (id) => dados.modelos.find((modelo) => modelo.id === id)?.nome ?? '—';
const atribuicoesDe = (userId) => dados.atribuicoes.filter((atribuicao) => atribuicao.userId === userId);
const atribuicaoVigente = (userId) => atribuicoesDe(userId).filter((atribuicao) => atribuicao.desde <= hoje()).at(-1) ?? null;
const pessoasNoModelo = (id) => new Set(dados.atribuicoes.filter((atribuicao) => atribuicao.modeloId === id).map((a) => a.userId));
const nomeDoMembro = (membro) => membro.nome || membro.email;

/* ---------- formulário da semana ---------- */

function campoHorario(rotulo, valor, habilitado) {
  const campo = document.createElement('input');
  campo.type = 'time';
  campo.value = valor ?? '';
  campo.disabled = !habilitado;
  campo.setAttribute('aria-label', rotulo);
  return campo;
}

function expedienteDaLinha(linha) {
  const trabalha = linha.querySelector('input[type="checkbox"]').checked;
  const expediente = { trabalha };
  linha.querySelectorAll('input[type="time"]').forEach((campo) => {
    expediente[campo.dataset.campo] = trabalha ? campo.value || null : null;
  });
  return expediente;
}

function linhaDoDia(indice, expediente) {
  const linha = document.createElement('div');
  linha.className = 'jornada-linha';
  linha.dataset.semana = String(indice);

  const caixa = document.createElement('label');
  caixa.className = 'caixa';
  const marcador = document.createElement('input');
  marcador.type = 'checkbox';
  marcador.checked = expediente.trabalha;
  caixa.append(marcador, document.createTextNode(` ${NOMES_DA_SEMANA[indice]}`));

  const nomes = { entrada: 'entrada', almocoIni: 'saída para o almoço', almocoFim: 'volta do almoço', saida: 'saída' };
  const campos = HORARIOS_DO_EXPEDIENTE.map((campo) => {
    const entrada = campoHorario(`${NOMES_DA_SEMANA[indice]}: ${nomes[campo]}`, expediente[campo], expediente.trabalha);
    entrada.dataset.campo = campo;
    return entrada;
  });

  const carga = document.createElement('span');
  carga.className = 'num mono texto-secundario';
  const atualizarCarga = () => {
    const lido = expedienteDaLinha(linha);
    carga.textContent = lido.trabalha ? hhmm(Math.max(0, cargaDoExpediente(lido))) : '—';
  };
  marcador.addEventListener('change', () => {
    campos.forEach((entrada) => {
      entrada.disabled = !marcador.checked;
    });
    atualizarCarga();
  });
  campos.forEach((entrada) => entrada.addEventListener('input', atualizarCarga));

  linha.append(caixa, ...campos, carga);
  atualizarCarga();
  return linha;
}

function pintarModo(modo) {
  modoEditado = modo;
  el.modoTolerancia.querySelectorAll('[data-modo]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.modo === modo));
  });
  el.modoExplicacao.textContent = EXPLICACAO_DO_MODO[modo];
}

function preencherFormulario(jornada, vigenteDesde) {
  el.jornadaDesde.value = vigenteDesde;
  el.tolAntes.value = String(jornada.toleranciaAntes);
  el.tolDepois.value = String(jornada.toleranciaDepois);
  pintarModo(jornada.modo);
  el.jornadaDias.replaceChildren(...ORDEM_DA_SEMANA.map((indice) => linhaDoDia(indice, jornada.semana[indice])));
}

function jornadaDoFormulario() {
  const semana = Array(7);
  el.jornadaDias.querySelectorAll('.jornada-linha').forEach((linha) => {
    semana[Number(linha.dataset.semana)] = expedienteDaLinha(linha);
  });
  return {
    vigenteDesde: el.jornadaDesde.value,
    toleranciaAntes: Number(el.tolAntes.value),
    toleranciaDepois: Number(el.tolDepois.value),
    modo: modoEditado,
    semana,
  };
}

/* ---------- modelos e vigências ---------- */

function botaoComResumo(titulo, resumo, pressionado, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'vigencia';
  botao.setAttribute('aria-pressed', String(pressionado));
  const negrito = document.createElement('b');
  negrito.textContent = titulo;
  const pequeno = document.createElement('small');
  pequeno.textContent = resumo;
  botao.append(negrito, pequeno);
  botao.addEventListener('click', aoClicar);
  return botao;
}

function pintarModelos() {
  if (!dados.modelos.length) {
    const aviso = document.createElement('span');
    aviso.className = 'texto-mudo pequeno';
    aviso.textContent = `Nenhuma jornada cadastrada: quem não tem jornada usa o padrão (${resumoDaJornada(JORNADA_PADRAO)}).`;
    el.jornadaModelos.replaceChildren(aviso);
    return;
  }
  el.jornadaModelos.replaceChildren(...dados.modelos.map((modelo) => {
    const pessoas = dados.membros.filter((membro) => atribuicaoVigente(membro.id)?.modeloId === modelo.id).length;
    const aberta = modelo.id === modeloId;
    const linha = document.createElement('div');
    linha.className = 'modelo-linha';
    linha.setAttribute('aria-current', String(aberta));
    const nome = document.createElement('b');
    nome.textContent = modelo.nome;
    const resumo = document.createElement('span');
    resumo.className = 'texto-secundario';
    resumo.textContent = resumoDaJornada(jornadaDe(hoje(), versoesDo(modelo.id)));
    const quantas = document.createElement('span');
    quantas.className = 'num mono';
    quantas.textContent = String(pessoas);
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = `botao botao-pequeno ${aberta ? 'botao-fantasma' : 'botao-secundario'}`;
    editar.textContent = aberta ? 'Fechar' : 'Editar';
    editar.setAttribute('aria-expanded', String(aberta));
    editar.setAttribute('aria-controls', 'jornadaEditor');
    editar.addEventListener('click', () => selecionarModelo(aberta ? null : modelo.id));
    linha.append(nome, resumo, quantas, editar);
    return linha;
  }));
}

function pintarVersoes() {
  const versoes = versoesDo(modeloId);
  const vigente = jornadaDe(hoje(), versoes);
  if (!versoes.length) {
    const aviso = document.createElement('span');
    aviso.className = 'texto-mudo pequeno';
    aviso.textContent = `Sem vigência salva: vale o padrão (${resumoDaJornada(JORNADA_PADRAO)}) até a primeira.`;
    el.jornadaVersoes.replaceChildren(aviso);
  } else {
    el.jornadaVersoes.replaceChildren(...[...versoes].reverse().map((versao) => {
      const botao = botaoComResumo(`desde ${dataCurta(versao.vigenteDesde)}`, resumoDaJornada(versao),
        versao.vigenteDesde === vigenciaEditada, () => editarVersao(versao));
      botao.classList.toggle('atual', versao === vigente);
      return botao;
    }));
  }
  el.jornadaApagar.hidden = vigenciaEditada === null;
}

function editarVersao(versao) {
  vigenciaEditada = versao.vigenteDesde;
  preencherFormulario(versao, versao.vigenteDesde);
  estado(el.jornadaEstado, '');
  pintarVersoes();
}

function novaVigencia() {
  vigenciaEditada = null;
  preencherFormulario(jornadaDe(hoje(), versoesDo(modeloId)), hoje());
  estado(el.jornadaEstado, 'Nova vigência: ajuste e salve.');
  pintarVersoes();
}

/* Abre o editor da jornada abaixo da lista (id null fecha); rolar só quando quem abriu foi o clique. */
function selecionarModelo(id, vigencia = null, rolar = true) {
  modeloId = id;
  el.jornadaEditor.hidden = !id;
  pintarModelos();
  if (!id) {
    return;
  }
  if (rolar) {
    el.jornadaEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  el.jornadaTitulo.textContent = nomeDoModelo(id);
  el.modeloNome.value = nomeDoModelo(id);
  const versoes = versoesDo(id);
  const escolhida = versoes.find((versao) => versao.vigenteDesde === vigencia) ?? jornadaDe(hoje(), versoes);
  if (escolhida.vigenteDesde) {
    editarVersao(escolhida);
  } else {
    novaVigencia();
  }
}

/* O próprio ADM também tem jornada: depois de qualquer mudança, o banco dele é recalculado. */
async function recarregar(vigencia = null) {
  dados = await api.jornadasDaEmpresa();
  if (!dados.modelos.some((modelo) => modelo.id === modeloId)) {
    modeloId = null;
  }
  selecionarModelo(modeloId, vigencia, false);
  pintarPessoas();
  await recarregarMinhaJornada();
}

/* Gravou: falha daqui em diante é só da releitura, e a mensagem não pode dizer que não salvou. */
async function concluir(alvo, mensagem, vigencia = null) {
  try {
    await recarregar(vigencia);
    estado(alvo, mensagem, 'ok');
  } catch (erro) {
    estado(alvo, `${mensagem} Mas não deu para recarregar a tela (${erro.message}): recarregue a página.`, 'erro');
  }
}

function confirmarRecalculo(desde, pessoas) {
  return desde >= hoje() || pessoas === 0
    || window.confirm(`Isso recalcula o banco de horas desde ${dataCurta(desde)} de ${pessoas} pessoa(s) que usam esta jornada. Continuar?`);
}

async function salvarVersao(evento) {
  evento.preventDefault();
  const resultado = normalizarJornada(jornadaDoFormulario());
  if (!resultado.ok) {
    estado(el.jornadaEstado, resultado.erros.join(' · '), 'erro');
    return;
  }
  const { jornada } = resultado;
  const desde = [jornada.vigenteDesde, vigenciaEditada].filter(Boolean).sort()[0];
  if (!confirmarRecalculo(desde, pessoasNoModelo(modeloId).size)) {
    return;
  }
  if (vigenciaEditada !== jornada.vigenteDesde && versoesDo(modeloId).some((versao) => versao.vigenteDesde === jornada.vigenteDesde)
    && !window.confirm(`Já existe uma vigência em ${dataCurta(jornada.vigenteDesde)}. Substituir?`)) {
    return;
  }

  el.jornadaSalvar.disabled = true;
  try {
    await api.salvarVersaoJornada(modeloId, jornada, vigenciaEditada);
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível salvar: ${erro.detalhes?.join?.(' · ') ?? erro.message}.`, 'erro');
    return;
  } finally {
    el.jornadaSalvar.disabled = false;
  }
  await concluir(el.jornadaEstado, 'Jornada salva.', jornada.vigenteDesde);
}

async function apagarVersao() {
  const pessoas = pessoasNoModelo(modeloId).size;
  if (!vigenciaEditada || !window.confirm(`Apagar a vigência de ${dataCurta(vigenciaEditada)}? Os dias dela passam a usar `
    + `a vigência anterior (ou o padrão)${pessoas ? `, para ${pessoas} pessoa(s)` : ''}.`)) {
    return;
  }
  try {
    await api.apagarVersaoJornada(modeloId, vigenciaEditada);
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível apagar: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.jornadaEstado, 'Vigência apagada.');
}

function nomeRepetido(nome, ignorarId = null) {
  const chave = nome.trim().toLocaleLowerCase('pt-BR');
  return dados.modelos.some((modelo) => modelo.id !== ignorarId && modelo.nome.toLocaleLowerCase('pt-BR') === chave);
}

async function criarModelo(evento) {
  evento.preventDefault();
  const nome = el.modeloNovoNome.value.trim();
  if (!nome) {
    estado(el.modelosEstado, 'Dê um nome para a jornada.', 'erro');
    return;
  }
  if (nomeRepetido(nome)) {
    estado(el.modelosEstado, 'Já existe uma jornada com esse nome.', 'erro');
    return;
  }
  try {
    modeloId = (await api.salvarModeloJornada(nome)).id;
    el.formModeloNovo.reset();
  } catch (erro) {
    estado(el.modelosEstado, `Não foi possível criar: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.modelosEstado, 'Jornada criada: ajuste a semana e salve a primeira vigência.');
}

async function renomearModelo(evento) {
  evento.preventDefault();
  const nome = el.modeloNome.value.trim();
  if (!nome || nomeRepetido(nome, modeloId)) {
    estado(el.jornadaEstado, nome ? 'Já existe uma jornada com esse nome.' : 'Dê um nome para a jornada.', 'erro');
    return;
  }
  try {
    await api.salvarModeloJornada(nome, modeloId);
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível renomear: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.jornadaEstado, 'Nome salvo.', vigenciaEditada);
}

async function apagarModelo() {
  const pessoas = pessoasNoModelo(modeloId).size;
  if (pessoas) {
    estado(el.jornadaEstado, `${pessoas} pessoa(s) têm esta jornada no histórico: troque ou tire a jornada delas antes de apagar.`, 'erro');
    return;
  }
  if (!window.confirm(`Apagar a jornada "${nomeDoModelo(modeloId)}" e todas as vigências dela?`)) {
    return;
  }
  try {
    await api.apagarModeloJornada(modeloId);
    modeloId = null;
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível apagar: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.modelosEstado, 'Jornada apagada.');
}

/* ---------- quem usa cada jornada ---------- */

function chipDeAtribuicao(membro, atribuicao) {
  const chip = document.createElement('span');
  chip.className = 'chip atribuicao';
  chip.textContent = `${nomeDoModelo(atribuicao.modeloId)} · desde ${dataCurta(atribuicao.desde)}`;
  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'botao-texto';
  remover.textContent = '✕';
  remover.setAttribute('aria-label', `Tirar ${chip.textContent} de ${nomeDoMembro(membro)}`);
  remover.addEventListener('click', () => removerAtribuicao(membro, atribuicao));
  chip.append(remover);
  return chip;
}

function formularioDeAtribuicao(membro) {
  const form = document.createElement('form');
  form.className = 'atribuir';
  form.noValidate = true;
  const seletor = document.createElement('select');
  seletor.setAttribute('aria-label', `Jornada para ${nomeDoMembro(membro)}`);
  seletor.replaceChildren(...dados.modelos.map((modelo) => new Option(modelo.nome, modelo.id)));
  const data = document.createElement('input');
  data.type = 'date';
  data.value = hoje();
  data.setAttribute('aria-label', `A partir de quando, para ${nomeDoMembro(membro)}`);
  const botao = document.createElement('button');
  botao.type = 'submit';
  botao.className = 'botao botao-secundario botao-pequeno';
  botao.textContent = 'Aplicar';
  form.append(seletor, data, botao);
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    atribuir(membro, seletor.value, data.value);
  });
  return form;
}

function linhaDaPessoa(membro) {
  const linha = document.createElement('div');
  linha.className = `pessoa-jornada${membro.ativo ? '' : ' inativa'}`;
  const nome = document.createElement('span');
  nome.textContent = nomeDoMembro(membro);
  nome.title = membro.email;
  const vigente = atribuicaoVigente(membro.id);
  const atual = document.createElement('b');
  atual.textContent = vigente ? nomeDoModelo(vigente.modeloId) : 'padrão';
  const historico = document.createElement('div');
  historico.className = 'atribuicoes';
  historico.replaceChildren(...[...atribuicoesDe(membro.id)].reverse().map((atribuicao) => chipDeAtribuicao(membro, atribuicao)));
  linha.append(nome, atual, historico, dados.modelos.length ? formularioDeAtribuicao(membro) : document.createElement('span'));
  return linha;
}

function pintarPessoas() {
  const cabeca = document.createElement('div');
  cabeca.className = 'pessoa-jornada cabeca-tabela';
  cabeca.replaceChildren(...['Pessoa', 'Jornada hoje', 'Histórico', 'Trocar a partir de'].map((texto) => {
    const celula = document.createElement('span');
    celula.textContent = texto;
    return celula;
  }));
  el.pessoasJornada.replaceChildren(cabeca, ...dados.membros.map(linhaDaPessoa));
}

async function atribuir(membro, id, desde) {
  if (!id || !desde) {
    return;
  }
  if (desde < hoje() && !window.confirm(`Os dias de ${nomeDoMembro(membro)} desde ${dataCurta(desde)} passam a usar a jornada `
    + `"${nomeDoModelo(id)}" e o banco de horas dele é recalculado. Continuar?`)) {
    return;
  }
  try {
    await api.atribuirJornada(membro.id, id, desde);
  } catch (erro) {
    estado(el.modelosEstado, `Não foi possível trocar a jornada: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.modelosEstado, `Jornada de ${nomeDoMembro(membro)} atualizada.`, vigenciaEditada);
}

async function removerAtribuicao(membro, atribuicao) {
  if (!window.confirm(`Tirar "${nomeDoModelo(atribuicao.modeloId)}" (desde ${dataCurta(atribuicao.desde)}) de ${nomeDoMembro(membro)}? `
    + 'Esses dias passam a usar a jornada anterior (ou o padrão).')) {
    return;
  }
  try {
    await api.removerAtribuicaoJornada(membro.id, atribuicao.desde);
  } catch (erro) {
    estado(el.modelosEstado, `Não foi possível tirar a jornada: ${erro.message}.`, 'erro');
    return;
  }
  await concluir(el.modelosEstado, `Jornada de ${nomeDoMembro(membro)} atualizada.`, vigenciaEditada);
}

/**
 * @description Carrega a aba Jornadas na primeira vez que ela abre
 */
export async function abrirJornadas() {
  if (carregou) {
    return;
  }
  carregou = true;
  estado(el.modelosEstado, 'Carregando…');
  try {
    await recarregar();
    estado(el.modelosEstado, '');
  } catch (erro) {
    carregou = false;
    estado(el.modelosEstado, `Não foi possível carregar as jornadas: ${erro.message}.`, 'erro');
  }
}

/**
 * @description Liga os formulários da aba Jornadas (só o ADM chega aqui)
 */
export function iniciarJornadasDaEmpresa() {
  el.formModeloNovo.addEventListener('submit', criarModelo);
  el.formModeloNome.addEventListener('submit', renomearModelo);
  el.modeloApagar.addEventListener('click', apagarModelo);
  el.formJornada.addEventListener('submit', salvarVersao);
  el.jornadaNova.addEventListener('click', novaVigencia);
  el.jornadaApagar.addEventListener('click', apagarVersao);
  el.modoTolerancia.querySelectorAll('[data-modo]').forEach((botao) => {
    botao.addEventListener('click', () => pintarModo(botao.dataset.modo));
  });
}
