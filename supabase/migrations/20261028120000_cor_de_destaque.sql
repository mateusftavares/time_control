-- Cor de destaque escolhida em "Meu perfil": o dono só troca entre as quatro cores do app.

alter table public.perfis
  add column cor_destaque text not null default 'azul'
    check (cor_destaque in ('azul', 'amarelo', 'verde', 'vermelho'));

grant update (cor_destaque) on public.perfis to authenticated;
