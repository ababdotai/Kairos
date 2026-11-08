#!/bin/sh
# Isolated PostgreSQL test; mocks only Supabase's auth.uid() and built-in roles.
set -eu
TASK_DB_DIR=$(mktemp -d "${TMPDIR:-/tmp}/kairos-share-db.XXXXXX")
cleanup() { pg_ctl -D "$TASK_DB_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TASK_DB_DIR"; }
trap cleanup EXIT
initdb -D "$TASK_DB_DIR/data" -A trust --no-locale >/dev/null
pg_ctl -D "$TASK_DB_DIR/data" -l "$TASK_DB_DIR/server.log" -o "-k $TASK_DB_DIR -p 55489 -h ''" start >/dev/null
export PGHOST="$TASK_DB_DIR" PGPORT=55489 PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
SQL
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202611080001_share_pages.sql
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.publish_share('aaaaaaaa-0000-4000-8000-000000000001','{"version":1,"title":"Test","sections":[],"sources":[]}');
reset role;
set role anon;
do $$ begin
  if public.read_share('aaaaaaaa-0000-4000-8000-000000000001')->>'title' <> 'Test' then raise exception 'Read failed'; end if;
  begin perform * from public.kairos_shares; raise exception 'Anonymous table access allowed'; exception when insufficient_privilege then null; end;
  begin perform public.publish_share(gen_random_uuid(),'{}'); raise exception 'Anonymous publish allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.list_my_shares()) <> 0 then raise exception 'Other owner visible'; end if;
  begin perform public.revoke_share('aaaaaaaa-0000-4000-8000-000000000001'); raise exception 'Other owner revoke allowed'; exception when raise_exception then if sqlerrm <> 'Page not found or not owned by you' then raise; end if; end;
end $$;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.revoke_share('aaaaaaaa-0000-4000-8000-000000000001');
reset role;
set role anon;
do $$ begin
 if public.read_share('aaaaaaaa-0000-4000-8000-000000000001') is not null then raise exception 'Revoked page still readable'; end if;
end $$;
SQL
printf 'PASS: owner publication, anonymous exact-link read, no listing/writing, cross-owner isolation and revocation\n'
