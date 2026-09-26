'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Search, Download, Send, Ban } from 'lucide-react';
import { voidTicketAction, type VoidTicketState } from '../../../actions';
import { formatPEN } from '@/lib/utils';
import { useTextos } from '@/components/IdiomaPanel';
import type { Textos } from '@/lib/idioma';

export type ClientRow = {
  orderId: string;
  name: string;
  email: string;
  phone: string;
  dni: string | null;
  docType: string | null;
  paymentMethod: string;
  totalCents: number;
  discountCents: number;
  createdAt: string;
  tickets: { id: string; typeName: string; number: string; voided: boolean; enteredAt: string | null }[];
};

const docLabel = (tt: Textos['t'], d: string | null) => (d === 'ce' ? 'CE' : d === 'passport' ? tt('Pasaporte', 'Passport') : 'DNI');
const methodLabel = (m: string) => (m === 'mercadopago' ? 'MercadoPago' : m === 'yape_manual' ? 'Yape' : m);
const fmtDate = (iso: string, loc: string) => new Date(iso).toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

// Escape CSV: comillas dobladas + envolver si hay coma/comilla/salto de línea.
function csvCell(v: string | number | null): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ClientsTable({ rows, eventId, eventName, impersonating = false, focusSearch = false, hint = null }: { rows: ClientRow[]; eventId: string; eventName: string; impersonating?: boolean; focusSearch?: boolean; hint?: string | null }) {
  const { t, loc } = useTextos();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(t) ||
      r.email.toLowerCase().includes(t) ||
      (r.dni ?? '').toLowerCase().includes(t)
    );
  }, [q, rows]);

  function exportCsv() {
    const headers = [t('Nombre', 'Name'), t('Email', 'Email'), 'WhatsApp', t('Documento', 'Document'), t('Entradas', 'Tickets'), t('Total', 'Total'), t('Descuento', 'Discount'), t('Método', 'Method'), t('Fecha', 'Date')];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const tix = r.tickets.map((tk) => `${tk.typeName}${tk.voided ? ` (${t('ANULADA', 'VOIDED')})` : ''}`).join(' | ');
      lines.push([
        csvCell(r.name), csvCell(r.email), csvCell(r.phone),
        csvCell(`${docLabel(t, r.docType)} ${r.dni ?? ''}`.trim()),
        csvCell(tix), csvCell((r.totalCents / 100).toFixed(2)), csvCell((r.discountCents / 100).toFixed(2)),
        csvCell(methodLabel(r.paymentMethod)), csvCell(fmtDate(r.createdAt, loc)),
      ].join(','));
    }
    // BOM para que Excel abra los acentos bien.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${eventName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="s-stack" style={{ gap: 14 }}>
      {hint && <p className="s-calm" style={{ margin: 0 }}>{hint}</p>}
      <div className="s-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search className="h-4 w-4" style={{ position: 'absolute', left: 12, top: 13, color: 'var(--ink-3)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Buscar por nombre, email o documento', 'Search by name, email or document')}
            className="s-input"
            style={{ paddingLeft: 36 }}
            aria-label={t('Buscar comprador', 'Search buyer')}
            // Llegando desde "Buscar comprador" o "Reenviar entrada" (acciones
            // rápidas del evento) el teclado ya está en el campo: un toque menos.
            autoFocus={focusSearch}
            enterKeyHint="search"
          />
        </div>
        <button type="button" onClick={exportCsv} className="s-btn s-btn--soft" disabled={rows.length === 0} title={t('Exporta los compradores de esta página', 'Export the buyers on this page')}>
          <Download className="h-4 w-4" /> {t('CSV (esta página)', 'CSV (this page)')}
        </button>
        <a href={`/api/admin/events/${eventId}/export-clientes`} className="s-btn s-btn--soft" title={t('Descarga TODOS los compradores pagados del evento', 'Download ALL paid buyers of the event')}>
          <Download className="h-4 w-4" /> {t('CSV completo', 'Full CSV')}
        </a>
      </div>

      {filtered.length === 0 ? (
        <div className="s-card"><p className="s-empty">{rows.length === 0 ? t('Todavía no hay compradores pagados.', 'No paid buyers yet.') : t('Ningún comprador coincide con la búsqueda.', 'No buyer matches the search.')}</p></div>
      ) : (
        <div className="s-stack" style={{ gap: 10 }}>
          {filtered.map((r) => (
            <div key={r.orderId} className="s-card" style={{ padding: '14px 16px' }}>
              <div className="s-card__head" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }}>{r.name}</p>
                  <p className="s-muted" style={{ fontSize: 13, wordBreak: 'break-word' }}>{r.email} · {r.phone}</p>
                  <p className="s-muted" style={{ fontSize: 13 }}>{docLabel(t, r.docType)} {r.dni ?? '—'} · {methodLabel(r.paymentMethod)} · {fmtDate(r.createdAt, loc)}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontWeight: 800, fontFamily: 'var(--display)' }}>{formatPEN(r.totalCents)}</p>
                  {!impersonating && <ResendButton orderId={r.orderId} />}
                </div>
              </div>
              <ul className="s-stack" style={{ gap: 6, listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {r.tickets.map((tk) => (
                  <li key={tk.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <span style={{ fontSize: 13.5 }}>
                      <strong>{tk.number}</strong> · {tk.typeName}
                      {tk.voided && <span className="s-badge s-badge--alert" style={{ marginLeft: 8 }}>{t('Anulada', 'Voided')}</span>}
                      {!tk.voided && tk.enteredAt && <span className="s-badge s-badge--ok" style={{ marginLeft: 8 }}>{t('Ingresó', 'Entered')} {new Date(tk.enteredAt).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}</span>}
                    </span>
                    {!tk.voided && !impersonating && <VoidButton ticketId={tk.id} number={tk.number} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResendButton({ orderId }: { orderId: string }) {
  const { t } = useTextos();
  const [sending, setSending] = useState(false);
  async function resend() {
    setSending(true);
    try {
      const r = await fetch('/api/admin/resend-ticket-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, force: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && (data.status === 'sent' || data.status === 'already_sent')) toast.success(t('QR reenviado por email.', 'QR resent by email.'));
      else if (r.status === 403) toast.error(t('No autorizado.', 'Not authorized.'));
      else toast.error(t('No se pudo reenviar.', 'Could not resend.'));
    } catch { toast.error(t('Error de red.', 'Network error.')); }
    finally { setSending(false); }
  }
  return (
    <button type="button" onClick={resend} disabled={sending} className="s-btn s-btn--ghost s-btn--sm" style={{ marginTop: 4 }}>
      <Send className="h-3.5 w-3.5" /> {sending ? t('Enviando…', 'Sending…') : t('Reenviar QR', 'Resend QR')}
    </button>
  );
}

const voidInitial: VoidTicketState = { ok: false, message: null };
function VoidButton({ ticketId, number }: { ticketId: string; number: string }) {
  const { t } = useTextos();
  const [state, action] = useFormState(voidTicketAction, voidInitial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t(`¿Anular la entrada ${number}? Su QR dejará de valer en puerta. La devolución del dinero la gestionas tú por tu Yape/MercadoPago.`, `Void ticket ${number}? Its QR will stop working at the door. You handle the refund yourself via your Yape/MercadoPago.`))) e.preventDefault();
      }}
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      {state.message && <span className="s-muted" style={{ fontSize: 12, marginRight: 8, color: 'var(--ink-2)' }}>{state.ok ? '✓' : state.message}</span>}
      <VoidSubmit />
    </form>
  );
}
function VoidSubmit() {
  const { t } = useTextos();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--danger-soft s-btn--sm" disabled={pending}>
      <Ban className="h-3.5 w-3.5" /> {pending ? t('Anulando…', 'Voiding…') : t('Anular', 'Void')}
    </button>
  );
}
