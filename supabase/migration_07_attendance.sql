-- Migration 07: Anwesenheits-Checkliste (Phase 4)
-- In Supabase SQL Editor ausführen, nach migration_06_trainers.sql.

-- null = noch nicht erfasst, true = anwesend, false = gefehlt
alter table bookings add column if not exists attended boolean;
