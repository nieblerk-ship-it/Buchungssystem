import { supabaseAdmin } from "@/lib/supabase";

export type Db = ReturnType<typeof supabaseAdmin>;

export const ARCHIVE_BUCKET = "studio-documents";
export const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export type ArchiveFilter = {
  labelId?: string | null;
  trainerId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

export function readFilter(url: URL): ArchiveFilter {
  return {
    labelId: url.searchParams.get("labelId"),
    trainerId: url.searchParams.get("trainerId"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    search: url.searchParams.get("search"),
  };
}

// Holt die gefilterten Dokumente. Wird von der Listenansicht, vom
// ZIP-Download und vom Einzeldownload genutzt, damit "was du siehst" und
// "was im ZIP landet" garantiert dieselbe Menge sind.
export async function findDocuments(db: Db, f: ArchiveFilter) {
  let query = db
    .from("studio_documents")
    .select(
      `id, title, description, storage_path, file_name, mime_type, file_size,
       trainer_id, period_from, period_to, uploaded_by_name, created_at,
       trainer:trainers ( id, name ),
       labels:studio_document_labels ( label:document_labels ( id, name, color ) )`
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (f.trainerId) query = query.eq("trainer_id", f.trainerId);

  // Zeitraumfilter: ein Dokument passt, wenn sich sein Zeitraum mit dem
  // gesuchten überschneidet. Dokumente ohne Zeitraum bleiben dabei außen vor —
  // sonst würde jede Monatsauswahl die gesamte zeitlose Ablage mitziehen.
  if (f.from) query = query.gte("period_to", f.from);
  if (f.to) query = query.lte("period_from", f.to);

  if (f.search) {
    const s = f.search.replace(/[%,]/g, " ");
    query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,file_name.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as any[];

  // Label-Filter erst hier, weil PostgREST bei einer Join-Tabelle sonst die
  // übrigen Labels des Dokuments aus dem Ergebnis werfen würde.
  if (f.labelId) {
    rows = rows.filter((d) => (d.labels ?? []).some((l: any) => l.label?.id === f.labelId));
  }

  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description ?? "",
    storagePath: d.storage_path,
    fileName: d.file_name,
    mimeType: d.mime_type,
    fileSize: d.file_size,
    trainerId: d.trainer_id,
    trainerName: d.trainer?.name ?? null,
    periodFrom: d.period_from,
    periodTo: d.period_to,
    uploadedByName: d.uploaded_by_name,
    createdAt: d.created_at,
    labels: (d.labels ?? []).map((l: any) => l.label).filter(Boolean),
  }));
}
