import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { formatPEN } from '@/lib/utils';
// Reuse the same row component and approve/reject actions that brand admins
// use. approveYapeProof already permits super_admin in its permission check.
import { YapeReviewRow } from '@/app/admin/yape/YapeReviewRow';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function SuperYapeReviewPage() {
  await requireSession({ superAdmin: true });
  const admin = createAdminClient();

  type Row = {
    id: string;
    amount_cents: number;
    operation_number: string;
    payer_name: string;
    security_code: string;
    receipt_url: string;
    created_at: string;
    brand: { name: string; slug: string } | null;
    order: {
      id: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      total_cents: number;
      event: { name: string } | null;
    } | null;
  };

  // Super admin sees every brand's pending Yape proofs in one place.
  const res = await admin
    .from('yape_proofs')
    .select(`
      id, amount_cents, operation_number, payer_name, security_code,
      receipt_url, created_at,
      brand:brands ( name, slug ),
      order:orders!yape_proofs_order_id_fkey (
        id, buyer_name, buyer_email, buyer_phone, total_cents,
        event:events ( name )
      )
    `)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });
  const proofs = (res.data as unknown as Row[] | null) ?? [];

  // Signed URLs (10 min) for the private receipts bucket.
  const withUrls = await Promise.all(
    proofs.map(async (p) => {
      const { data: signed } = await admin.storage
        .from('yape-proofs')
        .createSignedUrl(p.receipt_url, 60 * 10);
      return { ...p, signedReceiptUrl: signed?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ YAPE · PENDING · TODAS LAS MARCAS ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Comprobantes por revisar
        </h1>
        <p className="text-muted-foreground">
          Vista de super admin: ves los pendientes de cada marca. Las marcas
          también pueden aprobar/rechazar desde su propio panel.
        </p>
      </header>

      {withUrls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay comprobantes pendientes en ninguna marca.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {withUrls.map((p) => (
            <div key={p.id} className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">
                [ {p.brand?.name ?? 'Sin marca'} · {p.brand?.slug ?? '—'} ]
              </p>
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
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
