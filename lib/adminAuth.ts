import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 Tage

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.TRAINER_SESSION_SECRET || "insecure-fallback-secret";
}

export function signAdminSession(adminId: string): string {
  const payload = JSON.stringify({ id: adminId, exp: Date.now() + SESSION_DURATION_MS });
  const body = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAdminSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.id as string;
  } catch {
    return null;
  }
}

export type CurrentAdmin = { id: string; name: string; email: string };

// Liest die Session-Cookie, prüft sie und lädt das zugehörige, aktive
// Admin-Konto. Zentrale Zugriffskontrolle für ALLE /api/admin/*-Routen.
export async function requireAdmin(): Promise<CurrentAdmin | null> {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  const adminId = verifyAdminSession(token);
  if (!adminId) return null;

  const db = supabaseAdmin();
  const { data: admin } = await db.from("admins").select("id, name, email, active").eq("id", adminId).maybeSingle();
  if (!admin || !admin.active) return null;
  return { id: admin.id, name: admin.name, email: admin.email };
}
