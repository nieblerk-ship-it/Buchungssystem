import crypto from "crypto";

export const TRAINER_COOKIE_NAME = "trainer_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 Tage

function getSecret() {
  // Eigenes Secret bevorzugt; falls nicht gesetzt, Fallback auf ADMIN_PASSWORD,
  // damit die App auch ohne zusätzlichen Setup-Schritt funktioniert.
  return process.env.TRAINER_SESSION_SECRET || process.env.ADMIN_PASSWORD || "insecure-fallback-secret";
}

export function signTrainerSession(trainerId: string): string {
  const payload = JSON.stringify({ id: trainerId, exp: Date.now() + SESSION_DURATION_MS });
  const body = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyTrainerSession(token: string | undefined | null): string | null {
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
