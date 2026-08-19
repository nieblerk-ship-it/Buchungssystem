import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "customer-documents";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

// GET /api/admin/documents?customerId=...
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customer_documents")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

// POST /api/admin/documents  (multipart/form-data)
// Felder: file, customerId, title, docType?, validFrom?, validUntil?, notes?
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const customerId = form.get("customerId") as string | null;
  const title = (form.get("title") as string | null)?.trim();
  const docType = (form.get("docType") as string | null)?.trim() || null;
  const validFrom = (form.get("validFrom") as string | null) || null;
  const validUntil = (form.get("validUntil") as string | null) || null;
  const notes = (form.get("notes") as string | null)?.trim() || null;

  if (!file || !customerId || !title) {
    return NextResponse.json({ error: "Bitte Datei, Schüler:in und Titel angeben." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Die Datei ist zu groß (maximal 10 MB)." }, { status: 400 });
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Nur PDF- oder Bilddateien (JPG, PNG, WEBP, HEIC) sind erlaubt." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${customerId}/${Date.now()}_${safeName}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });

  const { data, error } = await db
    .from("customer_documents")
    .insert({
      customer_id: customerId,
      title,
      doc_type: docType,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      notes,
      uploaded_by_name: admin.name,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(admin, "upload", "document", data.id, `Dokument "${title}" hochgeladen${validUntil ? ` (gültig bis ${validUntil})` : ""}`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/documents
// body: { id, title?, docType?, validFrom?, validUntil?, notes? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const mapped: Record<string, unknown> = {};
  if (fields.title !== undefined) mapped.title = fields.title;
  if (fields.docType !== undefined) mapped.doc_type = fields.docType || null;
  if (fields.validFrom !== undefined) mapped.valid_from = fields.validFrom || null;
  if (fields.validUntil !== undefined) mapped.valid_until = fields.validUntil || null;
  if (fields.notes !== undefined) mapped.notes = fields.notes || null;

  const db = supabaseAdmin();
  const { error } = await db.from("customer_documents").update(mapped).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "update", "document", id, `Dokument bearbeitet: ${JSON.stringify(mapped)}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/documents?id=...
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: doc } = await db.from("customer_documents").select("storage_path, title").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });

  await db.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await db.from("customer_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "delete", "document", id, `Dokument "${doc.title}" gelöscht`);
  return NextResponse.json({ ok: true });
}
