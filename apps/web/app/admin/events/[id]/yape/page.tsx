import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { YapeReviewRow } from '../../../yape/YapeReviewRow';
import { LiveRefresh } from '../LiveRefresh';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type ProofRow = {
  id: string; amount_cents: number; operation_number: string; payer_name: string;
  security_code: string; receipt_url: string; created_at: string;
  order: { id: string; buyer_name: string; buyer_email: string; buyer_phone: string; total_cents: number; event_id: string; event: { name: string } | null } | null;
};

export default async function EventYapePage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.impersonating;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  const { data } = await admin
    .from('yape_proofs')
    .select(`id, amount_cents, operation_number, payer_name, security_code, receipt_url, created_at,
      order:orders!yape_proofs_order_id_fkey ( id, buyer_name, buyer_email, buyer_phone, total_cents, event_id, event:events ( name ) )`)
    .eq('brand_id', event.brand_id)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });

  const proofs = ((data as unknown as ProofRow[] | null) ?? []).filter((p) => p.order?.event_id === event.id);
  const withUrls = await Promise.all(
    proofs.map(async (p) => {
      const { data: signed } = await admin.storage.from('yape-proofs').createSignedUrl(p.receipt_url, 60 * 10);
      return { ...p, signedReceiptUrl: signed?.signedUrl ?? null };
    })
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <span className="eyebrow">Revisar Yape</span>
          <h2 className="s-h2" style={{ marginTop: 2 }}>Comprobantes pendientes {withUrls.length > 0 && <span className="s-badge s-badge--alert" style={{ marginLeft: 8 }}>{withUrls.length}</span>}</h2>
        </div>
        <LiveRefresh seconds={12} />
      </div>

      {withUrls.length === 0 ? (
        <div className="s-card"><p className="s-empty">No hay comprobantes pendientes. 🎉 Los nuevos aparecen solos (refresco automático).</p></div>
      ) : (
        <div className="s-stack" style={{ gap: 14 }}>
          {withUrls.map((p) => (
            <div key={p.id} className="s-card">
              <YapeReviewRow
                proofId={p.id}
                receiptUrl={p.signedReceiptUrl}
                amountCents={p.amount_cents}
                expectedAmountCents={p.order?.total_cents ?? 0}
                amountMatches={p.amount_cents === p.order?.total_cents}
                operationNumber={p.operation_number}
                payerName={p.payer_name}
                securityCode={p.security_code}
                buyerName={p.order?.buyer_name ?? ''}
                buyerEmail={p.order?.buyer_email ?? ''}
                buyerPhone={p.order?.buyer_phone ?? ''}
                eventName={p.order?.event?.name ?? ''}
                createdAt={p.created_at}
                total={formatPEN(p.order?.total_cents ?? 0)}
                impersonating={impersonating}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
