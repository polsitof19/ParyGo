'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}: Props) {
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [done, setDone] = useState<null | 'approved' | 'rejected'>(null);

  if (done === 'approved') {
    return (
      <article className="rounded-lg border border-green/40 bg-green/5 px-6 py-4 text-sm">
        <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-green">
          <Check className="h-4 w-4" />
          Aprobado · QR enviado a {buyerEmail}
        </span>
      </article>
    );
  }
  if (done === 'rejected') {
    return (
      <article className="rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-4 text-sm">
        <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
          <X className="h-4 w-4" />
          Rechazado · {buyerEmail} fue notificado
        </span>
      </article>
    );
  }

  return (
    <article className="grid gap-6 rounded-lg border border-border bg-card p-6 md:grid-cols-[280px_1fr]">
      {/* Receipt image */}
      <div className="space-y-2">
        {receiptUrl ? (
          <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={receiptUrl}
              alt="Comprobante Yape"
              className="w-full rounded-md border border-border"
            />
          </a>
        ) : (
          <div className="grid h-48 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Sin captura
          </div>
        )}
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Subido {new Date(createdAt).toLocaleString('es-PE')}
        </p>
      </div>

      {/* Data to verify against Yape app */}
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-display text-xl uppercase">{eventName}</p>
          <p className="text-sm text-muted-foreground">
            {buyerName} · {buyerEmail} · {buyerPhone}
          </p>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-background p-4 text-sm">
          <Verify
            label="MONTO"
            value={formatPEN(amountCents)}
            expected={formatPEN(expectedAmountCents)}
            ok={amountMatches}
          />
          <Verify label="N° OPERACIÓN" value={operationNumber} />
          <Verify label="NOMBRE PAGADOR" value={payerName} />
          <Verify label="CÓDIGO SEGURIDAD" value={securityCode} />
        </div>

        <p className="text-xs text-muted-foreground">
          Abrí tu Yape → Movimientos → buscá esta transferencia y verificá los
          4 campos. Si todo matchea, aprobá.
        </p>

        {showReject ? (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium">Motivo del rechazo</p>
            <Input
              placeholder="Ej: monto no coincide / no encuentro el comprobante / nombre distinto"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
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
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowReject(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="gradient"
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
              <Check className="h-4 w-4" />
              Aprobar y emitir QR
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setShowReject(true)}
            >
              <X className="h-4 w-4" />
              Rechazar
            </Button>
          </div>
        )}
      </div>
    </article>
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
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="flex items-center gap-2 text-right">
        <span className={ok === false ? 'text-destructive' : ok === true ? 'text-green' : ''}>
          {value}
        </span>
        {ok === false && expected && (
          <span className="font-mono text-[10px] text-destructive">
            (esperado {expected})
          </span>
        )}
      </span>
    </div>
  );
}
