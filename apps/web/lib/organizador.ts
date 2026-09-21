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

// Forma de email que aceptamos para ARMAR un href. No pretende validar que el
// email exista: pretende que lo que se concatena en un `href` no pueda romper
// el atributo ni convertirse en otro esquema. El formulario del panel ya valida
// con zod al guardar, pero acá no confiamos en eso: el día que un import, un
// UPDATE a mano o un formulario nuevo escriba esa columna sin pasar por el
// mismo schema, esto sigue de pie. Es la misma lección de M1 — no confiar en
// que el otro llamador validó — aplicada a HTML en vez de SQL.
const EMAIL_SEGURO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

/** WhatsApp si la marca lo cargó; si no, su email; si no hay ninguno, null. */
export function contactoHref(marca: MarcaContacto, texto?: string): string | null {
  // Solo dígitos: whatsapp_e164 nunca aporta caracteres al href.
  const wa = marca.whatsapp_e164?.replace(/[^\d]/g, '');
  if (wa) return texto ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : `https://wa.me/${wa}`;
  const mail = marca.contact_email?.trim();
  if (mail && EMAIL_SEGURO.test(mail)) return `mailto:${encodeURI(mail)}`;
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
