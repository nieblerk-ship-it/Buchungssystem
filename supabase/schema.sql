-- Vertical Ballerina – Buchungssystem, Version 1 (nur Kursbuchung, ohne Zahlung)
-- In Supabase: SQL Editor -> diese Datei einfügen -> Run

create extension if not exists "uuid-ossp";

-- Kurse (wiederkehrende Wochentermine, z.B. "Beginner 1", Montag 18:00)
create table if not exists courses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,               -- z.B. "Beginner 1", "Openclass", "Heelspole / Exotic Pole"
  category text not null,           -- 'Pole' | 'Exotic Pole' | 'Openclass' | 'Conditioning' | 'Shape & Flexibility' | 'Specials'
  level text,                       -- z.B. "Level 1", "Level 2/3", null wenn kein festes Level (Openclass etc.)
  instructor text,
  weekday smallint not null,        -- 1 = Montag ... 7 = Sonntag
  start_time time not null,
  duration_minutes int not null default 70,
  capacity int not null default 8,
  active boolean not null default true,
  notes text,                       -- z.B. "Nur für Fortgeschrittene mit Levelfreigabe"
  created_at timestamptz not null default now()
);

-- Konkrete Termine, die aus einem Kurs generiert werden (eine Zeile pro Datum)
create table if not exists course_sessions (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade,
  session_date date not null,
  capacity_override int,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (course_id, session_date)
);

-- Kund:innen
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null unique,
  phone text,
  notes text,                       -- z.B. eingeschätztes Level, interne Notizen
  created_at timestamptz not null default now()
);

-- Buchungen: verknüpft Kund:in mit einem konkreten Kurstermin
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  course_session_id uuid references course_sessions(id) on delete cascade,
  status text not null default 'confirmed', -- 'confirmed' | 'cancelled'
  created_at timestamptz not null default now()
);

create index if not exists idx_bookings_session on bookings(course_session_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_sessions_date on course_sessions(session_date);

-- Row Level Security aktivieren
-- Die App greift ausschließlich serverseitig über den service_role-Key zu
-- (siehe lib/supabase.ts -> supabaseAdmin()), der RLS grundsätzlich umgeht.
-- Absichtlich KEINE Policies für 'anon'/'authenticated': das sperrt jeden
-- Zugriff über den öffentlichen anon-Key, der im Browser sichtbar ist.
alter table courses enable row level security;
alter table course_sessions enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
