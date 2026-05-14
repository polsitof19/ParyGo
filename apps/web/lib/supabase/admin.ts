import { createClient as createServerOnlyClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from './database.types';

// Service-role client — BYPASSES RLS. Server-only.
// Use sparingly: webhooks, admin operations explicitly checked, system jobs.
// Every call site MUST verify caller permissions before issuing the call.
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must not be called from the browser');
  }
  return createServerOnlyClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
