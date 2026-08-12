import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Niemals zwischenspeichern: neu angelegte Kurse und Änderungen müssen sofort
// auf der Buchungsseite sichtbar sein.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/courses
// Liefert alle künftigen Kurstermine inkl. Kursdaten und freier Plätze.
export async function GET() {
  const db = supabaseAdmin();

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( id, name, category, level, instructor, start_time, duration_minutes, capacity, notes, active, ended_on, course_type_id )`
    )
    .gte("session_date", new Date().toISOString().slice(0, 10))
    .eq("cancelled", false)
    .order("session_date", { ascending: true })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: bookings } = sessionIds.length
    ? await db
        .from("bookings")
        .select("course_session_id, status")
        .in("course_session_id", sessionIds)
        .in("status", ["confirmed", "waitlisted"])
        .limit(20000)
    : { data: [] as any[] };

  const bookedCount: Record<string, number> = {};
  const waitlistCount: Record<string, number> = {};
  (bookings ?? []).forEach((b) => {
    if (!b.course_session_id) return;
    if (b.status === "confirmed") bookedCount[b.course_session_id] = (bookedCount[b.course_session_id] ?? 0) + 1;
    if (b.status === "waitlisted") waitlistCount[b.course_session_id] = (waitlistCount[b.course_session_id] ?? 0) + 1;
  });

  const result = (sessions ?? [])
    .filter((s) => { const e = (s.course as any)?.ended_on; return !e || s.session_date <= e; })
    .map((s) => ({
      ...s,
      booked: bookedCount[s.id] ?? 0,
      waitlisted: waitlistCount[s.id] ?? 0,
      capacity: s.capacity_override ?? (s.course as any)?.capacity,
    }));

  return NextResponse.json({ sessions: result });
}
