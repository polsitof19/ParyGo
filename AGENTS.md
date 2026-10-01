# AGENTS.md — Bloque "Crear evento como asistente" (panel nuevo, parte 1)

Plan de trabajo (2026-10-01). Reglas del repo: CLAUDE.md (manda). Rama: `panel/crear-evento`. El bloque anterior (Cuentas) quedó en `docs/bloque-cuentas.md`.

## Por qué
Paul: "cuando le dé a crear evento, que haga preguntas: cómo se llama su evento y que aparezca cómo sería el link, cuándo empieza y cuándo termina con hora, luego la ubicación, luego tipos de entradas, y eso que sea opcional para que pueda ver todo. Se vería mucho más profesional y fácil."
Maquetas de referencia: `tmp/maquetas-panel/v2/salida/4-crear-evento-*.png` y `video-1/2-*.mp4` (vista previa en vivo a la derecha en PC).

## Flujo (una pregunta por pantalla, como /empezar)
1. **¿Cómo se llama tu evento?** → debajo, el link REAL `<slug-marca>.parygo.com/<slug-evento>` armándose en vivo, con ✓ libre / ✕ ocupado (chequeo con debounce 450 ms) y "Cambiar link" para editarlo.
2. **¿Cuándo es?** → empieza (fecha + hora) y termina (fecha + hora). Termina por defecto = empieza + 6 h; termina > empieza. Hora de Lima (como hoy).
3. **¿Dónde es?** → nombre del lugar + dirección; opcional "Link de Google Maps" (https).
4. **Entradas (opcional)** → agregar tipos rápido: nombre, precio o "Gratis", cuántas hay. "Preventa: ¿el precio sube en alguna fecha?" plegado (fases). Botón **"Saltar por ahora"**: se crea sin entradas y se agregan después en Entradas. En prueba: contador "Vas X de 10" y sin "Sin límite"; en evento privado: tope 200.
5. **Flyer (opcional)** → subir imagen (mismo aviso de captura de pantalla de hoy); "Saltar por ahora".
6. **Revisa tu evento** → cada dato con "Editar" (salta al paso) + "Crear evento". Debajo: "Usa 1 de tu saldo (te quedan N)" o "Es tu evento de prueba".

- Barra "Atrás · Paso N de 6" + progreso, como /empezar. Enter = Continuar. Botón principal fijo abajo en <960 px (regla de CLAUDE.md).
- **PC (≥1280):** columna del asistente a la izquierda y a la derecha una **vista previa en vivo** de la página de compra (teléfono con la barra de Safari y el link): nombre, fecha, lugar, flyer y las entradas a medida que se agregan. Reusar el CSS de las maquetas v2 (`tmp/maquetas-panel/v2/css/previews.css`) llevándolo a `apps/web/app/admin/admin.css` con tokens; nada de tamaños sueltos.
- Estilo: el del PANEL (tema noche/claro según el teléfono, Geist, `s-*`, un solo primario por pantalla, sin mayúsculas espaciadas). Textos con `t('es','en')` (panel en inglés, 0073).
- Se borra `EventBuilder.tsx` (reemplazado por `EventWizard.tsx`).

## Servidor
- **0082_evento_sin_entradas.sql**: `create or replace function public.create_brand_event` igual a 0013 pero SIN el `raise NO_TICKET_TYPES` (acepta `[]`); `jsonb_array_length` del log sigue andando con `[]`. La prueba (0069) la envuelve: hereda. Revokes de siempre. Ensayo con dryrun.
- `actions.ts`: `ticket_types` `.min(0)`; además acepta `venue_maps_url` (https, validado como en `edit-actions.ts:47`) y lo guarda con un update aparte (como `is_free`). Nueva server action `eventoSlugLibre(slug)` → acotada a la marca de la sesión (`contextoEscritura`), consulta `events` por `(brand_id, slug)`.
- Publicar sin entradas sigue bloqueado (`setEventPublishedAction` exige un tipo activo): el detalle del evento ya muestra el aviso.

## Tareas
- [ ] 1. 0082: dryrun → aplicar → verificar que `create_brand_event` con `[]` crea el evento y descuenta 1 de saldo (demotest, con service role, y revertir/limpiar). **Listo:** e2e/prueba-0069 y privado-0075 en verde.
- [ ] 2. `actions.ts` (min 0, maps, `eventoSlugLibre`). **Listo:** tsc limpio.
- [ ] 3. `EventWizard.tsx` + CSS en admin.css + `page.tsx` (pasar slug de la marca, saldo, si es prueba/privado y el tope). **Listo:** capturas 390 y 1440 de los 6 pasos sin desbordes; en PC la vista previa cambia en vivo.
- [ ] 4. E2E: reescribir `fillBuilder` de `e2e/fase1.mjs` fase B para el asistente (la fase B reenvía la POST de la server action con `ticket_types_json` alterado: mantener el nombre del oculto `ticket_types_json` y `confirm_free` para no romper eso) + caso nuevo "crear sin entradas → evento creado, no se puede publicar". **Listo:** fase1 182+/182+, panel-en, prueba-0069, privado-0075.
- [ ] 5. Revisión (security-reviewer liviano: solo toca saldo vía la RPC existente) + capturas a Paul. Merge con su OK.

## Fuera de alcance (siguientes partes del panel nuevo)
"Primeros pasos" en la portada, "Pon tu método de pago" y bloqueo de publicar sin método, Mi marca con el cobro primero, textos simples en Entradas, editor de preventas después de crear.

## Bloqueos
(anotar acá)
