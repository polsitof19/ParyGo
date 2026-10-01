# Lo que marketing necesita del producto

Se trabaja desde la raíz del repo (con sus reglas de deploy y pruebas), no desde esta carpeta.

## Urgente: la landing afirma cosas que no son verdad (auditoría 2026-09-30, verificado)
- [ ] `apps/landing/components/sections/Cobros.tsx` marca Tarjetas y Mercado Pago como "Disponible" (`ya: true`); hoy las ENTRADAS solo se cobran con Yape. Pasarlos a "Próximamente" y corregir FAQ y seguridad en `apps/landing/lib/i18n.ts` (líneas ~72, 76, 100-102, 123, 205-206 y sus EN).
- [ ] Pie "© 2015 ParyGo" (`i18n.ts` 225 y 422): sugiere 11 años de trayectoria. Cambiar a 2026 salvo que Paul pueda probar 2015.
- [ ] "Cada QR válido una sola vez" en 5 lugares por idioma: la regla pide no prometerlo (vendrá la entrada grupal).
- [ ] Paul decide si cumple o se quitan: "Soporte prioritario", "Acompañamiento personalizado", "Configuración guiada por videollamada" (`precios.perks`).

## Para poder medir
- [ ] Analítica en la landing (no hay ninguna): Cloudflare Web Analytics o Plausible.
- [ ] Guardar el UTM de origen en el alta (/empezar) para saber qué canal trae cada pack.

## Para vender mejor
- [ ] Marca DEMO pública (is_test) con un evento ficticio para grabar videos y hacer demos (nunca Code ni Hoesky).
- [ ] Meta title/description nuevos, imagen OG en inglés, evento privado visible en el hero y en /empezar (ver `auditorias/2026-09-30-landing.md`).
- [ ] Páginas nuevas para SEO: /evento-privado, /ticketera-sin-comision (y sus EN).
- [ ] Secuencia de correos para altas abandonadas (necesita un cron; ver `campanas/2026-10-primeros-clientes/plan.md` §4).

## Para vender afuera
- [ ] Cobro de entradas con tarjeta (MP por marca: 4 bugs a cerrar antes), moneda y zona horaria por marca, página del comprador en inglés.
