import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { COLUNAS_DIAS, COLUNAS_JORNADAS, paraRegistro, paraJornada } from '../public/shared/linhas.js';
import { idValido, normalizarEmail } from '../src/regras-usuarios.js';

const LINHAS_POR_PAGINA = 1000;

/**
 * @description Mostra a mensagem e encerra com código 1
 * @param {string} mensagem
 */
export function sairComErro(mensagem) {
  console.error(mensagem);
  process.exit(1);
}

/**
 * @description Cliente com a service role, lida do ambiente ou do .env da raiz (ignorado pelo git)
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function clienteDeServico() {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') {
      throw erro;
    }
  }
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: chave } = process.env;
  if (!url || !chave) {
    sairComErro('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (ou no .env).');
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * @description Perfil de um usuário pelo e-mail ou pelo id
 * @returns {Promise<{id: string, email: string, nome: string, ativo: boolean}>}
 */
export async function resolverUsuario(supabase, usuario) {
  const email = normalizarEmail(usuario);
  if (!idValido(usuario) && !email) {
    sairComErro(`--usuario deve ser um e-mail ou um id (uuid): ${usuario}`);
  }

  const consulta = supabase.from('perfis').select('id, email, nome, ativo');
  const { data, error } = await (idValido(usuario) ? consulta.eq('id', usuario) : consulta.eq('email', email)).maybeSingle();
  if (error) {
    sairComErro(`Falha ao procurar o usuário: ${error.message}`);
  }
  if (!data) {
    sairComErro(`Nenhum perfil com ${usuario}. O usuário precisa existir (convite aceito).`);
  }
  return data;
}

/**
 * @description Todos os dias de um usuário no Supabase, como registros do app
 * @returns {Promise<object[]>}
 */
export async function diasNoSupabase(supabase, userId) {
  const registros = [];
  for (let inicio = 0; ; inicio += LINHAS_POR_PAGINA) {
    const { data, error } = await supabase.from('dias').select(COLUNAS_DIAS)
      .eq('user_id', userId).order('dia').range(inicio, inicio + LINHAS_POR_PAGINA - 1);
    if (error) {
      sairComErro(`Falha ao ler os dias do Supabase: ${error.message}`);
    }
    registros.push(...data.map(paraRegistro));
    if (data.length < LINHAS_POR_PAGINA) {
      return registros;
    }
  }
}

/**
 * @description Versões de jornada de um usuário no Supabase
 * @returns {Promise<object[]>}
 */
export async function jornadasNoSupabase(supabase, userId) {
  const { data, error } = await supabase.from('jornadas').select(COLUNAS_JORNADAS).eq('user_id', userId).order('vigente_desde');
  if (error) {
    sairComErro(`Falha ao ler as jornadas do Supabase: ${error.message}`);
  }
  return data.map(paraJornada);
}
