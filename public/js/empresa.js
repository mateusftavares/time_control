import { elementos } from './util.js';
import { iniciarUsuarios } from './usuarios.js';
import { iniciarJornadasDaEmpresa, abrirJornadas } from './jornadas.js';

const el = elementos(['empresaAbas', 'empresaUsuarios', 'empresaJornadas']);

function mostrarAba(aba) {
  el.empresaAbas.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.aba === aba));
  });
  el.empresaUsuarios.hidden = aba !== 'usuarios';
  el.empresaJornadas.hidden = aba !== 'jornadas';
  if (aba === 'jornadas') {
    abrirJornadas();
  }
}

/**
 * @description Liga a tela Empresa (só o ADM): abas Usuários e Jornadas
 * @param {{id: string, empresas: {nome: string}}} perfil - o ADM logado
 */
export function iniciarEmpresa(perfil) {
  iniciarUsuarios(perfil);
  iniciarJornadasDaEmpresa();
  el.empresaAbas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-aba]');
    if (botao) {
      mostrarAba(botao.dataset.aba);
    }
  });
}
