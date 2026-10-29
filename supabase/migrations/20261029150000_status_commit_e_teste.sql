-- Status de entrega das tarefas: "commit realizado" (só na branch do dev) e "pendente de teste"
-- (no pacote de homologação, ainda fora da master).

alter table public.tarefas drop constraint tarefas_status_check;
alter table public.tarefas add constraint tarefas_status_check
  check (status in ('a_fazer', 'em_andamento', 'commit_realizado', 'pendente_teste', 'aguardando', 'concluida'));
