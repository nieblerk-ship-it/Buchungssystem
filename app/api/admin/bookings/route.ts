import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/bookings?password=...
// Liefert Termine der letzten 60 Tage bis unbegrenzt in die Zukunft (damit
// auch die Anwesenheit vergangener Termine noch nachgetragen werden kann),
// inkl. Teilnehmer:innen: ob ein aktives, passendes Produkt vorliegt (nur
// Hinweis), welche aktiven Produkte zur Auswahl stehen, ob die Buchung aus
// einer festen Zuteilung stammt, Raum des Kurses und Anwesenheitsstatus.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const db = supabaseAdmin();
  const from = new Date();
  from.setDate(from.getDate() - 60);

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( name, level, category, room, start_time, capacity ),
       bookings ( id, status, notes, source, customer_product_id, attended, customer:customers ( id, name, email ) )`
    )
    .gte("session_date", from.toISOString().slice(0, 10))
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
        .select("id, customer_id, valid_from, valid_until, active, product:products(name, category, allowed_categories)")
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

  function productsFor(customerId: string) {
    return (customerProducts ?? [])
      .filter((cp: any) => cp.customer_id === customerId)
      .map((cp: any) => ({ id: cp.id, name: cp.product?.name }));
  }

  const result = (sessions ?? []).map((s: any) => ({
    id: s.id,
    date: s.session_date,
    cancelled: s.cancelled,
    courseName: s.course?.name,
    level: s.course?.level,
    time: s.course?.start_time,
    room: s.course?.room,
    capacity: s.capacity_override ?? s.course?.capacity,
    participants: (s.bookings ?? [])
      .filter((b: any) => b.status === "confirmed")
      .map((b: any) => ({
        bookingId: b.id,
        name: b.customer?.name,
        email: b.customer?.email,
        notes: b.notes ?? "",
        source: b.source ?? "self",
        customerProductId: b.customer_product_id,
        attended: b.attended,
        availableProducts: b.customer?.id ? productsFor(b.customer.id) : [],
        hasActiveProduct: b.customer?.id
          ? hasActiveProduct(b.customer.id, s.course?.category, s.session_date)
          : false,
      })),
  }));

  return NextResponse.json({ sessions: result });
}

// PATCH /api/admin/bookings
// body: { password, bookingId, notes?, customerProductId?, attended? }
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { bookingId, notes, customerProductId, attended } = body;
  if (!bookingId) return NextResponse.json({ error: "Buchungs-ID fehlt." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (notes !== undefined) fields.notes = notes || null;
  if (customerProductId !== undefined) fields.customer_product_id = customerProductId || null;
  if (attended !== undefined) fields.attended = attended;

  const db = supabaseAdmin();
  const { error } = await db.from("bookings").update(fields).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
