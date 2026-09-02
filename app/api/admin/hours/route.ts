import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { collectHours, toHours, currentMonthRange } from "@/lib/hours";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/hours?from=&to=&trainerId=
// Stundenliste je Trainer:in für einen Zeitraum. Ohne Datumsangabe wird der
// laufende Monat ausgewertet.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const fallback = currentMonthRange();
  const from = url.searchParams.get("from") || fallback.from;
  const to = url.searchParams.get("to") || fallback.to;
  const trainerId = url.searchParams.get("trainerId") || null;

  if (to < from) {
    return NextResponse.json({ error: "Das Enddatum liegt vor dem Startdatum." }, { status: 400 });
  }

  const db = supabaseAdmin();
  try {
    const groups = await collectHours(db, from, to, trainerId);
    return NextResponse.json({
      from,
      to,
      groups: groups.map((g) => ({ ...g, hours: toHours(g.minutes) })),
      totals: {
        sessionCount: groups.reduce((n, g) => n + g.sessionCount, 0),
        hours: toHours(groups.reduce((n, g) => n + g.minutes, 0)),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Fehler beim Auswerten." }, { status: 500 });
  }
}
