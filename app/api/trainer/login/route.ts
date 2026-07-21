import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { signTrainerSession, TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";

// POST /api/trainer/login
// body: { email, password }
export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Bitte E-Mail und Passwort angeben." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: trainer } = await db
    .from("trainers")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (!trainer) {
    return NextResponse.json({ error: "E-Mail oder Passwort falsch." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, trainer.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "E-Mail oder Passwort falsch." }, { status: 401 });
  }

  const token = signTrainerSession(trainer.id);
  cookies().set(TRAINER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ name: trainer.name });
}
