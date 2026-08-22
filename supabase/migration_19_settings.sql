-- Migration 19: Studioweite Standardeinstellungen (Phase G)
-- In Supabase SQL Editor ausführen, nach migration_18.

create table if not exists studio_settings (
  id int primary key default 1,
  default_capacity int not null default 8,
  default_duration_minutes int not null default 70,
  default_room text,
  default_category text not null default 'Pole',
  updated_at timestamptz not null default now(),
  check (id = 1)
);

insert into studio_settings (id) values (1) on conflict (id) do nothing;

alter table studio_settings enable row level security;
