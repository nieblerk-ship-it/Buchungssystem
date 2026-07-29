import { supabaseAdmin } from "@/lib/supabase";
import type { CurrentAdmin } from "@/lib/adminAuth";

// Schreibt einen Eintrag in den unveränderlichen Änderungslog. Wird direkt
// nach jeder erfolgreichen Änderung durch einen Admin aufgerufen. Es gibt
// bewusst keine Funktion zum Bearbeiten oder Löschen von Log-Einträgen.
export async function logAction(
  admin: CurrentAdmin,
  action: string,
  entityType: string,
  entityId: string | null,
  description: string
) {
  const db = supabaseAdmin();
  await db.from("audit_log").insert({
    admin_id: admin.id,
    admin_name: admin.name,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
  });
}
