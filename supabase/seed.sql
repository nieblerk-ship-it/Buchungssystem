-- Beispieldaten – nach schema.sql ausführen.
--
-- WICHTIG: weekday/start_time sind PLATZHALTER (ich kenne euren echten
-- Stundenplan nicht). Nach dem Einfügen in Supabase einfach in der Tabelle
-- "courses" die Spalten weekday (1=Mo ... 7=So) und start_time direkt
-- bearbeiten, damit sie zu eurem echten Kursplan passen.

insert into courses (name, category, level, weekday, start_time, duration_minutes, capacity) values
('Schnupperstunde', 'Pole', null, 6, '11:00', 70, 8),
('Beginner 1', 'Pole', 'Level 1', 1, '18:00', 70, 8),
('Beginner 1/2', 'Pole', 'Level 1/2', 1, '19:30', 70, 8),
('Beginner 2/3', 'Pole', 'Level 2/3', 2, '18:00', 70, 8),
('Beginner 3/4', 'Pole', 'Level 3/4', 2, '19:30', 70, 8),
('Intermediate', 'Pole', 'Intermediate', 3, '19:00', 70, 8),
('Advanced', 'Pole', 'Advanced', 4, '19:00', 70, 6),
('Heelspole / Exotic Pole', 'Exotic Pole', null, 3, '20:30', 70, 8),
('Openclass', 'Openclass', null, 5, '18:00', 70, 10),
('Pole Conditioning', 'Conditioning', null, 4, '18:00', 70, 10),
('Shape & Flexibility', 'Shape & Flexibility', null, 2, '20:30', 70, 10);

-- Erzeugt für die nächsten 4 Wochen konkrete Kurstermine aus den wiederkehrenden Kursen
insert into course_sessions (course_id, session_date)
select c.id, d::date
from courses c
cross join generate_series(current_date, current_date + interval '28 days', interval '1 day') as d
where extract(isodow from d) = c.weekday
on conflict do nothing;
