import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { formatPEN } from '@/lib/utils';
import { YapeReviewRow } from './YapeReviewRow';

export const dynamic = 'force-dynamic';

export default async function YapeReviewPage() {
  const user = await requireSession();
  const membership = user.brandMemberships.find((m) => m.role === 'brand_admin');
  if (!membership) return null;

  const supabase = createClient();
  const admin = createAdminClient(); // for signed URLs to the private bucket

  type Row = {
    id: string;
    amount_cents: number;
    operation_number: string;
    payer_name: string;
    security_code: string;
    receipt_url: string;
    created_at: string;
    order: {
      id: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      total_cents: number;
      event: { name: string } | null;
    } | null;
  };

  const res = await supabase
    .from('yape_proofs')
    .select(`
      id, amount_cents, operation_number, payer_name, security_code,
      receipt_url, created_at,
      order:orders (
        id, buyer_name, buyer_email, buyer_phone, total_cents,
        event:events ( name )
      )
    `)
    .eq('brand_id', membership.brandId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });
  const proofs = (res.data as unknown as Row[] | null) ?? [];

  // Generate signed URLs (5 min) for each receipt
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
          [ YAPE · PENDING ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Comprobantes por revisar
        </h1>
        <p className="text-muted-foreground">
          Verifica cada uno contra tu app Yape antes de aprobar. Una vez aprobado,
          el sistema genera los QR y le envía la entrada al comprador.
        </p>
      </header>

      {withUrls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay comprobantes pendientes. Todo al día.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {withUrls.map((p) => (
            <YapeReviewRow
              key={p.id}
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
          ))}
        </div>
      )}
    </div>
  );
}
