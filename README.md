# TimEver

Ponto do dia, banco de horas e pomodoro, na web. O nome junta *time* e *ever*.

- **No ar:** https://timever.netlify.app
- **Stack:** site estático (HTML, CSS e JavaScript em módulos ES, sem build) no Netlify, com Postgres, Auth e Storage no Supabase.
- **Acesso:** só por convite do admin. Cada usuário vê apenas os próprios dados, inclusive o admin, e quem garante isso é a RLS do Postgres.
- **Origem:** versão web do app local [controle_pessoal](https://github.com/mateusfitavares/controle_pessoal) (Node + SQLite), com as mesmas regras.

## O que o app faz

| Tela | Resumo |
|---|---|
| **Hoje** | Bater ponto (botão ou Enter), previsão de saída com almoço mínimo de 1 h, linha do dia e correção das marcações. |
| **Banco de horas** | Saldo acumulado, gráfico do saldo por mês, histórico por mês e editor de dia (feriado, folga, compensação). |
| **Importar** | Lê o espelho do TiqueTaque colado e confere cada dia contra o saldo oficial antes de gravar. |
| **Pomodoro** | Popup no topo: foco de 25 min, descanso de 5 min e longo de 10 min, com pausas por motivo. |
| **Usuários** (admin) | Convidar, mudar o papel, desativar e reativar. |
| **Meu perfil** | Nome, foto, aparência (cor, vidro e fundo), senha e jornada com tolerância por vigência. |

O app pode ser instalado no celular pelo navegador (no iPhone: Safari → Compartilhar → Adicionar à Tela de Início).

## Começo rápido

```powershell
npm install
npm test            # regras de cálculo, leitura do espelho, usuários
npx netlify dev     # app completo em http://localhost:8888
```

O localhost usa o **mesmo Supabase de produção**, com os dados reais.

## Documentação

Tudo sobre como o projeto foi construído e funciona está em [`docs/`](docs/README.md):

- [Arquitetura](docs/arquitetura.md): peças, módulos, fluxo de inicialização e segurança
- [Banco de dados](docs/banco-de-dados.md): tabelas, RLS, triggers, storage e migrações
- [Telas](docs/telas.md): o que cada tela faz e qual arquivo cuida dela
- [Regras de negócio](docs/regras-de-negocio.md): banco de horas, jornada, tolerância, importação e pomodoro
- [Visual e aparência](docs/visual-e-aparencia.md): tokens, cor, vidro, fundo, marca e instalação como app
- [Operação](docs/operacao.md): segredos, rodar local, publicar, migrações, Auth e e-mail, scripts e testes

## Estrutura

```
public/                  o site publicado (index, login, definir-senha, manifest)
  css/                   app.css (app) e acesso.css (login)
  js/                    módulos das telas, sessão, API e aparência
  shared/                regras de cálculo puras, usadas também pelos scripts e testes
  img/                   logo SVG e ícones PNG do app
netlify/functions/       usuarios.mjs: única peça com a service role
src/regras-usuarios.js   validação dos pedidos da função de usuários
supabase/migrations/     schema, RLS e triggers
scripts/                 migração do app antigo e conferências do banco de horas
test/                    node --test
docs/                    documentação
```
