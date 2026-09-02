-- Migration 20: Trainer-Notiz je Termin + Trainer-Pflicht je Kursbezeichnung (Phase H, Teil 1)
-- In Supabase SQL Editor ausführen, nach migration_19.

-- 1) Notizfeld pro Termin, geschrieben und gelesen von der Trainerin des
--    Termins (inkl. Vertretung) und von Admins. Bewusst getrennt vom
--    Kommentarfeld je Buchung (bookings.notes): das hier betrifft den
--    Termin als Ganzes ("Musik hat gefehlt", "Stange 3 wackelt"), nicht
--    eine einzelne Teilnehmerin. Für Schüler:innen nie sichtbar — die
--    öffentliche Buchungsseite liest dieses Feld nirgends.
alter table course_sessions add column if not exists trainer_note text;

-- 2) Pro Kursbezeichnung hinterlegen, ob zwingend eine Trainer:in
--    eingetragen sein muss. Termine ohne Trainer:in erscheinen dann als
--    Meldung. Default true: für die allermeisten Kurse ist das der Fall;
--    bei Bezeichnungen, die ohne feste Betreuung laufen, wird der Haken
--    im Admin-Bereich unter "Einstellungen" entfernt.
alter table course_types add column if not exists trainer_required boolean not null default true;
