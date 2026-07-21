import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword as checkPassword } from "@/lib/adminAuth";
import { ensureEnrollmentBookings } from "@/lib/enrollments";

// GET /api/admin/courses?password=...
// Liefert ALLE Kurse (auch inaktive), zum Bearbeiten in der Admin-Oberfläche.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("courses")
    .select("*")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: data });
}

// POST /api/admin/courses
// body: { password, name, category, level, instructor, weekday, start_time,
//         duration_minutes, capacity, notes }
// Legt einen neuen Kurs an und erzeugt direkt Termine für die nächsten 4 Wochen.
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { name, category, level, instructor, weekday, start_time, duration_minutes, capacity, notes } = body;

  if (!name?.trim() || !category?.trim() || !weekday || !start_time || !capacity) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder ausfüllen." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: course, error } = await db
    .from("courses")
    .insert({
      name: name.trim(),
      category: category.trim(),
      level: level?.trim() || null,
      instructor: instructor?.trim() || null,
      weekday,
      start_time,
      duration_minutes: duration_minutes || 70,
      capacity,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await generateSessionsForCourse(db, course.id, weekday, 28);
  await ensureEnrollmentBookings(db, course.id);

  return NextResponse.json({ id: course.id });
}

// PATCH /api/admin/courses
// body: { password, id, ...felder, regenerate?: boolean }
// Aktualisiert einen bestehenden Kurs. Falls sich der Wochentag ändert und
// regenerate=true übergeben wird, werden zusätzlich neue Termine erzeugt.
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, regenerate, password, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("courses").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (regenerate && fields.weekday) {
    await generateSessionsForCourse(db, id, fields.weekday, 28);
  }
  await ensureEnrollmentBookings(db, id);

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/courses?password=...&id=...
// Deaktiviert einen Kurs (soft delete) statt ihn zu löschen, damit alte
// Buchungen/Termine erhalten bleiben.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("courses").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function generateSessionsForCourse(db: ReturnType<typeof supabaseAdmin>, courseId: string, weekday: number, days: number) {
  const rows: { course_id: string; session_date: string }[] = [];
  const today = new Date();
  for (let i = 0; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const isoWeekday = ((d.getDay() + 6) % 7) + 1; // 1=Mo ... 7=So
    if (isoWeekday === weekday) {
      rows.push({ course_id: courseId, session_date: d.toISOString().slice(0, 10) });
    }
  }
  if (rows.length === 0) return;
  await db.from("course_sessions").upsert(rows, { onConflict: "course_id,session_date", ignoreDuplicates: true });
}
