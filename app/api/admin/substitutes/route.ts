import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { REQUEST_SELECT, shapeRequest } from "@/lib/substitutes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/substitutes
// Liefert alle Vertretungsanfragen, neueste zuerst — offene und erledigte.
// Die Oberfläche filtert daraus, was sie zeigen will.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("substitute_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: (data ?? []).map(shapeRequest) });
}

// PATCH /api/admin/substitutes
// body: { id, action: 'confirm' | 'reject' | 'cancel' }
//
// confirm – Übernahme bestätigen. Erst hier wird die Vertretung wirksam:
//           sie wird als Trainer:in dieses einen Termins eingetragen, exakt
//           so wie bei "Trainer:in ändern -> nur dieser Termin". Dadurch
//           greift alles Bestehende automatisch — die Vertretung sieht den
//           Termin in ihrem Bereich und kann die Anwesenheit erfassen.
// reject  – Übernahme ablehnen, die Anfrage ist wieder offen für andere.
// cancel  – ganze Anfrage schließen (z.B. weil du die Vertretung anders geregelt hast).
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { id, action } = await req.json();
  if (!id || !["confirm", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: reqRow } = await db
    .from("substitute_requests")
    .select(`id, status, claimed_by, course_session_id,
             claimer:trainers!substitute_requests_claimed_by_fkey ( name ),
             session:course_sessions ( session_date, course:courses ( name ) )`)
    .eq("id", id)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: "Anfrage nicht gefunden." }, { status: 404 });

  const label = `"${((reqRow.session as any)?.course as any)?.name ?? "Kurs"}" am ${(reqRow.session as any)?.session_date}`;
  const now = new Date().toISOString();

  if (action === "confirm") {
    if (reqRow.status !== "claimed" || !reqRow.claimed_by) {
      return NextResponse.json({ error: "Für diese Anfrage hat sich noch niemand eingetragen." }, { status: 409 });
    }

    // Die eigentliche Vertretung setzen — gleicher Weg wie beim manuellen
    // Eintragen über "Trainer:in ändern".
    const { error: sessErr } = await db
      .from("course_sessions")
      .update({ trainer_id: reqRow.claimed_by, instructor: null })
      .eq("id", reqRow.course_session_id);
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

    const { error } = await db
      .from("substitute_requests")
      .update({ status: "confirmed", decided_by_name: admin.name, decided_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const who = (reqRow.claimer as any)?.name ?? "Vertretung";
    await logAction(admin, "substitute-confirm", "session", reqRow.course_session_id,
      `Vertretung bestätigt: ${who} übernimmt ${label}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (reqRow.status !== "claimed") {
      return NextResponse.json({ error: "Für diese Anfrage gibt es keine Übernahme zum Ablehnen." }, { status: 409 });
    }
    const { error } = await db
      .from("substitute_requests")
      .update({ status: "open", claimed_by: null, claimed_at: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const who = (reqRow.claimer as any)?.name ?? "Vertretung";
    await logAction(admin, "substitute-reject", "session", reqRow.course_session_id,
      `Übernahme durch ${who} abgelehnt, ${label} ist wieder offen`);
    return NextResponse.json({ ok: true });
  }

  // cancel
  if (!["open", "claimed"].includes(reqRow.status)) {
    return NextResponse.json({ error: "Diese Anfrage ist bereits abgeschlossen." }, { status: 409 });
  }
  const { error } = await db
    .from("substitute_requests")
    .update({ status: "cancelled", decided_by_name: admin.name, decided_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "substitute-cancel", "session", reqRow.course_session_id,
    `Vertretungsanfrage für ${label} geschlossen`);
  return NextResponse.json({ ok: true });
}
