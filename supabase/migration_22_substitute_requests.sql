-- Migration 22: Vertretungsanfragen (Phase H2)
-- In Supabase SQL Editor ausführen, nach migration_21.

-- Eine Anfrage gehört immer zu genau EINEM Termin. Für längere Ausfälle
-- (Urlaub, Krankheit über Wochen) wird bewusst keine Zeitraum-Anfrage
-- angeboten — das organisiert die Studioleitung direkt über
-- "Trainer:in ändern → Zeitraum" im Admin-Bereich.
--
-- Statusverlauf:
--   open      Trainer:in sucht eine Vertretung, noch hat sich niemand gemeldet
--   claimed   eine andere Trainer:in hat sich eingetragen, wartet auf Bestätigung
--   confirmed die Studioleitung hat bestätigt -> Vertretung steht am Termin
--   cancelled zurückgezogen (von der anfragenden Trainer:in oder vom Admin)
create table if not exists substitute_requests (
  id uuid primary key default uuid_generate_v4(),
  course_session_id uuid not null references course_sessions(id) on delete cascade,
  requested_by uuid not null references trainers(id),
  reason text,
  status text not null default 'open',
  claimed_by uuid references trainers(id),
  claimed_at timestamptz,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Pro Termin darf immer nur eine Anfrage gleichzeitig laufen. Erledigte
-- (confirmed/cancelled) Anfragen bleiben als Dokumentation liegen und
-- blockieren eine spätere neue Anfrage nicht.
create unique index if not exists idx_substitute_requests_active
  on substitute_requests (course_session_id)
  where status in ('open', 'claimed');

create index if not exists idx_substitute_requests_status on substitute_requests(status);
create index if not exists idx_substitute_requests_session on substitute_requests(course_session_id);

alter table substitute_requests enable row level security;
