import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de privacidad · parygo',
  description: 'Cómo ParyGo y los organizadores tratan tus datos.',
};

export default function PrivacidadPage() {
  return (
    <article>
      <h1>Política de privacidad</h1>
      <p className="legal-updated">Última actualización: junio 2026 · versión base</p>

      <p>
        En ParyGo cuidamos tus datos y solo pedimos lo necesario para entregarte tu entrada y permitir
        tu ingreso al evento. No hace falta crear una cuenta para comprar.
      </p>

      <h2>1. Qué datos pedimos</h2>
      <ul>
        <li><strong>Para comprar:</strong> tu nombre, email y WhatsApp. Algunos eventos también piden un documento de identidad (DNI/CE) para validar el ingreso en puerta.</li>
        <li><strong>Del pago:</strong> si pagás por Yape, los datos de tu comprobante (número de operación, titular, monto). ParyGo no almacena datos de tu tarjeta — eso lo procesa MercadoPago.</li>
        <li>Datos técnicos mínimos (por ejemplo, la IP) para seguridad y prevención de abuso.</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Emitir y enviarte tu entrada (QR por email) y permitir su consulta y reenvío.</li>
        <li>Validar tu ingreso en la puerta del evento.</li>
        <li>Avisarte de cambios del evento (por ejemplo, una postergación).</li>
        <li>Seguridad: evitar fraude, duplicación de entradas y abuso de los formularios.</li>
      </ul>

      <h2>3. Quién accede a tus datos</h2>
      <ul>
        <li><strong>El organizador del evento</strong> que compraste accede a los datos de tu compra (nombre, contacto, documento si aplica) para gestionar su evento y el control de acceso. Cada organizador ve solo los datos de sus propios eventos.</li>
        <li>Proveedores que hacen funcionar el servicio: envío de emails y procesamiento de pagos con tarjeta. No vendemos tus datos.</li>
      </ul>

      <h2>4. Seguridad</h2>
      <p>
        Las credenciales de cobro de cada organizador se guardan encriptadas. El acceso a los datos
        está restringido por marca: un organizador no puede ver los datos de otro. El documento de
        identidad, cuando se usa, sirve para la validación en puerta y no se muestra en las páginas
        públicas.
      </p>

      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos de tu compra mientras sean necesarios para el evento, el soporte y las
        obligaciones legales del organizador.
      </p>

      <h2>6. Tus derechos y contacto</h2>
      <p>
        Podés pedir acceso, corrección o eliminación de tus datos. Como el organizador es el
        responsable de los datos de su evento, lo más rápido es escribirle a él (su WhatsApp está en la
        página del evento); también podés contactar a ParyGo por los canales publicados.
      </p>

      <div className="legal-note">
        Texto base de la plataforma. Cada organizador es responsable del tratamiento de los datos de
        los compradores de sus eventos.
      </div>
    </article>
  );
}
