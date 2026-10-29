import { recusaDaMudanca } from '../../src/regras-usuarios.js';
import { validarPedidoEmpresa, recusaDeDesativar, montarEmpresas } from '../../src/regras-empresas.js';
import {
  ErroHttp, falhou, erroDoBanco, autenticar, todosOsUsuariosAuth, convidarParaEmpresa, atender,
} from '../../src/servidor.js';

/* Gestão de empresas, só do super ADM da plataforma. Usa a service role: lê empresas e membros (nome,
   e-mail, papel, situação) de todas, mas nunca os dados de trabalho delas (ponto, jornadas, tarefas). */

export const config = { path: '/api/empresas' };

/**
 * @description Exige que quem chama seja super ADM ativo
 * @returns {Promise<{id: string, empresaId: string|null}>}
 */
async function exigirSuperAdmin(supabase, req) {
  const { id, perfil } = await autenticar(supabase, req);
  if (!perfil || !perfil.super_admin || !perfil.ativo) {
    throw new ErroHttp(403, 'só o super ADM gerencia empresas');
  }
  return { id, empresaId: perfil.empresa_id };
}

async function exigirEmpresa(supabase, empresaId) {
  const { data, error } = await supabase.from('empresas').select('id, nome, ativa').eq('id', empresaId).maybeSingle();
  if (error) {
    throw falhou(error, 'ler a empresa');
  }
  if (!data) {
    throw new ErroHttp(404, 'empresa não encontrada');
  }
  return data;
}

async function atualizarEmpresa(supabase, empresaId, campos, acao) {
  const { error } = await supabase.from('empresas').update(campos).eq('id', empresaId);
  if (error) {
    throw falhou(error, acao);
  }
}

const ACOES = {
  async listar(supabase) {
    const [empresas, perfis, usuarios] = await Promise.all([
      supabase.from('empresas').select('id, nome, ativa, criado_em'),
      supabase.from('perfis').select('id, nome, email, papel, ativo, empresa_id').not('empresa_id', 'is', null),
      todosOsUsuariosAuth(supabase),
    ]);
    if (empresas.error || perfis.error) {
      throw falhou(empresas.error ?? perfis.error, 'listar as empresas');
    }
    return { empresas: montarEmpresas(empresas.data, perfis.data, usuarios) };
  },

  /* Empresa nova nasce com o ADM convidado; se o convite falhar, a empresa (ainda vazia) é apagada. */
  async criar(supabase, quem, { nomeEmpresa, email, nome }, req) {
    const { data: empresa, error } = await supabase.from('empresas').insert({ nome: nomeEmpresa }).select('id').single();
    if (error) {
      throw falhou(error, 'criar a empresa');
    }
    try {
      await convidarParaEmpresa(supabase, { email, nome, empresaId: empresa.id, papel: 'admin' }, req);
    } catch (erro) {
      const { error: erroDesfazer } = await supabase.from('empresas').delete().eq('id', empresa.id);
      if (erroDesfazer) {
        console.error(`empresas: a empresa ${empresa.id} ficou vazia (não deu para apagar)`, erroDesfazer);
      }
      throw erro;
    }
    return { id: empresa.id };
  },

  async convidar(supabase, quem, { empresaId, email, nome }, req) {
    const empresa = await exigirEmpresa(supabase, empresaId);
    if (!empresa.ativa) {
      throw new ErroHttp(409, 'a empresa está desativada: reative antes de convidar');
    }
    return convidarParaEmpresa(supabase, { email, nome, empresaId: empresa.id }, req);
  },

  async renomear(supabase, quem, { empresaId, nomeEmpresa }) {
    await exigirEmpresa(supabase, empresaId);
    await atualizarEmpresa(supabase, empresaId, { nome: nomeEmpresa }, 'renomear a empresa');
    return { id: empresaId, nome: nomeEmpresa };
  },

  /* Desativar corta na hora o acesso de todos os membros (perfil_ativo exige empresa ativa). */
  async desativar(supabase, quem, { empresaId }) {
    const recusa = recusaDeDesativar(empresaId, quem.empresaId);
    if (recusa) {
      throw new ErroHttp(recusa.status, recusa.erro);
    }
    await exigirEmpresa(supabase, empresaId);
    await atualizarEmpresa(supabase, empresaId, { ativa: false }, 'desativar a empresa');
    return { id: empresaId, ativa: false };
  },

  async reativar(supabase, quem, { empresaId }) {
    await exigirEmpresa(supabase, empresaId);
    await atualizarEmpresa(supabase, empresaId, { ativa: true }, 'reativar a empresa');
    return { id: empresaId, ativa: true };
  },

  /* Mesma regra da tela de Usuários: o novo ADM é um membro ativo da empresa, e o antigo vira usuário. */
  async transferirAdm(supabase, quem, { empresaId, id }) {
    const { data: membros, error } = await supabase.from('perfis').select('id, papel, ativo').eq('empresa_id', empresaId);
    if (error) {
      throw falhou(error, 'ler os membros da empresa');
    }
    const admAtual = membros.find((membro) => membro.papel === 'admin');
    const recusa = recusaDaMudanca(membros.find((membro) => membro.id === id), admAtual?.id ?? null,
      { acao: 'alterarPapel', papel: 'admin' });
    if (recusa) {
      throw new ErroHttp(recusa.status, recusa.erro);
    }
    const { error: erroRpc } = await supabase.rpc('transferir_adm', { p_novo: id });
    if (erroRpc) {
      throw erroDoBanco(erroRpc, 'transferir o papel de ADM');
    }
    return { id, empresaId };
  },
};

/**
 * @description POST /api/empresas { acao, ... }: listar, criar, convidar, renomear, desativar, reativar,
 *   transferirAdm; só o super ADM ativo
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default function empresas(req) {
  return atender(req, { exigir: exigirSuperAdmin, validar: validarPedidoEmpresa, acoes: ACOES, nome: 'empresas' });
}
