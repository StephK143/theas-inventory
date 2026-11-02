-- Thea's Inventory schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Tables are prefixed with thea_ so they can live alongside other apps in the
-- same project without colliding.

create table if not exists thea_tabs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists thea_items (
  id          uuid primary key default gen_random_uuid(),
  tab_id      uuid not null references thea_tabs(id) on delete cascade,
  name        text not null default 'New thing',
  count       integer not null default 0,
  note        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists thea_items_tab_id_idx on thea_items(tab_id);

-- Every count change gets logged so the line, area, scatter and bubble charts
-- have something to plot over time.
create table if not exists thea_count_log (
  id           bigint generated always as identity primary key,
  item_id      uuid not null references thea_items(id) on delete cascade,
  count        integer not null,
  recorded_at  timestamptz not null default now()
);

create index if not exists thea_count_log_item_id_idx on thea_count_log(item_id);

create table if not exists thea_reports (
  id          uuid primary key default gen_random_uuid(),
  tab_id      uuid references thea_tabs(id) on delete set null,
  subject     text,
  author      text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists thea_reports_tab_id_idx on thea_reports(tab_id);

create or replace function thea_log_count() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.count is distinct from old.count then
    insert into thea_count_log (item_id, count) values (new.id, new.count);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists thea_items_log_count on thea_items;
create trigger thea_items_log_count
  before insert or update on thea_items
  for each row execute function thea_log_count();

-- Open access: no login, anyone with the link can read and write these four
-- tables. RLS stays enabled so the policies below are the only way in, which
-- keeps this app from reaching any other table in the project.
alter table thea_tabs      enable row level security;
alter table thea_items     enable row level security;
alter table thea_count_log enable row level security;
alter table thea_reports   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['thea_tabs', 'thea_items', 'thea_count_log', 'thea_reports']
  loop
    execute format('drop policy if exists thea_open_access on %I', t);
    execute format(
      'create policy thea_open_access on %I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
