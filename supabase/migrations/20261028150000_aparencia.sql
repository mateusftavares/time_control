-- Aparência escolhida em "Meu perfil", além da cor de destaque: o estilo dos cartões e o fundo da tela.

alter table public.perfis
  add column superficie text not null default 'opaco'
    check (superficie in ('opaco', 'sutil', 'liquido')),
  add column fundo text not null default 'liso'
    check (fundo in ('liso', 'cinza', 'colorido'));

grant update (superficie, fundo) on public.perfis to authenticated;
