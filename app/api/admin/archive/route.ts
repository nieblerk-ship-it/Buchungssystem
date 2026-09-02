import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { ARCHIVE_BUCKET, MAX_SIZE, findDocuments, readFilter } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/archive?labelId=&trainerId=&from=&to=&search=
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  try {
    const documents = await findDocuments(db, readFilter(new URL(req.url)));
    return NextResponse.json({ documents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Fehler." }, { status: 500 });
  }
}

// POST /api/admin/archive  (multipart/form-data)
// Felder: file, title, description?, trainerId?, periodFrom?, periodTo?, labelIds? (JSON-Array)
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const title = (form.get("title") as string | null)?.trim();
  const description = (form.get("description") as string | null)?.trim() || null;
  const trainerId = (form.get("trainerId") as string | null) || null;
  const periodFrom = (form.get("periodFrom") as string | null) || null;
  const periodTo = (form.get("periodTo") as string | null) || null;
  let labelIds: string[] = [];
  try { labelIds = JSON.parse((form.get("labelIds") as string) || "[]"); } catch { labelIds = []; }

  if (!file || !title) {
    return NextResponse.json({ error: "Bitte Datei und Titel angeben." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Die Datei ist zu groß (maximal 25 MB)." }, { status: 400 });
  }
  if (periodFrom && periodTo && periodTo < periodFrom) {
    return NextResponse.json({ error: "Das Enddatum liegt vor dem Startdatum." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${new Date().getFullYear()}/${Date.now()}_${safeName}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from(ARCHIVE_BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });

  const { data, error } = await db
    .from("studio_documents")
    .insert({
      title,
      description,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      trainer_id: trainerId || null,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      uploaded_by_name: admin.name,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(ARCHIVE_BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (labelIds.length) {
    await db.from("studio_document_labels").insert(
      labelIds.map((labelId) => ({ document_id: data.id, label_id: labelId }))
    );
  }

  await logAction(admin, "upload", "studio_document", data.id, `Dokument "${title}" in die Ablage hochgeladen`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/archive
// body: { id, title?, description?, trainerId?, periodFrom?, periodTo?, labelIds? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { id, labelIds, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const mapped: Record<string, unknown> = {};
  if (fields.title !== undefined) {
    const clean = String(fields.title).trim();
    if (!clean) return NextResponse.json({ error: "Der Titel darf nicht leer sein." }, { status: 400 });
    mapped.title = clean;
  }
  if (fields.description !== undefined) mapped.description = fields.description || null;
  if (fields.trainerId !== undefined) mapped.trainer_id = fields.trainerId || null;
  if (fields.periodFrom !== undefined) mapped.period_from = fields.periodFrom || null;
  if (fields.periodTo !== undefined) mapped.period_to = fields.periodTo || null;

  const db = supabaseAdmin();
  if (Object.keys(mapped).length) {
    const { error } = await db.from("studio_documents").update(mapped).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Labels werden komplett ersetzt, nicht einzeln nachgepflegt.
  if (Array.isArray(labelIds)) {
    await db.from("studio_document_labels").delete().eq("document_id", id);
    if (labelIds.length) {
      await db.from("studio_document_labels").insert(
        labelIds.map((labelId: string) => ({ document_id: id, label_id: labelId }))
      );
    }
  }

  await logAction(admin, "update", "studio_document", id, `Dokument in der Ablage bearbeitet`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/archive?id=...
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: doc } = await db.from("studio_documents").select("storage_path, title").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });

  await db.storage.from(ARCHIVE_BUCKET).remove([doc.storage_path]);
  const { error } = await db.from("studio_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "delete", "studio_document", id, `Dokument "${doc.title}" aus der Ablage gelöscht`);
  return NextResponse.json({ ok: true });
}
