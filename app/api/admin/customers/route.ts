import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/customers?password=...
// Liefert alle Schüler:innen inkl. ihrer zugewiesenen Produkte.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("customers")
    .select(
      `id, name, email, phone, level, notes, created_at,
       customer_products (
         id, valid_from, valid_until, credits_total, credits_remaining, active, notes,
         product:products ( id, name, category, requires_payment_confirmation, allowed_categories )
       )`
    )
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data });
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
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, password, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("customers").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/customers?password=...&id=...
// Löscht eine:n Schüler:in vollständig (inkl. Buchungen & Produktzuweisungen
// per Datenbank-Kaskade). Wird über einen Bestätigungsdialog im Frontend abgesichert.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Schüler-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("customers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
