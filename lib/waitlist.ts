import { supabaseAdmin } from "@/lib/supabase";

// Rückt so viele Personen von der Warteliste nach, wie durch die aktuelle
// Kapazität gedeckt sind (normalerweise eine, kann aber mehr sein, falls
// die Kapazität nachträglich erhöht wurde). Reihenfolge: wer zuerst auf der
// Warteliste stand (created_at), rückt zuerst nach.
export async function promoteFromWaitlist(db: ReturnType<typeof supabaseAdmin>, sessionId: string) {
  const { data: session } = await db
    .from("course_sessions")
    .select("capacity_override, course:courses(capacity)")
    .eq("id", sessionId)
    .single();
  if (!session) return;
  const capacity = session.capacity_override ?? (session.course as any)?.capacity ?? 0;

  let promoted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { count: confirmedCount } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("course_session_id", sessionId)
      .eq("status", "confirmed");

    if ((confirmedCount ?? 0) >= capacity) break;

    const { data: nextInLine } = await db
      .from("bookings")
      .select("id")
      .eq("course_session_id", sessionId)
      .eq("status", "waitlisted")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextInLine) break;

    await db.from("bookings").update({ status: "confirmed" }).eq("id", nextInLine.id);
    promoted++;
    if (promoted > 200) break; // Sicherheitsnetz gegen Endlosschleifen
  }
  return promoted;
}

// Ermittelt den Status, den eine NEUE Buchung für diesen Termin bekommen soll:
// 'confirmed' solange noch Kapazität frei ist, sonst 'waitlisted'.
export async function statusForNewBooking(db: ReturnType<typeof supabaseAdmin>, sessionId: string, capacity: number) {
  const { count: confirmedCount } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("course_session_id", sessionId)
    .eq("status", "confirmed");
  return (confirmedCount ?? 0) < capacity ? "confirmed" : "waitlisted";
}
