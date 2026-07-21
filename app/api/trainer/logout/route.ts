import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TRAINER_COOKIE_NAME } from "@/lib/trainerAuth";

// POST /api/trainer/logout
export async function POST() {
  cookies().set(TRAINER_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
