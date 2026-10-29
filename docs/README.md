# Documentação do TimEver

O TimEver controla o ponto do dia, o banco de horas e o pomodoro. É um site estático no Netlify com o banco e o login no Supabase. Esta pasta explica como cada parte foi construída e por quê, para quem vai manter o projeto.

O nome é um trocadilho com *time* e *ever*, por isso a grafia **TimEver**, com T e E maiúsculos.

## Por onde começar

| Se você quer… | Leia |
|---|---|
| Entender as peças e como elas conversam | [arquitetura.md](arquitetura.md) |
| Saber o que tem no banco, quem pode ler e gravar o quê | [banco-de-dados.md](banco-de-dados.md) |
| Saber o que cada tela faz e qual arquivo cuida dela | [telas.md](telas.md) |
| Entender o cálculo do banco de horas, da jornada, da tolerância e do pomodoro | [regras-de-negocio.md](regras-de-negocio.md) |
| Mexer no visual: cores, vidro, fundo, marca, ícones, app no iPhone | [visual-e-aparencia.md](visual-e-aparencia.md) |
| Rodar local, publicar, aplicar migração, configurar e-mail, testar | [operacao.md](operacao.md) |

## Resumo em uma tela

- **Front:** HTML, CSS e JavaScript puros, em módulos ES, sem build. O que está em `public/` é o que vai para o ar.
- **Banco e login:** Supabase (Postgres com RLS e Auth). O navegador fala direto com o Supabase usando a chave pública. Quem limita o acesso aos dados é a RLS, não o front.
- **Peças de servidor:** as Netlify Functions `usuarios.mjs` (aba Usuários, do ADM da empresa) e `empresas.mjs` (aba Todas as empresas, do super ADM). Só elas usam a service role.
- **Regras de cálculo:** ficam em `public/shared/`. São funções puras, usadas pelo navegador, pelos scripts de conferência e pelos testes.
- **Testes:** `npm test` (Node `node:test`). Eles cobrem as regras, a leitura do espelho, a validação de usuários e o mapeamento de linhas.

## Glossário

| Termo | Significado |
|---|---|
| Marcação / batida | Um dos quatro horários do dia: chegada, saída para o almoço, volta do almoço e saída. |
| Carga / jornada do dia | Quanto o dia deveria ter de trabalho, em HH:MM. |
| Saldo | Trabalhado menos a carga, já com a tolerância aplicada. |
| Banco acumulado | Soma dos saldos de todos os dias do histórico. |
| Vigência | Versão da jornada do usuário, válida a partir de uma data. |
| Espelho | Relatório do TiqueTaque (sistema oficial de ponto) que o pop-up Importar lê. |
| Dia abonado | Feriado, folga ou compensação. |
