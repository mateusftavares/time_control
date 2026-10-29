-- Tarefas: demandas do trabalho com prazo, prioridade, checklist, commits, recorrência e o
-- tempo de foco do pomodoro. Mesma regra de acesso de `dias`: só o dono ativo lê e escreve.

create table public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 200),
  cliente       text not null default '' check (char_length(cliente) <= 80),
  status        text not null default 'a_fazer'
                check (status in ('a_fazer', 'em_andamento', 'aguardando', 'concluida')),
  prioridade    text not null default 'normal'
                check (prioridade in ('urgente', 'alta', 'normal', 'baixa')),
  prazo         date,
  recorrencia   text check (recorrencia in ('diaria', 'semanal', 'mensal')),
  anotacoes     text not null default '' check (char_length(anotacoes) <= 10000),
  checklist     jsonb not null default '[]'
                check (jsonb_typeof(checklist) = 'array' and pg_column_size(checklist) <= 16384),
  commits       jsonb not null default '[]'
                check (jsonb_typeof(commits) = 'array' and pg_column_size(commits) <= 16384),
  foco_ms       bigint not null default 0 check (foco_ms >= 0),
  pomodoros     integer not null default 0 check (pomodoros >= 0),
  concluida_em  timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index tarefas_por_usuario on public.tarefas (user_id, status);

/**
 * @description Carimba a hora da gravação e a da conclusão no servidor: concluida_em nasce quando a
 *   tarefa vira "concluida" e some quando ela é reaberta
 */
create function public.carimbar_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  if new.status = 'concluida' then
    new.concluida_em := case
      when tg_op = 'UPDATE' and old.status = 'concluida' then old.concluida_em
      else now()
    end;
  else
    new.concluida_em := null;
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
  else
    new.criado_em := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.carimbar_tarefa() from public, anon, authenticated;

create trigger carimbar_tarefas
  before insert or update on public.tarefas
  for each row execute function public.carimbar_tarefa();

alter table public.tarefas enable row level security;

create policy "tarefas: dono ativo le"
  on public.tarefas for select to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "tarefas: dono ativo insere"
  on public.tarefas for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "tarefas: dono ativo altera"
  on public.tarefas for update to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()))
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "tarefas: dono ativo apaga"
  on public.tarefas for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

revoke all on public.tarefas from anon;
revoke truncate, references, trigger on public.tarefas from authenticated;
grant select, insert, update, delete on public.tarefas to authenticated;

/**
 * @description Soma tempo de foco (até 1 h por chamada) e pomodoros (até 1) a uma tarefa do usuário.
 *   Incremento no próprio UPDATE: duas abas somando ao mesmo tempo não se sobrescrevem.
 *   Security invoker: a RLS de `tarefas` limita ao dono ativo
 */
create function public.somar_foco(p_tarefa uuid, p_ms bigint, p_pomodoros integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.tarefas
     set foco_ms = foco_ms + greatest(0, least(coalesce(p_ms, 0), 3600000)),
         pomodoros = pomodoros + greatest(0, least(coalesce(p_pomodoros, 0), 1))
   where id = p_tarefa;
$$;

revoke execute on function public.somar_foco(uuid, bigint, integer) from public, anon;
grant execute on function public.somar_foco(uuid, bigint, integer) to authenticated;
