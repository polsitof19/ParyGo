# Confirmación "¡listo!" con QR inline — Plan de implementación (Parte 2, paso 1)

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar task por task. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que la pantalla de confirmación exitosa muestre el QR grande y centrado como primer elemento, con la instrucción "Mostrá este QR en la puerta.", y que todo lo secundario baje de jerarquía — sin tocar la emisión, los estados ni la lógica de las 5 ramas.

**Architecture:** Cambio de **presentación pura** en un único Server Component (`confirmacion/page.tsx`), reutilizando `generateQrSvg()` (edge-safe, ya usado por `/t`). El `qr_code` del primer ticket ya está en el payload actual de la página (se usa hoy en el link permanente, `ticketUrl` y el link de WhatsApp), así que renderizar su SVG **no añade exposición de datos**. Multi-entrada enlaza a `/pedido/{orderId}` (que ya muestra todos los QR). Además, unificación de registro a **voseo** (copy-only) en confirmación + reenviar.

**Tech Stack:** Next.js 14 App Router (Edge runtime) · React Server Components · `qrcode` (SVG server-side) · Playwright (E2E desktop + mobile) · Supabase service-role (lectura ya existente).

## Global Constraints

- **Solo presentación.** Cero cambios en emisión de tickets, en estados/`status`, o en las condiciones de las 5 ramas de confirmación (`isFailed` / `isPending` / `isYapeReview` / `isYapeRejected` / éxito). Solo se reordena y reescribe la rama de éxito y se ajusta copy.
- **`hoesky` es una MARCA de prueba del multi-tenant (`hoesky.parygo.com`), NO una rama.** "Trabajar en hoesky" = verificar los cambios contra las páginas públicas/flujo de esa marca. No existe ni debe existir una rama git llamada `hoesky`.
- **Branch de trabajo: `mejoras/confirmacion-qr`, creada desde `feat/brand-landing-redesign`** (única rama que contiene el checkout v3 / `c-checkout-canvas` que este plan edita; `refactor/monorepo` aún no tiene v3). NUNCA desde `main`. NUNCA merge ni push a `main`. No mergear a prod sin OK explícito de Paul.
- **No tocar** `code`/`Almighty` salvo lectura. Probar en `demotest`/`hoesky` si se requiere data real.
- **Registro:** voseo en todas las superficies de comprador tocadas.
- **Instrucción canónica junto al QR:** exactamente `Mostrá este QR en la puerta.` (6 palabras).
- **Sin em dashes** en copy nuevo.
- **Gates obligatorios antes de merge:** `security-reviewer` (post-pago) + `code-reviewer` + Playwright desktop y mobile (incluida rama multi-entrada) + capturas. Ninguno se salta.
- **Archivos permitidos a modificar:** `confirmacion/page.tsx`, `reenviar/page.tsx`, `reenviar/ResendForm.tsx`, y nuevos tests. Nada más.

---

## File Structure

- **Modify** `apps/web/app/b/[brand]/[event]/confirmacion/page.tsx` — reordenar SOLO la rama de éxito (líneas ~138-231): añadir import + render del QR hero, demoter lo secundario, voseo en copy de todas las ramas. Ramas A-D: solo copy (voseo), sin tocar condiciones.
- **Modify** `apps/web/app/b/[brand]/reenviar/page.tsx` — copy a voseo (2 strings).
- **Modify** `apps/web/app/b/[brand]/reenviar/ResendForm.tsx` — copy a voseo (2 strings).
- **Create** `apps/web/tests/e2e/confirmacion-qr.spec.ts` — Playwright: QR visible como primer bloque, instrucción presente, single vs multi, desktop + mobile. (Ruta/patrón: ajustar al setup Playwright existente del repo; ver Task 3 paso 1.)
- **Reuse (no modificar):** `apps/web/lib/qr.ts` (`generateQrSvg`), `apps/web/app/b/[brand]/DownloadQrButton.tsx`, `apps/web/app/b/[brand]/pedido/[orderId]/page.tsx`.

---

### Task 1: QR hero en la rama de éxito (single + multi) + democión de lo secundario

**Files:**
- Modify: `apps/web/app/b/[brand]/[event]/confirmacion/page.tsx` (import línea 3-7; bloque de retorno de éxito líneas 153-231)

**Interfaces:**
- Consumes: `generateQrSvg(payload: string): Promise<string>` de `@/lib/qr` (devuelve string SVG, edge-safe). `DownloadQrButton({ qrCode, fileName, block? })` de `../../DownloadQrButton`.
- Produces: markup de la rama de éxito con el QR del `firstTicket.qr_code` como primer bloque tras el encabezado; link a `/pedido/${order.id}` cuando `tickets.length > 1`.

- [ ] **Step 1: Añadir imports**

En el bloque de imports (arriba del archivo), añadir:

```tsx
import { generateQrSvg } from '@/lib/qr';
import { DownloadQrButton } from '../../DownloadQrButton';
```

(`ArrowRight`, `MapPin`, `Check`, `Mail`, `Ticket as TicketIcon`, `ExternalLink`, `Link`, `AddToCalendar` ya están importados. `DownloadQrButton` está en `apps/web/app/b/[brand]/DownloadQrButton.tsx`; desde `confirmacion/` la ruta relativa es `../../DownloadQrButton`, idéntica a la que usa `/t`.)

- [ ] **Step 2: Generar el SVG del QR antes del `return` de éxito**

Justo después de `const ticketUrl = firstTicket ? ...` (línea ~141) y antes de `const mapsHref = ...`, añadir:

```tsx
  // QR inline: reusa el mismo generador que /t. El payload es el qr_code, que ya
  // está en el payload de esta página (link permanente, ticketUrl, WhatsApp) →
  // no expone datos nuevos. Mismo control de acceso que arriba (brand.slug === params.brand).
  const qrSvg = firstTicket ? await generateQrSvg(firstTicket.qr_code) : null;
  const isMulti = tickets.length > 1;
```

- [ ] **Step 3: Reemplazar el JSX de la rama de éxito**

Reemplazar el bloque `return ( ... )` de éxito (líneas 153-231, desde `<main className="c-narrow c-checkout-canvas"` hasta su `</main>`) por:

```tsx
  return (
    <main className="c-narrow c-checkout-canvas" style={{ paddingTop: 40, paddingBottom: 56 }}>
      <div className="c-confirm">
        <div className="c-confirm__badge"><Check className="h-9 w-9" /></div>
        <span className="c-eyebrow" style={{ color: 'var(--ok)' }}>¡Compra confirmada!</span>
        <h1>¡Tu entrada está lista!</h1>
        <p className="c-muted">{event?.name}{event?.starts_at ? ` · ${formatEventDate(event.starts_at)}` : ''}</p>
      </div>

      {/* HERO: el QR es lo único importante en esta pantalla. */}
      {firstTicket && qrSvg && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 26 }}>
          {isMulti && (
            <span className="c-eyebrow" style={{ color: 'var(--ink-2)' }}>
              Entrada 1 de {tickets.length} · {firstTicket.ticket_type_name}
            </span>
          )}
          <div className="c-qr" role="img" aria-label="QR de tu entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p style={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }}>Mostrá este QR en la puerta.</p>
          {isMulti ? (
            <Link href={`/pedido/${order.id}`} className="c-btn c-btn--brand">
              Ver mis {tickets.length} entradas <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <DownloadQrButton qrCode={firstTicket.qr_code} fileName={firstTicket.ticket_number} />
          )}
        </div>
      )}

      {/* ----- Secundario, más quieto, debajo del QR ----- */}

      {/* Antes de ir: calendario + cómo llegar + qué llevar */}
      <div className="c-card" style={{ marginTop: 26 }}>
        <p className="c-card__title">Antes de ir</p>
        {event?.starts_at && (
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <AddToCalendar
              title={event.name}
              startIso={event.starts_at}
              endIso={event.ends_at}
              location={[event.venue_name, event.venue_address].filter(Boolean).join(', ') || null}
              details={calDetails}
              uid={order.id}
            />
          </div>
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--brand-ink)', fontSize: 14 }}>
            <MapPin className="h-4 w-4" /> Cómo llegar{event?.venue_name ? ` · ${event.venue_name}` : ''} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)' }}>
            <TicketIcon className="h-4 w-4" style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-ink)' }} />
            También tenés tu QR en el email y en tu link permanente.
          </li>
          {event?.require_dni && (
            <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)' }}>
              <Check className="h-4 w-4" style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-ink)' }} />
              Llevá tu documento de identidad (te lo pueden pedir en la puerta).
            </li>
          )}
        </ul>
      </div>

      {/* Resumen del pedido */}
      <div className="c-card" style={{ marginTop: 16 }}>
        <p className="c-card__title">Resumen</p>
        <Row label="Comprador">{order.buyer_name}</Row>
        <Row label="Total">{formatPEN(order.total_cents)}</Row>
        <Row label="Entradas">
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tickets.map((t) => <li key={t.id} style={{ fontSize: 13.5 }}>{t.ticket_number} · {t.ticket_type_name}</li>)}
          </ul>
        </Row>
      </div>

      {/* Link permanente + compartir: acciones de respaldo, jerarquía baja */}
      {ticketUrl && (
        <div style={{ marginTop: 16 }}>
          <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginBottom: 10 }}>Tu link permanente (guardalo en favoritos)</p>
          <div className="c-linkpill">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>parygo.com/t/{firstTicket!.qr_code.slice(0, 8)}…</span>
            <Link href={ticketUrl} className="c-btn c-btn--soft" style={{ height: 40, padding: '0 16px' }}>Abrir <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {firstTicket && brand?.whatsapp_e164 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <a href={whatsappLink(brand.whatsapp_e164.replace(/[^\d]/g, ''), `Hola, te paso mi entrada para ${event?.name}: https://${brand.slug}.parygo.com/t/${firstTicket.qr_code}`)} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--soft">
                📲 Enviarme a WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 18 }}>
        También te enviamos el QR por email. Si no llega en 5 min, revisá spam o usá el link permanente.{' '}
        <Link href="/reenviar" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>¿No lo encontrás? Reenviar a mi email</Link>
      </p>
    </main>
  );
```

Notas: (a) desaparece el botón redundante "Ver mi QR" (el QR ya está en pantalla); (b) el link permanente pasa de CTA brand a acción soft ("Abrir"); (c) la instrucción de la lista se reescribe porque el QR ya no está "solo en el email"; (d) el badge de éxito, el h1 y el resumen se conservan; solo cambia el orden y el peso visual.

- [ ] **Step 4: Verificar tipado y build local**

Run: `cd apps/web && npm run typecheck` (o `npx tsc --noEmit` según el repo)
Expected: PASS, sin errores nuevos. En particular, `order.id` existe en `OrderWithJoins` y `tickets`/`firstTicket` ya están tipados.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/b/[brand]/[event]/confirmacion/page.tsx
git commit -m "confirmación: QR inline como hero + democión de lo secundario (solo presentación)"
```

---

### Task 2: Unificar registro a voseo (copy-only) en confirmación + reenviar

**Files:**
- Modify: `apps/web/app/b/[brand]/[event]/confirmacion/page.tsx` (ramas A-D, copy)
- Modify: `apps/web/app/b/[brand]/reenviar/page.tsx` (h1 + descripción + WhatsApp)
- Modify: `apps/web/app/b/[brand]/reenviar/ResendForm.tsx` (help)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: mismos nodos, solo texto. **No se tocan condiciones ni props.**

- [ ] **Step 1: Voseo en las ramas de estado de la confirmación (solo texto)**

Aplicar estos reemplazos exactos en `confirmacion/page.tsx` (no cambiar ninguna condición `if`):

| Antes (tuteo) | Después (voseo) |
|---|---|
| `Puedes intentar de nuevo con otro método o tarjeta.` | `Podés intentar de nuevo con otro método o tarjeta.` |
| `¿Necesitas ayuda? WhatsApp soporte` | `¿Necesitás ayuda? WhatsApp soporte` |
| `...sin novedad, escríbenos por WhatsApp.` | `...sin novedad, escribinos por WhatsApp.` |
| `Si crees que es un error, escribe al organizador con tu comprobante a mano.` | `Si creés que es un error, escribí al organizador con tu comprobante a mano.` |

(La rama C "Yape en revisión" ya está en voseo/nosotros: "Te avisamos…" — no cambia.)

- [ ] **Step 2: Voseo en `reenviar/page.tsx`**

```tsx
// h1:
<h1 className="c-h1" style={{ fontSize: 28, marginTop: 8 }}>Reenviá tu entrada</h1>
// descripción:
Poné el email con el que compraste en {brand.name} y te reenviamos tus QR al instante.
// WhatsApp:
¿Seguís sin recibirla?{' '}
...>Escribinos por WhatsApp</a>
```

- [ ] **Step 3: Voseo en `reenviar/ResendForm.tsx`**

```tsx
<p className="c-help">Usá el mismo email con el que compraste. Te reenviamos tus QR ahí.</p>
```

(El mensaje neutro de `actions.ts` ya está en voseo: "Revisá tu correo…", "Ingresá un email válido." — no se toca.)

- [ ] **Step 4: Verificar build**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/b/[brand]/[event]/confirmacion/page.tsx apps/web/app/b/[brand]/reenviar/page.tsx apps/web/app/b/[brand]/reenviar/ResendForm.tsx
git commit -m "comprador: unificar registro a voseo en confirmación + reenviar (copy-only)"
```

---

### Task 3: Pruebas Playwright (desktop + mobile, single + multi) + capturas

**Files:**
- Create: `apps/web/tests/e2e/confirmacion-qr.spec.ts` (ajustar carpeta al setup Playwright existente)

**Interfaces:**
- Consumes: la página de confirmación exitosa renderizada con `?order=<uuid pagado>`.
- Produces: evidencia de que el QR es el primer bloque tras el encabezado, la instrucción existe, y el comportamiento single/multi es correcto en ambos viewports.

- [ ] **Step 1: Localizar el setup Playwright del repo**

Run: `ls apps/web/playwright.config.* ; ls apps/web/tests 2>/dev/null ; ls apps/web/e2e 2>/dev/null`
Expected: hallar el config y la convención de carpeta/fixtures. Si no existe Playwright configurado, detener y reportar a Paul antes de introducir tooling nuevo (fuera de "solo presentación"). Preparar data de una orden PAGADA de **demotest** (single y multi-entrada) para los `?order=`.

- [ ] **Step 2: Escribir el spec (falla primero si el orden es el viejo)**

```ts
import { test, expect, devices } from '@playwright/test';

// URLs de confirmación de órdenes PAGADAS de DEMOTEST (rellenar con uuids reales):
const SINGLE = process.env.CONF_SINGLE_URL!; // .../confirmacion?order=<uuid 1 entrada>
const MULTI  = process.env.CONF_MULTI_URL!;  // .../confirmacion?order=<uuid N entradas>

for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', devices['iPhone 13'].viewport]] as const) {
  test.describe(name, () => {
    test('QR es el primer bloque y trae la instrucción (single)', async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(SINGLE);
      const qr = page.getByRole('img', { name: 'QR de tu entrada' });
      await expect(qr).toBeVisible();
      await expect(page.getByText('Mostrá este QR en la puerta.')).toBeVisible();
      // El QR aparece por encima del Resumen (jerarquía correcta).
      const qrBox = await qr.boundingBox();
      const resumen = page.getByText('Resumen', { exact: true });
      const resBox = await resumen.boundingBox();
      expect(qrBox!.y).toBeLessThan(resBox!.y);
      // Single: hay botón de descarga, no el link "Ver mis N entradas".
      await expect(page.getByRole('button', { name: /Descargar QR/ })).toBeVisible();
      await expect(page.getByText(/Ver mis \d+ entradas/)).toHaveCount(0);
      await page.screenshot({ path: `test-results/confirmacion-single-${name}.png`, fullPage: true });
    });

    test('multi-entrada: primer QR + "Ver mis N entradas"', async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(MULTI);
      await expect(page.getByRole('img', { name: 'QR de tu entrada' })).toBeVisible();
      await expect(page.getByText(/Entrada 1 de \d+/)).toBeVisible();
      await expect(page.getByRole('link', { name: /Ver mis \d+ entradas/ })).toBeVisible();
      await page.screenshot({ path: `test-results/confirmacion-multi-${name}.png`, fullPage: true });
    });
  });
}
```

- [ ] **Step 3: Correr las pruebas**

Run: `cd apps/web && CONF_SINGLE_URL="…" CONF_MULTI_URL="…" npx playwright test confirmacion-qr`
Expected: 4 tests PASS (single/multi × desktop/mobile). Guardar los 4 screenshots de `test-results/`.

- [ ] **Step 4: Verificar que las ramas A-D siguen intactas (smoke manual o test extra)**

Cargar una confirmación en estado `pending_yape_review` de demotest y confirmar que muestra "Comprobante en revisión" y NO renderiza QR. Esto prueba que solo cambió la rama de éxito.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/confirmacion-qr.spec.ts
git commit -m "test(e2e): confirmación con QR hero — single/multi, desktop/mobile"
```

---

### Task 4: Gates de revisión + capturas + OK de Paul (bloqueante antes de merge)

**Files:** ninguno (revisión).

- [ ] **Step 1: `security-reviewer`** sobre el diff de `confirmacion/page.tsx`. Foco explícito: **el QR inline NO expone tickets de otros**. Verificar que:
  - El `qr_code` renderizado proviene de `order.tickets[0]` de la MISMA orden ya cargada, y que el gate `order.brand?.slug === params.brand` (líneas 47-50) sigue intacto.
  - No se agregó ninguna lectura nueva a Supabase; el QR se deriva de datos ya presentes (mismo modelo de acceso que `/t/[uuid]`, que también expone el QR por `qr_code`).
  - El SVG va por `dangerouslySetInnerHTML` pero su fuente es `generateQrSvg()` (salida controlada de la lib `qrcode`, no input de usuario) — igual que en `/t`.
- [ ] **Step 2: `code-reviewer`** sobre los 3 archivos tocados (calidad, JSX, accesibilidad del `role="img"`/`aria-label`, que no quedó copy en tuteo).
- [ ] **Step 3: Adjuntar las 4 capturas** (single/multi × desktop/mobile) al PR/hilo para Paul.
- [ ] **Step 4: Esperar OK explícito de Paul.** No mergear a prod sin él. Merge/push objetivo: branch `hoesky` (nunca `main`).

---

## Self-Review (contra el spec de Paul)

1. **Cobertura del spec:**
   - QR inline grande arriba (render del SVG de `/t`) → Task 1 ✓
   - Instrucción "Mostrá este QR en la puerta." → Task 1 ✓
   - Evento·fecha en una línea → Task 1 (se conserva el `<p className="c-muted">` de una línea) ✓
   - Todo lo demás baja a bloque secundario → Task 1 (orden: QR → Antes de ir → Resumen → link permanente/WhatsApp → reenviar) ✓
   - Multi-entrada: primer QR + "Ver mis N entradas →" → Task 1 (link a `/pedido/{orderId}`) ✓
   - Voseo en confirmación + reenviar → Task 2 ✓
   - Email: NO se embebe QR ahora; investigación separada → ver `MEMO-email-qr-deliverability` (no es task de este plan) ✓
   - Solo presentación, ramas intactas → Global Constraints + Task 3 Step 4 ✓
   - security-reviewer + code-reviewer + Playwright desktop/mobile/multi + capturas + no merge sin OK → Task 4 ✓

2. **Placeholders:** ninguno; todo el JSX/copy va literal. (Único punto abierto legítimo: la ruta/carpeta exacta de Playwright, que Task 3 Step 1 manda verificar en el repo antes de escribir.)

3. **Consistencia de tipos:** `generateQrSvg(string): Promise<string>`, `DownloadQrButton({qrCode, fileName})`, `order.id`/`tickets`/`firstTicket` — todos coinciden con las firmas reales leídas en `lib/qr.ts`, `DownloadQrButton.tsx` y el tipo `OrderWithJoins`.

## Fuera de alcance de este plan (siguiente decisión de Paul)

- **QR en el email** (`sendTicketEmail.ts`): decisión pendiente. Ver memo de deliverability adjunto. La confirmación web (este plan) va primero y no depende de esa decisión.
- **Parte 1 (panel del organizador):** reorganización de las 8 pestañas en 4 grupos, etc. Plan aparte cuando Paul lo pida.
