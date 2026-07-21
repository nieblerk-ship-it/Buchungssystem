import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/trainers?password=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db.from("trainers").select("id, name, email, active, created_at").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trainers: data });
}

// POST /api/admin/trainers
// body: { password, name, email, newPassword }
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
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
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/trainers
// body: { password, id, name?, email?, active?, newPassword? }
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, password, newPassword, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Trainer-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const updateFields: Record<string, unknown> = { ...fields };
  if (newPassword) {
    if (newPassword.length < 6) return NextResponse.json({ error: "Passwort muss mind. 6 Zeichen haben." }, { status: 400 });
    updateFields.password_hash = await bcrypt.hash(newPassword, 10);
  }
  const { error } = await db.from("trainers").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/trainers?password=...&id=...
// Deaktiviert das Konto (soft delete) — Kurse behalten die Zuordnung,
// die Trainerin kann sich dann aber nicht mehr einloggen.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Trainer-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("trainers").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
