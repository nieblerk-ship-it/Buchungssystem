import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { ensureEnrollmentBookings } from "@/lib/enrollments";

// GET /api/admin/enrollments?customerId=...
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("enrollments")
    .select("id, valid_from, valid_until, active, notes, course:courses(id, name, category)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollments: data });
}

// POST /api/admin/enrollments
// body: { customerId, courseId, valid_from?, valid_until?, notes? }
// Trägt eine:n Schüler:in fest in einen Kurs ein und reiht sie/ihn in die
// normale Buchungs-/Wartelisten-Warteschlange für die passenden künftigen
// Termine ein.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { customerId, courseId, valid_from, valid_until, notes } = body;
  if (!customerId || !courseId) {
    return NextResponse.json({ error: "Schüler und Kurs müssen angegeben sein." }, { status: 400 });
  }
  const db = supabaseAdmin();

  // Eine Person kann demselben Kurs mehrfach zugeteilt sein, solange sich die
  // Zeiträume nicht überschneiden (z.B. Januar bis März und wieder ab Juni).
  // Überschneiden sie sich, ist es ein Versehen: doppelte Zuteilungen führen
  // zu doppelten Einträgen in Listen und beim Verschieben von Gruppen.
  const newFrom = valid_from || new Date().toISOString().slice(0, 10);
  const newUntil = valid_until || null;

  const { data: existingRows } = await db
    .from("enrollments")
    .select("id, valid_from, valid_until")
    .eq("customer_id", customerId)
    .eq("course_id", courseId)
    .eq("active", true);

  const overlapping = (existingRows ?? []).find((e: any) => {
    const existingFrom = e.valid_from ?? "0000-01-01";
    const existingUntil = e.valid_until ?? "9999-12-31";
    const untilForCheck = newUntil ?? "9999-12-31";
    return existingFrom <= untilForCheck && newFrom <= existingUntil;
  });

  if (overlapping) {
    const bis = overlapping.valid_until ? ` bis ${overlapping.valid_until}` : " ohne Enddatum";
    return NextResponse.json(
      {
        error: `Diese Person ist dem Kurs bereits fest zugeteilt (ab ${overlapping.valid_from}${bis}). Die bestehende Zuteilung lässt sich im Reiter Schüler:innen ändern oder beenden.`,
      },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("enrollments")
    .insert({
      customer_id: customerId,
      course_id: courseId,
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      valid_until: valid_until || null,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookedCount = await ensureEnrollmentBookings(db, courseId);

  // Hinweis, falls der Kurs kürzer läuft als der gewünschte Zeitraum
  let warning: string | null = null;
  if (valid_until) {
    const { data: lastSession } = await db
      .from("course_sessions")
      .select("session_date")
      .eq("course_id", courseId)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastSession?.session_date && lastSession.session_date < valid_until) {
      warning = `Hinweis: Der Kurs läuft nur bis zum ${lastSession.session_date}, der gewünschte Zeitraum reicht aber bis ${valid_until}. Die Person wurde bis zum Kursende eingetragen.`;
    }
  }

  await logAction(admin, "create", "enrollment", data.id, `Feste Zuteilung angelegt (Kurs-ID ${courseId}, ${bookedCount} Termine gebucht)`);
  return NextResponse.json({ id: data.id, bookedCount, warning });
}

// DELETE /api/admin/enrollments?id=...
// Deaktiviert die Zuteilung (bereits erzeugte Buchungen bleiben bestehen,
// können im Reiter "Anmeldungen" einzeln entfernt werden).
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("enrollments").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "end", "enrollment", id, "Feste Zuteilung beendet");
  return NextResponse.json({ ok: true });
}
