import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPEN } from '@/lib/utils';
import { enLotes, todas } from '@/lib/todas';
import { textosPanel } from '@/lib/idiomaServer';
import { YapeReviewRow } from '../../../yape/YapeReviewRow';
import { LiveRefresh } from '../LiveRefresh';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type ProofRow = {
  id: string; amount_cents: number; operation_number: string; payer_name: string;
  security_code: string; receipt_url: string; created_at: string;
  order: { id: string; buyer_name: string; buyer_email: string; buyer_phone: string; total_cents: number; event_id: string } | null;
};

export default async function EventYapePage({ params }: { params: { id: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();
  const impersonating = ctx.soloLectura;

  const admin = createAdminClient();
  const { data: event } = await admin.from('events').select('id, brand_id').eq('id', params.id).maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();
  const { t } = await textosPanel();

  const data = await todas((a, b) => admin
    .from('yape_proofs')
    .select(`id, amount_cents, operation_number, payer_name, security_code, receipt_url, created_at,
      order:orders!yape_proofs_order_id_fkey ( id, buyer_name, buyer_email, buyer_phone, total_cents, event_id )`)
    .eq('brand_id', event.brand_id)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
    .order('id')
    .range(a, b));

  const proofs = ((data as unknown as ProofRow[] | null) ?? []).filter((p) => p.order?.event_id === event.id);

  // ANTI-FRAUDE: detectar N° de operación repetido en la MARCA. Un mismo número
  // usado en un comprobante ya APROBADO = comprobante reutilizado (fraude probable);
  // en otro pendiente = revisar ambos. Solo READ + flag (no bloquea; el dueño decide).
  const dupWarningByProof = new Map<string, 'approved' | 'pending'>();
  const opNumbers = [...new Set(proofs.map((p) => p.operation_number?.trim()).filter((x): x is string => !!x))];
  if (opNumbers.length > 0) {
    const sameOps = await enLotes(opNumbers, (lote) => admin
      .from('yape_proofs')
      .select('id, operation_number, status')
      .eq('brand_id', event.brand_id)
      .in('operation_number', lote));
    const byOp = new Map<string, { id: string; status: string }[]>();
    for (const r of (sameOps ?? []) as { id: string; operation_number: string; status: string }[]) {
      const k = r.operation_number.trim();
      const arr = byOp.get(k) ?? [];
      arr.push({ id: r.id, status: r.status });
      byOp.set(k, arr);
    }
    for (const p of proofs) {
      const others = (byOp.get(p.operation_number?.trim() ?? '') ?? []).filter((r) => r.id !== p.id);
      if (others.some((r) => r.status === 'approved')) dupWarningByProof.set(p.id, 'approved');
      else if (others.length > 0) dupWarningByProof.set(p.id, 'pending');
    }
  }

  // Items por orden (qué entradas se aprueban): nombre + cantidad por tipo.
  const orderIds = proofs.map((p) => p.order?.id).filter((x): x is string => !!x);
  const itemsByOrder = new Map<string, { name: string; quantity: number }[]>();
  if (orderIds.length > 0) {
    const oi = await enLotes(orderIds, (lote) => admin
      .from('order_items')
      .select('order_id, ticket_type_name, quantity')
      .in('order_id', lote));
    for (const it of (oi ?? []) as { order_id: string; ticket_type_name: string | null; quantity: number | null }[]) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push({ name: it.ticket_type_name ?? t('Entrada', 'Ticket'), quantity: it.quantity ?? 0 });
      itemsByOrder.set(it.order_id, arr);
    }
  }

  const withUrls = await Promise.all(
    proofs.map(async (p) => {
      const { data: signed } = await admin.storage.from('yape-proofs').createSignedUrl(p.receipt_url, 60 * 10);
      return { ...p, signedReceiptUrl: signed?.signedUrl ?? null, items: itemsByOrder.get(p.order?.id ?? '') ?? [] };
    })
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 className="s-h2" style={{ marginTop: 2 }}>{t('Comprobantes pendientes', 'Pending receipts')} {withUrls.length > 0 && <span className="s-badge s-badge--alert" style={{ marginLeft: 8 }}>{withUrls.length}</span>}</h2>
        </div>
        <LiveRefresh seconds={25} />
      </div>

      {withUrls.length === 0 ? (
        <div className="s-card"><p className="s-empty">{t('No hay comprobantes por revisar. Los nuevos aparecen solos, sin recargar.', 'No receipts to review. New ones appear automatically, without reloading.')}</p></div>
      ) : (
        <>
          {/* La instrucción va UNA vez arriba de la lista, no repetida en cada fila. */}
          <p className="s-card__desc" style={{ marginBottom: 12 }}>
            {t(
              'Abre tu Yape → Movimientos y busca cada transferencia. Si el monto, el N° de operación y el nombre coinciden, aprueba. Toca una fila para ver la captura y el detalle.',
              'Open your Yape → Transactions and look up each transfer. If the amount, operation number and name match, approve it. Tap a row to see the screenshot and details.'
            )}
          </p>
          <div>
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
                createdAt={p.created_at}
                total={formatPEN(p.order?.total_cents ?? 0)}
                items={p.items}
                impersonating={impersonating}
                duplicateWarning={dupWarningByProof.get(p.id) ?? null}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
