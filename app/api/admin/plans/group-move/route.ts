import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { todayISO, formatDE } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/plans/group-move?courseId=...
// Wer ist diesem Kurs aktuell fest zugeteilt? Grundlage für die Auswahlliste
// beim Verschieben einer Gruppe ins nächste Level.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("enrollments")
    .select("id, valid_from, valid_until, customer:customers(id, name, email, level, archived_at)")
    .eq("course_id", courseId)
    .eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Eine Person kann mehrere aktive Zuteilungen zu demselben Kurs haben —
  // regulär bei getrennten Zeiträumen, versehentlich bei Doppeleinträgen aus
  // der Zeit vor der Überschneidungsprüfung. Für die Auswahlliste zählt die
  // Person, nicht die Zeile: sonst steht sie mehrfach da und würde beim
  // Verschieben auch mehrfach eingeplant.
  const byCustomer = new Map<string, any>();
  for (const e of data ?? []) {
    const customer = (e as any).customer;
    if (!customer || customer.archived_at) continue;
    const existing = byCustomer.get(customer.id);
    // Die zuletzt beginnende Zuteilung gewinnt, sie beschreibt den
    // aktuellen Stand am ehesten.
    if (!existing || (e.valid_from ?? "") > (existing.validFrom ?? "")) {
      byCustomer.set(customer.id, {
        enrollmentId: e.id,
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        level: customer.level,
        validFrom: e.valid_from,
        validUntil: e.valid_until,
        duplicateRows: (existing?.duplicateRows ?? 0) + 1,
      });
    } else {
      existing.duplicateRows = (existing.duplicateRows ?? 1) + 1;
    }
  }

  const members = Array.from(byCustomer.values()).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ members });
}

// POST /api/admin/plans/group-move
// body: { planId, fromCourseId, toCourseId? | toChangeId?, customerIds[], effectiveFrom, label? }
//
// Erzeugt pro Person zwei Änderungen (alte Zuteilung endet, neue beginnt),
// zusammengehalten über group_key. In der Oberfläche ist das eine Zeile.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { planId, fromCourseId, toCourseId, toChangeId, customerIds, effectiveFrom, label } = await req.json();

  if (!planId || !fromCourseId || !Array.isArray(customerIds) || customerIds.length === 0)
    return NextResponse.json({ error: "Plan, Quellkurs und mindestens eine Person werden gebraucht." }, { status: 400 });
  if (!toCourseId && !toChangeId)
    return NextResponse.json({ error: "Bitte einen Zielkurs auswählen." }, { status: 400 });
  if (!effectiveFrom)
    return NextResponse.json({ error: "Bitte einen Stichtag angeben." }, { status: 400 });
  if (effectiveFrom < todayISO())
    return NextResponse.json({ error: "Der Stichtag muss heute oder später liegen." }, { status: 400 });
  if (toCourseId && toCourseId === fromCourseId)
    return NextResponse.json({ error: "Quell- und Zielkurs sind derselbe Kurs." }, { status: 400 });

  const db = supabaseAdmin();

  const { data: plan } = await db.from("plans").select("id, name, status").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan nicht gefunden." }, { status: 404 });
  if (plan.status !== "draft")
    return NextResponse.json({ error: "Dieser Plan ist kein Entwurf mehr." }, { status: 400 });

  const { data: fromCourse } = await db.from("courses").select("id, name, ended_on").eq("id", fromCourseId).maybeSingle();
  if (!fromCourse) return NextResponse.json({ error: "Quellkurs nicht gefunden." }, { status: 404 });
  if (fromCourse.ended_on && fromCourse.ended_on < effectiveFrom)
    return NextResponse.json(
      { error: `„${fromCourse.name}" wurde in der echten Welt bereits zum ${formatDE(fromCourse.ended_on)} beendet.` },
      { status: 400 }
    );

  let toName = "";
  if (toCourseId) {
    const { data: toCourse } = await db.from("courses").select("id, name, ended_on").eq("id", toCourseId).maybeSingle();
    if (!toCourse) return NextResponse.json({ error: "Zielkurs nicht gefunden." }, { status: 404 });
    if (toCourse.ended_on && toCourse.ended_on < effectiveFrom)
      return NextResponse.json({ error: `Der Zielkurs „${toCourse.name}" ist bereits beendet.` }, { status: 400 });
    toName = toCourse.name;
  } else {
    const { data: target } = await db
      .from("plan_changes")
      .select("id, plan_id, kind, payload")
      .eq("id", toChangeId)
      .maybeSingle();
    if (!target || target.plan_id !== planId || target.kind !== "course_create")
      return NextResponse.json({ error: "Der geplante Zielkurs gehört nicht zu diesem Plan." }, { status: 400 });
    toName = (target.payload as any)?.name ?? "geplanter Kurs";
  }

  const { data: customers } = await db
    .from("customers")
    .select("id, name, archived_at")
    .in("id", customerIds);

  const usable = (customers ?? []).filter((c: any) => !c.archived_at);
  if (usable.length === 0)
    return NextResponse.json({ error: "Keine der ausgewählten Personen ist verfügbar." }, { status: 400 });

  const groupKey = `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const groupLabel =
    label ??
    `Gruppe „${fromCourse.name}" → „${toName}" ab ${formatDE(effectiveFrom)} (${usable.length} ${usable.length === 1 ? "Person" : "Personen"})`;

  const rows: any[] = [];
  for (const customer of usable) {
    rows.push({
      plan_id: planId,
      kind: "enrollment_end",
      course_id: fromCourseId,
      customer_id: customer.id,
      effective_from: effectiveFrom,
      payload: {},
      group_key: groupKey,
      group_label: groupLabel,
      created_by_name: admin.name,
    });
    rows.push({
      plan_id: planId,
      kind: "enrollment_add",
      course_id: toCourseId ?? null,
      target_change_id: toChangeId ?? null,
      customer_id: customer.id,
      effective_from: effectiveFrom,
      payload: {},
      group_key: groupKey,
      group_label: groupLabel,
      created_by_name: admin.name,
    });
  }

  const { error } = await db.from("plan_changes").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "plan-change", "plan", planId, `${groupLabel} in Plan „${plan.name}" geplant`);
  return NextResponse.json({ ok: true, moved: usable.length, groupKey, skipped: customerIds.length - usable.length });
}

// DELETE /api/admin/plans/group-move?planId=...&groupKey=...
// Entfernt alle Änderungen einer Gruppenverschiebung zusammen.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  const groupKey = searchParams.get("groupKey");
  if (!planId || !groupKey) return NextResponse.json({ error: "Plan-ID und Gruppe fehlen." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: plan } = await db.from("plans").select("id, name, status").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan nicht gefunden." }, { status: 404 });
  if (plan.status !== "draft")
    return NextResponse.json({ error: "Dieser Plan ist kein Entwurf mehr." }, { status: 400 });

  const { error } = await db.from("plan_changes").delete().eq("plan_id", planId).eq("group_key", groupKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "plan-change", "plan", planId, "Geplante Gruppenverschiebung entfernt");
  return NextResponse.json({ ok: true });
}
