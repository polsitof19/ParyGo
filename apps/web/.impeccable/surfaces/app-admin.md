---
version: 1
slug: "app-admin"
primary_target: "app/admin"
related_targets: ["app/cabina-7k29x"]
---

# Paneles (organizador + super admin)

Modo: Operate. Organizador desde el teléfono (también de noche, en la puerta);
super admin desde escritorio y teléfono. Tareas: ver cómo va la venta, aprobar
Yapes, compartir el link / RR.PP., puerta y equipo. Referencia visual aprobada
por Paul el 2026-09-23: "Panel organizador ParyGo.html" (Downloads), que
reemplaza la maqueta en blanco.

## Direction contract

THESIS: el panel es el evento que viene. Arriba lo pendiente (Yapes), después
el próximo evento con su flyer, tres cifras y dos botones, y debajo filas de
acciones agrupadas por para qué sirven (Asistentes · Venta). Rechaza el
dashboard de tarjetas de métricas y la grilla de acciones sin agrupar.

OWN-WORLD: tema noche, los tokens de .pg.pg-noche (la referencia usaba
#151515/#FAFAFA/#8F8F8F; se tomaron los ya medidos). Fondo #0A0A0A,
superficie #141414, hairline blanco .12, tinta #FFFFFF, secundario #A3A3A3; verde #4ADE80 (ok), ámbar #FBBF24 (aviso),
naranja #FF5B1F solo en puntos/badges. Geist 600 en títulos (24 teléfono / 36
escritorio, tracking -0.025em), filas de 52 con hairline, primario = relleno
#FAFAFA con texto #0A0A0A radio 10 alto 48, secundario = borde #1F1F1F.
Etiquetas de grupo 13/500 en minúscula normal, nunca mayúsculas espaciadas.

STORY: el organizador abre y sabe en un vistazo si hay Yapes esperando, cómo
va su próximo evento y qué hacer; aprueba en dos toques; el super admin ve qué
marca necesita algo.

FIRST VIEWPORT: teléfono = cabecera de 60 (logo, marca, salir); fila
"N Yapes por aprobar" en #151515 si hay; flyer 100×120 + nombre + fecha +
estado; cifras cobrado · vendidas · cortesías con barra de aforo que abre
"Cómo va la venta" (cobrado primero); Abrir escáner (primario) y Copiar link; barra fija abajo
Eventos · Escáner · Equipo · Mi marca. Escritorio = barra lateral de 248 con
la misma navegación.

FORM: referencia del usuario, sobre la estructura 4 de 7 (lista y detalle en
escritorio). Seed key c34d8c74.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
