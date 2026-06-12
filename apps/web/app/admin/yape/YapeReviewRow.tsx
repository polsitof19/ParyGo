'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, X, Loader2 } from 'lucide-react';
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
  eventName: string;
  createdAt: string;
  total: string;
  impersonating?: boolean;
};

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
  eventName,
  createdAt,
  total,
  impersonating = false,
}: Props) {
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
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

  return (
    <div className="a-yape">
      {/* Comprobante */}
      <div>
        {receiptUrl ? (
          <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptUrl} alt="Comprobante Yape" className="a-receipt" />
          </a>
        ) : (
          <div className="a-receipt a-receipt--empty">Sin captura</div>
        )}
        <p className="s-hint" style={{ marginTop: 6 }}>
          Subido {new Date(createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
        </p>
      </div>

      {/* Datos a verificar contra la app de Yape */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <p className="a-evrow__name" style={{ fontSize: 17 }}>{eventName}</p>
          <p className="s-card__desc">{buyerName} · {buyerEmail} · {buyerPhone}</p>
        </div>

        <div className="a-verify-box">
          <Verify label="Monto" value={formatPEN(amountCents)} expected={formatPEN(expectedAmountCents)} ok={amountMatches} />
          <Verify label="N° operación" value={operationNumber} />
          <Verify label="Nombre pagador" value={payerName} />
          <Verify label="Código seguridad" value={securityCode} />
        </div>

        <p className="s-hint" style={{ marginTop: 10 }}>
          Abrí tu Yape → Movimientos → buscá esta transferencia y verificá los 4 campos. Si todo coincide, aprobá.
        </p>

        {impersonating ? (
          <p className="s-banner" style={{ marginTop: 16, background: 'var(--cream-2)', color: 'var(--ink-2)' }} role="status">
            Solo lectura — no puedes aprobar ni rechazar comprobantes desde aquí.
          </p>
        ) : showReject ? (
          <div className="s-card" style={{ marginTop: 14, borderColor: 'var(--alert)', background: 'var(--alert-bg)' }}>
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
                className="s-btn s-btn--primary"
                style={{ background: 'var(--alert)', boxShadow: 'none' }}
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
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="s-btn s-btn--primary"
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
              <Check className="h-4 w-4" /> Aprobar y emitir QR
            </button>
            <button type="button" className="s-btn s-btn--soft" disabled={pending} onClick={() => setShowReject(true)}>
              <X className="h-4 w-4" /> Rechazar
            </button>
          </div>
        )}
      </div>
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
