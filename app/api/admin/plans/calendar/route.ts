import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { buildPlanCalendar, loadPlanChanges, describeChange, findRoomConflicts, findPlanWarnings, todayISO } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/plans/calendar?planId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Liefert die zusammengerechnete Ansicht: echte Termine, überlagert mit den
// geplanten Änderungen. Wird bei JEDEM Aufruf frisch gerechnet — ein Plan
// speichert keine Kopien, sonst zeigte er einen Stand von vor drei Wochen.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "Plan-ID fehlt." }, { status: 400 });

  const today = todayISO();
  const from = searchParams.get("from") ?? today;
  const to = searchParams.get("to") ?? from;

  const db = supabaseAdmin();
  const { data: plan } = await db.from("plans").select("*").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan nicht gefunden." }, { status: 404 });

  const { sessions, stale } = await buildPlanCalendar(db, planId, from, to);
  const changes = await loadPlanChanges(db, planId);

  // Namen für die lesbare Beschreibung der Änderungsliste nachladen
  const courseIds = Array.from(new Set(changes.map((c) => c.course_id).filter(Boolean))) as string[];
  const customerIds = Array.from(new Set(changes.map((c) => c.customer_id).filter(Boolean))) as string[];

  const { data: courses } = courseIds.length
    ? await db.from("courses").select("id, name").in("id", courseIds)
    : { data: [] as any[] };
  const { data: customers } = customerIds.length
    ? await db.from("customers").select("id, name").in("id", customerIds)
    : { data: [] as any[] };

  const courseName = new Map((courses ?? []).map((c: any) => [c.id, c.name]));
  const customerName = new Map((customers ?? []).map((c: any) => [c.id, c.name]));
  const staleById = new Map(stale.map((s) => [s.changeId, s.reason]));

  const changeList = changes.map((c) => ({
    id: c.id,
    kind: c.kind,
    effectiveFrom: c.effective_from,
    groupKey: c.group_key,
    groupLabel: c.group_label,
    note: c.note,
    createdByName: c.created_by_name,
    description: describeChange(
      c,
      c.course_id ? courseName.get(c.course_id) ?? null : c.payload?.name ?? null,
      c.customer_id ? customerName.get(c.customer_id) ?? null : null
    ),
    stale: staleById.has(c.id),
    staleReason: staleById.get(c.id) ?? null,
  }));

  // Änderungen einer Gruppenverschiebung zu EINER Zeile zusammenfassen —
  // technisch sind es zwei Änderungen pro Person, fachlich ist es ein Vorgang.
  const seenGroups = new Set<string>();
  const groupedChangeList = changeList.filter((c) => {
    const key = changes.find((x) => x.id === c.id)?.group_key ?? null;
    if (!key) return true;
    if (seenGroups.has(key)) return false;
    seenGroups.add(key);
    return true;
  }).map((c) => {
    const raw = changes.find((x) => x.id === c.id)!;
    if (!raw.group_key) return c;
    const members = changes.filter((x) => x.group_key === raw.group_key);
    const staleMembers = members.filter((m) => staleById.has(m.id));
    return {
      ...c,
      description: raw.group_label ?? c.description,
      groupKey: raw.group_key,
      groupSize: members.length,
      stale: staleMembers.length === members.length,
      staleReason:
        staleMembers.length === 0
          ? null
          : staleMembers.length === members.length
          ? staleById.get(staleMembers[0].id) ?? null
          : `${staleMembers.length} von ${members.length} Teilschritten sind gegenstandslos geworden.`,
    };
  });

  const conflicts = findRoomConflicts(sessions);
  const warnings = findPlanWarnings(sessions);

  return NextResponse.json({
    conflicts,
    warnings,
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      createdByName: plan.created_by_name,
      createdAt: plan.created_at,
    },
    sessions,
    changes: groupedChangeList,
    staleCount: stale.length,
  });
}
