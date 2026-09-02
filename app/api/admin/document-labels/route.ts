import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/document-labels
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("document_labels").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ labels: data ?? [] });
}

// POST /api/admin/document-labels   body: { name, color }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { name, color } = await req.json();
  const clean = (name ?? "").trim();
  if (!clean) return NextResponse.json({ error: "Bitte einen Namen angeben." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("document_labels")
    .insert({ name: clean, color: color || "#C9A227" })
    .select("id")
    .single();
  if (error) {
    const msg = error.code === "23505" ? "Dieses Label gibt es schon." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  await logAction(admin, "create", "document_label", data.id, `Label "${clean}" angelegt`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/document-labels   body: { id, name?, color? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { id, name, color } = await req.json();
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return NextResponse.json({ error: "Der Name darf nicht leer sein." }, { status: 400 });
    fields.name = clean;
  }
  if (color !== undefined) fields.color = color;

  const db = supabaseAdmin();
  const { error } = await db.from("document_labels").update(fields).eq("id", id);
  if (error) {
    const msg = error.code === "23505" ? "Dieses Label gibt es schon." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  await logAction(admin, "update", "document_label", id, `Label bearbeitet: ${fields.name ?? ""}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/document-labels?id=...
// Das Label verschwindet auch von allen Dokumenten, die es tragen — die
// Dokumente selbst bleiben unangetastet.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: label } = await db.from("document_labels").select("name").eq("id", id).maybeSingle();
  const { count } = await db
    .from("studio_document_labels")
    .select("*", { count: "exact", head: true })
    .eq("label_id", id);

  const { error } = await db.from("document_labels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "delete", "document_label", id,
    `Label "${label?.name ?? id}" gelöscht${count ? ` (war an ${count} Dokumenten)` : ""}`);
  return NextResponse.json({ ok: true });
}
