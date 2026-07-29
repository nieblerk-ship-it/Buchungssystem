import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  return NextResponse.json({ admin });
}
