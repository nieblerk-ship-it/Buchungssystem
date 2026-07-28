-- Migration 10: Buchungsnachweis bleibt nach endgültiger Löschung erhalten
-- In Supabase SQL Editor ausführen, nach migration_09_archive.sql.
--
-- Bisher wurden beim endgültigen Löschen einer Schülerin auch alle ihre
-- Buchungen mitgelöscht (on delete cascade). Neu: Buchungen bleiben bestehen,
-- Name und E-Mail werden vor der Löschung als Schnappschuss in die Buchung
-- übernommen, das Konto selbst (und die Produktzuweisungen) werden entfernt.

alter table bookings add column if not exists deleted_customer_name text;
alter table bookings add column if not exists deleted_customer_email text;

-- Buchungen nicht mehr mitlöschen, sondern nur die Konto-Verknüpfung lösen
alter table bookings drop constraint if exists bookings_customer_id_fkey;
alter table bookings add constraint bookings_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

-- Produktzuweisungen werden weiterhin mit dem Konto gelöscht; die Buchung
-- verliert dann nur die Produkt-Verknüpfung, bleibt aber selbst erhalten
alter table bookings drop constraint if exists bookings_customer_product_id_fkey;
alter table bookings add constraint bookings_customer_product_id_fkey
  foreign key (customer_product_id) references customer_products(id) on delete set null;
