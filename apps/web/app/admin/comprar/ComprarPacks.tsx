'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { formatPEN } from '@/lib/utils';
import { PACKS, fmtUSD, type Pack } from '@/lib/packs';
import { useTextos } from '@/components/IdiomaPanel';
import { comprarPackAction, type CompraState } from './actions';

const initial: CompraState = { ok: false, message: null };

function Boton({ pasarela, label, disabled }: { pasarela: 'mercadopago' | 'paypal'; label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTextos();
  return (
    <button type="submit" name="pasarela" value={pasarela} className="s-btn s-btn--soft s-btn--sm" disabled={disabled || pending}>
      {pending ? t('Yendo a pagar…', 'Going to pay…') : label}
    </button>
  );
}

function Fila({ p, mp, paypal }: { p: Pack; mp: boolean; paypal: boolean }) {
  const [state, action] = useFormFeedback(comprarPackAction, initial);
  const { t } = useTextos();
  void state;
  const porEvento = Math.round(p.pen / p.eventos);
  return (
    <form action={action} className="s-field" style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s-s3)' }}>
      <input type="hidden" name="pack" value={p.eventos} />
      <p className="s-label">{t(`${p.eventos} evento${p.eventos === 1 ? '' : 's'}`, `${p.eventos} event${p.eventos === 1 ? '' : 's'}`)}{p.eventos > 1 && <span className="s-muted"> · {t(`${formatPEN(porEvento)} cada uno`, `${formatPEN(porEvento)} each`)}</span>}</p>
      <div className="s-form-actions" style={{ borderTop: 0, marginTop: 'var(--s-s2)', paddingTop: 0 }}>
        <Boton pasarela="mercadopago" label={`${formatPEN(p.pen)} · MercadoPago`} disabled={!mp} />
        <Boton pasarela="paypal" label={`${fmtUSD(p.usd)} · PayPal`} disabled={!paypal} />
      </div>
    </form>
  );
}

export function ComprarPacks({ mp, paypal }: { mp: boolean; paypal: boolean }) {
  const { t } = useTextos();
  return (
    <div>
      {PACKS.map((p) => <Fila key={p.eventos} p={p} mp={mp} paypal={paypal} />)}
      {(!mp || !paypal) && (
        <p className="s-hint" style={{ marginTop: 'var(--s-s3)' }}>
          {!mp && !paypal
            ? t('Los pagos en línea se activan muy pronto.', 'Online payments are coming very soon.')
            : !mp
            ? t('MercadoPago se activa muy pronto.', 'MercadoPago is coming very soon.')
            : t('PayPal se activa muy pronto.', 'PayPal is coming very soon.')}
        </p>
      )}
    </div>
  );
}
