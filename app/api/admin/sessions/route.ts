import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function checkPassword(password: string | null) {
  return !!password && password === process.env.ADMIN_PASSWORD;
}

// PATCH /api/admin/sessions
// body: { password, sessionId, cancelled?, capacity_override? }
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { sessionId, cancelled, capacity_override } = body;
  if (!sessionId) return NextResponse.json({ error: "Termin-ID fehlt." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (typeof cancelled === "boolean") fields.cancelled = cancelled;
  if (capacity_override !== undefined) fields.capacity_override = capacity_override;

  const db = supabaseAdmin();
  const { error } = await db.from("course_sessions").update(fields).eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
