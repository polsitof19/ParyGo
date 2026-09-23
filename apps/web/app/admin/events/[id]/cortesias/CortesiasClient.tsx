'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createPromoCode } from '../promo-actions';

// Copia al portapapeles sin mostrar el texto (la URL de una entrada no se
// escribe en pantalla: el QR es la entrada).
export function CopyButton({ text, label }: { text: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado.');
    } catch {
      toast.error('No se pudo copiar. Prueba con WhatsApp.');
    }
  }
  return (
    <button type="button" className="s-btn s-btn--soft s-btn--sm" onClick={copy}>
      {label}
    </button>
  );
}

// Sin 0/O/1/I: se dicta y se escribe sin confundirse. 32 símbolos → 256 % 32
// = 0, así que el byte % 32 no tiene sesgo.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function sugerirCodigo(len = 7): string {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('');
}

type TT = { id: string; name: string };

// Crea un código promo 'free' con la acción de siempre (createPromoCode valida,
// autoriza y escribe server-side). Acá solo se fijan los valores de cortesía.
export function FreeCodeForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: TT[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  // En el cliente, no en el render: server y cliente sortearían códigos distintos (hydration).
  useEffect(() => setCode(sugerirCodigo()), []);
  const [qty, setQty] = useState(10);
  const [typeId, setTypeId] = useState(ticketTypes.length === 1 ? ticketTypes[0]?.id ?? '' : '');

  if (ticketTypes.length === 0) {
    return <p className="s-card__desc">Crea un tipo de entrada activo antes de crear códigos.</p>;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await createPromoCode({
        eventId,
        code: code.trim().toUpperCase(),
        label: 'Cortesía',
        discountType: 'free',
        discountValue: 0,
        maxUses: qty,
        perEmailLimit: 1,
        appliesToAll: !typeId,
        ticketTypeIds: typeId ? [typeId] : [],
        expiresAt: '',
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success('Código creado.');
      setCode(sugerirCodigo());
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="s-stack" style={{ gap: 'var(--s-s2)' }}>
      <div className="s-form-grid">
        <div>
          <label className="s-label" htmlFor="fc_code">Código</label>
          <input
            id="fc_code"
            className="s-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            pattern="[A-Za-z0-9_\-]{2,32}"
            maxLength={32}
            required
            autoComplete="off"
          />
        </div>
        <div>
          <label className="s-label" htmlFor="fc_qty">Cuántas personas</label>
          <input
            id="fc_qty"
            className="s-input"
            type="number"
            min={1}
            max={500}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            required
          />
        </div>
      </div>
      <div>
        <label className="s-label" htmlFor="fc_type">Tipo de entrada</label>
        <select id="fc_type" className="s-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {ticketTypes.length > 1 && <option value="">Cualquiera</option>}
          {ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="s-form-actions">
        <button type="submit" className="s-btn s-btn--soft" disabled={pending}>
          {pending ? 'Creando…' : 'Crear código'}
        </button>
      </div>
    </form>
  );
}
