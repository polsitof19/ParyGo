'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, X, Loader2, ChevronRight, ExternalLink } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { useTextos } from '@/components/IdiomaPanel';
import { approveYapeProof, rejectYapeProof } from './actions';

type Props = {
  proofId: string;
  receiptUrl: string | null;
  amountCents: number;
  expectedAmountCents: number;
  amountMatches: boolean;
  operationNumber: string;
  payerName: string;
  securityCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  createdAt: string;
  total: string;
  items?: { name: string; quantity: number }[];
  impersonating?: boolean;
  // Anti-fraude: el mismo N° de operación aparece en otro comprobante de la marca.
  // 'approved' = ya se aprobó una orden con ese N° (reuso = fraude probable);
  // 'pending'  = otro pendiente con el mismo N° (revisar antes de aprobar ambos).
  duplicateWarning?: 'approved' | 'pending' | null;
};

// Fila compacta de revisión: lo que se compara de un vistazo contra la app de
// Yape (pagador · monto · N° operación · hora) y los dos botones. El comprobante
// y el detalle se despliegan — ver la captura ES la verificación, pero con 8
// pendientes no entra nada en pantalla si cada uno abre una imagen de 280px.
export function YapeReviewRow({
  proofId,
  receiptUrl,
  amountCents,
  expectedAmountCents,
  amountMatches,
  operationNumber,
  payerName,
  securityCode,
  buyerName,
  buyerEmail,
  buyerPhone,
  createdAt,
  total,
  items = [],
  impersonating = false,
  duplicateWarning = null,
}: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [receiptBroken, setReceiptBroken] = useState(false);
  const [done, setDone] = useState<null | 'approved' | 'rejected'>(null);
  const { t, loc } = useTextos();

  if (done === 'approved') {
    return (
      <p className="s-banner s-banner--ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Check className="h-4 w-4" /> {t(`Aprobado · QR enviado a ${buyerEmail}`, `Approved · QR sent to ${buyerEmail}`)}
      </p>
    );
  }
  if (done === 'rejected') {
    return (
      <p className="s-banner s-banner--err" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <X className="h-4 w-4" /> {t(`Rechazado · ${buyerEmail} fue notificado`, `Rejected · ${buyerEmail} was notified`)}
      </p>
    );
  }

  const bodyId = `yape-detalle-${proofId}`;
  const expanded = open || showReject;
  const hora = new Date(createdAt).toLocaleString(loc, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  });

  return (
    <div className={`a-yrow${expanded ? ' a-yrow--open' : ''}`}>
      <div className="a-yrow__head">
        <button
          type="button"
          className="a-yrow__toggle"
          aria-expanded={expanded}
          // El detalle se monta solo al desplegar (si no, cargaría la captura de
          // todas las filas), así que aria-controls apunta a algo que existe.
          aria-controls={expanded ? bodyId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight className="a-yrow__chev" aria-hidden="true" />
          <span className="a-yrow__payer">{payerName || buyerName || '—'}</span>
          <span className={`a-yrow__amt${amountMatches ? '' : ' a-yrow__amt--bad'}`}>{formatPEN(amountCents)}</span>
          <span className="a-yrow__op">{t(`Op. ${operationNumber}`, `Op. ${operationNumber}`)}</span>
          <span className="a-yrow__time">{hora}</span>
          {duplicateWarning && <span className="a-chip a-chip--deny">{t('N° repetido', 'Repeated number')}</span>}
          {!amountMatches && <span className="a-chip a-chip--warn">{t(`Esperado ${formatPEN(expectedAmountCents)}`, `Expected ${formatPEN(expectedAmountCents)}`)}</span>}
        </button>

        {!impersonating && !showReject && (
          <div className="a-yrow__acts">
            <button
              type="button"
              className="s-btn s-btn--primary s-btn--sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(t(`Aprobar y enviar ${total} en entradas a ${buyerEmail}?`, `Approve and send ${total} in tickets to ${buyerEmail}?`))) return;
                start(async () => {
                  const res = await approveYapeProof(proofId);
                  if (res.ok) {
                    toast.success(t(`${res.ticketsIssued} entradas emitidas`, `${res.ticketsIssued} tickets issued`));
                    setDone('approved');
                  } else {
                    toast.error(res.message ?? t('Error', 'Error'));
                  }
                });
              }}
            >
              <Check aria-hidden="true" /> {t('Aprobar', 'Approve')}
            </button>
            <button
              type="button"
              className="s-btn s-btn--soft s-btn--sm"
              disabled={pending}
              onClick={() => { setShowReject(true); setOpen(true); }}
            >
              <X aria-hidden="true" /> {t('Rechazar', 'Reject')}
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div id={bodyId} className="a-yrow__body">
          <div className="a-yape">
            {/* Comprobante */}
            <div>
              {receiptUrl && !receiptBroken ? (
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptUrl}
                    alt={t('Comprobante Yape', 'Yape receipt')}
                    className="a-receipt"
                    onError={() => setReceiptBroken(true)}
                  />
                </a>
              ) : (
                <div className="a-receipt a-receipt--empty">
                  <span>{receiptUrl ? t('No se pudo mostrar la captura', 'Could not display the screenshot') : t('Sin captura', 'No screenshot')}</span>
                  {receiptUrl && (
                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="s-textlink">
                      <ExternalLink aria-hidden="true" style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-2px' }} /> {t('Abrir el archivo', 'Open the file')}
                    </a>
                  )}
                </div>
              )}
              <p className="s-hint" style={{ marginTop: 6 }}>{t(`Subido ${hora}`, `Uploaded ${hora}`)}</p>
            </div>

            {/* Datos a verificar contra la app de Yape */}
            <div>
              <p className="s-card__desc" style={{ marginBottom: 12 }}>{buyerName} · {buyerEmail} · {buyerPhone}</p>

              {duplicateWarning && (
                <p
                  className={duplicateWarning === 'approved' ? 's-banner s-banner--err' : 's-banner'}
                  role="alert"
                  style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}
                >
                  <X className="h-4 w-4" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>{t('Ojo: N° de operación repetido.', 'Heads up: repeated operation number.')}</strong>{' '}
                    {duplicateWarning === 'approved'
                      ? t(
                          'Este número de operación ya se usó en un comprobante APROBADO de tu marca. Podría ser un comprobante reutilizado — verifica en tu Yape antes de aprobar.',
                          'This operation number was already used in an APPROVED receipt of your brand. It could be a reused receipt — check your Yape before approving.'
                        )
                      : t(
                          'Este número de operación aparece en otro comprobante pendiente. Revisa ambos antes de aprobar para no duplicar.',
                          'This operation number appears in another pending receipt. Review both before approving to avoid a duplicate.'
                        )}
                  </span>
                </p>
              )}

              <div className="a-verify-box">
                <Verify label={t('Monto', 'Amount')} value={formatPEN(amountCents)} expected={formatPEN(expectedAmountCents)} ok={amountMatches} expectedLabel={t('esperado', 'expected')} />
                <Verify label={t('N° operación', 'Operation number')} value={operationNumber} />
                <Verify label={t('Nombre pagador', 'Payer name')} value={payerName} />
                <Verify label={t('Código seguridad', 'Security code')} value={securityCode} />
              </div>

              {/* Resumen de lo que se está aprobando: cuántas entradas y total. */}
              {items.length > 0 && (
                <div className="a-yape-summary" role="group" aria-label={t('Resumen de entradas a aprobar', 'Summary of tickets to approve')}>
                  <span className="a-yape-summary__count">
                    {items.map((it, i) => (
                      <span key={i}>
                        {i > 0 && <span className="a-yape-summary__plus"> + </span>}
                        <strong>{it.quantity}</strong> {it.name}
                      </span>
                    ))}
                  </span>
                  <span className="a-yape-summary__total">{t(`${total} en total`, `${total} total`)}</span>
                </div>
              )}

              {impersonating && (
                <p className="s-banner" style={{ marginTop: 16, background: 'var(--paper-2)', color: 'var(--ink-2)' }} role="status">
                  {t('Solo lectura — no puedes aprobar ni rechazar comprobantes desde aquí.', 'Read-only — you cannot approve or reject receipts from here.')}
                </p>
              )}

              {showReject && (
                <div className="s-card a-reject-box">
                  <label className="s-label">{t('Motivo del rechazo', 'Rejection reason')}</label>
                  <input
                    className="s-input"
                    placeholder={t('Ej: monto no coincide / no encuentro el comprobante / nombre distinto', 'E.g.: amount does not match / cannot find the receipt / different name')}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="s-btn s-btn--danger"
                      disabled={pending}
                      onClick={() => {
                        start(async () => {
                          const res = await rejectYapeProof(proofId, rejectReason);
                          if (res.ok) {
                            toast.success(t('Rechazado', 'Rejected'));
                            setDone('rejected');
                          } else {
                            toast.error(res.message ?? t('Error', 'Error'));
                          }
                        });
                      }}
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('Confirmar rechazo', 'Confirm rejection')}
                    </button>
                    <button type="button" className="s-btn s-btn--ghost" onClick={() => setShowReject(false)}>
                      {t('Cancelar', 'Cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Verify({
  label,
  value,
  expected,
  ok,
  expectedLabel,
}: {
  label: string;
  value: string;
  expected?: string;
  ok?: boolean;
  expectedLabel?: string;
}) {
  return (
    <div className="a-verify">
      <span className="a-verify__k">{label}</span>
      <span className="a-verify__v">
        <span className={ok === false ? 'a-verify__v--bad' : ok === true ? 'a-verify__v--ok' : undefined}>{value}</span>
        {ok === false && expected && <span className="a-verify__exp">({expectedLabel ?? 'esperado'} {expected})</span>}
      </span>
    </div>
  );
}
