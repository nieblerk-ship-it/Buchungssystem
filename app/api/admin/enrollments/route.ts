import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";
import { ensureEnrollmentBookings } from "@/lib/enrollments";

// GET /api/admin/enrollments?password=...&customerId=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("enrollments")
    .select("id, valid_from, valid_until, active, notes, course:courses(id, name, category)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollments: data });
}

// POST /api/admin/enrollments
// body: { password, customerId, courseId, valid_from?, valid_until?, notes? }
// Trägt eine:n Schüler:in fest in einen Kurs ein und bucht sofort alle
// passenden künftigen Termine (ohne Kapazitätsprüfung — Admin-Entscheidung geht vor).
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { customerId, courseId, valid_from, valid_until, notes } = body;
  if (!customerId || !courseId) {
    return NextResponse.json({ error: "Schüler und Kurs müssen angegeben sein." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("enrollments")
    .insert({
      customer_id: customerId,
      course_id: courseId,
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      valid_until: valid_until || null,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookedCount = await ensureEnrollmentBookings(db, courseId);
  return NextResponse.json({ id: data.id, bookedCount });
}

// DELETE /api/admin/enrollments?password=...&id=...
// Deaktiviert die Zuteilung (bereits erzeugte Buchungen bleiben bestehen,
// können im Reiter "Anmeldungen" einzeln entfernt werden).
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("enrollments").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
