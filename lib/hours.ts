import { supabaseAdmin } from "@/lib/supabase";

export type Db = ReturnType<typeof supabaseAdmin>;

export type HoursSession = {
  sessionId: string;
  date: string;
  courseName: string;
  level: string | null;
  room: string | null;
  time: string | null;
  durationMinutes: number;
  isSubstitute: boolean;
};

export type HoursGroup = {
  key: string;
  name: string;
  // 'account'      = Trainerin mit eigenem Konto
  // 'guest'        = nur als Freitext eingetragen (Gastdozent:in ohne Konto)
  // 'unassigned'   = niemand eingetragen
  kind: "account" | "guest" | "unassigned";
  trainerId: string | null;
  sessionCount: number;
  minutes: number;
  sessions: HoursSession[];
};

// Sammelt alle nicht abgesagten Termine im Zeitraum und ordnet sie der Person
// zu, die den Termin tatsächlich gehalten hat.
//
// Zwei bewusste Festlegungen:
//
// 1. Gezählt wird JEDER nicht abgesagte Termin — unabhängig davon, ob die
//    Anwesenheit erfasst wurde oder ob überhaupt jemand da war. Gearbeitet
//    wurde in jedem Fall.
// 2. Eine Vertretung auf Terminebene gewinnt vor der Trainer:in des Kurses:
//    die Stunde zählt für die Person, die den Termin übernommen hat, nicht
//    für die, die ihn abgegeben hat. Innerhalb einer Ebene hat ein verknüpftes
//    Trainer-Konto Vorrang vor dem freien Textfeld, damit die Stunden bei der
//    Person landen, die sie später auch abrechnet.
export async function collectHours(
  db: Db,
  from: string,
  to: string,
  trainerId?: string | null
): Promise<HoursGroup[]> {
  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, trainer_id, instructor,
       trainer:trainers ( id, name ),
       course:courses ( name, level, room, start_time, duration_minutes, instructor, trainer_id,
         trainer:trainers ( id, name ) )`
    )
    .eq("cancelled", false)
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: true })
    .limit(5000);

  if (error) throw new Error(error.message);

  const groups = new Map<string, HoursGroup>();

  for (const s of (sessions ?? []) as any[]) {
    const course = s.course ?? {};

    // Wer hat den Termin gehalten?
    let key: string;
    let name: string;
    let kind: HoursGroup["kind"];
    let tId: string | null = null;
    const isSubstitute = !!(s.trainer_id || s.instructor);

    if (s.trainer_id) {
      tId = s.trainer_id; key = `a:${tId}`; name = s.trainer?.name ?? "unbekannt"; kind = "account";
    } else if (s.instructor) {
      key = `g:${s.instructor}`; name = s.instructor; kind = "guest";
    } else if (course.trainer_id) {
      tId = course.trainer_id; key = `a:${tId}`; name = course.trainer?.name ?? "unbekannt"; kind = "account";
    } else if (course.instructor) {
      key = `g:${course.instructor}`; name = course.instructor; kind = "guest";
    } else {
      key = "none"; name = "Ohne Trainer:in"; kind = "unassigned";
    }

    if (trainerId && tId !== trainerId) continue;

    const duration = course.duration_minutes ?? 70;
    const entry: HoursSession = {
      sessionId: s.id,
      date: s.session_date,
      courseName: course.name ?? "Kurs",
      level: course.level ?? null,
      room: course.room ?? null,
      time: course.start_time ?? null,
      durationMinutes: duration,
      isSubstitute,
    };

    const g = groups.get(key) ?? { key, name, kind, trainerId: tId, sessionCount: 0, minutes: 0, sessions: [] };
    g.sessionCount += 1;
    g.minutes += duration;
    g.sessions.push(entry);
    groups.set(key, g);
  }

  // Trainerinnen mit Konto zuerst, dann Gastdozent:innen, ganz zuletzt die
  // unbesetzten Termine — innerhalb der Gruppen alphabetisch.
  const order = { account: 0, guest: 1, unassigned: 2 };
  return Array.from(groups.values()).sort(
    (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "de")
  );
}

// Minuten als Stundenwert mit zwei Nachkommastellen (1,5 = eineinhalb Stunden).
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

// Erster und letzter Tag des laufenden Monats als YYYY-MM-DD.
export function currentMonthRange(): { from: string; to: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { from: first, to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(lastDay)}` };
}
