-- Jornadas da empresa: o ADM cadastra modelos (ex.: "Comercial 8h"), cada um com versões por vigência
-- (carga da semana, tolerância e regra do banco), e atribui o modelo aos usuários com uma data de início.
-- O dia de um usuário usa a atribuição vigente na data dele e, nela, a versão do modelo vigente na mesma data.
-- As vigências de cada usuário viram um modelo "Jornada de <nome>" na empresa dele, atribuído desde a primeira,
-- com as mesmas versões: o saldo de todos os dias fica igual. A tabela antiga `jornadas` fica só leitura até
-- o front novo entrar no ar (e sai numa migração seguinte).

create table public.modelos_jornada (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.minha_empresa() references public.empresas (id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 80 and nome !~ '[[:cntrl:]]'),
  criado_em  timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.versoes_jornada (
  modelo_id         uuid not null references public.modelos_jornada (id) on delete cascade,
  vigente_desde     date not null,
  tolerancia_antes  smallint not null default 10 check (tolerancia_antes between 0 and 120),
  tolerancia_depois smallint not null default 10 check (tolerancia_depois between 0 and 120),
  modo              text not null default 'acumulativo' check (modo in ('acumulativo', 'individual')),
  semana            jsonb not null check (public.semana_valida(semana) and pg_column_size(semana) <= 4096),
  atualizado_em     timestamptz not null default now(),
  primary key (modelo_id, vigente_desde)
);

create table public.atribuicoes_jornada (
  user_id       uuid not null references auth.users (id) on delete cascade,
  desde         date not null,
  modelo_id     uuid not null references public.modelos_jornada (id) on delete restrict,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, desde)
);

create index atribuicoes_por_modelo on public.atribuicoes_jornada (modelo_id);

create trigger carimbar_versoes_jornada
  before insert or update on public.versoes_jornada
  for each row execute function public.carimbar_atualizacao();

create trigger carimbar_atribuicoes_jornada
  before insert or update on public.atribuicoes_jornada
  for each row execute function public.carimbar_atualizacao();

/**
 * @description Perfil informado é membro da empresa do usuário logado (ativo, em empresa ativa)
 * @param p_user - perfil a conferir
 */
create function public.da_minha_empresa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = p_user and empresa_id = public.minha_empresa()
  );
$$;

revoke execute on function public.da_minha_empresa(uuid) from public, anon;
grant execute on function public.da_minha_empresa(uuid) to authenticated;

/**
 * @description Recusa atribuir a um usuário um modelo de outra empresa, por qualquer caminho (cliente,
 *   service role ou SQL Editor). Security invoker: o cliente só enxerga perfis e modelos que a RLS mostra,
 *   então o erro não serve para descobrir se dois ids de fora são da mesma empresa
 */
create function public.conferir_atribuicao_jornada()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfis p
    join public.modelos_jornada m on m.empresa_id = p.empresa_id
    where p.id = new.user_id and m.id = new.modelo_id
  ) then
    raise exception 'a jornada precisa ser da empresa do usuário' using errcode = 'P0001', hint = 'jornada_de_outra_empresa';
  end if;
  return new;
end;
$$;

revoke execute on function public.conferir_atribuicao_jornada() from public, anon, authenticated;

create trigger conferir_atribuicao_jornada
  before insert or update on public.atribuicoes_jornada
  for each row execute function public.conferir_atribuicao_jornada();

-- ============================================================
-- CARGA: as vigências de cada usuário viram um modelo da empresa dele
-- ============================================================
create temp table de_para_jornada on commit drop as
select p.id as user_id, p.empresa_id, gen_random_uuid() as modelo_id,
       left('Jornada de ' || coalesce(nullif(btrim(p.nome), ''), split_part(p.email, '@', 1)), 80) as nome
from public.perfis p
where p.empresa_id is not null and exists (select 1 from public.jornadas j where j.user_id = p.id);

insert into public.modelos_jornada (id, empresa_id, nome)
select modelo_id, empresa_id, nome from de_para_jornada;

insert into public.versoes_jornada (modelo_id, vigente_desde, tolerancia_antes, tolerancia_depois, modo, semana)
select d.modelo_id, j.vigente_desde, j.tolerancia_antes, j.tolerancia_depois, j.modo, j.semana
from public.jornadas j
join de_para_jornada d on d.user_id = j.user_id;

insert into public.atribuicoes_jornada (user_id, desde, modelo_id)
select d.user_id, min(j.vigente_desde), d.modelo_id
from public.jornadas j
join de_para_jornada d on d.user_id = j.user_id
group by d.user_id, d.modelo_id;

-- O front antigo ainda lê `jornadas` até o deploy; gravar nela não vale mais nada, então fica só leitura.
revoke insert, update, delete on public.jornadas from authenticated;

-- ============================================================
-- POLICIES: todos da empresa leem (cada um precisa da própria jornada); só o ADM grava
-- ============================================================
alter table public.modelos_jornada enable row level security;
alter table public.versoes_jornada enable row level security;
alter table public.atribuicoes_jornada enable row level security;

create policy "modelos: membro le os da empresa"
  on public.modelos_jornada for select to authenticated
  using (empresa_id = (select public.minha_empresa()));

create policy "modelos: ADM cria"
  on public.modelos_jornada for insert to authenticated
  with check ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()));

create policy "modelos: ADM altera"
  on public.modelos_jornada for update to authenticated
  using ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()))
  with check ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()));

create policy "modelos: ADM apaga"
  on public.modelos_jornada for delete to authenticated
  using ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()));

create policy "versoes: membro le as da empresa"
  on public.versoes_jornada for select to authenticated
  using (exists (
    select 1 from public.modelos_jornada m
    where m.id = modelo_id and m.empresa_id = (select public.minha_empresa())
  ));

create policy "versoes: ADM cria"
  on public.versoes_jornada for insert to authenticated
  with check ((select public.eh_admin()) and exists (
    select 1 from public.modelos_jornada m
    where m.id = modelo_id and m.empresa_id = (select public.minha_empresa())
  ));

create policy "versoes: ADM altera"
  on public.versoes_jornada for update to authenticated
  using ((select public.eh_admin()) and exists (
    select 1 from public.modelos_jornada m
    where m.id = modelo_id and m.empresa_id = (select public.minha_empresa())
  ))
  with check ((select public.eh_admin()) and exists (
    select 1 from public.modelos_jornada m
    where m.id = modelo_id and m.empresa_id = (select public.minha_empresa())
  ));

create policy "versoes: ADM apaga"
  on public.versoes_jornada for delete to authenticated
  using ((select public.eh_admin()) and exists (
    select 1 from public.modelos_jornada m
    where m.id = modelo_id and m.empresa_id = (select public.minha_empresa())
  ));

create policy "atribuicoes: o proprio le, ADM le as da empresa"
  on public.atribuicoes_jornada for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.perfil_ativo()))
    or ((select public.eh_admin()) and public.da_minha_empresa(user_id))
  );

create policy "atribuicoes: ADM cria"
  on public.atribuicoes_jornada for insert to authenticated
  with check ((select public.eh_admin()) and public.da_minha_empresa(user_id));

create policy "atribuicoes: ADM altera"
  on public.atribuicoes_jornada for update to authenticated
  using ((select public.eh_admin()) and public.da_minha_empresa(user_id))
  with check ((select public.eh_admin()) and public.da_minha_empresa(user_id));

create policy "atribuicoes: ADM apaga"
  on public.atribuicoes_jornada for delete to authenticated
  using ((select public.eh_admin()) and public.da_minha_empresa(user_id));

revoke all on public.modelos_jornada, public.versoes_jornada, public.atribuicoes_jornada from anon;
revoke truncate, references, trigger on public.modelos_jornada, public.versoes_jornada, public.atribuicoes_jornada from authenticated;
grant select, insert, update, delete on public.modelos_jornada, public.versoes_jornada, public.atribuicoes_jornada to authenticated;
