-- Migration 18: Dokumente/Nachweise mit Laufzeit (Phase 5)
-- In Supabase SQL Editor ausführen, nach migration_17.

create table if not exists customer_documents (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  title text not null,                 -- z.B. "Studierendenausweis WS 25/26"
  doc_type text,                       -- z.B. 'Ermäßigungsnachweis' | 'Einverständnis' | 'Sonstiges'
  storage_path text not null,          -- Pfad im Storage-Bucket
  file_name text not null,
  mime_type text,
  file_size int,
  valid_from date,
  valid_until date,                    -- null = unbegrenzt
  notes text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_documents_customer on customer_documents(customer_id);
create index if not exists idx_customer_documents_valid on customer_documents(valid_until);

alter table customer_documents enable row level security;

-- Privater Storage-Bucket für die Dateien. Privat heißt: die Dateien sind
-- NICHT öffentlich abrufbar, der Zugriff läuft ausschließlich serverseitig
-- über die App (signierte, zeitlich begrenzte Links).
insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', false)
on conflict (id) do nothing;
