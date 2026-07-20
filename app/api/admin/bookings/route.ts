import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/bookings?password=...
// Ganz einfacher Schutz über ein gemeinsames Passwort (ADMIN_PASSWORD in .env.local).
// Für mehr Sicherheit später durch echten Login (Supabase Auth) ersetzen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const password = url.searchParams.get("password");

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: sessions, error } = await db
    .from("course_sessions")
    .select(
      `id, session_date, cancelled, capacity_override,
       course:courses ( name, level, start_time, capacity ),
       bookings ( id, status, customer:customers ( name, email ) )`
    )
    .gte("session_date", new Date().toISOString().slice(0, 10))
    .order("session_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (sessions ?? []).map((s: any) => ({
    id: s.id,
    date: s.session_date,
    cancelled: s.cancelled,
    courseName: s.course?.name,
    level: s.course?.level,
    time: s.course?.start_time,
    capacity: s.capacity_override ?? s.course?.capacity,
    participants: (s.bookings ?? []).filter((b: any) => b.status === "confirmed").map((b: any) => ({
      name: b.customer?.name,
      email: b.customer?.email,
    })),
  }));

  return NextResponse.json({ sessions: result });
}
