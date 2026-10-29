# Banco de dados (Supabase)

O schema inteiro está em `supabase/migrations/`, aplicado em ordem pelo `supabase db push`. **Nunca altere o banco pelo dashboard sem criar a migração correspondente**: o repositório é a fonte da verdade.

## Migrações

| Arquivo | O que faz |
|---|---|
| `20261027120000_inicial.sql` | Tabelas `perfis`, `dias` e `pomodoro`. RLS em todas, trigger que cria o perfil de cada usuário novo, trigger que copia a troca de e-mail para o perfil, trava `manter_um_admin` e carimbo de `atualizado_em`. |
| `20261027180000_jornadas.sql` | Tabela `jornadas` (vigências), função `semana_valida`, RLS, semeadura das vigências equivalentes às regras antigas e congelamento da carga dos dias antigos (ver [regras-de-negocio.md](regras-de-negocio.md)). |
| `20261027180100_perfil_e_avatares.sql` | O dono pode alterar `nome` e `avatar_path`. Cria o bucket privado `avatares` com policies por pasta. |
| `20261028120000_cor_de_destaque.sql` | Coluna `perfis.cor_destaque`. |
| `20261028150000_aparencia.sql` | Colunas `perfis.superficie` e `perfis.fundo`. |
| `20261029120000_tarefas.sql` | Tabela `tarefas`, trigger `carimbar_tarefa` (datas de gravação, criação e conclusão no servidor), RLS e a função `somar_foco`. |
| `20261029150000_status_commit_e_teste.sql` | Status `commit_realizado` (só na branch do dev) e `pendente_teste` (no pacote, fora da master) em `tarefas`. |

## Tabelas

### `perfis`: um por usuário do Auth

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | `auth.users.id`; apagar o usuário apaga o perfil |
| `nome` | text | até 100 caracteres, sem caracteres de controle |
| `email` | text | cópia do e-mail do Auth, mantida por trigger |
| `papel` | text | `admin` ou `usuario` (padrão) |
| `ativo` | boolean | `false` corta o acesso aos dados na hora |
| `avatar_path` | text | `null` ou exatamente `<id>/avatar.jpg` |
| `cor_destaque` | text | `azul` (padrão), `amarelo`, `verde` ou `vermelho` |
| `superficie` | text | `opaco` (padrão), `sutil` ou `liquido` |
| `fundo` | text | `liso` (padrão), `cinza` ou `colorido` |
| `criado_em` | timestamptz | |

O trigger `ao_criar_usuario` (em `auth.users`) cria o perfil. O nome vem do metadado `nome` do convite ou, sem ele, da parte do e-mail antes do `@`.

### `dias`: um registro por usuário e dia

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id` | uuid | padrão `auth.uid()` |
| `dia` | date | PK junto com `user_id` |
| `tipo` | text | `normal`, `feriado`, `folga` ou `compensacao` |
| `chegada`, `almoco_ini`, `almoco_fim`, `saida` | text | `HH:MM` válido ou `null` |
| `carga` | text | `HH:MM` ou `null` (null = usa a jornada vigente) |
| `atualizado_em` | timestamptz | carimbado por trigger |

### `pomodoro`: estado do pomodoro por usuário e dia

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id`, `dia` | uuid, date | PK |
| `estado` | jsonb | objeto de até 4 KB. Os campos (em inglês, porque é o formato já gravado) são `phase`, `running`, `paused`, `reason`, `remaining`, `endsAt`, `pausedAt`, `breaks`, `pomodoros`, `focusMs`, `pauseMs`, `sound` e `auto`, mais `tarefa` (uuid da tarefa em foco, ou `null`). O front sempre passa o estado por `sanitizarEstado` antes de usar. |

### `tarefas`: demandas do trabalho de cada usuário

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | gerado pelo banco |
| `user_id` | uuid | padrão `auth.uid()` |
| `titulo` | text | 1 a 200 caracteres |
| `cliente` | text | cliente ou projeto, até 80 caracteres |
| `status` | text | `a_fazer` (padrão), `em_andamento`, `commit_realizado`, `pendente_teste`, `aguardando` ou `concluida` |
| `prioridade` | text | `urgente`, `alta`, `normal` (padrão) ou `baixa` |
| `prazo` | date | opcional |
| `recorrencia` | text | `null`, `diaria`, `semanal` ou `mensal` |
| `anotacoes` | text | até 10 mil caracteres |
| `checklist` | jsonb | lista de `{ texto, feito }`, até 16 KB |
| `commits` | jsonb | lista de `{ hash, branch, data }`, até 16 KB |
| `foco_ms`, `pomodoros` | bigint, integer | somados pelo pomodoro via `somar_foco` |
| `concluida_em` | timestamptz | carimbado pelo trigger ao concluir; volta a `null` ao reabrir |
| `criado_em`, `atualizado_em` | timestamptz | carimbados pelo trigger |

`somar_foco(tarefa, ms, pomodoros)` soma no próprio `UPDATE` (duas abas não se sobrescrevem), limita cada chamada a 1 h e 1 pomodoro e roda como o usuário (`security invoker`), então a RLS vale.

### `jornadas`: vigências da jornada de cada usuário

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id`, `vigente_desde` | uuid, date | PK |
| `tolerancia_antes`, `tolerancia_depois` | smallint | 0 a 120 minutos |
| `modo` | text | `acumulativo` ou `individual` |
| `semana` | jsonb | 7 itens (índice 0 = domingo), cada um `{ trabalha, entrada, almocoIni, almocoFim, saida }`. Validado por `semana_valida()`. |

## Quem pode o quê (RLS)

| Tabela | Ler | Inserir / alterar / apagar |
|---|---|---|
| `perfis` | o próprio; admin lê todos | cliente: só `nome`, `avatar_path`, `cor_destaque`, `superficie` e `fundo` do próprio perfil, e só se ativo. Papel e ativo: só a função de usuários (service role) ou o SQL Editor. |
| `dias`, `pomodoro`, `jornadas`, `tarefas` | só as próprias linhas, com perfil ativo | idem |
| `storage.objects` (bucket `avatares`) | só a própria pasta `<uid>/` | só a própria pasta, com perfil ativo |

Detalhes que importam:
- As policies chamam `public.perfil_ativo()` e `public.eh_admin()`. São funções `security definer` que leem `perfis` sem passar pela RLS, o que evita recursão na policy da própria tabela. Ninguém de fora (`anon`) pode executá-las.
- Além da policy, o privilégio de update é **por coluna** (`grant update (nome, avatar_path, ...)`). Mesmo que uma policy fosse afrouxada por engano, o cliente continuaria sem poder mexer em `papel` ou `ativo`.
- **`manter_um_admin`:** trigger em `update of papel, ativo` e em `delete` de `perfis`. Recusa a mudança que deixaria o sistema sem admin ativo, até pelo SQL Editor ou ao apagar o usuário no dashboard. A função de usuários traduz esse erro para HTTP 409.

## Storage: fotos

- Bucket `avatares`: privado, limite de 2 MB, só `image/jpeg`, `image/png` e `image/webp` (SVG fica de fora porque pode carregar script).
- Caminho fixo `<uid>/avatar.jpg`. A coluna `avatar_path` tem uma *check* que só aceita esse caminho.
- O front mostra a foto por URL assinada de 1 h (`createSignedUrl`).

## Como criar uma coluna nova no perfil (receita)

Foi assim com a cor de destaque e a aparência:

1. Crie a migração `supabase/migrations/AAAAMMDDHHMMSS_nome.sql` com `alter table public.perfis add column ... check (...)` e `grant update (coluna) on public.perfis to authenticated;`. A policy de update existente já cobre a linha do dono.
2. Aplique com `npx supabase db push --linked` (ver [operacao.md](operacao.md)).
3. Inclua a coluna no `select` de `carregarPerfil()` em `public/js/sessao.js`.
4. Grave pelo `api.js`, sempre validando o valor antes de mandar.
