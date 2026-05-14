'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('La captura debe pesar menos de 5 MB');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) {
          toast.error('Subí la captura del comprobante');
          return;
        }
        const form = new FormData(e.currentTarget);
        form.set('order_id', orderId);
        form.set('receipt_file', file);
        start(async () => {
          const res = await submitYapeProof(form);
          if (!res.ok) {
            toast.error(res.message ?? 'Error al subir');
            return;
          }
          window.location.href = res.redirectUrl;
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="amount">Monto que yapeaste (S/)</Label>
        <Input
          id="amount"
          name="amount_soles"
          type="number"
          step="0.01"
          required
          defaultValue={(expectedAmountCents / 100).toFixed(2)}
        />
        <p className="text-xs text-muted-foreground">
          Debe ser exactamente {formatPEN(expectedAmountCents)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="operation_number">N° de operación</Label>
        <Input
          id="operation_number"
          name="operation_number"
          required
          placeholder="00012345"
          maxLength={20}
        />
        <p className="text-xs text-muted-foreground">
          Aparece en tu app Yape como "N° de operación".
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="payer_name">Tu nombre completo (como en Yape)</Label>
        <Input
          id="payer_name"
          name="payer_name"
          required
          defaultValue={buyerName}
          placeholder="María López"
        />
        <p className="text-xs text-muted-foreground">
          Debe matchear con el nombre que figura en tu comprobante.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="security_code">Código de seguridad</Label>
        <Input
          id="security_code"
          name="security_code"
          required
          placeholder="123 o ABC456"
          maxLength={20}
        />
        <p className="text-xs text-muted-foreground">
          El código de 3-4 caracteres que figura en el comprobante.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="receipt">Captura del comprobante</Label>
        <input
          id="receipt"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          required
          onChange={handleFile}
          className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
        />
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            className="mt-2 max-h-64 rounded-md border border-border"
          />
        )}
      </div>

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full"
        disabled={pending || !file}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Subiendo…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Enviar comprobante
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Tu pago queda en revisión. El promotor valida en 5-15 min en horario
        operativo y te llega un email + WhatsApp con tu QR.
      </p>
    </form>
  );
}
