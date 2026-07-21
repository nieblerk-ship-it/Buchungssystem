-- Migration 06: Trainer-Konten (Phase 3)
-- In Supabase SQL Editor ausführen, nach migration_05_rooms_sources_products.sql.

create table if not exists trainers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Verknüpft einen Kurs mit einem Trainer-Konto (für den Trainer-Login-Bereich).
-- Das bestehende Textfeld "instructor" bleibt unabhängig davon für die Anzeige
-- erhalten (z.B. bei Gastdozent:innen ohne eigenes Konto).
alter table courses add column if not exists trainer_id uuid references trainers(id);

alter table trainers enable row level security;
