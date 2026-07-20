import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/bookings?password=...
// Liefert künftige Termine inkl. Teilnehmer:innen. Markiert pro Teilnehmer:in,
// ob am Termindatum ein aktives, zur Kurskategorie passendes Produkt vorliegt
// (Punkt 3: nur Hinweis, keine Blockierung).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( name, level, category, start_time, capacity ),
       bookings ( id, status, notes, customer:customers ( id, name, email ) )`
    )
    .gte("session_date", new Date().toISOString().slice(0, 10))
    .order("session_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customerIds = Array.from(
    new Set(
      (sessions ?? []).flatMap((s: any) => (s.bookings ?? []).map((b: any) => b.customer?.id).filter(Boolean))
    )
  );

  const { data: customerProducts } = customerIds.length
    ? await db
        .from("customer_products")
        .select("customer_id, valid_from, valid_until, active, product:products(category, allowed_categories)")
        .in("customer_id", customerIds)
        .eq("active", true)
    : { data: [] as any[] };

  function hasActiveProduct(customerId: string, courseCategory: string, sessionDate: string) {
    return (customerProducts ?? []).some((cp: any) => {
      if (cp.customer_id !== customerId) return false;
      if (cp.valid_from && sessionDate < cp.valid_from) return false;
      if (cp.valid_until && sessionDate > cp.valid_until) return false;
      const allowed = cp.product?.allowed_categories;
      if (!allowed || allowed.length === 0) return true;
      return allowed.includes(courseCategory);
    });
  }

  const result = (sessions ?? []).map((s: any) => ({
    id: s.id,
    date: s.session_date,
    cancelled: s.cancelled,
    courseName: s.course?.name,
    level: s.course?.level,
    time: s.course?.start_time,
    capacity: s.capacity_override ?? s.course?.capacity,
    participants: (s.bookings ?? [])
      .filter((b: any) => b.status === "confirmed")
      .map((b: any) => ({
        bookingId: b.id,
        name: b.customer?.name,
        email: b.customer?.email,
        notes: b.notes ?? "",
        hasActiveProduct: b.customer?.id
          ? hasActiveProduct(b.customer.id, s.course?.category, s.session_date)
          : false,
      })),
  }));

  return NextResponse.json({ sessions: result });
}

// PATCH /api/admin/bookings
// body: { password, bookingId, notes }
// Freitext-Kommentar zu einer Buchung, z.B. "Zahlung fehlt noch".
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { bookingId, notes } = body;
  if (!bookingId) return NextResponse.json({ error: "Buchungs-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("bookings").update({ notes: notes ?? null }).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
