import { supabaseAdmin } from "@/lib/supabase";

export type Db = ReturnType<typeof supabaseAdmin>;

// Wer ist für einen Termin gerade verantwortlich? Eine eingetragene
// Vertretung auf Terminebene gewinnt vor der Trainer:in des Kurses.
// Gibt null zurück, wenn niemand mit eigenem Konto zuständig ist.
export function responsibleTrainerId(session: any): string | null {
  return session?.trainer_id ?? (session?.course as any)?.trainer_id ?? null;
}

// Einheitliche Auswahl für Anfragen inkl. aller Daten, die beide
// Oberflächen (Trainer und Admin) für die Anzeige brauchen.
export const REQUEST_SELECT = `
  id, status, reason, created_at, claimed_at, decided_at, decided_by_name,
  requested_by, claimed_by,
  requester:trainers!substitute_requests_requested_by_fkey ( id, name ),
  claimer:trainers!substitute_requests_claimed_by_fkey ( id, name ),
  session:course_sessions (
    id, session_date, cancelled, trainer_id, instructor,
    course:courses ( id, name, level, room, start_time, duration_minutes, trainer_id )
  )
`;

// Bringt eine Anfrage in die flache Form, die beide Oberflächen erwarten.
export function shapeRequest(r: any) {
  const s = r.session ?? {};
  const c = s.course ?? {};
  return {
    id: r.id,
    status: r.status,
    reason: r.reason ?? "",
    createdAt: r.created_at,
    claimedAt: r.claimed_at,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name ?? null,
    requestedById: r.requested_by,
    requestedByName: r.requester?.name ?? "unbekannt",
    claimedById: r.claimed_by ?? null,
    claimedByName: r.claimer?.name ?? null,
    sessionId: s.id,
    date: s.session_date,
    sessionCancelled: !!s.cancelled,
    courseName: c.name ?? "Kurs",
    level: c.level ?? null,
    room: c.room ?? null,
    time: c.start_time ?? null,
    durationMinutes: c.duration_minutes ?? 70,
  };
}

// Datum von heute als YYYY-MM-DD (lokale Zeit des Servers).
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
