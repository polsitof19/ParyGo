import { z } from 'zod';

// Validated at boot. Throwing here is intentional — we want the app to fail
// fast on misconfiguration rather than silently use undefined.

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  BRAND_CREDS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'Must be 32-byte hex (64 chars)'),
  // Resend is optional during early development; gated at call site.
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_EMAIL: z.string().email(),
  SENTRY_DSN: z.string().url().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // E.164 international format: optional '+' followed by 7-15 digits.
  // Stored as the canonical contact number — we strip the '+' at call sites
  // that need a wa.me URL.
  NEXT_PUBLIC_SUPPORT_WHATSAPP: z.string().regex(/^\+?\d{7,15}$/),
});

function parseServer() {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid server environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid server environment variables');
  }
  return result.data;
}

function parsePublic() {
  // Next.js inlines NEXT_PUBLIC_* at build time, so we read them directly.
  const raw = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
  };
  const result = publicSchema.safeParse(raw);
  if (!result.success) {
    console.error('❌ Invalid public environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid public environment variables');
  }
  return result.data;
}

// Lazy getters so importing the module on the client doesn't trip on server-only vars.
let _server: ReturnType<typeof parseServer> | null = null;
let _public: ReturnType<typeof parsePublic> | null = null;

export const serverEnv = new Proxy({} as ReturnType<typeof parseServer>, {
  get(_, key) {
    if (typeof window !== 'undefined') {
      throw new Error(`serverEnv.${String(key)} accessed in the browser`);
    }
    if (!_server) _server = parseServer();
    return _server[key as keyof typeof _server];
  },
});

export const publicEnv = new Proxy({} as ReturnType<typeof parsePublic>, {
  get(_, key) {
    if (!_public) _public = parsePublic();
    return _public[key as keyof typeof _public];
  },
});
