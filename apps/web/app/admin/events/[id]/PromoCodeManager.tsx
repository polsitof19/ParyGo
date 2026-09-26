'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Send } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { useTextos } from '@/components/IdiomaPanel';
import { createPromoCode, revokePromoCode, sendPromoCodeByEmailAction } from './promo-actions';

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

function describeDiscount(c: PromoCodeRow, t: (es: string, en: string) => string): string {
  if (c.discount_type === 'free') return t('100% (gratis)', '100% (free)');
  if (c.discount_type === 'percent') return `${c.discount_value}%`;
  return `−${formatPEN(c.discount_value)}`;
}

export function PromoCodeManager({
  eventId,
  ticketTypes,
  codes,
  sales,
  impersonating = false,
}: {
  eventId: string;
  ticketTypes: TicketTypeLite[];
  codes: PromoCodeRow[];
  sales: PromoSales;
  impersonating?: boolean;
}) {
  const { t } = useTextos();
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
      toast.success(t('Código creado.', 'Code created.'));
      resetForm();
    });
  }

  function onRevoke(id: string, codeName: string) {
    if (!confirm(t(`¿Desactivar el código ${codeName}? Dejará de aplicarse en nuevas compras.`, `Deactivate code ${codeName}? It will stop applying to new purchases.`))) return;
    startTransition(async () => {
      const res = await revokePromoCode(id, eventId);
      if (!res.ok) {
        toast.error(res.message ?? t('No se pudo desactivar.', 'Could not deactivate.'));
        return;
      }
      toast.success(t('Código desactivado.', 'Code deactivated.'));
    });
  }

  function onSendEmail(id: string, codeName: string) {
    const email = window.prompt(t(`Enviar el código ${codeName} por email a tu promotor.\n\nEmail del promotor:`, `Send code ${codeName} by email to your promoter.\n\nPromoter's email:`));
    if (!email) return;
    startTransition(async () => {
      const res = await sendPromoCodeByEmailAction(id, eventId, email.trim());
      if (!res.ok) { toast.error(res.message || t('No se pudo enviar.', 'Could not send.')); return; }
      toast.success(res.message);
    });
  }

  return (
    <div className="s-stack" style={{ gap: 16 }}>
      {/* Crear código — escritura, oculto en solo lectura */}
      {!impersonating && (
      <div className="s-card">
        <div className="s-form-grid">
          <div className="s-field">
            <label htmlFor="promo_code" className="s-label">{t('Código', 'Code')}</label>
            <input id="promo_code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('VERANO20', 'SUMMER20')} maxLength={32} className="s-input" style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="s-field">
            <label htmlFor="promo_label" className="s-label">{t('Etiqueta (RRPP / canal)', 'Label (promoter / channel)')}</label>
            <input id="promo_label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('Juan RRPP / Instagram', 'John Promoter / Instagram')} maxLength={80} className="s-input" />
          </div>
        </div>

        <div className="s-form-grid s-field">
          <div>
            <label htmlFor="promo_discount_type" className="s-label">{t('Tipo de descuento', 'Discount type')}</label>
            <select id="promo_discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed' | 'free')} className="s-input s-select">
              <option value="percent">{t('Porcentaje (%)', 'Percentage (%)')}</option>
              <option value="fixed">{t('Monto fijo (S/)', 'Fixed amount (S/)')}</option>
              <option value="free">{t('Gratis (100%)', 'Free (100%)')}</option>
            </select>
          </div>
          {discountType !== 'free' && (
            <div>
              <label htmlFor="promo_value" className="s-label">{discountType === 'percent' ? t('Porcentaje (1–100)', 'Percentage (1-100)') : t('Monto en soles', 'Amount in soles')}</label>
              <input id="promo_value" type="number" inputMode="decimal" min={discountType === 'percent' ? 1 : 0.5} max={discountType === 'percent' ? 100 : undefined} step={discountType === 'percent' ? 1 : 0.5} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? '20' : '10'} className="s-input" />
            </div>
          )}
        </div>

        <div className="s-form-grid s-field">
          <div>
            <label htmlFor="promo_limit_mode" className="s-label">{t('Límite de usos', 'Usage limit')}</label>
            <select id="promo_limit_mode" value={limitMode} onChange={(e) => setLimitMode(e.target.value as 'unlimited' | 'capped')} className="s-input s-select">
              <option value="unlimited">{t('Ilimitado', 'Unlimited')}</option>
              <option value="capped">{t('Limitar usos totales', 'Limit total uses')}</option>
            </select>
            {limitMode === 'capped' && (
              <input type="number" inputMode="numeric" min={1} step={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t('Ej. 100', 'E.g. 100')} className="s-input" style={{ marginTop: 8 }} />
            )}
          </div>
          <div>
            <label htmlFor="promo_per_email" className="s-label">{t('Usos por email', 'Uses per email')}</label>
            <input id="promo_per_email" type="number" inputMode="numeric" min={1} step={1} value={perEmailLimit} onChange={(e) => setPerEmailLimit(e.target.value)} className="s-input" />
          </div>
        </div>

        <div className="s-field">
          <label htmlFor="promo_expires" className="s-label">{t('Expira (opcional)', 'Expires (optional)')}</label>
          <input id="promo_expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="s-input" />
        </div>

        <div className="s-field">
          <label className="s-label">{t('Aplica a', 'Applies to')}</label>
          {/* .s-check: la etiqueta entera es el area de toque (44). Suelto,
              el radio media 20px de alto. */}
          <label className="s-check" style={{ display: 'flex' }}>
            <input type="radio" name="applies_to" checked={appliesToAll} onChange={() => setAppliesToAll(true)} />
            <span>{t('Todas las entradas del evento', 'All tickets of the event')}</span>
          </label>
          <label className="s-check" style={{ display: 'flex' }}>
            <input type="radio" name="applies_to" checked={!appliesToAll} onChange={() => setAppliesToAll(false)} />
            <span>{t('Solo algunas entradas', 'Only some tickets')}</span>
          </label>
          {!appliesToAll && (
            <div style={{ marginTop: 8, padding: 12, border: '1px dashed var(--line)', borderRadius: 'var(--r-ctl)' }}>
              {ticketTypes.length === 0 ? (
                <p className="s-hint">{t('Este evento no tiene tipos de entrada.', 'This event has no ticket types.')}</p>
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
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('Guardando…', 'Saving…')}</> : t('Crear código', 'Create code')}
          </button>
        </div>
      </div>
      )}

      {/* Códigos existentes + ventas por código */}
      {codes.length === 0 ? (
        <div className="s-card"><p className="s-empty">{t('Todavía no creaste códigos para este evento.', "You haven't created any codes for this event yet.")}</p></div>
      ) : (
        <div className="s-table-wrap">
          <div className="s-card s-card--flush">
            {/* s-table--stack: en ≤640 la fila se vuelve bloque (pedía 771px
                de ancho en una pantalla de 358). */}
            <table className="s-table s-table--stack">
              <thead>
                <tr>
                  <th>{t('Código', 'Code')}</th>
                  <th>{t('RRPP / canal', 'Promoter / channel')}</th>
                  <th>{t('Descuento', 'Discount')}</th>
                  <th className="num">{t('Usos', 'Uses')}</th>
                  <th className="num">{t('Entradas', 'Tickets')}</th>
                  <th className="num">{t('S/ movidos', 'S/ moved')}</th>
                  <th>{t('Estado', 'Status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const s = sales[c.id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
                  return (
                    <tr key={c.id}>
                      <td><span className="s-saldo-num" style={{ fontSize: 15, letterSpacing: '0.04em' }}>{c.code}</span></td>
                      <td data-l={t('RRPP', 'Promoter')}><span className="s-muted">{c.label ?? '—'}</span></td>
                      <td data-l={t('Descuento', 'Discount')}>{describeDiscount(c, t)}</td>
                      <td className="num" data-l={t('Usos', 'Uses')}>{c.use_count}{c.max_uses !== null ? ` / ${c.max_uses}` : ''}</td>
                      <td className="num" data-l={t('Entradas', 'Tickets')}>{s.entries}</td>
                      <td className="num" data-l={t('S/ movidos', 'S/ moved')}>{formatPEN(s.soldCents)}</td>
                      <td>{c.is_active ? <span className="s-badge s-badge--ok">{t('Activo', 'Active')}</span> : <span className="s-badge s-badge--draft">{t('Inactivo', 'Inactive')}</span>}</td>
                      <td className="num" data-acts="">
                        {impersonating ? (
                          <span className="s-muted-3" style={{ fontSize: 12.5 }}>—</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => onSendEmail(c.id, c.code)} disabled={pending} className="s-btn s-btn--ghost s-btn--sm">
                              <Send className="h-3.5 w-3.5" /> {t('Enviar', 'Send')}
                            </button>
                            {c.is_active && (
                              <button type="button" onClick={() => onRevoke(c.id, c.code)} disabled={pending} className="s-btn s-btn--ghost s-btn--sm">
                                <Trash2 className="h-3.5 w-3.5" /> {t('Desactivar', 'Deactivate')}
                              </button>
                            )}
                          </>
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
