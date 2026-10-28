import { hoje, hhmm } from '/shared/tempo.js';
import {
  JORNADA_PADRAO, ORDEM_DA_SEMANA, NOMES_DA_SEMANA, HORARIOS_DO_EXPEDIENTE,
  jornadaDe, jornadasAtivas, definirJornadas, cargaDoExpediente, normalizarJornada, resumoDaJornada,
} from '/shared/jornada.js';
import { api } from './api.js';
import { supabase } from './supabase.js';
import * as store from './registros.js';
import { elementos } from './util.js';
import { PREFERENCIAS, aplicarPreferencia } from './aparencia.js';

const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024;
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const LADO_DA_FOTO_PX = 256;
const QUALIDADE_DA_FOTO = 0.88;
const SENHA_MINIMA = 8;
const EXPLICACAO_DO_MODO = {
  acumulativo: 'Acumulativo: soma o dia inteiro e compara com a carga. Se o saldo do dia ficar até "antes" minutos abaixo '
    + 'ou até "depois" minutos acima, vira zero; passou disso, conta inteiro.',
  individual: 'Individual: compara cada marcação (entrada, almoço, volta, saída) com o horário oficial. Marcação até '
    + '"antes" minutos adiantada ou até "depois" minutos atrasada vale como o horário oficial; fora disso, vale o horário batido.',
};

const el = elementos([
  'navAvatar', 'perfilAvatar', 'perfilSub', 'fotoArquivo', 'fotoRemover',
  'formNome', 'perfilNome', 'nomeSalvar', 'perfilEstado',
  'aparencia', 'aparenciaEstado',
  'formTrocarSenha', 'senhaUsuario', 'senhaAtual', 'senhaNova', 'senhaConfirma', 'senhaSalvar', 'senhaEstado',
  'jornadaNova', 'jornadaVersoes', 'formJornada', 'jornadaDesde', 'jornadaDias', 'tolAntes', 'tolDepois',
  'modoTolerancia', 'modoExplicacao', 'jornadaApagar', 'jornadaEstado', 'jornadaSalvar',
]);

let perfil = null;
let vigenciaEditada = null;
let modoEditado = 'acumulativo';

function estado(alvo, texto, tipo = '') {
  alvo.textContent = texto;
  alvo.className = `texto-mudo pequeno estado ${tipo}`;
}

function dataCurta(dia) {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/* ---------- foto e nome ---------- */

function pintarAvatar(alvo, url) {
  const inicial = (perfil.nome || perfil.email || '?').trim().charAt(0) || '?';
  if (!url) {
    alvo.replaceChildren(document.createTextNode(inicial));
    return;
  }
  const imagem = document.createElement('img');
  imagem.alt = '';
  imagem.src = url;
  imagem.addEventListener('error', () => alvo.replaceChildren(document.createTextNode(inicial)));
  alvo.replaceChildren(imagem);
}

async function pintarFotos() {
  const url = await api.urlDaFoto(perfil.avatarPath);
  pintarAvatar(el.navAvatar, url);
  pintarAvatar(el.perfilAvatar, url);
  el.fotoRemover.hidden = !perfil.avatarPath;
}

/* Recorta no centro e redesenha em JPEG: a foto fica pequena e perde o EXIF (que pode trazer a localização). */
async function reduzirFoto(arquivo) {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = LADO_DA_FOTO_PX;
  tela.height = LADO_DA_FOTO_PX;
  tela.getContext('2d').drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado,
    0, 0, LADO_DA_FOTO_PX, LADO_DA_FOTO_PX);
  bitmap.close();
  return new Promise((resolver, rejeitar) => {
    tela.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('não deu para ler a imagem'))), 'image/jpeg', QUALIDADE_DA_FOTO);
  });
}

async function trocarFoto() {
  const [arquivo] = el.fotoArquivo.files;
  el.fotoArquivo.value = '';
  if (!arquivo) {
    return;
  }
  if (!TIPOS_DE_FOTO.includes(arquivo.type)) {
    estado(el.perfilEstado, 'Use uma imagem JPEG, PNG ou WebP.', 'erro');
    return;
  }
  if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO) {
    estado(el.perfilEstado, 'A imagem passa de 2 MB.', 'erro');
    return;
  }

  estado(el.perfilEstado, 'Enviando a foto…');
  try {
    perfil.avatarPath = await api.enviarFoto(await reduzirFoto(arquivo));
    await pintarFotos();
    estado(el.perfilEstado, 'Foto atualizada.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível trocar a foto: ${erro.message}.`, 'erro');
  }
}

async function removerFoto() {
  if (!window.confirm('Remover a sua foto?')) {
    return;
  }
  try {
    await api.removerFoto();
    perfil.avatarPath = null;
    await pintarFotos();
    estado(el.perfilEstado, 'Foto removida.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível remover a foto: ${erro.message}.`, 'erro');
  }
}

async function salvarNome(evento) {
  evento.preventDefault();
  el.nomeSalvar.disabled = true;
  try {
    perfil.nome = await api.salvarNome(el.perfilNome.value);
    el.perfilNome.value = perfil.nome;
    await pintarFotos();
    estado(el.perfilEstado, 'Nome salvo.', 'ok');
  } catch (erro) {
    estado(el.perfilEstado, `Não foi possível salvar o nome: ${erro.message}.`, 'erro');
  } finally {
    el.nomeSalvar.disabled = false;
  }
}

/* ---------- aparência: cor de destaque, cartões e fundo ---------- */

const grupoDaPreferencia = (chave) => el.aparencia.querySelector(`[data-preferencia="${chave}"]`);

function pintarPreferencia(chave) {
  grupoDaPreferencia(chave).querySelectorAll('button').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.valor === perfil.aparencia[chave]));
  });
}

function botaoDeOpcao(chave, { valor, nome }) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.dataset.valor = valor;
  if (chave === 'cor') {
    const amostra = document.createElement('span');
    botao.className = 'cor-opcao';
    amostra.className = 'cor-amostra';
    amostra.setAttribute('aria-hidden', 'true');
    botao.append(amostra);
  }
  botao.append(nome);
  botao.addEventListener('click', () => trocarPreferencia(chave, valor));
  return botao;
}

function montarAparencia() {
  Object.entries(PREFERENCIAS).forEach(([chave, { opcoes }]) => {
    grupoDaPreferencia(chave).replaceChildren(...opcoes.map((opcao) => botaoDeOpcao(chave, opcao)));
    pintarPreferencia(chave);
  });
}

async function trocarPreferencia(chave, valor) {
  const anterior = perfil.aparencia[chave];
  if (valor === anterior) {
    return;
  }
  perfil.aparencia[chave] = valor;
  aplicarPreferencia(chave, valor);
  pintarPreferencia(chave);
  try {
    await api.salvarPreferencia(chave, valor);
    estado(el.aparenciaEstado, 'Aparência salva.', 'ok');
  } catch (erro) {
    perfil.aparencia[chave] = anterior;
    aplicarPreferencia(chave, anterior);
    pintarPreferencia(chave);
    estado(el.aparenciaEstado, `Não foi possível salvar a aparência: ${erro.message}.`, 'erro');
  }
}

/* ---------- senha ---------- */

/* O supabase-js 2.45 não confere a senha atual no updateUser: um login com ela prova que é o dono. */
async function trocarSenha(evento) {
  evento.preventDefault();
  const [atual, nova, confirma] = [el.senhaAtual.value, el.senhaNova.value, el.senhaConfirma.value];
  if (!atual) {
    estado(el.senhaEstado, 'Informe a senha atual.', 'erro');
    return;
  }
  if (nova.length < SENHA_MINIMA) {
    estado(el.senhaEstado, `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, 'erro');
    return;
  }
  if (nova !== confirma) {
    estado(el.senhaEstado, 'As duas senhas novas não são iguais.', 'erro');
    return;
  }
  if (nova === atual) {
    estado(el.senhaEstado, 'A nova senha precisa ser diferente da atual.', 'erro');
    return;
  }

  el.senhaSalvar.disabled = true;
  estado(el.senhaEstado, 'Conferindo…');
  try {
    const conferida = await supabase.auth.signInWithPassword({ email: perfil.email, password: atual });
    if (conferida.error) {
      estado(el.senhaEstado, conferida.error.status === 429 ? 'Muitas tentativas. Espere alguns minutos.' : 'Senha atual incorreta.', 'erro');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      estado(el.senhaEstado, `Não foi possível trocar a senha: ${error.message}.`, 'erro');
      return;
    }
    el.formTrocarSenha.reset();
    el.senhaUsuario.value = perfil.email;
    estado(el.senhaEstado, 'Senha trocada.', 'ok');
  } finally {
    el.senhaSalvar.disabled = false;
  }
}

/* ---------- jornada ---------- */

function campoHorario(rotulo, valor, habilitado) {
  const campo = document.createElement('input');
  campo.type = 'time';
  campo.value = valor ?? '';
  campo.disabled = !habilitado;
  campo.setAttribute('aria-label', rotulo);
  return campo;
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

function expedienteDaLinha(linha) {
  const trabalha = linha.querySelector('input[type="checkbox"]').checked;
  const expediente = { trabalha };
  linha.querySelectorAll('input[type="time"]').forEach((campo) => {
    expediente[campo.dataset.campo] = trabalha ? campo.value || null : null;
  });
  return expediente;
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

function pintarVersoes() {
  const versoes = jornadasAtivas();
  const vigente = jornadaDe(hoje());

  if (versoes.length === 0) {
    const aviso = document.createElement('span');
    aviso.className = 'texto-mudo pequeno';
    aviso.textContent = `Nenhuma jornada salva: vale o padrão (${resumoDaJornada(JORNADA_PADRAO)}).`;
    el.jornadaVersoes.replaceChildren(aviso);
  } else {
    el.jornadaVersoes.replaceChildren(...[...versoes].reverse().map((versao) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = `vigencia${versao === vigente ? ' atual' : ''}`;
      botao.setAttribute('aria-pressed', String(versao.vigenteDesde === vigenciaEditada));
      const titulo = document.createElement('b');
      titulo.textContent = `desde ${dataCurta(versao.vigenteDesde)}`;
      const resumo = document.createElement('small');
      resumo.textContent = resumoDaJornada(versao);
      botao.append(titulo, resumo);
      botao.addEventListener('click', () => editarVersao(versao));
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
  preencherFormulario(jornadaDe(hoje()), hoje());
  estado(el.jornadaEstado, 'Nova vigência: ajuste e salve.');
  pintarVersoes();
}

async function recarregarJornadas(selecionar) {
  definirJornadas(await api.listarJornadas());
  store.recalcular();
  const escolhida = jornadasAtivas().find((versao) => versao.vigenteDesde === selecionar);
  if (escolhida) {
    editarVersao(escolhida);
  } else {
    novaVigencia();
  }
}

async function salvarJornada(evento) {
  evento.preventDefault();
  const resultado = normalizarJornada(jornadaDoFormulario());
  if (!resultado.ok) {
    estado(el.jornadaEstado, resultado.erros.join(' · '), 'erro');
    return;
  }

  const { jornada } = resultado;
  const desde = [jornada.vigenteDesde, vigenciaEditada].filter(Boolean).sort()[0];
  if (desde < hoje() && !window.confirm(`Isso recalcula o banco de horas dos dias desde ${dataCurta(desde)}. Continuar?`)) {
    return;
  }
  if (vigenciaEditada !== jornada.vigenteDesde && jornadasAtivas().some((versao) => versao.vigenteDesde === jornada.vigenteDesde)
    && !window.confirm(`Já existe uma vigência em ${dataCurta(jornada.vigenteDesde)}. Substituir?`)) {
    return;
  }

  el.jornadaSalvar.disabled = true;
  try {
    await api.salvarJornada(jornada, vigenciaEditada);
    await recarregarJornadas(jornada.vigenteDesde);
    estado(el.jornadaEstado, 'Jornada salva.', 'ok');
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível salvar: ${erro.detalhes?.join(' · ') ?? erro.message}.`, 'erro');
  } finally {
    el.jornadaSalvar.disabled = false;
  }
}

async function apagarJornada() {
  if (!vigenciaEditada
    || !window.confirm(`Apagar a vigência de ${dataCurta(vigenciaEditada)}? Os dias dela passam a usar a vigência anterior (ou o padrão).`)) {
    return;
  }
  try {
    await api.apagarJornada(vigenciaEditada);
    await recarregarJornadas(null);
    estado(el.jornadaEstado, 'Vigência apagada.', 'ok');
  } catch (erro) {
    estado(el.jornadaEstado, `Não foi possível apagar: ${erro.message}.`, 'erro');
  }
}

/**
 * @description Carrega as versões de jornada do usuário logado; as regras do banco passam a usá-las
 */
export async function carregarJornadas() {
  definirJornadas(await api.listarJornadas());
}

/**
 * @description Liga a tela Meu perfil (nome, foto, senha, jornada) e o avatar da navegação
 * @param {{id: string, nome: string, email: string, avatarPath: string|null}} dados
 */
export function iniciarPerfil(dados) {
  perfil = { ...dados, aparencia: { ...dados.aparencia } };
  el.perfilSub.textContent = perfil.email;
  el.perfilNome.value = perfil.nome;
  el.senhaUsuario.value = perfil.email;
  pintarAvatar(el.navAvatar, null);
  pintarAvatar(el.perfilAvatar, null);
  pintarFotos();
  montarAparencia();

  el.fotoArquivo.addEventListener('change', trocarFoto);
  el.fotoRemover.addEventListener('click', removerFoto);
  el.formNome.addEventListener('submit', salvarNome);
  el.formTrocarSenha.addEventListener('submit', trocarSenha);
  el.formJornada.addEventListener('submit', salvarJornada);
  el.jornadaNova.addEventListener('click', novaVigencia);
  el.jornadaApagar.addEventListener('click', apagarJornada);
  el.modoTolerancia.querySelectorAll('[data-modo]').forEach((botao) => {
    botao.addEventListener('click', () => pintarModo(botao.dataset.modo));
  });

  const vigente = jornadaDe(hoje());
  if (vigente.vigenteDesde) {
    editarVersao(vigente);
  } else {
    novaVigencia();
  }
}
