import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { promoteFromWaitlist } from "@/lib/waitlist";

// GET /api/admin/bookings
// Liefert Termine der letzten 60 Tage bis unbegrenzt in die Zukunft (damit
// auch die Anwesenheit vergangener Termine noch nachgetragen werden kann),
// inkl. Teilnehmer:innen (bestätigt UND Warteliste): ob ein aktives, passendes
// Produkt vorliegt (nur Hinweis), welche aktiven Produkte zur Auswahl stehen,
// ob die Buchung aus einer festen Zuteilung stammt, Raum des Kurses und
// Anwesenheitsstatus.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const from = new Date();
  from.setDate(from.getDate() - 60);

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override, trainer_id, instructor,
       trainer:trainers ( id, name ),
       course:courses ( id, name, level, category, room, start_time, duration_minutes, capacity, active, ended_on, end_date, weekday, is_single, course_type_id, trainer_id,
         trainer:trainers ( id, name ),
         course_type:course_types ( id, name, trainer_required ) ),
       bookings ( id, status, notes, source, customer_product_id, attended, created_at, deleted_customer_name, deleted_customer_email, customer:customers ( id, name, email ) )`
    )
    .gte("session_date", from.toISOString().slice(0, 10))
    .order("session_date", { ascending: true })
    .limit(5000);

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

  const result = (sessions ?? []).map((s: any) => {
    const relevant = (s.bookings ?? [])
      .filter((b: any) => b.status === "confirmed" || b.status === "waitlisted")
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1));
    return {
      id: s.id,
      date: s.session_date,
      cancelled: s.cancelled,
      courseId: s.course?.id,
      courseName: s.course?.name,
      courseActive: !s.course?.ended_on || s.session_date <= s.course.ended_on,
      courseEndedOn: s.course?.ended_on ?? null,
      courseEndDate: s.course?.end_date ?? null,
      courseWeekday: s.course?.weekday ?? null,
      courseIsSingle: s.course?.is_single ?? false,
      courseTypeId: s.course?.course_type_id ?? null,
      courseLevel: s.course?.level ?? null,
      courseCategory: s.course?.category ?? null,
      courseInstructor: s.course?.instructor ?? null,
      substituteTrainerId: s.trainer_id ?? null,
      substituteInstructor: s.instructor ?? null,
      // Wer leitet diesen Termin tatsächlich? Eine Vertretung auf Terminebene
      // gewinnt immer; innerhalb einer Ebene hat der freie Text Vorrang vor
      // dem verknüpften Konto (der Text ist der bewusst getippte Sonderfall,
      // z.B. "Nina & Gastdozentin").
      effectiveTrainerName:
        s.instructor ?? s.trainer?.name ?? s.course?.instructor ?? s.course?.trainer?.name ?? null,
      hasSubstitute: !!(s.trainer_id || s.instructor),
      courseTrainerId: s.course?.trainer_id ?? null,
      trainerRequired: s.course?.course_type?.trainer_required ?? true,
      courseDuration: s.course?.duration_minutes ?? 70,
      level: s.course?.level,
      time: s.course?.start_time,
      room: s.course?.room,
      durationMinutes: s.course?.duration_minutes ?? 70,
      capacity: s.capacity_override ?? s.course?.capacity,
      participants: relevant.map((b: any) => ({
        bookingId: b.id,
        name: b.customer?.name ?? b.deleted_customer_name ?? "Unbekannt",
        email: b.customer?.email ?? b.deleted_customer_email ?? "",
        accountDeleted: !b.customer,
        notes: b.notes ?? "",
        source: b.source ?? "self",
        status: b.status,
        customerProductId: b.customer_product_id,
        attended: b.attended,
        availableProducts: b.customer?.id ? productsFor(b.customer.id) : [],
        hasActiveProduct: b.customer?.id
          ? hasActiveProduct(b.customer.id, s.course?.category, s.session_date)
          : false,
      })),
    };
  });

  return NextResponse.json({ sessions: result });
}

// PATCH /api/admin/bookings
// body: { bookingId, notes?, customerProductId?, attended?, status? }
// status: 'confirmed' | 'waitlisted' | 'cancelled' — Admin darf jederzeit direkt
// setzen (auch über Kapazität hinaus). Wird eine Buchung von 'confirmed' weg
// geändert, rückt automatisch die nächste Person von der Warteliste nach.
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { bookingId, notes, customerProductId, attended, status } = body;
  if (!bookingId) return NextResponse.json({ error: "Buchungs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();

  const { data: before } = await db.from("bookings").select("status, course_session_id").eq("id", bookingId).maybeSingle();

  const fields: Record<string, unknown> = {};
  if (notes !== undefined) fields.notes = notes || null;
  if (customerProductId !== undefined) fields.customer_product_id = customerProductId || null;
  if (attended !== undefined) fields.attended = attended;
  if (status !== undefined) fields.status = status;

  const { error } = await db.from("bookings").update(fields).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status !== undefined && before?.status === "confirmed" && status !== "confirmed" && before.course_session_id) {
    await promoteFromWaitlist(db, before.course_session_id);
  }

  if (status !== undefined) {
    await logAction(admin, "status-change", "booking", bookingId, `Buchungsstatus geändert: ${before?.status ?? "?"} → ${status}`);
  } else if (attended !== undefined) {
    await logAction(admin, "attendance", "booking", bookingId, `Anwesenheit gesetzt: ${attended === true ? "da" : attended === false ? "gefehlt" : "zurückgesetzt"}`);
  } else if (notes !== undefined) {
    await logAction(admin, "note", "booking", bookingId, `Kommentar geändert: "${notes}"`);
  } else if (customerProductId !== undefined) {
    await logAction(admin, "assign-product", "booking", bookingId, "Produkt der Buchung zugeordnet");
  }

  return NextResponse.json({ ok: true });
}
