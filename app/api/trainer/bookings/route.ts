import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTrainerSession, TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";

// GET /api/trainer/bookings
// Liefert künftige Termine, aber NUR für Kurse, die dieser Trainerin als
// Trainer-Konto zugeordnet sind (courses.trainer_id). Rein lesend — Trainer:innen
// können hier (noch) nichts ändern, das kommt mit der Anwesenheits-Checkliste.
export async function GET() {
  const token = cookies().get(TRAINER_COOKIE_NAME)?.value;
  const trainerId = verifyTrainerSession(token);
  if (!trainerId) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();

  const { data: myCourses } = await db.from("courses").select("id").eq("trainer_id", trainerId);
  const courseIds = (myCourses ?? []).map((c) => c.id);
  if (courseIds.length === 0) return NextResponse.json({ sessions: [] });

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( id, name, level, category, room, start_time, capacity ),
       bookings ( id, status, notes, source, customer:customers ( name, email ) )`
    )
    .in("course_id", courseIds)
    .gte("session_date", new Date().toISOString().slice(0, 10))
    .order("session_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (sessions ?? []).map((s: any) => ({
    id: s.id,
    date: s.session_date,
    cancelled: s.cancelled,
    courseName: s.course?.name,
    level: s.course?.level,
    room: s.course?.room,
    time: s.course?.start_time,
    capacity: s.capacity_override ?? s.course?.capacity,
    participants: (s.bookings ?? [])
      .filter((b: any) => b.status === "confirmed")
      .map((b: any) => ({ name: b.customer?.name, email: b.customer?.email, notes: b.notes ?? "", source: b.source ?? "self" })),
  }));

  return NextResponse.json({ sessions: result });
}
