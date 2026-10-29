-- O ADM da empresa lê (só lê) o ponto dos membros dela, para ver o banco de horas da equipe.
-- Gravar e apagar continuam só do dono. As jornadas dos membros o ADM já lê (modelos, versões e atribuições).
-- O front passou a filtrar `dias` pelo usuário em toda leitura: sem isso, o ADM veria o ponto da equipe
-- misturado ao dele.

create policy "dias: ADM le os da empresa"
  on public.dias for select to authenticated
  using ((select public.eh_admin()) and public.da_minha_empresa(user_id));
