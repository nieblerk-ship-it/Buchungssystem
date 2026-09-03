-- Migration 24: Planungssystem (Phase J1)
-- In Supabase SQL Editor ausführen, nach migration_23.
--
-- GRUNDGEDANKE: Ein Plan speichert KEINE Kopien von Kursen, sondern nur die
-- geplanten Unterschiede zur echten Welt. Die Kalenderansicht eines Plans
-- rechnet bei jedem Aufruf "echte Welt + Unterschiede" zusammen.
--
-- Warum so und nicht als Entwurfszeilen in courses/course_sessions:
--   1. courses wird an 11, course_sessions an 23 Stellen abgefragt. Lägen
--      Entwürfe dort mit, müsste jede dieser Abfragen einen Filter tragen —
--      eine vergessene Stelle heißt: Entwurfskurs auf der Buchungsseite.
--      Hier ist das strukturell unmöglich, weil dort nichts liegt.
--   2. Die echte Welt hat automatisch Vorrang. Wird ein Kurs real beendet,
--      endet er im Plan mit, ohne dass irgendetwas nachgezogen werden muss.
--      Die geplante Änderung wird dann als gegenstandslos angezeigt.
--   3. Das Veröffentlichen kann die bestehende, getestete Split-Logik
--      aufrufen statt eine zweite Variante davon zu sein.

create table if not exists plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  -- draft     in Arbeit, nur im Admin-Bereich sichtbar
  -- published veröffentlicht, Änderungen sind in der echten Welt angekommen
  -- discarded verworfen, bleibt als Dokumentation liegen
  status text not null default 'draft',
  created_by_name text,
  published_by_name text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plan_changes (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references plans(id) on delete cascade,

  -- course_create    neuer Kurs, existiert real noch nicht
  -- course_update    bestehender Kurs ab Stichtag anders (Raum, Zeit, Trainer:in, ...)
  -- course_end       Kurs endet ab Stichtag
  -- enrollment_add   feste Zuteilung beginnt ab Stichtag
  -- enrollment_end   feste Zuteilung endet ab Stichtag
  kind text not null,

  -- Zielkurs in der ECHTEN Welt. Null bei course_create und bei Änderungen,
  -- die sich auf einen erst im Plan angelegten Kurs beziehen.
  course_id uuid references courses(id) on delete cascade,

  -- Zielkurs INNERHALB des Plans: zeigt auf eine course_create-Änderung.
  -- Damit lässt sich einer Person ein Kurs zuteilen, den es real noch nicht
  -- gibt ("neuer Beginner 3 ab Mai, diese sechs Personen kommen mit").
  target_change_id uuid references plan_changes(id) on delete cascade,

  customer_id uuid references customers(id) on delete cascade,   -- bei enrollment_*
  enrollment_id uuid references enrollments(id) on delete cascade, -- bei enrollment_end

  -- Stichtag. Ab hier gilt die Änderung; davor bleibt alles unverändert.
  -- Dasselbe Prinzip wie bei den echten Kursänderungen seit Migration 17.
  effective_from date,

  -- Die geänderten bzw. neuen Kursfelder. Bewusst als JSON und nicht als
  -- einzelne Spalten: die Kursfelder sind über die Migrationen 05 bis 15
  -- mehrfach gewachsen (Raum, Trainer-Konto, Bezeichnung, Enddatum). Mit
  -- Einzelspalten bräuchte jede künftige Kursänderung auch hier eine
  -- Migration. Geprüft werden die Werte ohnehin beim Veröffentlichen.
  payload jsonb not null default '{}'::jsonb,

  -- Fasst mehrere technische Änderungen zu einer Zeile in der Oberfläche
  -- zusammen, z.B. "Gruppe verschieben" = enrollment_end + enrollment_add
  -- pro Person, angezeigt als eine Zeile.
  group_key text,
  group_label text,

  note text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_changes_plan on plan_changes(plan_id);
create index if not exists idx_plan_changes_course on plan_changes(course_id);
create index if not exists idx_plan_changes_target on plan_changes(target_change_id);
create index if not exists idx_plans_status on plans(status);

alter table plans enable row level security;
alter table plan_changes enable row level security;
