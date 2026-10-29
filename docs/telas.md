# Telas e funcionalidades

Todas as telas do app estão em `public/index.html`, como `<section class="tela" data-view="...">`. A troca é pelo `#hash` da URL (`navegacao.js`), então o botão Voltar do navegador funciona.

## Moldura comum

- **Cabeçalho (`.topo`):** logo TimEver e uma faixa de resumo com banco acumulado, saldo do mês atual, dias sem marcação, saída prevista e o mini pomodoro. Quem pinta os números do resumo é `mes.js`; a saída prevista vem de `ponto.js`.
- **Mini pomodoro e popup:** "Pomodoro 25:00 ⌄" é um botão (`#pomoAbrir`) que abre o pomodoro completo num popup logo abaixo (`#pomoPopup`). O popup fecha clicando fora ou com Esc. O botão ao lado ("Começar foco", "Pausar" ou "Voltar ao trabalho") age sem abrir o popup, exceto na pausa, que abre o popup para perguntar o motivo. No celular, o pomodoro vai para o começo da faixa de resumo, que rola para o lado.
- **Cápsula de navegação (`.capsula`):** barra flutuante embaixo, no estilo do iOS, com Hoje, Banco, Tarefas, Importar, Usuários (só admin) e Perfil (com a foto). O item ativo fica mais largo que os outros, em formato de cápsula.
- **Faixa de erro (`#aviso`):** aparece quando uma chamada ao Supabase falha e some na próxima que der certo.
- **Título da aba:** com o pomodoro rodando, mostra o tempo dele; senão, a saída prevista; sem nenhum dos dois, "TimEver".

## Hoje (`ponto.js`)

- **Previsão de saída:** o horário em que a jornada fecha, contando o almoço mínimo de 1 h ainda não tirado. Abaixo vem quanto falta de trabalho e de almoço, e ao lado a fase do dia com o percentual da jornada. As fases são Informe a chegada, Trabalhando, Em almoço, Jornada cumprida, Dia encerrado e Corrija as marcações.
- **Linha do dia:** barra horizontal com o trabalhado, o almoço, o previsto e o "agora". A janela se ajusta ao dia, das 08h às 18h no mínimo.
- **Marcações:** quatro cartões editáveis (`input type="time"`). A próxima a bater fica destacada. Horário fora de ordem ou no futuro aparece com o erro embaixo e não é gravado.
- **Bater ponto (botão ou Enter):** grava o horário atual na próxima marcação vazia. O Enter só vale na tela Hoje e fora de campos de texto.
- **Números:** trabalhado, falta, almoço e jornada do dia. A jornada do dia é editável e grava a `carga` do registro, que vence a jornada vigente para aquele dia.
- **Limpar o dia:** esvazia as quatro marcações de hoje e grava, sem pedir confirmação. A jornada do dia e o tipo continuam como estavam.

## Banco de horas (`mes.js`)

- **Cartões no topo:** banco acumulado, trabalhado no mês, dias sem marcação e o gráfico **Saldo por mês** (últimos 12 meses, barra verde para positivo e laranja para negativo, com o mês atual destacado).
- **Histórico:** meses recolhíveis (o atual começa aberto), com o resumo do mês na linha do cabeçalho. Cada dia mostra a situação, as quatro marcações, o trabalhado e o saldo.
- **Filtros:** Todos, Sem marcação e Abonados.
- **Editor de dia:** clicar num dia abre o painel lateral para trocar o tipo (Dia trabalhado, Feriado, Folga, Compensação), corrigir as marcações, ver a prévia do saldo e salvar ou apagar.

## Tarefas (`tarefas.js` + `tarefas-store.js`)

- **Nova tarefa rápida:** título e Enter. No filtro "Para hoje", a tarefa já nasce com prazo de hoje.
- **Lista:** filtros Abertas, Para hoje, Concluídas e Todas, mais cliente/projeto e busca (título, cliente, anotações, código e branch dos commits). Cada linha tem o título com cliente, prazo (laranja hoje, vermelho vencido), progresso do checklist, número de commits, recorrência e foco, o status e o botão de focar. **Mudar o status:** clicar na etiqueta do status abre um menu com as opções (o atual vem marcado); nada muda com um clique solto. Fecha com Esc, clicando fora ou rolando a página. A borda esquerda marca prioridade urgente (vermelha) e alta (laranja); a tarefa em foco fica destacada.
- **Kanban:** colunas A fazer, Em andamento, Commit realizado, Pendente de teste, Aguardando e Concluída (as 15 mais recentes). Arrastar um cartão para outra coluna muda o status. No celular, o arrastar não existe: muda-se o status pelo editor. A visão escolhida fica guardada no navegador.
- **Editor em pop-up** (`<dialog>` modal, tela cheia no celular; fecha no X, no Esc ou clicando fora): título, cliente/projeto (com sugestões dos já usados), status, prioridade, prazo, repetição, anotações, checklist (novo item com Enter), commits (código, branch e data, que já vem com hoje) e o resumo de foco com "Focar nesta tarefa". Apagar pede confirmação.
- **Focar:** o botão ▶ (linha, cartão ou editor) escolhe a tarefa no pomodoro e, se o relógio estiver parado no foco, já começa.

No **Hoje**, o cartão "Tarefas de hoje" lista as vencidas, as do dia e as em andamento, com as mesmas ações.

## Importar do TiqueTaque (`importacao.js` + `shared/espelho.js`)

1. O usuário abre o espelho do mês no TiqueTaque, seleciona a tabela, copia e cola no campo da esquerda.
2. O texto é lido sozinho enquanto é colado. Cada dia vira uma linha à direita, classificada como **a gravar**, **pulado** (dia que já existe, a menos que "Sobrescrever" esteja marcado) ou **inválido**.
3. O saldo calculado é conferido contra o saldo oficial do espelho. Dias que divergem ficam em laranja, com o valor do TiqueTaque ao lado.
4. "Gravar" manda tudo num lote só (`gravarLote`) e recarrega do servidor.

## Empresa (`empresa.js`): Usuários e Jornadas para o ADM, Todas as empresas para o super ADM

A cápsula mostra "Empresa" para o ADM da empresa e para o super ADM; cada um vê só as abas do seu papel.

### Usuários (`usuarios.js` + função `usuarios.mjs`)

- Lista os membros da empresa: nome, e-mail, papel, situação (Ativo, Inativo ou Convidado, quando o convite ainda não foi aceito) e último acesso.
- Desativar e reativar. **Transferir o papel de ADM:** escolher "ADM" no papel de um membro ativo; quem transferiu vira usuário e perde esta tela. A linha do ADM fica travada: ele não pode ser rebaixado nem desativado sem transferir antes.
- **Convidar:** nome e e-mail. O convidado entra como usuário na empresa do ADM, recebe o e-mail e define a senha em `definir-senha.html`.

### Jornadas (`jornadas.js`)

- **Jornadas da empresa:** lista dos modelos, com o resumo da versão vigente e quantas pessoas o usam hoje. "Criar" cadastra um modelo novo pelo nome.
- **Editor do modelo:** renomear, apagar (só sem ninguém no histórico), vigências e, para a selecionada, a data de início, os horários de cada dia da semana, a tolerância antes e depois e o modo (acumulativo ou individual). "Nova vigência" cria uma versão daqui para a frente. Editar ou apagar uma vigência antiga recalcula os dias dela de todos que usam o modelo, com confirmação.
- **Quem usa cada jornada:** cada membro com a jornada de hoje, o histórico de atribuições (com ✕ para tirar uma) e "Trocar a partir de": modelo e data. Data no passado pede confirmação, porque recalcula o banco dele.

### Todas as empresas (`plataforma.js` + função `empresas.mjs`), só o super ADM

- **Nova empresa:** nome da empresa, nome e e-mail do ADM. Cria a empresa e manda o convite; o ADM define a senha pelo link.
- **Lista:** cada empresa, recolhível, com situação (Ativa ou Desativada), ADM (ou convite pendente) e número de membros. Aberta, mostra os membros (nome, e-mail, papel, situação), "Tornar ADM" para um membro ativo, "Renomear", "Desativar"/"Reativar" (a própria empresa não pode ser desativada) e um convite rápido de usuário para aquela empresa.
- O super ADM não vê ponto, jornadas nem tarefas das empresas.

## Meu perfil (`perfil.js`)

- **Nome e foto:** a foto é recortada no centro, reduzida para 256×256 em JPEG e enviada ao bucket privado.
- **Aparência:** cor de destaque (azul, amarelo, verde, vermelho), cartões e barra de navegação (opaco, vidro sutil, vidro líquido) e fundo da tela (liso, manchas cinza, manchas coloridas). A mudança vale na hora e é gravada no perfil, então acompanha o usuário em qualquer aparelho. Se a gravação falhar, volta à opção anterior. Detalhes em [visual-e-aparencia.md](visual-e-aparencia.md).
- **Trocar senha:** pede a senha atual, a nova (mínimo de 8 caracteres) e a confirmação.
- **Sua jornada (só leitura):** o modelo de jornada atribuído hoje e desde quando, o resumo (dias, carga e tolerância) e, se houver troca, o histórico. Quem altera é o ADM da empresa.
- **Sair:** encerra a sessão neste navegador.

## Telas de acesso

- **`login.html` (`login.js`):** e-mail, senha e "Lembrar de mim". "Esqueci a senha" manda o e-mail de recuperação e mostra a mesma resposta exista a conta ou não, para não revelar quem tem cadastro. Mensagens de sessão encerrada, conta desativada etc. chegam pela URL (`?motivo=`).
- **`definir-senha.html` (`definir-senha.js`):** recebe o link do convite ou da recuperação, pede a senha nova duas vezes e entra no app. Link expirado ou já usado mostra a explicação, com o caminho para pedir outro.
