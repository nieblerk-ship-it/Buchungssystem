import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { ensureEnrollmentBookings } from "@/lib/enrollments";

// GET /api/admin/courses
// Liefert ALLE Kurse (auch inaktive) inkl. ihrer Bezeichnung.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("courses")
    .select("*, course_type:course_types(id, name, category)")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: data });
}

// POST /api/admin/courses
// body: { courseTypeId?, newTypeName?, category, level, instructor, room, trainer_id,
//         isSingle, singleDate?, weekday?, startDate?, endDate?,
//         start_time, duration_minutes, capacity, notes }
//
// Legt eine Kurs-Instanz an. Entweder mit vorhandener Bezeichnung
// (courseTypeId) oder mit neuer, manuell eingetragener (newTypeName).
// isSingle=true  -> genau ein Termin am singleDate
// isSingle=false -> wöchentlich am gewählten Wochentag zwischen startDate und endDate
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const {
    courseTypeId, newTypeName, category, level, instructor, room, trainer_id,
    isSingle, singleDate, weekday, startDate, endDate,
    start_time, duration_minutes, capacity, notes,
  } = body;

  if (!start_time || !capacity) {
    return NextResponse.json({ error: "Bitte Startzeit und Kapazität angeben." }, { status: 400 });
  }
  if (isSingle && !singleDate) {
    return NextResponse.json({ error: "Bitte ein Datum für den Einzeltermin angeben." }, { status: 400 });
  }
  if (!isSingle && (!weekday || !startDate || !endDate)) {
    return NextResponse.json({ error: "Bitte Wochentag, Start- und Enddatum angeben." }, { status: 400 });
  }
  if (!isSingle && endDate < startDate) {
    return NextResponse.json({ error: "Das Enddatum liegt vor dem Startdatum." }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Bezeichnung ermitteln oder neu anlegen
  let typeId = courseTypeId as string | undefined;
  let typeName = "";
  if (typeId) {
    const { data: ct } = await db.from("course_types").select("name, category").eq("id", typeId).maybeSingle();
    if (!ct) return NextResponse.json({ error: "Kursbezeichnung nicht gefunden." }, { status: 404 });
    typeName = ct.name;
  } else if (newTypeName?.trim()) {
    const name = newTypeName.trim();
    const { data: existing } = await db.from("course_types").select("id, name").eq("name", name).maybeSingle();
    if (existing) {
      typeId = existing.id;
      typeName = existing.name;
    } else {
      const { data: created, error: ctErr } = await db
        .from("course_types")
        .insert({ name, category: category?.trim() || "Pole", default_level: level?.trim() || null, default_capacity: capacity, default_duration_minutes: duration_minutes || 70 })
        .select("id, name")
        .single();
      if (ctErr) return NextResponse.json({ error: ctErr.message }, { status: 500 });
      typeId = created.id;
      typeName = created.name;
      await logAction(admin, "create", "course_type", created.id, `Kursbezeichnung "${name}" angelegt`);
    }
  } else {
    return NextResponse.json({ error: "Bitte eine Kursbezeichnung wählen oder neu eintragen." }, { status: 400 });
  }

  const effectiveWeekday = isSingle ? isoWeekdayOf(singleDate) : weekday;

  const { data: course, error } = await db
    .from("courses")
    .insert({
      course_type_id: typeId,
      name: typeName,
      category: category?.trim() || "Pole",
      level: level?.trim() || null,
      instructor: instructor?.trim() || null,
      room: room?.trim() || null,
      trainer_id: trainer_id || null,
      weekday: effectiveWeekday,
      start_time,
      duration_minutes: duration_minutes || 70,
      capacity,
      notes: notes?.trim() || null,
      is_single: !!isSingle,
      start_date: isSingle ? singleDate : startDate,
      end_date: isSingle ? singleDate : endDate,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const created = await generateSessions(db, course.id, {
    isSingle: !!isSingle,
    singleDate,
    weekday: effectiveWeekday,
    startDate,
    endDate,
  });
  await ensureEnrollmentBookings(db, course.id);
  await logAction(
    admin, "create", "course", course.id,
    `Kurs "${typeName}" angelegt (${isSingle ? `Einzeltermin ${singleDate}` : `wöchentlich ${startDate} bis ${endDate}`}, ${created} Termine)`
  );

  return NextResponse.json({ id: course.id, sessionsCreated: created });
}

// PATCH /api/admin/courses
// body: { id, ...felder, regenerate?: boolean }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, regenerate, course_type, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("courses").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (regenerate && fields.weekday && fields.start_date && fields.end_date) {
    await generateSessions(db, id, {
      isSingle: false,
      weekday: fields.weekday,
      startDate: fields.start_date,
      endDate: fields.end_date,
    });
  }
  await ensureEnrollmentBookings(db, id);
  await logAction(admin, "update", "course", id, `Kurs "${fields.name ?? id}" bearbeitet`);

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/courses?id=...
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("courses").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "deactivate", "course", id, "Kurs deaktiviert");
  return NextResponse.json({ ok: true });
}

function isoWeekdayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return ((d.getDay() + 6) % 7) + 1; // 1=Mo ... 7=So
}

async function generateSessions(
  db: ReturnType<typeof supabaseAdmin>,
  courseId: string,
  opts: { isSingle: boolean; singleDate?: string; weekday?: number; startDate?: string; endDate?: string }
) {
  const rows: { course_id: string; session_date: string }[] = [];

  if (opts.isSingle && opts.singleDate) {
    rows.push({ course_id: courseId, session_date: opts.singleDate });
  } else if (opts.weekday && opts.startDate && opts.endDate) {
    const start = new Date(opts.startDate + "T00:00:00");
    const end = new Date(opts.endDate + "T00:00:00");
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard < 800) {
      const isoWeekday = ((cursor.getDay() + 6) % 7) + 1;
      if (isoWeekday === opts.weekday) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, "0");
        const d = String(cursor.getDate()).padStart(2, "0");
        rows.push({ course_id: courseId, session_date: `${y}-${m}-${d}` });
      }
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
  }

  if (rows.length === 0) return 0;
  await db.from("course_sessions").upsert(rows, { onConflict: "course_id,session_date", ignoreDuplicates: true });
  return rows.length;
}
