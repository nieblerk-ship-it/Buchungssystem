-- Migration 14: Freigaben/Sperren gelten pro Kursbezeichnung (Phase E2)
-- In Supabase SQL Editor ausführen, nach migration_13_course_types.sql.
--
-- Bisher galt eine Freigabe für genau eine Kurs-Instanz. Da dieselbe
-- Bezeichnung (z.B. "Beginner 2/3") jetzt mehrfach existieren kann, beziehen
-- sich Freigaben künftig auf die BEZEICHNUNG und gelten damit automatisch
-- für alle Instanzen davon.

alter table customer_course_overrides add column if not exists course_type_id uuid references course_types(id);

-- Bestehende Freigaben auf die Bezeichnung des jeweiligen Kurses umhängen
update customer_course_overrides o
set course_type_id = c.course_type_id
from courses c
where o.course_id = c.id and o.course_type_id is null;

-- Alte Eindeutigkeit (customer+course) durch neue (customer+course_type) ersetzen.
-- Vorher eventuelle Duplikate entfernen, die durch das Umhängen entstanden sein
-- können (z.B. dieselbe Person war für zwei Instanzen derselben Bezeichnung
-- freigegeben) — es bleibt jeweils der zuletzt angelegte Eintrag bestehen.
delete from customer_course_overrides a
using customer_course_overrides b
where a.customer_id = b.customer_id
  and a.course_type_id = b.course_type_id
  and a.course_type_id is not null
  and a.created_at < b.created_at;

alter table customer_course_overrides drop constraint if exists customer_course_overrides_customer_id_course_id_key;

create unique index if not exists idx_overrides_customer_type
  on customer_course_overrides(customer_id, course_type_id);

-- course_id bleibt als historische Information erhalten, wird aber nicht mehr
-- für die Zugriffsprüfung verwendet.
alter table customer_course_overrides alter column course_id drop not null;
