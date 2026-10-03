import { Eye, Pencil } from 'lucide-react';
import { stopImpersonationAction, setSuperEditModeAction } from '../cabina-7k29x/impersonation-actions';
import { textosPanel } from '@/lib/idiomaServer';

// Franja FIJA y visible en todo el panel mientras el super admin está dentro de
// una marca. Dos estados, que se distinguen de lejos:
//
//   VIENDO    índigo, "solo lectura", con el interruptor apagado.
//   EDITANDO  alerta, "estás editando como super admin", con el interruptor
//             encendido y el nombre de la marca repetido — porque el riesgo de
//             este modo es olvidarse de en qué cuenta estás.
//
// La franja es la SEÑAL, no la defensa: cada escritura vuelve a decidir en el
// server (puedeEscribirComoSuper) y queda auditada.
export async function ImpersonationBanner({
  brandName,
  modoEdicion,
}: {
  brandName: string;
  modoEdicion: boolean;
}) {
  const { l, t } = await textosPanel();
  return (
    <div className={`imp-banner${modoEdicion ? ' imp-banner--edit' : ''}`} role="status" aria-live="polite">
      <span className="imp-banner__msg">
        {modoEdicion ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        <span>
          {l === 'en' ? (
            modoEdicion ? (
              <>
                You&apos;re <strong>EDITING</strong> the brand <strong>{brandName}</strong> as super admin.
                Everything you touch is logged under your name.
              </>
            ) : (
              <>
                You&apos;re viewing the brand <strong>{brandName}</strong> as super admin — <strong>READ ONLY</strong>
              </>
            )
          ) : modoEdicion ? (
            <>
              Estás <strong>EDITANDO</strong> la marca <strong>{brandName}</strong> como super admin. Todo lo que
              toques queda registrado a tu nombre.
            </>
          ) : (
            <>
              Estás viendo la marca <strong>{brandName}</strong> como super admin — <strong>SOLO LECTURA</strong>
            </>
          )}
        </span>
      </span>
      <span className="imp-banner__acts">
        {/* El interruptor es una acción de server: la cookie que habilita la
            escritura no se puede encender desde el cliente. */}
        <form action={setSuperEditModeAction.bind(null, !modoEdicion)}>
          <button type="submit" className={`imp-banner__toggle${modoEdicion ? ' imp-banner__toggle--on' : ''}`}>
            <span className="imp-banner__switch" aria-hidden="true" />
            {modoEdicion ? t('Salir del modo edición', 'Exit edit mode') : t('Editar como super admin', 'Edit as super admin')}
          </button>
        </form>
        <form action={stopImpersonationAction}>
          <button type="submit" className="imp-banner__exit">{t('Salir de la marca', 'Leave the brand')}</button>
        </form>
      </span>
    </div>
  );
}
