import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { normalizarRegistro } from '../public/shared/registro.js';
import { sanitizarEstado } from '../public/shared/pomodoro.js';
import { hhmm, comSinal } from '../public/shared/tempo.js';
import { avaliar } from '../public/shared/regras.js';
import { COLUNAS_DIAS, paraRegistro, paraLinha } from '../public/shared/linhas.js';
import { resumoDoBanco, compararDias, mesesDivergentes } from './conferencia.js';
import {
  sairComErro, clienteDeServico, resolverUsuario, diasNoSupabase, jornadasNoSupabase,
} from './supabase-admin.js';

const LINHAS_POR_ENVIO = 500;
const CONFLITO = 'user_id,dia';
const USO = `Uso: node scripts/migrar-sqlite-para-supabase.js <arquivo.db> --usuario <email-ou-id> [--sobrescrever] [--conferir]

  --usuario       dono dos dados no Supabase (e-mail ou id do perfil)
  --sobrescrever  substitui dias e pomodoros que já existem no Supabase (sem ele, ficam como estão)
  --conferir      não grava: compara o banco de horas do .db com o do Supabase

Variáveis de ambiente (ou num .env na raiz, ignorado pelo git):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`;

function lerArgumentos() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        usuario: { type: 'string' },
        sobrescrever: { type: 'boolean', default: false },
        conferir: { type: 'boolean', default: false },
        ajuda: { type: 'boolean', short: 'h', default: false },
      },
    });
    if (values.ajuda || positionals.length !== 1 || !values.usuario) {
      sairComErro(USO);
    }
    return { arquivo: path.resolve(positionals[0]), ...values };
  } catch (erro) {
    sairComErro(`${erro.message}\n\n${USO}`);
  }
}

function lerBancoLocal(arquivo) {
  if (!fs.existsSync(arquivo)) {
    sairComErro(`Arquivo não encontrado: ${arquivo}`);
  }
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const dias = db.prepare(`SELECT ${COLUNAS_DIAS} FROM dias ORDER BY dia`).all();
    const pomodoros = db.prepare('SELECT dia, estado FROM pomodoro ORDER BY dia').all();
    return { dias, pomodoros };
  } finally {
    db.close();
  }
}

function separarValidos(linhas) {
  const validos = [];
  const invalidos = [];
  linhas.forEach((linha) => {
    const resultado = normalizarRegistro(paraRegistro(linha));
    if (resultado.ok) {
      validos.push(resultado.registro);
    } else {
      invalidos.push(`${linha.dia}: ${resultado.erros.join('; ')}`);
    }
  });
  return { validos, invalidos };
}

function lerPomodoros(linhas) {
  return linhas.flatMap(({ dia, estado }) => {
    try {
      return [{ dia, estado: sanitizarEstado(JSON.parse(estado)) }];
    } catch {
      console.warn(`  pomodoro de ${dia} ignorado: JSON inválido`);
      return [];
    }
  });
}

async function gravarEmPartes(supabase, tabela, linhas, sobrescrever) {
  let gravados = 0;
  for (let inicio = 0; inicio < linhas.length; inicio += LINHAS_POR_ENVIO) {
    const parte = linhas.slice(inicio, inicio + LINHAS_POR_ENVIO);
    const { data, error } = await supabase.from(tabela)
      .upsert(parte, { onConflict: CONFLITO, ignoreDuplicates: !sobrescrever })
      .select('dia');
    if (error) {
      sairComErro(`Falha ao gravar em ${tabela} (a partir de ${parte[0].dia}): ${error.message}`);
    }
    gravados += data.length;
  }
  return { gravados, mantidos: linhas.length - gravados };
}

async function contarPomodoros(supabase, userId) {
  const { count, error } = await supabase.from('pomodoro').select('dia', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) {
    sairComErro(`Falha ao contar os pomodoros: ${error.message}`);
  }
  return count;
}

async function migrar(supabase, perfil, dias, pomodoros, sobrescrever) {
  const linhasDias = dias.map((registro) => paraLinha(registro, perfil.id));
  const linhasPomodoro = pomodoros.map(({ dia, estado }) => ({ user_id: perfil.id, dia, estado }));

  const resultadoDias = await gravarEmPartes(supabase, 'dias', linhasDias, sobrescrever);
  console.log(`dias: ${resultadoDias.gravados} gravados, ${resultadoDias.mantidos} mantidos (já existiam)`);

  const resultadoPomodoro = await gravarEmPartes(supabase, 'pomodoro', linhasPomodoro, sobrescrever);
  console.log(`pomodoro: ${resultadoPomodoro.gravados} gravados, ${resultadoPomodoro.mantidos} mantidos`);
}

/* Banco de horas recalculado com as regras de shared/ e as jornadas do usuário, dos dois lados: se bate, a migração não mudou o saldo. */
async function conferir(supabase, perfil, dias, pomodoros) {
  const remotos = await diasNoSupabase(supabase, perfil.id);
  const versoes = await jornadasNoSupabase(supabase, perfil.id);
  const regra = (registro) => avaliar(registro, versoes);
  const local = resumoDoBanco(dias, regra);
  const remoto = resumoDoBanco(remotos, regra);
  const diferencas = compararDias(dias, remotos);
  const meses = mesesDivergentes(local, remoto);
  const pomodorosRemotos = await contarPomodoros(supabase, perfil.id);

  console.log(`                 .db        Supabase`);
  console.log(`dias        ${String(local.dias).padStart(9)}  ${String(remoto.dias).padStart(12)}`);
  console.log(`acumulado   ${comSinal(local.acumulado).padStart(9)}  ${comSinal(remoto.acumulado).padStart(12)}`);
  console.log(`pomodoros   ${String(pomodoros.length).padStart(9)}  ${String(pomodorosRemotos).padStart(12)}`);

  meses.forEach(({ mes, origem, destino }) => console.log(`  ${mes}: .db ${hhmm(origem)} × Supabase ${hhmm(destino)}`));
  [['faltando no Supabase', diferencas.faltando], ['só no Supabase', diferencas.sobrando],
    ['com campos diferentes', diferencas.diferentes]].forEach(([rotulo, lista]) => {
    if (lista.length) {
      console.log(`  ${lista.length} dia(s) ${rotulo}: ${lista.slice(0, 15).join(', ')}${lista.length > 15 ? '…' : ''}`);
    }
  });

  const bate = local.acumulado === remoto.acumulado && meses.length === 0
    && diferencas.faltando.length === 0 && diferencas.diferentes.length === 0;
  console.log(bate ? '\nOK: o banco de horas bate.' : '\nDIVERGE: veja as diferenças acima.');
  process.exitCode = bate ? 0 : 2;
}

async function principal() {
  const argumentos = lerArgumentos();
  const supabase = clienteDeServico();
  const { dias: linhasDias, pomodoros: linhasPomodoro } = lerBancoLocal(argumentos.arquivo);
  const { validos, invalidos } = separarValidos(linhasDias);
  const pomodoros = lerPomodoros(linhasPomodoro);

  if (invalidos.length) {
    console.warn(`${invalidos.length} dia(s) inválido(s) ficam de fora:`);
    invalidos.forEach((linha) => console.warn(`  ${linha}`));
  }

  const perfil = await resolverUsuario(supabase, argumentos.usuario);
  console.log(`Usuário: ${perfil.email} (${perfil.id})${perfil.ativo ? '' : ' — INATIVO'}`);
  console.log(`No .db: ${validos.length} dia(s) válido(s), ${pomodoros.length} pomodoro(s)\n`);

  if (argumentos.conferir) {
    await conferir(supabase, perfil, validos, pomodoros);
  } else {
    await migrar(supabase, perfil, validos, pomodoros, argumentos.sobrescrever);
    console.log('\nPronto. Rode de novo com --conferir para comparar o banco de horas.');
  }
}

principal().catch((erro) => sairComErro(`Erro: ${erro.message}`));
