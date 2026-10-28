import { normalizarRegistro, diaValido } from '/shared/registro.js';
import { sanitizarEstado } from '/shared/pomodoro.js';
import {
  COLUNAS_DIAS, COLUNAS_JORNADAS, paraRegistro, paraLinha, umPorDia, paraJornada, linhaDeJornada,
} from '/shared/linhas.js';
import { normalizarJornada } from '/shared/jornada.js';
import { PREFERENCIAS, opcaoValida } from './aparencia.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { supabase } from './supabase.js';
import { idDoUsuario, tokenAtual, sair } from './sessao.js';

const LIMITE_LOTE = 1000;
const LINHAS_POR_PAGINA = 1000;
const CONFLITO = 'user_id,dia';
const SESSAO_EXPIRADA = ['PGRST301', 'PGRST303'];
const CONFLITO_JORNADA = 'user_id,vigente_desde';
const BUCKET_DAS_FOTOS = 'avatares';
const VALIDADE_DA_URL_DA_FOTO_S = 60 * 60;
const TAMANHO_MAXIMO_DO_NOME = 100;

/**
 * @description Falha de uma chamada à API; status 0 quando o servidor nem respondeu
 */
export class ErroApi extends Error {
  constructor(mensagem, status, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

function erroDoSupabase({ error, status }) {
  if (status === 401 || SESSAO_EXPIRADA.includes(error.code)) {
    sair('expirada');
    return new ErroApi('a sessão expirou, entre de novo', 401);
  }
  if (error.code === '42501') {
    return new ErroApi('acesso negado: o usuário pode ter sido desativado', 403);
  }
  return new ErroApi(status === 0 ? 'servidor fora do ar' : error.message, status ?? 0, error.details);
}

async function executar(consulta) {
  const resposta = await consulta;
  if (resposta.error) {
    throw erroDoSupabase(resposta);
  }
  return resposta.data;
}

function exigirUsuario() {
  const id = idDoUsuario();
  if (!id) {
    sair('expirada');
    throw new ErroApi('sem sessão', 401);
  }
  return id;
}

function registroValido(entrada, rotulo = 'registro') {
  const resultado = normalizarRegistro(entrada);
  if (!resultado.ok) {
    throw new ErroApi(`${rotulo} inválido`, 400, resultado.erros);
  }
  return resultado.registro;
}

function exigirDia(dia) {
  if (!diaValido(dia)) {
    throw new ErroApi('dia inválido', 400);
  }
}

/* O supabase-js não repassa `keepalive` ao fetch; quando a aba está fechando, a gravação
   vai direto ao PostgREST com o token que já está em memória. */
async function upsertComKeepalive(tabela, linha) {
  const token = tokenAtual();
  if (!token) {
    return;
  }
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?on_conflict=${CONFLITO}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(linha),
    keepalive: true,
  }).catch(() => {
    throw new ErroApi('servidor fora do ar', 0);
  });
  if (!resposta.ok) {
    throw new ErroApi(`HTTP ${resposta.status}`, resposta.status);
  }
}

async function listarDias() {
  const registros = [];
  for (let inicio = 0; ; inicio += LINHAS_POR_PAGINA) {
    const pagina = await executar(supabase.from('dias').select(COLUNAS_DIAS)
      .order('dia').range(inicio, inicio + LINHAS_POR_PAGINA - 1));
    registros.push(...pagina.map(paraRegistro));
    if (pagina.length < LINHAS_POR_PAGINA) {
      return registros;
    }
  }
}

async function salvarDia(entrada, { keepalive = false } = {}) {
  const linha = paraLinha(registroValido(entrada), exigirUsuario());
  if (keepalive) {
    await upsertComKeepalive('dias', linha);
    return null;
  }
  const gravada = await executar(supabase.from('dias').upsert(linha, { onConflict: CONFLITO }).select(COLUNAS_DIAS).single());
  return paraRegistro(gravada);
}

async function apagarDia(dia) {
  exigirDia(dia);
  const apagadas = await executar(supabase.from('dias').delete().eq('dia', dia).select('dia'));
  if (apagadas.length === 0) {
    throw new ErroApi('dia sem registro', 404);
  }
  return null;
}

/**
 * @description Grava vários dias num upsert só; sem `sobrescrever`, os dias já registrados ficam como estão
 * @returns {Promise<{gravados: number, mantidos: number}>}
 */
async function gravarLote(registros, sobrescrever) {
  if (!Array.isArray(registros) || registros.length === 0 || registros.length > LIMITE_LOTE) {
    throw new ErroApi(`registros deve ser uma lista de 1 a ${LIMITE_LOTE} dias`, 400);
  }

  const userId = exigirUsuario();
  const linhas = umPorDia(registros.map((entrada, indice) => registroValido(entrada, `registro ${indice}`)))
    .map((registro) => paraLinha(registro, userId));

  const gravadas = await executar(supabase.from('dias')
    .upsert(linhas, { onConflict: CONFLITO, ignoreDuplicates: sobrescrever !== true })
    .select('dia'));
  return { gravados: gravadas.length, mantidos: registros.length - gravadas.length };
}

async function lerPomodoro(dia) {
  exigirDia(dia);
  const linha = await executar(supabase.from('pomodoro').select('estado').eq('dia', dia).maybeSingle());
  return linha ? linha.estado : null;
}

async function salvarPomodoro(dia, entrada, { keepalive = false } = {}) {
  exigirDia(dia);
  const estado = sanitizarEstado(entrada);
  const linha = { user_id: exigirUsuario(), dia, estado };
  if (keepalive) {
    await upsertComKeepalive('pomodoro', linha);
  } else {
    await executar(supabase.from('pomodoro').upsert(linha, { onConflict: CONFLITO }));
  }
  return estado;
}

async function listarJornadas() {
  const linhas = await executar(supabase.from('jornadas').select(COLUNAS_JORNADAS).order('vigente_desde'));
  return linhas.map(paraJornada);
}

/**
 * @description Grava uma versão de jornada; se a data de vigência mudou, a versão da data antiga sai
 * @param {object} entrada
 * @param {string|null} vigenciaAnterior - "vigente desde" da versão que estava sendo editada
 * @returns {Promise<object>}
 */
async function salvarJornada(entrada, vigenciaAnterior = null) {
  const resultado = normalizarJornada(entrada);
  if (!resultado.ok) {
    throw new ErroApi('jornada inválida', 400, resultado.erros);
  }
  const linha = linhaDeJornada(resultado.jornada, exigirUsuario());
  await executar(supabase.from('jornadas').upsert(linha, { onConflict: CONFLITO_JORNADA }));
  if (vigenciaAnterior && vigenciaAnterior !== resultado.jornada.vigenteDesde) {
    await apagarJornada(vigenciaAnterior);
  }
  return resultado.jornada;
}

async function apagarJornada(vigenteDesde) {
  exigirDia(vigenteDesde);
  await executar(supabase.from('jornadas').delete().eq('vigente_desde', vigenteDesde));
  return null;
}

async function salvarNome(nome) {
  const limpo = String(nome ?? '').trim();
  if (limpo.length > TAMANHO_MAXIMO_DO_NOME || /[\u0000-\u001F\u007F]/.test(limpo)) {
    throw new ErroApi(`o nome deve ter até ${TAMANHO_MAXIMO_DO_NOME} caracteres, sem quebras de linha`, 400);
  }
  await executar(supabase.from('perfis').update({ nome: limpo }).eq('id', exigirUsuario()));
  return limpo;
}

/**
 * @description Grava uma preferência de aparência (cor, superficie ou fundo) no perfil
 * @param {string} chave
 * @param {string} valor
 * @returns {Promise<string>}
 */
async function salvarPreferencia(chave, valor) {
  if (!opcaoValida(chave, valor)) {
    throw new ErroApi('opção de aparência inválida', 400);
  }
  const { coluna } = PREFERENCIAS[chave];
  await executar(supabase.from('perfis').update({ [coluna]: valor }).eq('id', exigirUsuario()));
  return valor;
}

const caminhoDaFoto = (userId) => `${userId}/avatar.jpg`;

/**
 * @description Envia a foto (já reduzida para JPEG) para a pasta do usuário e grava o caminho no perfil
 * @param {Blob} foto
 * @returns {Promise<string>} caminho no bucket
 */
async function enviarFoto(foto) {
  const caminho = caminhoDaFoto(exigirUsuario());
  const { error } = await supabase.storage.from(BUCKET_DAS_FOTOS)
    .upload(caminho, foto, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) {
    throw new ErroApi(error.message, error.statusCode ? Number(error.statusCode) : 0);
  }
  await executar(supabase.from('perfis').update({ avatar_path: caminho }).eq('id', exigirUsuario()));
  return caminho;
}

async function removerFoto() {
  const userId = exigirUsuario();
  await executar(supabase.from('perfis').update({ avatar_path: null }).eq('id', userId));
  await supabase.storage.from(BUCKET_DAS_FOTOS).remove([caminhoDaFoto(userId)]);
  return null;
}

/**
 * @description URL assinada (1h) da foto; o bucket é privado, então só o dono consegue gerar
 * @param {string|null} caminho
 * @returns {Promise<string|null>}
 */
async function urlDaFoto(caminho) {
  if (!caminho) {
    return null;
  }
  const { data, error } = await supabase.storage.from(BUCKET_DAS_FOTOS).createSignedUrl(caminho, VALIDADE_DA_URL_DA_FOTO_S);
  return error ? null : data.signedUrl;
}

/**
 * @description Chamadas ao Supabase, com a mesma interface da antiga API do Express. A RLS
 *   limita tudo aos dados do usuário logado. `keepalive` deixa a gravação terminar com a aba fechando
 */
export const api = {
  listarDias,
  salvarDia,
  apagarDia,
  gravarLote,
  lerPomodoro,
  salvarPomodoro,
  listarJornadas,
  salvarJornada,
  apagarJornada,
  salvarNome,
  salvarPreferencia,
  enviarFoto,
  removerFoto,
  urlDaFoto,
};
