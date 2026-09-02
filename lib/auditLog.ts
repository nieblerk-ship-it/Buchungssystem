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

// Gleicher Log, aber für Änderungen aus dem Trainer-Bereich. admin_id bleibt
// leer (die Person steht nicht in der admins-Tabelle), der Name wird als
// "Trainer:in <Name>" geschrieben, damit im Änderungslog auf einen Blick
// erkennbar ist, aus welchem Bereich die Änderung kam.
export async function logTrainerAction(
  trainerName: string,
  action: string,
  entityType: string,
  entityId: string | null,
  description: string
) {
  const db = supabaseAdmin();
  await db.from("audit_log").insert({
    admin_id: null,
    admin_name: `Trainer:in ${trainerName}`,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
  });
}
