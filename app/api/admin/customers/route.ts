import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

const RETENTION_DAYS = 90;

// GET /api/admin/customers?password=...            -> aktive Schüler:innen
// GET /api/admin/customers?password=...&archived=1 -> Archiv
// Beim Öffnen des Archivs werden Einträge, deren Aufbewahrungsfrist
// (90 Tage nach Archivierung) abgelaufen ist, automatisch endgültig gelöscht.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const showArchived = url.searchParams.get("archived") === "1";
  const db = supabaseAdmin();

  if (showArchived) {
    // Automatische Bereinigung: alles endgültig löschen, was länger als 90 Tage
    // archiviert ist. Vorher Name/E-Mail in die Buchungen übernehmen, damit
    // vergangene Buchungen als Nachweis erhalten bleiben.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    const { data: expired } = await db
      .from("customers")
      .select("id, name, email")
      .not("archived_at", "is", null)
      .lt("archived_at", cutoff);
    for (const c of expired ?? []) {
      await db.from("bookings").update({ deleted_customer_name: c.name, deleted_customer_email: c.email }).eq("customer_id", c.id);
    }
    if (expired && expired.length > 0) {
      await db.from("customers").delete().in("id", expired.map((c) => c.id));
    }
  }

  let query = db
    .from("customers")
    .select(
      `id, name, email, phone, level, notes, created_at, archived_at,
       customer_products (
         id, valid_from, valid_until, credits_total, credits_remaining, active, notes, is_reduced, price_paid_cents,
         product:products ( id, name, category, requires_payment_confirmation, allowed_categories )
       )`
    )
    .order("name");

  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data, retentionDays: RETENTION_DAYS });
}

// POST /api/admin/customers
// body: { password, name, email, phone, level, notes }
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { name, email, phone, level, notes } = body;
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Bitte Name und E-Mail angeben." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customers")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      level: level?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/customers
// body: { password, id, ...felder }
// Sonderfelder: { archive: true } archiviert, { restore: true } stellt wieder her.
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, password, archive, restore, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const updateFields: Record<string, unknown> = { ...fields };
  if (archive) updateFields.archived_at = new Date().toISOString();
  if (restore) updateFields.archived_at = null;

  const db = supabaseAdmin();
  const { error } = await db.from("customers").update(updateFields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Beim Archivieren laufende feste Zuteilungen beenden, damit die Person
  // nicht weiter automatisch in Termine gebucht wird. Bestehende Buchungen
  // bleiben unverändert erhalten.
  if (archive) {
    await db.from("enrollments").update({ active: false }).eq("customer_id", id).eq("active", true);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/customers?password=...&id=...
// Endgültiges Löschen — nur für bereits archivierte Schüler:innen erlaubt
// (inkl. Buchungen & Produktzuweisungen per Datenbank-Kaskade).
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: customer } = await db.from("customers").select("name, email, archived_at").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Schüler:in nicht gefunden." }, { status: 404 });
  if (!customer.archived_at) {
    return NextResponse.json({ error: "Bitte zuerst archivieren — endgültiges Löschen ist nur aus dem Archiv möglich." }, { status: 409 });
  }

  // Name/E-Mail als Nachweis in die Buchungen übernehmen, bevor das Konto
  // gelöscht wird — die Buchungen selbst bleiben dauerhaft erhalten.
  await db.from("bookings").update({ deleted_customer_name: customer.name, deleted_customer_email: customer.email }).eq("customer_id", id);

  const { error } = await db.from("customers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
