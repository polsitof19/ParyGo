# ParyGo — reglas del proyecto (leer siempre)

## Qué es
SaaS multi-tenant de venta de entradas para eventos (Lima/PE). Cada promotor =
un "brand" con subdominio <slug>.parygo.com. Modelo: Paul cobra S/200 flat por
evento (packs); el promotor usa SUS credenciales de pago (Yape/MercadoPago).
Paul nunca toca la plata de las entradas. Compradores NO se loguean.

## Stack
Next.js 14 App Router (Edge) · Supabase (RLS, pg_cron) · Resend (email) ·
MercadoPago + Yape (pagos) · Cloudflare Pages (landing + app) + Worker
(parygo-brand-router para *.parygo.com). Monorepo: apps/landing + apps/web +
supabase/migrations. NO es Firebase. No hay RENIEC. Los compradores no se registran.

## Infra — reglas duras
- Branch de trabajo: refactor/monorepo. NUNCA push a main. main quedó CONGELADA/
  legacy (landing pre-monorepo, commit viejo) — no es fuente de verdad de nada.
- Supabase mdxtpevisjiqpeklhxdv = ÚNICO proyecto = PRODUCCIÓN. Cuidado con DDL.
- SUPABASE_ACCESS_TOKEN vive en apps/web/.env.local (gitignored). Nunca commitearlo,
  nunca imprimirlo, nunca escribirlo a otro archivo.
- LANZAMIENTO DE CODE (2026-09-23): se dejó SOLO "Standly en Cocos" (gratis,
  sáb 26 set) en cero — las 7 órdenes eran pruebas de Paul (quedaron
  'refunded', entradas anuladas, respaldo en tmp/respaldos/); Almighty
  archivado. Script: supabase/limpieza-code-lanzamiento-2026-09-23.mjs.
- Cliente piloto = "Tío Code" (slug code). Su evento "Almighty" TERMINÓ el
  2026-06-21 SIN VENTAS (0 órdenes pagas) y está despublicado. Saldo de eventos
  de Code = 3. Sigue siendo cliente real: NO tocar Code/Almighty en tests.
- La venta real probada en producción es la de "hoesky" (órdenes pagas con
  tickets emitidos, verificado 2026-09-17). Tampoco se toca en tests.
- Brand de pruebas = "demotest" (se deja ARCHIVADA; `node e2e/cleanup.mjs`
  la re-archiva tras el E2E).

## Deploy (Cloudflare Pages) — cómo llega a producción
- Landing (parygo.com): proyecto Pages "parygo" (dominios parygo.pages.dev,
  parygo.com, hoesky.parygo.com). Production branch = refactor/monorepo (cambiado
  el 2026-07-22; antes era main). Push a refactor/monorepo → build + deploy a
  parygo.com. Cualquier OTRA branch → deploy Preview (URL *.pages.dev con hash),
  NO toca producción.
- App (app.parygo.com): proyecto Pages "parygo-app" (dominios parygo-app.pages.dev,
  app.parygo.com). Production branch = refactor/monorepo (VERIFICADO 2026-09-18
  con `wrangler pages project list` + `deployment list`: deploys "Production" de
  refactor/monorepo, p. ej. 465e450 → 64492e55.parygo-app.pages.dev). O sea:
  PUSH A refactor/monorepo = DEPLOY A PRODUCCIÓN DE LA APP (checkout incluido).
  Cualquier otra branch → Preview (<hash>.parygo-app.pages.dev), no toca prod.
  apps/web/wrangler.toml usa name = "parygo-app" (antes decía "parygo-web", un
  proyecto que no existe). Build/root/bindings se configuran en el dashboard.
- Un push a refactor/monorepo despliega LOS DOS proyectos (landing y app).
- La landing NO usa next/font/google (2026-09-26): el build de Cloudflare
  bajaba las fuentes en cada deploy y, cuando Google fallaba ("An error
  occurred in `next/font`"), la landing no se publicaba (2 de 3 deploys) y
  parygo.com quedaba en el commit anterior. Bricolage y Hanken van con
  next/font/local desde apps/landing/app/fonts/ (los mismos woff2 variables
  latin que servía Google; medido: el h1 mide igual, 346×122 a 390). No
  volver a next/font/google. La app usa el paquete `geist` (ya local).
- Router de subdominios *.parygo.com: Worker "parygo-brand-router" (sirve
  <marca>.parygo.com desde la app). Nota: hoesky.parygo.com figura además como
  dominio del proyecto de la landing "parygo", pero hoy sirve la página de la
  marca Hoesky (verificado 2026-09-18); no tocarlo sin revisar el dashboard.
- Verificar deploys sin dashboard: `npx wrangler pages deployment list
  --project-name=parygo-app` (app) o `--project-name=parygo` (landing):
  Production vs Preview, branch, commit, URL. Requiere `npx wrangler login`.
- Alternativa quirúrgica (publicar sin depender de la Git-integration):
  build local (`npm run build:landing` → apps/landing/out) y luego
  `npx wrangler pages deploy apps/landing/out --project-name=parygo --branch=refactor/monorepo`.

## Flujo multi-máquina (PC + laptop)
- Al INICIAR cualquier sesión: git pull de la rama actual antes de tocar nada.
- Al TERMINAR cada avance: commit descriptivo + git push. Nunca cerrar sesión con cambios sin pushear.
- Si el pull trae conflictos: PARÁ y reportá antes de resolver.
- Una máquina a la vez por rama.

## Pagos — estado real (audit 2026-09-15)
- YAPE DEL ORGANIZADOR (2026-09-24): el número se valida en los TRES
  escritores (Mi marca y super admin crear/editar) con lib/yapeNumber.ts:
  celular de 9 dígitos que empieza en 9 (limpia espacios, guiones y +51).
  startCheckout corta un pago con Yape de una marca SIN número ANTES de crear
  la orden (antes el comprador dejaba sus datos y caía en "no tiene Yape
  configurado"). Paso P del E2E: número mal escrito rechazado, número + QR
  desde Mi marca, el comprador ve QR y número al pagar, marca sin Yape → 0
  órdenes. Code tiene número pero NO QR subido (funciona igual, con "copiar").
- Yape manual: COMPLETO punta a punta. Comprobante público → revisión en panel
  (autenticada, scoped por marca, transición de estado atómica) → emisión →
  email. Es el camino que cobra hoy.
- AVISO DE VENTA A PAUL (2026-09-26): cada compra de pack acreditada manda un
  correo a SUPER_ADMIN_EMAIL ("💰 Nueva venta: <marca> · N eventos · monto"),
  desde lib/email/sendAvisoVentaPack.ts. Lo llaman los TRES caminos que
  acreditan (webhook parygo-mp, acreditarVueltaMp, /api/paypal/volver) solo
  si settle_pack_purchase devolvió 'credited' → uno por compra. Marcas is_test
  no avisan. Prueba sin enviar: `cd apps/web && npx tsx ../../e2e/aviso-venta-pack.mts`
  (intercepta Resend). La PWA (manifest.ts) se llama "ParyGo" y abre /scan,
  que al super admin sin marcas lo manda a la cabina.
- VENTAS DE PAQUETES EN LA CABINA (2026-09-26): la portada de la cabina
  muestra Hoy · Últimos 7 días · el mes (hora de Lima), cada uno contra el
  período anterior, y las últimas 5 ventas (app/cabina-7k29x/VentasPacks.tsx,
  una consulta a pack_purchases pagadas). Marcas is_test no suman; soles y
  dólares se suman aparte, sin convertir.
- CORREOS AL ORGANIZADOR (2026-09-25, Paul: "máximo uno o dos"): el aviso
  "Yapes por aprobar" es UNO por evento por ventana de 12 h (dedupe_key
  yape_pending_digest:<event>:<floor(epoch/43200)>, la misma en
  yape/actions.ts y en enqueue_yape_notifications, que el cron llama con
  p_digest_bucket_seconds = 43200): el primero al instante, después nada
  hasta la próxima ventana → máximo 2 por día. Antes era uno por orden.
  Y las marcas is_test NO reciben avisos de organizador: el worker los marca
  'sent' con last_error 'omitido_marca_de_prueba' (demotest tiene el correo
  de Paul y cada corrida del E2E le mandaba 4–8; los correos al COMPRADOR de
  demotest sí salen porque los smokes de prod los revisan).
- SDK `mercadopago` PROHIBIDO en el server (2026-09-25): arma su User-Agent con
  process.version.substring() y en el edge (Cloudflare y el sandbox edge de
  Next) process.version no existe → NINGUNA preferencia se creaba en
  producción (ni packs ni cobro con tarjeta de entradas; verificado en prod
  con demotest). Todo va por lib/mpApi.ts (fetch a /checkout/preferences y
  /v1/payments). Lo de abajo que dice "funcional" era cierto en Node local,
  no en el edge.
- MercadoPago: IMPLEMENTADO (2026-09-22; en el edge recién desde 2026-09-25). El código está completo y
  el checkout con tarjeta funciona: se crea la preferencia y el comprador llega
  a pagar. Lo que falta es OPERATIVO, dos cargas de datos, no código:
    1. las credenciales REALES de la marca (se cargan desde el panel), y
    2. el mp_webhook_secret, que sigue sin UI (ver el bullet de abajo).
  Sin la 2, el comprador paga pero el webhook responde 401 y la orden no se
  liquida — o sea que para cobrar de verdad hacen falta las dos. Webhook
  en /api/webhooks/mp/[brandId]: HMAC obligatorio sin bypass de entorno,
  re-fetch del pago contra la API de MP, verificación del monto contra el total
  congelado, settle_mp_payment atómico (0025), idempotencia por mp_payment_id,
  anti-replay de 5 min, comparación en tiempo constante.
- El bloqueo que tenía era orders_check (0036): exigía mp_preference_id en el
  INSERT y startCheckout inserta ANTES de crear la preferencia, así que TODO
  pago con tarjeta moría con un error crudo de Postgres en la cara del
  comprador. CERRADO por la 0055: una orden de MP puede existir sin preferencia
  mientras NO esté cobrada (status fuera de paid/refunded Y sin mp_payment_id).
  El invariante que importa —una orden de MP cobrada es reconciliable— lo sigue
  imponiendo el CHECK a nivel de fila, no la disciplina del código; probado con
  casos negativos contra la base real. NO volver a "crear la preferencia antes
  del insert": el monto autoritativo recién existe después de order_items +
  apply_promo_to_order, y una preferencia huérfana es un link de pago vivo sin
  orden detrás. El test K del E2E cubre los dos caminos y está en VERDE.
- PENDIENTE OPERATIVO: mp_webhook_secret NO tiene UI de carga ni de
  rotación. Se genera aleatorio al crear la marca en el panel super, se guarda
  encriptado (0034) y nunca se muestra; la columna en texto plano se borró (0044).
  Para que MP firme con un secret que la app reconozca hace falta un UPDATE
  manual vía RPC service-role. Sin eso, todo webhook de MP responde 401
  webhook_secret_missing y NINGUNA venta por MP se liquida.
- Precios y montos: siempre server-side. El cliente manda tipo y cantidad, nunca
  importe. Fase activa vía get_event_active_prices, congelada en order_items.
  Bulk topeado a 90% por constraint (0051). Anti-sobreventa atómico (0031).

## Orden seguro OBLIGATORIO por cada cambio
Plan/Explore (diseñar antes de codear) → ENSAYO con rollback
(`node supabase/dryrun.mjs`: corre la migración contra el esquema REAL dentro
de una transacción y la revierte — es la red que reemplaza al branch que no se
puede tener, ver abajo) → migración vía Management API
(`node supabase/mgmt.mjs file <archivo>` → verificar) → test en DEMOTEST
(nunca Code/Almighty) → push →
smoke en prod. No acumular pasos sin validar. Pausar entre pasos de riesgo
para OK de Paul.

## Seguridad — lecciones que NO se repiten más (ya costaron caro)
- RPCs SECURITY DEFINER service-role-only: revoke execute explícito de anon Y
  authenticated. `revoke from public` NO basta (Supabase aplica ALTER DEFAULT
  PRIVILEGES que concede a anon/authenticated). Bug histórico: 0014.
- Tests de permisos SIEMPRE por capa de auth REAL (JWT del rol), NUNCA con
  service-role (saltea RLS y no prueba nada).
- Concurrencia: SELECT FOR UPDATE + test de 2 operaciones simultáneas en TODO
  lo que toque saldo / stock / códigos / escaneos. Un éxito, un rechazo.
- security-review obligatorio en cualquier cosa que toque dinero, auth o acceso.
- Firebase parygo-da36a fue ELIMINADO por Paul. Las credenciales que quedan en el
  historial (migrate-admin.html, commit 5f10af2) son INERTES. Tema CERRADO — no
  volver a reportarlo.
- M1 CERRADO (0020). apply_promo_to_order ya NO confía en p_items: deriva tipo y
  cantidad de order_items, y la base de precio de order_items.base_price_cents,
  congelada por trigger en cada INSERT (cierra el vector de inyectar una base
  falsa por INSERT directo). p_items quedó vestigial: se sigue pasando por compat
  two-phase y el RPC lo ignora. El bloqueo que este archivo imponía sobre
  MercadoPago está LEVANTADO — no volver a reportarlo como pendiente.

## Sistema de diseño — reglas duras
- Las skills de diseño (emil, impeccable, taste) son CONSEJO GENERAL; ante
  cualquier contradicción manda CLAUDE.md (tokens, brandFillPair, benchmarks y
  tests de contraste). impeccable se invoca A MANO, nunca por hook.
- Fuente única: apps/*/app/styles/parygo-tokens.css, extraído de la landing y
  corregido para pasar AA. Está DUPLICADO en apps/landing y apps/web a propósito
  (dos apps Next separadas); `npm run test:tokens` falla si divergen y corre en
  CI. Si tocás una copia, tocá la otra. Migra a packages/ui cuando el deploy de
  la app esté verificado.
- --accent y --peri son DECORATIVOS: puntos, barras, anillos de foco, trazos,
  blobs, rellenos sin texto. NUNCA color de texto ni texto blanco encima.
  Razón: en páginas públicas de marca --accent toma var(--brand), elegido por el
  promotor, y no hay forma de garantizar contraste sobre un color arbitrario.
- FONDOS NEUTROS en las superficies del COMPRADOR (regla vigente desde el
  2026-09-23, reemplaza a "papel crema" ahí): blanco #FFFFFF o negro #0A0A0A;
  nunca crema, marrón ni tintes cálidos. Aplica a b/[brand]/* (compra, datos,
  Yape, confirmación, /pedido, /t/[uuid], home de marca) y a los emails de
  ENTRADA (compra y transferencia). El comprador va en NEGRO: tema `pg-noche`
  de parygo-tokens.css (--bg #0A0A0A, --surface #141414, --surface-2 #1C1C1C,
  --selected #202020, --ink #FFF, --ink-2 #A3A3A3, --ink-3 #8A8A8A; #7A7A7A de
  la maqueta daba 4.30 sobre --surface y se corrigió). Geist (paquete `geist`)
  en todo, sin Bricolage ni Hanken. El email de entrada va en BLANCO.
  Los PANELES (organizador y super admin) montan `pg pg-noche pg-panel` y
  SIGUEN EL TEMA DEL TELÉFONO (prefers-color-scheme, pedido de Paul
  2026-09-23): oscuro = tokens de noche; claro = bloque "TEMA CLARO" de
  parygo-panel.css, blanco neutro #FFFFFF / #F4F4F5, tinta #0A0A0A, medido
  por scripts/check-panel-contrast.mjs (en test:contrast). El número sobre
  el acento usa --on-accent (#0A0A0A en los dos temas), nunca --on-white.
  PENDIENTES para otra rama (siguen en crema): la landing y los emails de
  recordatorio, cancelado, cambio de fecha y Yape.
- Botón primario = TINTA sobre acento (5.91:1 medido) en la landing. Blanco
  sobre naranja da 2.85:1 y FALLA AA — no usarlo nunca. En los PANELES (noche)
  el primario es RELLENO DE TINTA (blanco en noche, #0A0A0A en claro); el acento
  ahí solo es punto, contador (número en #0A0A0A) o anillo de foco. En el COMPRADOR y los emails de entrada
  el botón es `brandFillPair(hex, 'neutra')`: blanco o #0A0A0A sobre el color
  de la marca, el que llegue a 4.5:1 (prefiere blanco; Code: blanco sobre
  #C8371F = 5.22:1). Nunca blanco "a mano": una marca clara lleva #0A0A0A.
- Única excepción documentada: la palabra de acento del h1 de la landing
  (display ≥56px) usa --accent-deep #E8552A con el subrayado ondulado como
  segunda señal. Medido 3.41:1, sobre el mínimo 3:1 de texto grande. Por debajo
  de 56px el mínimo es 4.5:1 y no llega: no usarlo ahí.
- --ink-2 y --ink-3 son ALFA de la tinta, no grises hex, para que el contraste
  no dependa de sobre qué papel caigan. Piso medido para AA en las cuatro
  superficies: alfa .630. No bajarlos sin volver a medir contra --paper-3.
- Los semánticos (--ok, --warn, --alert) fallan AA como color de texto sobre
  papel: el texto de un estado va en --ink y el color lo lleva el punto.
- Sitio del comprador (app/b/[brand]): monta `pg pg-noche client-shell`;
  client.css (primitivas, entrada, estados), compra.css (evento, datos, Yape;
  reemplazó a direcciones.css) y landing.css (home). --accent = --brand-mark.
  El COLOR DE MARCA NUNCA PORTA TEXTO: contrastOn (YIQ) no garantizaba nada.
  Lo único que lleva texto encima es el par de `brandFillPair(hex, 'neutra')`
  (--brand-fill/--on-fill), medido a 4.5:1. Como punto, barra de 3px de la
  fila elegida o anillo de foco va `brandMark()` (--brand-mark): el color
  aclarado lo mínimo para llegar a 3:1 contra #0A0A0A (WCAG 1.4.11), porque
  una marca oscura desaparecía sobre el negro. `npm run test:contrast`
  verifica CINCO caminos contra 16 colores de marca: el par papel, su hover,
  brandInk, el par neutro con su hover, y brandMark; y check-variant-contrast
  mide el texto de noche sobre sus 4 superficies y la entrada blanca, falla si
  un fondo de noche deja de ser neutro o si una fila se "apaga" con opacity.
- La ENTRADA y el email NO muestran el código de la entrada (ticket_number,
  TKT-…) ni el qr_code ni ninguna URL escrita: el QR es la entrada. El código
  sigue en la base y en el panel del organizador para soporte y escaneo. El
  email lleva el QR inline por cid (hasta 5) + un PNG adjunto por entrada + un
  botón "Ver mi entrada" (la URL solo en el href). "WhatsApp" en la entrada
  comparte la IMAGEN (Web Share) o descarga el PNG y abre wa.me/?text= con
  "Mi entrada para <evento> · <fecha>"; ya no va al organizador. El E2E
  (paso E) falla si aparece un código o un http en pantalla, PNG, WhatsApp,
  HTML visible o texto plano del email.
- El HOVER de un relleno de marca es OTRO COLOR MEDIDO, nunca `filter:
  brightness()`. Un filtro mueve el relleno DESPUÉS de que el test midió el
  par: con #E91E63 el botón de pagar caía de 4.58:1 a 4.20:1 justo cuando el
  comprador tenía el dedo encima. El test falla si el filtro vuelve.
- `brandInk()` (el color de marca usado COMO texto: el eyebrow y la cifra
  grande de los emails transaccionales) tiene piso AA 4.5:1 contra --paper-3,
  la superficie más oscura. Medía contra BLANCO con umbral 2.8 y devolvía el
  color crudo: el propio tangerina salía a 2.30:1 sobre paper-3 y 9 de 13
  colores de marca fallaban. Cerrado el 2026-09-22; el test lo cubre y además
  rechaza que vuelva el umbral viejo.
- CERO tamaños y radios sueltos en el CSS: cada uno sale de la rampa de su
  superficie (--s-* en paneles, --b-* en el comprador) o de los tokens de radio
  (--r-ctl/--r-btn/--r-card/--r-pill). El comprador tiene escala FIJA, sin
  clamp (h1 40 en teléfono / 76 desde 1024, títulos 32, precio 18, etiquetas
  11). Excepción escrita en apps/web/DESIGN.md: los velos sobre FOTO (el
  flyer difuminado con brightness(.55) detrás de la banda) son máscaras de
  legibilidad sobre una imagen ajena, no sombras.
- Motion del comprador: una sola curva cubic-bezier(0.23, 1, 0.32, 1), solo
  transform/opacity, nada > 320ms salvo el QR (400). Entrada escalonada solo
  en la primera carga (hero 0 · título 60 · entradas 120 · pasos 200 · dónde
  280 · barra 360); stepper sin rebote y SIN remontar la fila (el E2E lo
  verifica); hovers solo con puntero fino; reduced-motion = fundido de 200ms,
  no animation:none; reduced-transparency = barra y cabecera sólidas.
- El panel NO anima al cargar (solo .s-notice) y TODO control presionable
  tiene `:active { transform: scale(.97) }`. El organizador trabaja desde el
  teléfono: ahí el :hover no existe y sin :active no hay ninguna señal de que
  el control recibió el toque. El fade-up escalonado de filas se sacó: se veía
  decenas de veces por día y es la firma del dashboard generado.
- Estado de las superficies: la landing en el sistema de papel; el comprador
  (compra, entrada, home de marca) y los dos paneles en el tema noche. La entrada (QR) vive en
  app/b/[brand]/TicketPass.tsx, compartida por /t/[uuid], /pedido y la
  confirmación; la imagen que se guarda/comparte, en SaveTicketImage.tsx.
- PANELES (organizador + super admin), NOCHE o CLARO según el teléfono (2026-09-23, referencia
  aprobada por Paul "Panel organizador ParyGo.html"; brief en
  apps/web/.impeccable/surfaces/app-admin.md). Fondo #0A0A0A (o #FFFFFF en claro), Geist 600 en
  títulos y números (sin 800), etiquetas en 12–13px y MINÚSCULA normal: NADA
  de mayúsculas espaciadas ni eyebrow encima de un título (era la firma del
  dashboard generado; impeccable lo prohíbe). Sin sombras. La estructura la
  hacen hairlines y filas de 52 con ícono y chevron, como un menú de ajustes.
  Lo ÚNICO con fondo (--surface #141414, radio --r-ctl) es lo que pide algo:
  la fila de Yapes por aprobar / solicitudes (.s-due). Campos en CAJA de 48
  (borde blanco .14, radio 10, texto 16 para que iOS no haga zoom). UN solo
  primario por pantalla (relleno de tinta); secundario = mismo botón con borde
  (.s-btn--soft); --ghost = texto. Navegación: barra LATERAL fija de 248 en
  ≥900 y barra de ABAJO en el teléfono, en los DOS paneles. Tamaños y radios
  siempre de la rampa (--s-*, incluidos --s-field/--s-cifra/--s-hero/--s-word)
  o de los tokens de radio. Nada centrado en toda la app.
- PANEL DEL ORGANIZADOR, estructura POR NIVELES (pedido de Paul, 2026-09-23,
  rama panel/lanzamiento): CUATRO secciones, iguales en celular y compu:
  Eventos · Escáner · Equipo · Mi marca (barra lateral en la compu; barra FIJA
  abajo en <900). NIVEL 1, EVENTOS: fila de Yapes por aprobar (si hay) y los
  eventos como TARJETAS con su flyer (el organizador elige cuál abrir);
  pasados y archivados plegados; el pack al pie. NIVEL 2, EL EVENTO: flyer,
  nombre, cuándo/dónde, publicar, Yapes pendientes, Abrir escáner + Copiar
  link y un MENÚ de secciones EN ESTE ORDEN: Estadísticas · Entradas · Yapes
  · Cortesías y códigos · Compradores · Promotores · Puerta · Datos del
  evento. NIVEL 3, cada sección es su pantalla con "‹ <evento>" para volver
  (nada de pestañas ni sub-pestañas). SIN CIFRAS DE VENTA fuera de
  Estadísticas (Paul: "S/ 0 cobrado · 3 vendidas se ve poco profesional").
  Entradas (/entradas): cada tipo es una fila plegada con UN botón "Guardar
  cambios de <nombre>" + "Agregar tipo de entrada" (nombre, precio o gratis,
  cuántas, color). Datos del evento (/editar): datos, flyer y gestión, con
  "Guardar datos del evento". Crear evento = formulario en 3 pasos. iPhone:
  ningún campo con letra < 16px (Safari hace zoom; audit-iphone lo mide como
  "zoom") y html con touch-action: manipulation. El E2E (paso J) verifica el
  menú, las secciones y que el evento abra sin cifras.
- CABINA DEL SUPER ADMIN (rediseño 2026-09-26, "para entenderlo yo"; crítica
  impeccable con dos evaluaciones: 16/40 en heurísticas). Pestañas: Inicio ·
  Marcas · Eventos · Salud (Solicitudes salió de la barra: link al pie de
  Marcas). INICIO responde "¿qué me toca?" (una .s-due con el único primario;
  el resto en .s-todo; si no hay nada, .s-calm--ok "Todo en orden") y "¿cómo va
  el negocio?": Paquetes vendidos (VentasPacks; en cero, UNA línea, no doce
  ceros), Eventos a la venta ahora con ENTRADAS (no soles: esa plata es de la
  marca) y una fila de resumen de marcas. MARCAS (/brands) = el inventario; en
  el teléfono la fila entera abre la ficha (sin los 3 íconos mudos), "Le
  quedan N eventos" en vez de "Saldo N", y plegados Archivadas y De prueba
  aparte. EVENTOS: sin marcas de prueba, agrupado A la venta (con entradas) /
  Sin publicar / plegados Terminados, Archivados, De prueba. SALUD: en
  palabras de dueño (nada de notification_jobs ni pending_yape_review), un
  número que no se pudo leer es "—" y nunca 0, y "Lo que hiciste dentro de
  marcas" (auditoría del modo edición: 6 a la vista, el resto plegado). BUG
  cerrado: el Promise.all de Salud tenía cruzados eventos publicados y la
  auditoría (siempre "0" y siempre vacía). .s-calm ya no parte el punto del
  texto. Verificación: e2e/capturas-cabina.mjs (22 checks, 390 claro y 1440
  oscuro).
- CABINA VISUAL (mismo día, Paul: "no me gusta que sea todo letras, tiene
  que ser como el panel del organizador"): app/cabina-7k29x/visual.tsx con las
  piezas de /admin — el evento a la venta en GRANDE (flyer + nombre + tres
  cifras: entradas, vendidas hoy, ya entraron), barras de entradas por día
  (14 días, hoy en el acento, número solo en hoy y en el máximo), cifras
  grandes de paquetes (hoy · 7 días · mes, siempre visibles) y MARCAS y
  EVENTOS como tarjetas con logo/flyer en rejilla (2 columnas en el teléfono).
  El logo de marca va sobre --surface-2, nunca sobre el color de la marca.
  ORDEN DE PESTAÑAS (Paul, mismo día): MARCAS es la principal (/cabina-7k29x,
  solo las marcas; /brands redirige ahí) · EVENTOS (el que se vende en grande
  con sus tres cifras + tarjetas) · VENTAS (/ventas: paquetes hoy/7 días/mes y
  entradas de todas las marcas con las barras de 14 días) · SALUD (ARRIBA lo
  que te toca resolver —la fila .s-due y las .s-todo—; después Hoy, Controles,
  Correos y el registro de lo que hiciste). Ya no hay pantalla "Inicio".
- ESCÁNER: /scan sin sesión va a /login?next=/scan y el login VUELVE al
  escáner (lib/loginNext.ts, con test de open redirect en
  e2e/login-next.test.mts); antes terminaba en el panel y "parecía que se
  reiniciaba". Cámara trasera a 720p (sin límite Safari de iPhone recargaba la
  pestaña). El organizador tiene "Panel" para volver; /puerta tiene "Entra con
  tu email y contraseña" → escáner.

## PROHIBIDO: pruebas de carga contra producción
El 2026-09-22 tiré la base de producción durante una hora corriendo el arnés de
carga contra ella: 3000 reclamos en 60s (y antes otras dos tandas de 2000 y
1200). Postgres dejó de aceptar conexiones —"Failed to connect to database"— y
la página pública del evento publicado de Code quedó colgada. Volvió recién con
un reinicio del proyecto por la Management API; no se perdió ningún dato.
Además las ~9000 órdenes y ~8000 entradas que dejó la carga agotaron el
presupuesto de disco (IO) de la instancia y la base quedó lentísima horas
después; hubo que pausar los crons, borrar todo con respaldo
(supabase/limpiar-datos-de-prueba.mjs) y hacer VACUUM ANALYZE.

REGLAS, sin excepción:
- PROHIBIDO correr pruebas de carga contra la base de producción. SOLO contra
  un Supabase Branch o un proyecto Supabase aparte (branching requiere Pro:
  mientras sigamos en Free, eso significa proyecto aparte o no se corre).
- NO correr `e2e/carga-*.mjs` contra producción (ni la base ni el dominio). Son
  herramientas de medición, no de rutina; quedaron versionadas para el día que
  haya un entorno donde valga usarlas.
- Nada de escrituras masivas contra la base real. El techo de lo aceptable es
  lo que hace el E2E de fase 1: decenas de filas, no miles.
- Antes de cualquier prueba de volumen, PREGUNTAR a Paul. La instancia es
  Supabase Free (sin add-on de cómputo, `selected_addons: []` verificado por
  API) y no tiene margen.
- Si la base se cae: `/v1/projects/<ref>/health` dice la verdad aunque el
  proyecto figure ACTIVE_HEALTHY, y el reinicio por la Management API es la
  remediación que funcionó.

## Migraciones
NO HAY BASE DE ENSAYO. demotest es una MARCA dentro de producción, no un
entorno, y un branch de Supabase tampoco sirve: hasta la 0053 el historial no
podía reconstruir la base (el valor 'courtesy' del enum payment_method se había
agregado fuera de banda y ninguna migración lo creaba), así que el branch
arrancaba con un esquema distinto al real. Eso quedó cerrado, pero el ensayo
real sigue siendo `supabase/dryrun.mjs` (transacción + rollback contra el
esquema de producción). Verificar SIEMPRE que no persistió nada después.
Herramientas versionadas: supabase/mgmt.mjs (Management API; lee el token de
.env.local y no lo imprime nunca), supabase/dryrun.mjs (ensayo),
supabase/verify-0053-0058.mjs (comprobaciones de estado esperado).
OJO con `mgmt.mjs types`: PISA database.types.ts entero y regenerarlo completo
rompe tipos afinados a mano — las columnas nuevas se agregan a mano.

PENDIENTE (encontrado 2026-09-23): la 0054 agregó brands.yape_qr_url SIN
`grant select (yape_qr_url) on public.brands to authenticated` (las columnas
de brands se exponen una por una: 0023/0043/0052). Con la sesión del
organizador daba "permission denied" y "Mi marca" salía EN BLANCO. El panel
ya la lee con service role acotada a la marca; la migración del grant queda
para cuando Paul la apruebe (no hace falta para que ande).

PACKS DE EVENTOS (0070, en PRODUCCIÓN desde 2026-09-25, con las claves de MP
de Paul cargadas en Cloudflare). El organizador compra 1/3/5/10 eventos en /admin/comprar con
MP (cuenta de Paul, PEN) o PayPal (USD); settle_pack_purchase es el único
camino que suma saldo. Webhook /api/webhooks/parygo-mp: se configura en el
PANEL de MP ("Tus integraciones" → Webhooks, evento Pagos), NO con
notification_url en la preferencia (esa tiene prioridad y la firma
x-signature es de la config del panel). Respaldo: /admin/comprar/listo
re-pide el pago a MP al volver (?payment_id=). Env en Cloudflare (Secret):
PARYGO_MP_ACCESS_TOKEN, PARYGO_MP_WEBHOOK_SECRET (y PAYPAL_CLIENT_ID/SECRET/
ENV). Sin ellas los botones salen apagados. PayPal LIVE cargado el
2026-09-25 (PAYPAL_ENV=live); smoke en prod: e2e/empezar-paypal.mjs
(E2E_BASE=https://app.parygo.com) crea la orden y NO la aprueba — con live
aprobar sería plata real. Tests: supabase/ensayo-0070.mjs y
e2e/packs-rpc.mjs (JWT real + concurrencia, 10/10). El cobro de ENTRADAS por
MP de cada marca todavía pone notification_url en la preferencia: revisar
igual antes de que una marca cobre con tarjeta.

ALTA CON PACK SIN CÓDIGO (2026-09-25, pedido de Paul: "directo a Mercado
Pago y pagar y ya"): pagarAlta crea la marca SIN dueña y ARCHIVADA (no se
publica sin pago) y manda a MP; la contraseña queda en el navegador
(sessionStorage), NUNCA en el server antes del pago. /empezar/listo: con la
compra pagada (solo created_by null) y la marca archivada sin dueña, crea la
cuenta con user_metadata.alta_sin_verificar, la hace dueña, publica la marca
y entra; el webhook manda "termina de crear tu marca" si no volvió. Como ese
correo NO se verificó, las invitaciones (staff en /admin, dueña en la cabina)
y los puestos de puerta NO se cuelgan de una cuenta alta_sin_verificar ni de
una cuenta ajena: sin eso, pagar un pack con el correo de otro daba el
escáner de su marca (security review). /empezar rechaza correos @*.parygo.
{local,test,com}. Un link de un alta con pack abandonada (>2 h, sin pago ni
dueña) se libera al pedirlo. Las páginas "listo" van con fetchCache
'force-no-store' (Next cacheaba la compra y seguía "confirmando"). Test:
e2e/empezar.mjs 37/37 (el pago aprobado se simula con settle_pack_purchase;
el re-fetch real a MP necesita credenciales de prueba).

SIN PRUEBA GRATIS (2026-09-26, Paul: "mejor que compren directo"): /empezar
ofrece SOLO los paquetes 1/3/5/10 (un link viejo ?pack=prueba cae en 1); se
sacaron enviarCodigo/confirmarAlta, el código por correo (sendCodigoAlta) y
la prueba de la landing (tarjeta en Precios, FAQ, chips, "Comenzar gratis"
→ "Comenzar"). Lo de abajo sobre la prueba y el código queda como historia.
La base NO cambió: prueba_disponible/0069 siguen y las marcas que ya la
tenían la conservan; la cabina la puede REGALAR a mano (casilla apagada por
defecto). e2e/empezar.mjs 31/31 (paso C verifica que no se ofrece).

ALTA AUTOSERVICIO (0071, 2026-09-25): app.parygo.com/empezar reemplaza a
"Pedir acceso" (/organizadores redirige). El organizador elige prueba gratis
(1 evento, hasta 20 entradas: prueba_tope_entradas() bajó de 50 a 20) o pack,
pone su marca y confirma con un código de 8 dígitos al correo (ÚNICA
verificación, decisión de Paul); pack → MP → saldo solo. Reglas que NO se
aflojan (security review): el usuario se crea SIN confirmar y con contraseña
AL AZAR; la suya se pone recién tras el código (con la suya, cualquiera
pre-registraba el correo de otro); antes de generar un link se busca el
correo con usuario_id_por_email (service role) porque un magiclink pisa el
token vigente de esa persona; UNA persona = dueña de UNA marca (índice
único brand_members_un_dueno) — frena N altas en paralelo con N pruebas;
el código de correo NO lleva el nombre de marca tipeado. Tras fijar la
contraseña hay que volver a entrar (cambiarla cierra las sesiones). Tests:
e2e/empezar.mjs (23/23) y e2e/prueba-0069.mjs (lee el tope de la base).
PENDIENTE: tope de intentos de código por correo.

PRECIOS DE LOS PACKS (Paul, 2026-09-25): soles 150/390/600/1.100 (MP) y
dólares 59/149/229/399 (PayPal, "internacional premium": afuera se cobra más
y PayPal se lleva ~5,4%). Viven en apps/web/lib/packs.ts (lo que se cobra) y
apps/landing/lib/packs.ts (lo que se muestra): si cambias uno, el otro.

LIMPIEZA DIARIA (0072, cron parygo-limpiar-altas 09:41 UTC):
limpiar_altas_abandonadas() borra marcas nacidas del alta SIN dueña, eventos,
órdenes ni compra pagada (7 días; las is_test del E2E a la hora), usuarios SIN
confirmar de >7 días sin marca ni referencias, e intentos de >2 días. Service
role solamente (probado con JWT anon y authenticated: permission denied). Una
marca con una compra PAGADA real nunca se borra.

PANEL EN INGLÉS (0073, 2026-09-25, pedido de Paul): brands.idioma ('es' |
'en', default 'es') decide el idioma del panel del organizador y del escáner
de esa marca. Nace 'en' si el alta fue en inglés; se cambia en Mi marca
(selector con etiqueta bilingüe a propósito). El super admin mirando una
marca la ve SIEMPRE en español. Código: lib/idioma.ts (textos → t(es, en) y
loc), lib/idiomaServer.ts (textosPanel/idiomaPanel, cacheado por pedido; el
idioma viene embebido en las membresías de getSessionUser, cero viajes
extra) y components/IdiomaPanel.tsx (useTextos en cliente; sin proveedor =
español, que es lo que ve la cabina). REGLAS: todo texto nuevo del panel va
con t('español', 'English') y el español NO se toca (el E2E lo compara
byte a byte); las funciones de lib con mensajes toman `l: Idioma = 'es'`
opcional. NO se traduce lo que ve el COMPRADOR (su sitio, sus correos, los
mensajes de WhatsApp que manda el organizador): sigue en español, igual que
los precios en S/. El correo "Yapes por aprobar" al organizador sí sale en
su idioma. Tests: e2e/fase1.mjs (español, 181/181) y e2e/panel-en.mjs
(cambia a inglés desde Mi marca, recorre 16 pantallas buscando español
suelto, vuelve a español).

VELOCIDAD DEL PANEL (2026-09-25, "veo que carga mucho"): cada viaje a
Supabase cuesta ~170 ms desde Lima y una pantalla encadenaba 5–7. Reglas:
el middleware NO llama getUser() (solo getSession(), que renueva el token
sin viajar; la verificación es getUser() en requireSession); getSessionUser
corre getUser + perfil + membresías EN PARALELO (lee el id del token de la
cookie y descarta todo si getUser no confirma ese mismo id); las consultas de
una página van en UN Promise.all; NUNCA bajar todas las órdenes/entradas de
una marca para contar o detectar algo (la portada lo hacía dos veces: Code
son 491 órdenes y 1.218 entradas por visita) — usar count, filtros o un
anti-join (`tickets!left(id)` + `.is('tickets', null)`). Smart Placement: la base está en
us-west-1 (California) y Cloudflare atiende a Lima desde Río (GIG), así que
cada consulta cruzaba el continente. Se prendió por la API de Cloudflare
(deployment_configs.production.placement = smart, 2026-09-25): el
[placement] de apps/web/wrangler.toml NO lo aplicó la integración con Git.
Verificar con el GET del proyecto de Pages; el PATCH conserva las variables.

Incrementales, idempotentes, numeradas (vamos por 0073). Backwards-compatible
cuando haya venta en curso: patrón two-phase (schema → deploy → canary → flip)
para no romper la app vieja desplegada.

## Auth (modelo final)
- Super admin (Paul, paulsebastian439@gmail.com): email + contraseña (antes
  magic link; cambiado a pedido de Paul en rama feat/super-admin-redesign). El
  panel super vive en un slug oculto (no /super). Recuperación de password vía
  dashboard de Supabase. El guard real es server-side (requireSession superAdmin),
  no el slug.
- brand_admin + validator: email + password (Paul/brand_admin setean la fija).
- Cada validator tiene su código PERSONAL de puerta (8 alfanum CSPRNG) →
  trazabilidad por persona en ticket_scans.validator_user_id.
- Deuda técnica documentada: super admin conoce las passwords; sin "cambio
  obligatorio en primer login". Implementar cuando escale.

## Modelo (selección de la verdad)
- Precio: fases de preventa automáticas (ticket_type_price_phases). El precio
  activo lo resuelve get_event_active_prices contra now() (Lima UTC-5). Se cobra
  server-side y se CONGELA en order_items.unit_price_cents.
- Stock: ticket_types.is_unlimited (max_scans NULL = ilimitado).
- Escaneo (DECIDIDO 2026-09-18): UN SOLO escaneo por QR. El 2º escaneo es
  "YA USADO" y no pasa: es anti-fraude (un QR reenviado por WhatsApp no entra
  dos veces). El builder crea los tipos con max_scans=1. Reingreso configurable
  por tipo queda como FEATURE FUTURA con migración; no reportarlo como bug.
- CÓDIGOS PARA RECLAMAR (2026-09-23): un código que deja la orden en S/0 en
  un evento que COBRA vale 1 ENTRADA por uso (startCheckout lo exige dos
  veces: tras preview_promo y tras apply_promo_to_order, contra el total
  congelado). Antes un uso se llevaba hasta 10 entradas. El organizador los
  crea en Cortesías ("Códigos para reclamar": gratis, N usos, 1 por email).
  Cubierto por el paso N del E2E.
- ENTRADAS PRIVADAS CON LINK (0066, 2026-09-23). Un tipo es privado si tiene
  fila en ticket_type_access (tabla SOLO service role: el token no puede ir en
  ticket_types, que se lee con la anon key). No se ofrece en la página; solo
  con <marca>.parygo.com/<evento>?acceso=TOKEN se ve, se reserva y se emite
  (guard + startCheckout, comparación en tiempo constante, fail-closed si no
  se puede leer la tabla). Un S/0 privado se reclama gratis aunque el evento
  cobre (todoPrivado), pero un carrito mixto paga lo público. El organizador:
  Entradas → la entrada → Hacerla privada / Copiar link / WhatsApp / Cambiar
  link (el viejo muere) / Hacerla pública; o la casilla Privada al crear.
  Con el link se ve SOLO la privada (sin las públicas: cada promotor lleva su
  conteo), y el checkout rechaza mezclarla con una pública.
  CUÁNTAS POR PERSONA (0067 + 0068): ticket_type_access.max_por_persona, lo
  pone el organizador en la entrada ("Guardar límite"; NULL = sin límite;
  default 1 si es gratis, sin límite si es paga). Lo aplica reserve_order_stock
  (embudo de startCheckout Y claim_free_order) con advisory lock por (tipo,
  email) y (tipo, documento) → 'private_claim_limit'. Test de concurrencia en
  el paso O (2 simultáneos del mismo correo → 1 entrada). Los códigos promo NO
  aplican a entradas de link (el tope se mide antes del promo: privada paga +
  código 100% lo esquivaba). El documento se compara en MAYÚSCULAS en los dos
  topes (0060 y 0067). En
  solo lectura (super mirando) el token NO se manda al navegador. Paso O del E2E.
- CORTESÍAS: se emiten al email del organizador (precargado) y la página
  Cortesías lista CADA entrada con "Copiar link" y "WhatsApp" (la URL solo
  en el href/portapapeles, nunca escrita). Cada QR entra una vez.
- Códigos promo: por evento, tipos percent/fixed(por-orden)/free, límites
  ilimitado/N/por-email, tracking por RR.PP. (label + ventas por código), sin
  comisiones automáticas. Descuento sobre fase activa, congelado, server-side.
- EVENTOS GRATIS (0056 + 0059, 2026-09-22). "Precio 0" significaba dos cosas que
  el sistema no podía distinguir: una CORTESÍA de un evento pago (lista de
  invitados, jamás pública) y una entrada de un evento GRATIS de verdad. Ahora
  la intención es explícita: events.is_free y ticket_types.is_courtesy.
  REGLA ÚNICA, en lib/publicTicketGuard.ts:
      público = precio > 0  OR  (evento.is_free AND NOT tipo.is_courtesy)
  O sea: un tipo S/0 de un evento PAGO sigue oculto, igual que siempre.
  startCheckout emite sin pago solo si se cumplen las DOS condiciones (evento
  marcado gratis Y total 0); un total 0 inesperado en un evento que cobra no
  emite nada. El server BLOQUEA cambiar is_free si el evento ya tiene ventas
  pagas (el checkbox deshabilitado es solo del cliente).
  Un tipo S/0 de un evento pago NACE cortesía por trigger (0059), porque los
  tipos se crean por tres caminos distintos —el builder inserta vía RPC, o sea
  SQL— y un default que vive en tres lugares se desincroniza.
- MARCAS DE PRUEBA (0057, 2026-09-22). brands.is_test: SOLO demotest (verificado
  el 2026-09-23: ensayo-paul y koko ya no existen en la base). Es la única marca
  para pruebas. Ninguna marca de prueba tiene flyer propio y los de Code y
  Hoesky no se tocan, así que el E2E le SUBE un flyer SINTÉTICO por el panel al
  evento de demotest (paso C: 1080×1350, dirección Canvas; paso M: 1080×2400
  con forma de captura para medir Editorial y vuelta al 4:5). `?flyer=<slug>`
  (el helper de preview) ya no tiene de dónde sacar un flyer de prueba.
  Los contadores del super admin las excluyen, y "Yape por revisar"
  cuenta solo órdenes CON comprobante subido (una pendiente sin comprobante es
  un checkout abandonado, no trabajo de nadie). Medido: marcas activas 4 → 2,
  Yape por revisar 12 → 0; el 97% de lo "cobrado" que se veía eran corridas del
  E2E. NO afecta nada del flujo de compra: una marca de prueba funciona igual,
  solo que no suma a las métricas, y SIGUE en la lista con un badge "Prueba".

## Reportar
Por paso, con evidencia (la migración, el test de concurrencia, los tests de
permisos por JWT, el security-review). Pausar antes de pasos de riesgo para OK.

## Modelo / costo
Opus para diseño (Plan) y lo de riesgo. Sonnet/Haiku para subagents mecánicos
(review, tests). No quemar Opus en tareas mecánicas.

## Herramientas
- **Context7** (MCP global): consultarlo ANTES de usar cualquier API de Next,
  Supabase o Resend. La doc de memoria envejece; Context7 trae la de la versión.
- **Graphify**: consultar el grafo antes de leer archivos a ciegas
  (`graphify query "<pregunta>"`, `graphify explain "<símbolo>"`,
  `graphify path "<A>" "<B>"`). Regenerarlo tras cambios grandes con
  `graphify update .` (solo AST, sin LLM, sin costo). Salida en graphify-out/
  (gitignored; cada máquina lo genera). Los hooks que lo recuerdan viven en
  .claude/settings.local.json (ruta del exe propia de cada PC, no se commitean).
  En Windows, si el shim `graphify` de uv falla, usar `graphify.exe` o
  `python -m graphify` con el Python de `%APPDATA%\uv\tools\graphifyy`.
- **Playwright CLI** (`playwright-cli`): capturas y QA a 390 y 1440.
- **Agent-skills** (/spec /plan /review…): solo apoyo. Mandan las reglas de
  este archivo: gates, nada a refactor/monorepo sin OK de Paul, security-reviewer
  en pagos.
- **Ponytail**: código mínimo, pero NUNCA recortar validación, seguridad ni
  manejo de errores del flujo de compra.
- **UI UX Pro Max / SkillUI / impeccable**: solo referencia. Manda el sistema
  de ParyGo: fondos blanco/negro neutro, Geist, sin tarjetas flotantes. La salida
  de SkillUI vive en tmp/skillui/ y no se aplica a nada.
- **Skills del stack (curadas 2026-09-26, 34 en .claude/skills)**: por
  plataforma → `cloudflare`, `wrangler`, `workers-best-practices` (Pages +
  Worker router), `supabase`, `supabase-postgres-best-practices`, `resend`,
  `mp-integrate`, `mp-webhooks` (oficiales de Mercado Pago),
  `next-best-practices`, `vercel-react-best-practices`. Calidad →
  `code-review` (mattpocock), `web-design-guidelines` (accesibilidad/UX),
  `tdd`, `systematic-debugging`, `diagnose`, `verification-before-completion`,
  `resolving-merge-conflicts` (para el flujo PC + laptop). Diseño → impeccable,
  emil-design-eng, taste, ui-ux-pro-max, animate, review-animations.
  Se sacaron las genéricas o ajenas al stack (Vercel deploy, Sentry,
  marketing, senior-*, 4 skills de diseño duplicadas). Gestión con
  `npx skills add <owner/repo> -s <skill> -y -a claude-code --copy`
  (UNA skill por comando; la lista con comas no instala nada) y
  `npx skills update -y -p`; después del update, volver a copiar
  (`update` deja enlaces simbólicos a .agents/, que está gitignored, y un
  enlace no viaja bien entre PC y laptop). Agentes en .claude/agents, todos
  de ParyGo: `security-reviewer` (dinero/auth/acceso, obligatorio),
  `ui-ux-designer`, `e2e-parygo` (corre la prueba correcta con el build y
  el server correctos, limpia demotest) y `deploy-parygo` (check-runs +
  smokes de solo lectura tras cada push). Los genéricos (code review,
  tests, seguridad, performance web) los da el plugin agent-skills.
