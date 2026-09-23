'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Mail, Check } from 'lucide-react';
import { reenviarMiEntrada } from './resend-actions';

// Botón "Reenviar a mi email" dentro de la entrada. El correo sale SIEMPRE al
// email de la orden (el server ni lo pregunta ni lo acepta), y va a la cola:
// el botón contesta al toque aunque el proveedor de correo esté demorando.
export function ReenviarMiEntrada({ qrCode }: { qrCode: string }) {
  const [pending, start] = useTransition();
  const [listo, setListo] = useState(false);

  return (
    <button
      type="button"
      className="c-btn c-btn--ghost"
      disabled={pending || listo}
      onClick={() =>
        start(async () => {
          const res = await reenviarMiEntrada(qrCode);
          if (res.ok) {
            setListo(true);
            toast.success(res.message);
          } else {
            toast.error(res.message);
          }
        })
      }
    >
      {listo ? <Check className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
      {pending ? 'Enviando…' : listo ? 'Enviado' : 'Reenviar a mi email'}
    </button>
  );
}
