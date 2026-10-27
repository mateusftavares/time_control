import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CHAVE_LEMBRAR = 'controle-pessoal:lembrar';

function armazenamento(nome) {
  try {
    return window[nome];
  } catch {
    return null;
  }
}

/**
 * @description Se a sessão deve sobreviver ao fechar o navegador ("Lembrar de mim")
 * @returns {boolean}
 */
export function lembrarSessao() {
  return armazenamento('localStorage')?.getItem(CHAVE_LEMBRAR) === 'sim';
}

/**
 * @description Guarda a escolha do "Lembrar de mim"; vale para a próxima sessão gravada
 * @param {boolean} lembrar
 */
export function definirLembrarSessao(lembrar) {
  armazenamento('localStorage')?.setItem(CHAVE_LEMBRAR, lembrar ? 'sim' : 'nao');
}

/* A sessão fica num só lugar: localStorage quando "Lembrar de mim" está marcado, sessionStorage
   (some ao fechar a aba) quando não. Gravar num apaga do outro, para não sobrar token esquecido. */
const armazenamentoDaSessao = {
  getItem(chave) {
    return armazenamento('sessionStorage')?.getItem(chave) ?? armazenamento('localStorage')?.getItem(chave) ?? null;
  },
  setItem(chave, valor) {
    const [destino, outro] = lembrarSessao() ? ['localStorage', 'sessionStorage'] : ['sessionStorage', 'localStorage'];
    armazenamento(destino)?.setItem(chave, valor);
    armazenamento(outro)?.removeItem(chave);
  },
  removeItem(chave) {
    armazenamento('sessionStorage')?.removeItem(chave);
    armazenamento('localStorage')?.removeItem(chave);
  },
};

/* Fluxo implicit: o convite é disparado pelo admin em outro navegador, então o PKCE
   (que guarda o verificador no navegador de quem pediu) não serviria para ele. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: armazenamentoDaSessao,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
