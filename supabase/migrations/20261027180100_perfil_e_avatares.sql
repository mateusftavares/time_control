-- "Meu perfil": o usuário troca o próprio nome e a própria foto. Só essas duas colunas ganham
-- privilégio de update; papel e ativo continuam fora do alcance do cliente.
-- Fotos no bucket privado `avatares`, uma pasta por usuário (<uid>/avatar.jpg), lidas por URL assinada.

alter table public.perfis
  add column avatar_path text,
  add constraint perfis_nome_sem_controle check (nome !~ '[[:cntrl:]]'),
  add constraint perfis_avatar_na_pasta_do_dono check (
    avatar_path is null or avatar_path = id::text || '/avatar.jpg'
  );

create policy "perfis: dono ativo altera nome e foto"
  on public.perfis for update to authenticated
  using (id = (select auth.uid()) and (select public.perfil_ativo()))
  with check (id = (select auth.uid()));

grant update (nome, avatar_path) on public.perfis to authenticated;

-- ============================================================
-- STORAGE: bucket privado, 2 MB, só JPEG/PNG/WebP (sem SVG, que pode carregar script)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatares: dono le"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatares: dono envia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.perfil_ativo())
  );

create policy "avatares: dono substitui"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.perfil_ativo())
  );

create policy "avatares: dono apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
