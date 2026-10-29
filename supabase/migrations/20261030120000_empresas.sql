-- Empresas: cada usuário pertence a uma empresa, e cada empresa tem exatamente um ADM (papel 'admin').
-- O super ADM (plataforma) cria empresas e convida pela função do Netlify; não lê os dados delas.
-- Perfil sem empresa, ou de empresa desativada, fica sem acesso aos dados (perfil_ativo() falso).
-- Os usuários que já existem entram na empresa "TimEver"; o admin atual vira o ADM dela e o super ADM.

create table public.empresas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (char_length(btrim(nome)) between 1 and 100 and nome !~ '[[:cntrl:]]'),
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.empresas enable row level security;

alter table public.perfis
  add column empresa_id  uuid references public.empresas (id) on delete restrict,
  add column super_admin boolean not null default false;

create index perfis_por_empresa on public.perfis (empresa_id);

-- ============================================================
-- CARGA: empresa TimEver com todos os usuários atuais
-- ============================================================
with timever as (
  insert into public.empresas (nome) values ('TimEver') returning id
)
update public.perfis set empresa_id = (select id from timever);

update public.perfis set super_admin = true where papel = 'admin';

alter table public.perfis add constraint perfis_adm_tem_empresa check (papel <> 'admin' or empresa_id is not null);

-- No máximo um ADM por empresa (falha aqui se houver mais de um admin hoje: resolva antes de aplicar).
create unique index perfis_um_adm_por_empresa on public.perfis (empresa_id) where papel = 'admin';

-- ============================================================
-- FUNÇÕES DE ACESSO (security definer: leem perfis sem passar pela RLS da própria tabela)
-- ============================================================

/**
 * @description Usuário logado tem perfil ativo numa empresa ativa; fora disso não acessa dado nenhum,
 *   mesmo com um access token ainda válido
 */
create or replace function public.perfil_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    join public.empresas e on e.id = p.empresa_id
    where p.id = auth.uid() and p.ativo and e.ativa
  );
$$;

/**
 * @description Usuário logado é o ADM ativo de uma empresa ativa
 */
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    join public.empresas e on e.id = p.empresa_id
    where p.id = auth.uid() and p.papel = 'admin' and p.ativo and e.ativa
  );
$$;

/**
 * @description Empresa do usuário logado, só se o perfil e a empresa estão ativos; senão null
 */
create function public.minha_empresa()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.empresa_id from public.perfis p
  join public.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and p.ativo and e.ativa;
$$;

/**
 * @description Usuário logado é super ADM (plataforma) e está ativo
 */
create function public.eh_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and super_admin and ativo
  );
$$;

revoke execute on function public.minha_empresa() from public, anon;
revoke execute on function public.eh_super_admin() from public, anon;
grant execute on function public.minha_empresa() to authenticated;
grant execute on function public.eh_super_admin() to authenticated;

-- ============================================================
-- UM ADM ATIVO POR EMPRESA
-- O trigger antigo exigia um admin no sistema todo; agora a regra é por empresa. A conferência fica
-- para o fim da transação (deferred), para a transferência de ADM poder rebaixar e promover em sequência.
-- ============================================================
drop trigger manter_um_admin on public.perfis;
drop function public.garantir_admin_ativo();

/**
 * @description Recusa o fim da transação que deixe uma empresa com membros sem ADM ativo: rebaixar,
 *   desativar, mover ou apagar o ADM sem transferir antes. O lock serializa mudanças na mesma empresa
 */
create function public.conferir_adm_da_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  empresa uuid;
begin
  for empresa in
    select distinct afetada from unnest(array[
      case when tg_op <> 'INSERT' then old.empresa_id end,
      case when tg_op <> 'DELETE' then new.empresa_id end
    ]) as afetada
    where afetada is not null
  loop
    perform pg_advisory_xact_lock(hashtext('timever.adm.' || empresa::text));
    if exists (select 1 from public.perfis where empresa_id = empresa)
       and not exists (select 1 from public.perfis where empresa_id = empresa and papel = 'admin' and ativo) then
      raise exception 'a empresa precisa de um ADM ativo: transfira o papel antes'
        using errcode = 'P0001', hint = 'adm_da_empresa';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.conferir_adm_da_empresa() from public, anon, authenticated;

create constraint trigger manter_adm_da_empresa
  after insert or update of papel, ativo, empresa_id or delete on public.perfis
  deferrable initially deferred
  for each row execute function public.conferir_adm_da_empresa();

/**
 * @description Passa o papel de ADM da empresa para outro membro ativo dela; o ADM anterior vira usuário.
 *   Só a função do Netlify (service role) chama, depois de conferir quem pediu
 * @param p_novo - perfil que vira ADM
 */
create function public.transferir_adm(p_novo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  empresa uuid;
begin
  select empresa_id into empresa from public.perfis where id = p_novo and ativo and empresa_id is not null;
  if empresa is null then
    raise exception 'o novo ADM precisa ser um membro ativo da empresa' using errcode = 'P0001', hint = 'adm_invalido';
  end if;
  perform pg_advisory_xact_lock(hashtext('timever.adm.' || empresa::text));
  -- rebaixar antes de promover (índice de ADM único); a conferência de "tem ADM" fica para o fim
  set constraints public.manter_adm_da_empresa deferred;
  update public.perfis set papel = 'usuario' where empresa_id = empresa and papel = 'admin' and id <> p_novo;
  update public.perfis set papel = 'admin' where id = p_novo;
end;
$$;

revoke execute on function public.transferir_adm(uuid) from public, anon, authenticated;
grant execute on function public.transferir_adm(uuid) to service_role;

-- ============================================================
-- POLICIES
-- ============================================================
drop policy "perfis: le o proprio, admin le todos" on public.perfis;

create policy "perfis: le o proprio, ADM le os da empresa"
  on public.perfis for select to authenticated
  using (
    id = (select auth.uid())
    or ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()))
  );

create policy "empresas: membro le a sua, super ADM le todas"
  on public.empresas for select to authenticated
  using (id = (select public.minha_empresa()) or (select public.eh_super_admin()));

-- Empresas só mudam pela função do Netlify (service role) ou pelo SQL Editor.
revoke all on public.empresas from anon;
revoke insert, update, delete, truncate, references, trigger on public.empresas from authenticated;
grant select on public.empresas to authenticated;
