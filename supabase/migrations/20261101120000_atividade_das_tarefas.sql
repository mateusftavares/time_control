-- Atividade das tarefas: o histórico (criada, mudança de status e de campos) é gravado pelo servidor num trigger,
-- então não depende da tela; comentários são escritos pelos membros. Tudo da empresa da tarefa.
-- Tarefas e atividade entram na publicação do Realtime: a tela acompanha o que os colegas mudam (a RLS vale
-- também para o Realtime).

create table public.atividades_tarefa (
  id         bigint generated always as identity primary key,
  tarefa_id  uuid not null references public.tarefas (id) on delete cascade,
  empresa_id uuid not null default public.minha_empresa() references public.empresas (id) on delete cascade,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  tipo       text not null check (tipo in ('criada', 'status', 'campo', 'comentario')),
  campo      text check (campo in ('titulo', 'prazo', 'prioridade', 'responsavel', 'cliente')),
  de         text check (char_length(de) <= 200),
  para       text check (char_length(para) <= 200),
  texto      text check (char_length(btrim(texto)) between 1 and 4000),
  criado_em  timestamptz not null default now(),
  constraint atividade_comentario_tem_texto check ((tipo = 'comentario') = (texto is not null))
);

create index atividades_por_tarefa on public.atividades_tarefa (tarefa_id, criado_em);

alter table public.atividades_tarefa enable row level security;

create policy "atividade: membro le a da empresa"
  on public.atividades_tarefa for select to authenticated
  using (empresa_id = (select public.minha_empresa()));

-- pelo cliente só entra comentário, em tarefa da própria empresa e no nome de quem escreve
create policy "atividade: membro comenta"
  on public.atividades_tarefa for insert to authenticated
  with check (
    tipo = 'comentario' and campo is null and de is null and para is null
    and user_id = (select auth.uid())
    and empresa_id = (select public.minha_empresa())
    and exists (select 1 from public.tarefas t where t.id = tarefa_id and t.empresa_id = (select public.minha_empresa()))
  );

create policy "atividade: autor ou ADM apaga comentario"
  on public.atividades_tarefa for delete to authenticated
  using (
    tipo = 'comentario' and empresa_id = (select public.minha_empresa())
    and (user_id = (select auth.uid()) or (select public.eh_admin()))
  );

revoke all on public.atividades_tarefa from anon;
revoke insert, update, truncate, references, trigger on public.atividades_tarefa from authenticated;
grant select, delete on public.atividades_tarefa to authenticated;
-- comentário só com estas colunas: a data (criado_em) é sempre a do servidor
grant insert (tarefa_id, empresa_id, user_id, tipo, texto) on public.atividades_tarefa to authenticated;

/**
 * @description Registra na atividade a criação da tarefa e a mudança de status, título, prazo, prioridade,
 *   responsável e cliente. Security definer: o cliente não grava esses tipos; quem fez é o usuário logado
 */
create function public.registrar_atividade_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.atividades_tarefa (tarefa_id, empresa_id, user_id, tipo)
    values (new.id, new.empresa_id, coalesce(auth.uid(), new.user_id), 'criada');
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.atividades_tarefa (tarefa_id, empresa_id, user_id, tipo, de, para)
    values (new.id, new.empresa_id, auth.uid(), 'status', old.status, new.status);
  end if;
  -- um evento por campo alterado (o foco do pomodoro não entra)
  insert into public.atividades_tarefa (tarefa_id, empresa_id, user_id, tipo, campo, de, para)
  select new.id, new.empresa_id, auth.uid(), 'campo', mudanca.campo, mudanca.de, mudanca.para
    from (values
      ('titulo', left(old.titulo, 200), left(new.titulo, 200), new.titulo is distinct from old.titulo),
      ('prazo', old.prazo::text, new.prazo::text, new.prazo is distinct from old.prazo),
      ('prioridade', old.prioridade, new.prioridade, new.prioridade is distinct from old.prioridade),
      ('responsavel', old.responsavel_id::text, new.responsavel_id::text, new.responsavel_id is distinct from old.responsavel_id),
      ('cliente', left(old.cliente, 200), left(new.cliente, 200), new.cliente_id is distinct from old.cliente_id)
    ) as mudanca (campo, de, para, mudou)
   where mudanca.mudou;
  return null;
end;
$$;

revoke execute on function public.registrar_atividade_tarefa() from public, anon, authenticated;

create trigger registrar_atividade_tarefa
  after insert or update on public.tarefas
  for each row execute function public.registrar_atividade_tarefa();

-- As tarefas que já existem ganham o evento "criada" na data em que foram criadas.
insert into public.atividades_tarefa (tarefa_id, empresa_id, user_id, tipo, criado_em)
select id, empresa_id, user_id, 'criada', criado_em from public.tarefas;

-- Realtime: tarefas e atividade (a RLS de cada tabela vale para quem assina, em insert e update). Delete fica
-- fora: o Realtime não aplica RLS a delete e mandaria o id da linha apagada a qualquer logado de qualquer
-- empresa; tarefa apagada por um colega some da tela no próximo carregamento.
alter publication supabase_realtime add table public.tarefas, public.atividades_tarefa;
alter publication supabase_realtime set (publish = 'insert, update');
