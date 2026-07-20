-- Platzhalter-Produkte, basierend auf den Kategorien von vertical-ballerina.de/preise
-- WICHTIG: Preise, Guthaben (credits) und Laufzeiten (valid_days) sind PLATZHALTER —
-- bitte in Supabase unter Table Editor -> products auf die echten Werte korrigieren.

insert into products (name, category, price_cents, credits, valid_days, requires_payment_confirmation, allowed_categories) values
('Schnupperstunde', 'Poledance', 2500, 1, 30, true, null),
('Drop-in Einzelstunde', 'Poledance', 2500, 1, 30, true, null),
('5er Karte Poledance', 'Poledance', 12000, 5, 56, false, array['Pole','Exotic Pole']),
('10er Karte Poledance', 'Poledance', 22000, 10, 120, false, array['Pole','Exotic Pole']),
('Kursabo 6 Monate', 'Kursabo', 11900, null, 182, false, array['Pole','Exotic Pole']),
('Kursabo 12 Monate', 'Kursabo', 9900, null, 365, false, array['Pole','Exotic Pole']),
('Specialpaket (nur mit Kursabo)', 'Specialpaket', 3000, 4, 182, false, array['Specials']),
('Openclass-Abo', 'Openclass-Abo', 4900, null, 30, false, array['Openclass','Conditioning','Shape & Flexibility']),
('USC-Zuzahlung pro Stunde', 'USC-Zuzahlung', 500, null, null, true, null);

-- Hinweis: 'allowed_categories' bezieht sich auf die Spalte courses.category
-- (Pole, Exotic Pole, Openclass, Conditioning, Shape & Flexibility, Specials).
-- Ein leeres/NULL-Array bedeutet: mit diesem Produkt sind alle Kategorien buchbar
-- (z.B. sinnvoll für Schnupperstunde/Drop-in).
