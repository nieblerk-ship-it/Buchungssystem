import { supabaseAdmin } from "@/lib/supabase";

// Regel (ab Phase E2): eine explizite Freigabe/Sperre pro KURSBEZEICHNUNG
// gewinnt immer — sie gilt damit für alle Instanzen dieser Bezeichnung
// (z.B. "Beginner 2/3" in Raum 1 und Raum 2, egal bei welcher Trainerin).
// Ohne Override entscheidet, ob ein aktives Produkt die Kurs-Kategorie am
// Termindatum abdeckt.
export async function canBookCourse(
  db: ReturnType<typeof supabaseAdmin>,
  customerId: string,
  courseTypeId: string | null,
  courseCategory: string,
  sessionDate: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (courseTypeId) {
    const { data: override } = await db
      .from("customer_course_overrides")
      .select("access")
      .eq("customer_id", customerId)
      .eq("course_type_id", courseTypeId)
      .maybeSingle();

    if (override?.access === "deny") {
      return { allowed: false, reason: "Für diesen Kurs bist du aktuell nicht freigegeben. Bitte im Studio nachfragen." };
    }
    if (override?.access === "allow") {
      return { allowed: true };
    }
  }

  const { data: products } = await db
    .from("customer_products")
    .select("valid_from, valid_until, active, product:products(allowed_categories)")
    .eq("customer_id", customerId)
    .eq("active", true);

  const hasMatchingProduct = (products ?? []).some((cp: any) => {
    if (cp.valid_from && sessionDate < cp.valid_from) return false;
    if (cp.valid_until && sessionDate > cp.valid_until) return false;
    const allowed = cp.product?.allowed_categories;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(courseCategory);
  });

  if (!hasMatchingProduct) {
    return { allowed: false, reason: "Für diesen Kurs ist aktuell kein passendes Produkt hinterlegt. Bitte im Studio nachfragen." };
  }
  return { allowed: true };
}
