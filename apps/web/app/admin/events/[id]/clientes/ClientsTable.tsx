'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Search, Download, Send, Ban } from 'lucide-react';
import { voidTicketAction, type VoidTicketState } from '../../../actions';
import { formatPEN } from '@/lib/utils';

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

const docLabel = (t: string | null) => (t === 'ce' ? 'CE' : t === 'passport' ? 'Pasaporte' : 'DNI');
const methodLabel = (m: string) => (m === 'mercadopago' ? 'MercadoPago' : m === 'yape_manual' ? 'Yape' : m);
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

// Escape CSV: comillas dobladas + envolver si hay coma/comilla/salto de línea.
function csvCell(v: string | number | null): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ClientsTable({ rows, eventName, impersonating = false }: { rows: ClientRow[]; eventName: string; impersonating?: boolean }) {
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
    const headers = ['Nombre', 'Email', 'WhatsApp', 'Documento', 'Entradas', 'Total', 'Descuento', 'Método', 'Fecha'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const tix = r.tickets.map((t) => `${t.typeName}${t.voided ? ' (ANULADA)' : ''}`).join(' | ');
      lines.push([
        csvCell(r.name), csvCell(r.email), csvCell(r.phone),
        csvCell(`${docLabel(r.docType)} ${r.dni ?? ''}`.trim()),
        csvCell(tix), csvCell((r.totalCents / 100).toFixed(2)), csvCell((r.discountCents / 100).toFixed(2)),
        csvCell(methodLabel(r.paymentMethod)), csvCell(fmtDate(r.createdAt)),
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
      <div className="s-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search className="h-4 w-4" style={{ position: 'absolute', left: 12, top: 13, color: 'var(--ink-3)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o documento"
            className="s-input"
            style={{ paddingLeft: 36 }}
            aria-label="Buscar comprador"
          />
        </div>
        <button type="button" onClick={exportCsv} className="s-btn s-btn--soft" disabled={rows.length === 0} title="Exporta los compradores de esta página">
          <Download className="h-4 w-4" /> Exportar CSV (esta página)
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="s-card"><p className="s-empty">{rows.length === 0 ? 'Todavía no hay compradores pagados.' : 'Ningún comprador coincide con la búsqueda.'}</p></div>
      ) : (
        <div className="s-stack" style={{ gap: 10 }}>
          {filtered.map((r) => (
            <div key={r.orderId} className="s-card" style={{ padding: '14px 16px' }}>
              <div className="s-card__head" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }}>{r.name}</p>
                  <p className="s-muted" style={{ fontSize: 13, wordBreak: 'break-word' }}>{r.email} · {r.phone}</p>
                  <p className="s-muted" style={{ fontSize: 13 }}>{docLabel(r.docType)} {r.dni ?? '—'} · {methodLabel(r.paymentMethod)} · {fmtDate(r.createdAt)}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontWeight: 800, fontFamily: 'var(--display)' }}>{formatPEN(r.totalCents)}</p>
                  {!impersonating && <ResendButton orderId={r.orderId} />}
                </div>
              </div>
              <ul className="s-stack" style={{ gap: 6, listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {r.tickets.map((t) => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--cream-3)', paddingTop: 8 }}>
                    <span style={{ fontSize: 13.5 }}>
                      <strong>{t.number}</strong> · {t.typeName}
                      {t.voided && <span className="s-badge s-badge--alert" style={{ marginLeft: 8 }}>Anulada</span>}
                      {!t.voided && t.enteredAt && <span className="s-badge s-badge--ok" style={{ marginLeft: 8 }}>Ingresó {new Date(t.enteredAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}</span>}
                    </span>
                    {!t.voided && !impersonating && <VoidButton ticketId={t.id} number={t.number} />}
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
  const [sending, setSending] = useState(false);
  async function resend() {
    setSending(true);
    try {
      const r = await fetch('/api/admin/resend-ticket-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, force: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && (data.status === 'sent' || data.status === 'already_sent')) toast.success('QR reenviado por email.');
      else if (r.status === 403) toast.error('No autorizado.');
      else toast.error('No se pudo reenviar.');
    } catch { toast.error('Error de red.'); }
    finally { setSending(false); }
  }
  return (
    <button type="button" onClick={resend} disabled={sending} className="s-btn s-btn--ghost s-btn--sm" style={{ marginTop: 4 }}>
      <Send className="h-3.5 w-3.5" /> {sending ? 'Enviando…' : 'Reenviar QR'}
    </button>
  );
}

const voidInitial: VoidTicketState = { ok: false, message: null };
function VoidButton({ ticketId, number }: { ticketId: string; number: string }) {
  const [state, action] = useFormState(voidTicketAction, voidInitial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`¿Anular la entrada ${number}? Su QR dejará de valer en puerta. La devolución del dinero la gestionás vos por tu Yape/MercadoPago.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      {state.message && <span className="s-muted" style={{ fontSize: 12, marginRight: 8, color: state.ok ? 'var(--ok)' : 'var(--alert)' }}>{state.ok ? '✓' : state.message}</span>}
      <VoidSubmit />
    </form>
  );
}
function VoidSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--ghost s-btn--sm" disabled={pending} style={{ color: 'var(--alert)' }}>
      <Ban className="h-3.5 w-3.5" /> {pending ? 'Anulando…' : 'Anular'}
    </button>
  );
}
