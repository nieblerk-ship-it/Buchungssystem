import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST /api/bookings
// body: { courseSessionId: string, name: string, email: string }
// Legt Kund:in an (falls neu) und bucht sie direkt für den Termin,
// sofern noch Platz frei ist. Keine Zahlung, keine Bestätigungs-Mail (noch).
export async function POST(req: Request) {
  const db = supabaseAdmin();
  const { courseSessionId, name, email } = await req.json();

  if (!courseSessionId || !name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Bitte Name, E-Mail und Termin angeben." }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await db
    .from("course_sessions")
    .select("id, cancelled, capacity_override, course:courses(name, capacity)")
    .eq("id", courseSessionId)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  if (session.cancelled) {
    return NextResponse.json({ error: "Dieser Termin wurde abgesagt." }, { status: 409 });
  }

  const capacity = session.capacity_override ?? (session.course as any)?.capacity ?? 0;
  const { count } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("course_session_id", courseSessionId)
    .eq("status", "confirmed");

  if ((count ?? 0) >= capacity) {
    return NextResponse.json({ error: "Dieser Termin ist bereits ausgebucht." }, { status: 409 });
  }

  // Kund:in finden oder anlegen
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  let customerId = existing?.id;
  if (!customerId) {
    const { data: created, error: custErr } = await db
      .from("customers")
      .insert({ name: name.trim(), email: email.trim().toLowerCase() })
      .select("id")
      .single();
    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
    customerId = created.id;
  }

  // Doppelbuchung für denselben Termin verhindern
  const { data: dup } = await db
    .from("bookings")
    .select("id")
    .eq("course_session_id", courseSessionId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .maybeSingle();

  if (dup) {
    return NextResponse.json({ error: "Du bist für diesen Termin bereits angemeldet." }, { status: 409 });
  }

  const { data: booking, error: bookingErr } = await db
    .from("bookings")
    .insert({ customer_id: customerId, course_session_id: courseSessionId, status: "confirmed" })
    .select("id")
    .single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });

  return NextResponse.json({ bookingId: booking.id, courseName: (session.course as any)?.name });
}
