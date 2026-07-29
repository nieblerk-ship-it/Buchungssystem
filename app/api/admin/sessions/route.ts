import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

// PATCH /api/admin/sessions
// body: { sessionId, cancelled?, capacity_override? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { sessionId, cancelled, capacity_override } = body;
  if (!sessionId) return NextResponse.json({ error: "Termin-ID fehlt." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (typeof cancelled === "boolean") fields.cancelled = cancelled;
  if (capacity_override !== undefined) fields.capacity_override = capacity_override;

  const db = supabaseAdmin();
  const { error } = await db.from("course_sessions").update(fields).eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (typeof cancelled === "boolean") {
    await logAction(admin, cancelled ? "cancel" : "reactivate", "session", sessionId, cancelled ? "Termin abgesagt" : "Termin wieder aktiviert");
  }
  return NextResponse.json({ ok: true });
}
