'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { submitYapeProof } from './actions';

type Props = {
  orderId: string;
  brandId: string;
  expectedAmountCents: number;
  buyerName: string;
  appUrl: string;
};

export function YapeUploadForm({ orderId, expectedAmountCents, buyerName }: Props) {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }
    if (f.size > 5 * 1024 * 1024) { toast.error('La captura debe pesar menos de 5 MB'); return; }
    setFile(f);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) { toast.error('Subí la captura del comprobante'); return; }
        const form = new FormData(e.currentTarget);
        form.set('order_id', orderId);
        form.set('receipt_file', file);
        start(async () => {
          const res = await submitYapeProof(form);
          if (!res.ok) { toast.error(res.message ?? 'Error al subir'); return; }
          window.location.href = res.redirectUrl;
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div className="c-field">
        <label htmlFor="amount" className="c-label">Monto que yapeaste (S/)</label>
        <input id="amount" name="amount_soles" type="number" step="0.01" required defaultValue={(expectedAmountCents / 100).toFixed(2)} className="c-input" inputMode="decimal" />
        <p className="c-help">Debe ser exactamente {formatPEN(expectedAmountCents)}</p>
      </div>

      <div className="c-field">
        <label htmlFor="operation_number" className="c-label">N° de operación</label>
        <input id="operation_number" name="operation_number" required placeholder="00012345" maxLength={20} className="c-input" inputMode="numeric" />
        <p className="c-help">Aparece en tu app Yape como &quot;N° de operación&quot;.</p>
      </div>

      <div className="c-field">
        <label htmlFor="payer_name" className="c-label">Tu nombre completo (como en Yape)</label>
        <input id="payer_name" name="payer_name" required defaultValue={buyerName} placeholder="María López" className="c-input" />
        <p className="c-help">Debe coincidir con el nombre del comprobante.</p>
      </div>

      <div className="c-field">
        <label htmlFor="security_code" className="c-label">Código de seguridad</label>
        <input id="security_code" name="security_code" required placeholder="123 o ABC456" maxLength={20} className="c-input" />
        <p className="c-help">El código de 3-4 caracteres que figura en el comprobante.</p>
      </div>

      <div className="c-field">
        <label htmlFor="receipt" className="c-label">Captura del comprobante</label>
        <input id="receipt" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" required onChange={handleFile} className="c-input" style={{ paddingTop: 11 }} />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" style={{ marginTop: 10, maxHeight: 240, borderRadius: 'var(--r-ctl)', border: '1px solid var(--cream-3)' }} />
        )}
      </div>

      <button type="submit" className="c-btn c-btn--brand c-btn--block c-btn--lg" disabled={pending || !file}>
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</> : <><Upload className="h-4 w-4" /> Enviar comprobante</>}
      </button>

      <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5 }}>
        Tu pago queda en revisión. El promotor valida en 5-15 min en horario operativo y te llega un email + WhatsApp con tu QR.
      </p>
    </form>
  );
}
