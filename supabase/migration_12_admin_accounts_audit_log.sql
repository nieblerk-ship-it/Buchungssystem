-- Migration 12: Admin-Konten + Änderungslog (Phase D)
-- In Supabase SQL Editor ausführen, nach migration_11.

create table if not exists admins (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Änderungslog: wer hat wann was gemacht. Bewusst ohne UPDATE/DELETE-Route
-- in der App — es gibt im Code keine Möglichkeit, Einträge zu verändern
-- oder zu löschen, nur anzulegen und zu lesen.
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references admins(id),
  admin_name text not null,
  action text not null,          -- z.B. 'create' | 'update' | 'delete' | 'archive' | ...
  entity_type text not null,     -- z.B. 'course' | 'customer' | 'product' | 'booking' | ...
  entity_id text,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created on audit_log(created_at);
create index if not exists idx_audit_log_admin on audit_log(admin_id);
create index if not exists idx_audit_log_entity on audit_log(entity_type);

alter table admins enable row level security;
alter table audit_log enable row level security;

-- WICHTIG (manueller Schritt, einmalig): lege dir jetzt dein erstes Admin-Konto
-- an, sonst kommst du nach dem Umstellen nirgends mehr rein. Passwort-Hash mit
-- pgcrypto erzeugen (wie schon bei den Demo-Trainer-Konten):
--
-- create extension if not exists pgcrypto;
-- insert into admins (name, email, password_hash) values
--   ('Dein Name', 'deine@email.de', crypt('DeinPasswort123', gen_salt('bf')));
