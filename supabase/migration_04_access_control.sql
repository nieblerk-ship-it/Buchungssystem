-- Migration 04: Zugriffsrechte (Punkte 9, 11, 12 aus der Wunschliste)
-- In Supabase SQL Editor ausführen, nach migration_03_fixes.sql.

-- Explizite Freigabe/Sperre eines Kurses für eine:n bestimmte:n Schüler:in.
-- Überschreibt die produktbasierte Standardregel: 'allow' erlaubt die Buchung
-- unabhängig vom Produkt, 'deny' blockiert sie unabhängig vom Produkt.
create table if not exists customer_course_overrides (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  access text not null check (access in ('allow', 'deny')),
  notes text,
  created_at timestamptz not null default now(),
  unique (customer_id, course_id)
);

-- Feste Zuteilung: Schüler:in wird automatisch (ohne eigene Buchung) für
-- einen Kurs eingetragen, optional befristet auf einen Zeitraum.
create table if not exists enrollments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  valid_from date not null default current_date,
  valid_until date,                 -- null = unbefristet / bis auf Weiteres
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_overrides_customer on customer_course_overrides(customer_id);
create index if not exists idx_enrollments_customer on enrollments(customer_id);
create index if not exists idx_enrollments_course on enrollments(course_id);

alter table customer_course_overrides enable row level security;
alter table enrollments enable row level security;
