import { parseArgs } from 'node:util';
import { avaliar } from '../public/shared/regras.js';
import { ehUtil, inicioDoHistorico } from '../public/shared/jornada.js';
import { hoje, iso, comSinal, hhmm } from '../public/shared/tempo.js';
import * as legado from './regras-legado.js';
import { resumoDoBanco, mesesDivergentes, diasComSaldoDiferente } from './conferencia.js';
import {
  sairComErro, clienteDeServico, resolverUsuario, diasNoSupabase, jornadasNoSupabase,
} from './supabase-admin.js';

const LISTA_MAXIMA = 20;
const USO = `Uso: node scripts/conferir-jornadas.js --usuario <email-ou-id> [--esperado=-01:51]

Recalcula o banco de horas do usuário com as regras fixas antigas e com as jornadas por vigência
gravadas no Supabase, e compara acumulado, meses, dias e dias sem marcação. Não grava nada.
  --esperado  acumulado que precisa sair (ex.: -01:51); diverge se não bater

Variáveis de ambiente (ou num .env na raiz, ignorado pelo git):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`;

function lerArgumentos() {
  try {
    const { values } = parseArgs({
      options: {
        usuario: { type: 'string' },
        esperado: { type: 'string' },
        ajuda: { type: 'boolean', short: 'h', default: false },
      },
    });
    if (values.ajuda || !values.usuario) {
      sairComErro(USO);
    }
    return values;
  } catch (erro) {
    return sairComErro(`${erro.message}\n\n${USO}`);
  }
}

function diasSemMarcacao(registrosPorDia, inicio, fim, eUtil) {
  const pendentes = [];
  for (let data = new Date(`${inicio}-01T12:00:00`); iso(data) <= fim; data.setDate(data.getDate() + 1)) {
    const dia = iso(data);
    if (eUtil(dia) && !registrosPorDia.has(dia)) {
      pendentes.push(dia);
    }
  }
  return pendentes;
}

function listar(rotulo, itens) {
  if (itens.length) {
    console.log(`  ${rotulo} (${itens.length}): ${itens.slice(0, LISTA_MAXIMA).join(', ')}${itens.length > LISTA_MAXIMA ? '…' : ''}`);
  }
}

async function principal() {
  const argumentos = lerArgumentos();
  const supabase = clienteDeServico();
  const perfil = await resolverUsuario(supabase, argumentos.usuario);
  const ate = hoje();
  const dias = (await diasNoSupabase(supabase, perfil.id)).filter((registro) => registro.dia <= ate);
  const versoes = await jornadasNoSupabase(supabase, perfil.id);

  console.log(`Usuário: ${perfil.email} (${perfil.id})`);
  console.log(`Dias até ${ate}: ${dias.length} · versões de jornada: ${versoes.length}`);
  versoes.forEach((versao) => console.log(`  desde ${versao.vigenteDesde}: ${versao.modo}, tolerância ${versao.toleranciaAntes}/${versao.toleranciaDepois}`));
  if (versoes.length === 0) {
    console.log('  (nenhuma: a migração 20261027180000_jornadas.sql foi aplicada?)');
  }

  const regraNova = (registro) => avaliar(registro, versoes);
  const antigo = resumoDoBanco(dias, legado.avaliar);
  const novo = resumoDoBanco(dias, regraNova);
  const meses = mesesDivergentes(antigo, novo);
  const diasDiferentes = diasComSaldoDiferente(dias, legado.avaliar, regraNova);
  const semCarga = dias.filter((registro) => registro.carga === null && registro.tipo !== 'feriado' && registro.tipo !== 'folga');

  const registrosPorDia = new Set(dias.map((registro) => registro.dia));
  const inicio = [legado.INICIO_HISTORICO, inicioDoHistorico(versoes) ?? legado.INICIO_HISTORICO].sort()[0];
  const pendentesAntigos = diasSemMarcacao(registrosPorDia, inicio, ate, legado.ehUtil);
  const pendentesNovos = diasSemMarcacao(registrosPorDia, inicio, ate, (dia) => ehUtil(dia, versoes));

  console.log(`\n                     regra antiga   jornada por vigência`);
  console.log(`acumulado            ${comSinal(antigo.acumulado).padStart(12)}   ${comSinal(novo.acumulado).padStart(20)}`);
  console.log(`dias sem marcação    ${String(pendentesAntigos.length).padStart(12)}   ${String(pendentesNovos.length).padStart(20)}`);
  meses.forEach(({ mes, origem, destino }) => console.log(`  ${mes}: antiga ${hhmm(origem)} × nova ${hhmm(destino)}`));
  listar('dias com saldo diferente', diasDiferentes.map(({ dia, a, b }) => `${dia} (${a ?? '—'} × ${b ?? '—'})`));
  listar('dias sem carga gravada', semCarga.map((registro) => registro.dia));

  const esperadoBate = !argumentos.esperado || comSinal(novo.acumulado) === argumentos.esperado.trim();
  if (!esperadoBate) {
    console.log(`  acumulado esperado ${argumentos.esperado}, calculado ${comSinal(novo.acumulado)}`);
  }

  const bate = esperadoBate && antigo.acumulado === novo.acumulado && meses.length === 0 && diasDiferentes.length === 0
    && pendentesAntigos.join() === pendentesNovos.join();
  console.log(bate ? '\nOK: o histórico é idêntico nas duas regras.' : '\nDIVERGE: veja as diferenças acima.');
  process.exitCode = bate ? 0 : 2;
}

principal().catch((erro) => sairComErro(`Erro: ${erro.message}`));
