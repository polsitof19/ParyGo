// ==========================================
// PARYGO PROMOTOR V3 - SISTEMA DE CÓDIGOS
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc, 
    setDoc,
    updateDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIG
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyANnihyrgd02ViR_GeKn6Mdf85nLwUjQg0",
    authDomain: "parygo-da36a.firebaseapp.com",
    projectId: "parygo-da36a",
    storageBucket: "parygo-da36a.firebasestorage.app",
    messagingSenderId: "58655250311",
    appId: "1:58655250311:web:9b8f46dd35d0a44ce2e522"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentUser = null;
let selectedBrandId = null;
let currentEvent = null;
let myQuotas = [];
let myCodes = [];
let allEvents = [];
let brandsCache = {};
let lastGeneratedCode = null;

// Caracteres seguros (sin O, 0, I, L, 1 para evitar confusión)
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ==========================================
// GENERAR CÓDIGO ÚNICO
// ==========================================
function generateUniqueCode(eventPrefix) {
    // Genera 6 caracteres aleatorios
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
    }
    // Formato: PREFIJO + CÓDIGO = 8 caracteres
    // Ejemplo: JP4X7KM2
    return (eventPrefix || 'PG').substring(0, 2).toUpperCase() + code;
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        setTimeout(hideSplash, 500);
        if (user) {
            await loadUserData(user.uid);
        } else {
            showView('loginView');
        }
    });
    
    setupEventListeners();
});

function hideSplash() {
    const splash = document.getElementById("splashScreen");
    if (splash) {
        splash.style.opacity = "0";
        setTimeout(() => splash.classList.add("hidden"), 300);
    }
}

// ==========================================
// CARGAR USUARIO
// ==========================================
async function loadUserData(uid) {
    try {
        const snap = await getDoc(doc(db, "staff", uid));
        if (!snap.exists() || snap.data().role !== "promoter") {
            toast("No tienes acceso como promotor");
            await signOut(auth);
            return showView('loginView');
        }
        
        currentUser = { id: uid, ...snap.data() };
        const brands = currentUser.allowed_brands || currentUser.companies || [];
        
        if (!brands.length) {
            toast("No tienes marcas asignadas");
            return;
        }
        
        brands.length === 1 ? await selectBrand(brands[0]) : await showBrandSelector();
    } catch (e) {
        console.error(e);
        toast("Error al cargar");
        showView('loginView');
    }
}

// ==========================================
// LOGIN
// ==========================================
async function handleLogin() {
    const email = document.getElementById("login_email").value.trim().toLowerCase();
    const pass = document.getElementById("login_pass").value;
    const btn = document.getElementById("btnLogin");
    
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.style.display = 'none';

    if (!email || !pass) return toast("Ingresa tus datos");

    btn.disabled = true;
    btn.innerHTML = '<span>Verificando...</span>';
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        let errorMsg = "Error al iniciar sesión";
        switch (e.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
                errorMsg = "Correo o contraseña incorrectos";
                break;
            case 'auth/user-not-found':
                errorMsg = "Usuario no encontrado";
                break;
            case 'auth/too-many-requests':
                errorMsg = "Demasiados intentos. Espera unos minutos";
                break;
            case 'auth/invalid-email':
                errorMsg = "Email inválido";
                break;
        }
        toast(errorMsg);

        if (errorDiv) {
            errorDiv.textContent = errorMsg;
            errorDiv.style.display = 'block';
        }

        btn.disabled = false;
        btn.innerHTML = '<span>INGRESAR</span><i class="fa-solid fa-arrow-right"></i>';
    }
}

// ==========================================
// REGISTRO
// ==========================================
async function handleCheckDNI() {
    const dni = document.getElementById("reg_dni").value.trim();
    const btn = document.getElementById("btnCheckDni");
    
    if (dni.length !== 8) return toast("DNI debe tener 8 dígitos");
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InBhdWxzZWJhc3RpYW40MzlAZ21haWwuY29tIn0.6OW3nuSrcpVbUbhakLiTa7K4IAcWEJz4LJ1pALTNlSI";
        const res = await fetch("https://corsproxy.io/?" + encodeURIComponent(`https://dniruc.apisperu.com/api/v1/dni/${dni}?token=${TOKEN}`));
        const data = await res.json();
        
        if (data?.nombres) {
            const name = `${data.nombres} ${data.apellidoPaterno || ""} ${data.apellidoMaterno || ""}`.trim();
            document.getElementById("reg_name").value = name;
            document.getElementById("reg_name").setAttribute("readonly", "true");
            document.getElementById("reg_step2").classList.remove("hidden");
            toast("✅ Encontrado");
        } else {
            enableManualEntry();
        }
    } catch {
        enableManualEntry();
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
}

function enableManualEntry() {
    const inp = document.getElementById("reg_name");
    inp.value = "";
    inp.removeAttribute("readonly");
    document.getElementById("reg_step2").classList.remove("hidden");
    inp.focus();
}

async function handleRegister() {
    const name = document.getElementById("reg_name").value.trim();
    const dni = document.getElementById("reg_dni").value.trim();
    const email = document.getElementById("reg_email").value.trim().toLowerCase();
    const phone = document.getElementById("reg_phone").value.trim();
    const pass = document.getElementById("reg_pass").value;
    const btn = document.getElementById("btnRegister");
    
    if (!name || !email || !phone || !pass || dni.length !== 8) return toast("Completa todos los campos");
    if (pass.length < 6) return toast("Contraseña mínimo 6 caracteres");
    
    btn.disabled = true;
    btn.innerHTML = '<span>Procesando...</span>';
    
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "staff", cred.user.uid), {
            name, dni, email, phone, role: "promoter", status: "ACTIVE", allowed_brands: [], created_at: new Date().toISOString()
        });
        toast("🎉 ¡Cuenta creada!");
    } catch (e) {
        toast(e.code === "auth/email-already-in-use" ? "Correo ya existe" : "Error");
        btn.disabled = false;
        btn.innerHTML = '<span>CREAR CUENTA</span><i class="fa-solid fa-check"></i>';
    }
}

// ==========================================
// MARCAS
// ==========================================
async function showBrandSelector() {
    showView('brandView');
    document.getElementById("brand_user_name").textContent = currentUser.name.split(" ")[0];
    
    const container = document.getElementById("brands_grid");
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    
    const brandIds = currentUser.allowed_brands || currentUser.companies || [];
    const brands = [];
    
    for (const id of brandIds) {
        if (!id) continue;
        if (!brandsCache[id]) {
            const snap = await getDoc(doc(db, "brands", id)) || await getDoc(doc(db, "companies", id));
            if (snap?.exists()) brandsCache[id] = { id, ...snap.data() };
        }
        if (brandsCache[id]) brands.push(brandsCache[id]);
    }
    
    if (!brands.length) {
        container.innerHTML = '<div class="empty-state"><p>Sin marcas</p></div>';
        return;
    }
    
    container.innerHTML = brands.map(b => `
        <div class="brand-card" onclick="selectBrand('${b.id}')">
            <div class="brand-card-logo" style="background:${b.color||'#f43f5e'}">${b.logo?`<img src="${b.logo}">`:'<i class="fa-solid fa-crown"></i>'}</div>
            <div class="brand-card-name">${escapeHtml(b.name)}</div>
            <div class="brand-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
    `).join("");
}

window.selectBrand = async (id) => {
    selectedBrandId = id;
    if (!brandsCache[id]) {
        const snap = await getDoc(doc(db, "brands", id));
        if (snap?.exists()) brandsCache[id] = { id, ...snap.data() };
    }
    await showEventsList();
};

window.changeBrand = () => { selectedBrandId = null; currentEvent = null; showBrandSelector(); };

// ==========================================
// EVENTOS
// ==========================================
async function showEventsList() {
    showView('eventsView');
    updateEventsHeader();
    
    const container = document.getElementById("events_grid");
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    
    try {
        const [s1, s2] = await Promise.all([
            getDocs(query(collection(db, "events"), where("brand_id", "==", selectedBrandId))),
            getDocs(query(collection(db, "events"), where("company_id", "==", selectedBrandId)))
        ]);
        
        const map = new Map();
        s1.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        s2.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        allEvents = Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (!allEvents.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No hay eventos</p></div>';
            return;
        }
        
        container.innerHTML = allEvents.map((e, i) => `
            <div class="event-card" onclick="selectEvent(${i})">
                <img class="event-card-image" src="${e.image||'https://images.unsplash.com/photo-1492684223066-81342ee5ff30'}">
                <div class="event-card-body">
                    <div class="event-card-title">${escapeHtml(e.name)}</div>
                    <div class="event-card-meta"><i class="fa-regular fa-calendar"></i> ${e.date||'---'}</div>
                </div>
            </div>
        `).join("");
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>Error al cargar</p></div>';
    }
}

window.selectEvent = async (i) => { 
    currentEvent = allEvents[i]; 
    if (currentEvent) { 
        showView('dashboardView'); 
        await loadDashboardData(); 
    } 
};

// ==========================================
// DASHBOARD
// ==========================================
async function loadDashboardData() {
    if (!currentEvent) return;
    
    // Header
    document.getElementById("dash_event_name").textContent = currentEvent.name;
    document.getElementById("dash_event_date").textContent = currentEvent.date || "---";
    updateAvatars();
    
    try {
        // Cargar cuotas asignadas
        const qQuotas = query(
            collection(db, "quotas"),
            where("promoter_id", "==", currentUser.id),
            where("event_id", "==", currentEvent.id)
        );
        myQuotas = (await getDocs(qQuotas)).docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Cargar códigos generados
        const qCodes = query(
            collection(db, "codes"),
            where("promoter_id", "==", currentUser.id),
            where("event_id", "==", currentEvent.id)
        );
        myCodes = (await getDocs(qCodes)).docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Calcular estadísticas
        const totalAssigned = myQuotas.reduce((sum, q) => sum + (q.assigned || 0), 0);
        const totalGenerated = myCodes.length;
        const totalAvailable = totalAssigned - totalGenerated;
        const totalClaimed = myCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED').length;
        const totalScanned = myCodes.filter(c => c.status === 'SCANNED').length;
        
        // Actualizar UI
        document.getElementById("stat_assigned").textContent = totalAssigned;
        document.getElementById("stat_generated").textContent = totalGenerated;
        document.getElementById("stat_available").textContent = totalAvailable;
        document.getElementById("stat_claimed").textContent = totalClaimed;
        document.getElementById("stat_scanned").textContent = totalScanned;
        
        // Habilitar/deshabilitar botón generar
        const fab = document.getElementById("btnGenerateCode");
        fab.disabled = totalAvailable <= 0;
        
        // Renderizar listas
        renderCodesList();
        renderClaimedList();
        fillTicketDropdown();
        
    } catch (e) {
        console.error(e);
        toast("Error al cargar datos");
    }
}

function renderCodesList() {
    const container = document.getElementById("codes_list");
    
    if (!myCodes.length) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-ticket"></i><p>No has generado códigos aún</p></div>';
        return;
    }
    
    // Ordenar: más recientes primero
    const sorted = [...myCodes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    container.innerHTML = sorted.map(c => {
        let statusClass = 'free';
        let statusText = '⚪ Libre';
        
        if (c.status === 'CLAIMED') {
            statusClass = 'claimed';
            statusText = '✅ Canjeado';
        } else if (c.status === 'SCANNED') {
            statusClass = 'scanned';
            statusText = '🎫 Escaneado';
        }
        
        return `
            <div class="code-card">
                <div class="code-info">
                    <div class="code-value">${c.code}</div>
                    <div class="code-status ${statusClass}">${statusText}</div>
                </div>
                <div class="code-actions">
                    <button class="btn-copy" onclick="copyCode('${c.code}', this)" title="Copiar">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function renderClaimedList() {
    const container = document.getElementById("claimed_list");
    
    // Solo códigos canjeados o escaneados
    const claimed = myCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED');
    
    if (!claimed.length) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-check"></i><p>Nadie ha canjeado tus códigos aún</p></div>';
        return;
    }
    
    // Ordenar por fecha de canje
    claimed.sort((a, b) => new Date(b.claimed_at || b.created_at) - new Date(a.claimed_at || a.created_at));
    
    container.innerHTML = claimed.map(c => `
        <div class="claimed-card">
            <div class="claimed-info">
                <h4>${escapeHtml(c.claimed_name || 'Sin nombre')}</h4>
                <p>${c.code}</p>
            </div>
            <span class="claimed-badge ${c.status === 'SCANNED' ? 'scanned' : ''}">${c.status === 'SCANNED' ? '🎫 Entró' : '✅ Canjeado'}</span>
        </div>
    `).join("");
}

function fillTicketDropdown() {
    const select = document.getElementById("gen_ticket_type");
    select.innerHTML = '<option value="">Selecciona tipo...</option>';
    
    if (!currentEvent.tickets?.length) return;
    
    myQuotas.forEach(q => {
        const ticket = currentEvent.tickets.find(t => t.id === q.ticket_id);
        if (!ticket) return;
        
        // Contar cuántos códigos ya generó de este tipo
        const generated = myCodes.filter(c => c.ticket_id === q.ticket_id).length;
        const available = (q.assigned || 0) - generated;
        
        if (available > 0) {
            select.innerHTML += `<option value="${q.ticket_id}" data-quota="${q.id}" data-available="${available}">${escapeHtml(ticket.name)} (${available} disponibles)</option>`;
        }
    });
    
    // Evento change para actualizar info
    select.onchange = () => {
        const opt = select.options[select.selectedIndex];
        const av = opt?.dataset?.available || 0;
        document.getElementById("gen_available_count").textContent = av;
    };
}

// ==========================================
// GENERAR CÓDIGO
// ==========================================
async function handleGenerateCode() {
    const select = document.getElementById("gen_ticket_type");
    const ticketId = select.value;
    const btn = document.getElementById("btnConfirmGenerate");
    
    if (!ticketId) return toast("Selecciona tipo de entrada");
    
    const opt = select.options[select.selectedIndex];
    const quotaId = opt.dataset.quota;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    
    try {
        // Obtener prefijo del evento (primeras 2 letras del nombre)
        const prefix = (currentEvent.code_prefix || currentEvent.name || "PG")
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 2)
            .toUpperCase();
        
        // Generar código único
        let code = generateUniqueCode(prefix);
        
        // Verificar que no exista (muy improbable pero por seguridad)
        let exists = true;
        let attempts = 0;
        while (exists && attempts < 10) {
            const check = await getDocs(query(collection(db, "codes"), where("code", "==", code)));
            if (check.empty) {
                exists = false;
            } else {
                code = generateUniqueCode(prefix);
                attempts++;
            }
        }
        
        if (exists) throw new Error("No se pudo generar código único");
        
        // Guardar en Firestore
        await addDoc(collection(db, "codes"), {
            code: code,
            event_id: currentEvent.id,
            brand_id: selectedBrandId,
            promoter_id: currentUser.id,
            promoter_name: currentUser.name,
            ticket_id: ticketId,
            quota_id: quotaId,
            status: "FREE", // FREE → CLAIMED → SCANNED
            claimed_by: null,
            claimed_name: null,
            claimed_at: null,
            scanned_at: null,
            created_at: new Date().toISOString()
        });
        
        // Guardar para compartir
        lastGeneratedCode = code;
        
        // Mostrar resultado
        document.getElementById("generated_code").textContent = code;
        closeModal('modalGenerate');
        openModal('modalCodeResult');
        
        // Recargar datos
        await loadDashboardData();
        
    } catch (e) {
        console.error(e);
        toast("Error: " + e.message);
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> GENERAR CÓDIGO';
}

// ==========================================
// COPIAR Y COMPARTIR
// ==========================================
window.copyCode = async (code, btn) => {
    try {
        await navigator.clipboard.writeText(code);
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        toast("✅ Código copiado");
        
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        }, 2000);
    } catch (e) {
        toast("Error al copiar");
    }
};

window.copyGeneratedCode = async () => {
    const code = document.getElementById("generated_code").textContent;
    try {
        await navigator.clipboard.writeText(code);
        toast("✅ Código copiado");
    } catch (e) {
        toast("Error al copiar");
    }
};

window.shareCode = async () => {
    const code = lastGeneratedCode || document.getElementById("generated_code").textContent;
    const text = `🎫 Tu código de entrada para ${currentEvent.name}:\n\n${code}\n\nCanjéalo en: [TU_URL_DE_CANJE]`;
    
    if (navigator.share) {
        try {
            await navigator.share({ text });
        } catch (e) {
            // Usuario canceló
        }
    } else {
        // Fallback: copiar al portapapeles
        try {
            await navigator.clipboard.writeText(text);
            toast("✅ Mensaje copiado");
        } catch (e) {
            toast("Error al compartir");
        }
    }
};

// ==========================================
// UI HELPERS
// ==========================================
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`tab_${tab}`)?.classList.add('active');
};

function updateEventsHeader() {
    const brand = brandsCache[selectedBrandId];
    if (!brand) return;
    
    const logo = document.getElementById("header_brand_logo");
    logo.innerHTML = brand.logo ? `<img src="${brand.logo}">` : '<i class="fa-solid fa-crown"></i>';
    logo.style.background = brand.color || '#f43f5e';
    document.getElementById("header_brand_name").textContent = brand.name;
    updateAvatars();
}

function updateAvatars() {
    const initials = getInitials(currentUser?.name || "PR");
    ['header_avatar', 'dash_avatar', 'profile_avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initials;
    });
}

function getInitials(name) {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

window.openGenerateModal = () => {
    fillTicketDropdown();
    document.getElementById("gen_ticket_type").selectedIndex = 0;
    const total = myQuotas.reduce((s, q) => s + (q.assigned || 0), 0) - myCodes.length;
    document.getElementById("gen_available_count").textContent = total;
    openModal('modalGenerate');
};

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

// ==========================================
// PERFIL
// ==========================================
window.openProfile = () => {
    document.getElementById("profile_name").textContent = currentUser?.name || "---";
    document.getElementById("profile_dni").textContent = currentUser?.dni || "---";
    document.getElementById("profile_email").textContent = currentUser?.email || "---";
    document.getElementById("profile_phone").textContent = currentUser?.phone || "---";
    updateAvatars();
    document.getElementById("profileOverlay").classList.remove("hidden");
    setTimeout(() => document.getElementById("profileDrawer").classList.add("open"), 50);
};

window.closeProfile = () => {
    document.getElementById("profileDrawer").classList.remove("open");
    setTimeout(() => document.getElementById("profileOverlay").classList.add("hidden"), 300);
};

window.doLogout = async () => {
    if (!confirm("¿Cerrar sesión?")) return;
    await signOut(auth);
    showView('loginView');
};

// ==========================================
// UTILIDADES
// ==========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || "";
    return div.innerHTML;
}

window.toast = (msg) => {
    const c = document.getElementById("toast-container");
    if (!c) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
};

window.showLogin = () => showView('loginView');
window.showRegister = () => showView('registerView');

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    document.getElementById("btnLogin")?.addEventListener("click", handleLogin);
    document.getElementById("login_pass")?.addEventListener("keypress", e => e.key === "Enter" && handleLogin());
    document.getElementById("btnCheckDni")?.addEventListener("click", handleCheckDNI);
    document.getElementById("btnRegister")?.addEventListener("click", handleRegister);
    document.getElementById("btnBackEvents")?.addEventListener("click", () => { currentEvent = null; showEventsList(); });
    document.getElementById("btnConfirmGenerate")?.addEventListener("click", handleGenerateCode);
    
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => e.target === m && m.classList.add('hidden'));
    });
}

