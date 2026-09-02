import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { ARCHIVE_BUCKET, findDocuments, readFilter } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_FILES = 200;
const MAX_TOTAL = 200 * 1024 * 1024; // 200 MB entpackt

// GET /api/admin/archive/zip?labelId=&trainerId=&from=&to=&search=
// Packt genau die Dokumente, die die Liste mit denselben Filtern zeigt.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const filter = readFilter(new URL(req.url));

  let docs;
  try {
    docs = await findDocuments(db, filter);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Fehler." }, { status: 500 });
  }

  if (docs.length === 0) {
    return NextResponse.json({ error: "Für diese Filter gibt es keine Dokumente." }, { status: 404 });
  }
  if (docs.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Zu viele Dokumente auf einmal (${docs.length}). Bitte enger filtern, maximal ${MAX_FILES}.` },
      { status: 400 }
    );
  }
  const totalSize = docs.reduce((n, d) => n + (d.fileSize ?? 0), 0);
  if (totalSize > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Die Auswahl ist zusammen zu groß (über 200 MB). Bitte enger filtern." },
      { status: 400 }
    );
  }

  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];

  for (const doc of docs) {
    const { data, error } = await db.storage.from(ARCHIVE_BUCKET).download(doc.storagePath);
    if (error || !data) { failed.push(doc.title); continue; }

    // Sprechender Dateiname: Zeitraum bzw. Uploaddatum vorne, damit die
    // Dateien im Ordner sinnvoll sortiert liegen.
    const prefix = doc.periodFrom ?? doc.createdAt.slice(0, 10);
    const base = `${prefix}_${doc.title}`.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 90);
    const ext = doc.fileName.includes(".") ? `.${doc.fileName.split(".").pop()}` : "";
    let name = `${base}${ext}`;
    let n = 2;
    while (used.has(name)) { name = `${base}_${n}${ext}`; n += 1; }
    used.add(name);

    zip.file(name, Buffer.from(await data.arrayBuffer()));
  }

  if (failed.length === docs.length) {
    return NextResponse.json({ error: "Keine der Dateien konnte gelesen werden." }, { status: 500 });
  }
  // Wenn einzelne Dateien fehlen, liegt eine Notiz im ZIP statt einer
  // stillschweigend unvollständigen Datei.
  if (failed.length) {
    zip.file("_FEHLENDE_DATEIEN.txt",
      `Diese Dokumente konnten nicht gelesen werden und fehlen im Archiv:\n\n${failed.join("\n")}\n`);
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });

  await logAction(admin, "export", "studio_document", null,
    `${docs.length - failed.length} Dokumente als ZIP heruntergeladen`);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ablage_${stamp}.zip"`,
    },
  });
}
