import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { signAdminSession, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

// POST /api/admin/login
// body: { email, password }
export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Bitte E-Mail und Passwort angeben." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: admin } = await db
    .from("admins")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: "E-Mail oder Passwort falsch." }, { status: 401 });
  }
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "E-Mail oder Passwort falsch." }, { status: 401 });
  }

  const token = signAdminSession(admin.id);
  cookies().set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ name: admin.name });
}
