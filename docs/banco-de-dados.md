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
| `20261030120000_empresas.sql` | Tabela `empresas`, `perfis.empresa_id` e `perfis.super_admin`, um ADM por empresa (índice `perfis_um_adm_por_empresa` + trigger `manter_adm_da_empresa`, que substitui `manter_um_admin`), funções `minha_empresa`, `eh_super_admin` e `transferir_adm`, e `perfil_ativo`/`eh_admin` passando a exigir empresa ativa. Coloca os usuários existentes na empresa "TimEver"; o admin atual vira o ADM dela e o super ADM. |
| `20261030150000_jornadas_da_empresa.sql` | Jornadas da empresa: `modelos_jornada`, `versoes_jornada` e `atribuicoes_jornada`, função `da_minha_empresa`, trigger `conferir_atribuicao_jornada` e RLS (todos leem, só o ADM grava). As vigências de cada usuário viram um modelo "Jornada de <nome>" atribuído desde a primeira. A tabela antiga `jornadas` fica só leitura até o front novo entrar no ar. |
| `20261030180000_adm_le_ponto_da_empresa.sql` | Policy de leitura em `dias` para o ADM da empresa (`eh_admin()` e `da_minha_empresa(user_id)`). Gravar e apagar continuam só do dono. |
| `20261031120000_tarefas_da_empresa.sql` | Tabela `clientes` (por empresa), `tarefas.empresa_id`, `responsavel_id` e `cliente_id` (as tarefas existentes vão para a empresa do dono, com ele de responsável, e os textos de cliente viram cadastros), RLS das tarefas por empresa (apagar: quem criou, o responsável ou o ADM), `carimbar_tarefa` fixando criador e empresa, função `colegas()` e `empresas.status_tarefas`/`usa_commits` (o ADM altera; a TimEver mantém os 6 status e os commits). |
| `20261101120000_atividade_das_tarefas.sql` | Tabela `atividades_tarefa` (criada, status, campo, comentário), trigger `registrar_atividade_tarefa` (o servidor grava as mudanças de status, título, prazo, prioridade, responsável e cliente), evento "criada" para as tarefas existentes, RLS (todos leem; comentário só em nome próprio; o autor ou o ADM apaga o comentário) e `tarefas` + `atividades_tarefa` na publicação do Realtime. |

## Tabelas

### `perfis`: um por usuário do Auth

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | `auth.users.id`; apagar o usuário apaga o perfil |
| `nome` | text | até 100 caracteres, sem caracteres de controle |
| `email` | text | cópia do e-mail do Auth, mantida por trigger |
| `papel` | text | `admin` (o ADM da empresa, exatamente um por empresa) ou `usuario` (padrão) |
| `ativo` | boolean | `false` corta o acesso aos dados na hora |
| `empresa_id` | uuid | empresa do usuário; sem empresa (convite em andamento) não há acesso aos dados |
| `super_admin` | boolean | super ADM da plataforma: cria empresas e convida o ADM delas; não lê os dados das empresas |
| `avatar_path` | text | `null` ou exatamente `<id>/avatar.jpg` |
| `cor_destaque` | text | `azul` (padrão), `amarelo`, `verde` ou `vermelho` |
| `superficie` | text | `opaco` (padrão), `sutil` ou `liquido` |
| `fundo` | text | `liso` (padrão), `cinza` ou `colorido` |
| `criado_em` | timestamptz | |

O trigger `ao_criar_usuario` (em `auth.users`) cria o perfil. O nome vem do metadado `nome` do convite ou, sem ele, da parte do e-mail antes do `@`.

### `empresas`: o tenant

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | |
| `nome` | text | 1 a 100 caracteres, sem caracteres de controle |
| `ativa` | boolean | `false` corta o acesso de todos os membros na hora |
| `status_tarefas` | text[] | status em uso nas tarefas; sempre inclui `a_fazer` e `concluida`. Empresa nova: os 4 gerais |
| `usa_commits` | boolean | mostra o bloco de commits nas tarefas. Empresa nova: `false` |
| `criado_em` | timestamptz | |

Só a função do Netlify (service role) ou o SQL Editor criam e alteram empresas; a exceção é o ADM, que altera `status_tarefas` e `usa_commits` da própria (privilégio por coluna mais policy). O membro lê a própria; o super ADM lê todas.

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

### `tarefas`: demandas do trabalho da empresa

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | gerado pelo banco |
| `user_id` | uuid | quem criou; padrão `auth.uid()`, não muda depois (trigger) |
| `empresa_id` | uuid | padrão `minha_empresa()`, não muda depois (trigger) |
| `responsavel_id` | uuid | membro da mesma empresa (RLS) ou `null`; padrão `auth.uid()`. Trocar: só quem criou, o responsável atual ou o ADM (trigger) |
| `cliente_id` | uuid | cliente da mesma empresa (RLS) ou `null` |
| `titulo` | text | 1 a 200 caracteres |
| `cliente` | text | nome do cliente, até 80 caracteres (gravado junto com `cliente_id`; a tela mostra o nome do cadastro) |
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

### `atividades_tarefa`: histórico e comentários das tarefas

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | bigint, PK | |
| `tarefa_id`, `empresa_id` | uuid | apagar a tarefa apaga a atividade |
| `user_id` | uuid | quem fez (`auth.uid()` no trigger) ou quem comentou |
| `tipo` | text | `criada`, `status`, `campo` ou `comentario` |
| `campo` | text | em `campo`: `titulo`, `prazo`, `prioridade`, `responsavel` ou `cliente` |
| `de`, `para` | text | valores antes e depois (responsável vai como id) |
| `texto` | text | só no comentário, 1 a 4.000 caracteres |
| `criado_em` | timestamptz | |

O foco do pomodoro não gera evento. Não há update pelo cliente.

### `clientes`: cadastro de clientes da empresa

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid | padrão `minha_empresa()` |
| `nome` | text | 1 a 80 caracteres, único na empresa sem diferenciar maiúsculas |
| `arquivado` | boolean | arquivado some das sugestões, mas continua nas tarefas |

Qualquer membro cria (ao digitar um cliente novo numa tarefa); só o ADM renomeia, arquiva e apaga. Apagar deixa as tarefas com `cliente_id` nulo.

`colegas()`: `security definer`, devolve só `id` e `nome` dos membros ativos da empresa de quem chama, para escolher o responsável (sem e-mail nem papel).

O cliente só tem update nas colunas de conteúdo (título, cliente, responsável, status, prioridade, prazo, repetição, anotações, checklist e commits): criador, empresa, foco e datas são do servidor.

`somar_foco(tarefa, ms, pomodoros)` soma no próprio `UPDATE` (duas abas não se sobrescrevem) e limita cada chamada a 1 h e 1 pomodoro. É `security definer` (o cliente não tem update em `foco_ms`) e só soma em tarefa da empresa de quem chama.

### `modelos_jornada`, `versoes_jornada` e `atribuicoes_jornada`: jornadas da empresa

| Tabela | Colunas | Regra |
|---|---|---|
| `modelos_jornada` | `id`, `empresa_id` (padrão `minha_empresa()`), `nome`, `criado_em` | nome de 1 a 80 caracteres, único na empresa |
| `versoes_jornada` | `modelo_id` + `vigente_desde` (PK), `tolerancia_antes`, `tolerancia_depois`, `modo`, `semana` | as mesmas regras de `jornadas` abaixo; apagar o modelo apaga as versões |
| `atribuicoes_jornada` | `user_id` + `desde` (PK), `modelo_id` | o modelo precisa ser da empresa do usuário (trigger); modelo com atribuição não pode ser apagado |

O dia de um usuário usa a atribuição de maior `desde` que não passa dele e, nela, a versão do modelo vigente na mesma data (ver [regras-de-negocio.md](regras-de-negocio.md)).

### `jornadas` (antiga, só leitura): vigências da jornada de cada usuário

Substituída pelas tabelas acima. Fica só leitura enquanto o front antigo pode estar no ar e sai numa migração seguinte.

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id`, `vigente_desde` | uuid, date | PK |
| `tolerancia_antes`, `tolerancia_depois` | smallint | 0 a 120 minutos |
| `modo` | text | `acumulativo` ou `individual` |
| `semana` | jsonb | 7 itens (índice 0 = domingo), cada um `{ trabalha, entrada, almocoIni, almocoFim, saida }`. Validado por `semana_valida()`. |

## Quem pode o quê (RLS)

| Tabela | Ler | Inserir / alterar / apagar |
|---|---|---|
| `perfis` | o próprio; o ADM lê os da empresa dele | cliente: só `nome`, `avatar_path`, `cor_destaque`, `superficie` e `fundo` do próprio perfil, e só se ativo. Papel, ativo, empresa e super ADM: só a função de usuários (service role) ou o SQL Editor. |
| `empresas` | a própria; o super ADM lê todas | ninguém pelo cliente |
| `dias` | as próprias; o ADM lê as dos membros da empresa | só as próprias, com perfil ativo numa empresa ativa |
| `pomodoro` | só as próprias linhas, com perfil ativo numa empresa ativa | idem |
| `tarefas` | todas as da empresa | criar e alterar: membros, com responsável e cliente da empresa; apagar: quem criou, o responsável ou o ADM |
| `atividades_tarefa` | toda a da empresa | inserir: só comentário, em nome próprio, em tarefa da empresa; apagar: o autor ou o ADM, só comentário |
| `clientes` | todos os da empresa | criar: membros; alterar e apagar: o ADM |
| `modelos_jornada`, `versoes_jornada` | todos da empresa | só o ADM da empresa |
| `atribuicoes_jornada` | as próprias; o ADM lê as da empresa | só o ADM, e só para membros da empresa dele |
| `jornadas` (antiga) | só as próprias linhas | ninguém (só leitura) |
| `storage.objects` (bucket `avatares`) | só a própria pasta `<uid>/` | só a própria pasta, com perfil ativo |

Detalhes que importam:
- As policies chamam `public.perfil_ativo()` e `public.eh_admin()`. São funções `security definer` que leem `perfis` sem passar pela RLS, o que evita recursão na policy da própria tabela. Ninguém de fora (`anon`) pode executá-las.
- Além da policy, o privilégio de update é **por coluna** (`grant update (nome, avatar_path, ...)`). Mesmo que uma policy fosse afrouxada por engano, o cliente continuaria sem poder mexer em `papel` ou `ativo`.
- **`manter_adm_da_empresa`:** constraint trigger adiado para o fim da transação, em insert, `update of papel, ativo, empresa_id` e delete de `perfis`. Recusa a transação que deixaria uma empresa com membros sem ADM ativo (rebaixar, desativar, mover ou apagar o ADM), até pelo SQL Editor ou ao apagar o usuário no dashboard. Por ser adiado, `transferir_adm` pode rebaixar o ADM antigo e promover o novo em sequência. A função de usuários traduz esse erro para HTTP 409.
- **`perfis_um_adm_por_empresa`:** índice único parcial; dois ADMs na mesma empresa falham na hora, inclusive em pedidos simultâneos.

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
