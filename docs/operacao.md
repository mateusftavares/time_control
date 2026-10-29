# Operação: rodar, publicar e manter

## Ambientes

| O quê | Onde |
|---|---|
| Site | https://timever.netlify.app (Netlify, publicado a cada push na branch `main`) |
| Código | repositório privado no GitHub, branch `main` |
| Banco, Auth e fotos | um projeto Supabase, região São Paulo |
| E-mails (convite e recuperação) | SMTP de uma conta Gmail usada só pelo app, com senha de app |

Existe **um ambiente só**. O localhost aponta para o mesmo Supabase de produção, ou seja, para os dados reais. Para testar algo arriscado, crie um segundo projeto Supabase e aponte o `public/js/config.js` local para ele, sem commitar.

## Segredos

| Segredo | Onde fica | Quem usa |
|---|---|---|
| URL do Supabase e anon key | `public/js/config.js` (público por design) | o navegador |
| Service role | variável `SUPABASE_SERVICE_ROLE_KEY` no Netlify; `.env` local para os scripts | função de usuários e scripts |
| Senha do banco e token `sbp_` (Supabase CLI e Management API) | `secret.txt` na raiz, ignorado pelo git | quem aplica migração ou muda a config do Auth |
| Usuário e senha de app do SMTP | configurados no Supabase Auth; cópia em `secret.txt` | Supabase Auth |

Regras:
- `secret.txt`, `.env` e `.env.*` estão no `.gitignore`. Nunca os commite, e nunca coloque a service role no front.
- Ao usar valores do `secret.txt` num comando, leia direto para variável de ambiente e não imprima o valor. Exemplo em bash:
  `export SUPABASE_ACCESS_TOKEN=$(grep -i '^Token' secret.txt | awk '{print $2}')`
- Se um segredo vazar (log, print, chat), troque-o no painel correspondente e atualize o `secret.txt` e o Netlify.

## Rodar localmente

```powershell
npm install
npm test                                # regras, espelho, usuários, linhas
npx netlify dev                         # app completo em http://localhost:8888, com a função de usuários
npx http-server public -p 8080 -c-1     # só o app, sem a tela de Usuários
```

O `netlify dev` lê as variáveis do site vinculado (`npx netlify link`) ou do `.env`.

## Publicar

1. Rode `npm test`.
2. Commit e push na `main`. O Netlify publica sozinho em cerca de um minuto.
3. Se houver migração, aplique **antes** do push quando o front novo depender da coluna nova. Migrações que só adicionam colunas com valor padrão não quebram a versão anterior do site.

Os arquivos de `js/`, `shared/` e `css/` vão com `Cache-Control: no-cache` (`netlify.toml`). Como os nomes não têm versão, o navegador confere cada arquivo a cada visita e pega o deploy novo sem precisar limpar o cache.

## Migrações

```bash
npx -y supabase@2 link --project-ref <ref>      # uma vez por máquina
export SUPABASE_ACCESS_TOKEN=...                 # token sbp_, do secret.txt
export SUPABASE_DB_PASSWORD=...                  # senha do banco, do secret.txt
npx -y supabase@2 db push --linked --yes         # aplica o que falta em supabase/migrations/
```

- Nome do arquivo: `AAAAMMDDHHMMSS_descricao.sql`. A ordem é a do nome.
- Nunca edite uma migração já aplicada. Crie outra.
- Antes de uma migração que reescreve dados, exporte as tabelas afetadas para JSON. Foi assim na das jornadas.

## Configuração do Auth (Supabase)

Ela **não está no repositório**: vive no projeto Supabase. Estado atual:

| Item | Valor |
|---|---|
| Cadastro público | desligado (só convite) |
| Senha mínima | 8 |
| Site URL | `https://timever.netlify.app` |
| Redirect URLs | `https://timever.netlify.app/definir-senha.html`, `http://localhost:8888/definir-senha.html`, `http://localhost:8080/definir-senha.html` |
| SMTP | `smtp.gmail.com:465`, remetente "TimEver" |
| Validade do link do e-mail | 3600 s (1 hora) |
| Limite de e-mails | 2 por hora (padrão do Supabase com SMTP próprio; dá para aumentar no painel) |

Para mudar por script, use a Management API, que é mais rápida que o painel:

```bash
# ler
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/<ref>/config/auth
# alterar só os campos enviados
curl -s -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"mailer_subjects_invite":"..."}' https://api.supabase.com/v1/projects/<ref>/config/auth
```

A resposta do GET inclui a senha do SMTP. Não a imprima nem a salve em log.

### Modelos de e-mail

**Convite.** Assunto: `Você foi convidado para o TimEver`

```html
<h2>Você foi convidado para o TimEver</h2>
<p>Olá! Um administrador criou um acesso para você no TimEver (ponto, banco de horas e pomodoro).</p>
<p><a href="{{ .ConfirmationURL }}">Definir minha senha e entrar</a></p>
<p>O link vale por 24 horas e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.</p>
```

**Recuperação.** Assunto: `Defina uma nova senha do TimEver`

```html
<h2>Nova senha</h2>
<p>Recebemos um pedido para trocar a senha da sua conta no TimEver.</p>
<p><a href="{{ .ConfirmationURL }}">Definir uma nova senha</a></p>
<p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
```

Atenção: o texto do convite diz "24 horas", mas a validade configurada é de 1 hora (`mailer_otp_exp = 3600`). Alinhe um dos dois.

## Montar do zero (ambiente novo)

1. **Supabase:** crie o projeto (região São Paulo) e anote a URL, a anon key, a service role e a senha do banco.
2. **Banco:** `supabase link` e `db push` (seção Migrações).
3. **Auth:** aplique a configuração e os modelos da seção acima. Configure um SMTP próprio: o SMTP embutido do Supabase só entrega para a equipe do projeto.
4. **Front:** ponha a URL e a anon key em `public/js/config.js` e o `<ref>` do projeto na CSP do `netlify.toml` (`img-src` e `connect-src`).
5. **Netlify:** importe o repositório sem comando de build e crie as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (secret), ambas com escopo Functions, e opcionalmente `SITE_URL`. Faça um deploy novo depois de criar as variáveis.
6. **Primeira empresa e super ADM:** convide o seu e-mail pelo painel do Supabase (Authentication → Users → Invite), defina a senha pelo link e rode no SQL Editor (empresa, papel e super ADM juntos, numa instrução só, por causa da trava de ADM da empresa):
   ```sql
   with empresa as (insert into public.empresas (nome) values ('Minha empresa') returning id)
   update public.perfis
      set empresa_id = (select id from empresa), papel = 'admin', super_admin = true
    where email = 'seu@email.com';
   ```
   Os próximos convites saem da tela Usuários.

## Scripts (`scripts/`, rodam com Node e a service role do `.env`)

| Comando | Para quê |
|---|---|
| `npm run migrar -- <arquivo.db> --usuario <email> [--sobrescrever] [--conferir]` | Importou os dados do app antigo (SQLite) para um usuário. `--conferir` não grava: recalcula e compara o banco de horas dos dois lados (código 0 se bate, 2 se diverge). Fica no repositório para o caso de outra migração. |
| `npm run conferir-jornadas -- --usuario <email> --esperado=<HH:MM>` | Compara, com os dados reais, a regra antiga com a jornada por vigência. Não grava. Código 0 se o histórico é idêntico, 2 se diverge. |

Os scripts usam `public/shared/` (as mesmas regras do site), `scripts/conferencia.js` (soma e diferenças) e `scripts/supabase-admin.js` (cliente de serviço).

## Testes (`test/`, `npm test`)

| Arquivo | Cobre |
|---|---|
| `regras.test.js` | trabalhado, almoço mínimo, tolerância nos dois modos, dia em andamento, validação de marcações |
| `jornada.test.js` | vigências e equivalência com a regra antiga em cerca de 2 mil dias gerados |
| `espelho.test.js` | leitura do espelho do TiqueTaque e conferência do saldo |
| `linhas.test.js` | conversão entre registro e linha do banco |
| `tarefas.test.js` | validação da tarefa e dos commits, recorrência, ordem de trabalho, tarefas de hoje e ponte com a linha do banco |
| `regras-usuarios.test.js` | validação dos pedidos da função de usuários e regra do último admin |
| `acesso.test.js` | mensagens de erro do Auth |

O visual não tem teste automatizado. Para conferir uma mudança de CSS sem logar, sirva `public/` localmente e abra o `index.html` com o `main.js` bloqueado, removendo o atributo `data-autenticando` do `<body>`.

## Checklist de mudança

- [ ] Regra de cálculo mudou: `npm test` e, se mexer no histórico, `npm run conferir-jornadas`.
- [ ] Coluna nova: migração com `check` e `grant update` por coluna, se o cliente for gravar.
- [ ] Texto novo na tela: nomes e e-mails de usuários só com `textContent` ou `escapar`.
- [ ] Cor nova: use ou crie um token, sem hex solto em componente.
- [ ] Domínio externo novo (script, imagem, API): libere na CSP do `netlify.toml`, senão o navegador bloqueia sem aviso visível.
- [ ] Atualize esta pasta `docs/` no mesmo commit.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Tela fica vazia e o console mostra "Refused to connect" | Domínio fora da CSP do `netlify.toml`. |
| Convite não chega | SMTP não configurado, limite de 2 e-mails por hora atingido, ou e-mail no spam. |
| Link do convite cai no login com "link expirado" | Passou de 1 hora, ou o link já foi usado. A própria tela de definir senha explica e oferece o caminho para pedir outro link. |
| A tela Usuários dá erro no localhost | Use `npx netlify dev`: o `http-server` não roda a função. |
| `db push` pede senha ou falha no login | `SUPABASE_DB_PASSWORD` ou `SUPABASE_ACCESS_TOKEN` não exportados. |
| Push no GitHub responde "Repository not found" | O Git está usando outra conta salva. Ponha o usuário na URL do remoto: `https://<usuario>@github.com/...`. |
