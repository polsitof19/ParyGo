import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from './database.types';

// Server Component / Server Action / Route Handler client.
// Reads/writes auth cookies via next/headers.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // setAll called from a Server Component — Next.js disallows mutation,
            // safe to ignore. Auth state still works via middleware refresh.
          }
        },
      },
    }
  );
}
