-- Migration 13: Kursbezeichnungen getrennt von Kurs-Instanzen (Phase E)
-- In Supabase SQL Editor ausführen, nach migration_12.
--
-- Hintergrund: Dasselbe Kurslevel (z.B. "Beginner 2/3") gibt es mehrfach —
-- in verschiedenen Räumen, zu verschiedenen Zeiten, mit verschiedenen
-- Trainerinnen. Deshalb wird die BEZEICHNUNG jetzt einmal zentral gespeichert
-- (course_types) und die konkreten Kurse (courses) sind Instanzen davon.
-- Freigaben für Schüler:innen beziehen sich künftig auf die Bezeichnung,
-- gelten also für alle Instanzen (siehe Migration 14).

create table if not exists course_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,          -- z.B. "Beginner 2/3", "Openclass"
  category text not null,             -- 'Pole' | 'Exotic Pole' | 'Openclass' | ...
  default_level text,
  default_capacity int default 8,
  default_duration_minutes int default 70,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Kurs-Instanz gehört zu einer Bezeichnung
alter table courses add column if not exists course_type_id uuid references course_types(id);

-- Einzeltermin vs. regelmäßiger Termin mit Zeitraum
alter table courses add column if not exists is_single boolean not null default false;
alter table courses add column if not exists start_date date;
alter table courses add column if not exists end_date date;

-- Bestehende Kurse in Bezeichnungen überführen: pro eindeutigem Namen eine
-- Bezeichnung anlegen (Kategorie/Level/Kapazität vom ersten Vorkommen).
insert into course_types (name, category, default_level, default_capacity, default_duration_minutes)
select distinct on (c.name)
  c.name, c.category, c.level, c.capacity, c.duration_minutes
from courses c
order by c.name, c.created_at
on conflict (name) do nothing;

-- Kurse mit ihrer Bezeichnung verknüpfen
update courses c
set course_type_id = ct.id
from course_types ct
where ct.name = c.name and c.course_type_id is null;

create index if not exists idx_courses_type on courses(course_type_id);
create index if not exists idx_courses_dates on courses(start_date, end_date);

alter table course_types enable row level security;
