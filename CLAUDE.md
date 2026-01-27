# 🎉 ParyGo - Sistema de Gestión de Eventos y Entradas

## 📋 Descripción General

ParyGo es una plataforma SaaS multi-marca para gestión de eventos, venta de entradas, control de acceso y gestión de promotores.

**Modelo de negocio:**
- **Super Admin (dueño):** Paul - dueño de ParyGo, vende el servicio a marcas/discotecas
- **Brand Admin (clientes):** Administradores de cada marca (discotecas, productoras)
- **Promotores:** Generan códigos de descuento/invitación para sus clientes
- **Scanners:** Personal que escanea entradas en la puerta del evento
- **Clientes finales:** Compran entradas o reclaman códigos de promotores

---

## 🗂️ Estructura de Archivos

### Páginas HTML
| Archivo | Función | Acceso |
|---------|---------|--------|
| `index.html` | Panel Admin principal | Super admin y Brand admin |
| `cliente.html` | Portal cliente - ver eventos, comprar entradas | Público / Clientes |
| `promotor.html` | Portal promotores - generar códigos, ver estadísticas | Promotores |
| `scanner.html` | App escaneo QR - validar entradas | Staff scanner |
| `reclamar.html` | Reclamar código de promotor | Clientes |
| `public.html` | Reserva pública (usa localStorage, no Firebase) | Público |
| `create-admin.html` | Crear administrador | Super admin |
| `migrate-admin.html` | Migrar administrador | Super admin |
| `migrate-promoter.html` | Migrar promotor | Admin |

### Archivos JavaScript (carpeta js/)
| Archivo | Función |
|---------|---------|
| `config.js` | Configuración Firebase, constantes globales, roles |
| `auth.js` | Autenticación, login, logout, verificación de roles |
| `logic.js` | Orquestador principal del admin, navegación, eventos globales |
| `state.js` | Estado global de la aplicación |
| `events.js` | CRUD de eventos, renderizado de cards |
| `brands.js` | CRUD de marcas |
| `tickets.js` | Gestión de tickets/entradas |
| `codes.js` | Generación de códigos para promotores |
| `metrics.js` | Métricas y estadísticas de eventos |
| `staff.js` | Gestión de personal (promotores, scanners, admins) |
| `rewards.js` | Sistema de premios/recompensas |
| `promoters.js` | Lógica específica de promotores |
| `utils.js` | Funciones utilitarias (validación, toast, modales) |
| `api.js` | Servicios externos (WhatsApp, exportación) |
| `dni-api.js` | Consulta DNI en RENIEC (Perú) |
| `register.js` | Registro de usuarios |
| `access.js` | ⚠️ CÓDIGO MUERTO - No se usa |

### Archivos Scanner (separados)
| Archivo | Función |
|---------|---------|
| `scanner.js` | Lógica completa del scanner QR |
| `scanner.css` | Estilos del scanner |
| `scanner.html` | Interfaz del scanner |

### Estilos CSS
| Archivo | Función |
|---------|---------|
| `style.css` | Estilos del panel admin |
| `cliente.css` | Estilos del portal cliente |
| `promotor.css` | Estilos del portal promotor |
| `scanner.css` | Estilos del scanner |
| `reclamar.css` | Estilos de página reclamar |

### Otros
| Archivo/Carpeta | Función |
|-----------------|---------|
| `assets/` | Logo e imágenes |
| `assets/logo.png` | Logo de ParyGo |

---

## 🔥 Firebase

### Configuración
- **Proyecto:** `parygo-da36a`
- **Auth Domain:** `parygo-da36a.firebaseapp.com`
- **Storage:** `parygo-da36a.firebasestorage.app`

### Colecciones Firestore

#### `empresa`
Super admin (dueño de ParyGo)
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
  companyId: "string", // ID de su empresa
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
  lastname: "string", // solo promotores
  dni: "string", // solo promotores
  phone: "string", // solo promotores
  role: "promoter" | "scanner",
  status: "ACTIVE" | "INACTIVE",
  company_id: "string",
  allowed_brands: ["brand_id"],
  photo: "base64", // solo promotores
  created_at: "timestamp",
  created_by: "admin_uid"
}
```

#### `brands`
Marcas/Empresas (clientes)
```javascript
{
  name: "string",
  slug: "string", // para subdominio: hoesky.parygo.com
  logo: "base64",
  color: "#hex",
  owner_id: "admin_uid",
  status: "ACTIVE" | "INACTIVE",
  created_at: "timestamp"
}
```

#### `events`
Eventos
```javascript
{
  name: "string",
  brand_id: "string",
  company_id: "string",
  image: "base64", // flyer
  date: "YYYY-MM-DD",
  time: "HH:MM",
  location: "string",
  address: "string",
  description: "string",
  status: "ACTIVE" | "PAUSED" | "FINISHED",
  ticket_types: [
    { name: "General", price: 50, stock: 100 },
    { name: "VIP", price: 100, stock: 50 }
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
  code: "string", // código único
  qr_token: "string", // token para QR
  type: "string", // tipo de entrada
  price: number,
  status: "PENDING" | "CLAIMED" | "SCANNED" | "CANCELLED",
  client_name: "string",
  client_dni: "string",
  client_email: "string",
  client_phone: "string",
  promoter_id: "string", // si fue por promotor
  promoter_name: "string",
  claimed_by: { name, dni, email, phone },
  claimed_at: "timestamp",
  scanned_at: "timestamp",
  scanned_by: "string",
  created_at: "timestamp"
}
```

#### `quotas`
Cuotas de códigos para promotores
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

#### `sales`
Ventas realizadas
```javascript
{
  event_id: "string",
  ticket_id: "string",
  amount: number,
  payment_method: "string",
  channel: "web" | "promoter" | "door",
  created_at: "timestamp"
}
```

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

## 👥 Sistema de Roles

### Super Admin (empresa)
- **Acceso:** TODO el sistema
- **Puede:**
  - Ver todas las marcas
  - Ver todos los eventos
  - Crear/editar/eliminar admins de marca
  - Crear marcas
  - Acceder a cualquier dato
- **Identificación:** `is_super_admin: true` o `collection: "empresa"`

### Brand Admin (admins)
- **Acceso:** Solo su marca y datos relacionados
- **Puede:**
  - Ver/crear/editar eventos de su marca
  - Gestionar promotores de su marca
  - Gestionar scanners de su marca
  - Ver métricas de sus eventos
- **Identificación:** `role: "brand_admin"` en colección `admins`

### Promotor (staff)
- **Acceso:** Portal promotor
- **Puede:**
  - Ver eventos de las marcas asignadas
  - Generar códigos según su cuota
  - Ver sus estadísticas
- **Identificación:** `role: "promoter"` en colección `staff`

### Scanner (staff)
- **Acceso:** App scanner
- **Puede:**
  - Ver eventos de las marcas asignadas
  - Escanear QR y validar entradas
  - Buscar por DNI o código
- **Identificación:** `role: "scanner"` en colección `staff`

---

## 🌐 Dominios y Subdominios

### Configuración actual
- **Dominio principal:** `parygo.com`
- **Cloudflare Pages:** `parygo.pages.dev`
- **DNS Wildcard:** `*.parygo.com` → `parygo.pages.dev`

### Estructura de URLs
| URL | Destino | Función |
|-----|---------|---------|
| `parygo.com` | index.html | Panel Admin |
| `parygo.com/scanner.html` | scanner.html | Scanner general |
| `hoesky.parygo.com` | cliente.html | Portal cliente de Hoesky |
| `hoesky.parygo.com/promotor.html` | promotor.html | Promotores de Hoesky |
| `hoesky.parygo.com/reclamar.html` | reclamar.html | Reclamar código Hoesky |

### Detección de subdominio
```javascript
function getBrandFromSubdomain() {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[1] === 'parygo') {
        return parts[0].toLowerCase(); // "hoesky"
    }
    return null;
}
```

---

## 🎨 Estilos y Diseño

### Colores
```css
--bg-primary: #0d0d0d;      /* Fondo principal */
--bg-secondary: #1a1a1a;    /* Cards, contenedores */
--border: #2a2a2a;          /* Bordes */
--accent: #ff4757;          /* Color principal (rosa/rojo) */
--success: #22c55e;         /* Verde éxito */
--error: #ef4444;           /* Rojo error */
--warning: #f59e0b;         /* Amarillo advertencia */
--text: #ffffff;            /* Texto principal */
--text-muted: #666666;      /* Texto secundario */
```

### Tipografía
- **Font:** Outfit (Google Fonts)
- **Weights:** 400, 500, 600, 700, 800

### Responsive
- **Mobile first:** Optimizado para iPhone
- **Breakpoint:** 768px
- **Desktop:** Sidebar izquierdo fijo
- **Mobile:** Menú inferior (Eventos, Marca, Promo, Extras)

### Componentes Mobile
- Header fijo con logo, búsqueda y perfil
- Menú inferior con 4 opciones
- Panel Extras (slide desde derecha, pantalla completa)
- FAB (botón flotante) para crear evento
- Pull to refresh
- Swipe para volver (iOS style)

---

## 📱 Flujos Principales

### Login Admin
1. Usuario entra a `parygo.com`
2. Ingresa email y contraseña
3. Sistema busca en `empresa` (super admin) o `admins` (brand admin)
4. Verifica rol y estado
5. Redirige al dashboard

### Login Scanner
1. Usuario entra a `parygo.com/scanner.html`
2. Ingresa email y contraseña
3. Sistema busca en `staff` con `role: "scanner"`
4. Verifica marca asignada
5. Muestra eventos de su marca

### Compra de Entrada (cliente)
1. Cliente entra a `[marca].parygo.com`
2. Ve eventos de esa marca
3. Selecciona evento y tipo de entrada
4. Completa datos personales
5. Paga (integración pendiente)
6. Recibe QR por email

### Reclamar Código (promotor)
1. Cliente recibe código de promotor
2. Entra a `[marca].parygo.com/reclamar.html`
3. Ingresa código y DNI
4. Sistema valida cuota del promotor
5. Genera entrada con QR

### Escaneo de Entrada
1. Scanner selecciona evento
2. Escanea QR o busca por DNI/código
3. Sistema muestra datos del cliente
4. Scanner aprueba o rechaza
5. Se marca como SCANNED en Firebase

---

## ⚠️ Problemas Conocidos

### Seguridad
- `APIS_PERU_TOKEN` expuesto en frontend (config.js línea 38)
- Falta archivo `firestore.rules` en el repo
- Control de acceso solo client-side

### Código
- `js/access.js` es código muerto (no se usa)
- `js/tickets.js` línea 99: variable `tk` no definida
- Muchos `console.log` en producción
- Funciones duplicadas: `escapeHtml`, validación email, validación DNI

### Pendientes
- Sistema de subdominios (en desarrollo)
- Pasarela de pago
- Notificaciones push
- PWA completa

---

## ✅ Reglas para Claude Code

### SIEMPRE
- Mantener diseño responsive (desktop y móvil)
- Seguir la paleta de colores existente
- Hacer commits descriptivos en español
- Probar cambios antes de push
- Respetar la estructura de archivos existente

### NUNCA
- Eliminar funcionalidades existentes sin confirmar
- Cambiar la configuración de Firebase
- Modificar datos de producción
- Hardcodear credenciales nuevas
- Romper el flujo de autenticación

### PREFERIR
- Editar archivos existentes vs crear nuevos
- Reutilizar funciones de `utils.js`
- Usar constantes de `config.js`
- CSS mobile-first
- Nombres descriptivos en español para UI

---

## 🚀 Comandos Útiles
```bash
# Ver estado de git
git status

# Crear rama para feature
git checkout -b feature/nombre

# Commit con mensaje
git add .
git commit -m "descripción del cambio"

# Push a GitHub
git push origin nombre-rama

# Volver a main
git checkout main
git pull
```

---

## 📞 Contacto

- **Proyecto:** ParyGo
- **Dueño:** Paul
- **Stack:** HTML, CSS, JavaScript vanilla, Firebase
- **Hosting:** Cloudflare Pages
- **Dominio:** parygo.com
```
