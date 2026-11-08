-- Run once in the Supabase SQL Editor. No anonymous writes or public listing.
create table public.kairos_shares (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document jsonb not null check (octet_length(document::text) <= 500000),
  created_at timestamptz not null default now(),
  check (document->>'version' = '1' and jsonb_typeof(document->'sections') = 'array'
    and jsonb_typeof(document->'sources') = 'array' and length(document->>'title') <= 180)
);
create index on public.kairos_shares(owner_id);
alter table public.kairos_shares enable row level security;
revoke all on public.kairos_shares from anon, authenticated;

create function public.publish_share(share_id uuid, document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null then raise exception 'Sign in to publish'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_owner::text, 0));
  if (select count(*) from public.kairos_shares where owner_id = current_owner) >= 50 then
    raise exception 'Maximum 50 published pages. Revoke an old page first.';
  end if;
  insert into public.kairos_shares(id,owner_id,document) values(share_id,current_owner,document);
  return share_id;
end $$;
create function public.read_share(share_id uuid) returns jsonb
language sql security definer stable set search_path = '' as $$
  select document from public.kairos_shares where id = share_id;
$$;
create function public.list_my_shares() returns table(id uuid, title text, created_at timestamptz)
language sql security definer stable set search_path = '' as $$
  select id, document->>'title', created_at from public.kairos_shares
  where owner_id = auth.uid() order by created_at desc;
$$;
create function public.revoke_share(share_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to revoke'; end if;
  delete from public.kairos_shares where id = share_id and owner_id = auth.uid();
  if not found then raise exception 'Page not found or not owned by you'; end if;
end $$;
revoke all on function public.publish_share(uuid,jsonb), public.read_share(uuid), public.list_my_shares(), public.revoke_share(uuid) from public;
grant execute on function public.read_share(uuid) to anon, authenticated;
grant execute on function public.publish_share(uuid,jsonb), public.list_my_shares(), public.revoke_share(uuid) to authenticated;
