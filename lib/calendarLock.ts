import { supabaseAdmin } from "@/lib/supabase";

// Prüft, ob ein bestimmtes Datum in einem gesperrten Zeitraum liegt.
export async function isDateLocked(db: ReturnType<typeof supabaseAdmin>, date: string): Promise<boolean> {
  const { data } = await db
    .from("calendar_locks")
    .select("id")
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// Prüft, ob der Termin zu einer Buchung in einem gesperrten Zeitraum liegt.
export async function isBookingLocked(db: ReturnType<typeof supabaseAdmin>, bookingId: string): Promise<boolean> {
  const { data: booking } = await db
    .from("bookings")
    .select("course_session:course_sessions(session_date)")
    .eq("id", bookingId)
    .maybeSingle();
  const date = (booking?.course_session as any)?.session_date;
  if (!date) return false;
  return isDateLocked(db, date);
}

export async function isSessionLocked(db: ReturnType<typeof supabaseAdmin>, sessionId: string): Promise<boolean> {
  const { data: session } = await db
    .from("course_sessions")
    .select("session_date")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.session_date) return false;
  return isDateLocked(db, session.session_date);
}

export const LOCK_MESSAGE =
  "Dieser Zeitraum ist gesperrt. Änderungen an bereits abgeschlossenen Terminen sind nicht mehr möglich — die Sperre muss zuerst im Reiter \"Kalender-Sperren\" aufgehoben werden.";

// Liefert alle gesperrten Zeiträume (für die Anzeige im Kalender).
export async function getLocks(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db.from("calendar_locks").select("*").order("start_date", { ascending: false });
  return data ?? [];
}
