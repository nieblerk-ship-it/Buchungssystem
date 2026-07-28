-- Migration 09: Archiv für Schüler:innen (Phase B)
-- In Supabase SQL Editor ausführen, nach migration_08 (bzw. migration_07).

-- null = aktiv; gesetzt = archiviert (Zeitpunkt der Archivierung).
-- Endgültige Löschung erfolgt automatisch 90 Tage nach Archivierung,
-- geprüft beim Öffnen des Archivs im Admin-Bereich.
alter table customers add column if not exists archived_at timestamptz;

create index if not exists idx_customers_archived on customers(archived_at);
