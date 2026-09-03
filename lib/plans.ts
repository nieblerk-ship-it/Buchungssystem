import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Der Kern des Planungssystems: die Zusammenrechnung von echter Welt und
// geplanten Unterschieden. Ein Plan enthält nie Kopien von Kursen, nur Deltas.
// Diese Datei ist die EINZIGE Stelle, an der beides zusammengeführt wird.
//
// Wichtigste Regel: die echte Welt hat Vorrang. Zeigt eine geplante Änderung
// auf einen Kurs, den es nicht mehr gibt oder der real bereits beendet wurde,
// wird die Änderung nicht angewendet, sondern als "gegenstandslos" (stale)
// zurückgegeben — sofort sichtbar im Plan, nicht erst beim Veröffentlichen.
// ---------------------------------------------------------------------------

export type PlanChangeKind =
  | "course_create"
  | "course_update"
  | "course_end"
  | "enrollment_add"
  | "enrollment_end";

export type PlanChange = {
  id: string;
  plan_id: string;
  kind: PlanChangeKind;
  course_id: string | null;
  target_change_id: string | null;
  customer_id: string | null;
  enrollment_id: string | null;
  effective_from: string | null;
  payload: Record<string, any>;
  group_key: string | null;
  group_label: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type StaleChange = {
  changeId: string;
  kind: PlanChangeKind;
  reason: string;
};

export type PlanParticipant = {
  name: string;
  email: string;
  status: "confirmed" | "waitlisted";
  source: string;
  /** planned = kommt erst durch diesen Plan dazu, real = existiert schon */
  origin: "real" | "planned";
  /** true, wenn diese Person durch den Plan aus dem Kurs herausfällt */
  removedByPlan?: boolean;
  changeId?: string;
  customerId?: string | null;
};

export type PlanSession = {
  id: string;
  date: string;
  time: string | null;
  durationMinutes: number;
  courseId: string | null;
  courseName: string;
  courseLevel: string | null;
  courseCategory: string | null;
  room: string | null;
  capacity: number;
  trainerName: string | null;
  cancelled: boolean;
  /** unchanged = echte Welt, new = durch Plan neu, changed = durch Plan verändert */
  planState: "unchanged" | "new" | "changed";
  /** Welche Felder der Plan verändert hat, für die Hervorhebung in der Ansicht */
  changedFields: string[];
  changeIds: string[];
  participants: PlanParticipant[];
};

export type PlanCalendar = {
  sessions: PlanSession[];
  stale: StaleChange[];
};

// --- Datumshilfen (alles als YYYY-MM-DD, keine Zeitzonenfallen) ------------

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISO(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

function addDaysISO(s: string, days: number) {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** 1 = Montag ... 7 = Sonntag, wie in courses.weekday */
function isoWeekday(s: string) {
  const day = parseISO(s).getUTCDay(); // 0 = Sonntag
  return day === 0 ? 7 : day;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Alle Daten im Fenster, die auf einen bestimmten Wochentag fallen */
function datesForWeekday(from: string, to: string, weekday: number) {
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 800) {
    if (isoWeekday(cursor) === weekday) out.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return out;
}

// --- Laden ------------------------------------------------------------------

export async function loadPlanChanges(
  db: ReturnType<typeof supabaseAdmin>,
  planId: string
): Promise<PlanChange[]> {
  const { data } = await db
    .from("plan_changes")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PlanChange[];
}

/**
 * Echte Termine im Fenster, inklusive Kursdaten und bestehenden Buchungen.
 * Bewusst dieselbe Datenbasis wie der Admin-Kalender, damit der Plan nicht
 * eine zweite, abweichende Wahrheit über die Gegenwart aufbaut.
 */
async function loadRealSessions(db: ReturnType<typeof supabaseAdmin>, from: string, to: string) {
  const { data } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override, trainer_id, instructor,
       trainer:trainers ( id, name ),
       course:courses ( id, name, level, category, room, start_time, duration_minutes,
         capacity, weekday, ended_on, end_date, is_single, instructor,
         trainer:trainers ( id, name ) ),
       bookings ( id, status, source, customer_id, deleted_customer_name, deleted_customer_email,
         customer:customers ( id, name, email ) )`
    )
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: true })
    .limit(3000);
  return data ?? [];
}

// --- Prüfung: welche Änderungen sind gegenstandslos geworden? --------------

async function findStaleChanges(
  db: ReturnType<typeof supabaseAdmin>,
  changes: PlanChange[]
): Promise<Map<string, string>> {
  const stale = new Map<string, string>();

  const courseIds = Array.from(
    new Set(changes.map((c) => c.course_id).filter((id): id is string => !!id))
  );
  const { data: courses } = courseIds.length
    ? await db.from("courses").select("id, name, ended_on, end_date").in("id", courseIds)
    : { data: [] as any[] };
  const courseById = new Map((courses ?? []).map((c: any) => [c.id, c]));

  const customerIds = Array.from(
    new Set(changes.map((c) => c.customer_id).filter((id): id is string => !!id))
  );
  const { data: customers } = customerIds.length
    ? await db.from("customers").select("id, name, archived_at").in("id", customerIds)
    : { data: [] as any[] };
  const customerById = new Map((customers ?? []).map((c: any) => [c.id, c]));

  for (const change of changes) {
    // Zielkurs in der echten Welt gelöscht
    if (change.course_id && !courseById.has(change.course_id)) {
      stale.set(change.id, "Der Kurs existiert in der echten Welt nicht mehr.");
      continue;
    }

    // Zielkurs real schon beendet, bevor die Planung greifen würde
    if (change.course_id && change.effective_from) {
      const course = courseById.get(change.course_id);
      const realEnd = course?.ended_on ?? null;
      if (realEnd && realEnd < change.effective_from) {
        stale.set(
          change.id,
          `Der Kurs wurde in der echten Welt zum ${formatDE(realEnd)} beendet, also vor dem geplanten Stichtag.`
        );
        continue;
      }
    }

    // Die Änderung im Plan, auf die sich diese hier bezieht, ist weg
    if (change.target_change_id && !changes.some((c) => c.id === change.target_change_id)) {
      stale.set(change.id, "Der geplante Kurs, auf den sich das bezieht, wurde aus dem Plan entfernt.");
      continue;
    }

    // Schülerin gelöscht oder archiviert
    if (change.customer_id) {
      const customer = customerById.get(change.customer_id);
      if (!customer) {
        stale.set(change.id, "Die Schülerin existiert nicht mehr.");
        continue;
      }
      if (customer.archived_at) {
        stale.set(change.id, "Die Schülerin ist inzwischen archiviert.");
        continue;
      }
    }
  }

  return stale;
}

export function formatDE(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// --- Die Zusammenrechnung ---------------------------------------------------

/**
 * Baut die Kalenderansicht eines Plans für ein Zeitfenster: echte Termine,
 * überlagert mit allen anwendbaren geplanten Änderungen.
 *
 * Änderungen wirken sich nie auf Termine VOR ihrem Stichtag aus — dasselbe
 * Prinzip wie bei echten Kursänderungen. Die Vergangenheit bleibt unantastbar,
 * auch in der Planung.
 */
export async function buildPlanCalendar(
  db: ReturnType<typeof supabaseAdmin>,
  planId: string,
  from: string,
  to: string
): Promise<PlanCalendar> {
  const changes = await loadPlanChanges(db, planId);
  const staleMap = await findStaleChanges(db, changes);
  const active = changes.filter((c) => !staleMap.has(c.id));

  const realSessions = await loadRealSessions(db, from, to);

  // 1) Echte Termine in die Plan-Form bringen
  const sessions: PlanSession[] = realSessions.map((s: any) => ({
    id: s.id,
    date: s.session_date,
    time: s.course?.start_time ?? null,
    durationMinutes: s.course?.duration_minutes ?? 70,
    courseId: s.course?.id ?? null,
    courseName: s.course?.name ?? "Unbekannt",
    courseLevel: s.course?.level ?? null,
    courseCategory: s.course?.category ?? null,
    room: s.course?.room ?? null,
    capacity: s.capacity_override ?? s.course?.capacity ?? 0,
    trainerName:
      s.instructor ?? s.trainer?.name ?? s.course?.instructor ?? s.course?.trainer?.name ?? null,
    cancelled: s.cancelled,
    planState: "unchanged",
    changedFields: [],
    changeIds: [],
    participants: (s.bookings ?? [])
      .filter((b: any) => b.status === "confirmed" || b.status === "waitlisted")
      .map((b: any) => ({
        name: b.customer?.name ?? b.deleted_customer_name ?? "Unbekannt",
        email: b.customer?.email ?? b.deleted_customer_email ?? "",
        status: b.status as "confirmed" | "waitlisted",
        source: b.source ?? "self",
        origin: "real" as const,
        customerId: b.customer_id ?? null,
      })),
  }));

  // Kursdaten für die Erzeugung geplanter Termine
  const courseIds = Array.from(
    new Set(active.map((c) => c.course_id).filter((id): id is string => !!id))
  );
  const { data: courseRows } = courseIds.length
    ? await db
        .from("courses")
        .select(
          "id, name, level, category, room, start_time, duration_minutes, capacity, weekday, ended_on, end_date, is_single, instructor, trainer_id, trainer:trainers(id, name)"
        )
        .in("id", courseIds)
    : { data: [] as any[] };
  const courseById = new Map((courseRows ?? []).map((c: any) => [c.id, c]));

  const trainerIds = Array.from(
    new Set(
      active
        .map((c) => c.payload?.trainerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const { data: trainerRows } = trainerIds.length
    ? await db.from("trainers").select("id, name").in("id", trainerIds)
    : { data: [] as any[] };
  const trainerById = new Map((trainerRows ?? []).map((t: any) => [t.id, t]));

  function trainerNameFrom(payload: Record<string, any>, fallback: string | null) {
    if (payload.instructor) return payload.instructor as string;
    if (payload.trainerId) return trainerById.get(payload.trainerId)?.name ?? fallback;
    return fallback;
  }

  // 2) Kurs beenden: Termine ab Stichtag fallen weg
  const removedSessionIds = new Set<string>();
  for (const change of active.filter((c) => c.kind === "course_end")) {
    if (!change.course_id || !change.effective_from) continue;
    for (const session of sessions) {
      if (session.courseId === change.course_id && session.date >= change.effective_from) {
        removedSessionIds.add(session.id);
      }
    }
  }

  // 3) Kurs ab Stichtag ändern
  const generated: PlanSession[] = [];
  for (const change of active.filter((c) => c.kind === "course_update")) {
    if (!change.course_id || !change.effective_from) continue;
    const course = courseById.get(change.course_id);
    if (!course) continue;
    const p = change.payload ?? {};

    // Verschiebt sich der Wochentag, liegen die Termine an anderen Daten. Die
    // alten Termine ab Stichtag fallen weg und werden neu erzeugt — genau das,
    // was die echte Split-Logik beim Veröffentlichen auch tut.
    const weekdayMoves = p.weekday !== undefined && Number(p.weekday) !== Number(course.weekday);

    const affected = sessions.filter(
      (s) => s.courseId === change.course_id && s.date >= change.effective_from!
    );

    if (weekdayMoves) {
      affected.forEach((s) => removedSessionIds.add(s.id));
      const windowFrom = change.effective_from > from ? change.effective_from : from;
      const hardEnd = p.endDate ?? course.end_date ?? null;
      const windowTo = hardEnd && hardEnd < to ? hardEnd : to;
      if (windowFrom <= windowTo) {
        for (const date of datesForWeekday(windowFrom, windowTo, Number(p.weekday))) {
          generated.push({
            id: `plan:${change.id}:${date}`,
            date,
            time: p.startTime ?? course.start_time,
            durationMinutes: p.durationMinutes ?? course.duration_minutes ?? 70,
            courseId: course.id,
            courseName: p.name ?? course.name,
            courseLevel: p.level !== undefined ? p.level : course.level,
            courseCategory: p.category ?? course.category,
            room: p.room !== undefined ? p.room : course.room,
            capacity: p.capacity ?? course.capacity ?? 0,
            trainerName: trainerNameFrom(p, course.instructor ?? course.trainer?.name ?? null),
            cancelled: false,
            planState: "changed",
            changedFields: Object.keys(p),
            changeIds: [change.id],
            participants: [],
          });
        }
      }
    } else {
      for (const session of affected) {
        if (p.name !== undefined) session.courseName = p.name;
        if (p.level !== undefined) session.courseLevel = p.level;
        if (p.category !== undefined) session.courseCategory = p.category;
        if (p.room !== undefined) session.room = p.room;
        if (p.startTime !== undefined) session.time = p.startTime;
        if (p.durationMinutes !== undefined) session.durationMinutes = p.durationMinutes;
        if (p.capacity !== undefined) session.capacity = p.capacity;
        if (p.trainerId !== undefined || p.instructor !== undefined) {
          session.trainerName = trainerNameFrom(p, session.trainerName);
        }
        if (p.endDate && session.date > p.endDate) {
          removedSessionIds.add(session.id);
          continue;
        }
        session.planState = "changed";
        session.changedFields = Array.from(new Set([...session.changedFields, ...Object.keys(p)]));
        session.changeIds = Array.from(new Set([...session.changeIds, change.id]));
      }
    }
  }

  // 4) Neue Kurse aus dem Plan
  for (const change of active.filter((c) => c.kind === "course_create")) {
    const p = change.payload ?? {};
    const startDate: string = p.startDate ?? change.effective_from ?? todayISO();
    const endDate: string | null = p.endDate ?? null;

    const windowFrom = startDate > from ? startDate : from;
    const windowTo = endDate && endDate < to ? endDate : to;
    if (windowFrom > windowTo) continue;

    const dates = p.isSingle
      ? startDate >= windowFrom && startDate <= windowTo
        ? [startDate]
        : []
      : datesForWeekday(windowFrom, windowTo, Number(p.weekday));

    for (const date of dates) {
      generated.push({
        id: `plan:${change.id}:${date}`,
        date,
        time: p.startTime ?? null,
        durationMinutes: p.durationMinutes ?? 70,
        courseId: null,
        courseName: p.name ?? "Neuer Kurs",
        courseLevel: p.level ?? null,
        courseCategory: p.category ?? null,
        room: p.room ?? null,
        capacity: p.capacity ?? 0,
        trainerName: trainerNameFrom(p, null),
        cancelled: false,
        planState: "new",
        changedFields: [],
        changeIds: [change.id],
        participants: [],
      });
    }
  }

  // 5) Zusammenführen, entfernte Termine rausnehmen
  const merged = [...sessions.filter((s) => !removedSessionIds.has(s.id)), ...generated];

  // 6) Feste Zuteilungen aus dem Plan auf die Termine legen
  const customerIds = Array.from(
    new Set(active.map((c) => c.customer_id).filter((id): id is string => !!id))
  );
  const { data: customerRows } = customerIds.length
    ? await db.from("customers").select("id, name, email").in("id", customerIds)
    : { data: [] as any[] };
  const customerById = new Map((customerRows ?? []).map((c: any) => [c.id, c]));

  for (const change of active.filter((c) => c.kind === "enrollment_add")) {
    if (!change.customer_id || !change.effective_from) continue;
    const customer = customerById.get(change.customer_id);
    if (!customer) continue;
    const until: string | null = change.payload?.validUntil ?? null;

    for (const session of merged) {
      const belongs = change.course_id
        ? session.courseId === change.course_id
        : change.target_change_id
        ? session.changeIds.includes(change.target_change_id)
        : false;
      if (!belongs) continue;
      if (session.date < change.effective_from) continue;
      if (until && session.date > until) continue;
      if (session.cancelled) continue;
      if (session.participants.some((p) => p.email && p.email === customer.email)) continue;

      session.participants.push({
        name: customer.name,
        email: customer.email ?? "",
        status: "confirmed",
        source: "enrollment",
        origin: "planned",
        changeId: change.id,
      });
      if (session.planState === "unchanged") session.planState = "changed";
      if (!session.changeIds.includes(change.id)) session.changeIds.push(change.id);
    }
  }

  for (const change of active.filter((c) => c.kind === "enrollment_end")) {
    if (!change.customer_id || !change.effective_from) continue;
    const customer = customerById.get(change.customer_id);
    if (!customer) continue;

    for (const session of merged) {
      if (change.course_id && session.courseId !== change.course_id) continue;
      if (session.date < change.effective_from) continue;
      for (const participant of session.participants) {
        if (participant.email && participant.email === customer.email) {
          if (participant.origin === "planned") {
            participant.removedByPlan = true;
          } else {
            participant.removedByPlan = true;
            if (session.planState === "unchanged") session.planState = "changed";
            if (!session.changeIds.includes(change.id)) session.changeIds.push(change.id);
          }
        }
      }
    }
  }

  merged.sort((a, b) =>
    a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)
  );

  const stale: StaleChange[] = changes
    .filter((c) => staleMap.has(c.id))
    .map((c) => ({ changeId: c.id, kind: c.kind, reason: staleMap.get(c.id)! }));

  return { sessions: merged, stale };
}

export type PlanWarning = {
  type: "overbooked" | "double_booked";
  date: string;
  message: string;
};

/**
 * Warnungen auf der zusammengerechneten Ansicht:
 *
 *   overbooked     mehr bestätigte Plätze belegt als Kapazität — geplante
 *                  Zuteilungen und bestehende echte Buchungen zählen gleich,
 *                  so wie im echten Kalender auch. Überbuchung bleibt erlaubt,
 *                  wird aber rot.
 *   double_booked  dieselbe Person läuft am selben Tag in zwei Kursen, deren
 *                  Zeitfenster sich überschneiden. Fällt sonst erst auf, wenn
 *                  jemand vor der Tür steht.
 */
export function findPlanWarnings(sessions: PlanSession[]): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  function startMinutes(s: PlanSession) {
    const [h, m] = (s.time ?? "00:00").split(":").map(Number);
    return h * 60 + m;
  }
  function endMinutes(s: PlanSession) {
    return startMinutes(s) + (s.durationMinutes ?? 70);
  }
  function activeParticipants(s: PlanSession) {
    return s.participants.filter((p) => !p.removedByPlan && p.status === "confirmed");
  }

  for (const session of sessions) {
    if (session.cancelled) continue;
    const count = activeParticipants(session).length;
    if (session.capacity > 0 && count > session.capacity) {
      warnings.push({
        type: "overbooked",
        date: session.date,
        message: `${session.courseName} am ${formatDE(session.date)}: ${count} Plätze belegt bei ${session.capacity} Kapazität.`,
      });
    }
  }

  // Dieselbe Person in überlappenden Terminen am selben Tag
  const byDate = new Map<string, PlanSession[]>();
  for (const s of sessions) {
    if (s.cancelled) continue;
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  for (const [date, list] of Array.from(byDate.entries())) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!(startMinutes(a) < endMinutes(b) && startMinutes(b) < endMinutes(a))) continue;

        const aPeople = new Map(activeParticipants(a).map((p) => [p.email || p.name, p]));
        for (const p of activeParticipants(b)) {
          const key = p.email || p.name;
          if (!aPeople.has(key)) continue;
          // Nur melden, wenn mindestens eine Seite aus dem Plan stammt —
          // bestehende Doppelbuchungen der echten Welt sind Sache des
          // Reiters Meldungen, nicht der Planung.
          const fromPlan = p.origin === "planned" || aPeople.get(key)!.origin === "planned";
          if (!fromPlan) continue;
          warnings.push({
            type: "double_booked",
            date,
            message: `${p.name} läuft am ${formatDE(date)} zeitgleich in „${a.courseName}" und „${b.courseName}".`,
          });
        }
      }
    }
  }

  return warnings;
}

export type RoomConflict = {
  date: string;
  room: string;
  a: { id: string; courseName: string; time: string; planState: string };
  b: { id: string; courseName: string; time: string; planState: string };
};

/**
 * Raum-Doppelbelegung INNERHALB der zusammengerechneten Ansicht. Dieselbe
 * Regel wie im Reiter Meldungen (gleicher Raum, gleicher Tag, überlappende
 * Zeitfenster aus Startzeit + Dauer), nur eben auf den Plan angewendet.
 * Ohne das würde eine Raumumverteilung erst nach dem Veröffentlichen auffallen.
 */
export function findRoomConflicts(sessions: PlanSession[]): RoomConflict[] {
  const conflicts: RoomConflict[] = [];

  function endMinutes(s: PlanSession) {
    const [h, m] = (s.time ?? "00:00").split(":").map(Number);
    return h * 60 + m + (s.durationMinutes ?? 70);
  }
  function startMinutes(s: PlanSession) {
    const [h, m] = (s.time ?? "00:00").split(":").map(Number);
    return h * 60 + m;
  }

  const relevant = sessions.filter((s) => !s.cancelled && s.room && s.time);
  for (let i = 0; i < relevant.length; i++) {
    for (let j = i + 1; j < relevant.length; j++) {
      const a = relevant[i];
      const b = relevant[j];
      if (a.date !== b.date || a.room !== b.room) continue;
      if (startMinutes(a) < endMinutes(b) && startMinutes(b) < endMinutes(a)) {
        conflicts.push({
          date: a.date,
          room: a.room!,
          a: { id: a.id, courseName: a.courseName, time: a.time ?? "", planState: a.planState },
          b: { id: b.id, courseName: b.courseName, time: b.time ?? "", planState: b.planState },
        });
      }
    }
  }
  return conflicts;
}

/**
 * Beschreibt eine geplante Änderung in einem Satz, für die Änderungsliste im
 * Plan und später für die Vorabprüfung beim Veröffentlichen.
 */
export function describeChange(
  change: PlanChange,
  courseName?: string | null,
  customerName?: string | null
) {
  const p = change.payload ?? {};
  const at = change.effective_from ? ` ab ${formatDE(change.effective_from)}` : "";
  switch (change.kind) {
    case "course_create":
      return `Neuer Kurs „${p.name ?? "ohne Namen"}"${at}`;
    case "course_update": {
      const fields = Object.keys(p)
        .map((k) => FIELD_LABELS[k] ?? k)
        .join(", ");
      return `„${courseName ?? "Kurs"}" ändern${at}${fields ? ` (${fields})` : ""}`;
    }
    case "course_end":
      return `„${courseName ?? "Kurs"}" beenden${at}`;
    case "enrollment_add":
      return `${customerName ?? "Schülerin"} fest zuteilen zu „${courseName ?? "Kurs"}"${at}`;
    case "enrollment_end":
      return `Feste Zuteilung von ${customerName ?? "Schülerin"} zu „${courseName ?? "Kurs"}" beenden${at}`;
    default:
      return "Unbekannte Änderung";
  }
}

export const FIELD_LABELS: Record<string, string> = {
  name: "Bezeichnung",
  level: "Level",
  category: "Kategorie",
  room: "Raum",
  startTime: "Uhrzeit",
  weekday: "Wochentag",
  durationMinutes: "Dauer",
  capacity: "Kapazität",
  trainerId: "Trainer:in",
  instructor: "Trainer:in (Freitext)",
  endDate: "Enddatum",
  startDate: "Startdatum",
  isSingle: "Einzeltermin",
};
