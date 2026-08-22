import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/settings
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("studio_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

// PATCH /api/admin/settings
// body: { default_capacity?, default_duration_minutes?, default_room?, default_category? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.default_capacity !== undefined) fields.default_capacity = body.default_capacity;
  if (body.default_duration_minutes !== undefined) fields.default_duration_minutes = body.default_duration_minutes;
  if (body.default_room !== undefined) fields.default_room = body.default_room || null;
  if (body.default_category !== undefined) fields.default_category = body.default_category;

  const db = supabaseAdmin();
  const { error } = await db.from("studio_settings").update(fields).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "update", "settings", "1", `Standardeinstellungen geändert: ${JSON.stringify(body)}`);
  return NextResponse.json({ ok: true });
}
