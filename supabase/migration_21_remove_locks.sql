-- Migration 21: Kalender-Sperren entfernen, Trainer-Pflicht je Bezeichnung
-- In Supabase SQL Editor ausführen, nach migration_19.
--
-- WICHTIG: migration_20 ersetzt. Falls du sie noch nicht ausgeführt hast,
-- überspring sie — diese Datei enthält alles Nötige. Falls du sie doch schon
-- ausgeführt hast, räumt diese Datei hier auf. Beide Wege führen zum selben
-- Ergebnis, die Datei ist gefahrlos mehrfach ausführbar.

-- 1) Trainer-Pflicht je Kursbezeichnung (aus migration_20 übernommen).
--    Ist der Wert true, erscheint jeder nicht abgesagte Termin dieser
--    Bezeichnung ohne Trainer:in als Meldung im Admin-Bereich.
alter table course_types add column if not exists trainer_required boolean not null default true;

-- 2) Trainer-Notizfeld pro Termin wieder entfernen — die Idee hat sich in der
--    Praxis als überflüssig herausgestellt. Für Anmerkungen zu einzelnen
--    Personen bleibt das Kommentarfeld je Buchung.
alter table course_sessions drop column if exists trainer_note;

-- 3) Kalender-Sperren komplett entfernen.
--    Achtung: dabei gehen die bisher angelegten Sperrzeiträume verloren.
--    Das ist gewollt — es gibt in der App keine Stelle mehr, die sie liest.
--    Was in den Sperren dokumentiert war (wer wann welchen Zeitraum
--    abgeschlossen hat), steht weiterhin unverändert im Änderungslog.
drop table if exists calendar_locks;
