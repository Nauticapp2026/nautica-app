import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con service_role. Omite RLS.
 * USAR SOLO en server-side para operaciones administrativas
 * (ej: invitaciones, jobs, webhooks). Nunca exponer al cliente.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
