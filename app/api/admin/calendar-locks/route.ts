import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/calendar-locks
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("calendar_locks").select("*").order("start_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locks: data });
}

// POST /api/admin/calendar-locks
// body: { startDate, endDate, reason? }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { startDate, endDate, reason } = await req.json();
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Bitte Start- und Enddatum angeben." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "Das Enddatum liegt vor dem Startdatum." }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (endDate >= today) {
    return NextResponse.json({
      error: "Sperren sind nur für abgeschlossene Zeiträume gedacht. Das Enddatum muss vor dem heutigen Tag liegen.",
    }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("calendar_locks")
    .insert({
      start_date: startDate,
      end_date: endDate,
      reason: reason?.trim() || null,
      locked_by_admin_id: admin.id,
      locked_by_name: admin.name,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "lock", "calendar", data.id, `Kalender gesperrt: ${startDate} bis ${endDate}${reason?.trim() ? ` (${reason.trim()})` : ""}`);
  return NextResponse.json({ id: data.id });
}

// DELETE /api/admin/calendar-locks?id=...
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: lock } = await db.from("calendar_locks").select("start_date, end_date").eq("id", id).maybeSingle();
  const { error } = await db.from("calendar_locks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "unlock", "calendar", id, `Kalender-Sperre aufgehoben: ${lock?.start_date} bis ${lock?.end_date}`);
  return NextResponse.json({ ok: true });
}
