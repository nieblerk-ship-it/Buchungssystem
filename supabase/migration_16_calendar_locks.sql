-- Migration 16: Kalender sperren (Phase F)
-- In Supabase SQL Editor ausführen, nach migration_15.
--
-- Gesperrte Zeiträume verhindern nachträgliche Änderungen an bereits
-- abgeschlossenen Tagen/Wochen: keine Buchungsänderungen, keine
-- Anwesenheitserfassung, keine Terminabsagen, keine Kursänderungen, die
-- Termine in diesem Zeitraum betreffen würden.

create table if not exists calendar_locks (
  id uuid primary key default uuid_generate_v4(),
  start_date date not null,
  end_date date not null,
  reason text,
  locked_by_admin_id uuid references admins(id),
  locked_by_name text not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_calendar_locks_range on calendar_locks(start_date, end_date);

alter table calendar_locks enable row level security;
