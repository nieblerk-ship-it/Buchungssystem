import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/course-access?password=...&customerId=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customer_course_overrides")
    .select("id, access, notes, course:courses(id, name, category)")
    .eq("customer_id", customerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data });
}

// POST /api/admin/course-access
// body: { password, customerId, courseId, access: 'allow'|'deny', notes? }
// Legt eine Freigabe/Sperre an oder überschreibt eine bestehende für denselben Kurs.
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { customerId, courseId, access, notes } = body;
  if (!customerId || !courseId || !["allow", "deny"].includes(access)) {
    return NextResponse.json({ error: "Schüler, Kurs und Freigabe/Sperre müssen angegeben sein." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from("customer_course_overrides")
    .upsert(
      { customer_id: customerId, course_id: courseId, access, notes: notes?.trim() || null },
      { onConflict: "customer_id,course_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/course-access?password=...&id=...
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("customer_course_overrides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
