import { createClient } from "@supabase/supabase-js";

// Client für Browser-Aufrufe (nur lesende, öffentliche Daten)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Client für Server-/API-Routen (voller Zugriff, service role key)
// WICHTIG: Nie im Frontend importieren.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
