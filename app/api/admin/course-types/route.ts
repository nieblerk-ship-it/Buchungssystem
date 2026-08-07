import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

// GET /api/admin/course-types
// Liefert alle Kursbezeichnungen (z.B. "Beginner 2/3"), aus denen beim
// Anlegen eines Kurses ausgewählt werden kann.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("course_types").select("*").order("category").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courseTypes: data });
}

// POST /api/admin/course-types
// body: { name, category, default_level?, default_capacity?, default_duration_minutes? }
// Wird auch automatisch aufgerufen, wenn beim Kurs-Anlegen eine neue
// Bezeichnung manuell eingetragen wird.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { name, category, default_level, default_capacity, default_duration_minutes } = body;
  if (!name?.trim() || !category?.trim()) {
    return NextResponse.json({ error: "Bitte Bezeichnung und Kategorie angeben." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db.from("course_types").select("id").eq("name", name.trim()).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, existed: true });

  const { data, error } = await db
    .from("course_types")
    .insert({
      name: name.trim(),
      category: category.trim(),
      default_level: default_level?.trim() || null,
      default_capacity: default_capacity || 8,
      default_duration_minutes: default_duration_minutes || 70,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "create", "course_type", data.id, `Kursbezeichnung "${name.trim()}" angelegt`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/course-types
// body: { id, ...felder }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("course_types").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "update", "course_type", id, `Kursbezeichnung bearbeitet`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/course-types?id=...
// Deaktiviert eine Bezeichnung (soft delete) — bestehende Kurse behalten sie.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("course_types").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "deactivate", "course_type", id, "Kursbezeichnung deaktiviert");
  return NextResponse.json({ ok: true });
}
