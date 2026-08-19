import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { isDateLocked, LOCK_MESSAGE } from "@/lib/calendarLock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/admin/sessions/trainer
// body: { sessionId, trainerId, instructor?, mode: 'single'|'range', rangeEnd? }
//
// mode='single': Vertretung nur für diesen einen Termin
// mode='range' : Vertretung von diesem Termin bis einschließlich rangeEnd
//
// Eine dauerhafte Übernahme wird NICHT hier abgebildet, sondern über die
// Kursbearbeitung (Split ab Stichtag) — dadurch bleibt dokumentiert, ab wann
// der Kurs offiziell zu einer anderen Trainerin gehört.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { sessionId, trainerId, instructor, mode, rangeEnd } = await req.json();
  if (!sessionId) return NextResponse.json({ error: "Termin fehlt." }, { status: 400 });
  if (!["single", "range"].includes(mode)) {
    return NextResponse.json({ error: "Bitte angeben, für welchen Zeitraum die Vertretung gilt." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: session } = await db
    .from("course_sessions")
    .select("id, session_date, course_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Termin nicht gefunden." }, { status: 404 });

  if (await isDateLocked(db, session.session_date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const fields = {
    trainer_id: trainerId || null,
    instructor: instructor?.trim() || null,
  };

  let affected = 1;
  if (mode === "single") {
    const { error } = await db.from("course_sessions").update(fields).eq("id", sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (!rangeEnd) return NextResponse.json({ error: "Bitte ein Enddatum für die Vertretung angeben." }, { status: 400 });
    if (rangeEnd < session.session_date) {
      return NextResponse.json({ error: "Das Enddatum liegt vor dem gewählten Termin." }, { status: 400 });
    }
    const { data: affectedRows, error } = await db
      .from("course_sessions")
      .update(fields)
      .eq("course_id", session.course_id)
      .gte("session_date", session.session_date)
      .lte("session_date", rangeEnd)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    affected = affectedRows?.length ?? 0;
  }

  const { data: trainer } = trainerId
    ? await db.from("trainers").select("name").eq("id", trainerId).maybeSingle()
    : { data: null };
  const who = trainer?.name ?? instructor?.trim() ?? "Standard-Trainer:in des Kurses";

  await logAction(
    admin, "substitute", "session", sessionId,
    mode === "single"
      ? `Vertretung am ${session.session_date}: ${who}`
      : `Vertretung von ${session.session_date} bis ${rangeEnd}: ${who} (${affected} Termine)`
  );

  return NextResponse.json({ ok: true, affected });
}

// DELETE /api/admin/sessions/trainer?sessionId=...
// Hebt die Vertretung für einen Termin auf — es gilt wieder der Kurs-Trainer.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Termin fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: session } = await db.from("course_sessions").select("session_date").eq("id", sessionId).maybeSingle();
  if (session && await isDateLocked(db, session.session_date)) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 423 });
  }

  const { error } = await db.from("course_sessions").update({ trainer_id: null, instructor: null }).eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "substitute-remove", "session", sessionId, "Vertretung aufgehoben");
  return NextResponse.json({ ok: true });
}
