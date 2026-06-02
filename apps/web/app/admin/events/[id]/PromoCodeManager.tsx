'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
  // keyed by promo_code_id
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

  // Controlled value fields
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
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
    if (!confirm(`¿Desactivar el código ${codeName}? Dejará de aplicarse en nuevas compras.`)) {
      return;
    }
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
    <div className="space-y-6">
      {/* ---- Create form ---- */}
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="promo_code">Código</Label>
              <Input
                id="promo_code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VERANO20"
                className="uppercase"
                maxLength={32}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo_label">Etiqueta (RRPP / canal)</Label>
              <Input
                id="promo_label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Juan RRPP / Instagram"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="promo_discount_type">Tipo de descuento</Label>
              <select
                id="promo_discount_type"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as 'percent' | 'fixed' | 'free')
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
                <option value="free">Gratis (100%)</option>
              </select>
            </div>
            {discountType !== 'free' && (
              <div className="space-y-2">
                <Label htmlFor="promo_value">
                  {discountType === 'percent' ? 'Porcentaje (1–100)' : 'Monto en soles'}
                </Label>
                <Input
                  id="promo_value"
                  type="number"
                  inputMode="decimal"
                  min={discountType === 'percent' ? 1 : 0.5}
                  max={discountType === 'percent' ? 100 : undefined}
                  step={discountType === 'percent' ? 1 : 0.5}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? '20' : '10'}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="promo_limit_mode">Límite de usos</Label>
              <select
                id="promo_limit_mode"
                value={limitMode}
                onChange={(e) => setLimitMode(e.target.value as 'unlimited' | 'capped')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="unlimited">Ilimitado</option>
                <option value="capped">Limitar usos totales</option>
              </select>
              {limitMode === 'capped' && (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Ej. 100"
                  className="mt-2"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo_per_email">Usos por email</Label>
              <Input
                id="promo_per_email"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={perEmailLimit}
                onChange={(e) => setPerEmailLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="promo_expires">Expira (opcional)</Label>
            <Input
              id="promo_expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Aplica a</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="applies_to"
                checked={appliesToAll}
                onChange={() => setAppliesToAll(true)}
              />
              <span>Todas las entradas del evento</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="applies_to"
                checked={!appliesToAll}
                onChange={() => setAppliesToAll(false)}
              />
              <span>Solo algunas entradas</span>
            </label>
            {!appliesToAll && (
              <div className="mt-2 space-y-1 rounded-md border border-dashed border-border p-3">
                {ticketTypes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Este evento no tiene tipos de entrada.
                  </p>
                ) : (
                  ticketTypes.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(t.id)}
                        onChange={() => toggleType(t.id)}
                      />
                      <span>{t.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="gradient"
            onClick={onCreate}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : (
              <>Crear código →</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Existing codes + sales-by-code ---- */}
      {codes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Todavía no creaste códigos para este evento.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">RRPP / canal</th>
                <th className="px-3 py-3">Descuento</th>
                <th className="px-3 py-3 text-right">Usos</th>
                <th className="px-3 py-3 text-right">Entradas vendidas</th>
                <th className="px-3 py-3 text-right">S/ movidos</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const s = sales[c.id] ?? { entries: 0, soldCents: 0, discountCents: 0 };
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-mono uppercase tracking-[0.08em]">{c.code}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.label ?? '—'}</td>
                    <td className="px-3 py-3">{describeDiscount(c)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.use_count}
                      {c.max_uses !== null ? ` / ${c.max_uses}` : ''}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.entries}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPEN(s.soldCents)}</td>
                    <td className="px-3 py-3">
                      {c.is_active ? (
                        <span className="text-green">Activo</span>
                      ) : (
                        <span className="text-muted-foreground">Desactivado</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.is_active && (
                        <button
                          type="button"
                          onClick={() => onRevoke(c.id, c.code)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
