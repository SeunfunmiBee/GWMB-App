-- Member lesson media and downloadable resources must not use a public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'protected-content-media','protected-content-media',false,262144000,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp']
)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Admins upload protected content media" on storage.objects;
create policy "Admins upload protected content media" on storage.objects for insert to authenticated
with check(bucket_id='protected-content-media' and public.is_app_admin());
drop policy if exists "Admins update protected content media" on storage.objects;
create policy "Admins update protected content media" on storage.objects for update to authenticated
using(bucket_id='protected-content-media' and public.is_app_admin())
with check(bucket_id='protected-content-media' and public.is_app_admin());
drop policy if exists "Admins delete protected content media" on storage.objects;
create policy "Admins delete protected content media" on storage.objects for delete to authenticated
using(bucket_id='protected-content-media' and public.is_app_admin());
drop policy if exists "Verified members read protected content media" on storage.objects;
create policy "Verified members read protected content media" on storage.objects for select to authenticated
using(
  bucket_id='protected-content-media'
  and (
    public.is_app_admin()
    or exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.status='verified')
  )
);
