-- Migration 05: Räume, Unterscheidung Fest zugeteilt vs. Selbstbuchung,
-- Produktzuordnung pro Buchung.
-- In Supabase SQL Editor ausführen, nach migration_04_access_control.sql.

alter table courses add column if not exists room text;

-- 'self' = normale Buchung über die Buchungsseite, 'enrollment' = automatisch
-- durch eine feste Zuteilung entstanden. Beide zählen gleich zur Kapazität.
alter table bookings add column if not exists source text not null default 'self' check (source in ('self', 'enrollment'));

-- Welchem Produkt (Abo, 5er-Karte, ...) diese Buchung zugeordnet ist, falls
-- die Person mehrere aktive Produkte hat. Rein informativ, zieht (noch) kein
-- Guthaben automatisch ab.
alter table bookings add column if not exists customer_product_id uuid references customer_products(id);

-- Bereits bestehende, automatisch durch feste Zuteilung erzeugte Buchungen
-- (die bisher den Text "Feste Zuteilung" im Notizfeld hatten) nachträglich
-- korrekt kennzeichnen und das Notizfeld wieder freiräumen.
update bookings set source = 'enrollment', notes = null where notes = 'Feste Zuteilung';
