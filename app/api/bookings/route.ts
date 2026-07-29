import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { canBookCourse } from "@/lib/eligibility";
import { statusForNewBooking } from "@/lib/waitlist";

// POST /api/bookings
// body: { courseSessionId: string, name: string, email: string }
// Legt Kund:in an (falls neu) und bucht sie für den Termin — direkt, solange
// noch Kapazität frei ist, sonst automatisch auf die Warteliste (nach
// Buchungszeitpunkt). Keine Zahlung, keine Bestätigungs-Mail (noch).
export async function POST(req: Request) {
  const db = supabaseAdmin();
  const { courseSessionId, name, email } = await req.json();

  if (!courseSessionId || !name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Bitte Name, E-Mail und Termin angeben." }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await db
    .from("course_sessions")
    .select("id, session_date, cancelled, capacity_override, course:courses(id, name, category, capacity)")
    .eq("id", courseSessionId)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  if (session.cancelled) {
    return NextResponse.json({ error: "Dieser Termin wurde abgesagt." }, { status: 409 });
  }

  const capacity = session.capacity_override ?? (session.course as any)?.capacity ?? 0;

  // Kund:in finden oder anlegen
  const { data: existing } = await db
    .from("customers")
    .select("id, archived_at")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  let customerId = existing?.id;
  if (existing?.archived_at) {
    // Person war archiviert, ist aber offensichtlich wieder aktiv -> wiederherstellen
    await db.from("customers").update({ archived_at: null }).eq("id", existing.id);
  }
  if (!customerId) {
    const { data: created, error: custErr } = await db
      .from("customers")
      .insert({ name: name.trim(), email: email.trim().toLowerCase() })
      .select("id")
      .single();
    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
    customerId = created.id;
  }

  // Doppelbuchung für denselben Termin verhindern (egal ob bestätigt oder auf Warteliste)
  const { data: dup } = await db
    .from("bookings")
    .select("id")
    .eq("course_session_id", courseSessionId)
    .eq("customer_id", customerId)
    .in("status", ["confirmed", "waitlisted"])
    .maybeSingle();

  if (dup) {
    return NextResponse.json({ error: "Du bist für diesen Termin bereits angemeldet." }, { status: 409 });
  }

  const eligibility = await canBookCourse(
    db,
    customerId,
    (session.course as any)?.id,
    (session.course as any)?.category,
    session.session_date
  );
  if (!eligibility.allowed) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  const status = await statusForNewBooking(db, courseSessionId, capacity);

  const { data: booking, error: bookingErr } = await db
    .from("bookings")
    .insert({ customer_id: customerId, course_session_id: courseSessionId, status, source: "self" })
    .select("id")
    .single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });

  return NextResponse.json({ bookingId: booking.id, courseName: (session.course as any)?.name, status });
}
