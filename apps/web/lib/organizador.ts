// =============================================================
// Responsabilidad del organizador
// =============================================================
// ParyGo es la plataforma de VENTA. El evento — sus cambios, cancelaciones y
// devoluciones — es del organizador, y eso tiene que estar escrito donde el
// comprador lo pueda leer: antes de pagar, al pagar, en la entrada y en el
// email. Acá viven el contacto y los textos, en un solo lugar, para que la
// frase sea la misma en las cinco superficies (incluido el email, que arma
// HTML a mano y no puede importar un componente de React).
//
// Sin dato de contacto no se inventa un link: se dice igual de quién es el
// evento y se omite el "Contacto →".

export type MarcaContacto = {
  name: string;
  whatsapp_e164?: string | null;
  contact_email?: string | null;
};

/** WhatsApp si la marca lo cargó; si no, su email; si no hay ninguno, null. */
export function contactoHref(marca: MarcaContacto, texto?: string): string | null {
  const wa = marca.whatsapp_e164?.replace(/[^\d]/g, '');
  if (wa) return texto ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : `https://wa.me/${wa}`;
  const mail = marca.contact_email?.trim();
  if (mail) return `mailto:${mail}`;
  return null;
}

/** Página de compra: la línea legal chica del final. */
export function textoLegal(marca: MarcaContacto, minAge: number): string {
  const edad = minAge > 0 ? `+${minAge} · ` : '';
  return `${edad}Cancelaciones y devoluciones las gestiona ${marca.name}`;
}

/** Pantalla de Yape, confirmación y email: a dónde va la plata y a quién escribirle. */
export function textoPago(marca: MarcaContacto): string {
  return `Tu pago va directo a ${marca.name}. Cualquier consulta sobre el evento, escríbele a ${marca.name}`;
}

/** Pie de la entrada con QR. */
export function textoEntrada(marca: MarcaContacto): string {
  return `Evento organizado por ${marca.name}`;
}

/** Pie de la página de marca. */
export function textoPieMarca(marca: MarcaContacto): string {
  return `ParyGo es la plataforma de venta. El evento, sus cambios, cancelaciones y devoluciones son responsabilidad de ${marca.name}.`;
}
