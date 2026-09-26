# Memo de decisión — ¿Embeber el QR en el email de entrega?

> **Estado: investigación, no implementación.** Paul decide con esto. La confirmación web (QR inline) va primero y NO depende de esta decisión.
>
> Hoy `sendTicketEmail.ts` NO incluye el QR: solo un botón "Ver mi entrada con QR →" a `/pedido/{orderId}`. Envío vía Resend. El objetivo evaluado: que el comprador vea el QR sin un clic extra en la puerta.

## Las 3 opciones

| Opción | Cómo | Render en Gmail (dominante en PE) | Con "imágenes off" | Peso email / spam | Trabajo |
|---|---|---|---|---|---|
| **A. base64 data URI** (`<img src="data:image/png;base64,…">`) | Generar PNG con `generateQrDataUrl()` (ya existe) e incrustarlo inline | ❌ **Gmail lo bloquea/strippea**: no renderiza | ❌ | Bajo | Bajo |
| **B. CID inline** (`<img src="cid:qr">` + `attachments[].content_id`) | Adjuntar el PNG con `content_id` (Resend lo soporta desde ago-2025) | ✅ Sí (embebido) | ✅ **Se ve aunque estén off** (viaja en el email) | Medio (adjunto ~5-15 KB) · leve ↑ spam | Medio. **Ojo:** no funciona en el endpoint **batch** de Resend |
| **C. Imagen hosteada** (`<img src="https://…/qr/{code}.png">`) | Nuevo endpoint edge que renderiza el PNG del QR; el email lo referencia | ✅ **Mejor render cross-cliente**; Gmail/Apple Mail cargan imágenes por defecto (Gmail vía su proxy/caché) | ❌ Si el cliente no carga remotas, no se ve | Bajo · estándar | Medio-alto (endpoint nuevo + caché) |

## Lecturas clave

- **base64 (A) está descartado:** Gmail web bloquea y elimina las imágenes base64 por política de seguridad; es un comportamiento consistente en 2025. Como el grueso de compradores usa Gmail, el QR simplemente no aparecería. No vale la pena.
- **CID (B)** es la única que **muestra el QR aunque el cliente tenga las imágenes remotas desactivadas**, porque el PNG viaja dentro del email. Contras: suma un adjunto (peso + leve impacto en spam score), algunos clientes viejos pueden listarlo como adjunto, y **Resend no permite adjuntos en su endpoint batch** (hay que verificar si el envío de tickets usa batch).
- **Hosteada (C)** da el **mejor render cross-cliente** cuando las imágenes se cargan, y Gmail/Apple Mail las cargan por defecto (Gmail las sirve por su proxy y las cachea, lo cual para un QR es inofensivo). Contra: los usuarios con "no cargar imágenes" no lo ven, y hay que construir/mantener un endpoint público del QR (aunque el `qr_code` ya es públicamente accesible vía `/t/{code}`, así que no agrega exposición).

## Recomendación

**Opción B (CID inline), condicionada a una verificación.** Razón: el email de entrega existe para un momento crítico (la puerta, posible mala señal, posible "imágenes off"). B es la única que garantiza el QR visible **sin conexión y sin cargar imágenes remotas**, que es justo el peor caso. Es el estándar de los sistemas de ticketing serios.

- **Verificación previa (✅ RESUELTA):** `sendTicketEmail.ts` usa `https://api.resend.com/emails` (endpoint **individual**, no `/emails/batch`). Por lo tanto **CID inline es viable** — la condición bloqueante no aplica. (Confirmado por lectura el 2026-07-06.)
- **Detalle de implementación cuando se apruebe:** `content_id` + `content_type: 'image/png'` + `filename: 'qr.png'` (ayuda al render), PNG desde `generateQrDataUrl()` decodificado a bytes. Poner el QR **arriba** del email con la línea **"Mostrá este QR en la puerta."** y degradar el botón "Ver mi entrada" a secundario.
- **Solo el email de compra al propio comprador.** El email de **transferencia** seguía omitiendo el QR a propósito (privacidad hacia el dueño anterior); esa decisión no cambia.

**Plan B si B no es viable (batch):** Opción C con el QR arriba + mantener el botón como fallback para "imágenes off".

**Descartada:** Opción A (base64).

## Fuentes

- [Gmail Blocks Base64 Images (Digital Malayali)](https://en.digitalmalayali.in/gmail-blocks-base64-images-convert-to-blob-for-inline-email/)
- [Base64 Encoded Image Not Showing in Gmail (w3tutorials)](https://www.w3tutorials.net/blog/base64-encoded-image-is-not-showing-in-gmail/)
- [Gmail Ignores Base-64 Encoded Images (Gmail Community)](https://support.google.com/mail/thread/311153193/gmail-ignores-base-64-encoded-images?hl=en)
- [Embed Images using CID (Resend changelog)](https://resend.com/changelog/embed-images-using-cid)
- [Embed Inline Images (Resend docs)](https://resend.com/docs/dashboard/emails/embed-inline-images)
