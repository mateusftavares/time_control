import { validarPedido, recusaDaMudanca, montarListaUsuarios } from '../../src/regras-usuarios.js';
import {
  ErroHttp, falhou, erroDoBanco, autenticar, todosOsUsuariosAuth, convidarParaEmpresa, atender,
} from '../../src/servidor.js';

/* Usa a service role, que ignora a RLS: tudo aqui passa antes pela checagem de que quem chama é o
   ADM ativo de uma empresa ativa, e só toca perfis dessa empresa. */
const BANIMENTO_SEM_PRAZO = '876000h';

export const config = { path: '/api/usuarios' };

/**
 * @description Exige que quem chama seja o ADM ativo de uma empresa ativa
 * @returns {Promise<{id: string, empresaId: string}>}
 */
async function exigirAdmin(supabase, req) {
  const { id, perfil } = await autenticar(supabase, req);
  if (!perfil || perfil.papel !== 'admin' || !perfil.ativo || !perfil.empresa_id || perfil.empresas?.ativa !== true) {
    throw new ErroHttp(403, 'só o ADM ativo da empresa gerencia usuários');
  }
  return { id, empresaId: perfil.empresa_id };
}

async function perfisDaEmpresa(supabase, empresaId) {
  const { data, error } = await supabase.from('perfis').select('id, nome, email, papel, ativo').eq('empresa_id', empresaId);
  if (error) {
    throw falhou(error, 'ler os perfis');
  }
  return data;
}

/**
 * @description Perfil-alvo da mesma empresa do ADM, já conferido contra as regras do pedido
 * @returns {Promise<object>}
 */
async function exigirAlvo(supabase, adm, pedido) {
  const alvo = (await perfisDaEmpresa(supabase, adm.empresaId)).find((perfil) => perfil.id === pedido.id);
  const recusa = recusaDaMudanca(alvo, adm.id, pedido);
  if (recusa) {
    throw new ErroHttp(recusa.status, recusa.erro);
  }
  return alvo;
}

/* O trigger manter_adm_da_empresa é a última barreira (corrida entre dois pedidos); a mensagem dele vira 409. */
async function atualizarPerfil(supabase, adm, id, campos, acao) {
  const { error } = await supabase.from('perfis').update(campos).eq('id', id).eq('empresa_id', adm.empresaId);
  if (error) {
    throw erroDoBanco(error, acao);
  }
}

const ACOES = {
  async listar(supabase, adm) {
    const [usuarios, perfis] = await Promise.all([todosOsUsuariosAuth(supabase), perfisDaEmpresa(supabase, adm.empresaId)]);
    return { usuarios: montarListaUsuarios(usuarios, perfis) };
  },

  async convidar(supabase, adm, { email, nome }, req) {
    return convidarParaEmpresa(supabase, { email, nome, empresaId: adm.empresaId }, req);
  },

  /* Virar ADM é transferência: quem pediu passa a usuário na mesma transação. */
  async alterarPapel(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    if (pedido.papel === 'admin') {
      const { error } = await supabase.rpc('transferir_adm', { p_novo: alvo.id });
      if (error) {
        throw erroDoBanco(error, 'transferir o papel de ADM');
      }
    }
    return { id: alvo.id, papel: pedido.papel };
  },

  /* Primeiro o perfil (a RLS corta os dados na hora), depois o ban (impede login e refresh do token). */
  async desativar(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    await atualizarPerfil(supabase, adm, alvo.id, { ativo: false }, 'desativar o perfil');
    const { error } = await supabase.auth.admin.updateUserById(alvo.id, { ban_duration: BANIMENTO_SEM_PRAZO });
    if (error) {
      throw falhou(error, 'bloquear o login (o perfil já foi desativado)');
    }
    return { id: alvo.id, ativo: false };
  },

  async reativar(supabase, adm, pedido) {
    const alvo = await exigirAlvo(supabase, adm, pedido);
    const { error } = await supabase.auth.admin.updateUserById(alvo.id, { ban_duration: 'none' });
    if (error) {
      throw falhou(error, 'desbloquear o login');
    }
    await atualizarPerfil(supabase, adm, alvo.id, { ativo: true }, 'reativar o perfil');
    return { id: alvo.id, ativo: true };
  },
};

/**
 * @description POST /api/usuarios { acao, ... }: listar, convidar, alterarPapel, desativar, reativar; só o ADM
 *   ativo da empresa, e só sobre os membros dela
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default function usuarios(req) {
  return atender(req, { exigir: exigirAdmin, validar: validarPedido, acoes: ACOES, nome: 'usuarios' });
}
