-- Tarefas e clientes passam a ser da empresa: todos os membros veem e editam as tarefas dela, cada tarefa tem
-- um responsável (membro da empresa) e aponta para um cliente do cadastro da empresa. Apagar só quem criou, o
-- responsável ou o ADM. Status em uso e o bloco de commits viram configuração da empresa (o ADM altera).
-- A coluna texto `cliente` continua gravada junto com o `cliente_id` (o front antigo ainda a usa até o deploy).

-- ============================================================
-- CLIENTES
-- ============================================================
create table public.clientes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.minha_empresa() references public.empresas (id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 80 and nome !~ '[[:cntrl:]]'),
  arquivado  boolean not null default false,
  criado_em  timestamptz not null default now()
);

create unique index clientes_nome_por_empresa on public.clientes (empresa_id, lower(btrim(nome)));

alter table public.clientes enable row level security;

create policy "clientes: membro le os da empresa"
  on public.clientes for select to authenticated
  using (empresa_id = (select public.minha_empresa()));

create policy "clientes: membro cria na empresa"
  on public.clientes for insert to authenticated
  with check (empresa_id = (select public.minha_empresa()));

create policy "clientes: ADM altera"
  on public.clientes for update to authenticated
  using ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()))
  with check ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()));

create policy "clientes: ADM apaga"
  on public.clientes for delete to authenticated
  using ((select public.eh_admin()) and empresa_id = (select public.minha_empresa()));

revoke all on public.clientes from anon;
revoke truncate, references, trigger on public.clientes from authenticated;
grant select, insert, update, delete on public.clientes to authenticated;

-- ============================================================
-- TAREFAS: empresa, responsável e cliente
-- ============================================================
alter table public.tarefas
  add column empresa_id     uuid references public.empresas (id) on delete cascade,
  add column responsavel_id uuid references auth.users (id) on delete set null,
  add column cliente_id     uuid references public.clientes (id) on delete set null;

update public.tarefas t
   set empresa_id = p.empresa_id, responsavel_id = t.user_id
  from public.perfis p
 where p.id = t.user_id;

-- tarefa de quem não tem empresa não tem a quem pertencer (não há nenhuma hoje; falha aqui se houver)
alter table public.tarefas
  alter column empresa_id set not null,
  alter column empresa_id set default public.minha_empresa(),
  alter column responsavel_id set default auth.uid();

insert into public.clientes (empresa_id, nome)
select distinct on (empresa_id, lower(btrim(cliente))) empresa_id, btrim(cliente)
  from public.tarefas
 where btrim(cliente) <> ''
 order by empresa_id, lower(btrim(cliente)), criado_em;

update public.tarefas t
   set cliente_id = c.id
  from public.clientes c
 where c.empresa_id = t.empresa_id and lower(btrim(c.nome)) = lower(btrim(t.cliente)) and btrim(t.cliente) <> '';

drop index public.tarefas_por_usuario;
create index tarefas_por_empresa on public.tarefas (empresa_id, status);
create index tarefas_por_responsavel on public.tarefas (responsavel_id);

/**
 * @description Carimba as datas no servidor e mantém quem criou e a empresa: um membro edita a tarefa, mas
 *   não muda o criador nem leva a tarefa para outra empresa. Trocar o responsável é de quem criou, do
 *   responsável atual ou do ADM: senão bastaria se tornar responsável para poder apagar a tarefa de outro.
 *   Sem usuário (SQL Editor, service role), não há essa trava
 */
create or replace function public.carimbar_tarefa()
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
    new.user_id := old.user_id;
    new.empresa_id := old.empresa_id;
    if new.responsavel_id is distinct from old.responsavel_id and auth.uid() is not null
       and not (old.user_id = auth.uid() or old.responsavel_id is not distinct from auth.uid() or public.eh_admin()) then
      raise exception 'só quem criou a tarefa, o responsável ou o ADM troca o responsável'
        using errcode = '42501';
    end if;
  else
    new.criado_em := now();
  end if;
  return new;
end;
$$;

drop policy "tarefas: dono ativo le" on public.tarefas;
drop policy "tarefas: dono ativo insere" on public.tarefas;
drop policy "tarefas: dono ativo altera" on public.tarefas;
drop policy "tarefas: dono ativo apaga" on public.tarefas;

create policy "tarefas: membro le as da empresa"
  on public.tarefas for select to authenticated
  using (empresa_id = (select public.minha_empresa()));

-- responsável e cliente só da mesma empresa (na RLS, e não num trigger: o erro não revela nada de fora)
create policy "tarefas: membro cria na empresa"
  on public.tarefas for insert to authenticated
  with check (
    empresa_id = (select public.minha_empresa())
    and user_id = (select auth.uid())
    and (responsavel_id is null or public.da_minha_empresa(responsavel_id))
    and (cliente_id is null or exists (
      select 1 from public.clientes c where c.id = cliente_id and c.empresa_id = (select public.minha_empresa())
    ))
  );

create policy "tarefas: membro altera as da empresa"
  on public.tarefas for update to authenticated
  using (empresa_id = (select public.minha_empresa()))
  with check (
    empresa_id = (select public.minha_empresa())
    and (responsavel_id is null or public.da_minha_empresa(responsavel_id))
    and (cliente_id is null or exists (
      select 1 from public.clientes c where c.id = cliente_id and c.empresa_id = (select public.minha_empresa())
    ))
  );

-- O cliente só altera as colunas de conteúdo: criador, empresa, foco e datas ficam com o servidor
-- (o foco só pela somar_foco, que limita cada soma).
revoke update on public.tarefas from authenticated;
grant update (titulo, cliente, cliente_id, responsavel_id, status, prioridade, prazo, recorrencia, anotacoes, checklist, commits)
  on public.tarefas to authenticated;

/**
 * @description Soma tempo de foco (até 1 h por chamada) e pomodoros (até 1) a uma tarefa da empresa do usuário.
 *   Incremento no próprio UPDATE: duas abas somando ao mesmo tempo não se sobrescrevem. Security definer
 *   porque o cliente não tem update em foco_ms/pomodoros; a empresa é conferida aqui
 */
create or replace function public.somar_foco(p_tarefa uuid, p_ms bigint, p_pomodoros integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tarefas
     set foco_ms = foco_ms + greatest(0, least(coalesce(p_ms, 0), 3600000)),
         pomodoros = pomodoros + greatest(0, least(coalesce(p_pomodoros, 0), 1))
   where id = p_tarefa and empresa_id = public.minha_empresa();
$$;

revoke execute on function public.somar_foco(uuid, bigint, integer) from public, anon;
grant execute on function public.somar_foco(uuid, bigint, integer) to authenticated;

create policy "tarefas: quem criou, o responsavel ou o ADM apaga"
  on public.tarefas for delete to authenticated
  using (
    empresa_id = (select public.minha_empresa())
    and (user_id = (select auth.uid()) or responsavel_id = (select auth.uid()) or (select public.eh_admin()))
  );

-- ============================================================
-- COLEGAS: nome de quem é da mesma empresa, para escolher o responsável (sem e-mail nem papel)
-- ============================================================

/**
 * @description Membros ativos da empresa do usuário logado: id e nome, para o responsável da tarefa
 */
create function public.colegas()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(btrim(p.nome), ''), split_part(p.email, '@', 1))
    from public.perfis p
   where p.empresa_id = public.minha_empresa() and p.ativo
   order by 2;
$$;

revoke execute on function public.colegas() from public, anon;
grant execute on function public.colegas() to authenticated;

-- ============================================================
-- CONFIGURAÇÃO DAS TAREFAS NA EMPRESA (o ADM altera)
-- Empresa nova nasce com os 4 status gerais e sem commits; a TimEver mantém o fluxo de desenvolvimento.
-- ============================================================
alter table public.empresas
  add column status_tarefas text[] not null default array['a_fazer', 'em_andamento', 'aguardando', 'concluida'],
  add column usa_commits    boolean not null default false,
  add constraint empresas_status_tarefas_validos check (
    status_tarefas <@ array['a_fazer', 'em_andamento', 'commit_realizado', 'pendente_teste', 'aguardando', 'concluida']
    and 'a_fazer' = any (status_tarefas) and 'concluida' = any (status_tarefas)
  );

update public.empresas
   set status_tarefas = array['a_fazer', 'em_andamento', 'commit_realizado', 'pendente_teste', 'aguardando', 'concluida'],
       usa_commits = true
 where nome = 'TimEver';

create policy "empresas: ADM altera a configuracao de tarefas"
  on public.empresas for update to authenticated
  using (id = (select public.minha_empresa()) and (select public.eh_admin()))
  with check (id = (select public.minha_empresa()));

grant update (status_tarefas, usa_commits) on public.empresas to authenticated;
