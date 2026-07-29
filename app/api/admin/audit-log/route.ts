import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

// GET /api/admin/audit-log?from=&to=&adminId=&entityType=&search=
// Reiner Lesezugriff — es gibt bewusst keine PATCH/DELETE-Route für den
// Änderungslog, damit er unveränderlich bleibt.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const adminId = url.searchParams.get("adminId");
  const entityType = url.searchParams.get("entityType");
  const search = url.searchParams.get("search");

  const db = supabaseAdmin();
  let query = db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (adminId) query = query.eq("admin_id", adminId);
  if (entityType) query = query.eq("entity_type", entityType);
  if (search) query = query.ilike("description", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: admins } = await db.from("admins").select("id, name").order("name");

  return NextResponse.json({ entries: data, admins: admins ?? [] });
}
