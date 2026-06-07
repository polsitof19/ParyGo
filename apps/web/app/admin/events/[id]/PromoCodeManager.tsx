'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { createPromoCode, revokePromoCode } from './promo-actions';

export type PromoCodeRow = {
  id: string;
  code: string;
  label: string | null;
  discount_type: 'percent' | 'fixed' | 'free';
  discount_value: number;
  max_uses: number | null;
  use_count: number;
  per_email_limit: number;
  applies_to_all: boolean;
  expires_at: string | null;
  is_active: boolean;
};

export type PromoSales = {
  [promoCodeId: string]: { entries: number; soldCents: number; discountCents: number };
};

type TicketTypeLite = { id: string; name: string };

function describeDiscount(c: PromoCodeRow): string {
  if (c.discount_type === 'free') return '100% (gratis)';
  if (c.discount_type === 'percent') return `${c.discount_value}%`;
  return `−${formatPEN(c.discount_value)}`;
}

export function PromoCodeManager({
  eventId,
  ticketTypes,
  codes,
  sales,
}: {
  eventId: string;
  ticketTypes: TicketTypeLite[];
  codes: PromoCodeRow[];
  sales: PromoSales;
}) {
  const [pending, startTransition] = useTransition();
  const [discountType, setDiscountType] = useState<'percent' | 'fixed' | 'free'>('percent');
  const [limitMode, setLimitMode] = useState<'unlimited' | 'capped'>('unlimited');
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [perEmailLimit, setPerEmailLimit] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');

  function resetForm() {
    setCode('');
    setLabel('');
    setDiscountValue('');
    setMaxUses('');
    setPerEmailLimit('1');
    setExpiresAt('');
    setDiscountType('percent');
    setLimitMode('unlimited');
    setAppliesToAll(true);
    setSelectedTypes([]);
  }

  function toggleType(id: string) {
    setSelectedTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createPromoCode({
        eventId,
        code: code.trim(),
        label: label.trim(),
        discountType,
        discountValue: discountType === 'free' ? 0 : Number(discountValue),
        maxUses: limitMode === 'unlimited' ? null : Number(maxUses),
        perEmailLimit: Number(perEmailLimit) || 1,
        appliesToAll,
        ticketTypeIds: appliesToAll ? [] : selectedTypes,
        expiresAt,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success('Código creado.');
      resetForm();
    });
  }

  function onRevoke(id: string, codeName: string) {
    if (!confirm(`¿Desactivar el código ${codeName}? Dejará de aplicarse en nuevas compras.`)) return;
    startTransition(async () => {
      const res = await revokePromoCode(id, eventId);
      if (!res.ok) {
        toast.error(res.message ?? 'No se pudo desactivar.');
        return;
      }
      toast.success('Código desactivado.');
    });
  }

  return (
    <div className="s-stack" style={{ gap: 16 }}>
      {/* Crear código */}
      <div className="s-card">
        <div className="s-form-grid">
          <div className="s-field">
            <label htmlFor="promo_code" className="s-label">Código</label>
            <input id="promo_code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VERANO20" maxLength={32} className="s-input" style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="s-field">
            <label htmlFor="promo_label" className="s-label">Etiqueta (RRPP / canal)</label>
            <input id="promo_label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Juan RRPP / Instagram" maxLength={80} className="s-input" />
          </div>
        </div>

        <div className="s-form-grid s-field">
          <div>
            <label htmlFor="promo_discount_type" className="s-label">Tipo de descuento</label>
            <select id="promo_discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed' | 'free')} className="s-input s-select">
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo (S/)</option>
              <option value="free">Gratis (100%)</option>
            </select>
          </div>
          {discountType !== 'free' && (
            <div>
              <label htmlFor="promo_value" className="s-label">{discountType === 'percent' ? 'Porcentaje (1–100)' : 'Monto en soles'}</label>
              <input id="promo_value" type="number" inputMode="decimal" min={discountType === 'percent' ? 1 : 0.5} max={discountType === 'percent' ? 100 : undefined} step={discountType === 'percent' ? 1 : 0.5} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? '20' : '10'} className="s-input" />
            </div>
          )}
        </div>

        <div className="s-form-grid s-field">
          <div>
            <label htmlFor="promo_limit_mode" className="s-label">Límite de usos</label>
            <select id="promo_limit_mode" value={limitMode} onChange={(e) => setLimitMode(e.target.value as 'unlimited' | 'capped')} className="s-input s-select">
              <option value="unlimited">Ilimitado</option>
              <option value="capped">Limitar usos totales</option>
            </select>
            {limitMode === 'capped' && (
              <input type="number" inputMode="numeric" min={1} step={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Ej. 100" className="s-input" style={{ marginTop: 8 }} />
            )}
          </div>
          <div>
            <label htmlFor="promo_per_email" className="s-label">Usos por email</label>
            <input id="promo_per_email" type="number" inputMode="numeric" min={1} step={1} value={perEmailLimit} onChange={(e) => setPerEmailLimit(e.target.value)} className="s-input" />
          </div>
        </div>

        <div className="s-field">
          <label htmlFor="promo_expires" className="s-label">Expira (opcional)</label>
          <input id="promo_expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="s-input" />
        </div>

        <div className="s-field">
          <label className="s-label">Aplica a</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 4 }}>
            <input type="radio" name="applies_to" checked={appliesToAll} onChange={() => setAppliesToAll(true)} />
            <span>Todas las entradas del evento</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="radio" name="applies_to" checked={!appliesToAll} onChange={() => setAppliesToAll(false)} />
            <span>Solo algunas entradas</span>
          </label>
          {!appliesToAll && (
            <div style={{ marginTop: 8, padding: 12, border: '1px dashed var(--cream-3)', borderRadius: 'var(--r-ctl)' }}>
              {ticketTypes.length === 0 ? (
                <p className="s-hint">Este evento no tiene tipos de entrada.</p>
              ) : (
                ticketTypes.map((t) => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '3px 0' }}>
                    <input type="checkbox" checked={selectedTypes.includes(t.id)} onChange={() => toggleType(t.id)} />
                    <span>{t.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="button" className="s-btn s-btn--primary" onClick={onCreate} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : 'Crear código'}
          </button>
        </div>
      </div>

      {/* Códigos existentes + ventas por código */}
      {codes.length === 0 ? (
        <div className="s-card"><p className="s-empty">Todavía no creaste códigos para este evento.</p></div>
      ) : (
        <div className="s-table-wrap">
          <div className="s-card s-card--flush">
            <table className="s-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>RRPP / canal</th>
                  <th>Descuento</th>
                  <th className="num">Usos</th>
                  <th className="num">Entradas</th>
                  <th className="num">S/ movidos</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const s = sales[c.id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
                  return (
                    <tr key={c.id}>
                      <td><span className="s-saldo-num" style={{ fontSize: 15, letterSpacing: '0.04em' }}>{c.code}</span></td>
                      <td><span className="s-muted">{c.label ?? '—'}</span></td>
                      <td>{describeDiscount(c)}</td>
                      <td className="num">{c.use_count}{c.max_uses !== null ? ` / ${c.max_uses}` : ''}</td>
                      <td className="num">{s.entries}</td>
                      <td className="num">{formatPEN(s.soldCents)}</td>
                      <td>{c.is_active ? <span className="s-badge s-badge--ok">Activo</span> : <span className="s-badge s-badge--draft">Inactivo</span>}</td>
                      <td className="num">
                        {c.is_active && (
                          <button type="button" onClick={() => onRevoke(c.id, c.code)} disabled={pending} className="s-btn s-btn--ghost s-btn--sm">
                            <Trash2 className="h-3.5 w-3.5" /> Desactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
