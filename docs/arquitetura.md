# Arquitetura

## Visão geral

```
navegador (public/, módulos ES)
   │
   ├── supabase-js 2.45.4 (jsDelivr) ── anon key + JWT do usuário ──▶ Supabase
   │                                                                   ├─ Postgres (RLS em todas as tabelas)
   │                                                                   ├─ Auth (login, convite, recuperação)
   │                                                                   └─ Storage (bucket privado "avatares")
   │
   └── POST /api/usuarios (JWT) ──▶ Netlify Function usuarios.mjs ── service role ──▶ Supabase Admin API
```

- **Não há build.** O Netlify publica a pasta `public/` como está (`netlify.toml`: `publish = "public"`). Os módulos são carregados pelo navegador com `<script type="module">`.
- **O front fala direto com o banco.** A *anon key* em `public/js/config.js` é pública por design: ela só faz o que as policies de RLS deixam. Cada usuário lê e grava apenas as próprias linhas, e isso vale também para o admin.
- **A service role ignora a RLS.** Por isso ela fica só nas variáveis de ambiente do Netlify e é usada só pela função de usuários, que antes confere se quem chama é um admin ativo.

## Por que essa arquitetura

| Decisão | Motivo |
|---|---|
| Site estático + Supabase, sem backend próprio | Custo zero (planos gratuitos do Netlify e do Supabase) e nada para manter no ar. O Postgres com RLS já garante o isolamento entre usuários. |
| JavaScript puro, sem framework nem bundler | O app nasceu como projeto local (Node + SQLite) com front vanilla. A migração para a web manteve as telas e trocou só a camada de dados. |
| Regras em `public/shared/` | Os mesmos arquivos rodam no navegador, nos scripts de Node e nos testes. Não existe uma segunda cópia da regra que possa divergir. |
| Uma Netlify Function só para usuários | Convidar, banir e mudar papel exigem a Admin API do Supabase, que precisa da service role. O resto do app não precisa de servidor. |

## Mapa do front (`public/`)

### Páginas

| Arquivo | Papel |
|---|---|
| `index.html` | O app: telas Hoje, Banco de horas, Importar, Usuários (admin) e Meu perfil. As telas são `<section class="tela" data-view="...">`, e só a atual fica visível. |
| `login.html` | Login em cartão de vidro e "Esqueci a senha". |
| `definir-senha.html` | Destino dos links de convite e de recuperação de senha. |
| `manifest.webmanifest` | Torna o site instalável como app (ver [visual-e-aparencia.md](visual-e-aparencia.md)). |

### Módulos de `public/js/`

| Módulo | Responsabilidade |
|---|---|
| `main.js` | Ponto de entrada do app. Exige sessão, carrega o perfil, aplica a aparência, libera a tela Empresa para o ADM, carrega jornadas e dias e liga as telas, nessa ordem. |
| `config.js` | URL do Supabase e anon key (públicas). |
| `supabase.js` | Cria o cliente supabase-js. Guarda a sessão no `localStorage` com "Lembrar de mim" e no `sessionStorage` sem ele. Usa o fluxo *implicit*, porque o convite é aberto num navegador diferente do de quem convidou e o PKCE não funcionaria. |
| `hash-inicial.js` | Lê o `#hash` da URL antes do supabase-js limpá-lo, para detectar link de convite, de recuperação ou expirado. Precisa ser importado antes de `supabase.js`. |
| `sessao.js` | `exigirSessao`, `carregarPerfil`, `sair`, `idDoUsuario`, `tokenAtual`. |
| `api.js` | Todas as leituras e gravações no Supabase: dias, pomodoro, jornadas, tarefas, nome, foto e preferências de aparência. Mantém a mesma interface da antiga API Express (`listarDias`, `salvarDia`...) para que as telas não precisassem mudar. |
| `registros.js` | Fonte única dos dias carregados. Ponto e banco de horas leem e escrevem aqui. Junta rajadas de digitação numa gravação só (800 ms) e manda o pendente ao fechar a aba (`pagehide`). Quem assina recebe `{ dia, origem }` a cada mudança. |
| `tarefas-store.js` | Fonte única das tarefas. A tela de Tarefas, o bloco do Hoje e o pomodoro leem daqui. Concluir uma tarefa recorrente cria a próxima ocorrência; o foco do pomodoro é somado com `somarFoco`. |
| `tarefas.js` | Tela Tarefas (lista, Kanban com arrastar e soltar, filtros, busca, editor lateral com checklist e commits) e o bloco "Tarefas de hoje" da tela Hoje. |
| `navegacao.js` | Troca de telas pelo `#hash` (`#hoje`, `#banco`, `#tarefas`, `#importar`, `#perfil`, `#usuarios`). Também marca o item ativo da cápsula e avisa os ouvintes quando a tela muda. |
| `ponto.js` | Tela Hoje: marcações, previsão de saída, linha do dia e atalho Enter. |
| `mes.js` | Tela Banco de horas: histórico por mês, editor de dia, gráfico de saldo por mês e o resumo do topo. |
| `importacao.js` | Tela Importar: lê o espelho colado e confere cada dia contra o saldo oficial antes de gravar. |
| `pomodoro.js` | Pomodoro: popup do topo, contagem, pausas com motivo, som, atalho Espaço e gravação periódica. Também guarda a tarefa em foco e soma nela o tempo de foco a cada gravação (`focarEm`, `tarefaEmFoco`). |
| `perfil.js` | Meu perfil: nome, foto, aparência, troca de senha e a jornada atribuída (só leitura). Carrega as jornadas do usuário (`versoesEfetivas`) para o cálculo. |
| `aparencia.js` | Lista das preferências visuais (cor, cartões, fundo) e aplicação delas no `<html>`. |
| `empresa.js` | Tela Empresa (ADM): troca entre as abas Usuários e Jornadas. |
| `usuarios.js` | Aba Usuários da Empresa. Chama `/api/usuarios`. |
| `jornadas.js` | Aba Jornadas da Empresa: modelos, vigências e atribuições. Depois de cada mudança, recalcula o banco do próprio ADM. |
| `login.js`, `definir-senha.js`, `acesso.js` | Telas de acesso e mensagens de erro do Auth em português. |
| `titulo.js` | Título da aba. O pomodoro tem prioridade enquanto roda; fora isso, aparece a saída prevista. |
| `aviso.js` | Faixa vermelha de erro no topo (Supabase fora do ar, gravação recusada). |
| `util.js` | `elementos([...ids])`, que falha na hora se um id não existir no HTML, além de `escapar` e `teclaLimpa`. |

### Regras compartilhadas (`public/shared/`)

| Módulo | Conteúdo |
|---|---|
| `regras.js` | Trabalhado, almoço mínimo, saldo do dia (`avaliar`), tolerância, dia em andamento e validação das marcações. |
| `jornada.js` | Vigências, jornada padrão, carga do dia, dia útil, validação de uma versão e `versoesEfetivas` (atribuições + versões dos modelos → versões do usuário). |
| `tempo.js` | Datas `AAAA-MM-DD` no fuso local e conversões entre minutos e `HH:MM`. |
| `registro.js` | Validação e normalização de um registro de dia. |
| `espelho.js` | Leitura do texto do TiqueTaque e conferência contra o saldo oficial. |
| `pomodoro.js` | Durações, motivos de pausa e sanitização do estado gravado. |
| `linhas.js` | Ponte entre o registro do app (camelCase) e a linha da tabela (snake_case). |
| `tarefas.js` | Validação de uma tarefa (inclusive commits e checklist), recorrência, ordem de trabalho, situação do prazo e a ponte com a linha da tabela. |

## Fluxo de inicialização do app

1. `main.js` confere se o `#hash` é um link de convite ou recuperação e, se for, desvia para `definir-senha.html`.
2. `exigirSessao()`: sem sessão, volta para o login.
3. `carregarPerfil()`: perfil ausente ou inativo faz sair na hora.
4. `aplicarAparencia(...)` grava `data-cor`, `data-superficie` e `data-fundo` no `<html>`. Só então o atributo `data-autenticando` sai do `<body>` e a tela aparece, então ninguém vê o visual padrão piscar antes do escolhido.
5. Admin: libera a tela e o item Usuários.
6. Carrega as jornadas e depois todos os dias. Se falhar, mostra o aviso e desliga os botões, porque calcular com a jornada padrão mostraria um histórico errado.
7. Liga perfil, ponto, banco, importação e pomodoro.

## Gravação e consistência

- **Dias:** `upsert` por `(user_id, dia)`. A digitação é adiada 800 ms e juntada numa gravação só. Ao fechar a aba, o pendente vai com `keepalive`.
- **Pomodoro:** um registro por usuário e dia, com o estado em JSON. É gravado a cada 5 s enquanto roda e logo em cada mudança de estado.
- **Virada do dia:** o pomodoro e as telas percebem a troca de data e começam o dia novo zerado. O dia anterior fica gravado como estava.

## Função de usuários (`netlify/functions/usuarios.mjs`)

- `POST /api/usuarios` com `{ acao, ... }`. As ações são `listar`, `convidar`, `alterarPapel`, `desativar` e `reativar`.
- Confere o JWT no Supabase Auth e exige que o dono seja o **ADM ativo de uma empresa ativa**. Lista e altera só os perfis da empresa dele.
- A validação dos pedidos e as regras do ADM único (`recusaDaMudanca`) ficam em `src/regras-usuarios.js`, em funções puras e testadas.
- **Papel:** a empresa tem exatamente um ADM. Promover alguém a ADM é uma **transferência** (`transferir_adm`, no banco): quem pediu vira usuário na mesma transação. O ADM não pode ser rebaixado nem desativado sem transferir antes.
- **Desativar** marca `ativo = false` e bane o login (`ban_duration`), o que impede renovar o token. **Reativar** desfaz as duas coisas. Os dados do usuário ficam guardados.
- O convite usa `inviteUserByEmail`, com o link apontando para `definir-senha.html`. O convidado entra sempre como usuário, na empresa do ADM; se colocá-lo na empresa falhar, o usuário do Auth é apagado (convite desfeito).

## Segurança, em resumo

- RLS em todas as tabelas. `dias`, `pomodoro` e `tarefas` só aceitam `user_id = auth.uid()` com o perfil **ativo numa empresa ativa**: desativar o usuário ou a empresa corta o acesso na hora, mesmo com um token ainda válido.
- Jornadas da empresa (`modelos_jornada`, `versoes_jornada`, `atribuicoes_jornada`): todos da empresa leem os modelos e as versões; cada um lê as próprias atribuições e o ADM as da empresa; só o ADM grava. O trigger `conferir_atribuicao_jornada` recusa atribuir um modelo de outra empresa por qualquer caminho.
- O cliente só pode alterar em `perfis` as colunas `nome`, `avatar_path`, `cor_destaque`, `superficie` e `fundo`, e só do próprio perfil (privilégio por coluna mais policy). Papel, ativo, empresa e super ADM ficam fora do alcance do cliente; `empresas` é só leitura para ele.
- O trigger `manter_adm_da_empresa` impede que uma empresa com membros fique sem ADM ativo, mesmo pelo SQL Editor; o índice `perfis_um_adm_por_empresa` impede dois ADMs.
- A CSP do `netlify.toml` aceita scripts só do próprio site e do jsDelivr (supabase-js com versão fixa) e conexões só com o site e o Supabase. Não há `unsafe-inline` nem iframes.
- Nomes e e-mails vão para a tela com `textContent` ou escapados, nunca como HTML cru.
- Fotos ficam num bucket privado e aparecem por URL assinada de 1 h. O navegador recorta a foto e a regrava em JPEG, o que remove o EXIF (que pode ter a localização).
- A troca de senha faz antes um login com a senha atual, porque o `updateUser` do supabase-js 2.45 não confere a senha atual.
