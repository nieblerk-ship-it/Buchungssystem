import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";
import { promoteFromWaitlist } from "@/lib/waitlist";

// POST /api/admin/sessions/roster
// body: { sessionId, entries: [
//   { bookingId?, customerId?, newCustomerName?, newCustomerEmail?, targetStatus: 'confirmed'|'waitlisted'|'removed' }
// ] }
//
// Wendet alle Änderungen an der Teilnehmerliste eines Termins in einem
// Rutsch an (Save-Button im Admin-Bereich). Neue Personen werden wie
// normale Selbstbuchungen behandelt (source='self'). Kapazität wird NICHT
// blockierend geprüft — das Frontend holt vorher die Bestätigung bei
// Überbuchung ein. Nach dem Speichern rückt automatisch nach, falls durch
// Entfernungen Plätze frei geworden sind.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { sessionId, entries } = body;
  if (!sessionId || !Array.isArray(entries)) {
    return NextResponse.json({ error: "Termin und Änderungen müssen angegeben sein." }, { status: 400 });
  }

  const db = supabaseAdmin();

  for (const entry of entries) {
    const { bookingId, customerId, newCustomerName, newCustomerEmail, targetStatus } = entry;

    if (targetStatus === "removed") {
      if (bookingId) {
        await db.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
      }
      continue;
    }

    if (bookingId) {
      await db.from("bookings").update({ status: targetStatus }).eq("id", bookingId);
      continue;
    }

    // Neue Person zur Teilnehmerliste hinzufügen
    let resolvedCustomerId = customerId as string | undefined;
    if (!resolvedCustomerId && newCustomerEmail?.trim()) {
      const email = newCustomerEmail.trim().toLowerCase();
      const { data: existing } = await db.from("customers").select("id, archived_at").eq("email", email).maybeSingle();
      if (existing) {
        resolvedCustomerId = existing.id;
        if (existing.archived_at) await db.from("customers").update({ archived_at: null }).eq("id", existing.id);
      } else {
        const { data: created, error: custErr } = await db
          .from("customers")
          .insert({ name: newCustomerName?.trim() || email, email })
          .select("id")
          .single();
        if (custErr) continue;
        resolvedCustomerId = created.id;
      }
    }
    if (!resolvedCustomerId) continue;

    const { data: dup } = await db
      .from("bookings")
      .select("id")
      .eq("course_session_id", sessionId)
      .eq("customer_id", resolvedCustomerId)
      .in("status", ["confirmed", "waitlisted"])
      .maybeSingle();
    if (dup) continue; // schon angemeldet, nichts zu tun

    await db.from("bookings").insert({
      customer_id: resolvedCustomerId,
      course_session_id: sessionId,
      status: targetStatus === "waitlisted" ? "waitlisted" : "confirmed",
      source: "self",
    });
  }

  const promoted = await promoteFromWaitlist(db, sessionId);
  await logAction(admin, "update", "session_roster", sessionId, `Teilnehmerliste gespeichert (${entries.length} Änderungen, ${promoted} automatisch nachgerückt)`);

  return NextResponse.json({ ok: true, promoted });
}
