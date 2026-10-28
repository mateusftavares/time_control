# Visual e aparência

O CSS fica em dois arquivos: `public/css/app.css` (o app) e `public/css/acesso.css` (login e definir senha). Não há pré-processador nem build.

## Princípios

- **Tema escuro único**, com acento pastel. As cores ficam em variáveis no `:root` de `app.css`; nenhuma regra de componente deve usar uma cor escrita direto quando existe um token para ela.
- **Cores com significado fixo** não mudam com a aparência escolhida: `--almoco` (laranja-âmbar), `--positivo` (verde), `--negativo` (laranja), `--erro` (vermelho), `--abonado` (turquesa), `--compensacao` (lilás). O verde e o vermelho da cor de destaque são tons pastel diferentes desses, de propósito, para não confundir "destaque" com "saldo positivo" ou "erro".
- **Fontes:** IBM Plex Sans para o texto e JetBrains Mono para horários e números (`.mono`, com `tabular-nums` para os dígitos alinharem). Ambas vêm do Google Fonts.

## Preferências de aparência do usuário

Ficam em **Meu perfil → Aparência**, são gravadas no perfil (`perfis.cor_destaque`, `superficie` e `fundo`) e acompanham o usuário em qualquer aparelho.

### Como funciona

1. `public/js/aparencia.js` define as três preferências (`PREFERENCIAS`), com a coluna do banco, o valor padrão e as opções.
2. No carregamento, `main.js` lê o perfil e chama `aplicarAparencia`, que grava três atributos no `<html>`: `data-cor`, `data-superficie` e `data-fundo`. Isso acontece antes de a tela aparecer, então não há troca visível de visual.
3. O CSS reage aos atributos trocando **só variáveis**. Os componentes nunca testam o atributo; eles usam a variável.
4. Na tela de perfil, clicar numa opção aplica na hora e grava. Se a gravação falhar, volta à opção anterior e mostra o erro.

Para criar uma opção nova (por exemplo, uma quinta cor):
1. Inclua a opção em `PREFERENCIAS` no `aparencia.js`.
2. Crie a migração que troca a `check` da coluna em `perfis`.
3. Crie o bloco `:root[data-cor="nova"] { ... }` no `app.css` e, se for cor, a amostra `.cor-opcao[data-valor="nova"] .cor-amostra`.

### Cor de destaque (`data-cor`)

Troca os cinco tokens do acento:

| Token | Uso |
|---|---|
| `--acento` | botão principal, previsão de saída, trabalhado, foco do pomodoro |
| `--acento-texto` | texto sobre o acento (escuro) |
| `--acento-claro` | textos e ícones em destaque, item ativo da cápsula |
| `--acento-fundo` | fundo de selecionado (marcação "próxima", pílulas) |
| `--acento-escuro` | trecho "a trabalhar" da linha do dia |

| Opção | `--acento` |
|---|---|
| azul (padrão) | `#8DB4E2` |
| amarelo | `#E5CD86` |
| verde | `#8FCFA6` |
| vermelho | `#E8A0A0` |

Tons derivados do acento (borda do `kbd`, hover de link, legenda do tipo selecionado) usam `color-mix(...)`, e por isso acompanham a cor escolhida sem um token a mais. A logo continua azul em qualquer opção, porque é a marca. A tela de login também é sempre azul, porque ainda não sabe quem é o usuário.

### Cartões e barra de navegação (`data-superficie`)

Um conjunto de variáveis decide o visual de todas as superfícies: cartões (`.cartao`), faixa de resumo (`.resumo`), relógio (`.relogio`) e cápsula de navegação (`.capsula`).

| Variável | O que controla |
|---|---|
| `--sup-fundo`, `--sup-borda`, `--sup-filtro`, `--sup-sombra`, `--sup-brilho` | cartões, resumo e relógio |
| `--capsula-fundo`, `--capsula-borda`, `--capsula-filtro`, `--capsula-sombra`, `--capsula-brilho` | a barra de baixo |
| `--capsula-ativo-fundo`, `--capsula-ativo-borda`, `--capsula-ativo-sombra` | o item selecionado da barra |
| `--painel`, `--campo`, `--sub-borda` | elementos dentro dos cartões (marcações, campos), que ficam translúcidos no vidro |

| Opção | Visual |
|---|---|
| **opaco** (padrão) | cartões chapados `#151820` com borda fina, sem desfoque. Barra opaca, item ativo com fundo do acento. |
| **sutil** | vidro discreto: fundo branco de 3% a 6%, borda clara de 9%, `backdrop-filter: blur(16px) saturate(150%)` e um filete de luz na borda de cima. |
| **liquido** | o "liquid glass" do iOS: gradiente branco de 4% a 11%, borda de 14%, `blur(14px) saturate(190%) brightness(1.12)`, brilho interno nas bordas e um reflexo difuso (`--sup-brilho`, desenhado num `::before`). |

O reflexo do vidro líquido é um `::before` com `z-index: -1` dentro de um elemento com `isolation: isolate`. Por isso `.cartao` e `.capsula` têm `position: relative`/`fixed` e `isolation: isolate`. Não remova essas propriedades.

O "liquid glass" real da Apple também distorce (refrata) o que está atrás. Isso não é possível num site que funcione no Safari: o filtro SVG em `backdrop-filter` só existe no Chrome. O efeito aqui é a aproximação com desfoque, saturação, brilho e reflexos.

### Fundo da tela (`data-fundo`)

O vidro só aparece quando há algo atrás dele. Num fundo liso, os cartões de vidro ficam quase iguais aos opacos. Por isso o fundo também é uma opção.

| Opção | Visual |
|---|---|
| **liso** (padrão) | `#0E1015`, sem nada atrás |
| **cinza** | quatro manchas grandes e desfocadas em tons de cinza, as mesmas do login |
| **colorido** | as mesmas manchas, duas tingidas com a cor de destaque e uma com o âmbar do almoço |

As manchas são `<div class="manchas">` no começo do `<body>` do `index.html`, com `position: fixed` e `z-index: -1`. Elas ficam paradas de propósito: um fundo animado atrás de uma tela de leitura cansa a vista e gasta bateria e processamento no celular, porque o navegador teria de recalcular o desfoque de todos os cartões a cada quadro. O login tem manchas animadas porque é uma tela de passagem, sem cartões em cima.

## Cápsula de navegação

- Barra fixa embaixo, centralizada, acima da área segura do iPhone (`env(safe-area-inset-bottom)`).
- O item ativo (`.capsula-item.ativo`, marcado por `navegacao.js`) cresce (`flex-grow: 1.7`, `min-width: 96px`) e vira uma cápsula, com uma transição curta e elástica.
- Abaixo de 791 px de largura, os itens encolhem para caber, e o ativo mantém 76 px.

## Marca

- Nome: **TimEver** (*time* + *ever*). Use essa grafia em títulos, metadados e textos.
- Símbolo: `public/img/timever-icone.svg`, um relógio com um "check" que corta o aro, em `#8DB4E2`. O corte é feito por uma `mask` do próprio SVG.
- Onde aparece: favicon, topo do app (34 px) e login e definir senha (56 px, ao lado do nome numa linha só).
- Ícones PNG para instalar como app: `apple-touch-icon.png` (180), `icone-192.png` e `icone-512.png`. Todos têm fundo escuro, porque o iOS preenche a transparência com preto. Para gerar de novo, renderize o SVG num quadrado com o fundo radial do app e salve nos três tamanhos (foi feito com um navegador headless e um screenshot do tamanho exato).

## Instalar como app (PWA)

O TimEver não está em loja nenhuma. Publicar como app de iOS exigiria a conta paga Apple Developer (US$ 99 por ano), mesmo em lojas alternativas, e um Mac com Xcode. A decisão foi oferecer a instalação pelo próprio site:

- `manifest.webmanifest`: nome, cores, `display: standalone` e ícones.
- Nas três páginas: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` e `apple-mobile-web-app-status-bar-style: black-translucent`, além de `viewport-fit=cover`.
- Como o conteúdo passa por baixo da barra de status, o topo do `.conteudo` soma `env(safe-area-inset-top)`.
- No iPhone: abrir o site no **Safari**, tocar em Compartilhar e depois em **Adicionar à Tela de Início**.
- Não há service worker: o app precisa de internet, porque os dados estão no Supabase.

## Responsivo

- A tela Hoje usa *container query* na coluna principal (`.coluna-principal`): as marcações e os números passam de 4 para 2 colunas quando a coluna fica estreita, mesmo em janela larga.
- Abaixo de 791 px: margens menores, faixa de resumo com rolagem lateral (o pomodoro vai para o começo dela), popup do pomodoro na largura toda e cápsula compacta.
- `prefers-reduced-motion` reduz todas as transições.
