# ParyGo - Sistema de Gestion de Eventos y Entradas

## Descripcion General

ParyGo es una plataforma SaaS multi-marca para gestion de eventos, venta de entradas, control de acceso y gestion de promotores.

**Modelo de negocio:**
- **Super Admin (dueno):** Paul - dueno de ParyGo, vende el servicio a marcas/discotecas
- **Brand Admin (clientes):** Administradores de cada marca (discotecas, productoras)
- **Promotores:** Generan codigos de descuento/invitacion para sus clientes
- **Scanners:** Personal que escanea entradas en la puerta del evento
- **Clientes finales:** Compran entradas o reclaman codigos de promotores

---

## Estructura de Archivos

### Paginas HTML (raiz)
| Archivo | Funcion | Acceso |
|---------|---------|--------|
| `index.html` | Panel Admin principal | Super admin y Brand admin |
| `cliente.html` | Portal cliente - ver eventos, comprar entradas | Publico / Clientes |
| `promotor.html` | Portal promotores - generar codigos, ver estadisticas | Promotores |
| `scanner.html` | App escaneo QR - validar entradas | Staff scanner |
| `reclamar.html` | Reclamar codigo de promotor | Clientes |
| `ticket.html` | Vista de entrada compartida (via share_token) | Publico (solo lectura) |
| `public.html` | Reserva publica (usa localStorage, no Firebase) | Publico |
| `create-admin.html` | Crear administrador | Super admin |
| `migrate-admin.html` | Migrar administrador | Super admin |
| `migrate-promoter.html` | Migrar promotor | Admin |

### Archivos JavaScript (carpeta js/)
| Archivo | Funcion |
|---------|---------|
| `config.js` | Configuracion Firebase, constantes globales, roles, helpers de seguridad |
| `auth.js` | Autenticacion, login, logout, verificacion de roles |
| `logic.js` | Orquestador principal del admin, navegacion, eventos globales |
| `state.js` | Estado global de la aplicacion |
| `events.js` | CRUD de eventos, renderizado de cards |
| `brands.js` | CRUD de marcas |
| `tickets.js` | Gestion de tipos de entrada (precios, fases, colores) |
| `codes.js` | Gestion de codigos de promotores, aprobacion de pagos |
| `metrics.js` | Metricas y estadisticas de eventos |
| `staff.js` | Gestion de personal (promotores, scanners, admins) |
| `rewards.js` | Sistema de premios/recompensas |
| `promotor.js` | Logica del portal promotor (codigos, ganancias, metas) |
| `cliente.js` | Logica del portal cliente (eventos, compras, registro) |
| `utils.js` | Funciones utilitarias (validacion, toast, modales, sanitize) |
| `dni-api.js` | Consulta DNI en RENIEC (Peru) - wrapper de Cloud Function |

### Archivos JavaScript (raiz, independientes)
| Archivo | Funcion |
|---------|---------|
| `scanner.js` | Logica completa del scanner QR |
| `reclamar.js` | Logica de reclamar codigos de promotor |

### Utilidades (carpeta utils/)
| Archivo | Funcion |
|---------|---------|
| `brand-detector.js` | Deteccion de marca por subdominio, query param o path |

### Cloud Functions (carpeta functions/)
| Archivo | Funcion |
|---------|---------|
| `index.js` | 4 Cloud Functions (ver seccion Cloud Functions) |
| `package.json` | Dependencias: firebase-admin, firebase-functions, node-fetch |
| `.env` | Variable `RENIEC_TOKEN` (NO commitear) |

### Configuracion Firebase (carpeta firestore/)
| Archivo | Funcion |
|---------|---------|
| `firestore.rules` | Reglas de seguridad de Firestore (302 lineas) |
| `firestore.indexes.json` | Indices de Firestore |

### Estilos CSS
| Archivo | Funcion |
|---------|---------|
| `style.css` | Estilos del panel admin |
| `cliente.css` | Estilos del portal cliente |
| `promotor.css` | Estilos del portal promotor |
| `scanner.css` | Estilos del scanner |
| `reclamar.css` | Estilos de pagina reclamar |

### Configuracion del proyecto (raiz)
| Archivo | Funcion |
|---------|---------|
| `firebase.json` | Config de deployment: apunta a `firestore/` y `functions/` |
| `.firebaserc` | Proyecto Firebase: `parygo-da36a` |
| `package.json` | Dependencias raiz (Puppeteer para testing) |

### Assets
| Archivo/Carpeta | Funcion |
|-----------------|---------|
| `assets/logoparygo (1).png` | Logo principal de ParyGo |
| `assets/logos/logo.png` | Logo alternativo |
| `assets/logos/yape.png` | Logo Yape (metodo de pago) |
| `assets/logos/plin.png` | Logo Plin (metodo de pago) |

---

## Firebase

### Configuracion
- **Proyecto:** `parygo-da36a`
- **Auth Domain:** `parygo-da36a.firebaseapp.com`
- **Storage:** `parygo-da36a.firebasestorage.app`
- **SDK:** Firebase JS SDK v10.7.1 (via CDN gstatic)
- **Functions Runtime:** Node 20

### Cloud Functions

4 funciones desplegadas en Firebase Functions (`functions/index.js`):

| Funcion | Tipo | Auth | Descripcion |
|---------|------|------|-------------|
| `consultaDNI` | `onCall` | Requerida | Consulta DNI en RENIEC (para admin/promotor) |
| `consultaDNIPublic` | `onCall` | No | Consulta DNI publica (para reclamar.html) |
| `getSharedTicket` | `onCall` | No | Valida share_token y devuelve datos publicos del ticket |
| `generateShareToken` | `onCall` | Requerida | Genera token para compartir entrada (solo dueno del ticket) |

**Variables de entorno:**
- `RENIEC_TOKEN` - Token JWT para API de RENIEC (dniruc.apisperu.com)
- Configurar en `functions/.env` o con `firebase functions:config:set`

### Firestore Security Rules

Archivo: `firestore/firestore.rules` - Reglas completas con control de acceso por rol.

**Funciones auxiliares definidas:**
- `isAuthenticated()` - Usuario autenticado
- `isSuperAdmin()` - Existe en coleccion `empresa`
- `isBrandAdmin()` - Existe en coleccion `admins`
- `isStaff()` - Existe en coleccion `staff`
- `isAdminOrSuper()` - Super admin o brand admin

**Regla por defecto:** Denegar todo (`allow read, write: if false`)

### Colecciones Firestore

#### `empresa`
Super admin (dueno de ParyGo). Escritura bloqueada desde cliente.
```javascript
{
  email: "string",
  name: "string",
  is_super_admin: true,
  created_at: "timestamp"
}
```

#### `admins`
Administradores de marca (clientes de ParyGo)
```javascript
{
  email: "string",
  name: "string",
  role: "brand_admin",
  companyId: "string",
  allowed_brands: ["brand_id_1", "brand_id_2"],
  status: "ACTIVE" | "INACTIVE",
  created_at: "timestamp"
}
```

#### `staff`
Promotores y Scanners
```javascript
{
  email: "string",
  name: "string",
  lastname: "string",      // solo promotores
  dni: "string",            // solo promotores
  phone: "string",          // solo promotores
  role: "promoter" | "scanner",
  status: "ACTIVE" | "INACTIVE",
  company_id: "string",
  allowed_brands: ["brand_id"],
  photo: "base64",          // solo promotores
  created_at: "timestamp",
  created_by: "admin_uid"
}
```

#### `brands`
Marcas/Empresas (clientes). Lectura publica (portal cliente).
```javascript
{
  name: "string",
  slug: "string",           // para subdominio: hoesky.parygo.com
  logo: "base64",
  color: "#hex",
  owner_id: "admin_uid",
  status: "ACTIVE" | "INACTIVE",
  created_at: "timestamp"
}
```

#### `companies`
Compatibilidad con portal cliente. Lectura publica. Solo super admin escribe.
```javascript
{
  // Misma estructura que brands (fallback para subdominios)
  slug: "string",
  name: "string"
}
```

#### `events`
Eventos. Lectura publica (portal cliente).
```javascript
{
  name: "string",
  brand_id: "string",
  company_id: "string",
  image: "base64",          // flyer
  date: "YYYY-MM-DD",
  time: "HH:MM",
  location: "string",
  address: "string",
  description: "string",
  status: "ACTIVE" | "PAUSED" | "FINISHED",
  tickets: [                // tipos de entrada
    {
      name: "General",
      price: 50,
      priceMode: "FREE" | "FIXED" | "PHASES",
      color: "#hex",
      claim_until: "YYYY-MM-DD",
      valid_until: "YYYY-MM-DD",
      promoter_enabled: true,
      promoter_free: false,
      promoter_goal: 100
    }
  ],
  created_at: "timestamp"
}
```

#### `tickets`
Entradas vendidas/generadas
```javascript
{
  event_id: "string",
  brand_id: "string",
  code: "string",           // codigo unico
  qr_token: "string",       // token para QR
  qr_data: "string",        // datos del QR
  type: "string",           // tipo de entrada
  ticket_type: "string",
  price: number,
  status: "PENDING" | "CLAIMED" | "SCANNED" | "CANCELLED",
  user_id: "string",        // uid del comprador
  client_name: "string",
  client_dni: "string",
  client_email: "string",
  client_phone: "string",
  promoter_id: "string",    // si fue por promotor
  promoter_name: "string",
  claimed_by: { name, dni, email, phone },
  claimed_at: "timestamp",
  scanned_at: "timestamp",
  scanned_by: "string",
  share_token: "string",    // token para compartir (generado por Cloud Function)
  share_token_created_at: "string",
  created_at: "timestamp"
}
```

#### `quotas`
Cuotas de codigos para promotores
```javascript
{
  event_id: "string",
  promoter_id: "string",
  ticket_type: "string",
  quantity: number,
  used: number,
  created_at: "timestamp"
}
```

#### `codes`
Codigos de promotores (sistema legacy)
```javascript
{
  code: "string",           // codigo unico generado
  event_id: "string",
  promoter_id: "string",
  ticket_type: "string",
  status: "ACTIVE" | "USED",
  created_at: "timestamp"
}
```

#### `promotorCodes`
Codigos de promotores (sistema nuevo con flujo de pago)
```javascript
{
  code: "string",
  event_id: "string",
  promoter_id: "string",
  promoter_name: "string",
  ticket_type: "string",
  price: number,
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED",
  payment_status: "string",
  created_at: "timestamp"
}
```

#### `sales`
Ventas realizadas
```javascript
{
  event_id: "string",
  ticket_id: "string",
  amount: number,
  payment_method: "string",
  channel: "web" | "promoter" | "door",
  client_id: "string",
  created_at: "timestamp"
}
```

#### `clientes`
Usuarios finales del portal cliente. Lectura publica (busqueda por DNI pre-auth).
```javascript
{
  uid: "string",            // Firebase Auth UID
  dni: "string",
  name: "string",
  email: "string",
  phone: "string",
  brand_id: "string",
  created_at: "timestamp"
}
```

#### `purchases`
Historial de compras/reservas
```javascript
{
  user_id: "string",
  event_id: "string",
  ticket_id: "string",
  amount: number,
  created_at: "timestamp"
}
```

#### `users`
Perfiles globales de usuario
```javascript
{
  // Perfil basico del usuario autenticado
  email: "string",
  name: "string",
  created_at: "timestamp"
}
```

#### `user_profiles`
Perfiles de usuario por marca
```javascript
{
  user_id: "string",
  brand_id: "string",
  name: "string",
  dni: "string",
  created_at: "timestamp"
}
```

#### `accesos`
Registros de acceso/entrada a eventos (creado por scanner). Solo admins y staff.

#### `accesses`
Registros de acceso (usado en reclamar.js)

#### `rewards`
Sistema de premios
```javascript
{
  event_id: "string",
  name: "string",
  description: "string",
  quantity: number,
  claimed: number,
  status: "ACTIVE" | "INACTIVE"
}
```

---

## Sistema de Roles

### Super Admin (empresa)
- **Acceso:** TODO el sistema
- **Puede:** Ver todas las marcas, todos los eventos, crear/editar/eliminar admins, crear marcas, aprobar pagos de promotores
- **Identificacion:** `is_super_admin: true` o existe en coleccion `empresa`
- **Firestore:** Escritura bloqueada desde cliente (solo backend)

### Brand Admin (admins)
- **Acceso:** Solo su marca y datos relacionados
- **Puede:** Ver/crear/editar eventos, gestionar promotores y scanners, ver metricas, aprobar/rechazar codigos de promotores
- **Identificacion:** `role: "brand_admin"` en coleccion `admins`

### Promotor (staff)
- **Acceso:** Portal promotor (`promotor.html`)
- **Puede:** Ver eventos asignados, generar codigos segun cuota, ver ganancias y metas, crear codigos con flujo de pago
- **Identificacion:** `role: "promoter"` en coleccion `staff`
- **Login:** Por DNI (busca en `staff` donde `dni == input`)

### Scanner (staff)
- **Acceso:** App scanner (`scanner.html`)
- **Puede:** Ver eventos asignados, escanear QR, buscar por DNI o codigo, validar entradas
- **Identificacion:** `role: "scanner"` en coleccion `staff`

---

## Dominios y Subdominios

### Configuracion actual
- **Dominio principal:** `parygo.com`
- **Cloudflare Pages:** `parygo.pages.dev`
- **DNS Wildcard:** `*.parygo.com` -> `parygo.pages.dev`

### Estructura de URLs
| URL | Destino | Funcion |
|-----|---------|---------|
| `parygo.com` | index.html | Panel Admin |
| `parygo.com/scanner.html` | scanner.html | Scanner general |
| `hoesky.parygo.com` | cliente.html | Portal cliente de Hoesky |
| `hoesky.parygo.com/promotor.html` | promotor.html | Promotores de Hoesky |
| `hoesky.parygo.com/reclamar.html` | reclamar.html | Reclamar codigo Hoesky |
| `parygo.com/ticket.html?id=X&token=Y` | ticket.html | Entrada compartida |

### Deteccion de subdominio
Implementado en `utils/brand-detector.js`:
```javascript
// Produccion: hoesky.parygo.com -> "hoesky"
// Desarrollo: localhost?brand=hoesky -> "hoesky"
import { detectBrandSlug, loadBrandBySlug } from '../utils/brand-detector.js';
```

Fallback de marca: busca en `brands` por slug -> `companies` por slug -> ID directo.

---

## Estilos y Diseno

### Colores
```css
--bg-primary: #0d0d0d;      /* Fondo principal */
--bg-secondary: #1a1a1a;    /* Cards, contenedores */
--border: #2a2a2a;          /* Bordes */
--accent: #ff4757;          /* Color principal (rosa/rojo) */
--success: #22c55e;         /* Verde exito */
--error: #ef4444;           /* Rojo error */
--warning: #f59e0b;         /* Amarillo advertencia */
--text: #ffffff;            /* Texto principal */
--text-muted: #666666;      /* Texto secundario */
```

### Tipografia
- **Font:** Outfit (Google Fonts)
- **Weights:** 400, 500, 600, 700, 800

### Responsive
- **Mobile first:** Optimizado para iPhone
- **Breakpoint:** 768px
- **Desktop:** Sidebar izquierdo fijo
- **Mobile:** Menu inferior (Eventos, Marca, Promo, Extras)

### Componentes Mobile
- Header fijo con logo, busqueda y perfil
- Menu inferior con 4 opciones
- Panel Extras (slide desde derecha, pantalla completa)
- FAB (boton flotante) para crear evento
- Pull to refresh
- Swipe para volver (iOS style)
- History API para navegacion con boton atras del navegador

---

## Flujos Principales

### Login Admin
1. Usuario entra a `parygo.com`
2. Ingresa email y contrasena
3. Sistema busca en `empresa` (super admin) o `admins` (brand admin)
4. Verifica rol y estado
5. Redirige al dashboard

### Login Promotor
1. Promotor entra a `[marca].parygo.com/promotor.html`
2. Ingresa DNI
3. Sistema busca en `staff` con `role: "promoter"` y `dni == input`
4. Muestra eventos de sus marcas asignadas con ganancias y metas

### Login Scanner
1. Usuario entra a `parygo.com/scanner.html`
2. Ingresa email y contrasena
3. Sistema busca en `staff` con `role: "scanner"`
4. Verifica marca asignada
5. Muestra eventos de su marca

### Compra de Entrada (cliente)
1. Cliente entra a `[marca].parygo.com`
2. Ve eventos de esa marca
3. Selecciona evento y tipo de entrada
4. Completa datos personales (DNI autocompletado via RENIEC)
5. Paga (integracion pendiente)
6. Recibe QR y puede compartir entrada via share_token

### Flujo de Codigos de Promotor (nuevo)
1. Promotor genera codigo desde su portal
2. Si la entrada tiene costo, codigo queda en estado `PENDING`
3. Admin ve codigos pendientes en panel "Pagos" del admin
4. Admin aprueba o rechaza el codigo
5. Codigo aprobado puede ser reclamado por el cliente

### Reclamar Codigo
1. Cliente recibe codigo de promotor
2. Entra a `[marca].parygo.com/reclamar.html`
3. Ingresa codigo y DNI
4. Sistema busca en `promotorCodes` (nuevo) y `codes` (legacy)
5. Genera entrada con QR

### Compartir Entrada
1. Cliente con ticket genera share_token via Cloud Function `generateShareToken`
2. Comparte link: `parygo.com/ticket.html?id=TICKET_ID&token=TOKEN`
3. Cloud Function `getSharedTicket` valida token y devuelve solo datos publicos
4. Vista muestra evento, tipo, QR (sin datos personales del comprador)

### Escaneo de Entrada
1. Scanner selecciona evento
2. Escanea QR o busca por DNI/codigo
3. Sistema muestra datos del cliente
4. Scanner aprueba o rechaza
5. Se marca como SCANNED en Firebase

---

## Problemas Conocidos

### Seguridad
- Funciones duplicadas: `escapeHtml` existe en utils.js, cliente.js, promotor.js, reclamar.js

### Pendientes
- Pasarela de pago (integracion)
- Notificaciones push
- PWA completa

---

## Deployment

### Cloudflare Pages
- **Repositorio:** `github.com/polsitof19/ParyGo`
- **Build:** No requiere build (HTML/CSS/JS vanilla)
- **Output:** Raiz del proyecto

### Firebase
```bash
# Desplegar reglas de Firestore
firebase deploy --only firestore:rules

# Desplegar indices de Firestore
firebase deploy --only firestore:indexes

# Desplegar Cloud Functions
firebase deploy --only functions

# Desplegar todo Firebase
firebase deploy
```

### Variables de entorno (Cloud Functions)
```bash
# El token RENIEC se configura en functions/.env
# O via Firebase config:
firebase functions:config:set reniec.token="TU_TOKEN"
```

---

## Dependencias

### Raiz (`package.json`)
- `puppeteer` (devDependency) - Testing con navegador headless

### Cloud Functions (`functions/package.json`)
- `firebase-admin` ^11.11.0
- `firebase-functions` ^4.5.0
- `node-fetch` ^2.7.0
- **Runtime:** Node 20

### CDN (cargados en HTML)
- Firebase JS SDK v10.7.1
- Font Awesome 6.5.1
- Google Fonts (Outfit)
- QRCode.js (generacion de QR)

---

## Constantes de la Aplicacion

Definidas en `js/config.js` → `APP_CONFIG`:

```javascript
APP_CONFIG.ROLES    // SUPER_ADMIN, BRAND_ADMIN, ADMIN, PROMOTER, SCANNER
APP_CONFIG.COLLECTIONS  // EMPRESA, ADMINS, STAFF, BRANDS, EVENTS, TICKETS, QUOTAS, SALES, REWARDS
APP_CONFIG.STATUS   // ACTIVE, INACTIVE, PENDING, APPROVED, REJECTED, SCANNED, DELIVERED
APP_CONFIG.LIMITS   // MAX_IMAGE_SIZE (5MB), MAX_LOGO_SIZE (2MB), MAX_CODES_PER_BATCH (1000), MIN_PASSWORD_LENGTH (6)
```

Helpers de seguridad exportados:
- `isSuperAdminRole(user)` - Verifica si es super admin
- `hasPermissionForBrand(user, brandId)` - Verifica permiso sobre marca

---

## Reglas para Claude Code

### SIEMPRE
- Mantener diseno responsive (desktop y movil)
- Seguir la paleta de colores existente
- Hacer commits descriptivos en espanol
- Probar cambios antes de push
- Respetar la estructura de archivos existente

### NUNCA
- Eliminar funcionalidades existentes sin confirmar
- Cambiar la configuracion de Firebase
- Modificar datos de produccion
- Hardcodear credenciales nuevas
- Romper el flujo de autenticacion
- Modificar `firestore/firestore.rules` sin confirmar impacto

### PREFERIR
- Editar archivos existentes vs crear nuevos
- Reutilizar funciones de `utils.js`
- Usar constantes de `APP_CONFIG` en `config.js`
- CSS mobile-first
- Nombres descriptivos en espanol para UI
- Cloud Functions para logica sensible (tokens, APIs externas)
- `utils/brand-detector.js` para deteccion de marca

---

## Comandos Utiles
```bash
# Git
git status
git checkout -b feature/nombre
git add .
git commit -m "descripcion del cambio"
git push origin nombre-rama

# Firebase
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy

# Testing local
# Abrir con Live Server o similar (requiere HTTPS para Firebase Auth)
```

---

## Contacto

- **Proyecto:** ParyGo
- **Dueno:** Paul
- **Repo:** github.com/polsitof19/ParyGo
- **Stack:** HTML, CSS, JavaScript vanilla, Firebase (Auth + Firestore + Functions)
- **Hosting:** Cloudflare Pages (frontend) + Firebase Functions (backend)
- **Dominio:** parygo.com
