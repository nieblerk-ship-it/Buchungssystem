import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

// GET /api/admin/customer-history?customerId=...
// Liefert ALLE Buchungen (Vergangenheit + Zukunft, auch stornierte) einer
// Schülerin, inkl. welchem Produkt sie zugeordnet waren — für die
// "Details"-Historie und den Guthaben-Verlauf je Produkt.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("bookings")
    .select(
      `id, status, source, attended, notes, customer_product_id,
       course_session:course_sessions ( session_date, course:courses ( name, room, start_time ) )`
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookings = (data ?? []).map((b: any) => ({
    id: b.id,
    status: b.status,
    source: b.source,
    attended: b.attended,
    notes: b.notes,
    customerProductId: b.customer_product_id,
    courseName: b.course_session?.course?.name,
    room: b.course_session?.course?.room,
    time: b.course_session?.course?.start_time,
    date: b.course_session?.session_date,
  }));

  return NextResponse.json({ bookings });
}
