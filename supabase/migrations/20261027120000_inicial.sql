-- Controle Pessoal: perfis, dias de ponto e pomodoro, com RLS em tudo.
-- Cada usuário vê só os próprios dados, inclusive o admin. Papel e ativo mudam só pela
-- função do Netlify (service role) ou pelo SQL Editor; o cliente não altera perfis.

-- ============================================================
-- PERFIS
-- ============================================================
create table public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null default '' check (char_length(nome) <= 100),
  email     text not null default '',
  papel     text not null default 'usuario' check (papel in ('admin', 'usuario')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

/**
 * @description Cria o perfil de cada usuário novo do Auth (convite pelo app ou pelo dashboard);
 *   o nome vem do metadado enviado no convite, ou da parte local do e-mail
 */
create function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(coalesce(new.email, ''), '@', 1)), 100),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

/**
 * @description Mantém o e-mail do perfil igual ao do Auth quando o usuário troca de e-mail
 */
create function public.sincronizar_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfis set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger ao_trocar_email
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sincronizar_email_perfil();

/**
 * @description Usuário logado é admin e está ativo. Security definer para ler perfis sem
 *   passar pela RLS da própria tabela (evita recursão na policy de perfis)
 */
create function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'admin' and ativo
  );
$$;

/**
 * @description Usuário logado tem perfil ativo; usuário desativado perde o acesso aos dados
 *   na hora, mesmo com um access token ainda válido
 */
create function public.perfil_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo
  );
$$;

revoke execute on function public.eh_admin() from public, anon;
revoke execute on function public.perfil_ativo() from public, anon;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.perfil_ativo() to authenticated;
revoke execute on function public.criar_perfil() from public, anon, authenticated;
revoke execute on function public.sincronizar_email_perfil() from public, anon, authenticated;

/**
 * @description Recusa qualquer mudança que deixe o sistema sem admin ativo: rebaixar,
 *   desativar ou apagar o último. O lock serializa dois admins se rebaixando ao mesmo tempo
 */
create function public.garantir_admin_ativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  era_admin_ativo boolean := old.papel = 'admin' and old.ativo;
  continua_admin_ativo boolean := false;
begin
  if tg_op = 'UPDATE' then
    continua_admin_ativo := new.papel = 'admin' and new.ativo;
  end if;

  if era_admin_ativo and not continua_admin_ativo then
    perform pg_advisory_xact_lock(hashtext('controle_pessoal.admins'));

    if not exists (
      select 1 from public.perfis
      where papel = 'admin' and ativo and id <> old.id
    ) then
      raise exception 'o sistema precisa de pelo menos um admin ativo'
        using errcode = 'P0001', hint = 'ultimo_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.garantir_admin_ativo() from public, anon, authenticated;

create trigger manter_um_admin
  before update of papel, ativo or delete on public.perfis
  for each row execute function public.garantir_admin_ativo();

create policy "perfis: le o proprio, admin le todos"
  on public.perfis for select
  to authenticated
  using (id = (select auth.uid()) or (select public.eh_admin()));

-- Sem policy de insert/update/delete: o cliente só lê. E, por garantia, nem o privilégio existe.
revoke all on public.perfis from anon;
revoke insert, update, delete, truncate, references, trigger on public.perfis from authenticated;
grant select on public.perfis to authenticated;

-- ============================================================
-- DIAS
-- ============================================================
create table public.dias (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dia           date not null,
  tipo          text not null default 'normal'
                check (tipo in ('normal', 'feriado', 'folga', 'compensacao')),
  chegada       text check (chegada ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  almoco_ini    text check (almoco_ini ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  almoco_fim    text check (almoco_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  saida         text check (saida ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  carga         text check (carga ~ '^[0-9]{2}:[0-5][0-9]$'),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia),
  constraint dias_sem_marcacao_fora_do_normal check (
    tipo = 'normal' or (chegada is null and almoco_ini is null and almoco_fim is null and saida is null)
  )
);

-- ============================================================
-- POMODORO
-- ============================================================
create table public.pomodoro (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dia           date not null,
  estado        jsonb not null check (jsonb_typeof(estado) = 'object' and pg_column_size(estado) <= 4096),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

/**
 * @description Carimba a hora da gravação no servidor, sem confiar no relógio do cliente
 */
create function public.carimbar_atualizacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger carimbar_dias
  before insert or update on public.dias
  for each row execute function public.carimbar_atualizacao();

create trigger carimbar_pomodoro
  before insert or update on public.pomodoro
  for each row execute function public.carimbar_atualizacao();

alter table public.dias enable row level security;
alter table public.pomodoro enable row level security;

create policy "dias: dono ativo le"
  on public.dias for select to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "dias: dono ativo insere"
  on public.dias for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "dias: dono ativo altera"
  on public.dias for update to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()))
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "dias: dono ativo apaga"
  on public.dias for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "pomodoro: dono ativo le"
  on public.pomodoro for select to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "pomodoro: dono ativo insere"
  on public.pomodoro for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "pomodoro: dono ativo altera"
  on public.pomodoro for update to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()))
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

revoke all on public.dias, public.pomodoro from anon;
revoke truncate, references, trigger on public.dias, public.pomodoro from authenticated;
revoke delete on public.pomodoro from authenticated;
grant select, insert, update, delete on public.dias to authenticated;
grant select, insert, update on public.pomodoro to authenticated;
