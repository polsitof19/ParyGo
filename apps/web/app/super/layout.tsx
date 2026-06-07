import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SuperTopbar } from './SuperTopbar';
import './super.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Warm v7 type system, scoped to the super panel via the .super-shell wrapper
// (does not affect the brand admin / scan / public app).
const bricolage = Bricolage_Grotesque({
  weight: ['600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const hanken = Hanken_Grotesk({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession({ superAdmin: true });

  // Discreet pending-Yape counter for the support link (read-only).
  const admin = createAdminClient();
  const { count } = await admin
    .from('yape_proofs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review');

  return (
    <div className={`super-shell ${bricolage.variable} ${hanken.variable}`}>
      <SuperTopbar email={user.email} yapeCount={count ?? 0} />
      <main className="s-wrap">{children}</main>
    </div>
  );
}
