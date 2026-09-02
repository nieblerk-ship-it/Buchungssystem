import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { ARCHIVE_BUCKET } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/archive/link?id=...
// Signierter Link mit 60 Sekunden Gültigkeit — dieselbe Logik wie bei den
// Schülerdokumenten. Der Bucket ist privat, nichts ist öffentlich abrufbar.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: doc } = await db.from("studio_documents").select("storage_path").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });

  const { data, error } = await db.storage.from(ARCHIVE_BUCKET).createSignedUrl(doc.storage_path, 60);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Link konnte nicht erstellt werden." }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
