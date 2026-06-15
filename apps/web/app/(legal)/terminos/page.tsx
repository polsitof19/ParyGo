import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y condiciones · parygo',
  description: 'Términos y condiciones de uso de la plataforma ParyGo.',
};

export default function TerminosPage() {
  return (
    <article>
      <h1>Términos y condiciones</h1>
      <p className="legal-updated">Última actualización: junio 2026 · versión base</p>

      <p>
        ParyGo es una <strong>plataforma tecnológica</strong> que permite a organizadores de eventos
        (cada uno, un &quot;organizador&quot;) vender entradas con su propia marca y cobrar de forma
        directa. Al usar ParyGo aceptás estos términos.
      </p>

      <h2>1. Qué es ParyGo y qué no es</h2>
      <ul>
        <li>ParyGo provee la tecnología: página de venta, emisión de entradas con QR, validación en puerta y panel de gestión.</li>
        <li><strong>El organizador es el vendedor</strong> del evento y de las entradas. El contrato de la entrada es entre el comprador y el organizador.</li>
        <li><strong>ParyGo no toca el dinero de las entradas:</strong> los pagos van directo a la cuenta del organizador (Yape y/o MercadoPago). ParyGo le cobra al organizador un precio por evento (packs), no una comisión sobre las ventas.</li>
      </ul>

      <h2>2. Compra de entradas</h2>
      <ul>
        <li>Cada entrada se entrega como un código QR único, válido para un ingreso (salvo que el evento indique lo contrario).</li>
        <li>El comprador recibe su QR por email y puede consultarlo con el enlace permanente de su pedido. Si lo perdés, podés pedir el reenvío al mismo email de compra.</li>
        <li>Los precios, fechas, lugar, capacidad y condiciones del evento los define el organizador y pueden cambiar (por ejemplo, una postergación). Si un evento se posterga, tu entrada sigue siendo válida para la nueva fecha.</li>
      </ul>

      <h2>3. Pagos, cambios y devoluciones</h2>
      <ul>
        <li>Los pagos por Yape se confirman cuando el organizador valida tu comprobante; con tarjeta (MercadoPago) la confirmación es automática.</li>
        <li><strong>Las devoluciones, cambios y cancelaciones las gestiona el organizador</strong> según su propia política, ya que es quien recibe el pago. ParyGo puede ayudar con el soporte técnico pero no procesa reembolsos.</li>
      </ul>

      <h2>4. Ingreso al evento</h2>
      <ul>
        <li>Para ingresar tenés que presentar tu QR. El organizador puede pedir un documento de identidad si el evento lo requiere.</li>
        <li>Una entrada ya escaneada o anulada no permite el ingreso. El organizador es responsable del control de acceso y del aforo.</li>
      </ul>

      <h2>5. Uso correcto</h2>
      <ul>
        <li>No está permitido revender entradas de forma fraudulenta, duplicar QR, ni interferir con el funcionamiento de la plataforma.</li>
        <li>El organizador es responsable de que su evento y su contenido cumplan la ley aplicable.</li>
      </ul>

      <h2>6. Responsabilidad</h2>
      <p>
        ParyGo provee la plataforma &quot;tal cual&quot;, con el mayor esfuerzo de disponibilidad. La
        realización, calidad y cumplimiento del evento son responsabilidad exclusiva del organizador.
      </p>

      <h2>7. Contacto</h2>
      <p>
        Dudas sobre tu compra: escribí al organizador (su WhatsApp aparece en la página del evento).
        Dudas sobre la plataforma: contactá a ParyGo por los canales publicados.
      </p>

      <div className="legal-note">
        Este es un texto base de la plataforma. Las condiciones específicas de cada evento (precios,
        devoluciones, edad mínima, etc.) las define cada organizador en su página.
      </div>
    </article>
  );
}
