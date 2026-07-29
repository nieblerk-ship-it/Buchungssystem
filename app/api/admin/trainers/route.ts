import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

// GET /api/admin/trainers
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("trainers").select("id, name, email, active, created_at").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trainers: data });
}

// POST /api/admin/trainers
// body: { name, email, newPassword }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { name, email, newPassword } = body;
  if (!name?.trim() || !email?.trim() || !newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "Bitte Name, E-Mail und ein Passwort mit mind. 6 Zeichen angeben." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { data, error } = await db
    .from("trainers")
    .insert({ name: name.trim(), email: email.trim().toLowerCase(), password_hash })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "create", "trainer", data.id, `Trainer-Konto "${name.trim()}" angelegt`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/trainers
// body: { id, name?, email?, active?, newPassword? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, newPassword, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Trainer-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const updateFields: Record<string, unknown> = { ...fields };
  let passwordReset = false;
  if (newPassword) {
    if (newPassword.length < 6) return NextResponse.json({ error: "Passwort muss mind. 6 Zeichen haben." }, { status: 400 });
    updateFields.password_hash = await bcrypt.hash(newPassword, 10);
    passwordReset = true;
  }
  const { error } = await db.from("trainers").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (passwordReset) {
    await logAction(admin, "reset-password", "trainer", id, "Passwort zurückgesetzt");
  }
  if (fields.active !== undefined) {
    await logAction(admin, fields.active ? "activate" : "deactivate", "trainer", id, fields.active ? "Trainer-Konto aktiviert" : "Trainer-Konto deaktiviert");
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/trainers?id=...
// Deaktiviert das Konto (soft delete) — Kurse behalten die Zuordnung,
// die Trainerin kann sich dann aber nicht mehr einloggen.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Trainer-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("trainers").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "deactivate", "trainer", id, "Trainer-Konto deaktiviert");
  return NextResponse.json({ ok: true });
}
