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

## Phase D – Individuelle Admin-Logins & Änderungslog (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_12_admin_accounts_audit_log.sql`
(die Datei enthält am Ende auch das SQL, um dein erstes Admin-Konto anzulegen — unbedingt ausführen, sonst kommst du nicht mehr rein!)

**Wichtig — Breaking Change:** Das gemeinsame `ADMIN_PASSWORD` funktioniert nicht mehr.
Du kannst die Zeile aus `.env.local` entfernen. Stattdessen brauchst du:

```
ADMIN_SESSION_SECRET=irgendein-anderer-langer-zufaelliger-text
```

- Admin-Login läuft jetzt über **E-Mail + Passwort**, genau wie beim Trainer-Login
  — Passwörter werden mit bcrypt gehasht gespeichert.
- Weitere Admin-Konten legst du direkt in Supabase per SQL an (nach demselben
  Muster wie das erste, siehe Migrationsdatei) — eine Verwaltungsoberfläche
  dafür in der App selbst gibt es bewusst nicht, um zu verhindern, dass sich
  ein Admin-Konto selbst weitere Rechte verschafft.
- Neuer Reiter **"Änderungslog"**: zeigt jede Änderung mit Zeitstempel,
  Bearbeiter:in, Aktion, Bereich und Beschreibung. Filterbar nach Zeitraum,
  Bearbeiter:in, Bereich und Freitext-Suche. **"Als Excel exportieren"** lädt
  die gefilterte Liste als `.xlsx` herunter.
- Der Log ist **unveränderlich**: es gibt in der App keine Funktion, um
  Einträge zu bearbeiten oder zu löschen — nur anzulegen (automatisch bei
  jeder Änderung) und zu lesen.
- `npm install` nötig (neue Abhängigkeit `xlsx` für den Excel-Export).

## Phase E1 – Kursbezeichnungen & Anlegen im Kalender (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_13_course_types.sql`
(überführt bestehende Kurse automatisch in Bezeichnungen — nichts geht verloren)

- **Kursbezeichnung und Kurs-Instanz sind jetzt getrennt.** Dieselbe Bezeichnung
  (z.B. "Beginner 2/3") kann mehrfach existieren — in verschiedenen Räumen, zu
  verschiedenen Zeiten, mit verschiedenen Trainerinnen.
- Der Reiter **"Kurse verwalten" ist entfallen.** Kurse werden jetzt direkt im
  Reiter **Anmeldungen** über das **"+"** rechts neben der KW-Anzeige angelegt.
  Das Formular öffnet sich unter dem Kalender; du kannst weiter im Kalender
  navigieren, und ein angeklickter Termin öffnet sich darunter.
- Beim Anlegen wählst du eine bestehende Bezeichnung aus dem Dropdown **oder**
  trägst eine komplett neue als Freitext ein (wird dann automatisch als neue
  Bezeichnung gespeichert und steht künftig im Dropdown).
- Neue Auswahl **Einzeltermin** vs. **Regelmäßiger Termin**: Einzeltermin
  braucht nur ein Datum, regelmäßiger Termin Wochentag + Start- und Enddatum.
  Die Termine werden für genau diesen Zeitraum erzeugt.

## Phase E2 – Freigaben pro Bezeichnung, Raumkollision, Kurs deaktivieren (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_14_overrides_by_type.sql`
(hängt bestehende Freigaben automatisch auf die jeweilige Kursbezeichnung um)

- **Freigaben/Sperren gelten jetzt pro Kursbezeichnung.** Gibst du "Beginner 2/3"
  für eine Person frei, gilt das für alle Instanzen dieser Bezeichnung — egal in
  welchem Raum, zu welcher Zeit oder bei welcher Trainerin. Im Reiter
  Schüler:innen → "Freigaben" wählst du entsprechend die Bezeichnung statt eines
  einzelnen Kurses.
- **Raum-Doppelbelegung** wird erkannt: liegen zwei nicht abgesagte Kurse im
  selben Raum am selben Tag mit sich überschneidenden Zeiten (Startzeit + Dauer),
  erscheint im Reiter **Meldungen** eine rote Meldung "Raum doppelt belegt".
- **"Ganzen Kurs deaktivieren"** im Termin-Detailbereich — ersetzt die Funktion
  aus dem entfallenen Reiter "Kurse verwalten". Der Kurs verschwindet damit von
  der Buchungsseite, bestehende Termine und Buchungen bleiben erhalten. Für
  einzelne Ausfälle weiterhin "Termin absagen" nutzen.

## Kurse beenden, bearbeiten, löschen (Nachbesserung zu E2)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_15_course_end_and_delete.sql`

**Wichtige Korrektur:** "Kurs deaktivieren" ist komplett entfallen — es hat
rückwirkend auch bereits stattgefundene Termine unsichtbar gemacht, was für die
Dokumentation schlecht war. Stattdessen gibt es drei klar getrennte Aktionen im
Termin-Detailbereich:

- **Kurs bearbeiten**: Bezeichnung (z.B. Level-Aufstieg), Kategorie, Level, Raum,
  Trainer:in, Zeit, Dauer, Kapazität, Wochentag und **Laufzeit** ändern.
  Änderungen wirken sich ausschließlich auf künftige Termine aus; vergangene
  Termine bleiben unverändert dokumentiert. Das Enddatum lässt sich nur in der
  Zukunft setzen (zum sofortigen Beenden gibt es "Kurs beenden").
  Damit kannst du eine Kursreihe kürzen oder eine Gruppe ins nächste Level
  heben, ohne alles neu anzulegen.
- **Änderung ab einem bestimmten Termin (Level-Aufstieg)**: Im Bearbeiten-Panel
  wählst du, ob die Änderung für *alle künftigen Termine* gilt oder erst *ab dem
  Termin, den du angeklickt hast*. Bei der zweiten Variante wird die Kursreihe
  gesplittet: die bisherige Reihe endet am Tag davor und bleibt mit ihrem alten
  Namen und Level vollständig im Kalender stehen, ab dem Stichtag läuft eine neue
  Reihe mit den geänderten Daten. So steht ein Beginner-Kurs von vor einem Monat
  weiterhin als "Beginner" im Kalender, auch wenn die Gruppe inzwischen als
  "Intermediate" weiterläuft. Buchungen der künftigen Termine werden übernommen.
- **Kurs beenden**: beendet die Reihe ab heute. Künftige Termine werden samt
  Buchungen entfernt, Vergangenes bleibt vollständig erhalten.
- **Kurs löschen**: entfernt den Kurs komplett. Nur möglich, wenn es keine
  bereits stattgefundenen Termine mit Buchungen gibt — sonst kommt ein Hinweis,
  damit keine dokumentierte Vergangenheit verloren geht. Gedacht für versehentlich
  angelegte Kurse.

## Phase F – Kalender sperren (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_16_calendar_locks.sql`

Neuer Reiter **"Kalender-Sperren"** im Admin-Bereich. Dort sperrst du einen
Zeitraum (von/bis, optional mit Grund) — typischerweise eine abgeschlossene
Woche oder einen abgerechneten Monat.

In einem gesperrten Zeitraum ist nichts mehr änderbar:

- keine Anwesenheitserfassung (Admin **und** Trainer:innen)
- keine Buchungsänderungen, Stornierungen oder Teilnehmerlisten-Änderungen
- keine Terminabsagen oder Reaktivierungen
- keine Kursänderungen ab einem Datum im gesperrten Bereich
- keine neuen Anmeldungen über die öffentliche Buchungsseite

Der Versuch wird serverseitig abgelehnt (nicht nur in der Oberfläche versteckt),
mit einem klaren Hinweis, dass die Sperre zuerst aufgehoben werden muss.
Gesperrte Tage sind im Kalender mit "gesperrt" gekennzeichnet. Sperren anlegen
und aufheben wird im Änderungslog protokolliert.

## Kursänderungen immer mit Stichtag + Trainer-Vertretung (Update)

Zusätzlich in Supabase ausführen: `supabase/migration_17_session_trainer.sql`

- **Jede inhaltliche Kursänderung ist jetzt ein Split.** Die Option "Für alle
  künftigen Termine" ist entfallen; stattdessen wählst du **"Ab dem [Termin]"**
  (dem angeklickten) oder **"Ab heute"** — letzteres schließt den heutigen Tag
  mit ein. Die bisherige Reihe endet am Tag davor und bleibt mit altem Namen,
  Level und Trainer:in dokumentiert. Rückwirkend ändert sich dadurch nie etwas.
- **Kalender-Sperren gelten nur noch für die Vergangenheit**: das Enddatum muss
  vor dem heutigen Tag liegen. Dadurch blockieren Sperren keine Kursänderungen,
  kein Beenden, Löschen oder Anlegen mehr — die betreffen ausschließlich die
  Zukunft.
- **Trainer:in ändern** (neuer Button im Termin-Detailbereich) mit drei
  Reichweiten: **nur dieser Termin** (Vertretung), **Zeitraum** (z.B. Urlaub)
  oder **dauerhaft übernehmen** (führt zur Kursbearbeitung mit Stichtag).
  Vertretungen erscheinen im Kalender als "Vertretung: …"; die vertretende
  Trainerin sieht den Termin in ihrem eigenen Bereich und kann dort die
  Anwesenheit erfassen.

## Phase 5 – Dokumente & Nachweise mit Laufzeit (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_18_documents.sql`
(legt die Tabelle und den privaten Storage-Bucket `customer-documents` an)

- Im Reiter **Schüler:innen → "Details"** gibt es jetzt den Bereich
  **"Dokumente & Nachweise"**: PDF oder Bild hochladen (max. 10 MB), mit Titel,
  Art (Ermäßigungsnachweis, Einverständniserklärung, Gesundheitsnachweis,
  Sonstiges) und Gültigkeitszeitraum.
- Abgelaufene Nachweise werden rot mit "ABGELAUFEN" markiert; die Gültigkeit
  lässt sich direkt in der Liste verlängern, ohne neu hochzuladen.
- Die Dateien liegen in einem **privaten** Bucket und sind nie öffentlich
  abrufbar. Zum Ansehen erzeugt die App einen signierten Link, der nach
  60 Sekunden abläuft.
- Hochladen, Ändern und Löschen von Dokumenten landet im Änderungslog.

**Praxishinweis:** Das ergänzt die Ermäßigungs-Checkbox bei der Produktzuweisung
— dort hakst du "Ermäßigt" an, hier liegt der zugehörige Nachweis mit seiner
Laufzeit. Beides ist bewusst getrennt, damit ein abgelaufener Nachweis nicht
automatisch eine laufende Karte entwertet.

## Phase G – Kleine Verbesserungen (Update)

Zusätzlich in Supabase ausführen: `supabase/migration_19_settings.sql`

- **Neuer Reiter "Einstellungen"**: studioweite Standardwerte für Kapazität,
  Dauer, Raum und Kategorie. Sie füllen das Formular beim Kurs-Anlegen vor.
  Wählst du dort eine bestehende Kursbezeichnung, gewinnen weiterhin deren
  eigene Vorgaben.
- **Meldungen sind klickbar**: Über "zum Termin" springst du direkt zur
  richtigen Woche, der Termin öffnet sich, abgesagte/beendete werden dabei
  automatisch eingeblendet.
- **Filter nach Meldungsart**: Jede Art lässt sich einzeln ab- und anwählen
  (mit Anzahl daneben), zusätzlich zum bestehenden Rot/Gelb-Filter. So kannst
  du dir z.B. nur "Anwesenheit fehlt" anzeigen lassen.
- **Hinweis bei zu kurzer Kursreihe**: Reicht der gewünschte Zeitraum einer
  festen Zuteilung über das Kursende hinaus, wird die Person bis zum Kursende
  eingetragen und du bekommst einen Hinweis mit dem tatsächlichen Enddatum.

## Aufräumen: Kalender-Sperren entfernt, Trainer-Pflicht bleibt (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_21_remove_locks.sql`
(`npm install` nicht nötig. `migration_20` ist damit hinfällig — nicht mehr ausführen.)

- **Kalender-Sperren sind komplett entfernt.** Der Reiter „Kalender-Sperren"
  ist weg, ebenso alle serverseitigen Prüfungen und die Tabelle
  `calendar_locks`. Damit lassen sich Anwesenheiten, Buchungen und Termine
  in der Vergangenheit wieder ohne Umweg korrigieren. Wer wann was geändert
  hat, steht weiterhin vollständig im Änderungslog — die Nachvollziehbarkeit
  hängt also nicht an den Sperren.
- **Das Trainer-Notizfeld je Termin ist wieder entfernt** (Phase H1 zurückgenommen).
  Für Anmerkungen zu einzelnen Personen bleibt das Kommentarfeld je Buchung.
- **Trainer:in erforderlich bleibt**: im Reiter „Einstellungen" pro
  Kursbezeichnung ein Haken. Ist er gesetzt, erscheint jeder nicht abgesagte
  Termin ohne Trainer:in als gelbe Meldung „Trainer:in fehlt" und wird in der
  Kalenderkachel markiert. Sonderregel Openclass: läuft zeitgleich ein anderer
  Kurs mit Trainer:in, gilt der Termin als abgedeckt.
- Der Kalender löst jetzt auch verknüpfte **Trainer-Konten** zum Namen auf,
  nicht mehr nur das freie Textfeld.

## Phase H2 – Vertretermanagement (Update)

Zusätzlich in Supabase (SQL Editor) ausführen: `supabase/migration_22_substitute_requests.sql`
(`npm install` nicht nötig.)

**Ablauf in vier Schritten:**

1. Eine Trainerin öffnet unter `/trainer` ihren Termin und klickt
   **„Vertretung suchen"**, optional mit Grund. Möglich nur für Termine, die
   sie selbst leitet, die nicht abgesagt sind und nicht in der Vergangenheit
   liegen. Ist bereits eine Vertretung für den Termin eingetragen, darf die
   Vertretung die Anfrage stellen — nicht mehr die ursprüngliche Trainerin.
2. Alle anderen Trainerinnen sehen die Anfrage im neuen Bereich
   **„Vertretungen"** (Umschalter oben im Trainer-Bereich, mit Zähler für
   offene Anfragen), nach Datum sortiert, und tragen sich mit
   **„Ich übernehme"** ein.
3. Im Admin-Bereich erscheint das im neuen Reiter **„Vertretungen"** unter
   „Wartet auf deine Bestätigung", ebenfalls mit Zähler am Reiter.
4. Mit **„Bestätigen"** wird die Vertretung wirksam: sie wird als Trainer:in
   genau dieses Termins eingetragen — technisch derselbe Weg wie
   „Trainer:in ändern → nur dieser Termin". Dadurch greift alles Bestehende
   automatisch: der Termin taucht im Kalender der Vertretung auf, sie kann
   dort die Anwesenheit erfassen, und im Kalender steht „Vertretung: …".

**Weitere Aktionen:** Die anfragende Trainerin kann ihre Anfrage zurückziehen,
die übernehmende ihre Zusage („Doch nicht") — die Anfrage ist dann wieder offen.
Der Admin kann eine Übernahme **ablehnen** (Anfrage wird wieder offen) oder die
ganze Anfrage **schließen**, etwa wenn er die Vertretung direkt am Termin
geregelt hat.

**Sichtbarkeit im Kalender:** Termine mit laufender Anfrage sind in beiden
Kalendern markiert — „Vertretung gesucht" bzw. „Vertretung wartet auf
Bestätigung". Im Termin-Detailbereich steht, wer sucht, wer übernehmen möchte
und aus welchem Grund.

**Bewusst so gebaut:**

- **Nur Einzeltermine.** Für längere Ausfälle (Urlaub, längere Krankheit) gibt
  es keine Zeitraum-Anfrage — das regelt die Studioleitung direkt über
  „Trainer:in ändern → Zeitraum".
- **Pro Termin läuft immer nur eine Anfrage.** Erledigte Anfragen bleiben als
  Dokumentation liegen und blockieren eine spätere neue Anfrage nicht.
- **Kein Mailversand.** Anfragen sieht man beim nächsten Login im Bereich
  „Vertretungen". Kurzfristige Ausfälle laufen weiterhin über WhatsApp o.ä.;
  das System dokumentiert und bestätigt sie. Sobald der Mailversand steht
  (siehe unten), lässt sich die Benachrichtigung ohne Umbau ergänzen.
- Alle Schritte landen im Änderungslog — die aus dem Trainer-Bereich als
  „Trainer:in <Name>" statt eines Admin-Kontos.

## Phase I1 – Stundenlisten je Trainer:in (Update)

Keine Migration, kein `npm install` — es kommen nur neue Dateien dazu.

Neuer Reiter **„Stunden"** im Admin-Bereich: Zeitraum wählen (Vorgabe ist der
laufende Monat), optional auf eine Trainer:in einschränken, „Auswerten".
Ergebnis ist eine Tabelle mit Anzahl Termine und Stunden je Person, aufklappbar
zu den einzelnen Terminen, plus **„Als Excel"** — die Datei hat zwei Blätter:
eine Übersicht je Person und eine Zeile je Termin, damit jede Summe
nachvollziehbar bleibt.

**Wie gezählt wird:**

- **Jeder nicht abgesagte Termin zählt**, unabhängig davon, ob die Anwesenheit
  erfasst wurde oder wie viele Teilnehmerinnen da waren. Gearbeitet wurde in
  jedem Fall. Abgesagte Termine zählen nicht.
- **Übernommene Vertretungen zählen für die Person, die den Termin gehalten
  hat** — nicht für die, die ihn abgegeben hat. Eine Vertretung auf Terminebene
  gewinnt also vor der Trainer:in des Kurses. In der Detailliste sind solche
  Termine mit „Vertretung" gekennzeichnet.
- Die Dauer kommt aus dem Feld „Dauer" des Kurses. Wer sie nie angepasst hat,
  rechnet mit den voreingestellten 70 Minuten.
- Innerhalb einer Ebene hat ein verknüpftes **Trainer-Konto** Vorrang vor dem
  freien Textfeld, damit die Stunden bei der Person landen, die sie abrechnet.

**Drei Zeilenarten in der Tabelle:** Trainerinnen mit eigenem Konto zuerst, dann
Gastdozent:innen, die nur als Freitext eingetragen sind („ohne Konto"), zuletzt
Termine, bei denen niemand eingetragen ist („nicht besetzt"). Die letzte Zeile
ist bewusst dabei — so ergibt die Summe aller Zeilen immer die tatsächliche
Anzahl der Termine im Zeitraum, und Lücken fallen beim Abrechnen auf.

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
