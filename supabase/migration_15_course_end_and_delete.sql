-- Migration 15: Kurs "beenden" statt rückwirkend deaktivieren (Phase E2 Nachbesserung)
-- In Supabase SQL Editor ausführen, nach migration_14.
--
-- Problem vorher: courses.active = false hat den ganzen Kurs unsichtbar gemacht,
-- also auch rückwirkend die bereits stattgefundenen Termine. Für die
-- Dokumentation ist das schlecht — Vergangenes muss unverändert bleiben.
--
-- Neu: courses.ended_on speichert das Datum, ab dem der Kurs nicht mehr
-- stattfindet. Termine bis einschließlich dieses Datums bleiben vollständig
-- erhalten und sichtbar, spätere Termine werden entfernt.

alter table courses add column if not exists ended_on date;

-- Bereits deaktivierte Kurse in die neue Logik überführen: sie gelten als
-- zum Zeitpunkt der Deaktivierung beendet (näherungsweise: heute), damit
-- ihre vergangenen Termine wieder sichtbar werden.
update courses set ended_on = current_date where active = false and ended_on is null;
update courses set active = true where active = false;

create index if not exists idx_courses_ended on courses(ended_on);
