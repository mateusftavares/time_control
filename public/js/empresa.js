import { elementos } from './util.js';
import { aoTrocarDeTela, telaAtual } from './navegacao.js';
import { iniciarUsuarios } from './usuarios.js';
import { iniciarJornadasDaEmpresa, abrirJornadas } from './jornadas.js';
import { iniciarPlataforma, abrirPlataforma } from './plataforma.js';
import { iniciarEquipe, abrirEquipe } from './equipe.js';
import { iniciarConfigTarefas, abrirConfigTarefas } from './config-tarefas.js';

const el = elementos([
  'empresaAbas', 'usuariosEmpresa', 'empresaPapel', 'empresaUsuarios', 'empresaJornadas', 'empresaEquipe', 'empresaTarefas',
  'empresaPlataforma',
]);

const SECOES = {
  usuarios: 'empresaUsuarios', jornadas: 'empresaJornadas', equipe: 'empresaEquipe', tarefas: 'empresaTarefas', plataforma: 'empresaPlataforma',
};
const AO_ABRIR = { jornadas: abrirJornadas, equipe: abrirEquipe, tarefas: abrirConfigTarefas, plataforma: abrirPlataforma };

let abaAtual = null;

/* A aba só carrega dados quando a tela Empresa está à vista (cada uma carrega uma vez). */
function mostrarAba(aba) {
  abaAtual = aba;
  el.empresaAbas.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.aba === aba));
  });
  Object.entries(SECOES).forEach(([chave, id]) => {
    el[id].hidden = chave !== aba;
  });
  if (telaAtual() === 'empresa') {
    AO_ABRIR[aba]?.();
  }
}

/**
 * @description Liga a tela Empresa: Usuários, Jornadas, Ponto da equipe e Tarefas para o ADM da empresa; Todas as empresas
 *   para o super ADM
 * @param {{id: string, papel: string, super_admin: boolean, empresa_id: string, empresas: {nome: string}}} perfil
 */
export function iniciarEmpresa(perfil) {
  const ehAdm = perfil.papel === 'admin';
  el.usuariosEmpresa.textContent = perfil.empresas?.nome ?? '';
  el.empresaPapel.textContent = [ehAdm && 'ADM da empresa', perfil.super_admin && 'super ADM da plataforma'].filter(Boolean).join(' · ');

  const abas = [...(ehAdm ? ['usuarios', 'jornadas', 'equipe', 'tarefas'] : []), ...(perfil.super_admin ? ['plataforma'] : [])];
  el.empresaAbas.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.hidden = !abas.includes(botao.dataset.aba);
  });
  if (ehAdm) {
    iniciarUsuarios(perfil);
    iniciarJornadasDaEmpresa();
    iniciarEquipe();
    iniciarConfigTarefas();
  }
  if (perfil.super_admin) {
    iniciarPlataforma(perfil);
  }
  el.empresaAbas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-aba]');
    if (botao && abas.includes(botao.dataset.aba)) {
      mostrarAba(botao.dataset.aba);
    }
  });
  aoTrocarDeTela((tela) => {
    if (tela === 'empresa') {
      AO_ABRIR[abaAtual]?.();
    }
  });
  mostrarAba(abas[0]);
}
