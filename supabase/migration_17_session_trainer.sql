-- Migration 17: Trainer-Vertretung je Termin
-- In Supabase SQL Editor ausführen, nach migration_16.
--
-- Ermöglicht, einen abweichenden Trainer für einzelne Termine oder einen
-- Zeitraum zu hinterlegen (Vertretung), ohne den Kurs selbst zu ändern.
-- Ist hier nichts gesetzt, gilt der Trainer des Kurses.
-- Eine dauerhafte Übernahme wird weiterhin über die Kursbearbeitung
-- (Split ab Datum) abgebildet.

alter table course_sessions add column if not exists trainer_id uuid references trainers(id);
alter table course_sessions add column if not exists instructor text;

create index if not exists idx_sessions_trainer on course_sessions(trainer_id);
