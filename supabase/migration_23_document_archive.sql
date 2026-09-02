-- Migration 23: Gemeinsame Dokumentenablage mit Labels (Phase I2)
-- In Supabase SQL Editor ausführen, nach migration_22.
--
-- Bewusst getrennt von customer_documents (Phase 5): dort liegen Nachweise,
-- die zu einer Schülerin gehören und an deren Akte hängen. Hier liegt alles,
-- was das Studio als Ganzes betrifft — Rechnungen, Verträge, Konzepte.
-- Zwei Orte, zwei Buckets, unterschiedliche Zugriffslogik.

-- Frei anlegbare Labels. "Rechnung" ist einfach ein Label wie jedes andere;
-- es gibt bewusst keine fest verdrahteten Kategorien im Code.
create table if not exists document_labels (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text not null default '#C9A227',   -- Hex, wird als Punkt/Chip angezeigt
  created_at timestamptz not null default now()
);

create table if not exists studio_documents (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,                        -- wird von der Volltextsuche mit durchsucht
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size int,
  trainer_id uuid references trainers(id) on delete set null,  -- optionale Zuordnung
  period_from date,                        -- optionaler Zeitraum, z.B. Abrechnungsmonat
  period_to date,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

-- Ein Dokument kann mehrere Labels tragen (z.B. "Rechnung" + "Miete").
create table if not exists studio_document_labels (
  document_id uuid not null references studio_documents(id) on delete cascade,
  label_id uuid not null references document_labels(id) on delete cascade,
  primary key (document_id, label_id)
);

create index if not exists idx_studio_documents_trainer on studio_documents(trainer_id);
create index if not exists idx_studio_documents_period on studio_documents(period_from, period_to);
create index if not exists idx_studio_document_labels_label on studio_document_labels(label_id);

alter table document_labels enable row level security;
alter table studio_documents enable row level security;
alter table studio_document_labels enable row level security;

-- Eigener privater Bucket. Privat heißt: nicht öffentlich abrufbar, der
-- Zugriff läuft ausschließlich serverseitig über die App.
insert into storage.buckets (id, name, public)
values ('studio-documents', 'studio-documents', false)
on conflict (id) do nothing;

-- Ein paar Labels als Startpunkt. Umbenennen, umfärben oder löschen ist
-- jederzeit im Reiter "Ablage" möglich.
insert into document_labels (name, color) values
  ('Rechnung',   '#C9A227'),
  ('Vertrag',    '#7FB069'),
  ('Versicherung', '#6C8EBF'),
  ('Sonstiges',  '#9E9E9E')
on conflict (name) do nothing;
