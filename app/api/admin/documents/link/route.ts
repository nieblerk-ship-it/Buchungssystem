import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/documents/link?id=...
// Erzeugt einen signierten Link, der 60 Sekunden gültig ist. Die Dateien
// liegen in einem privaten Bucket und sind nie öffentlich abrufbar.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: doc } = await db.from("customer_documents").select("storage_path").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });

  const { data, error } = await db.storage.from("customer-documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Link konnte nicht erstellt werden." }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}
