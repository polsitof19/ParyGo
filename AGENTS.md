# AGENTS.md — Panel nuevo, parte 2: Primeros pasos, método de pago y Mi marca

Plan (2026-10-01). Reglas: CLAUDE.md. Rama: `panel/primeros-pasos`. Bloques anteriores en `docs/`.
Maquetas: `tmp/maquetas-panel/v2/salida/1-eventos-*`, `2-mi-marca-*`, `3-evento-*` (y videos).
Auditoría UX de referencia (puntos A1–A17): la del agente ui-ux-designer del 2026-10-01, resumida abajo.

## Decisiones de Paul
- Textos genéricos: **"método de pago" / "cómo te pagan"**, nunca "Pon tu Yape" (ParyGo es internacional; Yape es UNA opción, solo Perú).
- **El método de pago solo se exige si el evento COBRA**: evento gratis, o solo entradas gratis/cortesías → se publica sin método. Al menos una entrada paga (precio > 0, no cortesía, evento no gratis) → hay que tener método antes de publicar.
- Hoy el único método que cobra es el Yape del organizador (`brands.yape_number`); Mercado Pago por marca está diferido y NO cuenta como método hasta que exista "Conectar Mercado Pago".

## Tareas
- [ ] 1. **Bloqueo de publicar sin método** (`app/admin/events/[id]/edit-actions.ts` `setEventPublishedAction`): si el evento cobra (regla de arriba; reusar la lógica de `lib/publicTicketGuard.ts` si sirve) y la marca no tiene `yape_number` → `{ ok:false, code:'falta_metodo', message: t('Antes de publicar, elige cómo te pagan en Mi marca.', 'Before publishing, choose how you get paid in My brand.') }`. `events/[id]/page.tsx` + `PublishControl.tsx`: aviso "Antes de publicar, elige cómo te pagan" con ÚNICO primario "Elegir método de pago" → `/admin/settings#cobro`; "Publicar evento" deshabilitado con el motivo. Si ya está publicado y cobra y se quedó sin método: `.s-due` "Tu evento no puede cobrar: falta tu método de pago". **Listo:** E2E: evento pago sin método no se publica; gratis sí; pago con método sí. Security review (toca publicación).
- [ ] 2. **Primeros pasos** (rehacer `app/admin/SetupChecklist.tsx` + `app/admin/page.tsx` + `admin.css`, maqueta 1-eventos): pasos que se tildan solos desde los datos (sin flag en la base):
  1 Crea tu evento → `/admin/events/new` · 2 Agrega tus entradas → `/admin/events/{id}/entradas` (arregla el link viejo a /editar#entradas) · 3 **solo si alguna entrada cobra**: Elige cómo te pagan → `/admin/settings#cobro` · 4 Publícalo y comparte el link → `/admin/events/{id}` · 5 Haz una compra de prueba (sin órdenes → abre la página pública; con comprobante pendiente → `/yape`; con entrada emitida sin escanear → `/scan`; listo cuando hay un escaneo de la marca).
  "Vas N de M", barra de avance, el paso siguiente con el ÚNICO primario (si hay `.s-due` de Yapes por aprobar, ese es el primario y el paso va soft), hechos con punto verde sin tachado ni opacity. En prueba: "Tu prueba gratis: 1 evento, hasta 10 entradas." Desaparece cuando todo está hecho. Las consultas nuevas (count head de órdenes y ticket_scans de la marca) dentro del Promise.all existente. Motion solo en eventos. **Listo:** capturas 390/1440 con marca nueva; Code y Hoesky no lo ven (tienen escaneos).
- [ ] 3. **Mi marca con el cobro primero** (`app/admin/settings/page.tsx`, `SettingsForm.tsx`, maqueta 2-mi-marca): sección "Cómo te pagan" ARRIBA con `id="cobro"` y estado (punto verde "Listo: tus compradores te pagan con Yape a 9xx…" / punto rojo "Falta: sin un método de pago nadie puede pagarte"); dentro, la opción Yape (Perú): número, titular (placeholder "Nombre que figura en tu Yape"), QR; botón "Guardar" visible sin scroll en 390. Las credenciales de Mercado Pago (MpCredentialsForm) se pliegan como "Tarjeta con Mercado Pago (próximamente)" sin prometer que funciona. Contacto, Marca visual, Tema de compra, Avisos, Equipo de puerta e Idioma plegados debajo, cada uno con su valor actual en la segunda línea. **Listo:** /admin/settings#cobro muestra número, QR y Guardar sin scroll largo en 390; fase1 (paso P de Yape) en verde.
- [ ] 4. **Arreglos chicos del primer uso**: no mostrar `LowBalanceNotice` en rojo si la marca está usando su prueba (evento `es_prueba` vigente); "Entradas" con 0 tipos abre "Agregar tipo de entrada" desplegado; textos simples en `EditEventForms.tsx` ("Cuántas hay"/"Sin límite", "Preventa"); `edit-actions.ts:706` "se gestiona por fases (no editable aquí)" → mensaje que diga qué hacer; escáner del organizador sin eventos publicados: "Publica un evento para escanear sus entradas" sin eyebrow "Validador".
- [ ] 5. E2E: fase1 completo + panel-en + caso nuevo del bloqueo de publicar (pago sin método / gratis / con método). Capturas de Primeros pasos y Mi marca. security-reviewer sobre la tarea 1. Codex review. Merge con OK.

## Fuera de alcance
Conectar Mercado Pago (bloque siguiente: arreglar los 4 bugs de MP por marca + OAuth), pago manual genérico por país, PayPal de entradas, cripto, editor de preventas después de crear.

## Bloqueos
