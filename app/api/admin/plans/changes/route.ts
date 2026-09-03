import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { todayISO, formatDE } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Welche Felder darf eine geplante Kursänderung tragen? Alles andere wird
// verworfen, damit im payload nichts landet, was beim Veröffentlichen
// niemand auswertet.
const COURSE_FIELDS = [
  "name", "courseTypeId", "category", "level", "room", "startTime", "weekday",
  "durationMinutes", "capacity", "trainerId", "instructor", "startDate", "endDate", "isSingle",
];

function cleanPayload(input: Record<string, any> | undefined) {
  const out: Record<string, any> = {};
  for (const key of COURSE_FIELDS) {
    if (input && input[key] !== undefined && input[key] !== null && input[key] !== "") {
      out[key] = input[key];
    }
  }
  return out;
}

async function assertDraft(db: ReturnType<typeof supabaseAdmin>, planId: string) {
  const { data: plan } = await db.from("plans").select("id, name, status").eq("id", planId).maybeSingle();
  if (!plan) return { error: "Plan nicht gefunden.", status: 404 as const };
  if (plan.status !== "draft")
    return { error: "Dieser Plan ist kein Entwurf mehr und lässt sich nicht ändern.", status: 400 as const };
  return { plan };
}

// POST /api/admin/plans/changes
// body: { planId, kind, courseId?, targetChangeId?, effectiveFrom, payload?, note?, groupKey?, groupLabel? }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { planId, kind, courseId, targetChangeId, effectiveFrom, payload, note, groupKey, groupLabel } = body;

  if (!planId || !kind) return NextResponse.json({ error: "Plan-ID und Art der Änderung fehlen." }, { status: 400 });

  const db = supabaseAdmin();
  const check = await assertDraft(db, planId);
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const today = todayISO();

  // Die Vergangenheit ist unantastbar — auch in der Planung. Ein Stichtag in
  // der Vergangenheit würde beim Veröffentlichen rückwirkend wirken, und genau
  // das soll das System nie tun.
  if (effectiveFrom && effectiveFrom < today)
    return NextResponse.json(
      { error: `Der Stichtag muss heute oder später liegen. Rückwirkende Änderungen gibt es bewusst nicht.` },
      { status: 400 }
    );

  const clean = cleanPayload(payload);

  if (kind === "course_create") {
    if (!clean.name) return NextResponse.json({ error: "Bitte eine Kursbezeichnung angeben." }, { status: 400 });
    if (!clean.startDate) return NextResponse.json({ error: "Bitte ein Startdatum angeben." }, { status: 400 });
    if (clean.startDate < today)
      return NextResponse.json({ error: "Ein geplanter Kurs kann nicht in der Vergangenheit starten." }, { status: 400 });
    if (!clean.isSingle && !clean.weekday)
      return NextResponse.json({ error: "Bitte einen Wochentag angeben oder Einzeltermin wählen." }, { status: 400 });
    if (clean.endDate && clean.endDate < clean.startDate)
      return NextResponse.json({ error: "Das Enddatum liegt vor dem Startdatum." }, { status: 400 });
  }

  if (kind === "course_update" || kind === "course_end") {
    if (!courseId) return NextResponse.json({ error: "Kurs fehlt." }, { status: 400 });
    if (!effectiveFrom) return NextResponse.json({ error: "Bitte einen Stichtag angeben." }, { status: 400 });

    const { data: course } = await db.from("courses").select("id, name, ended_on").eq("id", courseId).maybeSingle();
    if (!course) return NextResponse.json({ error: "Kurs nicht gefunden." }, { status: 404 });
    if (course.ended_on && course.ended_on < effectiveFrom)
      return NextResponse.json(
        { error: `„${course.name}" wurde in der echten Welt bereits zum ${formatDE(course.ended_on)} beendet.` },
        { status: 400 }
      );

    if (kind === "course_update" && Object.keys(clean).length === 0)
      return NextResponse.json({ error: "Es wurde nichts geändert." }, { status: 400 });

    // Zwei Änderungen derselben Art am selben Kurs zum selben Stichtag wären
    // widersprüchlich — beim Veröffentlichen wäre nicht entscheidbar, welche gilt.
    const { data: existing } = await db
      .from("plan_changes")
      .select("id")
      .eq("plan_id", planId)
      .eq("kind", kind)
      .eq("course_id", courseId)
      .eq("effective_from", effectiveFrom)
      .maybeSingle();
    if (existing)
      return NextResponse.json(
        { error: "Für diesen Kurs gibt es zu diesem Stichtag bereits eine Änderung dieser Art in diesem Plan." },
        { status: 400 }
      );
  }

  if (kind === "enrollment_add" || kind === "enrollment_end") {
    if (!body.customerId) return NextResponse.json({ error: "Bitte eine Schülerin auswählen." }, { status: 400 });
    if (!effectiveFrom) return NextResponse.json({ error: "Bitte einen Stichtag angeben." }, { status: 400 });
    if (!courseId && !targetChangeId)
      return NextResponse.json({ error: "Der Kurs fehlt." }, { status: 400 });

    const { data: customer } = await db
      .from("customers")
      .select("id, name, archived_at")
      .eq("id", body.customerId)
      .maybeSingle();
    if (!customer) return NextResponse.json({ error: "Schülerin nicht gefunden." }, { status: 404 });
    if (customer.archived_at)
      return NextResponse.json({ error: `${customer.name} ist archiviert und lässt sich nicht einplanen.` }, { status: 400 });

    // Zielt die Zuteilung auf einen erst geplanten Kurs, muss der im selben
    // Plan liegen — sonst zeigt sie nach dem Veröffentlichen ins Leere.
    if (targetChangeId) {
      const { data: target } = await db
        .from("plan_changes")
        .select("id, plan_id, kind")
        .eq("id", targetChangeId)
        .maybeSingle();
      if (!target || target.plan_id !== planId || target.kind !== "course_create")
        return NextResponse.json({ error: "Der geplante Kurs gehört nicht zu diesem Plan." }, { status: 400 });
    }

    const dupQuery = db
      .from("plan_changes")
      .select("id")
      .eq("plan_id", planId)
      .eq("kind", kind)
      .eq("customer_id", body.customerId);
    const { data: dup } = courseId
      ? await dupQuery.eq("course_id", courseId).maybeSingle()
      : await dupQuery.eq("target_change_id", targetChangeId).maybeSingle();
    if (dup)
      return NextResponse.json(
        { error: `Für ${customer.name} gibt es in diesem Plan bereits eine solche Zuteilung für diesen Kurs.` },
        { status: 400 }
      );
  }

  const { data, error } = await db
    .from("plan_changes")
    .insert({
      plan_id: planId,
      kind,
      course_id: courseId ?? null,
      target_change_id: targetChangeId ?? null,
      customer_id: body.customerId ?? null,
      effective_from: effectiveFrom ?? clean.startDate ?? null,
      payload: body.validUntil ? { ...clean, validUntil: body.validUntil } : clean,
      note: note ? String(note).trim() : null,
      group_key: groupKey ?? null,
      group_label: groupLabel ?? null,
      created_by_name: admin.name,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "plan-change", "plan", planId, `Änderung im Plan „${check.plan.name}" ergänzt (${kind})`);
  return NextResponse.json({ change: data });
}

// PATCH /api/admin/plans/changes
// body: { changeId, effectiveFrom?, payload?, note? }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { changeId, effectiveFrom, payload, note } = await req.json();
  if (!changeId) return NextResponse.json({ error: "Änderungs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: change } = await db.from("plan_changes").select("id, plan_id, kind, payload").eq("id", changeId).maybeSingle();
  if (!change) return NextResponse.json({ error: "Änderung nicht gefunden." }, { status: 404 });

  const check = await assertDraft(db, change.plan_id);
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  if (effectiveFrom && effectiveFrom < todayISO())
    return NextResponse.json({ error: "Der Stichtag muss heute oder später liegen." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (effectiveFrom !== undefined) fields.effective_from = effectiveFrom;
  if (payload !== undefined) fields.payload = cleanPayload(payload);
  if (note !== undefined) fields.note = note ? String(note).trim() : null;

  const { error } = await db.from("plan_changes").update(fields).eq("id", changeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "plan-change", "plan", change.plan_id, `Geplante Änderung bearbeitet (${change.kind})`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/plans/changes?changeId=...
// Änderungen, die auf diese hier zeigen (z.B. Zuteilungen zu einem erst
// geplanten Kurs), verschwinden über die Fremdschlüssel-Kaskade mit.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const changeId = searchParams.get("changeId");
  if (!changeId) return NextResponse.json({ error: "Änderungs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: change } = await db.from("plan_changes").select("id, plan_id, kind").eq("id", changeId).maybeSingle();
  if (!change) return NextResponse.json({ error: "Änderung nicht gefunden." }, { status: 404 });

  const check = await assertDraft(db, change.plan_id);
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { count } = await db
    .from("plan_changes")
    .select("id", { count: "exact", head: true })
    .eq("target_change_id", changeId);

  const { error } = await db.from("plan_changes").delete().eq("id", changeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(admin, "plan-change", "plan", change.plan_id, `Geplante Änderung entfernt (${change.kind})`);
  return NextResponse.json({ ok: true, cascaded: count ?? 0 });
}
