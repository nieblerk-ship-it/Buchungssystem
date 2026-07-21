import { supabaseAdmin } from "@/lib/supabase";

// Legt für alle aktiven festen Zuteilungen (enrollments) eines Kurses automatisch
// Buchungen für die künftigen, noch nicht gebuchten Termine an. Wird sowohl beim
// Anlegen einer Zuteilung als auch beim (Neu-)Erzeugen von Kursterminen aufgerufen,
// damit auch später generierte Termine automatisch mitgebucht werden.
// Kapazitätsprüfung wird hier bewusst übersprungen — Admin-Zuteilung ist Vorrang.
export async function ensureEnrollmentBookings(db: ReturnType<typeof supabaseAdmin>, courseId: string) {
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, customer_id, valid_from, valid_until")
    .eq("course_id", courseId)
    .eq("active", true);

  if (!enrollments || enrollments.length === 0) return 0;

  const { data: sessions } = await db
    .from("course_sessions")
    .select("id, session_date")
    .eq("course_id", courseId)
    .eq("cancelled", false)
    .gte("session_date", new Date().toISOString().slice(0, 10));

  if (!sessions || sessions.length === 0) return 0;

  let created = 0;
  for (const enrollment of enrollments) {
    const matchingSessions = sessions.filter((s) => {
      if (enrollment.valid_from && s.session_date < enrollment.valid_from) return false;
      if (enrollment.valid_until && s.session_date > enrollment.valid_until) return false;
      return true;
    });

    for (const session of matchingSessions) {
      const { data: existing } = await db
        .from("bookings")
        .select("id")
        .eq("customer_id", enrollment.customer_id)
        .eq("course_session_id", session.id)
        .eq("status", "confirmed")
        .maybeSingle();
      if (existing) continue;

      const { error } = await db.from("bookings").insert({
        customer_id: enrollment.customer_id,
        course_session_id: session.id,
        status: "confirmed",
        source: "enrollment",
      });
      if (!error) created++;
    }
  }
  return created;
}
