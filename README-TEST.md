# Reporte de Pruebas - cliente.html

## Resumen de Pruebas con Puppeteer

**Fecha:** 2026-01-27
**Página probada:** cliente.html?brand=code
**Resultado:** ✅ TODAS LAS PRUEBAS PASARON EXITOSAMENTE

## Funciones Globales Verificadas

Todas las siguientes funciones están correctamente disponibles en el objeto `window`:

### Autenticación (4 funciones)
- ✅ `handleLogin` - Procesar login de usuario
- ✅ `handleRegister` - Procesar registro de usuario
- ✅ `showRegisterScreen` - Mostrar pantalla de registro
- ✅ `showLoginScreen` - Mostrar pantalla de login

### Navegación (4 funciones)
- ✅ `showEvents` - Mostrar lista de eventos
- ✅ `backToEvents` - Volver a lista de eventos
- ✅ `openMyTickets` - Abrir mis entradas
- ✅ `openEventDetail` - Abrir detalle de evento

### Gestión de Tickets (2 funciones)
- ✅ `switchTicketTab` - Cambiar entre tabs de tickets
- ✅ `redeemCode` - Reclamar código de promotor

### Perfil (2 funciones)
- ✅ `openProfile` - Abrir perfil de usuario
- ✅ `doLogout` - Cerrar sesión

### Modales y Compra (2 funciones)
- ✅ `openBuyModal` - Abrir modal de compra
- ✅ `closeModal` - Cerrar modal

## Resultados de la Prueba

| Métrica | Valor |
|---------|-------|
| Funciones verificadas | 14 |
| Funciones disponibles | 14 ✅ |
| Funciones faltantes | 0 ✅ |
| Errores de consola | 0 ✅ |
| Errores de página | 0 ✅ |

## Recursos Cargados

- ✅ cliente.html (24 KB)
- ✅ cliente.css (25 KB)
- ✅ js/cliente.js (56 KB)
- ✅ assets/logo.png (357 KB)

## Recursos Externos Bloqueados (esperado)

Los siguientes recursos externos fueron bloqueados por ORB (Opaque Response Blocking), lo cual es normal en un entorno de prueba sin credenciales:

- QRCode.js (CDN)
- Imágenes de Yape/Plin
- Firestore connection (sin auth)

## Conclusión

✅ El archivo `js/cliente.js` está correctamente configurado como módulo ES6 y exporta todas las funciones necesarias al objeto global `window`. Los atributos `onclick` en el HTML funcionarán correctamente.

## Cómo ejecutar las pruebas

```bash
cd "C:\Users\pauls\Desktop\nuevo admin\ParyGo"
node test-cliente.js
```

## Requisitos

- Node.js instalado
- Puppeteer (`npm install puppeteer --save-dev`)
