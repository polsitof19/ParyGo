// ==========================================
// PARYGO PROMOTOR V3 - SISTEMA DE CÓDIGOS
// ==========================================

import { db, auth, functions } from './config.js';
import { detectBrandSlug, loadBrandBySlug } from '../utils/brand-detector.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection,
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
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentUser = null;
let selectedBrandId = null;
let subdomainBrandId = null;
let currentEvent = null;
let myQuotas = [];
let myCodes = [];        // Colección "codes" antigua (para compatibilidad)
let myPromotorCodes = []; // Nueva colección "promotorCodes"
let allEvents = [];
let brandsCache = {};
let currentViewIdPromo = null;
let handlingPopstate = false;
let lastGeneratedCode = null;
let isProcessing = false;
let pendingBuyTicket = null; // Ticket seleccionado para compra

// Real-time listener references
let eventsUnsubs = [];
let dashboardUnsubs = [];
let eventsSnap1 = [];
let eventsSnap2 = [];
let eventsBrandId = null;
let dashboardEventId = null;

function cleanupDashboardListeners() {
    dashboardUnsubs.forEach(unsub => { try { unsub(); } catch(e) {} });
    dashboardUnsubs = [];
    dashboardEventId = null;
}

function cleanupEventsListeners() {
    eventsUnsubs.forEach(unsub => { try { unsub(); } catch(e) {} });
    eventsUnsubs = [];
    eventsSnap1 = [];
    eventsSnap2 = [];
    eventsBrandId = null;
}

function cleanupAllListeners() {
    cleanupDashboardListeners();
    cleanupEventsListeners();
}

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
document.addEventListener("DOMContentLoaded", async () => {
    // Detectar marca desde subdominio
    const brandSlug = detectBrandSlug();
    if (brandSlug) {
        const brand = await loadBrandBySlug(brandSlug);
        if (brand) {
            subdomainBrandId = brand.id;
            document.title = `${brand.name} - Promotores`;
        }
    }

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

        const userData = snap.data();
        if (userData.status === 'INACTIVE') {
            toast("Tu cuenta está desactivada");
            await signOut(auth);
            return showView('loginView');
        }

        currentUser = { id: uid, ...userData };
        const brands = currentUser.allowed_brands || currentUser.companies || [];

        if (!brands.length) {
            toast("No tienes marcas asignadas");
            return;
        }

        // Si hay marca desde subdominio y el promotor tiene acceso, auto-seleccionar
        if (subdomainBrandId && brands.includes(subdomainBrandId)) {
            await selectBrand(subdomainBrandId);
        } else if (brands.length === 1) {
            await selectBrand(brands[0]);
        } else {
            await showBrandSelector();
        }
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
    if (isProcessing) return;

    const email = document.getElementById("login_email").value.trim().toLowerCase();
    const pass = document.getElementById("login_pass").value;
    const btn = document.getElementById("btnLogin");

    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.style.display = 'none';

    if (!email || !pass) return toast("Ingresa tus datos");

    isProcessing = true;
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
    } finally {
        isProcessing = false;
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

    if (!/^\d{8}$/.test(dni)) return toast("DNI debe tener 8 dígitos");

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // 1. Buscar si ya está registrado en Firestore (colección staff)
        const staffQuery = query(collection(db, "staff"), where("dni", "==", dni));
        const staffSnap = await getDocs(staffQuery);

        if (!staffSnap.empty) {
            const existing = staffSnap.docs[0].data();
            const name = existing.name || `${existing.nombres || ""} ${existing.lastname || ""}`.trim();
            if (name) {
                document.getElementById("reg_name").value = name;
                document.getElementById("reg_name").setAttribute("readonly", "true");
                document.getElementById("reg_step2").classList.remove("hidden");
                toast("DNI encontrado");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
                return;
            }
        }

        // 2. Si no está en Firestore, consultar API RENIEC
        const fn = httpsCallable(functions, 'consultaDNIPublic');
        const result = await fn({ dni });
        const data = result.data;

        if (data?.success && data?.nombres) {
            const name = `${data.nombres} ${data.apellidoPaterno || ""} ${data.apellidoMaterno || ""}`.trim();
            document.getElementById("reg_name").value = name;
            document.getElementById("reg_name").setAttribute("readonly", "true");
            document.getElementById("reg_step2").classList.remove("hidden");
            toast("Datos encontrados");
        } else {
            // 3. API no encontró el DNI → permitir llenar manualmente
            enableManualEntry();
        }
    } catch (e) {
        console.error("Error consultando DNI:", e);
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
    toast("Ingresa tu nombre manualmente");
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
    if (!handlingPopstate) history.replaceState({ section: 'brands' }, '', '#marcas');
    document.getElementById("brand_user_name").textContent = (currentUser?.name || "Promotor").split(" ")[0];
    
    const container = document.getElementById("brands_grid");
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    
    const brandIds = currentUser.allowed_brands || currentUser.companies || [];
    const brands = [];
    
    for (const id of brandIds) {
        if (!id) continue;
        if (!brandsCache[id]) {
            let snap = await getDoc(doc(db, "brands", id));
            if (!snap.exists()) snap = await getDoc(doc(db, "companies", id));
            if (snap.exists()) brandsCache[id] = { id, ...snap.data() };
        }
        if (brandsCache[id]) brands.push(brandsCache[id]);
    }
    
    if (!brands.length) {
        container.innerHTML = '<div class="empty-state"><p>Sin marcas</p></div>';
        return;
    }
    
    container.innerHTML = brands.map(b => `
        <div class="brand-card" onclick="selectBrand('${escapeHtml(b.id)}')">
            <div class="brand-card-logo" style="background:${escapeHtml(b.color||'#f43f5e')}">${b.logo?`<img src="${escapeHtml(b.logo)}">`:'<i class="fa-solid fa-crown"></i>'}</div>
            <div class="brand-card-name">${escapeHtml(b.name)}</div>
            <div class="brand-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
    `).join("");
}

window.selectBrand = async (id) => {
    try {
        selectedBrandId = id;
        if (!brandsCache[id]) {
            const snap = await getDoc(doc(db, "brands", id));
            if (snap?.exists()) brandsCache[id] = { id, ...snap.data() };
        }
        showEventsList();
    } catch (error) {
        console.error('Error seleccionando marca:', error);
        toast("Error al seleccionar marca");
    }
};

window.changeBrand = () => {
    selectedBrandId = null;
    currentEvent = null;
    cleanupAllListeners();
    if (history.state?.section) {
        history.back();
    } else {
        showBrandSelector();
    }
};

// ==========================================
// EVENTOS
// ==========================================
function showEventsList() {
    showView('eventsView');
    if (!handlingPopstate) history.pushState({ section: 'events' }, '', '#eventos');
    updateEventsHeader();
    cleanupDashboardListeners();

    const container = document.getElementById("events_grid");

    // Si el listener ya está activo para esta marca, solo re-renderizar
    if (eventsUnsubs.length > 0 && eventsBrandId === selectedBrandId) {
        renderEventsList();
        return;
    }

    // Limpiar listeners anteriores (puede haber cambiado de marca)
    cleanupEventsListeners();
    eventsBrandId = selectedBrandId;

    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    const q1 = query(collection(db, "events"), where("brand_id", "==", selectedBrandId));
    const q2 = query(collection(db, "events"), where("company_id", "==", selectedBrandId));

    const unsub1 = onSnapshot(q1, (snap) => {
        eventsSnap1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndRenderEvents();
    }, (error) => {
        console.error("Error listener eventos (brand_id):", error);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
        eventsSnap2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndRenderEvents();
    }, (error) => {
        console.error("Error listener eventos (company_id):", error);
    });

    eventsUnsubs = [unsub1, unsub2];
}

function mergeAndRenderEvents() {
    const map = new Map();
    eventsSnap1.forEach(e => map.set(e.id, e));
    eventsSnap2.forEach(e => map.set(e.id, e));
    allEvents = Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    renderEventsList();
}

function renderEventsList() {
    const container = document.getElementById("events_grid");
    if (!container) return;

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
}

window.selectEvent = (i) => {
    if (i < 0 || i >= allEvents.length) return;
    const event = allEvents[i];
    if (!event) return;

    // Verificar que el evento pertenece a la marca seleccionada
    if (event.brand_id !== selectedBrandId && event.company_id !== selectedBrandId) {
        toast("No tienes acceso a este evento");
        return;
    }

    currentEvent = event;
    showView('dashboardView');
    if (!handlingPopstate) history.pushState({ section: 'dashboard', eventIndex: i }, '', '#dashboard');
    loadDashboardData();
};

// ==========================================
// DASHBOARD
// ==========================================
function loadDashboardData() {
    if (!currentEvent) return;

    // Header
    const firstName = (currentUser?.name || 'Promotor').split(' ')[0];
    document.getElementById("dash_greeting").textContent = `Hola, ${firstName}`;
    document.getElementById("dash_event_name").textContent = currentEvent.name;
    document.getElementById("dash_event_date").textContent = formatEventDate(currentEvent.date, currentEvent.time);

    // Event card image
    const imgEl = document.getElementById("dash_event_img");
    if (imgEl) imgEl.src = currentEvent.image || '';

    // Brand name on event card
    const brand = brandsCache[selectedBrandId];
    const brandEl = document.getElementById("dash_event_brand");
    if (brandEl) brandEl.textContent = brand ? `EN ${brand.name.toUpperCase()}` : '';

    updateAvatars();

    // Si los listeners ya están activos para este evento, solo re-renderizar
    if (dashboardEventId === currentEvent.id && dashboardUnsubs.length > 0) {
        processDashboardData();
        return;
    }

    // Limpiar listeners anteriores (puede haber cambiado de evento)
    cleanupDashboardListeners();
    dashboardEventId = currentEvent.id;

    // Listener: cuotas asignadas
    const qQuotas = query(
        collection(db, "quotas"),
        where("promoter_id", "==", currentUser.id),
        where("event_id", "==", currentEvent.id)
    );
    const unsub1 = onSnapshot(qQuotas, (snap) => {
        myQuotas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processDashboardData();
    }, (error) => {
        console.error("Error listener quotas:", error);
    });

    // Listener: códigos antiguos (colección codes - compatibilidad)
    const qCodes = query(
        collection(db, "codes"),
        where("promoter_id", "==", currentUser.id),
        where("event_id", "==", currentEvent.id)
    );
    const unsub2 = onSnapshot(qCodes, (snap) => {
        myCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processDashboardData();
    }, (error) => {
        console.error("Error listener codes:", error);
    });

    // Listener: códigos nuevos (colección promotorCodes)
    const qPromotorCodes = query(
        collection(db, "promotorCodes"),
        where("promoter_id", "==", currentUser.id),
        where("event_id", "==", currentEvent.id)
    );
    const unsub3 = onSnapshot(qPromotorCodes, (snap) => {
        myPromotorCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processDashboardData();
    }, (error) => {
        console.error("Error listener promotorCodes:", error);
    });

    dashboardUnsubs = [unsub1, unsub2, unsub3];
}

function processDashboardData() {
    if (!currentEvent || dashboardEventId !== currentEvent.id) return;
    // BUG-8 FIX: No escribir al DOM si no estamos en dashboard o historial
    if (currentViewIdPromo !== 'dashboardView' && currentViewIdPromo !== 'historyView') return;

    const tickets = currentEvent.tickets || [];
    let totalVentas = 0;
    let totalGratis = 0;
    let totalComision = 0;

    // Códigos antiguos (codes collection)
    const claimedOrScannedOld = myCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED');

    claimedOrScannedOld.forEach(code => {
        const tk = tickets.find(t => t.id === code.ticket_id);
        if (!tk) return;
        if (tk.isFree || tk.price === 0) {
            totalGratis++;
            if (tk.freeCommission?.cash) totalComision += tk.freeCommission.cash;
        } else {
            totalVentas++;
            if (tk.promotorCommission) {
                if (tk.promotorCommission.type === 'percentage') {
                    totalComision += (tk.price * tk.promotorCommission.value / 100);
                } else {
                    totalComision += (tk.promotorCommission.value || 0);
                }
            }
        }
    });

    // Códigos nuevos (promotorCodes collection)
    const claimedNew = myPromotorCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED');

    claimedNew.forEach(code => {
        const tk = tickets.find(t => t.id === code.ticket_id);
        if (!tk) return;
        if (code.type === 'free') {
            totalGratis++;
            if (tk.freeCommission?.cash) totalComision += tk.freeCommission.cash;
        } else if (code.type === 'sell') {
            totalVentas++;
            if (tk.promotorCommission) {
                if (tk.promotorCommission.type === 'percentage') {
                    totalComision += (tk.price * tk.promotorCommission.value / 100);
                } else {
                    totalComision += (tk.promotorCommission.value || 0);
                }
            }
        }
    });

    document.getElementById("stat_ventas").textContent = totalVentas;
    document.getElementById("stat_gratis").textContent = totalGratis;
    document.getElementById("stat_comision").textContent = `S/. ${totalComision.toFixed(2)}`;

    // BUG-4 FIX: Incluir ambas colecciones en el cálculo de cuota
    const totalAssigned = myQuotas.reduce((sum, q) => sum + (q.assigned || 0), 0);
    const fab = document.getElementById("btnGenerateCode");
    if (fab) fab.disabled = (totalAssigned - (myCodes.length + myPromotorCodes.length)) <= 0;

    // Renderizar secciones
    renderGoals(totalGratis);
    renderSellTickets(tickets);
    renderFreeTickets(tickets);
    renderMyCodesPreview();
    renderCodesList();
    renderClaimedList();
    fillTicketDropdown();
}

function formatEventDate(date, time) {
    if (!date) return '---';
    try {
        // BUG-11 FIX: Usar timezone de Perú para evitar desfase de fecha
        const d = new Date(date + 'T00:00:00-05:00');
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        let str = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
        if (time) str += ` · ${time}`;
        return str;
    } catch {
        return date;
    }
}

// ==========================================
// RENDER: METAS (ahora por entrada, desde ticket.freeGoals)
// ==========================================
function renderGoals(totalGratis) {
    const section = document.getElementById("goals_section");
    const container = document.getElementById("goals_list");
    if (!section || !container) return;

    // Recolectar metas de todos los tickets gratis
    const tickets = currentEvent.tickets || [];
    const allGoals = [];
    tickets.forEach(tk => {
        if (tk.freeGoals && tk.freeGoals.length > 0) {
            tk.freeGoals.forEach(g => {
                allGoals.push({ ...g, ticketName: tk.name });
            });
        }
    });

    // Ordenar por target ascendente
    allGoals.sort((a, b) => (a.target || 0) - (b.target || 0));

    if (allGoals.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    container.innerHTML = allGoals.map((g, i) => {
        const target = g.target || 0;
        const progress = Math.min(totalGratis, target);
        const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
        const achieved = progress >= target;
        const icon = achieved ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-clock"></i>';
        const cls = achieved ? 'goal-achieved' : '';

        return `
            <div class="goal-progress-card ${cls}">
                <div class="goal-progress-header">
                    <span class="goal-progress-icon">${icon}</span>
                    <span class="goal-progress-title">Meta: Regalar ${target} entradas</span>
                </div>
                <div class="goal-progress-prize">Premio: ${escapeHtml(g.prize || '')}</div>
                <div class="goal-progress-bar-bg">
                    <div class="goal-progress-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="goal-progress-count">${progress}/${target}</div>
            </div>
        `;
    }).join('');
}

// ==========================================
// RENDER: ENTRADAS PARA VENDER
// ==========================================
function renderSellTickets(tickets) {
    const section = document.getElementById("sell_section");
    const container = document.getElementById("sell_tickets_list");
    const noMsg = document.getElementById("no_tickets_msg");
    if (!section || !container) return;

    // Filtrar tickets con promotorEnabled y precio > 0
    const sellable = tickets.filter(tk => tk.promotorEnabled && !tk.isFree && tk.price > 0);

    if (sellable.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    if (noMsg) noMsg.style.display = 'none';

    container.innerHTML = sellable.map(tk => {
        let commText = '';
        let commValue = 0;
        if (tk.promotorCommission) {
            if (tk.promotorCommission.type === 'percentage') {
                commValue = tk.price * tk.promotorCommission.value / 100;
                commText = `${tk.promotorCommission.value}% = S/. ${commValue.toFixed(2)}`;
            } else {
                commValue = Number(tk.promotorCommission.value || 0);
                commText = `S/. ${commValue.toFixed(2)}`;
            }
        }

        // Contar códigos ya generados (ambas colecciones)
        const generatedOld = myCodes.filter(c => c.ticket_id === tk.id).length;
        const generatedNew = myPromotorCodes.filter(c => c.ticket_id === tk.id && c.type === 'sell').length;
        const totalGenerated = generatedOld + generatedNew;

        // Verificar si hay configuración de pago
        const hasPayment = currentEvent.payment_config?.active === true;

        return `
            <div class="ticket-action-card">
                <div class="ticket-action-top">
                    <div class="ticket-action-info">
                        <span class="ticket-action-name">${escapeHtml(tk.name)} · S/. ${Number(tk.price).toFixed(2)}</span>
                        ${commText ? `<span class="ticket-action-commission">Tu comisión: ${commText}</span>` : ''}
                    </div>
                    ${hasPayment
                        ? `<button class="btn-action-buy" onclick="openBuyModal('${escapeHtml(tk.id)}')"><i class="fa-solid fa-shopping-cart"></i> Comprar</button>`
                        : `<button class="btn-action-generate" onclick="quickGenerate('${escapeHtml(tk.id)}')">Generar <i class="fa-solid fa-arrow-right"></i></button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// RENDER: ENTRADAS GRATIS
// ==========================================
function renderFreeTickets(tickets) {
    const section = document.getElementById("free_section");
    const container = document.getElementById("free_tickets_list");
    const noMsg = document.getElementById("no_tickets_msg");
    if (!section || !container) return;

    // Filtrar tickets gratis con freeEnabled
    const freeTickets = tickets.filter(tk => tk.freeEnabled && (tk.isFree || tk.price === 0));

    if (freeTickets.length === 0) {
        section.style.display = 'none';
        // Mostrar mensaje si tampoco hay tickets vendibles
        const sellSection = document.getElementById("sell_section");
        if (noMsg && (!sellSection || sellSection.style.display === 'none')) {
            noMsg.style.display = '';
        }
        return;
    }

    section.style.display = '';
    if (noMsg) noMsg.style.display = 'none';

    container.innerHTML = freeTickets.map(tk => {
        // Comisiones gratis
        const comms = [];
        if (tk.freeCommission?.cash) comms.push(`S/. ${Number(tk.freeCommission.cash).toFixed(2)}`);
        if (tk.freeCommission?.drinks) comms.push(`${tk.freeCommission.drinks} trago${tk.freeCommission.drinks > 1 ? 's' : ''}`);
        if (tk.freeCommission?.other) comms.push(tk.freeCommission.other);
        const commText = comms.length ? comms.join(' + ') : '';

        // Contar códigos generados (ambas colecciones)
        const generatedOld = myCodes.filter(c => c.ticket_id === tk.id).length;
        const generatedNew = myPromotorCodes.filter(c => c.ticket_id === tk.id && c.type === 'free').length;
        const totalGenerated = generatedOld + generatedNew;

        // Contar disponibles basado en cuotas
        const quota = myQuotas.find(q => q.ticket_id === tk.id);
        const available = quota ? Math.max(0, (quota.assigned || 0) - totalGenerated) : 999; // Sin límite si no hay cuota

        return `
            <div class="ticket-action-card ticket-free">
                <div class="ticket-action-top">
                    <div class="ticket-action-info">
                        <span class="ticket-action-name">${escapeHtml(tk.name)} · GRATIS</span>
                        ${quota ? `<span class="ticket-action-available">Disponibles: ${available}</span>` : ''}
                        ${commText ? `<span class="ticket-action-commission">Tu comisión: ${commText}</span>` : ''}
                    </div>
                    ${available > 0 || !quota
                        ? `<button class="btn-action-free" onclick="generateFreeCode('${escapeHtml(tk.id)}')"><i class="fa-solid fa-gift"></i> Dar entrada</button>`
                        : '<span class="ticket-action-sold-out">Sin cuota</span>'
                    }
                </div>
            </div>
        `;
    }).join('');
}

function renderCodesList() {
    const container = document.getElementById("codes_list");

    // Combinar ambas colecciones
    const allCodes = [
        ...myCodes.map(c => ({ ...c, source: 'old' })),
        ...myPromotorCodes.map(c => ({ ...c, source: 'new' }))
    ];

    if (allCodes.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-ticket"></i><p>No has generado códigos aún</p></div>';
        return;
    }

    // Ordenar: pendientes primero, luego por fecha
    allCodes.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    container.innerHTML = allCodes.map(c => {
        const statusInfo = getCodeStatusInfo(c.status);
        const ticket = currentEvent.tickets?.find(t => t.id === c.ticket_id);
        const ticketName = ticket ? ticket.name : '';
        const typeLabel = c.type === 'sell' ? '💰 Venta' : c.type === 'free' ? '🎁 Gratis' : '';

        // Determinar si se puede copiar/compartir
        const canShare = c.status === 'APPROVED' || c.status === 'FREE' || c.status === 'CLAIMED' || c.status === 'SCANNED' || !c.status;

        return `
            <div class="code-card ${statusInfo.class}">
                <div class="code-info">
                    <div class="code-value">${escapeHtml(c.code)}</div>
                    <div class="code-meta">
                        ${ticketName ? `<span class="code-ticket">${escapeHtml(ticketName)}</span>` : ''}
                        ${typeLabel ? `<span class="code-type">${typeLabel}</span>` : ''}
                    </div>
                    <div class="code-status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</div>
                </div>
                <div class="code-actions">
                    ${canShare ? `
                        <button class="btn-copy" onclick="copyCode('${c.code}', this)" title="Copiar">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button class="btn-share" onclick="shareSpecificCode('${c.code}')" title="Compartir">
                            <i class="fa-solid fa-share"></i>
                        </button>
                    ` : `
                        <span class="code-waiting"><i class="fa-solid fa-clock"></i></span>
                    `}
                </div>
            </div>
        `;
    }).join("");
}

window.shareSpecificCode = async (code) => {
    const text = `🎫 Tu código de entrada para ${currentEvent.name}:\n\n${code}\n\nCanjéalo en: ${window.location.origin}/reclamar.html`;

    if (navigator.share) {
        try {
            await navigator.share({ text });
        } catch (e) {
            // Usuario canceló
        }
    } else {
        try {
            await navigator.clipboard.writeText(text);
            toast("✅ Mensaje copiado");
        } catch (e) {
            toast("Error al compartir");
        }
    }
};

function renderClaimedList() {
    const container = document.getElementById("claimed_list");

    // Combinar ambas colecciones, solo canjeados o escaneados
    const claimedOld = myCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED');
    const claimedNew = myPromotorCodes.filter(c => c.status === 'CLAIMED' || c.status === 'SCANNED');
    const claimed = [...claimedOld, ...claimedNew];

    if (claimed.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-check"></i><p>Nadie ha canjeado tus códigos aún</p></div>';
        return;
    }

    // Ordenar por fecha de canje
    claimed.sort((a, b) => new Date(b.claimed_at || b.created_at) - new Date(a.claimed_at || a.created_at));

    container.innerHTML = claimed.map(c => {
        const ticket = currentEvent.tickets?.find(t => t.id === c.ticket_id);
        const ticketName = ticket ? ticket.name : '';
        const claimedName = c.claimed_by?.name || c.claimed_name || 'Sin nombre';

        return `
            <div class="claimed-card ${c.status === 'SCANNED' ? 'scanned' : ''}">
                <div class="claimed-info">
                    <h4>${escapeHtml(claimedName)}</h4>
                    <div class="claimed-meta">
                        <span class="claimed-code">${escapeHtml(c.code)}</span>
                        ${ticketName ? `<span class="claimed-ticket">${escapeHtml(ticketName)}</span>` : ''}
                    </div>
                </div>
                <span class="claimed-badge ${c.status === 'SCANNED' ? 'scanned' : ''}">${c.status === 'SCANNED' ? '🎫 Entró' : '✅ Canjeado'}</span>
            </div>
        `;
    }).join("");
}

function fillTicketDropdown() {
    const select = document.getElementById("gen_ticket_type");
    select.innerHTML = '<option value="">Selecciona tipo...</option>';

    if (!currentEvent || !currentEvent.tickets?.length) return;
    
    myQuotas.forEach(q => {
        const ticket = currentEvent.tickets?.find(t => t.id === q.ticket_id);
        if (!ticket) return;
        
        // BUG-4 FIX: Contar códigos de ambas colecciones
        const generatedOld = myCodes.filter(c => c.ticket_id === q.ticket_id).length;
        const generatedNew = myPromotorCodes.filter(c => c.ticket_id === q.ticket_id).length;
        const available = (q.assigned || 0) - (generatedOld + generatedNew);
        
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
    if (isProcessing) return;

    const select = document.getElementById("gen_ticket_type");
    const ticketId = select.value;
    const btn = document.getElementById("btnConfirmGenerate");

    if (!ticketId) return toast("Selecciona tipo de entrada");

    if (select.selectedIndex < 0) return toast("Selecciona tipo de entrada");
    const opt = select.options[select.selectedIndex];
    const quotaId = opt.dataset.quota;

    isProcessing = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';

    try {
        const prefix = (currentEvent.code_prefix || currentEvent.name || "PG")
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 2)
            .toUpperCase();

        // SEC-7 FIX: Operación atómica con runTransaction + code como doc ID
        let code;
        let created = false;
        let attempts = 0;

        while (!created && attempts < 10) {
            code = generateUniqueCode(prefix);
            const codeDocRef = doc(db, "codes", code);
            try {
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(codeDocRef);
                    if (snap.exists()) throw new Error("CODE_EXISTS");
                    transaction.set(codeDocRef, {
                        code: code,
                        event_id: currentEvent.id,
                        brand_id: selectedBrandId,
                        promoter_id: currentUser.id,
                        promoter_name: currentUser.name,
                        ticket_id: ticketId,
                        quota_id: quotaId,
                        status: "FREE",
                        claimed_by: null,
                        claimed_name: null,
                        claimed_at: null,
                        scanned_at: null,
                        created_at: new Date().toISOString()
                    });
                });
                created = true;
            } catch (e) {
                if (e.message === "CODE_EXISTS") {
                    attempts++;
                } else {
                    throw e;
                }
            }
        }

        if (!created) throw new Error("No se pudo generar código único");

        lastGeneratedCode = code;
        document.getElementById("generated_code").textContent = code;
        closeModal('modalGenerate');
        openModal('modalCodeResult');
        loadDashboardData();

    } catch (e) {
        console.error(e);
        toast("Error: " + e.message);
    } finally {
        isProcessing = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i> GENERAR CÓDIGO';
    }
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
    currentViewIdPromo = id;
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

// ==========================================
// HISTORIAL Y QUICK GENERATE
// ==========================================
window.showHistoryView = () => {
    showView('historyView');
    if (!handlingPopstate) history.pushState({ section: 'history' }, '', '#historial');
    renderCodesList();
    renderClaimedList();
    fillTicketDropdown();

    // BUG-4 FIX: Incluir ambas colecciones en el cálculo de cuota
    const totalAssigned = myQuotas.reduce((sum, q) => sum + (q.assigned || 0), 0);
    const fab = document.getElementById("btnGenerateCode");
    if (fab) fab.disabled = (totalAssigned - (myCodes.length + myPromotorCodes.length)) <= 0;
};

window.quickGenerate = (ticketId) => {
    // Abrir modal de generar con el tipo pre-seleccionado
    fillTicketDropdown();
    const select = document.getElementById("gen_ticket_type");
    if (select) {
        // Buscar la opción con ese ticketId
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === ticketId) {
                select.selectedIndex = i;
                const av = select.options[i].dataset?.available || 0;
                document.getElementById("gen_available_count").textContent = av;
                break;
            }
        }
    }
    openModal('modalGenerate');
};

window.openGenerateModal = () => {
    fillTicketDropdown();
    document.getElementById("gen_ticket_type").selectedIndex = 0;
    // BUG-4 FIX: Incluir ambas colecciones
    const total = myQuotas.reduce((s, q) => s + (q.assigned || 0), 0) - (myCodes.length + myPromotorCodes.length);
    document.getElementById("gen_available_count").textContent = total;
    openModal('modalGenerate');
};

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

// ==========================================
// RENDER: MIS CÓDIGOS (PREVIEW EN DASHBOARD)
// ==========================================
function renderMyCodesPreview() {
    const container = document.getElementById("my_codes_preview");
    if (!container) return;

    // Combinar ambas colecciones
    const allCodes = [
        ...myCodes.map(c => ({ ...c, source: 'old' })),
        ...myPromotorCodes.map(c => ({ ...c, source: 'new' }))
    ];

    // Ordenar: pendientes primero, luego por fecha
    allCodes.sort((a, b) => {
        // Pendientes primero
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        // Luego por fecha más reciente
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Mostrar solo los primeros 5
    const preview = allCodes.slice(0, 5);

    if (preview.length === 0) {
        container.innerHTML = `
            <div class="empty-codes-preview">
                <i class="fa-solid fa-ticket"></i>
                <span>No tienes códigos aún</span>
            </div>
        `;
        return;
    }

    container.innerHTML = preview.map(c => {
        const statusInfo = getCodeStatusInfo(c.status);
        const ticket = currentEvent.tickets?.find(t => t.id === c.ticket_id);
        const ticketName = ticket ? ticket.name : 'Entrada';

        return `
            <div class="code-preview-item ${statusInfo.class}">
                <div class="code-preview-left">
                    <span class="code-preview-value">${escapeHtml(c.code)}</span>
                    <span class="code-preview-type">${escapeHtml(ticketName)}</span>
                </div>
                <div class="code-preview-right">
                    <span class="code-preview-status">${statusInfo.icon} ${statusInfo.text}</span>
                    ${c.status === 'APPROVED' || c.status === 'FREE' ? `<button class="btn-copy-mini" onclick="copyCode('${c.code}', this)"><i class="fa-solid fa-copy"></i></button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getCodeStatusInfo(status) {
    switch (status) {
        case 'PENDING':
            return { class: 'status-pending', icon: '⏳', text: 'Pendiente' };
        case 'APPROVED':
            return { class: 'status-approved', icon: '✅', text: 'Aprobado' };
        case 'FREE':
            return { class: 'status-free', icon: '🎁', text: 'Listo' };
        case 'CLAIMED':
            return { class: 'status-claimed', icon: '🎫', text: 'Canjeado' };
        case 'SCANNED':
            return { class: 'status-scanned', icon: '✓', text: 'Escaneado' };
        default:
            return { class: 'status-free', icon: '⚪', text: 'Libre' };
    }
}

// ==========================================
// MODAL: COMPRAR CÓDIGO PARA VENDER
// ==========================================
window.openBuyModal = (ticketId) => {
    const ticket = currentEvent.tickets?.find(t => t.id === ticketId);
    if (!ticket) return toast("Entrada no encontrada");

    pendingBuyTicket = ticket;

    // Llenar información del ticket
    document.getElementById("buy_ticket_name").textContent = ticket.name;
    document.getElementById("buy_ticket_price").textContent = `S/. ${Number(ticket.price).toFixed(2)}`;

    // Calcular comisión
    let commValue = 0;
    if (ticket.promotorCommission) {
        if (ticket.promotorCommission.type === 'percentage') {
            commValue = ticket.price * ticket.promotorCommission.value / 100;
        } else {
            commValue = Number(ticket.promotorCommission.value || 0);
        }
    }
    document.getElementById("buy_ticket_commission").textContent = `S/. ${commValue.toFixed(2)}`;

    // Información de pago
    const payConfig = currentEvent.payment_config || {};
    document.getElementById("payment_name").textContent = payConfig.name || '---';
    document.getElementById("payment_phone").textContent = payConfig.phone || '---';

    openModal('modalBuyCode');
};

window.copyPaymentPhone = async () => {
    const phone = document.getElementById("payment_phone").textContent;
    if (!phone || phone === '---') return;
    try {
        await navigator.clipboard.writeText(phone);
        toast("✅ Número copiado");
    } catch (e) {
        toast("Error al copiar");
    }
};

window.confirmBuyCode = async () => {
    if (isProcessing || !pendingBuyTicket) return;

    const ticket = pendingBuyTicket;
    const btn = document.getElementById("btnConfirmBuy");

    isProcessing = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        const prefix = (currentEvent.code_prefix || currentEvent.name || "PG")
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 2)
            .toUpperCase();

        // SEC-7 + BUG-7 FIX: Operación atómica con verificación de stock
        let code;
        let created = false;
        let attempts = 0;

        while (!created && attempts < 10) {
            code = generateUniqueCode(prefix);
            const codeDocRef = doc(db, "promotorCodes", code);
            try {
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(codeDocRef);
                    if (snap.exists()) throw new Error("CODE_EXISTS");

                    // BUG-7: Verificar que el evento y ticket siguen activos
                    const eventRef = doc(db, "events", currentEvent.id);
                    const eventSnap = await transaction.get(eventRef);
                    if (!eventSnap.exists()) throw new Error("Evento no encontrado");

                    const eventData = eventSnap.data();
                    const ticketType = eventData.tickets?.find(t => t.id === ticket.id);
                    if (!ticketType) throw new Error("Entrada no disponible");
                    if (!ticketType.promotorEnabled) throw new Error("Entrada no habilitada para promotores");

                    transaction.set(codeDocRef, {
                        code: code,
                        event_id: currentEvent.id,
                        brand_id: selectedBrandId,
                        promoter_id: currentUser.id,
                        promoter_name: currentUser.name,
                        ticket_id: ticket.id,
                        ticket_name: ticket.name,
                        ticket_price: ticket.price,
                        type: 'sell',
                        status: 'PENDING',
                        payment_amount: ticket.price,
                        claimed_by: null,
                        claimed_at: null,
                        scanned_at: null,
                        created_at: new Date().toISOString()
                    });
                });
                created = true;
            } catch (e) {
                if (e.message === "CODE_EXISTS") {
                    attempts++;
                } else {
                    throw e;
                }
            }
        }

        if (!created) throw new Error("No se pudo generar código único");

        lastGeneratedCode = code;
        document.getElementById("pending_code").textContent = code;
        closeModal('modalBuyCode');
        openModal('modalCodePending');
        loadDashboardData();

    } catch (e) {
        console.error(e);
        toast("Error: " + e.message);
    } finally {
        isProcessing = false;
        pendingBuyTicket = null;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Ya pagué, generar código';
    }
};

// ==========================================
// GENERAR CÓDIGO GRATIS (INSTANTÁNEO)
// ==========================================
window.generateFreeCode = async (ticketId) => {
    if (isProcessing) return;

    const ticket = currentEvent.tickets?.find(t => t.id === ticketId);
    if (!ticket) return toast("Entrada no encontrada");

    // Verificar cuota si existe
    const quota = myQuotas.find(q => q.ticket_id === ticketId);
    if (quota) {
        const generatedOld = myCodes.filter(c => c.ticket_id === ticketId).length;
        const generatedNew = myPromotorCodes.filter(c => c.ticket_id === ticketId && c.type === 'free').length;
        const totalGenerated = generatedOld + generatedNew;
        if (totalGenerated >= (quota.assigned || 0)) {
            return toast("Ya usaste toda tu cuota para este tipo");
        }
    }

    isProcessing = true;
    toast("Generando código...");

    try {
        const prefix = (currentEvent.code_prefix || currentEvent.name || "PG")
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 2)
            .toUpperCase();

        // SEC-7 FIX: Operación atómica con runTransaction + code como doc ID
        let code;
        let created = false;
        let attempts = 0;

        while (!created && attempts < 10) {
            code = generateUniqueCode(prefix);
            const codeDocRef = doc(db, "promotorCodes", code);
            try {
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(codeDocRef);
                    if (snap.exists()) throw new Error("CODE_EXISTS");
                    // Verificar también en colección legacy
                    const oldCodeRef = doc(db, "codes", code);
                    const oldSnap = await transaction.get(oldCodeRef);
                    if (oldSnap.exists()) throw new Error("CODE_EXISTS");

                    transaction.set(codeDocRef, {
                        code: code,
                        event_id: currentEvent.id,
                        brand_id: selectedBrandId,
                        promoter_id: currentUser.id,
                        promoter_name: currentUser.name,
                        ticket_id: ticket.id,
                        ticket_name: ticket.name,
                        ticket_price: 0,
                        type: 'free',
                        status: 'FREE',
                        claimed_by: null,
                        claimed_at: null,
                        scanned_at: null,
                        created_at: new Date().toISOString()
                    });
                });
                created = true;
            } catch (e) {
                if (e.message === "CODE_EXISTS") {
                    attempts++;
                } else {
                    throw e;
                }
            }
        }

        if (!created) throw new Error("No se pudo generar código único");

        lastGeneratedCode = code;
        document.getElementById("generated_code").textContent = code;
        openModal('modalCodeResult');
        loadDashboardData();

    } catch (e) {
        console.error(e);
        toast("Error: " + e.message);
    } finally {
        isProcessing = false;
    }
};

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
    cleanupAllListeners();
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

// History API - botón atrás del navegador
window.addEventListener('popstate', function(event) {
    handlingPopstate = true;
    try {
        const state = event.state;
        if (!state || !state.section) {
            // Sin estado → volver a marcas si está logueado
            if (currentViewIdPromo && currentViewIdPromo !== 'loginView' && currentViewIdPromo !== 'registerView') {
                currentEvent = null;
                selectedBrandId = null;
                cleanupAllListeners();
                showBrandSelector();
            }
            return;
        }
        switch (state.section) {
            case 'brands':
                selectedBrandId = null;
                currentEvent = null;
                cleanupAllListeners();
                showBrandSelector();
                break;
            case 'events':
                currentEvent = null;
                if (selectedBrandId) {
                    showEventsList();
                } else {
                    cleanupAllListeners();
                    showBrandSelector();
                }
                break;
            case 'dashboard':
                if (state.eventIndex !== undefined && allEvents[state.eventIndex]) {
                    currentEvent = allEvents[state.eventIndex];
                    showView('dashboardView');
                    loadDashboardData();
                } else {
                    showEventsList();
                }
                break;
            case 'history':
                if (currentEvent) {
                    showView('dashboardView');
                    loadDashboardData();
                } else {
                    showEventsList();
                }
                break;
            default:
                showBrandSelector();
        }
    } finally {
        handlingPopstate = false;
    }
});

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    document.getElementById("btnLogin")?.addEventListener("click", handleLogin);
    document.getElementById("login_pass")?.addEventListener("keypress", e => e.key === "Enter" && handleLogin());
    document.getElementById("btnCheckDni")?.addEventListener("click", handleCheckDNI);
    document.getElementById("reg_dni")?.addEventListener("keypress", e => { if (e.key === "Enter") handleCheckDNI(); });
    document.getElementById("btnRegister")?.addEventListener("click", handleRegister);
    document.getElementById("btnBackEvents")?.addEventListener("click", () => {
        currentEvent = null;
        if (history.state?.section) {
            history.back();
        } else {
            showEventsList();
        }
    });
    document.getElementById("btnBackDashboard")?.addEventListener("click", () => {
        if (history.state?.section) {
            history.back();
        } else if (currentEvent) {
            showView('dashboardView');
            loadDashboardData();
        }
    });
    document.getElementById("btnConfirmGenerate")?.addEventListener("click", handleGenerateCode);
    
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => e.target === m && m.classList.add('hidden'));
    });
}

