import { supabaseAdmin } from "@/lib/supabase";

// Legt für alle aktiven festen Zuteilungen (enrollments) eines Kurses automatisch
// Buchungen für die künftigen, noch nicht gebuchten Termine an. Wird sowohl beim
// Anlegen einer Zuteilung als auch beim (Neu-)Erzeugen von Kursterminen aufgerufen,
// damit auch später generierte Termine automatisch mitgebucht werden.
// Zählt in derselben Warteschlange wie Selbstbuchungen: ist der Termin zum
// Zeitpunkt der Zuteilung schon voll, landet die Person auf der Warteliste.
//
// LEISTUNG: Diese Funktion lief früher pro Termin und Person zwei einzelne
// Abfragen (Gibt es schon eine Buchung? Wie viele sind bestätigt?) und danach
// ein einzelnes Insert. Bei 8 zugeteilten Personen und 30 künftigen Terminen
// waren das über 700 Roundtrips zur Datenbank — spürbar als mehrere Sekunden
// Wartezeit. Jetzt werden alle Bestandsdaten in EINER Abfrage geholt, die
// Entscheidung im Speicher getroffen und alle neuen Buchungen in EINEM Insert
// geschrieben. Das Verhalten ist identisch, nur die Anzahl der Abfragen nicht.
export async function ensureEnrollmentBookings(db: ReturnType<typeof supabaseAdmin>, courseId: string) {
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, customer_id, valid_from, valid_until")
    .eq("course_id", courseId)
    .eq("active", true);

  if (!enrollments || enrollments.length === 0) return 0;

  const { data: course } = await db.from("courses").select("capacity").eq("id", courseId).single();

  const { data: sessions } = await db
    .from("course_sessions")
    .select("id, session_date, capacity_override")
    .eq("course_id", courseId)
    .eq("cancelled", false)
    .gte("session_date", new Date().toISOString().slice(0, 10));

  if (!sessions || sessions.length === 0) return 0;

  const sessionIds = sessions.map((s) => s.id);

  // Alle bestehenden Buchungen dieser Termine auf einmal. Daraus ergibt sich
  // beides: wer schon gebucht ist und wie voll jeder Termin bereits ist.
  const { data: existingBookings } = await db
    .from("bookings")
    .select("course_session_id, customer_id, status")
    .in("course_session_id", sessionIds)
    .in("status", ["confirmed", "waitlisted"]);

  const alreadyBooked = new Set<string>();
  const confirmedPerSession = new Map<string, number>();
  for (const booking of existingBookings ?? []) {
    if (booking.customer_id) {
      alreadyBooked.add(`${booking.course_session_id}:${booking.customer_id}`);
    }
    if (booking.status === "confirmed") {
      confirmedPerSession.set(
        booking.course_session_id,
        (confirmedPerSession.get(booking.course_session_id) ?? 0) + 1
      );
    }
  }

  const rows: {
    customer_id: string;
    course_session_id: string;
    status: "confirmed" | "waitlisted";
    source: string;
  }[] = [];

  for (const enrollment of enrollments) {
    for (const session of sessions) {
      if (enrollment.valid_from && session.session_date < enrollment.valid_from) continue;
      if (enrollment.valid_until && session.session_date > enrollment.valid_until) continue;
      if (alreadyBooked.has(`${session.id}:${enrollment.customer_id}`)) continue;

      const capacity = session.capacity_override ?? course?.capacity ?? 0;
      const confirmed = confirmedPerSession.get(session.id) ?? 0;
      const status: "confirmed" | "waitlisted" = confirmed < capacity ? "confirmed" : "waitlisted";

      // Mitzählen, damit mehrere neue Zuteilungen im selben Durchlauf die
      // Kapazität korrekt füllen und der Rest regulär auf der Warteliste landet.
      if (status === "confirmed") confirmedPerSession.set(session.id, confirmed + 1);
      alreadyBooked.add(`${session.id}:${enrollment.customer_id}`);

      rows.push({
        customer_id: enrollment.customer_id,
        course_session_id: session.id,
        status,
        source: "enrollment",
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await db.from("bookings").insert(rows);
  if (error) return 0;
  return rows.length;
}
