// ==========================================
// PARYGO CLIENTE - PORTAL MULTI-MARCA v5.0.0
// Sistema de subdominios: code.parygo.com
// ==========================================

// ARQ-3 FIX: Importar Firebase desde config.js centralizado (sin duplicar init)
import { db, auth, functions as cloudFunctions, storage } from './config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection,
    addDoc,
    getDocs,
    onSnapshot,
    query,
    where,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import {
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { escapeHtml, toast, logger, createRateLimiter, initErrorMonitor } from './utils.js';

// MEJORA 4: Rate limiters
const searchDocRateLimit = createRateLimiter(5, 60000);  // max 5 búsquedas doc/min
const dniRateLimit = createRateLimiter(5, 60000);        // max 5 consultas DNI/min

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentUser = null;         // Usuario de Firebase Auth
let currentUserProfile = null;  // Perfil específico de esta marca
let currentBrandSlug = null;    // Slug del subdominio (ej: "code")
let currentBrandId = null;      // ID de la marca en Firestore
let currentBrand = null;        // Datos completos de la marca
let allEvents = [];
let currentEvent = null;
let myTickets = [];
let myPurchases = [];
let currentTicketTab = 'upcoming';
let ticketQROrigin = 'myTicketsView'; // v5.0.0 - Track where user came from
let viewingTicket = null;
let carouselIndices = [];   // v7.2.0 - Indices globales de tickets en carrusel
let carouselCurrent = 0;    // v7.2.0 - Slide actual del carrusel
let carouselOrigin = 'myTicketsView'; // v7.3.0 - Vista de origen del carrusel
let sharingTicket = null;   // v7.2.0 - Ticket seleccionado para compartir
let favorites = JSON.parse(localStorage.getItem('parygo_favorites') || '[]');
let currentViewId = null; // Tracking para History API - evitar pushState duplicados
let handlingPopstate = false; // Flag para evitar pushState durante popstate

// Estado de compra
let buyState = {
    ticketType: null,
    quantity: 1,
    unitPrice: 0,
    total: 0,
    paymentMethod: 'yape'
};

// Tipo de documento
let selectedDocType = 'DNI';
let foundUserData = null;
let existingUserNeedsProfile = false;
let isProcessing = false;
let isRegistering = false; // Flag para evitar signOut durante registro

// Real-time listener references
let eventsUnsubs = [];
let eventsSnap1 = [];
let eventsSnap2 = [];
let ticketsUnsub = null;
let purchasesUnsub = null;

function cleanupEventsListeners() {
    eventsUnsubs.forEach(unsub => { try { unsub(); } catch(e) {} });
    eventsUnsubs = [];
    eventsSnap1 = [];
    eventsSnap2 = [];
}

function cleanupTicketListeners() {
    if (ticketsUnsub) { try { ticketsUnsub(); } catch(e) {} ticketsUnsub = null; }
    if (purchasesUnsub) { try { purchasesUnsub(); } catch(e) {} purchasesUnsub = null; }
}

function cleanupAllListeners() {
    cleanupEventsListeners();
    cleanupTicketListeners();
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // MEJORA 6: Error monitoring
    initErrorMonitor(db, 'cliente');

    // 1. Detectar marca por subdominio
    currentBrandSlug = detectBrandSlug();

    if (!currentBrandSlug) {
        showError("No se pudo determinar la marca. Verifica la URL.");
        return;
    }

    // 2. Cargar datos de la marca
    const brandLoaded = await loadBrandBySlug();
    if (!brandLoaded) {
        showError(`La marca "${currentBrandSlug}" no existe.`);
        return;
    }

    // 3. Escuchar estado de autenticación
    onAuthStateChanged(auth, async (user) => {
        setTimeout(hideSplash, 800);

        if (user) {
            currentUser = user;

            // Si estamos en proceso de registro, no verificar perfil aún
            if (isRegistering) return;

            // Verificar si tiene perfil en ESTA marca
            const hasProfile = await loadUserProfile(user.uid);

            if (hasProfile) {
                // Tiene perfil → Entrar
                showView('eventsView');
                replaceViewState('events', '#eventos');
                loadEvents();
                loadMyTickets();
            } else {
                // No tiene perfil en esta marca → verificar si necesita vincular
                // Buscar si tiene cuenta en OTRA marca
                try {
                    const qGlobal = query(
                        collection(db, "clientes"),
                        where("uid", "==", user.uid)
                    );
                    const snapGlobal = await getDocs(qGlobal);

                    if (!snapGlobal.empty) {
                        // Tiene perfil en otra marca → ofrecer vincular
                        showLinkAccountPrompt(user);
                    } else {
                        // No tiene perfil en ninguna marca → volver a auth
                        await signOut(auth);
                        toast("No tienes acceso a esta marca");
                        showView('authView');
                        showLoginScreen();
                    }
                } catch (e) {
                    logger.error("Error verificando perfil:", e);
                    await signOut(auth);
                    showView('authView');
                    showLoginScreen();
                }
            }
        } else {
            cleanupAllListeners();
            currentUser = null;
            currentUserProfile = null;
            showView('authView');
            showLoginScreen();
        }
    });

    setupEventListeners();
});

/**
 * DETECTAR SLUG DE LA MARCA DESDE EL SUBDOMINIO
 * code.parygo.com → "code"
 * localhost:5500 → usa parámetro ?brand=code
 */
function detectBrandSlug() {
    const hostname = window.location.hostname;

    // Producción: subdominio.parygo.com
    if (hostname.includes('.parygo.com') || hostname.includes('.parygo.')) {
        const parts = hostname.split('.');
        if (parts.length >= 3) {
            return parts[0].toLowerCase();
        }
    }

    // Desarrollo local: usar parámetro ?brand=xxx
    const params = new URLSearchParams(window.location.search);
    const brandParam = params.get('brand') || params.get('marca');
    if (brandParam) {
        return brandParam.toLowerCase();
    }

    // Fallback: primer segmento del path
    const pathSlug = window.location.pathname.split('/').filter(p => p)[0];
    if (pathSlug && pathSlug !== 'cliente.html') {
        return pathSlug.toLowerCase();
    }

    return null;
}

/**
 * CARGAR MARCA POR SLUG
 */
async function loadBrandBySlug() {
    try {
        // Buscar marca por slug
        const q = query(collection(db, "brands"), where("slug", "==", currentBrandSlug));
        let snap = await getDocs(q);

        // Si no encuentra en brands, buscar en companies
        if (snap.empty) {
            const q2 = query(collection(db, "companies"), where("slug", "==", currentBrandSlug));
            snap = await getDocs(q2);
        }

        // También buscar por ID directo (compatibilidad)
        if (snap.empty) {
            let docSnap = await getDoc(doc(db, "brands", currentBrandSlug));
            if (!docSnap.exists()) {
                docSnap = await getDoc(doc(db, "companies", currentBrandSlug));
            }
            if (docSnap.exists()) {
                currentBrand = { id: docSnap.id, ...docSnap.data() };
                currentBrandId = docSnap.id;
                updateBrandUI();
                return true;
            }
        }

        if (!snap.empty) {
            currentBrand = { id: snap.docs[0].id, ...snap.docs[0].data() };
            currentBrandId = snap.docs[0].id;
            updateBrandUI();
            return true;
        }

        return false;
    } catch (e) {
        logger.error("Error cargando marca:", e);
        return false;
    }
}

function updateBrandUI() {
    if (!currentBrand) return;

    // Logo en auth
    const authLogo = document.getElementById("auth_brand_logo");
    if (authLogo) {
        if (currentBrand.logo) {
            const img = document.createElement('img');
            img.src = currentBrand.logo;
            img.alt = currentBrand.name || '';
            authLogo.textContent = '';
            authLogo.appendChild(img);
        } else {
            authLogo.innerHTML = `<i class="fa-solid fa-star"></i>`;
            authLogo.style.background = currentBrand.color || '#2a2a35';
        }
    }

    // Logo en header
    const headerLogo = document.getElementById("header_brand_logo");
    if (headerLogo) {
        if (currentBrand.logo) {
            const img = document.createElement('img');
            img.src = currentBrand.logo;
            img.alt = currentBrand.name || '';
            headerLogo.textContent = '';
            headerLogo.appendChild(img);
        } else {
            headerLogo.innerHTML = `<i class="fa-solid fa-star"></i>`;
            headerLogo.style.background = currentBrand.color || '#2a2a35';
        }
    }

    // Nombre
    const headerName = document.getElementById("header_brand_name");
    if (headerName) headerName.textContent = currentBrand.name || 'Eventos';

    // Nombre en auth
    const authBrandName = document.getElementById("auth_brand_name");
    if (authBrandName) authBrandName.textContent = currentBrand.name || 'Marca';

    document.title = `${currentBrand.name || 'ParyGo'} | Eventos`;

    // Color de tema (opcional)
    if (currentBrand.color) {
        document.documentElement.style.setProperty('--primary', currentBrand.color);
    }
}

function showError(message) {
    hideSplash();
    const safe = escapeHtml(message);
    const brandSlug = currentBrandSlug || '';
    const homeUrl = brandSlug ? `https://${brandSlug}.parygo.com` : 'https://parygo.com';
    document.body.innerHTML = `
        <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; text-align:center; background:#09090b; color:white; font-family:'Outfit','Inter',sans-serif;">
            <div style="font-size:64px; margin-bottom:16px;">😕</div>
            <h1 style="font-size:22px; font-weight:700; margin-bottom:8px;">Algo salio mal</h1>
            <p style="color:#888; font-size:14px; max-width:300px; margin-bottom:24px;">${safe}</p>
            <a href="${escapeHtml(homeUrl)}" style="background:#f43f5e; color:#fff; padding:12px 32px; border-radius:12px; text-decoration:none; font-weight:600; font-size:14px;">Volver al inicio</a>
        </div>
    `;
}

function hideSplash() {
    const splash = document.getElementById("splashScreen");
    if (splash) {
        splash.style.opacity = "0";
        setTimeout(() => splash.classList.add("hidden"), 300);
    }
}

// ==========================================
// CARGAR PERFIL DEL USUARIO EN ESTA MARCA
// ==========================================
async function loadUserProfile(uid) {
    try {
        // Buscar con ID compuesto uid_brandId (multi-marca)
        const compositeId = `${uid}_${currentBrandId}`;
        const compositeSnap = await getDoc(doc(db, "clientes", compositeId));

        if (compositeSnap.exists()) {
            currentUserProfile = { id: compositeSnap.id, ...compositeSnap.data() };
            updateUserUI();
            return true;
        }

        // Fallback: buscar por UID solo (datos anteriores al cambio multi-marca)
        const legacySnap = await getDoc(doc(db, "clientes", uid));
        if (legacySnap.exists()) {
            const data = legacySnap.data();
            if (data.brand_id === currentBrandId) {
                currentUserProfile = { id: legacySnap.id, ...data };
                updateUserUI();
                return true;
            }
        }

        // Fallback: buscar por query
        const q = query(
            collection(db, "clientes"),
            where("uid", "==", uid),
            where("brand_id", "==", currentBrandId)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
            const data = snap.docs[0].data();
            currentUserProfile = { id: snap.docs[0].id, ...data };
            updateUserUI();
            return true;
        }
        return false;
    } catch (e) {
        logger.error("Error cargando perfil:", e);
        return false;
    }
}

/**
 * MOSTRAR PROMPT PARA VINCULAR CUENTA EXISTENTE
 */
function showLinkAccountPrompt(user) {
    showView('authView');

    // Ocultar pantallas de auth existentes
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("registerScreen")?.classList.add("hidden");

    // Crear prompt especial
    const container = document.querySelector('.auth-container');

    // Remover prompt anterior si existe
    document.getElementById("link_prompt")?.remove();

    const prompt = document.createElement('div');
    prompt.id = "link_prompt";
    prompt.className = "auth-step";
    prompt.innerHTML = `
        <div class="user-found-card" style="background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.1);">
            <i class="fa-solid fa-link" style="color:#9a9aa3;"></i>
            <div>
                <span>Ya tienes una cuenta ParyGo</span>
                <strong>${user.email}</strong>
            </div>
        </div>

        <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px; text-align:center;">
            Para acceder a los eventos de <strong>${currentBrand?.name || 'esta marca'}</strong>,
            necesitamos algunos datos adicionales.
        </p>

        <div class="form-group">
            <label>Tipo de documento</label>
            <div class="doc-type-selector">
                <button class="doc-type-btn active" data-type="DNI" onclick="selectDocType('DNI')">
                    <i class="fa-solid fa-id-card"></i> DNI
                </button>
                <button class="doc-type-btn" data-type="CE" onclick="selectDocType('CE')">
                    <i class="fa-solid fa-passport"></i> CE
                </button>
                <button class="doc-type-btn" data-type="PASAPORTE" onclick="selectDocType('PASAPORTE')">
                    <i class="fa-solid fa-globe"></i> Pasaporte
                </button>
            </div>
        </div>

        <div class="form-group">
            <label id="link_doc_label">Número de DNI</label>
            <input type="tel" id="link_doc_number" placeholder="12345678" maxlength="8">
        </div>

        <div class="form-group">
            <label>Nombres</label>
            <input type="text" id="link_nombres" placeholder="Tus nombres">
        </div>

        <div class="form-group">
            <label>Apellidos</label>
            <input type="text" id="link_apellidos" placeholder="Tus apellidos">
        </div>

        <div class="form-group">
            <label>Teléfono (WhatsApp)</label>
            <input type="tel" id="link_phone" placeholder="987654321" maxlength="9">
        </div>

        <button class="btn-primary" onclick="linkAccountToProfile()">
            <span>CONTINUAR</span>
            <i class="fa-solid fa-arrow-right"></i>
        </button>

        <button class="btn-back-link" onclick="logoutAndRestart()">
            <i class="fa-solid fa-arrow-left"></i> Usar otra cuenta
        </button>
    `;

    container.appendChild(prompt);

    // Agregar listener para buscar DNI
    document.getElementById("link_doc_number")?.addEventListener("blur", async (e) => {
        const dni = e.target.value.trim();
        if (selectedDocType === 'DNI' && dni.length === 8) {
            await searchRENIECForLink(dni);
        }
    });
}

async function searchRENIECForLink(dni) {
    try {
        const fn = httpsCallable(cloudFunctions, 'consultaDNIPublic');
        const result = await fn({ dni });
        const data = result.data;

        if (data?.success && data?.nombres) {
            document.getElementById("link_nombres").value = data.nombres;
            document.getElementById("link_apellidos").value = `${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
            toast("Datos encontrados");
        }
    } catch (e) {
        // RENIEC not available
    }
}

async function linkAccountToProfile() {
    const docNumber = document.getElementById("link_doc_number").value.trim();
    const nombres = document.getElementById("link_nombres").value.trim();
    const apellidos = document.getElementById("link_apellidos").value.trim();
    const phone = document.getElementById("link_phone").value.trim();

    if (!docNumber) return toast("Ingresa tu documento");
    if (!nombres || !apellidos) return toast("Ingresa tu nombre completo");
    if (!phone || phone.length !== 9 || !phone.startsWith('9')) return toast("Teléfono: 9 dígitos, empieza con 9");

    try {
        // Crear perfil con ID compuesto (soporte multi-marca)
        const clientDocId = `${currentUser.uid}_${currentBrandId}`;
        await setDoc(doc(db, "clientes", clientDocId), {
            uid: currentUser.uid,
            brand_id: currentBrandId,
            doc_type: selectedDocType,
            doc_number: docNumber,
            name: nombres,
            lastname: apellidos,
            email: currentUser.email,
            phone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        toast("Cuenta vinculada");

        // Recargar
        await loadUserProfile(currentUser.uid);
        showView('eventsView');
        replaceViewState('events', '#eventos');
        loadEvents();
        loadMyTickets();

        // Remover prompt
        document.getElementById("link_prompt")?.remove();

    } catch (e) {
        logger.error(e);
        toast("Error al vincular cuenta");
    }
};

async function logoutAndRestart() {
    cleanupAllListeners();
    await signOut(auth);
    location.reload();
}

// ==========================================
// AUTENTICACIÓN - BUSCAR DOCUMENTO
// ==========================================
function selectDocType(type) {
    selectedDocType = type;
    document.querySelectorAll('.doc-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`[data-type="${type}"]`).forEach(b => b.classList.add('active'));

    // Actualizar labels
    const labels = ['doc_label', 'link_doc_label'];
    const inputs = ['auth_doc_number', 'link_doc_number'];

    labels.forEach(id => {
        const label = document.getElementById(id);
        if (label) {
            if (type === 'DNI') {
                label.textContent = "Número de DNI";
            } else if (type === 'CE') {
                label.textContent = "Carnet de Extranjería";
            } else {
                label.textContent = "Número de Pasaporte";
            }
        }
    });

    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.maxLength = type === 'DNI' ? 8 : 12;
            input.placeholder = type === 'DNI' ? "12345678" : (type === 'CE' ? "CE123456789" : "AB1234567");
        }
    });
}

async function searchDocument() {
    const docNumber = document.getElementById("auth_doc_number").value.trim();
    const btn = document.getElementById("btnSearchDoc");

    if (selectedDocType === 'DNI' && docNumber.length !== 8) {
        return toast("El DNI debe tener 8 dígitos");
    }
    if (!docNumber) return toast("Ingresa tu documento");

    if (!searchDocRateLimit()) {
        return toast("Demasiados intentos. Espera un momento.", "error");
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // MEJORA 3: Buscar via Cloud Function (sin exponer colección clientes)
        const searchFn = httpsCallable(cloudFunctions, 'searchClientByDoc');
        const result = await searchFn({ docNumber, brandId: currentBrandId });
        const searchResult = result.data;

        if (searchResult.found && searchResult.sameBrand) {
            // Existe en esta marca → login
            foundUserData = {
                name: searchResult.name,
                lastname: searchResult.lastname
            };

            document.getElementById("login_user_name").textContent = `${foundUserData.name} ${foundUserData.lastname}` || 'Usuario';
            showAuthStep(3);
        } else if (searchResult.found && !searchResult.sameBrand) {
            // Tiene cuenta en otra marca → vincular
            foundUserData = {
                name: searchResult.name,
                lastname: searchResult.lastname
            };

            document.getElementById("login_user_name").textContent = `${foundUserData.name} ${foundUserData.lastname} (cuenta existente)`;
                existingUserNeedsProfile = true;
                showAuthStep(3);
            } else {
                // Usuario completamente nuevo → Registro
                if (selectedDocType === 'DNI') {
                    await searchRENIEC(docNumber);
                } else {
                    clearRegisterFields();
                    showAuthStep(2);
                }
            }
        }
    } catch (e) {
        logger.error(e);
        toast("Error de conexión");
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
}

async function searchRENIEC(dni) {
    if (!dniRateLimit()) {
        toast("Demasiados intentos. Espera un momento.", "error");
        return;
    }
    try {
        const fn = httpsCallable(cloudFunctions, 'consultaDNIPublic');
        const result = await fn({ dni });
        const data = result.data;

        if (data?.success && data?.nombres) {
            document.getElementById("reg_nombres").value = data.nombres;
            document.getElementById("reg_apellidos").value = `${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
            document.getElementById("reg_nombres").setAttribute("readonly", "true");
            document.getElementById("reg_apellidos").setAttribute("readonly", "true");
            toast("Datos encontrados");
        } else {
            clearRegisterFields();
            toast("No encontrado, ingresa manualmente");
        }
    } catch (e) {
        clearRegisterFields();
    }
    showAuthStep(2);
}

function clearRegisterFields() {
    document.getElementById("reg_nombres").value = "";
    document.getElementById("reg_apellidos").value = "";
    document.getElementById("reg_nombres").removeAttribute("readonly");
    document.getElementById("reg_apellidos").removeAttribute("readonly");
}

function showAuthStep(step) {
    // Mapear auth_step a IDs reales del HTML
    // step 1 = reg_step1 (DNI), step 2 = reg_step2 (datos), step 3 = loginScreen (login)
    document.getElementById("reg_step1")?.classList.add("hidden");
    document.getElementById("reg_step2")?.classList.add("hidden");
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("link_prompt")?.classList.add("hidden");

    const stepMap = { 1: "reg_step1", 2: "reg_step2", 3: "loginScreen" };
    const targetId = stepMap[step];
    if (targetId) {
        document.getElementById(targetId)?.classList.remove("hidden");
        // Asegurar que registerScreen esté visible para steps 1 y 2
        if (step <= 2) {
            document.getElementById("registerScreen")?.classList.remove("hidden");
            document.getElementById("loginScreen")?.classList.add("hidden");
        }
    }
}

function backToStep1() {
    foundUserData = null;
    existingUserNeedsProfile = false;
    showAuthStep(1);
}

// ==========================================
// REGISTRO - USUARIO NUEVO
// ==========================================
// ==========================================
// ALTERNAR ENTRE LOGIN Y REGISTRO
// ==========================================
function showLoginScreen() {
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("registerScreen").classList.add("hidden");
}

function showRegisterScreen() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("registerScreen").classList.remove("hidden");
}

// ==========================================
// SELECTOR DE TIPO DE DOCUMENTO EN REGISTRO
// ==========================================
function selectRegDocType(type) {
    selectedDocType = type;
    document.querySelectorAll('#reg_step1 .doc-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`#reg_step1 [data-type="${type}"]`).forEach(b => b.classList.add('active'));

    const label = document.getElementById("reg_doc_label");
    const input = document.getElementById("reg_dni");

    if (label && input) {
        if (type === 'DNI') {
            label.textContent = "Número de DNI *";
            input.placeholder = "12345678";
            input.maxLength = 8;
        } else if (type === 'CE') {
            label.textContent = "Carnet de Extranjería *";
            input.placeholder = "CE123456789";
            input.maxLength = 12;
        } else {
            label.textContent = "Número de Pasaporte *";
            input.placeholder = "AB1234567";
            input.maxLength = 12;
        }
    }
}

// ==========================================
// PASO 1: VERIFICAR DNI
// ==========================================
async function handleCheckDNI() {
    const dni = document.getElementById("reg_dni").value.trim();

    if (selectedDocType === 'DNI' && !validateDNI(dni)) {
        return toast("El DNI debe tener exactamente 8 dígitos");
    }

    if (!dni) {
        return toast("Ingresa tu documento");
    }

    const btn = document.getElementById("btnCheckDNI");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';

    try {
        // 1. Verificar si el DNI ya existe en esta marca
        const qDNI = query(
            collection(db, "clientes"),
            where("doc_number", "==", dni),
            where("brand_id", "==", currentBrandId)
        );
        const snapDNI = await getDocs(qDNI);

        if (!snapDNI.empty) {
            toast("Este DNI ya está registrado. Por favor, inicia sesión.");
            btn.disabled = false;
            btn.innerHTML = 'SIGUIENTE <i class="fa-solid fa-arrow-right"></i>';
            setTimeout(() => showLoginScreen(), 2000);
            return;
        }

        // 2. Consultar RENIEC para autocompletar nombres (solo si es DNI)
        if (selectedDocType === 'DNI') {
            await searchRENIECForRegistration(dni);
        } else {
            // Para CE o Pasaporte, limpiar campos
            document.getElementById("reg_nombres").value = "";
            document.getElementById("reg_apellidos").value = "";
        }

        // 3. Mostrar paso 2
        showRegStep(2);

    } catch (e) {
        logger.error("Error verificando documento:", e);
        toast("Error al verificar documento");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'SIGUIENTE <i class="fa-solid fa-arrow-right"></i>';
    }
}

async function searchRENIECForRegistration(dni) {
    try {
        const fn = httpsCallable(cloudFunctions, 'consultaDNIPublic');
        const result = await fn({ dni });
        const data = result.data;

        if (data?.success && data?.nombres) {
            document.getElementById("reg_nombres").value = data.nombres;
            document.getElementById("reg_apellidos").value = `${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
            toast("Datos encontrados en RENIEC");
        } else {
            // No se encontró, pero igual puede continuar
            document.getElementById("reg_nombres").value = "";
            document.getElementById("reg_apellidos").value = "";
        }
    } catch (e) {
        logger.error("Error RENIEC:", e);
        // No importa si falla RENIEC, el usuario puede ingresar manualmente
    }
}

function showRegStep(step) {
    document.getElementById("reg_step1").classList.toggle("hidden", step !== 1);
    document.getElementById("reg_step2").classList.toggle("hidden", step !== 2);
}

function backToRegStep1() {
    showRegStep(1);
    const btn = document.getElementById("btnCheckDNI");
    btn.disabled = false;
    btn.innerHTML = 'SIGUIENTE <i class="fa-solid fa-arrow-right"></i>';
}

// ==========================================
// VALIDACIONES
// ==========================================
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateDNI(dni) {
    return /^[0-9]{8}$/.test(dni);
}

function validatePhone(phone) {
    return /^9[0-9]{8}$/.test(phone);
}

// ==========================================
// PASO 2: COMPLETAR REGISTRO
// ==========================================
async function handleRegister() {
    const dni = document.getElementById("reg_dni").value.trim();
    const nombres = document.getElementById("reg_nombres").value.trim();
    const apellidos = document.getElementById("reg_apellidos").value.trim();
    const email = document.getElementById("reg_email").value.trim().toLowerCase();
    const phone = document.getElementById("reg_phone").value.trim();
    const password = document.getElementById("reg_password").value;
    const confirmPassword = document.getElementById("reg_confirm_password")?.value || password;

    // Validaciones
    if (!dni) return toast("El DNI es obligatorio");
    if (!validateDNI(dni)) return toast("El DNI debe tener exactamente 8 dígitos");
    if (!nombres) return toast("Los nombres son obligatorios");
    if (!apellidos) return toast("Los apellidos son obligatorios");
    if (!email) return toast("El correo electrónico es obligatorio");
    if (!validateEmail(email)) return toast("Ingresa un correo electrónico válido");
    if (!phone) return toast("El teléfono es obligatorio");
    if (!validatePhone(phone)) return toast("El teléfono debe empezar con 9 y tener 9 dígitos");
    if (!password) return toast("La contraseña es obligatoria");
    if (password.length < 6) return toast("La contraseña debe tener mínimo 6 caracteres");
    if (password !== confirmPassword) return toast("Las contraseñas no coinciden");

    const btn = document.getElementById("btnRegister");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CREANDO CUENTA...';

    try {
        // Activar flag para evitar que onAuthStateChanged haga signOut
        isRegistering = true;

        // 1. Crear usuario en Firebase Auth
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = cred.user;

        // 2. Crear documento con ID compuesto (soporte multi-marca)
        const clientDocId = `${cred.user.uid}_${currentBrandId}`;
        await setDoc(doc(db, "clientes", clientDocId), {
            uid: cred.user.uid,
            brand_id: currentBrandId,
            doc_type: selectedDocType,
            doc_number: dni,
            name: nombres,
            lastname: apellidos,
            email,
            phone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        // 3. Cargar perfil y entrar
        await loadUserProfile(cred.user.uid);

        toast("Cuenta creada exitosamente");
        launchConfetti();

        showView('eventsView');
        replaceViewState('events', '#eventos');
        loadEvents();
        loadMyTickets();

    } catch (e) {
        logger.error("Error en registro:", e);

        let errorMsg = "Error al crear cuenta";
        if (e.code === 'auth/email-already-in-use') {
            errorMsg = "Este correo ya está registrado";
        } else if (e.code === 'auth/weak-password') {
            errorMsg = "La contraseña es muy débil";
        } else if (e.code === 'auth/invalid-email') {
            errorMsg = "Correo electrónico inválido";
        } else if (e.code === 'permission-denied') {
            errorMsg = "Error de permisos. Contacta al administrador.";
        }

        toast(errorMsg);
    } finally {
        isRegistering = false;
        btn.disabled = false;
        btn.innerHTML = 'REGISTRARME';
    }
}

// ==========================================
// LOGIN (FUNCIÓN GLOBAL)
// ==========================================
async function handleLogin() {
    const email = document.getElementById("login_email").value.trim().toLowerCase();
    const password = document.getElementById("login_password").value;

    // Validaciones
    if (!email) return toast("Ingresa tu correo electrónico");
    if (!validateEmail(email)) return toast("Ingresa un correo electrónico válido");
    if (!password) return toast("Ingresa tu contraseña");

    const btn = document.getElementById("btnLogin");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> INGRESANDO...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // El onAuthStateChanged se encargará del resto
        toast("Bienvenido");

    } catch (e) {
        logger.error("Error en login:", e);

        let errorMsg = "Error al iniciar sesión";
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            errorMsg = "Correo o contraseña incorrectos";
        } else if (e.code === 'auth/wrong-password') {
            errorMsg = "Contraseña incorrecta";
        } else if (e.code === 'auth/invalid-email') {
            errorMsg = "Correo electrónico inválido";
        } else if (e.code === 'auth/too-many-requests') {
            errorMsg = "Demasiados intentos. Intenta más tarde";
        }

        toast(errorMsg);
        btn.disabled = false;
        btn.innerHTML = 'INICIAR SESIÓN';
    }
};

// ==========================================
// ACTUALIZAR UI DEL USUARIO
// ==========================================
function updateUserUI() {
    if (!currentUserProfile) return;

    const fullName = `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim();
    const initials = getInitials(fullName || 'CL');

    ['header_avatar', 'profile_avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (currentUserProfile.photo) {
                el.innerHTML = `<img src="${currentUserProfile.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
            } else {
                el.textContent = initials;
            }
        }
    });

    const profileNameEl = document.getElementById("profile_name");
    if (profileNameEl) profileNameEl.textContent = fullName || 'Cliente';

    const profileDocEl = document.getElementById("profile_doc");
    if (profileDocEl) {
        const docType = currentUserProfile.doc_type || 'DNI';
        const docNumber = currentUserProfile.doc_number || '---';
        profileDocEl.textContent = `${docType}: ${docNumber}`;
    }

    const profileEmailEl = document.getElementById("profile_email");
    if (profileEmailEl) profileEmailEl.textContent = currentUserProfile.email || '---';

    const profilePhoneEl = document.getElementById("profile_phone");
    if (profilePhoneEl) profilePhoneEl.textContent = currentUserProfile.phone || '---';
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// ==========================================
// EVENTOS
// ==========================================
function loadEvents() {
    const container = document.getElementById("events_list");

    // Si el listener ya está activo, solo re-renderizar
    if (eventsUnsubs.length > 0) {
        renderFilteredEvents('', 'all');
        return;
    }

    container.innerHTML = `
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
    `;

    const q1 = query(collection(db, "events"), where("brand_id", "==", currentBrandId));
    const q2 = query(collection(db, "events"), where("company_id", "==", currentBrandId));

    const unsub1 = onSnapshot(q1, (snap) => {
        eventsSnap1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndRenderClientEvents();
    }, (error) => {
        logger.error("Error listener eventos (brand_id):", error);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
        eventsSnap2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndRenderClientEvents();
    }, (error) => {
        logger.error("Error listener eventos (company_id):", error);
    });

    eventsUnsubs = [unsub1, unsub2];
}

function mergeAndRenderClientEvents() {
    const map = new Map();
    eventsSnap1.forEach(e => map.set(e.id, e));
    eventsSnap2.forEach(e => map.set(e.id, e));

    allEvents = Array.from(map.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const container = document.getElementById("events_list");
    if (!container) return;

    if (!allEvents.length) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin eventos</h3><p>No hay eventos disponibles</p></div>';
        return;
    }

    renderFilteredEvents('', 'all');
}

let currentDateFilter = 'all';

function filterEvents() {
    const searchTerm = (document.getElementById("search_events")?.value || '').toLowerCase().trim();
    renderFilteredEvents(searchTerm, currentDateFilter);
}

function filterByDate(filter) {
    currentDateFilter = filter;
    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.date-filter-btn[onclick*="${filter}"]`)?.classList.add('active');
    const searchTerm = (document.getElementById("search_events")?.value || '').toLowerCase().trim();
    renderFilteredEvents(searchTerm, filter);
}

// ==========================================
// FAVORITOS (localStorage)
// ==========================================
function isFavorite(eventId) {
    return favorites.includes(eventId);
}

function toggleFavorite(eventId, event) {
    if (event) event.stopPropagation();
    const idx = favorites.indexOf(eventId);
    if (idx >= 0) {
        favorites.splice(idx, 1);
    } else {
        favorites.push(eventId);
    }
    localStorage.setItem('parygo_favorites', JSON.stringify(favorites));
    // Re-render
    const searchTerm = (document.getElementById("search_events")?.value || '').toLowerCase().trim();
    renderFilteredEvents(searchTerm, currentDateFilter);
}

function renderFilteredEvents(searchTerm, dateFilter) {
    const container = document.getElementById("events_list");
    let filtered = [...allEvents];

    // Filter by search
    if (searchTerm) {
        filtered = filtered.filter(e =>
            (e.name || '').toLowerCase().includes(searchTerm) ||
            (e.venue || '').toLowerCase().includes(searchTerm) ||
            (e.location || '').toLowerCase().includes(searchTerm)
        );
    }

    // Filter by date range (sin excluir eventos de hoy)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === 'week') {
        const endOfWeek = new Date(startOfToday);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        filtered = filtered.filter(e => {
            const d = new Date(e.date + 'T23:59:59');
            return d >= startOfToday && d <= endOfWeek;
        });
    } else if (dateFilter === 'month') {
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        filtered = filtered.filter(e => {
            const d = new Date(e.date + 'T23:59:59');
            return d >= startOfToday && d <= endOfMonth;
        });
    }

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-search"></i><h3>Sin resultados</h3><p>${searchTerm ? 'No se encontraron eventos' : 'No hay eventos en este periodo'}</p></div>`;
        return;
    }

    container.innerHTML = filtered.map((e, i) => {
        const origIndex = allEvents.indexOf(e);
        const fav = isFavorite(e.id);
        const hasTicket = myTickets.some(t => t.event_id === e.id && t.status === 'ACTIVE');
        const countdownBadge = getCountdownBadge(e.date);
        return `
            <div class="event-card" onclick="openEventDetail(${origIndex})">
                <div class="event-card-image-wrapper">
                    <img class="event-card-image" src="${e.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600'}" alt="${escapeHtml(e.name)}" loading="lazy">
                    <button class="event-card-fav ${fav ? 'active' : ''}" onclick="toggleFavorite('${e.id}', event)">
                        <i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i>
                    </button>
                    ${hasTicket ? '<div class="event-card-badge"><i class="fa-solid fa-ticket"></i> Tienes entrada</div>' : ''}
                </div>
                <div class="event-card-body">
                    <div class="event-card-title">${escapeHtml(e.name)}</div>
                    ${countdownBadge}
                    <div class="event-card-meta">
                        <span><i class="fa-regular fa-calendar"></i> ${formatDate(e.date)}</span>
                        <span><i class="fa-regular fa-clock"></i> ${e.time || '---'}</span>
                        ${e.venue ? `<span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(e.venue)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getCountdown(dateStr, timeStr) {
    if (!dateStr) return '';
    const eventDate = new Date(dateStr + (timeStr ? `T${timeStr}` : ''));
    const now = new Date();
    const diff = eventDate - now;
    if (diff <= 0) return '';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days === 0) return `En ${hours}h`;
    if (days === 1) return 'Mañana';
    if (days <= 7) return `En ${days} dias`;
    return '';
}

// ==========================================
// COUNTDOWN BADGE PARA CARDS
// ==========================================
function getCountdownBadge(eventDate) {
    if (!eventDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const evDate = new Date(eventDate + 'T00:00:00');
    evDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays > 7 || diffDays < 0) return '';

    let text, colorClass;
    if (diffDays === 0) {
        text = '¡Es hoy!';
        colorClass = 'countdown-red';
    } else if (diffDays === 1) {
        text = '¡Mañana!';
        colorClass = 'countdown-red';
    } else if (diffDays <= 3) {
        text = 'Faltan ' + diffDays + ' días';
        colorClass = 'countdown-orange';
    } else {
        text = 'Faltan ' + diffDays + ' días';
        colorClass = 'countdown-yellow';
    }

    return `<span class="countdown-badge ${colorClass}"><i class="fa-regular fa-clock"></i> ${text}</span>`;
}

// ==========================================
// FAB BUTTON
// ==========================================
function updateFAB() {
    const fab = document.getElementById("fabNextEvent");
    if (!fab) return;

    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const nextTicket = myTickets
        .filter(t => t.status === 'ACTIVE' && t.event_date)
        .find(t => {
            const d = new Date(t.event_date);
            return d >= now && d <= sevenDays;
        });

    if (nextTicket) {
        fab.classList.remove('hidden');
    } else {
        fab.classList.add('hidden');
    }
}

function goToNextEventTicket() {
    const now = new Date();
    const nextTicket = myTickets
        .filter(t => t.status === 'ACTIVE' && t.event_date)
        .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
        .find(t => new Date(t.event_date) >= now);

    if (nextTicket) {
        showTicketQR(nextTicket, 'eventsView');
    }
}

function openEventDetail(index) {
    currentEvent = allEvents[index];
    if (!currentEvent) return;

    showView('eventDetailView');
    pushViewState('event-detail', '#evento', { eventIndex: index });

    document.getElementById("detail_image").src = currentEvent.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600';
    document.getElementById("detail_name").textContent = currentEvent.name;
    document.getElementById("detail_date").textContent = formatDate(currentEvent.date);
    document.getElementById("detail_time").textContent = currentEvent.time || 'Por confirmar';
    document.getElementById("detail_venue").textContent = currentEvent.venue || 'Por confirmar';

    renderTicketsForSale();
    updateDetailCountdown();
    renderMyEventTickets();

    // Update OG meta tags dynamically (helps browsers, not social crawlers)
    updateOGMetaTags(
        currentEvent.name,
        `${formatDate(currentEvent.date)} - ${currentEvent.venue || ''}`,
        currentEvent.image || ''
    );
}

function updateDetailCountdown() {
    const el = document.getElementById("detail_countdown");
    if (!el || !currentEvent) return;

    const countdown = getCountdown(currentEvent.date, currentEvent.time);
    if (countdown) {
        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="detail-countdown-label">Cuenta regresiva</div>
            <div class="detail-countdown-value">${countdown}</div>
        `;
    } else {
        el.classList.add('hidden');
    }
}

function renderMyEventTickets() {
    const container = document.getElementById("my_event_tickets_list");
    const section = document.getElementById("myEventTickets");
    if (!container || !section || !currentEvent) return;

    const eventTickets = myTickets.filter(t => t.event_id === currentEvent.id && t.status === 'ACTIVE');
    const eventPending = myPurchases.filter(p => p.event_id === currentEvent.id);

    if (!eventTickets.length && !eventPending.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    // Agrupar por tipo de entrada
    const typeGroups = {};
    eventTickets.forEach(t => {
        const typeName = t.ticket_type || 'General';
        if (!typeGroups[typeName]) typeGroups[typeName] = [];
        typeGroups[typeName].push(t);
    });

    const ticketsHtml = Object.entries(typeGroups).map(([typeName, typeTickets]) => {
        const indices = typeTickets.map(t => myTickets.indexOf(t));
        const indicesJson = JSON.stringify(indices);
        return `
            <div class="ticket-type-subgroup" onclick='openTicketCarouselFromEvent(${indicesJson})'>
                <div class="ticket-type-subgroup-info">
                    <span class="ticket-type-subgroup-name">${escapeHtml(typeName)}</span>
                    <span class="ticket-type-subgroup-count">${typeTickets.length} entrada${typeTickets.length > 1 ? 's' : ''}</span>
                </div>
                <span class="btn-ver-type">
                    Ver <i class="fa-solid fa-chevron-right"></i>
                </span>
            </div>
        `;
    }).join('');

    const pendingHtml = eventPending.map(p => `
        <div class="ticket-group-item pending-entry">
            <div class="ticket-group-item-info">
                <span class="ticket-type">${escapeHtml(p.ticket_name || 'Entrada')}</span>
                <span class="ticket-status-text">${p.quantity || 1}x — S/. ${(p.total || 0).toFixed(2)}</span>
            </div>
            <span class="status-badge pending">Pendiente</span>
        </div>
    `).join('');

    container.innerHTML = ticketsHtml + pendingHtml;
}

function viewTicketFromDetail(globalIdx) {
    showTicketQR(myTickets[globalIdx], 'eventDetailView');
}

function renderTicketsForSale() {
    const container = document.getElementById("tickets_for_sale");
    const tickets = currentEvent?.tickets || [];

    if (!tickets.length) {
        container.innerHTML = '<p class="text-muted">No hay entradas disponibles</p>';
        return;
    }

    const now = new Date();

    container.innerHTML = tickets.map((t, i) => {
        const isFree = t.isFree || t.price === 0;
        const mode = t.priceMode || (isFree ? 'FREE' : 'FIXED');

        // === PREVENTAS (fases) ===
        if (mode === 'PHASES' && t.phases && t.phases.length > 0) {
            return renderTicketCardPhases(t, i, now);
        }

        // === GRATIS o FIJO ===
        return renderTicketCardSimple(t, i, mode, isFree, now);
    }).join('');
}

function renderTicketCardSimple(t, i, mode, isFree, now) {
    let disabled = false;
    let statusLabel = '';

    // Fecha límite: buy_until para FIXED, claim_until para FREE (con fallback cruzado)
    const untilDate = t.buy_until || t.claim_until;

    if (mode === 'FREE' && (t.claim_until || t.buy_until) && new Date(t.claim_until || t.buy_until) < now) {
        disabled = true;
        statusLabel = 'Ya no disponible';
    } else if (mode === 'FIXED' && untilDate && new Date(untilDate) < now) {
        disabled = true;
        statusLabel = 'Venta finalizada';
    } else if (t.stock !== undefined && t.sold !== undefined && t.sold >= t.stock) {
        disabled = true;
        statusLabel = 'Agotado';
    }

    const actionLabel = isFree ? 'Obtener' : 'Comprar';
    const onclick = disabled ? '' : (isFree ? `onclick="openFreeTicketModal(${i})"` : `onclick="openBuyModal(${i})"`);
    const btnClass = isFree ? 'tcu-btn free' : 'tcu-btn';

    return `
        <div class="ticket-card-unified ${disabled ? 'disabled' : ''}" ${onclick}>
            <div class="tcu-top">
                <span class="tcu-name">${escapeHtml(t.name)}</span>
            </div>
            <div class="tcu-bottom">
                <span class="tcu-price-tag ${isFree ? 'free' : ''}">${isFree ? 'GRATIS' : `S/. ${Number(t.price).toFixed(2)}`}</span>
                ${disabled
                    ? `<span class="tcu-disabled-label">${statusLabel}</span>`
                    : `<span class="${btnClass}"><i class="fa-solid fa-${isFree ? 'gift' : 'bag-shopping'}"></i> ${actionLabel}</span>`
                }
            </div>
        </div>
    `;
}

function renderTicketCardPhases(t, i, now) {
    const sorted = [...t.phases].sort((a, b) => new Date(a.until) - new Date(b.until));

    let activeFound = false;
    const phasesHtml = sorted.map(phase => {
        const untilDate = phase.until ? new Date(phase.until) : null;
        const isPast = untilDate && untilDate < now;
        const isActive = !isPast && !activeFound;

        if (isActive) activeFound = true;
        if (isPast) return '';

        const isFree = phase.price === 0;

        if (isActive) {
            const untilLabel = untilDate ? formatPhaseDate(untilDate) : '';
            const actionLabel = isFree ? 'Obtener' : 'Comprar';
            const btnClass = isFree ? 'tcu-btn free' : 'tcu-btn';
            const onclick = isFree
                ? `onclick="openFreeTicketModal(${i})"`
                : `onclick="openBuyModalWithPrice(${i}, ${phase.price})"`;
            return `
                <div class="tcu-phase active" ${onclick}>
                    <div class="tcu-phase-info">
                        <span class="tcu-phase-name">${escapeHtml(phase.name)}</span>
                        ${untilLabel ? `<span class="tcu-phase-until"><i class="fa-regular fa-clock"></i> Hasta ${untilLabel}</span>` : ''}
                    </div>
                    <div class="tcu-phase-action">
                        <span class="tcu-phase-price">${isFree ? 'GRATIS' : `S/. ${Number(phase.price).toFixed(2)}`}</span>
                        <span class="${btnClass}"><i class="fa-solid fa-${isFree ? 'gift' : 'bag-shopping'}"></i> ${actionLabel}</span>
                    </div>
                </div>
            `;
        } else {
            const phaseIdx = sorted.indexOf(phase);
            const prevUntil = phaseIdx > 0 && sorted[phaseIdx - 1].until ? new Date(sorted[phaseIdx - 1].until) : null;
            const startLabel = prevUntil ? formatPhaseDate(prevUntil) : (untilDate ? formatPhaseDate(untilDate) : '');
            return `
                <div class="tcu-phase future">
                    <div class="tcu-phase-info">
                        <span class="tcu-phase-name">${escapeHtml(phase.name)}</span>
                        <span class="tcu-phase-until"><i class="fa-regular fa-clock"></i> Inicia ${startLabel}</span>
                    </div>
                    <div class="tcu-phase-action">
                        <span class="tcu-phase-price">${isFree ? 'GRATIS' : `S/. ${Number(phase.price).toFixed(2)}`}</span>
                        <span class="tcu-phase-locked"><i class="fa-solid fa-lock"></i> Próximamente</span>
                    </div>
                </div>
            `;
        }
    }).filter(Boolean).join('');

    // Door price
    const allExpired = sorted.every(p => p.until && new Date(p.until) < now);
    let doorHtml = '';
    if (t.doorPrice) {
        if (allExpired) {
            const onclick = `onclick="openBuyModalWithPrice(${i}, ${t.doorPrice})"`;
            doorHtml = `
                <div class="tcu-phase active" ${onclick}>
                    <div class="tcu-phase-info">
                        <span class="tcu-phase-name">Puerta</span>
                    </div>
                    <div class="tcu-phase-action">
                        <span class="tcu-phase-price">S/. ${Number(t.doorPrice).toFixed(2)}</span>
                        <span class="tcu-btn"><i class="fa-solid fa-bag-shopping"></i> Comprar</span>
                    </div>
                </div>
            `;
        } else {
            doorHtml = `
                <div class="tcu-phase door">
                    <div class="tcu-phase-info">
                        <span class="tcu-phase-name"><i class="fa-solid fa-door-open"></i> Puerta</span>
                    </div>
                    <div class="tcu-phase-action">
                        <span class="tcu-phase-price">S/. ${Number(t.doorPrice).toFixed(2)}</span>
                    </div>
                </div>
            `;
        }
    } else if (allExpired && !phasesHtml) {
        doorHtml = `
            <div class="tcu-phase expired">
                <span class="tcu-disabled-label">Venta finalizada</span>
            </div>
        `;
    }

    return `
        <div class="ticket-card-unified phases">
            <div class="tcu-card-header">
                <span class="tcu-name">${escapeHtml(t.name)}</span>
            </div>
            <div class="tcu-phases">
                ${phasesHtml}
                ${doorHtml}
            </div>
        </div>
    `;
}

function formatPhaseDate(date) {
    return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) +
        ' ' + date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function openBuyModalWithPrice(ticketIndex, price) {
    const ticket = currentEvent?.tickets?.[ticketIndex];
    if (!ticket) return;
    if (!currentUserProfile) return toast("Inicia sesión para comprar entradas");

    buyState.ticketType = ticket;
    buyState.quantity = 1;
    buyState.unitPrice = price;
    buyState.paymentMethod = 'yape';

    updateBuyTotal();

    document.getElementById("buy_ticket_name").textContent = ticket.name;
    document.getElementById("buy_ticket_price").textContent = `S/. ${Number(price).toFixed(2)}`;
    document.getElementById("buy_qty").textContent = '1';

    showBuyStep(1);
    openModal('modalBuy');
}

function backToEvents() {
    currentEvent = null;
    if (history.state && history.state.section) {
        history.back();
    } else {
        showView('eventsView');
        updateNavActive(0);
    }
}

function showEvents() {
    showView('eventsView');
    updateNavActive(0);
    pushViewState('events', '#eventos');
}

function updateNavActive(index) {
    document.querySelectorAll('.nav-item').forEach((n, i) => {
        n.classList.toggle('active', i === index);
    });
}

// ==========================================
// CANJEAR CÓDIGO (con modal de confirmación)
// ==========================================
let pendingRedeemData = null;

async function redeemCode() {
    const codeInput = document.getElementById("promo_code");
    const code = codeInput.value.trim().toUpperCase();

    if (!code || code.length < 6) return toast("Ingresa un código válido");
    if (!currentEvent) return toast("Error: evento no seleccionado");
    if (!currentUserProfile) return toast("Error: perfil no cargado");

    try {
        // Buscar código en promotorCodes (sistema nuevo) y codes (legacy)
        let codeDoc = null;
        let codeData = null;
        let codeSource = null;

        // 1. Buscar en promotorCodes
        const qNew = query(
            collection(db, "promotorCodes"),
            where("code", "==", code),
            where("event_id", "==", currentEvent.id)
        );
        const snapNew = await getDocs(qNew);
        if (!snapNew.empty) {
            codeDoc = snapNew.docs[0];
            codeData = codeDoc.data();
            codeSource = 'promotorCodes';
        }

        // 2. Fallback: buscar en codes (legacy)
        if (!codeDoc) {
            const qLegacy = query(
                collection(db, "codes"),
                where("code", "==", code),
                where("event_id", "==", currentEvent.id)
            );
            const snapLegacy = await getDocs(qLegacy);
            if (!snapLegacy.empty) {
                codeDoc = snapLegacy.docs[0];
                codeData = codeDoc.data();
                codeSource = 'codes';
            }
        }

        if (!codeDoc) {
            return toast("Código no válido");
        }

        // Validar status
        const blockedStatuses = ['CLAIMED', 'SCANNED', 'USED', 'REJECTED', 'CANCELLED', 'PENDING'];
        if (blockedStatuses.includes(codeData.status)) {
            if (codeData.status === 'PENDING') return toast("Este código está pendiente de aprobación");
            if (codeData.status === 'REJECTED') return toast("Este código fue rechazado");
            return toast("Este código ya fue usado");
        }

        // Status válidos: FREE, ACTIVE, APPROVED
        const validStatuses = ['FREE', 'ACTIVE', 'APPROVED'];
        if (!validStatuses.includes(codeData.status)) {
            return toast("Este código no está disponible");
        }

        // Guardar datos para confirmar después
        pendingRedeemData = {
            code,
            codeDocId: codeDoc.id,
            codeData,
            codeSource,
            event: currentEvent
        };

        // Mostrar modal de confirmación
        document.getElementById("redeem_event_image").src = currentEvent.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600';
        document.getElementById("redeem_event_name").textContent = currentEvent.name;
        document.getElementById("redeem_event_date").textContent = formatDate(currentEvent.date);
        document.getElementById("redeem_event_time").textContent = currentEvent.time || 'Por confirmar';
        document.getElementById("redeem_event_venue").textContent = currentEvent.venue || 'Por confirmar';
        document.getElementById("redeem_ticket_type").textContent = codeData.ticket_name || 'General';

        openModal('modalConfirmRedeem');

    } catch (e) {
        logger.error(e);
        toast("Error al validar código");
    }
}

async function confirmRedeem() {
    if (!pendingRedeemData) return toast("No hay código pendiente");
    if (isProcessing) return;
    isProcessing = true;

    const { code, codeDocId, codeData, codeSource } = pendingRedeemData;

    try {
        closeModal('modalConfirmRedeem');

        const collectionName = codeSource || 'codes';
        const codeRef = doc(db, collectionName, codeDocId);
        const fullName = `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim();

        // Verificar y canjear atómicamente
        await runTransaction(db, async (transaction) => {
            const codeDoc = await transaction.get(codeRef);
            if (!codeDoc.exists()) {
                throw new Error('El código no existe');
            }
            const data = codeDoc.data();
            const blockedSt = ['CLAIMED', 'SCANNED', 'USED', 'REJECTED', 'CANCELLED'];
            if (blockedSt.includes(data.status)) {
                throw new Error('Este código ya fue canjeado');
            }
            transaction.update(codeRef, {
                status: "CLAIMED",
                claimed_by: currentUser.uid,
                claimed_name: fullName,
                claimed_dni: currentUserProfile.doc_number,
                claimed_phone: currentUserProfile.phone,
                claimed_at: new Date().toISOString()
            });
        });

        // Crear ticket después de transacción exitosa
        const qrData = generateQRData(code);
        await addDoc(collection(db, "tickets"), {
            user_id: currentUser.uid,
            user_name: fullName,
            user_doc: currentUserProfile?.doc_number || currentUserProfile?.dni || '',
            user_phone: currentUserProfile?.phone || '',
            user_email: currentUserProfile?.email || '',
            event_id: currentEvent.id,
            event_name: currentEvent.name,
            event_date: currentEvent.date,
            brand_id: currentBrandId,
            ticket_type: codeData.ticket_name || 'General',
            code: code,
            qr_data: qrData,
            type: 'FREE',
            status: 'ACTIVE',
            created_at: new Date().toISOString()
        });

        const codeInput = document.getElementById("promo_code");
        if (codeInput) codeInput.value = '';
        pendingRedeemData = null;

        openModal('modalCodeSuccess');
        launchConfetti();
        loadMyTickets();

    } catch (e) {
        logger.error(e);
        toast(e.message || "Error al canjear código");
    } finally {
        isProcessing = false;
    }
}

function generateQRData(code) {
    const data = {
        c: code,
        e: currentEvent?.id || '',
        u: currentUser?.uid || '',
        b: currentBrandId,
        t: Date.now()
    };
    // Crear firma simple (en producción usar algo más robusto)
    const signature = btoa(`${data.c}-${data.e}-${data.u}-${data.t}`).substring(0, 16);
    data.s = signature;
    return btoa(JSON.stringify(data));
}

// ==========================================
// OBTENER ENTRADA GRATUITA
// ==========================================
let freeTicketState = {
    ticketType: null,
    quantity: 1
};

function openFreeTicketModal(ticketIndex) {
    const ticket = currentEvent?.tickets?.[ticketIndex];
    if (!ticket) return;
    if (!currentUserProfile) return toast("Inicia sesión para obtener entradas");

    freeTicketState.ticketType = ticket;
    freeTicketState.quantity = 1;

    document.getElementById("free_ticket_name").textContent = ticket.name;
    document.getElementById("free_qty").textContent = '1';

    openModal('modalFreeTicket');
}

function changeFreeQty(delta) {
    freeTicketState.quantity = Math.max(1, Math.min(10, freeTicketState.quantity + delta));
    document.getElementById("free_qty").textContent = freeTicketState.quantity;
}

async function claimFreeTickets() {
    if (!currentEvent || !currentUserProfile || !freeTicketState.ticketType) {
        return toast("Error: datos incompletos");
    }
    if (isProcessing) return;
    isProcessing = true;

    const btn = document.querySelector('#modalFreeTicket .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    }

    try {
        const fullName = `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim();
        const ticketType = freeTicketState.ticketType;
        const qty = freeTicketState.quantity;

        // Verificar stock disponible
        if (ticketType.stock !== undefined && ticketType.stock !== null) {
            const eventRef = doc(db, "events", currentEvent.id);
            const eventSnap = await getDoc(eventRef);
            if (eventSnap.exists()) {
                const eventData = eventSnap.data();
                const tickets = eventData.tickets || eventData.ticket_types || [];
                const currentType = tickets.find(t => t.name === ticketType.name);
                if (currentType && currentType.stock !== undefined) {
                    const available = currentType.stock - (currentType.sold || 0);
                    if (qty > available) {
                        toast(`Solo quedan ${Math.max(0, available)} entradas disponibles`);
                        return;
                    }
                }
            }
        }

        for (let i = 0; i < qty; i++) {
            const code = `FREE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            const qrData = generateQRData(code);

            await addDoc(collection(db, "tickets"), {
                user_id: currentUser.uid,
                user_name: fullName,
                user_doc: currentUserProfile?.doc_number || currentUserProfile?.dni || '',
                user_phone: currentUserProfile?.phone || '',
                user_email: currentUserProfile?.email || '',
                event_id: currentEvent.id,
                event_name: currentEvent.name,
                event_date: currentEvent.date,
                brand_id: currentBrandId,
                ticket_type: ticketType.name,
                code: code,
                qr_data: qrData,
                type: 'FREE',
                price_paid: 0,
                status: 'ACTIVE',
                created_at: new Date().toISOString()
            });
        }

        closeModal('modalFreeTicket');
        toast(`${qty} entrada${qty > 1 ? 's' : ''} generada${qty > 1 ? 's' : ''}`);
        loadMyTickets();

        // Mostrar exito con confetti
        openModal('modalFreeSuccess');
        launchConfetti();

    } catch (e) {
        logger.error(e);
        toast("Error al generar entradas");
    } finally {
        isProcessing = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> OBTENER ENTRADAS';
        }
    }
}

// ==========================================
// COMPRAR ENTRADA
// ==========================================
function openBuyModal(ticketIndex) {
    const ticket = currentEvent?.tickets?.[ticketIndex];
    if (!ticket) return;

    buyState.ticketType = ticket;
    buyState.quantity = 1;
    buyState.unitPrice = ticket.price || 0;
    buyState.paymentMethod = 'yape';

    updateBuyTotal();

    document.getElementById("buy_ticket_name").textContent = ticket.name;
    document.getElementById("buy_ticket_price").textContent = `S/. ${Number(ticket.price).toFixed(2)}`;
    document.getElementById("buy_qty").textContent = '1';

    showBuyStep(1);
    openModal('modalBuy');
};

function changeQty(delta) {
    buyState.quantity = Math.max(1, Math.min(10, buyState.quantity + delta));
    document.getElementById("buy_qty").textContent = buyState.quantity;
    updateBuyTotal();
}

function updateBuyTotal() {
    const subtotal = buyState.quantity * buyState.unitPrice;
    buyState.total = subtotal;

    document.getElementById("buy_subtotal").textContent = `S/. ${subtotal.toFixed(2)}`;
    document.getElementById("buy_total").textContent = `S/. ${buyState.total.toFixed(2)}`;
}

function goToPayment() {
    showBuyStep(2);
    loadPaymentInfo();
}

function backToBuyStep1() {
    showBuyStep(1);
}

function backToBuyStep2() {
    showBuyStep(2);
}

function showBuyStep(step) {
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`buy_step${i}`)?.classList.add('hidden');
    }
    document.getElementById(`buy_step${step}`)?.classList.remove('hidden');
}

function selectPaymentMethod(method) {
    buyState.paymentMethod = method;
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-method="${method}"]`)?.classList.add('active');
}

function loadPaymentInfo() {
    const config = currentEvent?.payment_config || {};
    const method = buyState.paymentMethod;

    if (method === 'yape' || method === 'plin') {
        const data = config[method] || config.yape || config;
        document.getElementById("pay_name").textContent = data.name || '---';
        document.getElementById("pay_phone").textContent = data.phone || '---';
        document.getElementById("pay_amount").textContent = `S/. ${buyState.total.toFixed(2)}`;

        const btnQR = document.getElementById("btnShowQR");
        if (btnQR) btnQR.classList.toggle('hidden', !data.qr_image);
    } else {
        const bank = config.bank || {};
        document.getElementById("bank_name").textContent = bank.bank_name || '---';
        document.getElementById("bank_type").textContent = bank.account_type || 'Cuenta de Ahorros';
        document.getElementById("bank_account").textContent = bank.account_number || '---';
        document.getElementById("bank_cci").textContent = bank.cci || '---';
        document.getElementById("bank_holder").textContent = bank.holder_name || '---';
        document.getElementById("bank_amount").textContent = `S/. ${buyState.total.toFixed(2)}`;
    }
}

function showPaymentQR() {
    const config = currentEvent?.payment_config?.yape || currentEvent?.payment_config || {};
    if (config.qr_image) {
        document.getElementById("payment_qr_image").src = config.qr_image;
        openModal('modalPaymentQR');
    }
}

async function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const text = el.textContent.replace('S/. ', '');
    try {
        await navigator.clipboard.writeText(text);
        toast("Copiado");
    } catch (e) {
        toast("Error al copiar");
    }
}

function goToUploadProof() {
    showBuyStep(3);

    // Update title based on selected method
    const titles = { yape: 'Pagar con YAPE', plin: 'Pagar con PLIN', bank: 'Pagar con Transferencia' };
    const titleEl = document.getElementById("paymentMethodTitle");
    if (titleEl) titleEl.textContent = titles[buyState.paymentMethod] || 'Pagar';

    // Show/hide appropriate payment info section
    document.getElementById("payment_yape_plin")?.classList.toggle('hidden', buyState.paymentMethod === 'bank');
    document.getElementById("payment_bank")?.classList.toggle('hidden', buyState.paymentMethod !== 'bank');

    loadPaymentInfo();
}

function previewProofImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById("upload_preview").src = e.target.result;
        document.getElementById("upload_preview").classList.remove('hidden');
        document.getElementById("upload_placeholder").classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

async function sendPaymentProof() {
    const payerFirstName = document.getElementById("proof_payer_name").value.trim();
    const payerLastName = document.getElementById("proof_payer_lastname")?.value.trim() || '';
    const payerName = `${payerFirstName} ${payerLastName}`.trim();
    const operation = document.getElementById("proof_operation").value.trim();
    const imageInput = document.getElementById("proof_image");

    if (!payerFirstName) return toast("Ingresa el nombre de quien pagó");
    if (!operation) return toast("Ingresa el número de operación");
    if (!imageInput.files[0]) return toast("Sube la captura del pago");
    if (isProcessing) return;
    isProcessing = true;

    const btn = document.getElementById("btnSendProof");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
        const fullName = `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim();

        // Subir comprobante a Firebase Storage (evita límite 1MB de Firestore)
        const file = imageInput.files[0];
        const timestamp = Date.now();
        const storageRef = ref(storage, `proofs/${currentBrandId}/${currentEvent.id}/${timestamp}_${file.name}`);
        await uploadBytes(storageRef, file);
        const proofUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "sales"), {
            // Campos para admin
            full_name: fullName,
            client_name: fullName,
            client_dni: currentUserProfile?.doc_number || currentUserProfile?.dni || '',
            client_id: currentUser?.uid || '',
            client_email: currentUserProfile?.email || '',
            client_phone: currentUserProfile?.phone || '',
            total_price: buyState.total,
            proof_image: proofUrl,
            ticket_name: buyState.ticketType.name,
            ticket_id: buyState.ticketType.id || '',
            company_id: currentBrand?.owner_id || '',
            channel: 'web',
            // Campos compartidos
            event_id: currentEvent.id,
            event_name: currentEvent.name,
            event_date: currentEvent.date || '',
            brand_id: currentBrandId,
            quantity: buyState.quantity,
            unit_price: buyState.unitPrice,
            total: buyState.total,
            payment_method: buyState.paymentMethod,
            payer_name: payerName,
            operation_number: operation,
            payment_proof: proofUrl,
            status: "PENDING",
            created_at: new Date().toISOString()
        });

        showBuyStep(4);
        loadMyTickets();

    } catch (e) {
        logger.error(e);
        toast("Error al enviar comprobante");
    } finally {
        isProcessing = false;
        btn.disabled = false;
        btn.innerHTML = 'ENVIAR COMPROBANTE <i class="fa-solid fa-arrow-right"></i>';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==========================================
// MIS ENTRADAS
// ==========================================
function loadMyTickets() {
    if (!currentUser || !currentBrandId) return;

    // Si los listeners ya están activos, solo re-renderizar
    if (ticketsUnsub && purchasesUnsub) {
        processTicketsData();
        return;
    }

    // Cleanup anteriores
    cleanupTicketListeners();

    // Listener: tickets de esta marca
    const qTickets = query(
        collection(db, "tickets"),
        where("user_id", "==", currentUser.uid),
        where("brand_id", "==", currentBrandId)
    );
    ticketsUnsub = onSnapshot(qTickets, (snap) => {
        myTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processTicketsData();
    }, (error) => {
        logger.error("Error listener tickets:", error);
    });

    // Listener: compras pendientes de esta marca
    const qPurchases = query(
        collection(db, "sales"),
        where("client_id", "==", currentUser.uid),
        where("brand_id", "==", currentBrandId),
        where("status", "==", "PENDING")
    );
    purchasesUnsub = onSnapshot(qPurchases, (snap) => {
        myPurchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processTicketsData();
    }, (error) => {
        logger.error("Error listener purchases:", error);
    });
}

function processTicketsData() {
    // Actualizar badge
    const activeCount = myTickets.filter(t => t.status === 'ACTIVE').length;
    const badge = document.getElementById("tickets_count");
    if (badge) {
        badge.textContent = activeCount;
        badge.classList.toggle('hidden', activeCount === 0);
    }

    updateFAB();
}

function openMyTickets() {
    showView('myTicketsView');
    updateNavActive(1);
    pushViewState('my-tickets', '#mis-entradas');
    updateTicketTabCounters();
    renderMyTickets();
}

function updateTicketTabCounters() {
    const now = new Date();
    const upcomingCount = myTickets.filter(t => t.status === 'ACTIVE' && (!t.event_date || new Date(t.event_date) >= now)).length;
    const pastCount = myTickets.filter(t => t.status === 'ACTIVE' && t.event_date && new Date(t.event_date) < now).length
        + myTickets.filter(t => t.status === 'SCANNED' || t.status === 'USED').length;
    const pendingCount = myPurchases.length;

    const tabs = document.querySelectorAll('.tickets-tabs .tab-btn');
    if (tabs[0]) tabs[0].innerHTML = `Próximos <span class="tab-badge">${upcomingCount}</span>`;
    if (tabs[1]) tabs[1].innerHTML = `Pasados <span class="tab-badge">${pastCount}</span>`;
    if (tabs[2]) tabs[2].innerHTML = `Pendientes <span class="tab-badge">${pendingCount}</span>`;
}

function switchTicketTab(tab) {
    currentTicketTab = tab;
    document.querySelectorAll('.tickets-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tickets-tabs .tab-btn[onclick*="${tab}"]`)?.classList.add('active');
    renderMyTickets();
}

function renderMyTickets() {
    const container = document.getElementById("my_tickets_list");
    const now = new Date();

    if (currentTicketTab === 'pending') {
        // Pending purchases
        if (!myPurchases.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock"></i><p>No tienes compras pendientes</p></div>';
            return;
        }
        container.innerHTML = myPurchases.map(p => `
            <div class="my-ticket-card">
                <div class="my-ticket-header">
                    <span class="my-ticket-event">${escapeHtml(p.event_name)}</span>
                    <span class="my-ticket-type">${escapeHtml(p.ticket_name || p.ticket_type || '')}</span>
                </div>
                <div class="my-ticket-details">
                    <span><i class="fa-solid fa-ticket"></i> ${p.quantity}x</span>
                    <span><i class="fa-solid fa-dollar-sign"></i> S/. ${(p.total || 0).toFixed(2)}</span>
                </div>
                <div class="my-ticket-status">
                    <span class="status-badge pending">Verificando pago</span>
                </div>
            </div>
        `).join('');
        return;
    }

    // Group tickets by event
    let filtered = [];
    if (currentTicketTab === 'upcoming') {
        filtered = myTickets.filter(t => {
            if (t.status !== 'ACTIVE') return false;
            // Sin fecha → mostrar en próximos por defecto
            if (!t.event_date) return true;
            return new Date(t.event_date) >= now;
        });
    } else {
        // past - includes used/scanned and active with past dates
        filtered = myTickets.filter(t => {
            if (t.status === 'SCANNED' || t.status === 'USED') return true;
            if (t.status === 'ACTIVE' && t.event_date && new Date(t.event_date) < now) return true;
            return false;
        });
    }

    if (!filtered.length) {
        const msg = currentTicketTab === 'upcoming' ? 'No tienes entradas próximas' : 'No tienes entradas pasadas';
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-ticket"></i><p>${msg}</p></div>`;
        return;
    }

    // Group by event
    const groups = {};
    filtered.forEach(t => {
        const key = t.event_id || t.event_name;
        if (!groups[key]) {
            groups[key] = {
                event_name: t.event_name,
                event_date: t.event_date,
                tickets: []
            };
        }
        groups[key].tickets.push(t);
    });

    container.innerHTML = Object.entries(groups).map(([key, group]) => {
        const tickets = group.tickets;
        // Sub-agrupar por tipo de entrada
        const typeGroups = {};
        tickets.forEach(t => {
            const typeName = t.ticket_type || 'General';
            if (!typeGroups[typeName]) typeGroups[typeName] = [];
            typeGroups[typeName].push(t);
        });

        const typeGroupsHtml = Object.entries(typeGroups).map(([typeName, typeTickets]) => {
            const indices = typeTickets.map(t => myTickets.indexOf(t));
            const indicesJson = JSON.stringify(indices);
            return `
                <div class="ticket-type-subgroup" onclick='openTicketCarousel(${indicesJson})'>
                    <div class="ticket-type-subgroup-info">
                        <span class="ticket-type-subgroup-name">${escapeHtml(typeName)}</span>
                        <span class="ticket-type-subgroup-count">${typeTickets.length} entrada${typeTickets.length > 1 ? 's' : ''}</span>
                    </div>
                    <span class="btn-ver-type">
                        Ver <i class="fa-solid fa-chevron-right"></i>
                    </span>
                </div>
            `;
        }).join('');

        return `
            <div class="ticket-group">
                <div class="ticket-group-header" onclick="toggleTicketGroup('${key}')">
                    <div class="ticket-group-header-info">
                        <h4>${escapeHtml(group.event_name)}</h4>
                        <span><i class="fa-regular fa-calendar"></i> ${formatDate(group.event_date)}</span>
                    </div>
                    <span class="ticket-group-count">${tickets.length}</span>
                    <i class="fa-solid fa-chevron-right ticket-group-chevron" id="chevron_${key}"></i>
                </div>
                <div class="ticket-group-body" id="group_${key}">
                    ${typeGroupsHtml}
                </div>
            </div>
        `;
    }).join('');

    // Auto-expand first group
    const firstKey = Object.keys(groups)[0];
    if (firstKey) toggleTicketGroup(firstKey);
}

function toggleTicketGroup(key) {
    const body = document.getElementById(`group_${key}`);
    const chevron = document.getElementById(`chevron_${key}`);
    if (!body) return;

    const isOpen = body.classList.contains('open');
    // Close all groups first
    document.querySelectorAll('.ticket-group-body').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.ticket-group-chevron').forEach(c => c.classList.remove('open'));

    if (!isOpen) {
        body.classList.add('open');
        if (chevron) chevron.classList.add('open');
    }
}

function viewTicketFromGroup(globalIdx) {
    showTicketQR(myTickets[globalIdx], 'myTicketsView');
}

function viewTicketQR(index, tab) {
    const list = tab === 'active' ? myTickets.filter(t => t.status === 'ACTIVE') : myTickets.filter(t => t.status !== 'ACTIVE');
    showTicketQR(list[index], 'myTicketsView');
};

function backToMyTickets() {
    viewingTicket = null;
    if (history.state && history.state.section) {
        history.back();
    } else {
        showView('myTicketsView');
    }
}

function backFromTicketQR() {
    viewingTicket = null;
    if (history.state && history.state.section) {
        history.back();
    } else {
        showView(ticketQROrigin || 'myTicketsView');
    }
}

// ==========================================
// CARRUSEL DE ENTRADAS v7.2.0
// ==========================================

function openTicketCarousel(indices) {
    carouselOrigin = 'myTicketsView';
    _openCarousel(indices);
}

function openTicketCarouselFromEvent(indices) {
    carouselOrigin = 'eventDetailView';
    _openCarousel(indices);
}

function _openCarousel(indices) {
    carouselIndices = indices;
    carouselCurrent = 0;

    // Si solo hay 1 entrada, ir directo a la vista QR individual
    if (indices.length === 1) {
        showTicketQR(myTickets[indices[0]], carouselOrigin);
        return;
    }

    showView('ticketCarouselView');
    pushViewState('carousel', '#carrusel', { origin: carouselOrigin });
    renderCarousel();
}

function renderCarousel() {
    const track = document.getElementById('carousel_track');
    const dotsContainer = document.getElementById('carousel_dots');
    const hintEl = document.getElementById('carousel_hint');
    if (!track || !dotsContainer) return;

    // Título del carrusel
    const firstTicket = myTickets[carouselIndices[0]];
    const titleEl = document.getElementById('carousel_title');
    if (titleEl) titleEl.textContent = `${firstTicket?.ticket_type || 'Entradas'} (${carouselIndices.length})`;

    // Generar slides
    track.innerHTML = carouselIndices.map((globalIdx, i) => {
        const ticket = myTickets[globalIdx];
        const eventData = allEvents.find(e => e.id === ticket.event_id);
        const clientName = ticket.user_name ||
            (currentUserProfile ? `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim() : 'Cliente');
        const docNumber = ticket.user_doc || currentUserProfile?.doc_number || currentUserProfile?.dni || '---';
        const docType = currentUserProfile?.doc_type || 'DNI';
        const venue = eventData?.venue || eventData?.location || '';
        const address = eventData?.address || '';
        const location = [venue, address].filter(Boolean).join(', ') || 'Por confirmar';
        const datetime = `${formatDate(ticket.event_date)}${eventData?.time ? ' - ' + eventData.time : ''}`;
        const isFree = ticket.type === 'FREE' || ticket.price_paid === 0 || ticket.price === 0;

        return `
            <div class="carousel-slide" data-index="${i}">
                <div class="ticket-download-card" id="carousel-card-${i}">
                    <div class="qr-container" id="carouselQR_${i}"></div>
                    ${isFree ? '<p class="aforo-note">Sujeto a capacidad de aforo</p>' : ''}
                    <hr class="ticket-divider">
                    <div class="ticket-dl-section">
                        <h2 class="ticket-dl-event-name">${escapeHtml(ticket.event_name || '')}</h2>
                        <p class="ticket-dl-meta"><i class="fa-solid fa-location-dot"></i> <span>${escapeHtml(location)}</span></p>
                        <p class="ticket-dl-meta"><i class="fa-regular fa-calendar"></i> <span>${datetime}</span></p>
                    </div>
                    <hr class="ticket-divider">
                    <div class="ticket-dl-section ticket-dl-client">
                        <h3>${escapeHtml(clientName)}</h3>
                        <p class="ticket-dl-doc">${docType}: ${docNumber}</p>
                    </div>
                    <hr class="ticket-divider">
                    <div class="ticket-dl-section ticket-dl-type-section">
                        <span class="ticket-type-badge">${escapeHtml(ticket.ticket_type || 'General')}</span>
                    </div>
                    <div class="ticket-dl-section ticket-dl-brand">
                        <span>Productora: ${escapeHtml(currentBrand?.name || '')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Generar dots
    dotsContainer.innerHTML = carouselIndices.map((_, i) =>
        `<span class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></span>`
    ).join('');

    if (hintEl) hintEl.classList.toggle('hidden', carouselIndices.length <= 1);

    updateCarouselCounter();

    // Generar QRs después de que el DOM se actualice
    setTimeout(() => {
        carouselIndices.forEach((globalIdx, i) => {
            const ticket = myTickets[globalIdx];
            const container = document.getElementById(`carouselQR_${i}`);
            if (container && typeof QRCode !== 'undefined') {
                container.innerHTML = '';
                const qrCode = ticket.code || ticket.qr_token || '';
                if (qrCode) {
                    new QRCode(container, {
                        text: qrCode,
                        width: 200,
                        height: 200,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.L
                    });
                }
            }
        });
    }, 150);

    // Listener de scroll snap
    track.removeEventListener('scroll', handleCarouselScroll);
    track.addEventListener('scroll', handleCarouselScroll);
}

function handleCarouselScroll() {
    const track = document.getElementById('carousel_track');
    if (!track) return;
    const slideWidth = track.offsetWidth;
    if (slideWidth === 0) return;
    const newIndex = Math.round(track.scrollLeft / slideWidth);
    if (newIndex !== carouselCurrent && newIndex >= 0 && newIndex < carouselIndices.length) {
        carouselCurrent = newIndex;
        updateCarouselDots();
        updateCarouselCounter();
    }
}

function goToSlide(index) {
    const track = document.getElementById('carousel_track');
    if (!track) return;
    carouselCurrent = index;
    track.scrollTo({ left: index * track.offsetWidth, behavior: 'smooth' });
    updateCarouselDots();
    updateCarouselCounter();
}

function updateCarouselDots() {
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === carouselCurrent);
    });
}

function updateCarouselCounter() {
    const el = document.getElementById('carousel_counter');
    if (el) el.textContent = `${carouselCurrent + 1} de ${carouselIndices.length}`;
}

function backFromCarousel() {
    if (history.state && history.state.section) {
        history.back();
    } else {
        showView(carouselOrigin || 'myTicketsView');
    }
}

function toggleCarouselBrightness() {
    const content = document.querySelector('#ticketCarouselView .carousel-track');
    if (content) content.classList.toggle('brightness-mode');
}

function downloadCarouselTicket() {
    const ticket = myTickets[carouselIndices[carouselCurrent]];
    if (!ticket) return;
    const captureEl = document.getElementById(`carousel-card-${carouselCurrent}`);
    if (captureEl && window.html2canvas) {
        toast('Generando imagen...', 'info');
        html2canvas(captureEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = `entrada-${ticket.code || 'ticket'}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                toast('Entrada descargada');
            })
            .catch(() => toast('Error al descargar', 'error'));
    }
}

// ==========================================
// COMPARTIR ENTRADA v7.2.0
// ==========================================

async function getShareToken(ticket) {
    if (!ticket || !ticket.id) return null;
    if (ticket.share_token) return ticket.share_token;

    try {
        // Usar Cloud Function para guardar el token (bypassa reglas de Firestore)
        const fn = httpsCallable(cloudFunctions, 'generateShareToken');
        const result = await fn({ ticketId: ticket.id });

        if (result.data?.success && result.data?.token) {
            ticket.share_token = result.data.token;
            return result.data.token;
        }
    } catch (e) {
        logger.error('Error generando share token via CF:', e);
    }

    // Fallback: intentar updateDoc directo
    try {
        const token = crypto.randomUUID ? crypto.randomUUID() :
            Math.random().toString(36).substring(2) + Date.now().toString(36);
        await updateDoc(doc(db, "tickets", ticket.id), {
            share_token: token,
            share_token_created_at: new Date().toISOString()
        });
        ticket.share_token = token;
        return token;
    } catch (e2) {
        logger.error('Error guardando share token:', e2);
        return null;
    }
}

function buildShareUrl(ticket, token) {
    const hostname = window.location.hostname;
    const brandSlug = currentBrandSlug || currentBrand?.slug || 'parygo';
    if (hostname.includes('.parygo.com') || hostname.includes('.parygo.')) {
        return `https://${brandSlug}.parygo.com/ticket.html?id=${ticket.id}&token=${token}`;
    }
    return `${window.location.origin}/ticket.html?brand=${brandSlug}&id=${ticket.id}&token=${token}`;
}

function buildShareText(ticket, url) {
    return `*${ticket.event_name || 'Evento'}*\n` +
           `${formatDate(ticket.event_date)}\n` +
           `${ticket.ticket_type || 'General'}\n\n` +
           `Ver entrada:\n${url}`;
}

async function shareViaWhatsApp() {
    const token = await getShareToken(sharingTicket);
    if (!token) { toast('Error generando enlace', 'error'); return; }
    closeModal('modalShare');
    const url = buildShareUrl(sharingTicket, token);
    const text = buildShareText(sharingTicket, url);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        return true;
    } catch (e) {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) { /* fallback below */ }
    }
    return fallbackCopyToClipboard(text);
}

async function shareViaCopyLink() {
    const token = await getShareToken(sharingTicket);
    if (!token) { toast('Error generando enlace', 'error'); return; }
    closeModal('modalShare');
    const url = buildShareUrl(sharingTicket, token);
    const ok = await copyTextToClipboard(url);
    toast(ok ? 'Enlace copiado' : 'No se pudo copiar', ok ? 'success' : 'error');
}

async function shareViaMessage() {
    const token = await getShareToken(sharingTicket);
    if (!token) { toast('Error generando enlace', 'error'); return; }
    closeModal('modalShare');
    const url = buildShareUrl(sharingTicket, token);
    const text = buildShareText(sharingTicket, url);
    if (navigator.share) {
        try { await navigator.share({ title: sharingTicket.event_name || 'Entrada', text, url }); return; } catch (e) { /* fallback */ }
    }
    const ok = await copyTextToClipboard(text);
    if (ok) toast('Texto copiado al portapapeles');
}

// ==========================================
// v5.0.0 - SISTEMA UNIFICADO DE VISTA QR
// ==========================================
async function showTicketQR(ticket, origin) {
    if (!ticket) return;
    viewingTicket = ticket;
    ticketQROrigin = origin || 'myTicketsView';
    showView('ticketQRView');
    pushViewState('ticket-qr', '#entrada', { origin: ticketQROrigin });
    // Small delay to ensure canvas is rendered in DOM before QR generation
    await new Promise(r => setTimeout(r, 100));
    await populateTicketQR(ticket);
}

async function populateTicketQR(ticket) {
    if (!ticket) return;

    const eventData = allEvents.find(e => e.id === ticket.event_id);

    // Event name
    const nameEl = document.getElementById("qr_event_name");
    if (nameEl) nameEl.textContent = ticket.event_name || '';

    // Location
    const locEl = document.getElementById("qr_event_location");
    if (locEl) {
        const venue = eventData?.venue || eventData?.location || '';
        const address = eventData?.address || '';
        locEl.textContent = [venue, address].filter(Boolean).join(', ') || 'Por confirmar';
    }

    // Date + Time
    const dtEl = document.getElementById("qr_event_datetime");
    if (dtEl) {
        dtEl.textContent = `${formatDate(ticket.event_date)}${eventData?.time ? ' - ' + eventData.time : ''}`;
    }

    // Client name - fallback to currentUserProfile if ticket.user_name is empty
    const holderEl = document.getElementById("qr_holder_name");
    if (holderEl) {
        let clientName = ticket.user_name || '';
        if (!clientName && currentUserProfile) {
            clientName = `${currentUserProfile.name || ''} ${currentUserProfile.lastname || ''}`.trim();
        }
        holderEl.textContent = clientName || 'Cliente';
    }

    // Client doc - fallback to currentUserProfile
    const docEl = document.getElementById("qr_holder_doc");
    if (docEl) {
        const docNumber = ticket.user_doc || currentUserProfile?.doc_number || currentUserProfile?.dni || '---';
        const docType = currentUserProfile?.doc_type || 'DNI';
        docEl.textContent = `${docType}: ${docNumber}`;
    }

    // Ticket type badge
    const typeEl = document.getElementById("qr_ticket_type");
    if (typeEl) typeEl.textContent = ticket.ticket_type || 'General';

    // Aforo note - only for free tickets (price === 0)
    const aforoEl = document.getElementById("qr_aforo_note");
    if (aforoEl) {
        const isFree = ticket.type === 'FREE' || ticket.price_paid === 0 || ticket.price === 0;
        aforoEl.classList.toggle('hidden', !isFree);
    }

    // Brand name
    const brandEl = document.getElementById("qr_brand_name");
    if (brandEl) brandEl.textContent = `Productora: ${currentBrand?.name || ''}`;

    // Generate QR
    generateTicketQR(ticket);
}

function generateTicketQR(ticket) {
    const container = document.getElementById("ticketQRContainer");
    if (!container) return;
    if (!ticket) return;

    // Usar SOLO el código corto del ticket (compatible con scanner)
    const qrCode = ticket.code || ticket.qr_token || '';
    if (!qrCode) return;

    // Limpiar QR anterior
    container.innerHTML = '';

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(container, {
                text: qrCode,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        } else {
            logger.error('generateTicketQR: QRCode library not available');
            container.innerHTML = '<p style="color:#999;font-size:12px;">Error cargando QR</p>';
        }
    } catch (e) {
        logger.error('Error generating QR:', e);
        container.innerHTML = '<p style="color:#999;font-size:12px;">Error generando QR</p>';
    }
}

let brightnessMode = false;

function toggleBrightness() {
    brightnessMode = !brightnessMode;
    const content = document.querySelector('.ticket-qr-content');
    if (content) {
        content.classList.toggle('brightness-mode', brightnessMode);
    }
    // Increase screen brightness hint
    if (brightnessMode) {
        toast('Modo brillo activado para escaneo', 'info');
    }
}

async function downloadTicket() {
    const captureEl = document.getElementById("ticket-download-content");
    if (!captureEl) return;

    // Try html2canvas for full ticket image
    if (window.html2canvas) {
        try {
            toast('Generando imagen...', 'info');
            const canvas = await html2canvas(captureEl, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false
            });
            const link = document.createElement('a');
            link.download = `entrada-${viewingTicket?.code || 'ticket'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            toast('Entrada descargada exitosamente');
            return;
        } catch (e) {
            logger.error('html2canvas error:', e);
        }
    }

    // Fallback: download QR image from container
    const qrContainer = document.getElementById("ticketQRContainer");
    const qrImg = qrContainer?.querySelector('img');
    if (!qrImg || !qrImg.src) return;
    const link = document.createElement('a');
    link.download = `entrada-${viewingTicket?.code || 'ticket'}.png`;
    link.href = qrImg.src;
    link.click();
    toast('Entrada descargada exitosamente');
}

async function shareTicket() {
    if (!viewingTicket) return;
    sharingTicket = viewingTicket;
    openModal('modalShare');
}

function shareCarouselTicket() {
    if (!carouselIndices.length) return;
    const ticket = myTickets[carouselIndices[carouselCurrent]];
    if (!ticket) return;
    sharingTicket = ticket;
    openModal('modalShare');
}

// ==========================================
// ENVIAR TICKET POR WHATSAPP
// ==========================================
function sendTicketToWhatsApp() {
    if (!viewingTicket) return;
    const ticket = viewingTicket;
    const eventData = allEvents.find(e => e.id === ticket.event_id);
    const eventName = ticket.event_name || eventData?.name || 'Evento';
    const eventDate = formatDate(ticket.event_date);
    const venue = eventData?.venue || eventData?.location || '';
    const ticketType = ticket.ticket_type || 'General';
    const code = ticket.code || '';
    const phone = currentUserProfile?.phone || '';

    const brandSlug = currentBrandSlug || currentBrand?.slug || '';
    const hostname = window.location.hostname;
    let portalUrl;
    if (hostname.includes('.parygo.com') || hostname.includes('.parygo.')) {
        portalUrl = `https://${brandSlug}.parygo.com`;
    } else {
        portalUrl = `${window.location.origin}/cliente.html?brand=${brandSlug}`;
    }

    const message = `🎉 ¡Tu entrada para ${eventName}!\n\n📅 ${eventDate}\n${venue ? '📍 ' + venue + '\n' : ''}🎫 ${ticketType}\n🔑 Codigo: ${code}\n\n👉 Ver tu entrada: ${portalUrl}`;

    const cleaned = (phone || '').replace(/\D/g, '');
    const fullPhone = cleaned.length === 9 ? `51${cleaned}` : cleaned;
    const waLink = fullPhone
        ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
}

function sendBuyConfirmToWhatsApp() {
    const eventName = currentEvent?.name || 'Evento';
    const eventDate = currentEvent?.date ? formatDate(currentEvent.date) : '';
    const venue = currentEvent?.venue || currentEvent?.location || '';
    const ticketType = buyState.ticketType?.name || 'General';
    const phone = currentUserProfile?.phone || '';

    const message = `🎉 ¡Compra registrada para ${eventName}!\n\n📅 ${eventDate}\n${venue ? '📍 ' + venue + '\n' : ''}🎫 ${ticketType}\n💰 Total: S/. ${buyState.total.toFixed(2)}\n\n⏳ Tu pago esta siendo verificado. Te notificaremos cuando tus entradas esten listas.`;

    const cleaned = (phone || '').replace(/\D/g, '');
    const fullPhone = cleaned.length === 9 ? `51${cleaned}` : cleaned;
    const waLink = fullPhone
        ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
}

// ==========================================
// OG META TAGS DINAMICOS
// ==========================================
function updateOGMetaTags(title, description, image) {
    const setMeta = (prop, content) => {
        let el = document.querySelector(`meta[property="${prop}"]`);
        if (el) el.setAttribute('content', content);
    };
    if (title) setMeta('og:title', title);
    if (description) setMeta('og:description', description);
    if (image) setMeta('og:image', image);
}

// ==========================================
// PERFIL
// ==========================================
function openProfile() {
    document.getElementById("profileOverlay").classList.remove("hidden");
    setTimeout(() => document.getElementById("profileDrawer").classList.add("open"), 50);
}

function closeProfile() {
    document.getElementById("profileDrawer").classList.remove("open");
    setTimeout(() => document.getElementById("profileOverlay").classList.add("hidden"), 300);
}

function doLogout() {
    openModal('modalLogout');
}

async function confirmLogout() {
    closeModal('modalLogout');
    cleanupAllListeners();
    await signOut(auth);
    currentUser = null;
    currentUserProfile = null;
    location.reload();
}

// ==========================================
// PROFILE PHOTO
// ==========================================
function uploadProfilePhoto() {
    document.getElementById("profile_photo_input")?.click();
}

async function handleProfilePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const base64 = await fileToBase64(file);

        // Update Firestore (usar ID del perfil, no UID directo)
        const profileDocId = currentUserProfile?.id || `${currentUser.uid}_${currentBrandId}`;
        await updateDoc(doc(db, "clientes", profileDocId), {
            photo: base64,
            updated_at: new Date().toISOString()
        });

        currentUserProfile.photo = base64;
        updateUserUI();
        toast('Foto actualizada exitosamente');
    } catch (e) {
        logger.error(e);
        toast('Error al subir foto');
    }
}

// ==========================================
// PURCHASE HISTORY
// ==========================================
async function openPurchaseHistory() {
    closeProfile();
    openModal('modalPurchaseHistory');

    const container = document.getElementById("purchase_history_content");
    container.innerHTML = `
        <div class="skeleton skeleton-card" style="height:80px;"></div>
        <div class="skeleton skeleton-card" style="height:80px;"></div>
    `;

    try {
        // Load all sales for this user and brand
        const q = query(
            collection(db, "sales"),
            where("client_id", "==", currentUser.uid),
            where("brand_id", "==", currentBrandId)
        );
        const snap = await getDocs(q);
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!sales.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-receipt"></i><h3>Sin compras</h3><p>No tienes compras registradas</p></div>';
            return;
        }

        // Sort by date desc
        sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        container.innerHTML = `<div class="purchase-history-list">${sales.map(s => {
            const statusMap = {
                'PENDING': { label: 'Pendiente', cls: 'pending' },
                'APPROVED': { label: 'Aprobada', cls: 'approved' },
                'REJECTED': { label: 'Rechazada', cls: 'rejected' }
            };
            const st = statusMap[s.status] || statusMap['PENDING'];
            return `
                <div class="purchase-history-item">
                    <div class="purchase-history-header">
                        <span class="purchase-history-event">${escapeHtml(s.event_name || 'Evento')}</span>
                        <span class="purchase-history-status ${st.cls}">${st.label}</span>
                    </div>
                    <div class="purchase-history-details">
                        <span><i class="fa-solid fa-ticket"></i> ${s.quantity || 1}x ${escapeHtml(s.ticket_name || '')}</span>
                        <span><i class="fa-solid fa-dollar-sign"></i> S/. ${(s.total || s.total_price || 0).toFixed(2)}</span>
                        <span><i class="fa-regular fa-calendar"></i> ${formatDate(s.created_at)}</span>
                    </div>
                </div>
            `;
        }).join('')}</div>`;
    } catch (e) {
        logger.error(e);
        container.innerHTML = '<div class="empty-state"><p>Error al cargar historial</p></div>';
    }
}

// ==========================================
// CONFETTI HELPER
// ==========================================
function launchConfetti() {
    if (window.confetti) {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#ffffff', '#d4d4d8', '#9a9aa3', '#5a5a63', '#3a3a42']
        });
    }
}

// ==========================================
// PULL TO REFRESH
// ==========================================
function setupPullToRefresh() {
    let startY = 0;
    let pulling = false;
    const threshold = 80;

    const eventsMain = document.querySelector('.events-main');
    if (!eventsMain) return;

    eventsMain.addEventListener('touchstart', (e) => {
        if (eventsMain.scrollTop === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    eventsMain.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > threshold) {
            const indicator = document.getElementById("pullToRefresh");
            if (indicator) indicator.classList.remove("hidden");
        }
    }, { passive: true });

    eventsMain.addEventListener('touchend', async () => {
        if (!pulling) return;
        pulling = false;
        const indicator = document.getElementById("pullToRefresh");
        if (indicator && !indicator.classList.contains("hidden")) {
            loadEvents();
            loadMyTickets();
            indicator.classList.add("hidden");
            toast('Actualizado', 'success');
        }
    }, { passive: true });
}

// ==========================================
// UTILIDADES
// ==========================================
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    currentViewId = id;
}

// ==========================================
// HISTORY API - Navegación con botón atrás
// ==========================================
function pushViewState(section, hash, extra = {}) {
    if (handlingPopstate) return;
    const state = { section, ...extra };
    history.pushState(state, '', hash);
}

function replaceViewState(section, hash, extra = {}) {
    const state = { section, ...extra };
    history.replaceState(state, '', hash);
}

window.addEventListener('popstate', function(event) {
    handlingPopstate = true;
    try {
        const state = event.state;
        if (!state || !state.section) {
            // Sin estado → volver a eventos (si está logueado)
            if (currentViewId && currentViewId !== 'authView') {
                currentEvent = null;
                viewingTicket = null;
                showView('eventsView');
                updateNavActive(0);
            }
            return;
        }
        switch (state.section) {
            case 'events':
                currentEvent = null;
                showView('eventsView');
                updateNavActive(0);
                break;
            case 'event-detail':
                if (state.eventIndex !== undefined && allEvents[state.eventIndex]) {
                    currentEvent = allEvents[state.eventIndex];
                    showView('eventDetailView');
                    document.getElementById("detail_image").src = currentEvent.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600';
                    document.getElementById("detail_name").textContent = currentEvent.name;
                    document.getElementById("detail_date").textContent = formatDate(currentEvent.date);
                    document.getElementById("detail_time").textContent = currentEvent.time || 'Por confirmar';
                    document.getElementById("detail_venue").textContent = currentEvent.venue || 'Por confirmar';
                    renderTicketsForSale();
                    updateDetailCountdown();
                    renderMyEventTickets();
                } else {
                    currentEvent = null;
                    showView('eventsView');
                    updateNavActive(0);
                }
                break;
            case 'my-tickets':
                showView('myTicketsView');
                updateNavActive(1);
                updateTicketTabCounters();
                renderMyTickets();
                break;
            case 'ticket-qr':
                // No restaurar QR (requiere ticket completo), volver a origen
                showView(state.origin || 'myTicketsView');
                break;
            case 'carousel':
                showView(state.origin || 'myTicketsView');
                break;
            default:
                showView('eventsView');
                updateNavActive(0);
        }
    } finally {
        handlingPopstate = false;
    }
});

function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

function formatDate(dateStr) {
    if (!dateStr) return '---';
    // Si es un Firestore Timestamp (tiene .toDate), convertirlo
    if (dateStr.toDate) return dateStr.toDate().toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
    // Si es solo fecha YYYY-MM-DD (10 chars, sin T), agregar T00:00:00 para evitar desfase UTC
    const str = String(dateStr);
    const d = (str.length === 10 && str[4] === '-') ? new Date(str + 'T00:00:00') : new Date(str);
    return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ==========================================
// TOGGLE PASSWORD VISIBILITY
// ==========================================
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = input.closest('.password-wrapper');
    if (!wrapper) return;

    const icon = wrapper.querySelector('.password-toggle i');
    if (!icon) return;

    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

// ==========================================
// PASSWORD STRENGTH CHECKER
// ==========================================
function checkPasswordStrength() {
    const password = document.getElementById("reg_password")?.value || '';
    const strengthBar = document.getElementById("password_strength");
    const hint = document.getElementById("password_hint");

    if (!strengthBar || !hint) return;

    if (password.length === 0) {
        strengthBar.className = 'password-strength';
        hint.textContent = '';
        return;
    }

    let strength = 'weak';
    let message = 'Contraseña débil (mínimo 6 caracteres)';
    let hintClass = 'field-hint error';

    if (password.length >= 8 && /[0-9]/.test(password)) {
        strength = 'strong';
        message = 'Contraseña fuerte';
        hintClass = 'field-hint success';
    } else if (password.length >= 6) {
        strength = 'medium';
        message = 'Contraseña media (agrega números para mejorar)';
        hintClass = 'field-hint warning';
    }

    strengthBar.className = `password-strength ${strength}`;
    hint.textContent = message;
    hint.className = hintClass;
}

function checkPasswordMatch() {
    const password = document.getElementById("reg_password")?.value || '';
    const confirmPassword = document.getElementById("reg_confirm_password")?.value || '';
    const hint = document.getElementById("password_match");

    if (!hint) return;

    if (confirmPassword.length === 0) {
        hint.textContent = '';
        return;
    }

    if (password === confirmPassword) {
        hint.textContent = 'Las contraseñas coinciden';
        hint.className = 'field-hint success';
    } else {
        hint.textContent = 'Las contraseñas no coinciden';
        hint.className = 'field-hint error';
    }
}

// ==========================================
// CHANGE PASSWORD MODAL
// ==========================================
function openChangePasswordModal() {
    closeProfile();

    // Limpiar campos
    document.getElementById("change_current_password").value = '';
    document.getElementById("change_new_password").value = '';
    document.getElementById("change_confirm_password").value = '';
    document.getElementById("change_password_strength").className = 'password-strength';
    document.getElementById("change_password_hint").textContent = '';
    document.getElementById("change_password_match").textContent = '';

    openModal('modalChangePassword');
}

function checkNewPasswordStrength() {
    const password = document.getElementById("change_new_password")?.value || '';
    const strengthBar = document.getElementById("change_password_strength");
    const hint = document.getElementById("change_password_hint");

    if (!strengthBar || !hint) return;

    if (password.length === 0) {
        strengthBar.className = 'password-strength';
        hint.textContent = '';
        return;
    }

    let strength = 'weak';
    let message = 'Contraseña débil (mínimo 6 caracteres)';
    let hintClass = 'field-hint error';

    if (password.length >= 8 && /[0-9]/.test(password)) {
        strength = 'strong';
        message = 'Contraseña fuerte';
        hintClass = 'field-hint success';
    } else if (password.length >= 6) {
        strength = 'medium';
        message = 'Contraseña media (agrega números para mejorar)';
        hintClass = 'field-hint warning';
    }

    strengthBar.className = `password-strength ${strength}`;
    hint.textContent = message;
    hint.className = hintClass;
}

function checkNewPasswordMatch() {
    const password = document.getElementById("change_new_password")?.value || '';
    const confirmPassword = document.getElementById("change_confirm_password")?.value || '';
    const hint = document.getElementById("change_password_match");

    if (!hint) return;

    if (confirmPassword.length === 0) {
        hint.textContent = '';
        return;
    }

    if (password === confirmPassword) {
        hint.textContent = 'Las contraseñas coinciden';
        hint.className = 'field-hint success';
    } else {
        hint.textContent = 'Las contraseñas no coinciden';
        hint.className = 'field-hint error';
    }
}

async function handleChangePassword() {
    const currentPassword = document.getElementById("change_current_password").value;
    const newPassword = document.getElementById("change_new_password").value;
    const confirmPassword = document.getElementById("change_confirm_password").value;

    // Validaciones
    if (!currentPassword) return toast("Ingresa tu contraseña actual");
    if (!newPassword) return toast("Ingresa la nueva contraseña");
    if (newPassword.length < 6) return toast("La nueva contraseña debe tener mínimo 6 caracteres");
    if (newPassword !== confirmPassword) return toast("Las contraseñas no coinciden");
    if (currentPassword === newPassword) return toast("La nueva contraseña debe ser diferente");

    const btn = document.getElementById("btnChangePassword");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CAMBIANDO...';

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No hay usuario autenticado");

        // Importar las funciones necesarias de Firebase Auth
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

        // Re-autenticar primero
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // Cambiar contraseña
        await updatePassword(user, newPassword);

        // Actualizar timestamp en Firestore (usar ID del perfil)
        const profileDocId = currentUserProfile?.id || `${user.uid}_${currentBrandId}`;
        await updateDoc(doc(db, "clientes", profileDocId), {
            updated_at: new Date().toISOString()
        });

        toast("Contraseña cambiada exitosamente");
        closeModal('modalChangePassword');

    } catch (e) {
        logger.error("Error cambiando contraseña:", e);

        let errorMsg = "Error al cambiar contraseña";
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            errorMsg = "La contraseña actual es incorrecta";
        } else if (e.code === 'auth/weak-password') {
            errorMsg = "La contraseña es muy débil";
        } else if (e.code === 'auth/requires-recent-login') {
            errorMsg = "Por seguridad, cierra sesión y vuelve a iniciar sesión antes de cambiar la contraseña";
        }

        toast(errorMsg);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> CAMBIAR CONTRASEÑA';
}

// ==========================================
// CHANGE EMAIL
// ==========================================
function openChangeEmailModal() {
    closeProfile();
    document.getElementById("change_email_password").value = '';
    document.getElementById("change_new_email").value = '';
    openModal('modalChangeEmail');
}

async function handleChangeEmail() {
    const password = document.getElementById("change_email_password").value;
    const newEmail = document.getElementById("change_new_email").value.trim().toLowerCase();

    if (!password) return toast("Ingresa tu contraseña actual");
    if (!newEmail) return toast("Ingresa el nuevo email");
    if (!validateEmail(newEmail)) return toast("Ingresa un email válido");

    const btn = document.getElementById("btnChangeEmail");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CAMBIANDO...';

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No hay usuario autenticado");

        const { EmailAuthProvider, reauthenticateWithCredential, updateEmail } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        await updateEmail(user, newEmail);

        // Update Firestore (usar ID del perfil)
        const profileDocId = currentUserProfile?.id || `${user.uid}_${currentBrandId}`;
        await updateDoc(doc(db, "clientes", profileDocId), {
            email: newEmail,
            updated_at: new Date().toISOString()
        });

        currentUserProfile.email = newEmail;
        updateUserUI();
        toast("Email cambiado exitosamente");
        closeModal('modalChangeEmail');

    } catch (e) {
        logger.error("Error cambiando email:", e);
        let errorMsg = "Error al cambiar email";
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            errorMsg = "La contraseña es incorrecta";
        } else if (e.code === 'auth/email-already-in-use') {
            errorMsg = "Este email ya está en uso";
        } else if (e.code === 'auth/requires-recent-login') {
            errorMsg = "Por seguridad, cierra sesión y vuelve a iniciar";
        }
        toast(errorMsg);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-envelope"></i> CAMBIAR EMAIL';
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Enter en inputs de login
    document.getElementById("login_email")?.addEventListener("keypress", e => {
        if (e.key === "Enter") document.getElementById("login_password")?.focus();
    });
    document.getElementById("login_password")?.addEventListener("keypress", e => {
        if (e.key === "Enter") window.handleLogin();
    });

    // Enter en paso 1 de registro (DNI)
    document.getElementById("reg_dni")?.addEventListener("keypress", e => {
        if (e.key === "Enter") window.handleCheckDNI();
    });

    // Enter en inputs de registro paso 2
    document.getElementById("reg_password")?.addEventListener("keypress", e => {
        if (e.key === "Enter") window.handleRegister();
    });

    // Modales - cerrar al hacer clic fuera
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => {
            if (e.target === m) m.classList.add('hidden');
        });
    });

    // Pull to refresh
    setupPullToRefresh();
}

// ==========================================
// EXPONER FUNCIONES GLOBALMENTE (para onclick en HTML)
// ==========================================
// Las funciones deben estar en window para que onclick pueda accederlas
// ya que estamos usando módulos ES6 (type="module")

// Autenticación
window.showLoginScreen = showLoginScreen;
window.showRegisterScreen = showRegisterScreen;
window.handleLogin = handleLogin;
window.handleCheckDNI = handleCheckDNI;
window.handleRegister = handleRegister;
window.backToRegStep1 = backToRegStep1;
window.selectRegDocType = selectRegDocType;
window.togglePassword = togglePassword;
window.checkPasswordStrength = checkPasswordStrength;
window.checkPasswordMatch = checkPasswordMatch;
window.openChangePasswordModal = openChangePasswordModal;
window.checkNewPasswordStrength = checkNewPasswordStrength;
window.checkNewPasswordMatch = checkNewPasswordMatch;
window.handleChangePassword = handleChangePassword;

// Navegación
window.showEvents = showEvents;
window.backToEvents = backToEvents;
window.openEventDetail = openEventDetail;
window.backToMyTickets = backToMyTickets;
window.backFromTicketQR = backFromTicketQR;

// Tickets
window.openMyTickets = openMyTickets;
window.switchTicketTab = switchTicketTab;
window.viewTicketQR = viewTicketQR;
window.downloadTicket = downloadTicket;
window.shareTicket = shareTicket;
window.redeemCode = redeemCode;
window.confirmRedeem = confirmRedeem;

// Entradas gratuitas
window.openFreeTicketModal = openFreeTicketModal;
window.changeFreeQty = changeFreeQty;
window.claimFreeTickets = claimFreeTickets;

// Compra
window.openBuyModal = openBuyModal;
window.openBuyModalWithPrice = openBuyModalWithPrice;
window.changeQty = changeQty;
window.goToPayment = goToPayment;
window.backToBuyStep1 = backToBuyStep1;
window.backToBuyStep2 = backToBuyStep2;
window.selectPaymentMethod = selectPaymentMethod;
window.showPaymentQR = showPaymentQR;
window.copyToClipboard = copyToClipboard;
window.goToUploadProof = goToUploadProof;
window.previewProofImage = previewProofImage;
window.sendPaymentProof = sendPaymentProof;

// v5.0.0 - Funciones QR unificadas
window.showTicketQR = showTicketQR;
window.generateTicketQR = generateTicketQR;

// Perfil
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.doLogout = doLogout;
window.confirmLogout = confirmLogout;
window.uploadProfilePhoto = uploadProfilePhoto;
window.handleProfilePhoto = handleProfilePhoto;
window.openPurchaseHistory = openPurchaseHistory;

// Modales
window.closeModal = closeModal;

// Eventos - búsqueda y filtros
window.filterEvents = filterEvents;
window.filterByDate = filterByDate;

// QR - brillo
window.toggleBrightness = toggleBrightness;

// Otras
window.selectDocType = selectDocType;
window.linkAccountToProfile = linkAccountToProfile;
window.logoutAndRestart = logoutAndRestart;
window.backToStep1 = backToStep1;

// v4.0.0+ funciones
window.toggleFavorite = toggleFavorite;
window.goToNextEventTicket = goToNextEventTicket;
window.toggleTicketGroup = toggleTicketGroup;
window.viewTicketFromGroup = viewTicketFromGroup;
window.viewTicketFromDetail = viewTicketFromDetail;
window.openChangeEmailModal = openChangeEmailModal;
window.handleChangeEmail = handleChangeEmail;

// v7.2.0 - Carrusel y compartir
window.openTicketCarousel = openTicketCarousel;
window.openTicketCarouselFromEvent = openTicketCarouselFromEvent;
window.goToSlide = goToSlide;
window.backFromCarousel = backFromCarousel;
window.toggleCarouselBrightness = toggleCarouselBrightness;
window.downloadCarouselTicket = downloadCarouselTicket;
window.shareCarouselTicket = shareCarouselTicket;
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaCopyLink = shareViaCopyLink;
window.shareViaMessage = shareViaMessage;
window.sendTicketToWhatsApp = sendTicketToWhatsApp;
window.sendBuyConfirmToWhatsApp = sendBuyConfirmToWhatsApp;
