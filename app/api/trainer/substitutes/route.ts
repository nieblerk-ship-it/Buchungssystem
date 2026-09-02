import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTrainerSession, TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";
import { logTrainerAction } from "@/lib/auditLog";
import { REQUEST_SELECT, shapeRequest, responsibleTrainerId, todayStr } from "@/lib/substitutes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentTrainer() {
  const token = cookies().get(TRAINER_COOKIE_NAME)?.value;
  const trainerId = verifyTrainerSession(token);
  if (!trainerId) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("trainers").select("id, name").eq("id", trainerId).eq("active", true).maybeSingle();
  return data ?? null;
}

// GET /api/trainer/substitutes
// Liefert alle Anfragen ab heute: die eigenen (zum Nachsehen, ob schon jemand
// übernommen hat) und die offenen der anderen (zum Eintragen). Erledigte
// Anfragen der Vergangenheit werden nicht mitgeschickt — die Übersicht soll
// zeigen, was noch zu tun ist.
export async function GET() {
  const me = await currentTrainer();
  if (!me) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("substitute_requests")
    .select(REQUEST_SELECT)
    .in("status", ["open", "claimed", "confirmed"])
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = todayStr();
  const requests = (data ?? [])
    .map(shapeRequest)
    .filter((r) => r.date >= today)
    .filter((r) => r.status !== "confirmed" || r.requestedById === me.id || r.claimedById === me.id)
    .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));

  return NextResponse.json({ requests, me });
}

// POST /api/trainer/substitutes
// body: { sessionId, reason? }
// Meldet "Vertretung gesucht" für einen eigenen Termin.
export async function POST(req: Request) {
  const me = await currentTrainer();
  if (!me) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { sessionId, reason } = await req.json();
  if (!sessionId) return NextResponse.json({ error: "Termin fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: session } = await db
    .from("course_sessions")
    .select("id, session_date, cancelled, trainer_id, course:courses(name, trainer_id)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Termin nicht gefunden." }, { status: 404 });

  // Nur wer den Termin aktuell leitet, kann dafür eine Vertretung suchen.
  // Bei bereits eingetragener Vertretung ist das die Vertretung selbst.
  if (responsibleTrainerId(session) !== me.id) {
    return NextResponse.json({ error: "Für diesen Termin bist du nicht eingetragen." }, { status: 403 });
  }
  if (session.cancelled) {
    return NextResponse.json({ error: "Dieser Termin ist abgesagt — dafür braucht es keine Vertretung." }, { status: 409 });
  }
  if (session.session_date < todayStr()) {
    return NextResponse.json({ error: "Für vergangene Termine lässt sich keine Vertretung mehr suchen." }, { status: 409 });
  }

  const { data: existing } = await db
    .from("substitute_requests")
    .select("id")
    .eq("course_session_id", sessionId)
    .in("status", ["open", "claimed"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Für diesen Termin läuft bereits eine Anfrage." }, { status: 409 });
  }

  const { data: created, error } = await db
    .from("substitute_requests")
    .insert({ course_session_id: sessionId, requested_by: me.id, reason: reason?.trim() || null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTrainerAction(
    me.name, "substitute-request", "session", sessionId,
    `Vertretung gesucht für "${(session.course as any)?.name ?? "Kurs"}" am ${session.session_date}${reason?.trim() ? ` (${reason.trim()})` : ""}`
  );

  return NextResponse.json({ ok: true, id: created.id });
}

// PATCH /api/trainer/substitutes
// body: { id, action: 'claim' | 'unclaim' | 'cancel' }
//
// claim   – ich übernehme diesen Termin (wartet dann auf die Bestätigung
//           durch die Studioleitung, wird also noch NICHT wirksam)
// unclaim – ich ziehe meine Übernahme zurück, die Anfrage ist wieder offen
// cancel  – ich ziehe meine eigene Anfrage zurück (brauche doch keine Vertretung)
export async function PATCH(req: Request) {
  const me = await currentTrainer();
  if (!me) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { id, action } = await req.json();
  if (!id || !["claim", "unclaim", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: reqRow } = await db
    .from("substitute_requests")
    .select("id, status, requested_by, claimed_by, course_session_id, session:course_sessions(session_date, course:courses(name))")
    .eq("id", id)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: "Anfrage nicht gefunden." }, { status: 404 });

  const label = `"${((reqRow.session as any)?.course as any)?.name ?? "Kurs"}" am ${(reqRow.session as any)?.session_date}`;

  if (action === "claim") {
    if (reqRow.status !== "open") {
      return NextResponse.json({ error: "Diese Anfrage ist nicht mehr offen." }, { status: 409 });
    }
    if (reqRow.requested_by === me.id) {
      return NextResponse.json({ error: "Du kannst deine eigene Anfrage nicht übernehmen." }, { status: 409 });
    }
    const { error } = await db
      .from("substitute_requests")
      .update({ status: "claimed", claimed_by: me.id, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "open");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logTrainerAction(me.name, "substitute-claim", "session", reqRow.course_session_id,
      `Vertretung übernommen für ${label} — wartet auf Bestätigung`);
    return NextResponse.json({ ok: true });
  }

  if (action === "unclaim") {
    if (reqRow.status !== "claimed" || reqRow.claimed_by !== me.id) {
      return NextResponse.json({ error: "Du hast diese Vertretung nicht übernommen." }, { status: 403 });
    }
    const { error } = await db
      .from("substitute_requests")
      .update({ status: "open", claimed_by: null, claimed_at: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logTrainerAction(me.name, "substitute-unclaim", "session", reqRow.course_session_id,
      `Übernahme zurückgezogen für ${label}`);
    return NextResponse.json({ ok: true });
  }

  // cancel
  if (reqRow.requested_by !== me.id) {
    return NextResponse.json({ error: "Nur wer die Anfrage gestellt hat, kann sie zurückziehen." }, { status: 403 });
  }
  if (!["open", "claimed"].includes(reqRow.status)) {
    return NextResponse.json({ error: "Diese Anfrage ist bereits abgeschlossen." }, { status: 409 });
  }
  const { error } = await db
    .from("substitute_requests")
    .update({ status: "cancelled", decided_by_name: me.name, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logTrainerAction(me.name, "substitute-cancel", "session", reqRow.course_session_id,
    `Vertretungsanfrage zurückgezogen für ${label}`);
  return NextResponse.json({ ok: true });
}
