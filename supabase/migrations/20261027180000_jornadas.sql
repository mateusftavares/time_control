-- Jornada por usuário, com vigência: cada dia é calculado com a versão vigente na data dele.
-- Semeia, para quem já existe, as duas versões equivalentes às regras fixas antigas
-- (08:48 até fevereiro/26, 08:00 a partir de março, seg–sex, tolerância de 10 min acumulativa)
-- e grava nos dias sem carga a carga que a regra antiga dava, para o histórico não depender da jornada.

/**
 * @description Semana de jornada válida: 7 dias (índice 0 = domingo), cada um com "trabalha" e, quando
 *   trabalha, entrada < saída e almoço (opcional, os dois ou nenhum) dentro do expediente
 */
create function public.semana_valida(semana jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  dia jsonb;
  formato constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  entrada text;
  almoco_ini text;
  almoco_fim text;
  saida text;
begin
  if jsonb_typeof(semana) <> 'array' or jsonb_array_length(semana) <> 7 then
    return false;
  end if;

  for dia in select value from jsonb_array_elements(semana) loop
    if jsonb_typeof(dia) <> 'object' or jsonb_typeof(dia -> 'trabalha') <> 'boolean' then
      return false;
    end if;

    entrada := dia ->> 'entrada';
    almoco_ini := dia ->> 'almocoIni';
    almoco_fim := dia ->> 'almocoFim';
    saida := dia ->> 'saida';

    if not (dia ->> 'trabalha')::boolean then
      if coalesce(entrada, almoco_ini, almoco_fim, saida) is not null then
        return false;
      end if;
      continue;
    end if;

    if entrada is null or saida is null or entrada !~ formato or saida !~ formato or saida <= entrada then
      return false;
    end if;
    if (almoco_ini is null) <> (almoco_fim is null) then
      return false;
    end if;
    if almoco_ini is not null and not (
      almoco_ini ~ formato and almoco_fim ~ formato
      and entrada <= almoco_ini and almoco_ini < almoco_fim and almoco_fim <= saida
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table public.jornadas (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vigente_desde     date not null,
  tolerancia_antes  smallint not null default 10 check (tolerancia_antes between 0 and 120),
  tolerancia_depois smallint not null default 10 check (tolerancia_depois between 0 and 120),
  modo              text not null default 'acumulativo' check (modo in ('acumulativo', 'individual')),
  semana            jsonb not null check (public.semana_valida(semana) and pg_column_size(semana) <= 4096),
  atualizado_em     timestamptz not null default now(),
  primary key (user_id, vigente_desde)
);

create trigger carimbar_jornadas
  before insert or update on public.jornadas
  for each row execute function public.carimbar_atualizacao();

alter table public.jornadas enable row level security;

create policy "jornadas: dono ativo le"
  on public.jornadas for select to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "jornadas: dono ativo insere"
  on public.jornadas for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "jornadas: dono ativo altera"
  on public.jornadas for update to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()))
  with check (user_id = (select auth.uid()) and (select public.perfil_ativo()));

create policy "jornadas: dono ativo apaga"
  on public.jornadas for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.perfil_ativo()));

revoke all on public.jornadas from anon;
revoke truncate, references, trigger on public.jornadas from authenticated;
grant select, insert, update, delete on public.jornadas to authenticated;

-- Carga congelada: o dia sem carga gravada passa a guardar a que a regra antiga calculava.
update public.dias
set carga = case when dia < date '2026-03-01' then '08:48' else '08:00' end
where carga is null and tipo in ('normal', 'compensacao');

-- Vigências equivalentes às regras antigas, para todo usuário que já existe.
insert into public.jornadas (user_id, vigente_desde, tolerancia_antes, tolerancia_depois, modo, semana)
select perfis.id, versao.vigente_desde, 10, 10, 'acumulativo', versao.semana
from public.perfis
cross join (values
  (date '2026-02-01', '[
    {"trabalha": false, "entrada": null, "almocoIni": null, "almocoFim": null, "saida": null},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:48"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:48"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:48"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:48"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:48"},
    {"trabalha": false, "entrada": null, "almocoIni": null, "almocoFim": null, "saida": null}
  ]'::jsonb),
  (date '2026-03-01', '[
    {"trabalha": false, "entrada": null, "almocoIni": null, "almocoFim": null, "saida": null},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:00"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:00"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:00"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:00"},
    {"trabalha": true, "entrada": "08:00", "almocoIni": "12:00", "almocoFim": "13:00", "saida": "17:00"},
    {"trabalha": false, "entrada": null, "almocoIni": null, "almocoFim": null, "saida": null}
  ]'::jsonb)
) as versao (vigente_desde, semana)
on conflict (user_id, vigente_desde) do nothing;
