# Vertical Ballerina – Kursbuchung (Version 1)

Einfaches Buchungssystem: Kund:innen sehen den echten Kursplan (Beginner 1
bis Advanced, Openclass, Heelspole/Exotic Pole, Shape & Flexibility, ...)
und tragen sich mit Name + E-Mail direkt für einen Termin ein — **ohne
Zahlung**. Das kommt erst in einer späteren Version dazu.

Stack: **Next.js 14** (Frontend + API-Routen), **Supabase** (Postgres-Datenbank).

## 1. Voraussetzungen

- Node.js 18+ (prüfen mit `node -v` im Terminal)
- Ein kostenloses [Supabase](https://supabase.com)-Projekt

## 2. Supabase einrichten

1. Neues Projekt auf supabase.com anlegen.
2. Im SQL Editor nacheinander ausführen:
   - `supabase/schema.sql` (legt alle Tabellen an, aktiviert Row Level
     Security ohne Policies — Zugriff läuft ausschließlich über den
     `service_role`-Key in den API-Routen, nie direkt vom Browser aus)
   - `supabase/seed.sql` (die echten Kurs-Levels von Vertical Ballerina als
     Startpunkt, mit **Platzhalter-Zeiten** — siehe Hinweis unten)
3. Unter **Project Settings → API** die drei Werte kopieren:
   `Project URL`, `anon public key`, `service_role key`.

### Wichtig: echten Kursplan eintragen

Ich kenne eure tatsächlichen Wochentage/Uhrzeiten nicht — `seed.sql` legt die
Kurse mit Platzhalter-Zeiten an. Danach in Supabase links auf **Table Editor
→ courses** gehen und pro Kurs die Spalten `weekday` (1=Montag … 7=Sonntag)
und `start_time` auf die echten Zeiten anpassen. Neue Kurse lassen sich dort
auch direkt als neue Zeile hinzufügen.

Damit für neue Kurse automatisch Termine für die nächsten Wochen entstehen,
im SQL Editor bei Bedarf erneut ausführen (Datum ggf. anpassen):

```sql
insert into course_sessions (course_id, session_date)
select c.id, d::date
from courses c
cross join generate_series(current_date, current_date + interval '28 days', interval '1 day') as d
where extract(isodow from d) = c.weekday
on conflict do nothing;
```

## 3. Projekt starten

```bash
cp .env.example .env.local
# .env.local mit den echten Supabase-Werten befüllen,
# und ein eigenes ADMIN_PASSWORD eintragen

npm install
npm run dev
```

App läuft auf http://localhost:3000.

## 4. Anmeldungen einsehen & Kurse verwalten

Unter **http://localhost:3000/admin** mit dem in `.env.local` gesetzten
`ADMIN_PASSWORD` einloggen. Zwei Bereiche:

- **Anmeldungen**: alle künftigen Termine mit den angemeldeten Namen und
  E-Mails, plus Möglichkeit, einen einzelnen Termin abzusagen (z. B. bei
  Krankheit) oder wieder zu aktivieren.
- **Kurse verwalten**: neue Kurse anlegen (Name, Level, Wochentag, Uhrzeit,
  Kapazität, ...) — dabei werden automatisch Termine für die nächsten
  4 Wochen erzeugt. Bestehende Kurse lassen sich bearbeiten oder
  deaktivieren (deaktivierte Kurse verschwinden von der Buchungsseite,
  bestehende Termine/Buchungen bleiben aber in der Datenbank erhalten).

Auf der Buchungsseite selbst gibt es unten einen kleinen Link
"Für Trainerinnen: Admin-Bereich", der direkt zu `/admin` führt.

Alle Änderungen landen direkt in Supabase — unabhängig davon, ob der
lokale Server (`npm run dev`) gerade läuft oder gestoppt wurde.

## 5. Deployment (empfohlen: Vercel)

1. Projektordner zu GitHub pushen, in [Vercel](https://vercel.com) importieren.
2. Umgebungsvariablen aus `.env.local` in den Vercel-Projekteinstellungen eintragen.
3. Fertig — Vercel gibt dir eine echte URL, die auch auf der Website verlinkt
   werden kann.

## Projektstruktur

```
app/
  page.tsx                    Kursplan + Anmeldeformular
  admin/page.tsx               Passwortgeschützte Übersicht der Anmeldungen
  api/courses/route.ts         Kurstermine + freie Plätze
  api/bookings/route.ts        Legt eine Anmeldung an
  api/admin/bookings/route.ts  Liefert Anmeldungen für die Admin-Seite
lib/supabase.ts                Supabase-Clients (Browser & Admin)
supabase/schema.sql            Datenbankschema
supabase/seed.sql              Echte Kurs-Levels als Startpunkt
```

## Was als Nächstes sinnvoll wäre (bewusst noch nicht enthalten)

- **Zahlung**: Drop-in/Fünfer-/Zehnerkarten, Kurs-Abos mit Laufzeit — euer
  Preismodell ist recht komplex (siehe vertical-ballerina.de/preise), das
  bauen wir am besten in einem zweiten Schritt, sobald v1 läuft.
- **E-Mail-Bestätigung** nach der Anmeldung.
- **Stornierung durch Kund:innen selbst** (aktuell nur über die Admin-Seite möglich).
- **Level-Freigabe**: aktuell kann sich theoretisch jede:r für jeden Kurs
  anmelden. Falls gewünscht, könnte ein Hinweistext oder eine Bestätigung
  ("Ich wurde für dieses Level freigegeben") ergänzt werden.
- **Echter Login statt geteiltem Passwort** für den Admin-Bereich (z. B. via
  Supabase Auth), falls mehrere Trainerinnen eigene Zugänge brauchen sollen.
