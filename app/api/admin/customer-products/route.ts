import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminPassword } from "@/lib/adminAuth";

// POST /api/admin/customer-products
// body: { password, customerId, productId, valid_from?, valid_until?, credits_total?, notes? }
// Weist einer/einem Schüler:in ein Produkt zu. Laufzeit/Guthaben werden, falls
// nicht angegeben, aus dem Produkt übernommen (auch rückwirkend/nach Ablauf möglich).
export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { customerId, productId, valid_from, valid_until, credits_total, notes } = body;
  if (!customerId || !productId) {
    return NextResponse.json({ error: "Schüler und Produkt müssen angegeben sein." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: product, error: prodErr } = await db.from("products").select("*").eq("id", productId).single();
  if (prodErr || !product) return NextResponse.json({ error: "Produkt nicht gefunden." }, { status: 404 });

  const from = valid_from || new Date().toISOString().slice(0, 10);
  let until = valid_until || null;
  if (!until && product.valid_days) {
    const d = new Date(from);
    d.setDate(d.getDate() + product.valid_days);
    until = d.toISOString().slice(0, 10);
  }
  const credits = credits_total ?? product.credits ?? null;

  const { data, error } = await db
    .from("customer_products")
    .insert({
      customer_id: customerId,
      product_id: productId,
      valid_from: from,
      valid_until: until,
      credits_total: credits,
      credits_remaining: credits,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/admin/customer-products
// body: { password, id, valid_until?, credits_remaining?, active?, productId?, notes? }
// Admin kann jederzeit Laufzeit verlängern, Guthaben anpassen, das Produkt
// wechseln oder eine Zuweisung deaktivieren.
export async function PATCH(req: Request) {
  const body = await req.json();
  if (!checkAdminPassword(body.password)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const { id, password, productId, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  if (productId) (fields as any).product_id = productId;

  const db = supabaseAdmin();
  const { error } = await db.from("customer_products").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/customer-products?password=...&id=...
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  if (!checkAdminPassword(url.searchParams.get("password"))) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("customer_products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
