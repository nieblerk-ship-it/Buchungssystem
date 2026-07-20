import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/courses
// Liefert alle künftigen Kurstermine inkl. Kursdaten und freier Plätze.
export async function GET() {
  const db = supabaseAdmin();

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( id, name, category, level, instructor, start_time, duration_minutes, capacity, notes, active )`
    )
    .gte("session_date", new Date().toISOString().slice(0, 10))
    .eq("cancelled", false)
    .order("session_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: bookings } = await db
    .from("bookings")
    .select("course_session_id")
    .in("course_session_id", sessionIds)
    .eq("status", "confirmed");

  const bookedCount: Record<string, number> = {};
  (bookings ?? []).forEach((b) => {
    if (!b.course_session_id) return;
    bookedCount[b.course_session_id] = (bookedCount[b.course_session_id] ?? 0) + 1;
  });

  const result = (sessions ?? [])
    .filter((s) => (s.course as any)?.active !== false)
    .map((s) => ({
      ...s,
      booked: bookedCount[s.id] ?? 0,
      capacity: s.capacity_override ?? (s.course as any)?.capacity,
    }));

  return NextResponse.json({ sessions: result });
}
