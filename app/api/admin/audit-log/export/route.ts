import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";

// GET /api/admin/audit-log/export?from=&to=&adminId=&entityType=&search=
// Liefert dieselben gefilterten Einträge wie /api/admin/audit-log, aber als
// herunterladbare .xlsx-Datei.
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
  let query = db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(5000);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (adminId) query = query.eq("admin_id", adminId);
  if (entityType) query = query.eq("entity_type", entityType);
  if (search) query = query.ilike("description", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((e: any) => ({
    Zeitstempel: new Date(e.created_at).toLocaleString("de-DE"),
    Bearbeiter: e.admin_name,
    Aktion: e.action,
    Bereich: e.entity_type,
    Beschreibung: e.description,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 60 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Änderungslog");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aenderungslog_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
