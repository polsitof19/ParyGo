'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, ImagePlus } from 'lucide-react';
import { formatMoney, simbolo, sinDecimales, type Moneda } from '@/lib/moneda';
import { type Medio } from '@/lib/metodoManual';
import { submitYapeProof } from './actions';

type Props = {
  orderId: string;
  brandId: string;
  expectedAmountCents: number;
  moneda: Moneda;
  medio?: Medio;
  buyerName: string;
  appUrl: string;
};

export function YapeUploadForm({ orderId, expectedAmountCents, moneda, medio = 'yape', buyerName }: Props) {
  const esYape = medio === 'yape';
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
        if (!file) { toast.error('Sube la captura del comprobante'); return; }
        const form = new FormData(e.currentTarget);
        form.set('order_id', orderId);
        form.set('receipt_file', file);
        // Un comprobante de Nequi/transferencia puede no traer código: el server lo pide siempre.
        if (!esYape && !String(form.get('security_code') ?? '').trim()) form.set('security_code', 'N/A');
        start(async () => {
          const res = await submitYapeProof(form);
          if (!res.ok) { toast.error(res.message ?? 'Error al subir'); return; }
          window.location.href = res.redirectUrl;
        });
      }}
      className="b-yapeform"
    >
      <div className="c-field">
        <label htmlFor="amount" className="c-label">{esYape ? 'Monto que yapeaste' : medio === 'usdt' ? 'Monto que enviaste' : 'Monto que pagaste'} ({medio === 'usdt' ? 'USDT' : simbolo(moneda)})</label>
        <input id="amount" name="amount_soles" type="number" step={sinDecimales(moneda) ? 1 : 0.01} required defaultValue={sinDecimales(moneda) ? String(expectedAmountCents / 100) : (expectedAmountCents / 100).toFixed(2)} className="c-input" inputMode="decimal" />
        <p className="c-help">Debe ser exactamente {medio === 'usdt' ? `${(expectedAmountCents / 100).toFixed(2)} USDT` : formatMoney(expectedAmountCents, moneda)}</p>
      </div>

      <div className="c-field">
        <label htmlFor="operation_number" className="c-label">{esYape ? 'N° de operación' : medio === 'usdt' ? 'Hash de la transacción (TxID)' : 'N° de operación o referencia'}</label>
        <input id="operation_number" name="operation_number" required placeholder={medio === 'usdt' ? '0x… o hash de la transacción' : '00012345'} maxLength={esYape ? 20 : 100} className="c-input" inputMode={esYape ? 'numeric' : 'text'} />
        <p className="c-help">{esYape ? <>Aparece en tu app Yape como &quot;N° de operación&quot;.</> : medio === 'usdt' ? <>Lo ves en tu billetera o exchange, en el detalle del envío.</> : <>Aparece en tu comprobante como &quot;N° de operación&quot; o referencia.</>}</p>
      </div>

      <div className="c-field">
        <label htmlFor="payer_name" className="c-label">{esYape ? 'Tu nombre completo (como en Yape)' : 'Tu nombre completo (como en el comprobante)'}</label>
        <input id="payer_name" name="payer_name" required defaultValue={buyerName} className="c-input" />
        <p className="c-help">Debe coincidir con el nombre del comprobante.</p>
      </div>

      {esYape && (
        <div className="c-field">
          <label htmlFor="security_code" className="c-label">Código de seguridad</label>
          <input id="security_code" name="security_code" required placeholder="123 o ABC456" maxLength={20} className="c-input" />
          <p className="c-help">El código de 3-4 caracteres que figura en el comprobante.</p>
        </div>
      )}

      <div className="c-field">
        <label htmlFor="receipt" className="c-label">Captura del comprobante</label>
        {/* El input nativo dibuja su propio botón gris ("Choose File" en
            Safari, sin traducir). Se esconde —sigue en el DOM, enfocable y con
            su <label> de caption— y lo visible es un botón del sistema más el
            nombre del archivo. Es la pantalla donde el comprador paga: no
            puede tener un control que se vea prestado. */}
        <div className="c-file">
          <input id="receipt" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" required onChange={handleFile} className="c-file__input" />
          {/* La zona es la <label>: tocar cualquier parte abre el selector. */}
          <label htmlFor="receipt" className="c-file__btn">
            <ImagePlus aria-hidden="true" />
            {file ? 'Cambiar captura' : esYape ? 'Sube la captura de tu Yape' : 'Sube la captura de tu pago'}
            <span className="c-file__name">{file?.name ?? 'PNG o JPG, hasta 5 MB'}</span>
          </label>
        </div>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="c-file__prev" />
        )}
      </div>

      <button type="submit" className="b-btn b-btn--go" disabled={pending || !file}>
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</> : <><Upload className="h-4 w-4" /> {esYape ? 'Listo, ya yapeé' : 'Listo, ya pagué'}</>}
      </button>

      <p className="c-muted-3">Te confirmamos por email en minutos.</p>
    </form>
  );
}
