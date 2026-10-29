import { tokenAtual, sair } from './sessao.js';

/**
 * @description Chama uma função de servidor do Netlify (/api/usuarios, /api/empresas) com o JWT da sessão;
 *   a própria função confere quem chama
 * @param {string} endereco
 * @param {object} pedido - { acao, ... }
 * @returns {Promise<object>}
 */
export async function chamarFuncao(endereco, pedido) {
  let resposta;
  try {
    resposta = await fetch(endereco, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAtual()}` },
      body: JSON.stringify(pedido),
    });
  } catch {
    throw new Error('a função do servidor não respondeu');
  }

  const dados = await resposta.json().catch(() => null);
  if (resposta.status === 401) {
    sair('expirada');
  }
  if (!resposta.ok) {
    throw new Error(dados?.erro ?? `HTTP ${resposta.status}`);
  }
  return dados;
}
