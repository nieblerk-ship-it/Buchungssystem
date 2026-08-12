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
// body: { id, courseTypeId?, newTypeName?, category?, level?, instructor?, room?,
//         trainer_id?, weekday?, start_time?, duration_minutes?, capacity?, notes?,
//         endDate?, splitFrom? }
//
// Bearbeitet einen Kurs. WICHTIG: Änderungen wirken sich nur auf künftige
// Termine aus — bereits stattgefundene Termine bleiben unverändert erhalten,
// damit die Dokumentation stimmt.
//
// splitFrom (Datum): Ändert den Kurs AB DIESEM TERMIN. Die bisherige Kursreihe
//   wird am Tag davor beendet und behält alle ihre Termine unverändert
//   (inklusive Buchungen und Anwesenheiten). Ab dem Stichtag entsteht eine NEUE
//   Kursreihe mit den geänderten Daten — so steht z.B. ein Beginner-Kurs von
//   vor einem Monat weiterhin als "Beginner" im Kalender, obwohl die Gruppe
//   inzwischen als "Intermediate" weiterläuft. Buchungen der künftigen Termine
//   werden dabei in die neue Reihe übernommen.
//
// - Ändert sich Wochentag oder die Laufzeit (endDate), werden künftige Termine
//   neu erzeugt: alle Termine nach heute werden entfernt und für den neuen
//   Zeitraum/Wochentag neu angelegt.
// - endDate darf nicht in der Vergangenheit liegen.
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, courseTypeId, newTypeName, endDate, splitFrom, course_type, regenerate, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: before } = await db
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Kurs nicht gefunden." }, { status: 404 });

  // ---- Variante A: Änderung ab einem bestimmten Termin (Kurs-Split) ----
  if (splitFrom && !before.is_single) {
    if (splitFrom <= today) {
      return NextResponse.json({
        error: "Eine Änderung ab einem vergangenen oder heutigen Termin ist nicht möglich — sonst würde sich die bereits dokumentierte Vergangenheit ändern. Bitte einen künftigen Termin wählen.",
      }, { status: 400 });
    }
    return await splitCourse(db, admin, id, before, splitFrom, { courseTypeId, newTypeName, endDate, ...fields });
  }

  const updates: Record<string, unknown> = { ...fields };

  // Kursbezeichnung wechseln (z.B. Gruppe steigt ins nächste Level auf)
  if (courseTypeId || newTypeName?.trim()) {
    let typeId = courseTypeId as string | undefined;
    let typeName = "";
    if (typeId) {
      const { data: ct } = await db.from("course_types").select("name, category").eq("id", typeId).maybeSingle();
      if (!ct) return NextResponse.json({ error: "Kursbezeichnung nicht gefunden." }, { status: 404 });
      typeName = ct.name;
      if (!updates.category) updates.category = ct.category;
    } else {
      const name = newTypeName.trim();
      const { data: existing } = await db.from("course_types").select("id, name").eq("name", name).maybeSingle();
      if (existing) {
        typeId = existing.id;
        typeName = existing.name;
      } else {
        const { data: created, error: ctErr } = await db
          .from("course_types")
          .insert({ name, category: (updates.category as string) || "Pole" })
          .select("id, name")
          .single();
        if (ctErr) return NextResponse.json({ error: ctErr.message }, { status: 500 });
        typeId = created.id;
        typeName = created.name;
        await logAction(admin, "create", "course_type", created.id, `Kursbezeichnung "${name}" angelegt`);
      }
    }
    updates.course_type_id = typeId;
    updates.name = typeName;
  }

  // Laufzeit ändern — nie in die Vergangenheit
  let regenerateSessions = false;
  if (endDate !== undefined && endDate !== null && endDate !== "") {
    if (endDate < today) {
      return NextResponse.json({
        error: "Das Enddatum darf nicht in der Vergangenheit liegen. Um einen Kurs jetzt zu beenden, nutze bitte \"Kurs beenden\".",
      }, { status: 400 });
    }
    updates.end_date = endDate;
    regenerateSessions = true;
  }
  if (fields.weekday !== undefined && fields.weekday !== before.weekday) {
    regenerateSessions = true;
  }

  const { error } = await db.from("courses").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let removed = 0;
  let created = 0;
  if (regenerateSessions && !before.is_single) {
    const effectiveWeekday = (updates.weekday as number) ?? before.weekday;
    const effectiveEnd = (updates.end_date as string) ?? before.end_date;
    removed = await removeFutureSessions(db, id, today);
    if (effectiveEnd && effectiveEnd > today) {
      const startFrom = new Date(today);
      startFrom.setDate(startFrom.getDate() + 1);
      created = await generateSessions(db, id, {
        isSingle: false,
        weekday: effectiveWeekday,
        startDate: startFrom.toISOString().slice(0, 10),
        endDate: effectiveEnd,
      });
    }
    await ensureEnrollmentBookings(db, id);
  }

  await logAction(
    admin, "update", "course", id,
    `Kurs "${updates.name ?? before.name}" bearbeitet` +
    (regenerateSessions ? ` (künftige Termine neu erzeugt: ${removed} entfernt, ${created} angelegt; Vergangenheit unverändert)` : "")
  );

  return NextResponse.json({ ok: true, removedFuture: removed, createdFuture: created });
}

// DELETE /api/admin/courses?id=...&mode=end|purge
//
// mode=end (Standard): Kurs zum heutigen Tag beenden. Vergangene und heutige
//   Termine bleiben vollständig erhalten (Dokumentation!), alle künftigen
//   Termine werden entfernt — inklusive ihrer Buchungen, da sie ja nicht
//   mehr stattfinden.
// mode=purge: Kurs vollständig löschen. Nur erlaubt, wenn es KEINE
//   vergangenen Termine mit Buchungen gibt, damit keine dokumentierte
//   Vergangenheit verloren geht.
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const mode = url.searchParams.get("mode") ?? "end";
  if (!id) return NextResponse.json({ error: "Kurs-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data: course } = await db.from("courses").select("name").eq("id", id).maybeSingle();
  if (!course) return NextResponse.json({ error: "Kurs nicht gefunden." }, { status: 404 });

  if (mode === "purge") {
    const { data: pastSessions } = await db
      .from("course_sessions")
      .select("id")
      .eq("course_id", id)
      .lt("session_date", today);
    const pastIds = (pastSessions ?? []).map((s) => s.id);

    if (pastIds.length > 0) {
      const { count } = await db
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("course_session_id", pastIds);
      if ((count ?? 0) > 0) {
        return NextResponse.json({
          error: "Dieser Kurs hat bereits stattgefundene Termine mit Buchungen und kann deshalb nicht vollständig gelöscht werden. Bitte stattdessen beenden — die Vergangenheit bleibt dann als Nachweis erhalten.",
        }, { status: 409 });
      }
    }

    await db.from("courses").delete().eq("id", id);
    await logAction(admin, "delete", "course", id, `Kurs "${course.name}" vollständig gelöscht (keine dokumentierte Vergangenheit vorhanden)`);
    return NextResponse.json({ ok: true, purged: true });
  }

  const removed = await removeFutureSessions(db, id, today);
  await db.from("courses").update({ ended_on: today, end_date: today }).eq("id", id);
  await db.from("enrollments").update({ active: false }).eq("course_id", id).eq("active", true);

  await logAction(admin, "end", "course", id, `Kurs "${course.name}" zum ${today} beendet (${removed} künftige Termine entfernt, Vergangenheit bleibt erhalten)`);
  return NextResponse.json({ ok: true, removedFuture: removed });
}

// Entfernt alle Termine eines Kurses NACH dem Stichtag (inkl. deren Buchungen).
// Vergangene und heutige Termine bleiben immer unangetastet.
async function removeFutureSessions(db: ReturnType<typeof supabaseAdmin>, courseId: string, afterDate: string) {
  const { data: futureSessions } = await db
    .from("course_sessions")
    .select("id")
    .eq("course_id", courseId)
    .gt("session_date", afterDate);
  const futureIds = (futureSessions ?? []).map((s) => s.id);
  if (futureIds.length === 0) return 0;
  await db.from("bookings").delete().in("course_session_id", futureIds);
  await db.from("course_sessions").delete().in("id", futureIds);
  return futureIds.length;
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

// Beendet die bisherige Kursreihe am Tag vor `splitFrom` und legt ab diesem
// Datum eine neue Kursreihe mit den geänderten Daten an. Künftige Termine der
// alten Reihe werden mitsamt ihren Buchungen in die neue Reihe übernommen,
// vergangene Termine bleiben unangetastet bei der alten Reihe.
async function splitCourse(
  db: ReturnType<typeof supabaseAdmin>,
  admin: { id: string; name: string; email: string },
  oldCourseId: string,
  before: any,
  splitFrom: string,
  changes: any
) {
  const dayBefore = new Date(splitFrom + "T00:00:00");
  dayBefore.setDate(dayBefore.getDate() - 1);
  const endOfOld = dayBefore.toISOString().slice(0, 10);

  // Bezeichnung der neuen Reihe ermitteln
  let typeId: string | null = before.course_type_id ?? null;
  let typeName: string = before.name;
  if (changes.courseTypeId) {
    const { data: ct } = await db.from("course_types").select("name, category").eq("id", changes.courseTypeId).maybeSingle();
    if (!ct) return NextResponse.json({ error: "Kursbezeichnung nicht gefunden." }, { status: 404 });
    typeId = changes.courseTypeId;
    typeName = ct.name;
    if (!changes.category) changes.category = ct.category;
  } else if (changes.newTypeName?.trim()) {
    const name = changes.newTypeName.trim();
    const { data: existing } = await db.from("course_types").select("id, name").eq("name", name).maybeSingle();
    if (existing) {
      typeId = existing.id;
      typeName = existing.name;
    } else {
      const { data: created, error: ctErr } = await db
        .from("course_types")
        .insert({ name, category: changes.category || before.category || "Pole" })
        .select("id, name")
        .single();
      if (ctErr) return NextResponse.json({ error: ctErr.message }, { status: 500 });
      typeId = created.id;
      typeName = created.name;
      await logAction(admin, "create", "course_type", created.id, `Kursbezeichnung "${name}" angelegt`);
    }
  }

  const newEnd = changes.endDate || before.end_date;
  const newWeekday = changes.weekday ?? before.weekday;

  // Neue Kursreihe anlegen
  const { data: newCourse, error: insErr } = await db
    .from("courses")
    .insert({
      course_type_id: typeId,
      name: typeName,
      category: changes.category ?? before.category,
      level: changes.level !== undefined ? (changes.level || null) : before.level,
      instructor: changes.instructor !== undefined ? (changes.instructor || null) : before.instructor,
      room: changes.room ?? before.room,
      trainer_id: changes.trainer_id !== undefined ? (changes.trainer_id || null) : before.trainer_id,
      weekday: newWeekday,
      start_time: changes.start_time ?? before.start_time,
      duration_minutes: changes.duration_minutes ?? before.duration_minutes,
      capacity: changes.capacity ?? before.capacity,
      notes: changes.notes !== undefined ? (changes.notes || null) : before.notes,
      is_single: false,
      start_date: splitFrom,
      end_date: newEnd,
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Alte Reihe am Tag davor beenden
  await db.from("courses").update({ ended_on: endOfOld, end_date: endOfOld }).eq("id", oldCourseId);

  // Künftige Termine der alten Reihe an die neue Reihe übergeben (Buchungen
  // bleiben dadurch automatisch erhalten, da sie am Termin hängen).
  const { data: movedSessions } = await db
    .from("course_sessions")
    .select("id, session_date")
    .eq("course_id", oldCourseId)
    .gte("session_date", splitFrom);
  const movedIds = (movedSessions ?? []).map((s) => s.id);

  let moved = 0;
  for (const s of movedSessions ?? []) {
    // Termine, die nicht mehr zum neuen Wochentag/Zeitraum passen, entfernen
    const d = new Date(s.session_date + "T00:00:00");
    const isoWeekday = ((d.getDay() + 6) % 7) + 1;
    const outOfRange = (newEnd && s.session_date > newEnd) || isoWeekday !== newWeekday;
    if (outOfRange) {
      await db.from("bookings").delete().eq("course_session_id", s.id);
      await db.from("course_sessions").delete().eq("id", s.id);
    } else {
      await db.from("course_sessions").update({ course_id: newCourse.id }).eq("id", s.id);
      moved++;
    }
  }

  // Fehlende Termine der neuen Reihe ergänzen
  const created = await generateSessions(db, newCourse.id, {
    isSingle: false,
    weekday: newWeekday,
    startDate: splitFrom,
    endDate: newEnd,
  });

  // Feste Zuteilungen auf die neue Reihe umhängen
  await db.from("enrollments").update({ course_id: newCourse.id }).eq("course_id", oldCourseId).eq("active", true);
  await ensureEnrollmentBookings(db, newCourse.id);

  await logAction(
    admin, "split", "course", newCourse.id,
    `Kurs "${before.name}" ab ${splitFrom} geändert zu "${typeName}" — bisherige Reihe endet am ${endOfOld} und bleibt unverändert dokumentiert (${moved} Termine übernommen, ${Math.max(0, created - moved)} neu angelegt)`
  );

  return NextResponse.json({ ok: true, split: true, newCourseId: newCourse.id, movedSessions: moved });
}
