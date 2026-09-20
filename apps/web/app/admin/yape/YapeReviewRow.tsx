'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, X, Loader2, ChevronRight, ExternalLink } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
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

  if (done === 'approved') {
    return (
      <p className="s-banner s-banner--ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Check className="h-4 w-4" /> Aprobado · QR enviado a {buyerEmail}
      </p>
    );
  }
  if (done === 'rejected') {
    return (
      <p className="s-banner s-banner--err" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <X className="h-4 w-4" /> Rechazado · {buyerEmail} fue notificado
      </p>
    );
  }

  const bodyId = `yape-detalle-${proofId}`;
  const expanded = open || showReject;
  const hora = new Date(createdAt).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  });

  return (
    <div className={`a-yrow${expanded ? ' a-yrow--open' : ''}`}>
      <div className="a-yrow__head">
        <button
          type="button"
          className="a-yrow__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight className="a-yrow__chev" aria-hidden="true" />
          <span className="a-yrow__payer">{payerName || buyerName || '—'}</span>
          <span className={`a-yrow__amt${amountMatches ? '' : ' a-yrow__amt--bad'}`}>{formatPEN(amountCents)}</span>
          <span className="a-yrow__op">Op. {operationNumber}</span>
          <span className="a-yrow__time">{hora}</span>
          {duplicateWarning && <span className="a-chip a-chip--deny">N° repetido</span>}
          {!amountMatches && <span className="a-chip a-chip--warn">Esperado {formatPEN(expectedAmountCents)}</span>}
        </button>

        {!impersonating && !showReject && (
          <div className="a-yrow__acts">
            <button
              type="button"
              className="s-btn s-btn--primary s-btn--sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Aprobar y enviar ${total} en entradas a ${buyerEmail}?`)) return;
                start(async () => {
                  const res = await approveYapeProof(proofId);
                  if (res.ok) {
                    toast.success(`${res.ticketsIssued} entradas emitidas`);
                    setDone('approved');
                  } else {
                    toast.error(res.message ?? 'Error');
                  }
                });
              }}
            >
              <Check aria-hidden="true" /> Aprobar
            </button>
            <button
              type="button"
              className="s-btn s-btn--soft s-btn--sm"
              disabled={pending}
              onClick={() => { setShowReject(true); setOpen(true); }}
            >
              <X aria-hidden="true" /> Rechazar
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
                    alt="Comprobante Yape"
                    className="a-receipt"
                    onError={() => setReceiptBroken(true)}
                  />
                </a>
              ) : (
                <div className="a-receipt a-receipt--empty">
                  <span>{receiptUrl ? 'No se pudo mostrar la captura' : 'Sin captura'}</span>
                  {receiptUrl && (
                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="s-textlink">
                      <ExternalLink aria-hidden="true" style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-2px' }} /> Abrir el archivo
                    </a>
                  )}
                </div>
              )}
              <p className="s-hint" style={{ marginTop: 6 }}>Subido {hora}</p>
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
                    <strong>Ojo: N° de operación repetido.</strong>{' '}
                    {duplicateWarning === 'approved'
                      ? 'Este número de operación ya se usó en un comprobante APROBADO de tu marca. Podría ser un comprobante reutilizado — verifica en tu Yape antes de aprobar.'
                      : 'Este número de operación aparece en otro comprobante pendiente. Revisa ambos antes de aprobar para no duplicar.'}
                  </span>
                </p>
              )}

              <div className="a-verify-box">
                <Verify label="Monto" value={formatPEN(amountCents)} expected={formatPEN(expectedAmountCents)} ok={amountMatches} />
                <Verify label="N° operación" value={operationNumber} />
                <Verify label="Nombre pagador" value={payerName} />
                <Verify label="Código seguridad" value={securityCode} />
              </div>

              {/* Resumen de lo que se está aprobando: cuántas entradas y total. */}
              {items.length > 0 && (
                <div className="a-yape-summary" role="group" aria-label="Resumen de entradas a aprobar">
                  <span className="a-yape-summary__count">
                    {items.map((it, i) => (
                      <span key={i}>
                        {i > 0 && <span className="a-yape-summary__plus"> + </span>}
                        <strong>{it.quantity}</strong> {it.name}
                      </span>
                    ))}
                  </span>
                  <span className="a-yape-summary__total">{total} en total</span>
                </div>
              )}

              {impersonating && (
                <p className="s-banner" style={{ marginTop: 16, background: 'var(--paper-2)', color: 'var(--ink-2)' }} role="status">
                  Solo lectura — no puedes aprobar ni rechazar comprobantes desde aquí.
                </p>
              )}

              {showReject && (
                <div className="s-card a-reject-box">
                  <label className="s-label">Motivo del rechazo</label>
                  <input
                    className="s-input"
                    placeholder="Ej: monto no coincide / no encuentro el comprobante / nombre distinto"
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
                            toast.success('Rechazado');
                            setDone('rejected');
                          } else {
                            toast.error(res.message ?? 'Error');
                          }
                        });
                      }}
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Confirmar rechazo
                    </button>
                    <button type="button" className="s-btn s-btn--ghost" onClick={() => setShowReject(false)}>
                      Cancelar
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
}: {
  label: string;
  value: string;
  expected?: string;
  ok?: boolean;
}) {
  return (
    <div className="a-verify">
      <span className="a-verify__k">{label}</span>
      <span className="a-verify__v">
        <span className={ok === false ? 'a-verify__v--bad' : ok === true ? 'a-verify__v--ok' : undefined}>{value}</span>
        {ok === false && expected && <span className="a-verify__exp">(esperado {expected})</span>}
      </span>
    </div>
  );
}
