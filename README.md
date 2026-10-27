# Controle Pessoal (web)

Ponto do dia, banco de horas e pomodoro 25/5, agora na web: **site estático no Netlify + Supabase (Postgres + Auth)**. É a versão web do [controle_pessoal](https://github.com/mateusfitavares/controle_pessoal) (Node + SQLite local). As telas e as regras são as mesmas.

- **Hoje**, **Banco de horas**, **Importar TiqueTaque** e **Pomodoro** funcionam como no app local.
- **Login** por e-mail e senha. Não há cadastro público: o admin convida.
- **Cada usuário vê só os próprios dados**, inclusive o admin. Quem garante isso é a RLS do Postgres, não o front.
- **Usuários** (só admin): convidar, mudar o papel (`admin`/`usuario`), desativar e reativar.

## Arquitetura

```
navegador ──(supabase-js, anon key + JWT do usuário)──▶ Supabase: Postgres com RLS + Auth
    │
    └──(POST /api/usuarios, JWT)──▶ Netlify Function usuarios.mjs ──(service role)──▶ Supabase Admin API
```

- O front fala direto com o Supabase. A **anon/publishable key** é pública por design: ela só dá o que as policies de RLS permitem.
- A **service role** (que ignora a RLS) fica **só** na variável de ambiente da função do Netlify. Ela nunca vai para o front nem para o repositório.
- `public/js/api.js` mantém a interface da antiga API do Express (`listarDias`, `salvarDia`, `apagarDia`, `gravarLote`, `lerPomodoro`, `salvarPomodoro`). As telas não mudaram.

## Passo a passo

### 1. Supabase: projeto e banco

1. Crie o projeto em [supabase.com](https://supabase.com) na região **South America (São Paulo)**. Guarde a senha do banco.
2. Em **Project Settings → API**, anote:
   - a **Project URL** (`https://<ref>.supabase.co`);
   - a **anon/publishable key** (vai para o front);
   - a **service_role/secret key** (vai **só** para o Netlify).
3. Aplique a migração pela pasta do projeto (PowerShell):

   ```powershell
   npx supabase login
   npx supabase init          # cria supabase/config.toml; a pasta migrations/ é mantida
   npx supabase link --project-ref <ref>
   npx supabase db push       # aplica supabase/migrations/20261027120000_inicial.sql
   ```

   A migração cria `perfis`, `dias` e `pomodoro`, a RLS de todas as tabelas, o trigger que cria o perfil de cada usuário novo e a trava que impede ficar sem admin ativo.

### 2. Supabase: Auth

Em **Authentication**:

| Onde | O que fazer |
|---|---|
| Sign In / Providers → **Allow new users to sign up** | **Desligar.** O convite do admin continua funcionando. |
| Sign In / Providers → Email → **Minimum password length** | 8 (a tela de senha já exige 8) |
| URL Configuration → **Site URL** | `https://<seu-site>.netlify.app` |
| URL Configuration → **Redirect URLs** | `https://<seu-site>.netlify.app/definir-senha.html`, `http://localhost:8888/definir-senha.html` e `http://localhost:8080/definir-senha.html` |
| Emails → **SMTP Settings** | Configure um SMTP próprio (Resend, Brevo, Gmail etc.). O SMTP embutido do Supabase só entrega para os e-mails da equipe do projeto e tem limite de poucas mensagens por hora. Sem SMTP próprio, os convites para outras pessoas não chegam. |
| Emails → Templates → **Invite user** | Use o modelo em pt-BR abaixo |
| Emails → Templates → **Reset password** | Use o modelo em pt-BR abaixo |

**Convite.** Assunto: `Você foi convidado para o Controle Pessoal`

```html
<h2>Você foi convidado para o Controle Pessoal</h2>
<p>Olá! Um administrador criou um acesso para você no Controle Pessoal (ponto, banco de horas e pomodoro).</p>
<p><a href="{{ .ConfirmationURL }}">Definir minha senha e entrar</a></p>
<p>O link vale por 24 horas e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.</p>
```

**Recuperação.** Assunto: `Defina uma nova senha do Controle Pessoal`

```html
<h2>Nova senha</h2>
<p>Recebemos um pedido para trocar a senha da sua conta no Controle Pessoal.</p>
<p><a href="{{ .ConfirmationURL }}">Definir uma nova senha</a></p>
<p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
```

### 3. Front: a configuração pública

Em `public/js/config.js`, troque os placeholders pela **Project URL** e pela **anon/publishable key**. Em `netlify.toml`, troque `SEU-PROJETO` pelo `<ref>` na linha da CSP (`connect-src`). Sem isso, o navegador bloqueia as chamadas ao Supabase.

### 4. GitHub e Netlify

1. Crie um repositório **privado** no GitHub (sugestão: `controle_pessoal_web`), faça o commit e o push.
2. No Netlify, clique em **Add new site → Import an existing project**, escolha o repositório e deixe o build vazio. O `netlify.toml` já diz `publish = "public"` e `functions = "netlify/functions"`.
3. Em **Site configuration → Environment variables**, crie:

   | Variável | Valor | Escopo |
   |---|---|---|
   | `SUPABASE_URL` | `https://<ref>.supabase.co` | Functions |
   | `SUPABASE_SERVICE_ROLE_KEY` | a service_role/secret key | Functions, marcada como **secret** |
   | `SITE_URL` (opcional) | `https://<seu-site>.netlify.app` | Functions. Base do link do convite; sem ela, vale a `URL` que o Netlify define. |

4. Faça um novo deploy para as variáveis valerem. Se o nome do site mudou, atualize a Site URL e as Redirect URLs do passo 2.

### 5. Primeiro admin

1. No Supabase, vá a **Authentication → Users → Invite user** e informe o seu e-mail. O trigger cria o perfil como `usuario`.
2. Abra o link do e-mail. O app leva você para **Definir senha**.
3. No **SQL Editor**, promova o seu usuário:

   ```sql
   update public.perfis set papel = 'admin' where email = 'seu@email.com';
   ```

4. Entre de novo. O item **Usuários** aparece na barra lateral. Os próximos convites saem de lá.

### 6. Migrar os dados do app local

Os dados atuais vão para o usuário admin (ou para quem você indicar). O usuário precisa existir antes, ou seja, o convite tem de ter sido aceito.

1. Tire uma cópia consistente do banco do volume Docker `controle-pessoal-dados`, na pasta do projeto **antigo** (PowerShell):

   ```powershell
   cd C:\leverpro\controle-pessoal
   docker compose exec controle-pessoal npm run backup -- /tmp/migracao
   docker compose exec controle-pessoal sh -c "ls /tmp/migracao"
   docker compose cp controle-pessoal:/tmp/migracao/<arquivo>.db $env:TEMP\controle.db
   docker compose exec -u root controle-pessoal rm -rf /tmp/migracao
   ```

   O `backup` usa `VACUUM INTO`: a cópia é consistente mesmo com o app rodando. Copiar o `.db` direto pode perder o que ainda está no `-wal`.

2. Neste projeto, crie o `.env` a partir do `.env.example`, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Ele é ignorado pelo git, como qualquer arquivo de segredo local. Depois rode:

   ```powershell
   npm install
   npm run migrar -- $env:TEMP\controle.db --usuario seu@email.com
   npm run migrar -- $env:TEMP\controle.db --usuario seu@email.com --conferir
   Remove-Item $env:TEMP\controle.db
   ```

   - Sem `--sobrescrever`, os dias que já existem no Supabase ficam como estão. Com ele, são substituídos.
   - `--conferir` não grava nada. Ele recalcula o banco de horas com as regras de `shared/` dos dois lados e compara o acumulado, o saldo por mês e os dias campo a campo. Sai com código 0 se bater e 2 se divergir.
   - Dias inválidos (que a validação do app recusaria) são listados e ficam de fora.

## Rodar localmente

- **Completo, com a tela de Usuários:** `npx netlify dev`, em <http://localhost:8888>. Ele serve `public/`, aplica os headers do `netlify.toml` e roda a função. As variáveis vêm do site vinculado (`npx netlify link`) ou do `.env`.
- **Só o app, sem a função de admin:** `npx http-server public -p 8080 -c-1`, em <http://localhost:8080>. Ponto, banco e pomodoro funcionam. A tela de Usuários dá erro, porque não há `/api/usuarios`.

O localhost usa o mesmo projeto Supabase e os seus dados reais. Para testar sem risco, crie um segundo projeto Supabase e aponte o `config.js` para ele.

```powershell
npm test     # regras, espelho, validação de usuários, mapeamento e conferência
```

## Segurança

- **RLS em todas as tabelas.** `dias` e `pomodoro` só aceitam `user_id = auth.uid()` com o perfil **ativo**: um usuário desativado perde o acesso aos dados na hora, mesmo com um token ainda válido. `perfis` é só leitura pelo cliente (o próprio perfil; o admin lê todos). Papel e ativo só mudam pela função (service role) ou pelo SQL Editor.
- **Desativar** marca `ativo = false` e bane o login (`ban_duration`), o que impede a renovação do token. **Reativar** desfaz as duas coisas. Os dados ficam guardados.
- **Último admin:** a função recusa a mudança, e o trigger `manter_um_admin` também recusa. Isso fecha a corrida entre dois admins e vale até para o SQL Editor e para apagar o usuário no dashboard.
- **CSP** no `netlify.toml`: scripts só do próprio site e do jsDelivr (supabase-js com versão fixada), conexões só com o próprio site e o Supabase, sem `unsafe-inline`, sem iframes.
- **Sessão:** com "Lembrar de mim", a sessão fica no `localStorage` e sobrevive ao fechar o navegador. Sem ele, fica no `sessionStorage` e some ao fechar a aba.
- A tela de Usuários monta nomes e e-mails com `textContent`, nunca com `innerHTML`.

## Estrutura

```
public/                 o site publicado
  index.html            app (Hoje, Banco de horas, Importar, Usuários)
  login.html            login em cartão de vidro + "esqueci a senha"
  definir-senha.html    destino dos links de convite e de recuperação
  css/app.css, css/acesso.css
  js/
    config.js           URL do Supabase e anon key (públicas)
    supabase.js         cliente supabase-js + armazenamento da sessão ("Lembrar de mim")
    sessao.js           sessão, perfil, sair
    api.js              mesma interface da API antiga, agora sobre o Supabase
    usuarios.js         tela de Usuários (admin) → /api/usuarios
    login.js, definir-senha.js, acesso.js, hash-inicial.js
    main.js, navegacao.js, registros.js, ponto.js, mes.js, importacao.js, pomodoro.js, ...
  shared/               regras isomórficas (as mesmas do app local) + linhas.js (camelCase ↔ snake_case)
netlify/functions/usuarios.mjs   POST /api/usuarios: listar, convidar, alterarPapel, desativar, reativar
src/regras-usuarios.js           validação dos pedidos e regra do último admin (funções puras)
scripts/
  migrar-sqlite-para-supabase.js
  conferencia.js                 banco de horas e diferenças, para o --conferir
supabase/migrations/             schema, RLS, triggers
test/                            node --test
```

## Regras do banco de horas

São as mesmas do app local, em `public/shared/regras.js`: jornada de 08:00 (08:48 até fevereiro/2026), almoço mínimo de 1h, tolerância de 10 min, feriado e folga com saldo zero, compensação consumindo a jornada. Elas valem para **todos** os usuários. Se outra pessoa tiver outra jornada, essa regra precisa virar configuração por perfil.
