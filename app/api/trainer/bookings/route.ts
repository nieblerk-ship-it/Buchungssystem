import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { verifyTrainerSession, TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";

// GET /api/trainer/bookings
// Liefert Termine der letzten 60 Tage bis unbegrenzt in die Zukunft, aber NUR
// für Kurse, die dieser Trainerin als Trainer-Konto zugeordnet sind
// (courses.trainer_id). Anwesenheit kann über PATCH erfasst werden.
export async function GET() {
  const token = cookies().get(TRAINER_COOKIE_NAME)?.value;
  const trainerId = verifyTrainerSession(token);
  if (!trainerId) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();

  const { data: myCourses } = await db.from("courses").select("id").eq("trainer_id", trainerId);
  const courseIds = (myCourses ?? []).map((c) => c.id);
  if (courseIds.length === 0) return NextResponse.json({ sessions: [] });

  const from = new Date();
  from.setDate(from.getDate() - 60);

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( id, name, level, category, room, start_time, capacity ),
       bookings ( id, status, notes, source, attended, deleted_customer_name, deleted_customer_email, customer:customers ( name, email ) )`
    )
    .in("course_id", courseIds)
    .gte("session_date", from.toISOString().slice(0, 10))
    .order("session_date", { ascending: true })
    .limit(5000);

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
      .filter((b: any) => b.status === "confirmed" || b.status === "waitlisted")
      .map((b: any) => ({ bookingId: b.id, name: b.customer?.name ?? b.deleted_customer_name ?? "Unbekannt", email: b.customer?.email ?? b.deleted_customer_email ?? "", notes: b.notes ?? "", source: b.source ?? "self", status: b.status, attended: b.attended })),
  }));

  return NextResponse.json({ sessions: result });
}

// PATCH /api/trainer/bookings
// body: { bookingId, attended }
// Erfasst die Anwesenheit — nur für Buchungen, die zu einem eigenen Kurs gehören.
export async function PATCH(req: Request) {
  const token = cookies().get(TRAINER_COOKIE_NAME)?.value;
  const trainerId = verifyTrainerSession(token);
  if (!trainerId) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { bookingId, attended } = await req.json();
  if (!bookingId) return NextResponse.json({ error: "Buchungs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();

  // Sicherstellen, dass die Buchung wirklich zu einem eigenen Kurs gehört,
  // bevor etwas verändert wird.
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, course_session:course_sessions(course:courses(trainer_id))")
    .eq("id", bookingId)
    .maybeSingle();

  const ownerTrainerId = (booking?.course_session as any)?.course?.trainer_id;
  if (!booking || ownerTrainerId !== trainerId) {
    return NextResponse.json({ error: "Diese Buchung gehört nicht zu einem deiner Kurse." }, { status: 403 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "Anwesenheit kann nur für bestätigte Buchungen erfasst werden." }, { status: 409 });
  }

  const { error } = await db.from("bookings").update({ attended }).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
