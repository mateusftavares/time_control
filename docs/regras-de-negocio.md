# Regras de negócio

Todas as regras ficam em `public/shared/`, em funções puras. O navegador, os scripts de `scripts/` e os testes de `test/` usam os mesmos arquivos. **Mudou uma regra? Rode `npm test`**: os testes comparam milhares de dias gerados.

Os horários circulam como texto `HH:MM` e as contas são feitas em minutos (`paraMin` e `hhmm` em `tempo.js`). As datas são `AAAA-MM-DD` no fuso local. Nunca use `new Date('AAAA-MM-DD')` direto, porque ele interpreta a data em UTC e pode cair no dia anterior; use as funções de `tempo.js`.

## O dia

Um registro de dia tem `tipo`, as quatro marcações (`chegada`, `almocoIni`, `almocoFim`, `saida`) e uma `carga` opcional.

| Tipo | Como conta |
|---|---|
| `normal` | trabalhado menos a carga, com a tolerância aplicada |
| `feriado`, `folga` | saldo zero, sem marcações |
| `compensacao` | o saldo é menos a carga do dia: consome horas do banco |

Valem para todos os usuários:
- **Almoço mínimo de 1 h:** num dia fechado, desconta-se o almoço marcado, com piso de 60 min (`almocoDescontado`). Quem almoça 40 min tem 60 descontados.
- **Trabalhado:** da chegada à saída, menos o almoço descontado. Sem chegada ou saída, o dia ainda não conta (saldo `null`).
- **Dia sem registro:** num dia útil passado, conta como **sem marcação** e não entra no saldo até ser corrigido.
- **Carga do dia:** a `carga` gravada no registro, se houver (é o campo "Jornada do dia" da tela Hoje); senão, a da jornada vigente na data.

A função central é `avaliar(registro, versoes)` em `regras.js`, que devolve a situação do dia e o saldo.

## Previsão de saída (dia em andamento)

`calcularDiaEmAndamento` faz a conta de hoje: o horário de saída que completa a carga, contando o almoço mínimo. O almoço ainda não tirado entra ao meio-dia, se couber. Se o almoço foi curto, o que falta para completar 1 h vai para o fim do dia. `validarMarcacoes` recusa marcação fora de ordem ou no futuro, explicando o motivo em cada campo.

## Jornada por vigência (`jornada.js`)

Cada usuário tem versões de jornada, cada uma válida a partir de uma data (`vigenteDesde`). O dia usa a versão de maior vigência que não passa da data dele (`jornadaDe`).

- **Sem nenhuma versão, ou antes da primeira, vale o padrão:** seg–sex 08:00–12:00 e 13:00–17:00 (08:00 por dia), tolerância de 10/10, acumulativa.
- Cada versão define, por dia da semana, se há expediente e os horários oficiais de entrada, saída para o almoço, volta e saída.
- **Carga do dia** = da entrada à saída, menos o almoço oficial (`cargaDoExpediente`). Dia sem expediente tem carga 0: tudo o que for trabalhado é saldo positivo e, sem registro, não conta como sem marcação.
- Para mudar a jornada daqui para a frente, crie uma nova vigência. Editar ou apagar uma vigência antiga recalcula os dias dela.

## Tolerância

Cada versão tem **tolerância antes** e **tolerância depois**, de 0 a 120 min. Passou do limite, a diferença conta **inteira**, sem abater a tolerância: 11 min de atraso com tolerância de 10 valem 11.

| Modo | Como funciona |
|---|---|
| **Acumulativo** | Saldo do dia = trabalhado − carga. Se ficar até "antes" minutos abaixo de zero, ou até "depois" minutos acima, vira zero. |
| **Individual** | Cada marcação é comparada com o horário oficial. Até "antes" minutos adiantada ou até "depois" minutos atrasada, vale o horário oficial; fora disso, vale o batido. O saldo é o trabalhado com as marcações ajustadas menos a carga, sem tolerância extra sobre o dia. O "trabalhado" exibido continua sendo o real. |

Exemplo, com 08:00–12:00/13:00–17:00 e tolerância 10/10:

| Marcações | Acumulativo | Individual |
|---|---|---|
| 08:15 … 17:20 | +5 no dia, dentro: **00:00** | nenhuma marcação dentro de 10 min: **+00:05** |
| 07:52 … 17:09 | +17 no dia, fora: **+00:17** | as duas dentro, valem 08:00 e 17:00: **00:00** |

## Histórico preservado na mudança para vigências

Antes das vigências, a regra era fixa no código: 08:48 por dia até fevereiro de 2026 e 08:00 a partir de março. A migração `20261027180000_jornadas.sql` manteve o histórico idêntico em dois passos:

1. **Semeou** para cada usuário as vigências equivalentes: desde 2026-02-01, seg–sex 08:00–12:00/13:00–17:48 (08:48); desde 2026-03-01, 08:00–12:00/13:00–17:00 (08:00). As duas são acumulativas, 10/10.
2. **Congelou a carga** de todo dia `normal` ou `compensacao` sem carga, gravando a carga que a regra antiga dava. A regra antiga dava carga também em fim de semana e antes de fevereiro, onde a nova daria 0 ou o padrão.

A regra antiga, congelada, está em `scripts/regras-legado.js`. O `test/jornada.test.js` compara as duas regras em cerca de 2 mil dias gerados. Com dados reais, `npm run conferir-jornadas` faz a mesma comparação sem gravar nada (ver [operacao.md](operacao.md)).

## Importação do TiqueTaque (`espelho.js`)

- `lerEspelho(texto)`: o espelho colado vem com uma linha por item: data `DD/MM/AAAA`, dia da semana, batidas `HH:MM` separadas por espaço ou um rótulo (`DSR`, `Dia comp.`, `Feriado`). Às vezes vem também "Banco de horas:" seguido do saldo oficial, como `+0h05min`.
- `registroDe(lido)`: quatro batidas viram chegada, almoço, volta e saída. Com mais de quatro, o maior intervalo do meio é o almoço. Feriado vira um dia `feriado`. DSR, dia de compensação e dia sem batidas não geram registro. A carga gravada é a da jornada vigente na data.
- `conferir(lido, registro)`: compara o saldo calculado pelas regras do app com o saldo oficial do TiqueTaque. A tela marca os dias que divergem.

## Pomodoro (`shared/pomodoro.js` + `js/pomodoro.js`)

- **Ciclo:** foco de 25 min e descanso de 5 min. A cada 5 descansos, o quinto é o longo, de 10 min.
- **Emendar etapas** (`auto`): ao acabar uma etapa, a próxima começa sozinha. **Som:** bipes curtos feitos com Web Audio, sem arquivo de áudio.
- **Pausa com motivo:** Treinamento, Reunião, Almoço ou Outro. O relógio congela e o tempo parado é somado no motivo, no resumo "Hoje" do pomodoro.
- **Relógio confiável:** a contagem usa o horário de término (`endsAt`), não um contador que decrementa. Fechar a aba ou suspender o computador não atrasa o pomodoro.
- **Um estado por dia:** ao virar o dia, o anterior é gravado como estava e o novo começa zerado.
- **Atalho Espaço:** na tela Hoje e fora de campos, começa, pausa ou retoma.
