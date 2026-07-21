import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTrainerSession, TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";

// GET /api/trainer/me
// Prüft die Session und liefert Name/E-Mail der eingeloggten Trainerin.
export async function GET() {
  const token = cookies().get(TRAINER_COOKIE_NAME)?.value;
  const trainerId = verifyTrainerSession(token);
  if (!trainerId) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabaseAdmin();
  const { data: trainer, error } = await db.from("trainers").select("id, name, email").eq("id", trainerId).eq("active", true).maybeSingle();
  if (error || !trainer) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  return NextResponse.json({ trainer });
}
