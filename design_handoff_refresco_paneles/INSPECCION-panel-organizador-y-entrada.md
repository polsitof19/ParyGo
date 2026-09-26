# Inspección solo-lectura — Panel del organizador + Experiencia del comprador con su entrada

> Documento de referencia. Pasada **100% lectura**: mapa real, diagnóstico y propuesta de reorganización (sin features nuevas, solo reorden/jerarquía/copy). La implementación va por partes, con OK de Paul, en prompts aparte.
>
> Fecha: 2026-07-06 · Método: 3 exploradores en paralelo sobre `apps/web` + lectura directa de layout/nav/Inicio/Settings.

## Contexto que gobierna el diagnóstico

- **No hay bandeja Yape global**: `/admin/yape` es un redirect a `/admin`. La revisión de Yape es **por-evento**.
- **Los compradores no se loguean.**
- **El QR no viaja en el email ni aparece en la confirmación**: ambos solo enlazan al ticket. Entre "pagué" y "veo mi QR" siempre hay un clic intermedio.

---

# PARTE 1 — Panel del organizador (brand_admin)

## 1.1 Mapa actual

**Navegación global** (topbar, 2 ítems): `Inicio` · `Configuración`. No hay sidebar. Los eventos no tienen entrada de nav propia: cuelgan de "Inicio", que es a la vez dashboard y listado.

| Ruta | Qué muestra | Acción principal |
|---|---|---|
| `/admin` (**Inicio**) | 4 KPIs (Saldo, Publicados, Yape por revisar, Ventas pagadas) · checklist "Primeros pasos" · aviso saldo bajo · grid de eventos (con venta y badge Yape por tarjeta) · Archivados · "Tu marca" · "Staff de puerta" (validadores) | Crear evento / revisar Yape / entrar a un evento |
| `/admin/settings` | Contacto · Cobro Yape · Marca visual (logo/colores) · Avisos por email · MercadoPago | Guardar configuración |
| `/admin/events/new` | Formulario evento + tipos de entrada + fases de precio | Crear evento |

**Subárbol del evento** — 8 pestañas horizontales planas:
`Resumen · Editar evento · Editar entradas · Clientes · Promotores · Accesos · Revisar Yape · Reporte`

| Pestaña | Qué muestra | Acción principal |
|---|---|---|
| **Resumen** | Yapes a aprobar (arriba) · alertas stock/precio · "Tu dinero" · entradas por tipo · ventas/día · Yapes rechazados · **acordeón "Códigos de RR.PP." (creación)** | Aprobar Yapes |
| **Editar evento** | Datos · opciones checkout (avanzado) · **Postergar · Clonar · Cancelar · Cortesías · Flyer · Archivar · Eliminar** | Guardar evento |
| **Editar entradas** | Tipos de entrada (precio congelado si hay ventas) + nuevo tipo | Crear/editar tipo |
| **Clientes** | Compradores pagados · buscador · CSV · reenviar QR · anular | Exportar/gestionar compradores |
| **Promotores** | Ranking de rendimiento por código (solo lectura) | — (deriva a Resumen para crear) |
| **Accesos** | **Monitor de puerta en vivo**: aforo, adentro, falta ingresar, intentos rechazados | — (consulta en vivo) |
| **Revisar Yape** | Comprobantes pendientes + caja anti-fraude + Aprobar/Rechazar | Aprobar y emitir QR |
| **Reporte** | KPIs post-evento · por método · por tipo · por RR.PP. · imprimir PDF | Descargar PDF |

## 1.2 Diagnóstico priorizado

### 🔴 Confunde seguro

1. **Ocho pestañas planas sin agrupar.** 8 opciones al mismo nivel superan el umbral de ~4 decisiones de un vistazo. Pares casi idénticos por nombre: "Editar evento" vs "Editar entradas"; "Accesos" vs "Revisar Yape" vs "Clientes" (todos suenan a "ver gente").
2. **"Accesos" no es lo que su nombre dice, y el equipo está en otro lado.** La pestaña `Accesos` es un **monitor de asistencia en vivo**, pero el nombre sugiere gestión de permisos. La gestión real de validadores ("Staff de puerta") vive en la **home global** `/admin`, desconectada del evento. Dos conceptos de puerta partidos con nombres cruzados.
3. **Códigos de RR.PP.: se crean en un lugar, se miden en otro.** Crear código → acordeón colapsado en **Resumen**. Ver rendimiento → pestaña **Promotores**. Mismo concepto, dos nombres, dos ubicaciones. El propio empty state lo delata: *"Cargalos en la pestaña Resumen del evento."*

### 🟡 Mejorable

4. **"Editar evento" es un cajón de sastre.** Datos rutinarios + opciones checkout + Postergar + Clonar + **Cancelar (destructivo)** + **Cortesías** + Flyer + Archivar + Eliminar en una pantalla. Acciones raras/peligrosas junto a la edición diaria. **Cortesías** (emitir entradas gratis) no es "editar el evento".
5. **Yape aparece en tres superficies** (KPI Inicio → sección arriba de Resumen → pestaña "Revisar Yape"). Redundancia útil para no perder plata; solo vigilar que el conteo sea consistente.
6. **Sin prompt de "compartí tu link" cuando la venta es 0.** La tarjeta muestra "S/0 vendido" pero no invita a la acción obvia (compartir el link).

### 🟢 Bien como está — no tocar

- **El Inicio ya responde "¿cuánto vendí?, ¿Yapes esperando?, ¿qué me falta?" de un golpe.** 4 KPIs claros (incl. "Yape por revisar" clicable con color de alerta), checklist auto-derivada, grid con venta + badge Yape por tarjeta. Muy logrado.
- **Microcopy general de guía**: estados vacíos casi siempre con siguiente paso; confirms destructivos ejemplares (Cancelar pide teclear `CANCELAR`).
- **Caja anti-fraude de Revisar Yape** (4 campos + aviso de N° de operación repetido). No reordenar.
- **Registro admin**: consistente en voseo.

## 1.3 Propuesta de reorganización (sin cambiar funcionalidad)

**Agrupar las 8 pestañas en 4 grupos** (mismo contenido, reetiquetado + reubicado):

| Grupo | Contiene hoy | Cambios de IA (no de función) |
|---|---|---|
| **1. Mi evento** | Resumen · Editar evento · Editar entradas · Flyer | Resumen = landing. Flyer sale de "Editar evento". |
| **2. Ventas y pagos** | Revisar Yape · Clientes · Promotores · **Cortesías** | Mover **Cortesías** desde "Editar evento". **Unificar** creación de códigos (hoy en Resumen) con el ranking de "Promotores" en una sola pantalla. |
| **3. Puerta y equipo** | Accesos (renombrar) · **Staff de puerta** | Renombrar "Accesos" → **"En la puerta"**. Acercar la gestión de validadores (hoy en la home global) a este grupo. |
| **4. Reporte** | Reporte | Igual. |

**Aislar lo destructivo.** Postergar / Clonar / Cancelar / Archivar / Eliminar → bloque colapsado "Zona de gestión" al final de "Editar evento".

**Jerarquía por pantalla:** Resumen ya cumple (Yapes primero). Editar evento: datos arriba, avanzado/destructivo colapsado abajo, sacar Cortesías. Promotores: crear arriba + ranking abajo (un solo lugar).

**Microcopy sugerido:**
- Inicio con pendientes: **"Tenés 3 Yapes por revisar → Revisar ahora"** (línea con CTA directo).
- Evento publicado con 0 ventas: **"Aún no vendiste. Compartí tu link →"** (en vez de "S/0 vendido" frío).
- Pestaña renombrada **"En la puerta"** (encabezado "Control de puerta en vivo").
- Pestaña unificada **"Promotores"**: *"Creá códigos y mirá cuánto vendió cada RR.PP."*

---

# PARTE 2 — Experiencia del comprador con su entrada

## 2.1 Mapa actual

| Superficie | Archivo | Qué muestra |
|---|---|---|
| **Confirmación** (5 ramas) | `b/[brand]/[event]/confirmacion/page.tsx` | A. MP rechazado · B. Procesando/pendiente (poller) · C. Yape en revisión · D. Yape rechazado · E. Éxito |
| **Pedido** (todos los QR) | `b/[brand]/pedido/[orderId]/page.tsx` | Una tarjeta por ticket, cada una con su QR grande |
| **Ticket individual** | `b/[brand]/t/[uuid]/page.tsx` | QR grande + "Escanear en puerta" + descargar/WhatsApp/transferir |
| **Reenviar** | `b/[brand]/reenviar/page.tsx` | Form self-service para reenviar QR al email |
| **Puerta / Scan** | `/puerta`, `/scan` | Acceso staff por código + escáner 3 fases |
| **Email de entrega** | `lib/email/sendTicketEmail.ts` | HTML cálido, **sin QR** — solo botón "Ver mi entrada con QR →" |
| **.ics / calendario** | `.../confirmacion/AddToCalendar.tsx` | Botones "Agregar al calendario" / "Google Calendar" (solo en confirmación exitosa) |

**Rama E (éxito), orden vertical actual:** badge check → "¡Compra confirmada!" → **h1 "¡Tu entrada está lista!"** (lo más grande) → evento/fecha → **link permanente** (pill "Ver mi entrada →") → card "Resumen" → card "Antes de ir" (calendario + "Cómo llegar" + instrucciones) → botones soft (WhatsApp / "Ver mi QR") → nota "también te enviamos el QR por email… Reenviar".

## 2.2 Diagnóstico priorizado

### 🔴 Confunde seguro

1. **En la pantalla de "¡listo!", el QR no existe: es un enlace.** Lo primero y más grande es el **texto** "¡Tu entrada está lista!", no el QR. El QR no se renderiza aquí; hay que hacer un clic más para verlo. El comprador que pagó espera **ver su entrada**, no un enlace a su entrada.
2. **La pantalla de éxito tiene ~7 funciones, no una.** Compiten: link permanente, Resumen, calendario, "Cómo llegar", WhatsApp, "Ver mi QR" y "Reenviar". Hay **tres caminos al QR** (pill arriba, botón abajo, reenviar) y **ninguno lo muestra**.
3. **El email entierra el QR.** Sin imagen de QR; CTA "Ver mi entrada con QR →" e instrucción *"guardá este email o abrí tu entrada con el botón"*. No dice "mostrá esto en la puerta". En la puerta: abrir email → tocar botón → cargar web → recién ahí el QR. Un clic (y una carga) de más en el peor momento.

### 🟡 Mejorable

4. **La única instrucción de puerta está enterrada y lejos del QR.** *"Muestra tu QR en la puerta (desde el email o tu link permanente)"* aparece dentro de una lista, sin QR cerca.
5. **Inconsistencia de registro comprador.** Tuteo en confirmación/reenviar ("Pon", "Usa", "Muestra") vs voseo en email/puerta ("guardá", "abrí", "Ingresá").

### 🟢 Bien como está — no tocar

- **`/t/[uuid]` y `/pedido/[orderId]` sí muestran el QR como elemento dominante** ("Escanear en puerta", descargar, transferir). El destino es bueno; el problema es *llegar*.
- **La lógica de las 5 ramas de confirmación** es correcta y con buen copy tranquilizador. Solo se reordena la rama de éxito.
- **El escáner de puerta** (3 fases, offline, etiquetas VÁLIDO/YA USADO/RE-ENTRADA).

## 2.3 Propuesta de reorganización

**Rama de éxito → una sola función: QR + instrucción de 6 palabras.** Nuevo orden:
1. **El QR, grande y centrado, como primer elemento** (render del SVG que ya existe en `/t`). Multi-entrada: primer QR + *"Ver mis N entradas →"*.
2. Instrucción de 6 palabras: **"Mostrá este QR en la puerta."**
3. Nombre del evento · fecha (una línea).
4. **Todo lo demás baja** a bloque secundario más quieto: calendario, cómo llegar, reenviar, compartir, resumen, link permanente.

**Email → el QR arriba, con una línea** (decisión pendiente, ver memo de deliverability). Mínimo si no se embebe: que la confirmación web muestre el QR inline (ya resuelve el 80%).

**Microcopy:** "Mostrá este QR en la puerta." (junto al QR) · unificar a voseo en superficies de comprador.

---

# Recomendación de arranque y qué NO tocar

**Empezar por la Parte 2 — pantalla "¡listo!" + QR (mayor impacto, menor riesgo).** Es presentación pura: no toca dinero, auth, RLS ni las ramas de estado. Orden:
1. Confirmación éxito: QR inline arriba + instrucción de 6 palabras + demoter lo secundario.
2. Email: QR arriba (decidir tradeoff de embeber) o, mínimo, alinear la instrucción.
3. Admin: reagrupar 8 pestañas en 4 grupos + renombrar "Accesos" + unificar "Promotores/códigos" + sacar Cortesías de "Editar evento". IA/labels/reubicación, cero cambio funcional.

**Qué NO tocar (ya funciona):** el checkout v3 recién mergeado · el Inicio del admin (KPIs + checklist + grid) · la caja anti-fraude de Revisar Yape · la lógica de las 5 ramas de confirmación · el escáner de puerta y `/t` / `/pedido`.
