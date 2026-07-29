import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { logAction } from "@/lib/auditLog";

// GET /api/admin/products
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("products").select("*").order("category").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

// POST /api/admin/products
// body: { name, category, price_cents, reduced_price_cents, credits,
//         valid_days, allowed_categories, notes }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
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
  await logAction(admin, "create", "product", data.id, `Produkt "${name.trim()}" angelegt`);
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/products
// body: { id, ...felder }
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Produkt-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("products").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "update", "product", id, `Produkt "${fields.name ?? id}" bearbeitet`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/products?id=...
// Deaktiviert ein Produkt (soft delete).
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Produkt-ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("products").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(admin, "deactivate", "product", id, "Produkt deaktiviert");
  return NextResponse.json({ ok: true });
}
