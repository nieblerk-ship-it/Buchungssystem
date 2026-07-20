import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// GET /api/admin/products?password=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db.from("products").select("*").order("category").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

// POST /api/admin/products
// body: { password, name, category, price_cents, reduced_price_cents, credits,
//         valid_days, allowed_categories, notes }
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { name, category, price_cents, reduced_price_cents, credits, valid_days, allowed_categories, notes } = body;
  if (!name?.trim() || !category?.trim() || price_cents === undefined) {
    return NextResponse.json({ error: "Bitte Name, Kategorie und Preis angeben." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("products")
    .insert({
      name: name.trim(),
      category: category.trim(),
      price_cents,
      reduced_price_cents: reduced_price_cents || null,
      credits: credits || null,
      valid_days: valid_days || null,
      allowed_categories: allowed_categories?.length ? allowed_categories : null,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/products
// body: { password, id, ...felder }
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, password, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Produkt-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("products").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/products?password=...&id=...
// Deaktiviert ein Produkt (soft delete).
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Produkt-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("products").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
