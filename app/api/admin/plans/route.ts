import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { loadPlanChanges, buildPlanCalendar, todayISO } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/plans
// Liste aller Pläne mit Anzahl der Änderungen und der gegenstandslos
// gewordenen Änderungen. Letzteres wird frisch gerechnet, nicht gespeichert —
// die echte Welt ändert sich, während ein Plan liegt.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data: plans, error } = await db
    .from("plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = todayISO();
  const result = [];
  for (const plan of plans ?? []) {
    const changes = await loadPlanChanges(db, plan.id);
    let staleCount = 0;
    if (plan.status === "draft" && changes.length > 0) {
      const { stale } = await buildPlanCalendar(db, plan.id, today, today);
      staleCount = stale.length;
    }
    result.push({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      createdByName: plan.created_by_name,
      publishedByName: plan.published_by_name,
      publishedAt: plan.published_at,
      createdAt: plan.created_at,
      changeCount: changes.length,
      staleCount,
    });
  }

  return NextResponse.json({ plans: result });
}

// POST /api/admin/plans  body: { name, description? }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { name, description } = await req.json();
  if (!name || !String(name).trim())
    return NextResponse.json({ error: "Bitte einen Namen für den Plan angeben." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("plans")
    .insert({
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      created_by_name: admin.name,
    })
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "create", "plan", data.id, `Plan angelegt: „${data.name}"`);
  return NextResponse.json({ plan: data });
}

// PATCH /api/admin/plans  body: { planId, name?, description? }
// Umbenennen und Beschreibung ändern. Der Status wird hier bewusst NICHT
// gesetzt: veröffentlicht wird über /api/admin/plans/publish (Phase J4),
// verworfen über DELETE.
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { planId, name, description } = await req.json();
  if (!planId) return NextResponse.json({ error: "Plan-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: plan } = await db.from("plans").select("id, name, status").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan nicht gefunden." }, { status: 404 });
  if (plan.status !== "draft")
    return NextResponse.json(
      { error: "Nur Entwürfe lassen sich ändern. Veröffentlichte und verworfene Pläne bleiben, wie sie sind." },
      { status: 400 }
    );

  const fields: Record<string, unknown> = {};
  if (name !== undefined) fields.name = String(name).trim();
  if (description !== undefined) fields.description = description ? String(description).trim() : null;

  const { error } = await db.from("plans").update(fields).eq("id", planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "update", "plan", planId, `Plan bearbeitet: „${fields.name ?? plan.name}"`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/plans?planId=...&hard=1
// Ohne hard: der Plan wird verworfen und bleibt als Dokumentation liegen.
// Mit hard: der Plan wird samt Änderungen wirklich gelöscht (für versehentlich
// angelegte Pläne). Da ein Plan die echte Welt nie berührt hat, geht dabei
// nichts Dokumentiertes verloren.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  const hard = searchParams.get("hard") === "1";
  if (!planId) return NextResponse.json({ error: "Plan-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: plan } = await db.from("plans").select("id, name, status").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan nicht gefunden." }, { status: 404 });
  if (plan.status === "published")
    return NextResponse.json(
      { error: "Ein veröffentlichter Plan lässt sich nicht mehr verwerfen oder löschen." },
      { status: 400 }
    );

  if (hard) {
    const { error } = await db.from("plans").delete().eq("id", planId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(admin, "delete", "plan", planId, `Plan gelöscht: „${plan.name}"`);
  } else {
    const { error } = await db.from("plans").update({ status: "discarded" }).eq("id", planId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(admin, "discard", "plan", planId, `Plan verworfen: „${plan.name}"`);
  }

  return NextResponse.json({ ok: true });
}
