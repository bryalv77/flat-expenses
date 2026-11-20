// Append-only: never edit a shipped script, add a new one at the end.
// Embedded as strings so Metro bundles them on native and web without fs or a .sql loader.
export const migrations: string[] = [
  /* 0001_init */ `
create table users (id text primary key, email text, display_name text not null,
  photo_path text, account_role text not null default 'ADMIN', locale text,
  created_at text not null, updated_at text not null);
create table houses (id text primary key, name text not null, address text,
  currency text not null default 'EUR', split_mode text not null,
  fixed_contribution_cents integer, contribution_day_of_month integer,
  show_balance_to_roommates integer not null default 1,
  created_by text not null, created_at text not null, updated_at text not null);
create table members (house_id text not null references houses(id) on delete cascade,
  user_id text not null, role text not null check (role in ('ADMIN','ROOMMATE')),
  status text not null check (status in ('ACTIVE','REMOVED')),
  joined_at text not null, removed_at text, individual_contribution_cents integer,
  display_name text, email text, photo_path text,
  primary key (house_id, user_id),
  check ((status = 'ACTIVE') = (removed_at is null)));
create table categories (id text primary key,
  house_id text not null references houses(id) on delete cascade,
  name text not null, icon text, color text, amount_type text not null,
  expected_amount_cents integer, interval_unit text, interval_count integer, anchor_date text,
  is_active integer not null default 1, sort_order integer not null default 0, notes text,
  created_at text not null, updated_at text not null);
create table bills (id text primary key,
  house_id text not null references houses(id) on delete cascade,
  category_id text not null references categories(id),
  amount_cents integer not null check (amount_cents between 1 and 9999999),
  charge_date text, period_start_date text, period_end_date text,
  notes text check (length(notes) <= 1000),
  ocr_status text not null default 'NONE', ocr_data text,
  created_by text not null, created_at text not null, updated_at text not null,
  effective_date text generated always as (coalesce(charge_date, period_end_date, substr(created_at,1,10))) stored);
create index bills_house_date on bills (house_id, effective_date desc);
create table bill_files (id text primary key,
  bill_id text not null references bills(id) on delete cascade,
  path text not null, file_name text not null, mime_type text not null,
  size_bytes integer not null, position integer not null default 0);
create table payments (id text primary key,
  house_id text not null references houses(id) on delete cascade,
  member_id text not null, month text not null,
  amount_cents integer not null check (amount_cents > 0), note text,
  paid_at text not null, recorded_by text not null);
create index payments_house_month on payments (house_id, month);
create table meta (key text primary key, value text);
create table blobs (path text primary key, mime_type text not null, data blob not null);
`,
  /* 0002_category_names */ `
alter table categories add column names text;
`,
];
