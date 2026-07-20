-- Migration: Produkte (Karten/Abos) + Zuordnung zu Schüler:innen
-- In Supabase SQL Editor ausführen (nach schema.sql / seed.sql von v1)

-- Produkte: die Kartentypen/Abos, die es im Studio gibt
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,                 -- z.B. "10er Karte Poledance", "Kursabo 6 Monate"
  category text not null,             -- 'Poledance' | 'Kursabo' | 'Specialpaket' | 'Openclass-Abo' | 'USC-Zuzahlung' | 'Workshop' | 'Sonstiges'
  price_cents int not null,
  credits int,                        -- Anzahl Einheiten; null = unbegrenzt (z.B. Abo)
  valid_days int,                     -- Gültigkeitsdauer in Tagen ab Zuweisung; null = unbegrenzt
  requires_payment_confirmation boolean not null default false, -- true bei Drop-in/USC-Zuzahlung
  allowed_categories text[],          -- welche Kurs-Kategorien damit buchbar sind; leer/null = alle
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- Zuweisung eines Produkts an eine:n Schüler:in, mit eigener Laufzeit & Guthaben
create table if not exists customer_products (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  product_id uuid references products(id),
  valid_from date not null default current_date,
  valid_until date,                   -- null = unbegrenzt
  credits_total int,
  credits_remaining int,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- Persönliches Level je Schüler:in (unabhängig vom Kurs-Level)
alter table customers add column if not exists level text;

create index if not exists idx_customer_products_customer on customer_products(customer_id);
create index if not exists idx_customer_products_active on customer_products(active);

alter table products enable row level security;
alter table customer_products enable row level security;
