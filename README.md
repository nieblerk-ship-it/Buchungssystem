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

## Phase 1 – Produkte & Schülerverwaltung (Update)

Zusätzlich zu schema.sql/seed.sql jetzt einmalig in Supabase (SQL Editor) ausführen:

1. `supabase/migration_02_products.sql` (neue Tabellen: products, customer_products;
   neue Spalte customers.level)
2. `supabase/migration_02_seed_products.sql` (Platzhalter-Produkte — Preise,
   Guthaben und Laufzeiten bitte danach in Supabase unter Table Editor →
   products auf die echten Werte korrigieren, ich konnte sie nicht zuverlässig
   von der Website ablesen)

Neu im Admin-Bereich (zwei zusätzliche Reiter):

- **Schüler:innen**: anlegen, bearbeiten, entfernen, Produkte zuweisen/verlängern/
  ändern (auch rückwirkend oder nach Ablauf möglich)
- **Produkte**: Kartentypen/Abos anlegen, inkl. Preis, Guthaben, Gültigkeitsdauer,
  ob die Zahlung pro Termin bestätigt werden muss, und für welche Kurs-Kategorien
  das Produkt gilt

Im Reiter **Anmeldungen** erscheint jetzt bei Teilnehmer:innen ohne aktives,
passendes Produkt ein gelber Hinweis "kein aktives Produkt" — die Buchung wird
dadurch nicht blockiert.

Der Login-Link ist jetzt oben rechts auf der Buchungsseite statt im Footer.

## Phase 2 – Zugriffsrechte & Bestätigungsdialoge (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_04_access_control.sql`

Neue Regel für Buchbarkeit (greift auf der öffentlichen Buchungsseite):

1. Gibt es eine explizite **Freigabe** oder **Sperre** für diese:n Schüler:in
   bei diesem Kurs (im Admin-Bereich gesetzt) → die gewinnt immer.
2. Sonst: Buchung ist erlaubt, wenn ein **aktives Produkt** vorliegt, dessen
   erlaubte Kategorien den Kurs abdecken (oder das Produkt keine Einschränkung hat).
3. Sonst: Buchung wird mit einer Fehlermeldung abgelehnt.

**Wichtiger Hinweis:** Da Schüler:innen sich nicht einloggen, kann die
Buchungsseite ihnen nicht von vornherein nur "ihre" Kurse anzeigen — alle
künftigen Kurse bleiben sichtbar, eine Sperre/fehlende Freigabe greift erst
beim Versuch zu buchen (klare Fehlermeldung statt Blockierung der Ansicht).

Neu im Reiter **Schüler:innen** pro Person:

- **Freigaben**: einzelne Kurse gezielt freigeben oder sperren, unabhängig vom Produkt
- **Feste Zuteilung**: Person automatisch (ohne eigene Buchung) für einen Kurs
  eintragen, dauerhaft oder befristet auf einen Zeitraum — bucht sofort alle
  passenden künftigen Termine und auch neu erzeugte Termine automatisch mit

Bestätigungsdialoge gibt es jetzt bei: Kurs-Wochentag/Uhrzeit ändern, Kurs
deaktivieren, Schüler:in entfernen, Kurs sperren, feste Zuteilung anlegen.

## Phase 2 Ergänzungen (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_05_rooms_sources_products.sql`

- **Räume**: Kurse haben jetzt ein Raum-Feld (OC, Raum 1, Raum 2, Raum 3),
  einstellbar in "Kurse verwalten"
- **Kursplan-Reiter**: Wochenübersicht mit 7 Spalten (Mo–So), pro Tag die
  Kurse zeitlich sortiert mit Raum und Level
- **Fest zugeteilt vs. Kommentar getrennt**: automatisch durch feste
  Zuteilung entstandene Buchungen zeigen jetzt ein eigenes Abzeichen "Fest
  zugeteilt" statt das Kommentarfeld zu belegen — das Kommentarfeld bleibt
  frei für eigene Notizen wie "Zahlung fehlt". Feste Zuteilungen zählen dabei
  ganz normal wie Einzelbuchungen zur Kapazität.
- **Produktauswahl je Buchung**: hat eine Person mehrere aktive Produkte
  (z. B. Kursabo + zusätzliche 5er-Karte), lässt sich im Reiter "Anmeldungen"
  pro Buchung auswählen, welches Produkt dafür verwendet wurde. Das ist
  aktuell rein zur Dokumentation — ein automatischer Guthaben-Abzug ist noch
  nicht eingebaut, das würde sich anbieten, sobald die Anwesenheits-Checkliste
  (Phase 4) kommt.
- **Überbuchung**: Termine, bei denen mehr Personen eingetragen sind als
  Kapazität vorhanden ist (z. B. durch feste Zuteilung trotz vollem Kurs),
  werden im Reiter "Anmeldungen" kräftig rot markiert.
- **Meldungen-Reiter**: sammelt Überbuchungen (rot), offene Kommentare und
  fehlende aktive Produkte (gelb) an einem Ort, nach Farbe filterbar.

## Phase 3 – Trainer-Logins & Trainer-Bereich (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_06_trainers.sql`

Neue Umgebungsvariable in `.env.local` ergänzen (siehe `.env.example`):

```
TRAINER_SESSION_SECRET=irgendein-langer-zufaelliger-text
```

(Falls du sie weglässt, wird ersatzweise `ADMIN_PASSWORD` als Secret verwendet
— funktioniert, ist aber weniger sauber getrennt. Ein eigener, langer,
zufälliger Text ist empfehlenswert.)

Neu:

- **Trainer-Konten** (Reiter "Trainer:innen" im Admin-Bereich): Name, E-Mail
  und Passwort vergeben, Passwort später zurücksetzen, Konto deaktivieren.
- **Trainer-Login** unter **/trainer** (eigener Login-Button auf der
  Buchungsseite oben rechts, getrennt vom Admin-Login) — Passwörter werden
  sicher gehasht gespeichert (bcrypt), nie im Klartext.
- Beim Kurs anlegen/bearbeiten lässt sich ein **Trainer-Konto** zuordnen
  (zusätzlich zum bisherigen freien Textfeld "Trainer:in", das für Gastdozent:innen
  ohne eigenes Konto weiter nutzbar bleibt).
- Trainer:innen sehen unter /trainer **nur ihre eigenen Kurse** in derselben
  Wochenkalender-Ansicht wie der Admin-Bereich — aktuell rein lesend (Namen,
  E-Mails, Kommentare, "Fest zugeteilt"-Badges), ohne Bearbeitungsmöglichkeiten.
  Das ändert sich mit der Anwesenheits-Checkliste in Phase 4.

## Phase 4 – Anwesenheits-Checkliste (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_07_attendance.sql`

- Bei jeder Buchung im Reiter **Anmeldungen** (Admin) und im **Trainer-Bereich**
  gibt es jetzt zwei Buttons **"✓ Da"** / **"✗ Fehlt"** pro Person — Klick
  speichert sofort. Nochmal klicken setzt zurück auf "nicht erfasst".
- Trainer:innen können das jetzt auch für ihre eigenen Kurse eintragen (vorher
  nur Ansicht) — eine serverseitige Prüfung stellt sicher, dass sie nur bei
  ihren eigenen Kursen etwas ändern können.
- Admin und Trainer-Bereich können jetzt auch **in vergangene Wochen navigieren**
  (bis 60 Tage zurück), damit sich Anwesenheit auch nachträglich eintragen lässt.
  Auf der öffentlichen Buchungsseite bleibt das wie gehabt gesperrt.
- Neue Meldung im Reiter **Meldungen**: "Anwesenheit fehlt" (gelb) für
  vergangene, nicht abgesagte Termine mit mindestens einer noch nicht
  erfassten Person.

Absichtlich (noch) nicht enthalten: die separate Zahlungsbestätigung pro
Kartentyp (Drop-in/USC-Zuzahlung) aus der ursprünglichen Anforderung — dafür
gibt es weiterhin das freie Kommentarfeld pro Buchung.

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
