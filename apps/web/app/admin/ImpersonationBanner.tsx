import { Eye } from 'lucide-react';
import { stopImpersonationAction } from '../cabina-7k29x/impersonation-actions';

// Banner FIJO y visible en todo el panel mientras el super admin "ve" una marca.
// Color distinto, sticky arriba, con salida limpia. Que nunca haya duda del
// contexto. El boundary real es server-side; esto es la señal visual + la salida.
export function ImpersonationBanner({ brandName }: { brandName: string }) {
  return (
    <div className="imp-banner" role="status" aria-live="polite">
      <span className="imp-banner__msg">
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span>
          Estás viendo la marca <strong>{brandName}</strong> como super admin — <strong>SOLO LECTURA</strong>
        </span>
      </span>
      <form action={stopImpersonationAction}>
        <button type="submit" className="imp-banner__exit">Salir de la marca</button>
      </form>
    </div>
  );
}
