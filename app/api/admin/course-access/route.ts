import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

// GET /api/admin/course-access?customerId=...
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customer_course_overrides")
    .select("id, access, notes, course_type:course_types(id, name, category)")
    .eq("customer_id", customerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data });
}

// POST /api/admin/course-access
// body: { customerId, courseTypeId, access: 'allow'|'deny', notes? }
// Legt eine Freigabe/Sperre für eine Kursbezeichnung an (gilt für alle Instanzen).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { customerId, courseTypeId, access, notes } = body;
  if (!customerId || !courseTypeId || !["allow", "deny"].includes(access)) {
    return NextResponse.json({ error: "Schüler, Kursbezeichnung und Freigabe/Sperre müssen angegeben sein." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from("customer_course_overrides")
    .upsert(
      { customer_id: customerId, course_type_id: courseTypeId, access, notes: notes?.trim() || null },
      { onConflict: "customer_id,course_type_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: ct } = await db.from("course_types").select("name").eq("id", courseTypeId).maybeSingle();
  await logAction(admin, access === "allow" ? "allow" : "deny", "course_access", customerId, `Kursbezeichnung "${ct?.name ?? courseTypeId}" ${access === "allow" ? "freigegeben" : "gesperrt"}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/course-access?id=...
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("customer_course_overrides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "remove", "course_access", id, "Kurs-Freigabe/Sperre entfernt");
  return NextResponse.json({ ok: true });
}
