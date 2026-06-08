'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { reissueTicketsAction, type ReissueState } from './actions';
import { formatPEN } from '@/lib/utils';

type StuckOrder = {
  id: string;
  buyerName: string | null;
  totalCents: number;
  createdAt: string;
  eventName: string;
};

const initial: ReissueState = { ok: false, message: null };

// Panel de recuperación: lista órdenes PAGADAS que quedaron sin tickets (caso
// raro del flujo Yape no atómico) y deja re-emitirlas con un clic. La acción es
// idempotente y solo opera sobre órdenes ya pagadas de la propia marca.
export function TicketRecovery({ orders }: { orders: StuckOrder[] }) {
  return (
    <div className="s-card" style={{ marginBottom: 22, borderColor: 'var(--alert, #dc2626)' }}>
      <div className="s-card__head">
        <div>
          <h2 className="s-h2" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--alert, #dc2626)' }}>
            <AlertTriangle className="h-5 w-5" /> Órdenes pagadas sin tickets
          </h2>
          <p className="s-card__desc">
            Estas compras están pagadas pero no se emitieron sus entradas. Re-emitilas para que el comprador reciba su QR por email.
          </p>
        </div>
      </div>
      <ul className="s-stack" style={{ gap: 10, listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
        {orders.map((o) => (
          <RecoveryRow key={o.id} order={o} />
        ))}
      </ul>
    </div>
  );
}

function RecoveryRow({ order }: { order: StuckOrder }) {
  const [state, action] = useFormState(reissueTicketsAction, initial);
  return (
    <li className="s-defrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', border: '1px solid var(--cream-3)', borderRadius: 'var(--r-ctl, 12px)', padding: '12px 14px' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 700 }}>{order.buyerName ?? 'Comprador'}</p>
        <p className="s-muted" style={{ fontSize: 13 }}>
          {order.eventName} · {formatPEN(order.totalCents)} · {new Date(order.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
        {state.message && (
          <p className={state.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} style={{ marginTop: 8 }}>{state.message}</p>
        )}
      </div>
      <form action={action}>
        <input type="hidden" name="order_id" value={order.id} />
        <ReissueButton done={state.ok} />
      </form>
    </li>
  );
}

function ReissueButton({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending || done}>
      {pending ? 'Re-emitiendo…' : done ? 'Hecho ✓' : 'Re-emitir tickets'}
    </button>
  );
}
