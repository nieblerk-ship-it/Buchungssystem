import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export async function POST() {
  cookies().set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
