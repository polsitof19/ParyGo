// ==========================================
// SCANNER QR - JAVASCRIPT
// ==========================================

import { db, auth } from './js/config.js';
import { escapeHtml, showToast, logger, initErrorMonitor } from './js/utils.js';

import {
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    getDoc,
    doc,
    updateDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ==========================================
// STATE
// ==========================================
let isProcessing = false;
let isOnline = navigator.onLine;

// MEJORA D: Cache local de codigos escaneados exitosamente (en memoria)
const scannedCodesCache = new Map(); // key: code, value: { timestamp, clientName, ticketType }
const MAX_CACHE_SIZE = 100;

let state = {
    currentUser: null,
    allowedBrands: [],
    currentEventId: null,
    currentEventName: '',
    stats: {
        success: 0,
        duplicate: 0,
        total: 0
    },
    history: [],
    isScanning: false,
    html5QrCode: null,
    currentCamera: 'environment'
};
let currentScreen = 'login';
let handlingPopstate = false;
let eventsUnsubscribe = null;

function cleanupListeners() {
    if (eventsUnsubscribe) { try { eventsUnsubscribe(); } catch(e) {} eventsUnsubscribe = null; }
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // MEJORA 6: Error monitoring
    initErrorMonitor(db, 'scanner');
    setupLoginListeners();
    setupConnectionMonitor();
    checkAuth();
});

// ==========================================
// MEJORA D: CONNECTION MONITOR
// ==========================================
function setupConnectionMonitor() {
    updateConnectionUI();

    window.addEventListener('online', () => {
        isOnline = true;
        updateConnectionUI();
        showToast('Conexion restablecida', 'success');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateConnectionUI();
        showToast('Sin conexion a internet', 'error');
    });
}

function updateConnectionUI() {
    const indicator = document.getElementById('connectionIndicator');
    const banner = document.getElementById('offlineBanner');
    const dot = indicator?.querySelector('.conn-dot');

    if (indicator) {
        if (isOnline) {
            indicator.innerHTML = '<span class="conn-dot online"></span> Online';
        } else {
            indicator.innerHTML = '<span class="conn-dot offline"></span> Offline';
        }
    }

    if (banner) {
        banner.classList.toggle('hidden', isOnline);
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================
function checkAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await validateScannerRole(user);
        } else {
            showLoginScreen();
        }
    });
}

async function validateScannerRole(user) {
    try {
        const staffDoc = await getDoc(doc(db, "staff", user.uid));

        if (!staffDoc.exists()) {
            showLoginError("Usuario no autorizado");
            await signOut(auth);
            return;
        }

        const staffData = staffDoc.data();

        if (staffData.role !== 'scanner') {
            showLoginError("No tienes permisos de scanner");
            await signOut(auth);
            return;
        }

        if (staffData.status !== 'ACTIVE') {
            showLoginError("Tu cuenta está inactiva");
            await signOut(auth);
            return;
        }

        // Login exitoso
        state.currentUser = { id: user.uid, ...staffData };
        state.allowedBrands = staffData.allowed_brands || [];

        // Mostrar saludo con nombre
        const userName = staffData.name || user.email;
        const greetingEl = document.getElementById('greetingUser');
        if (greetingEl) greetingEl.textContent = `Hola, ${userName}`;

        showEventSelection();
        loadEvents();
        setupEventListeners();

    } catch (error) {
        logger.error("Error validando rol:", error);
        showLoginError("Error de autenticación");
        await signOut(auth);
    }
}

function setupLoginListeners() {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('btnLogin');

    hideLoginError();
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ingresando...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        logger.error("Error login:", error);
        let msg = "Error al iniciar sesión";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg = "Email o contraseña incorrectos";
        } else if (error.code === 'auth/invalid-email') {
            msg = "Email inválido";
        }
        showLoginError(msg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar';
    }
}

async function handleLogout() {
    if (confirm("¿Cerrar sesión?")) {
        await stopScanner();
        cleanupListeners();
        await signOut(auth);
        state.currentUser = null;
        state.allowedBrands = [];
        state.currentEventId = null;
        state.currentEventName = '';
        showLoginScreen();
    }
}

// ==========================================
// NAVIGATION - 3 SCREENS
// ==========================================
function showLoginScreen() {
    document.getElementById('loginScreen')?.classList.add('active');
    document.getElementById('eventSelection')?.classList.add('hidden');
    document.querySelector('.header')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.add('hidden');
    currentScreen = 'login';
}

function showEventSelection() {
    document.getElementById('loginScreen')?.classList.remove('active');
    document.getElementById('eventSelection')?.classList.remove('hidden');
    document.querySelector('.header')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.add('hidden');
    const prev = currentScreen;
    currentScreen = 'events';
    if (!handlingPopstate && prev !== 'events') {
        if (prev === 'login') {
            history.replaceState({ screen: 'events' }, '', '#eventos');
        } else {
            history.pushState({ screen: 'events' }, '', '#eventos');
        }
    }
}

function showScannerScreen() {
    document.getElementById('loginScreen')?.classList.remove('active');
    document.getElementById('eventSelection')?.classList.add('hidden');
    document.querySelector('.header')?.classList.remove('hidden');
    document.getElementById('mainContent')?.classList.remove('hidden');
    const prev = currentScreen;
    currentScreen = 'scanner';
    if (!handlingPopstate && prev !== 'scanner') {
        history.pushState({ screen: 'scanner' }, '', '#scanner');
    }
}

// History API - botón atrás del navegador
window.addEventListener('popstate', async function(event) {
    handlingPopstate = true;
    try {
        const screen = event.state?.screen;
        if (!screen || screen === 'events') {
            if (currentScreen === 'scanner') {
                // Navegar directamente sin llamar goBackToEvents
                // (goBackToEvents llama history.back() que causaría doble retroceso)
                await stopScanner();
                state.currentEventId = null;
                state.currentEventName = '';
                resetStats();
                document.getElementById('scannerBox')?.classList.add('hidden');
                document.getElementById('searchBox')?.classList.add('hidden');
                document.getElementById('actionButtons')?.classList.remove('hidden');
                showEventSelection();
            }
        }
    } finally {
        handlingPopstate = false;
    }
});

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

function hideLoginError() {
    const el = document.getElementById('loginError');
    if (el) el.style.display = 'none';
}

// ==========================================
// LOAD EVENTS
// ==========================================
function loadEvents() {
    const eventList = document.getElementById('eventList');
    if (!eventList) return;

    // Si el listener ya está activo, no crear otro
    if (eventsUnsubscribe) return;

    eventList.innerHTML = `
        <div class="event-list-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando eventos...</p>
        </div>
    `;

    // BUG-12 FIX: Filtrar eventos por marca del scanner en la query
    let eventsQuery;
    if (state.allowedBrands.length === 0) {
        // Sin marcas asignadas → no cargar eventos
        eventList.innerHTML = `
            <div class="event-list-empty">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Sin marcas asignadas. Contacta al administrador.</p>
            </div>
        `;
        return;
    } else if (state.allowedBrands.length <= 30) {
        eventsQuery = query(collection(db, "events"), where("brand_id", "in", state.allowedBrands));
    } else {
        // >30 marcas: fallback a query sin filtro + filtro client-side
        eventsQuery = query(collection(db, "events"));
    }

    eventsUnsubscribe = onSnapshot(eventsQuery, (snapshot) => {
        renderScannerEvents(eventList, snapshot);
    }, (error) => {
        logger.error('Error listener eventos:', error);
        eventsUnsubscribe = null; // Permitir reintentar
        eventList.innerHTML = `
            <div class="event-list-empty">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error al cargar eventos</p>
            </div>
        `;
    });
}

function renderScannerEvents(eventList, snapshot) {
    // BUG-8 FIX: No escribir al DOM si ya no estamos en la pantalla de eventos
    if (currentScreen !== 'events') return;

    const activeEvents = [];

    snapshot.docs.forEach(docSnap => {
        const event = docSnap.data();
        if (event.status === 'ACTIVE') {
            const eventBrand = event.brand_id || event.company_id;
            const hasAccess = state.allowedBrands.length === 0 ||
                              state.allowedBrands.includes(eventBrand) ||
                              state.allowedBrands.includes(event.company_id);

            if (hasAccess) {
                activeEvents.push({
                    id: docSnap.id,
                    name: event.name,
                    date: event.date,
                    location: event.location || '',
                    image: event.image || event.flyer || event.cover || ''
                });
            }
        }
    });

    // Ordenar por fecha
    activeEvents.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date) - new Date(a.date);
    });

    if (activeEvents.length === 0) {
        eventList.innerHTML = `
            <div class="event-list-empty">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>No hay eventos disponibles</p>
            </div>
        `;
        return;
    }

    eventList.innerHTML = activeEvents.map(event => {
        // BUG-11 FIX: Usar timezone de Perú para evitar desfase de fecha
        const dateStr = event.date
            ? new Date(event.date + 'T00:00:00-05:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
            : 'Sin fecha';

        const thumbHtml = event.image
            ? `<img class="event-card-thumb" src="${escapeHtml(event.image)}" alt="" loading="lazy">`
            : `<div class="event-card-thumb-placeholder"><i class="fa-solid fa-calendar-day"></i></div>`;

        return `
            <button class="event-card" data-event-id="${escapeHtml(event.id)}" data-event-name="${escapeHtml(event.name)}">
                ${thumbHtml}
                <div class="event-card-info">
                    <span class="event-card-name">${escapeHtml(event.name)}</span>
                    <span class="event-card-meta">
                        <i class="fa-regular fa-calendar"></i> ${dateStr}
                        ${event.location ? `<span class="event-card-sep">&middot;</span> <i class="fa-solid fa-location-dot"></i> ${escapeHtml(event.location)}` : ''}
                    </span>
                </div>
                <i class="fa-solid fa-chevron-right event-card-arrow"></i>
            </button>
        `;
    }).join('');

    // Click listeners para las cards
    eventList.querySelectorAll('.event-card').forEach(card => {
        card.addEventListener('click', () => {
            selectEvent(card.dataset.eventId, card.dataset.eventName);
        });
    });
}

function selectEvent(eventId, eventName) {
    state.currentEventId = eventId;
    state.currentEventName = eventName;
    resetStats();

    document.getElementById('eventNameHeader').textContent = eventName;

    // Reset scanner/search sections
    document.getElementById('scannerBox')?.classList.add('hidden');
    document.getElementById('searchBox')?.classList.add('hidden');
    document.getElementById('actionButtons')?.classList.remove('hidden');

    showScannerScreen();
    // NO iniciar cámara automáticamente
}

async function goBackToEvents() {
    await stopScanner();
    state.currentEventId = null;
    state.currentEventName = '';
    resetStats();

    // Reset sections
    document.getElementById('scannerBox')?.classList.add('hidden');
    document.getElementById('searchBox')?.classList.add('hidden');
    document.getElementById('actionButtons')?.classList.remove('hidden');

    if (!handlingPopstate && history.state?.screen) {
        history.back();
    } else {
        showEventSelection();
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Botón volver a eventos
    document.getElementById('btnBackToEvents')?.addEventListener('click', goBackToEvents);

    // Botón logout desde pantalla de eventos
    document.getElementById('btnLogoutEvents')?.addEventListener('click', handleLogout);

    // Botón abrir scanner QR
    document.getElementById('btnOpenScanner')?.addEventListener('click', openScanner);

    // Botón abrir búsqueda
    document.getElementById('btnOpenSearch')?.addEventListener('click', openSearch);

    // Botón cerrar scanner
    document.getElementById('btnCloseScanner')?.addEventListener('click', closeScanner);

    // Botón cerrar búsqueda
    document.getElementById('btnCloseSearch')?.addEventListener('click', closeSearch);

    // Input manual - Enter key
    document.getElementById('manualCode')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            validateManual();
        }
    });

    // Botón buscar manual
    document.getElementById('btnSearch')?.addEventListener('click', validateManual);

    // Botón limpiar historial
    document.getElementById('btnClearHistory')?.addEventListener('click', clearHistory);

    // Botón cambiar cámara
    document.getElementById('btnSwitchCamera')?.addEventListener('click', switchCamera);

    // Click en overlay para cerrar
    document.getElementById('resultOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'resultOverlay') {
            closeResult();
        }
    });
}

// ==========================================
// OPEN / CLOSE SCANNER & SEARCH
// ==========================================
function openScanner() {
    document.getElementById('actionButtons')?.classList.add('hidden');
    document.getElementById('searchBox')?.classList.add('hidden');
    document.getElementById('scannerBox')?.classList.remove('hidden');
    initScanner();
}

async function closeScanner() {
    await stopScanner();
    document.getElementById('scannerBox')?.classList.add('hidden');
    document.getElementById('actionButtons')?.classList.remove('hidden');
}

function openSearch() {
    document.getElementById('actionButtons')?.classList.add('hidden');
    document.getElementById('scannerBox')?.classList.add('hidden');
    document.getElementById('searchBox')?.classList.remove('hidden');
    document.getElementById('manualCode')?.focus();
}

function closeSearch() {
    document.getElementById('searchBox')?.classList.add('hidden');
    document.getElementById('actionButtons')?.classList.remove('hidden');
}

// ==========================================
// QR SCANNER
// ==========================================
function initScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    if (typeof Html5Qrcode === 'undefined') {
        showToast('Error: librería QR no disponible', 'error');
        return;
    }

    if (!state.html5QrCode) {
        state.html5QrCode = new Html5Qrcode("reader");
    }

    startScanner();
}

async function startScanner() {
    if (!state.html5QrCode) return;

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    try {
        await state.html5QrCode.start(
            { facingMode: state.currentCamera },
            config,
            onScanSuccess,
            onScanFailure
        );
    } catch (err) {
        logger.error("Error iniciando cámara:", err);
        const msg = err.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en configuración del navegador'
            : err.name === 'NotFoundError' ? 'No se encontró una cámara en este dispositivo'
            : err.name === 'NotReadableError' ? 'La cámara está siendo usada por otra aplicación'
            : err.name === 'OverconstrainedError' ? 'La cámara seleccionada no está disponible'
            : 'Error al acceder a la cámara';
        showToast(msg, 'error');
    }
}

async function stopScanner() {
    if (state.html5QrCode && state.html5QrCode.isScanning) {
        try {
            await state.html5QrCode.stop();
        } catch (err) {
            logger.error('Error deteniendo scanner:', err);
        }
    }
}

async function switchCamera() {
    try {
        await stopScanner();
        state.currentCamera = state.currentCamera === 'environment' ? 'user' : 'environment';
        await startScanner();
        showToast(`Cámara ${state.currentCamera === 'environment' ? 'trasera' : 'frontal'}`, 'success');
    } catch (error) {
        logger.error('Error cambiando cámara:', error);
        showToast('Error al cambiar cámara', 'error');
    }
}

// ==========================================
// SCAN CALLBACKS
// ==========================================
async function onScanSuccess(decodedText) {
    if (state.isScanning || isProcessing) return;
    state.isScanning = true;

    // Vibrar
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }

    playBeep('success');

    try {
        await validateCode(decodedText);
    } finally {
        // Cooldown después de que validateCode termine
        setTimeout(() => {
            state.isScanning = false;
        }, 2000);
    }
}

function onScanFailure(error) {
    // Normal cuando no hay QR
}

// ==========================================
// VALIDATE CODE
// ==========================================
async function validateCode(code) {
    if (!state.currentEventId) {
        showResult('error', 'Sin Evento', 'Selecciona un evento primero', {});
        return;
    }

    if (!code || code.trim() === '') {
        showResult('error', 'Código Vacío', 'Ingresa un código válido', {});
        return;
    }

    if (isProcessing) return;

    const codeUpper = code.trim().toUpperCase();
    const codeOriginal = code.trim();

    // MEJORA D: Offline handling
    if (!isOnline) {
        if (scannedCodesCache.has(codeOriginal) || scannedCodesCache.has(codeUpper)) {
            const cached = scannedCodesCache.get(codeOriginal) || scannedCodesCache.get(codeUpper);
            playBeep('error');
            showResult('warning', 'Ya escaneado anteriormente', 'Verificado desde cache local (sin conexion)', {
                name: cached.clientName || '-',
                dni: '-',
                type: cached.ticketType || '-',
                promoter: '-'
            });
            addToHistory(cached.clientName || codeOriginal, 'warning', 'Cache offline');
            state.stats.duplicate++;
            state.stats.total++;
            updateStats();
        } else {
            playBeep('error');
            showResult('error', 'Sin conexion', 'No se puede validar este codigo sin internet', {});
            addToHistory(codeOriginal, 'error', 'Sin conexion');
            state.stats.total++;
            updateStats();
        }
        return;
    }

    isProcessing = true;
    showLoading(true);

    try {
        let snapshot;

        // 1. Buscar por código
        let q = query(
            collection(db, "tickets"),
            where("event_id", "==", state.currentEventId),
            where("code", "==", codeUpper)
        );
        snapshot = await getDocs(q);

        // 2. Buscar por qr_token
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("qr_token", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }

        // 3. Buscar por client_dni
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("client_dni", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }

        // 4. Buscar por claimed_by.dni
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("claimed_by.dni", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }

        // No encontrado
        if (snapshot.empty) {
            playBeep('error');
            showResult('error', 'No Encontrado', 'Código o DNI no válido para este evento', {});
            addToHistory(codeOriginal, 'error', 'No encontrado');
            state.stats.total++;
            updateStats();
            return;
        }

        const ticketDoc = snapshot.docs[0];
        const ticketData = ticketDoc.data();

        // Datos del cliente
        const clientName = ticketData.client_name || ticketData.claimed_by?.name || 'Invitado';
        const clientDni = ticketData.client_dni || ticketData.claimed_by?.dni || '-';
        const ticketType = ticketData.ticket_name || 'General';
        const promoterName = ticketData.promoter_name || '-';

        const clientData = {
            name: clientName,
            dni: clientDni,
            type: ticketType,
            promoter: promoterName
        };

        // Ya escaneado
        if (ticketData.status === 'SCANNED' || ticketData.status === 'SCANNED_IN') {
            const scannedAt = ticketData.scanned_at
                ? new Date(ticketData.scanned_at).toLocaleString('es-PE')
                : 'Desconocido';

            // MEJORA D: Cachear para verificacion offline
            addToScannedCache(codeOriginal, clientName, ticketType);
            if (codeUpper !== codeOriginal) addToScannedCache(codeUpper, clientName, ticketType);

            playBeep('error');
            showResult('warning', 'Ya Escaneado', `Ingreso: ${scannedAt}`, clientData);
            addToHistory(clientName, 'warning', 'Duplicado');
            state.stats.duplicate++;
            state.stats.total++;
            updateStats();
            return;
        }

        // Cancelado
        if (ticketData.status === 'CANCELLED') {
            playBeep('error');
            showResult('error', 'Entrada Anulada', 'Esta entrada fue cancelada', clientData);
            addToHistory(clientName, 'error', 'Anulada');
            state.stats.total++;
            updateStats();
            return;
        }

        // Expirada
        if (ticketData.expires_at) {
            const expiryDate = new Date(ticketData.expires_at);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (expiryDate < today && ticketData.status !== 'CLAIMED') {
                playBeep('error');
                showResult('error', 'Entrada Expirada', 'Esta entrada ha vencido', clientData);
                addToHistory(clientName, 'error', 'Expirada');
                state.stats.total++;
                updateStats();
                return;
            }
        }

        // No reclamada
        if (!ticketData.client_name && !ticketData.claimed_by?.name && ticketData.status !== 'CLAIMED') {
            playBeep('error');
            showResult('warning', 'No Reclamada', 'Esta entrada no ha sido reclamada aún', clientData);
            addToHistory(codeOriginal, 'warning', 'Sin reclamar');
            state.stats.total++;
            updateStats();
            return;
        }

        // ÉXITO - Mostrar para aprobar/rechazar
        pendingTicketCode = codeOriginal;
        pendingTicketCodeUpper = codeUpper;
        showResult('success', 'Entrada Valida', 'Esperando aprobacion', clientData, ticketDoc.id);
        addToHistory(clientName, 'success', ticketType);

    } catch (error) {
        logger.error('Error validando código:', error);
        showResult('error', 'Error', 'Error al validar el código', {});
    } finally {
        showLoading(false);
        isProcessing = false;
    }
}

// ==========================================
// MANUAL VALIDATION
// ==========================================
async function validateManual() {
    if (isProcessing) return;

    const input = document.getElementById('manualCode');
    const code = input.value.trim();

    if (!code) {
        showToast('Ingresa un código o DNI', 'error');
        return;
    }

    await validateCode(code);
    input.value = '';
    input.focus();
}

window.validateManual = validateManual;

// ==========================================
// RESULT MODAL
// ==========================================
let pendingTicketId = null;
let pendingTicketCode = null;
let pendingTicketCodeUpper = null;

function showResult(type, title, subtitle, data, ticketId = null) {
    const overlay = document.getElementById('resultOverlay');
    const header = document.getElementById('resultHeader');
    const icon = document.getElementById('resultIcon');
    const actions = document.getElementById('resultActions');

    header.classList.remove('success', 'error', 'warning');
    header.classList.add(type);

    switch (type) {
        case 'success':
            icon.className = 'fa-solid fa-check';
            break;
        case 'warning':
            icon.className = 'fa-solid fa-exclamation';
            break;
        case 'error':
            icon.className = 'fa-solid fa-times';
            break;
    }

    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSubtitle').textContent = subtitle;

    document.getElementById('resultName').textContent = data.name || '-';
    document.getElementById('resultDni').textContent = data.dni || '-';
    document.getElementById('resultType').textContent = data.type || '-';
    document.getElementById('resultPromoter').textContent = data.promoter || '-';

    // Botones según el tipo
    if (type === 'success' && ticketId) {
        pendingTicketId = ticketId;
        actions.innerHTML = `
            <button class="btn-reject" onclick="rejectEntry()">
                <i class="fa-solid fa-times"></i>
                Rechazar
            </button>
            <button class="btn-approve" onclick="approveEntry()">
                <i class="fa-solid fa-check"></i>
                Aprobar
            </button>
        `;
    } else {
        pendingTicketId = null;
        actions.innerHTML = `
            <button class="btn-close" onclick="closeResult()">
                Cerrar
            </button>
        `;
    }

    overlay.classList.add('active');
}

async function approveEntry() {
    if (!pendingTicketId || isProcessing) return;
    isProcessing = true;

    try {
        const ticketRef = doc(db, "tickets", pendingTicketId);
        await runTransaction(db, async (transaction) => {
            const ticketDoc = await transaction.get(ticketRef);
            if (!ticketDoc.exists()) throw new Error('Ticket no encontrado');
            const data = ticketDoc.data();
            if (data.status === 'SCANNED' || data.status === 'SCANNED_IN') {
                throw new Error('Esta entrada ya fue escaneada');
            }
            transaction.update(ticketRef, {
                status: 'SCANNED',
                scanned_at: new Date().toISOString(),
                scanned_by: state.currentUser?.uid || state.currentUser?.email || 'scanner_app'
            });
        });

        // MEJORA D: Cache del codigo escaneado exitosamente
        const resultName = document.getElementById('resultName')?.textContent || '-';
        const resultType = document.getElementById('resultType')?.textContent || '-';
        if (pendingTicketCode) addToScannedCache(pendingTicketCode, resultName, resultType);
        if (pendingTicketCodeUpper && pendingTicketCodeUpper !== pendingTicketCode) addToScannedCache(pendingTicketCodeUpper, resultName, resultType);

        state.stats.success++;
        state.stats.total++;
        updateStats();

        playBeep('success');
        showToast('Entrada aprobada', 'success');
    } catch (error) {
        logger.error('Error aprobando entrada:', error);
        if (error.message === 'Esta entrada ya fue escaneada') {
            playBeep('error');
            state.stats.duplicate++;
            state.stats.total++;
            updateStats();
            // Mostrar resultado de duplicado sin cerrar overlay
            showResult('warning', 'Ya Escaneado', 'Aprobada por otro scanner', {});
            isProcessing = false;
            pendingTicketId = null;
            pendingTicketCode = null;
            pendingTicketCodeUpper = null;
            return;
        } else {
            showToast('Error al aprobar', 'error');
        }
    } finally {
        isProcessing = false;
        pendingTicketId = null;
        pendingTicketCode = null;
        pendingTicketCodeUpper = null;
        closeResult();
    }
}

function rejectEntry() {
    pendingTicketId = null;
    pendingTicketCode = null;
    pendingTicketCodeUpper = null;
    showToast('Entrada rechazada', 'warning');
    closeResult();
}

function closeResult() {
    document.getElementById('resultOverlay')?.classList.remove('active');
    pendingTicketId = null;
}

window.approveEntry = approveEntry;
window.rejectEntry = rejectEntry;
window.closeResult = closeResult;

// ==========================================
// HISTORY
// ==========================================
function addToHistory(name, type, detail) {
    const now = new Date();
    const time = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    state.history.unshift({ name, type, detail, time });

    if (state.history.length > 50) {
        state.history.pop();
    }

    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    if (state.history.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <p>No hay escaneos aún</p>
            </div>
        `;
        return;
    }

    list.innerHTML = state.history.map(h => `
        <div class="history-item">
            <div class="icon ${h.type}">
                <i class="fa-solid fa-${h.type === 'success' ? 'check' : h.type === 'warning' ? 'exclamation' : 'times'}"></i>
            </div>
            <div class="details">
                <div class="name">${escapeHtml(h.name)}</div>
                <div class="meta">${escapeHtml(h.detail)}</div>
            </div>
            <div class="time">${escapeHtml(h.time)}</div>
        </div>
    `).join('');
}

function clearHistory() {
    state.history = [];
    renderHistory();
    showToast('Historial limpiado', 'success');
}

window.clearHistory = clearHistory;

// ==========================================
// STATS
// ==========================================
function updateStats() {
    document.getElementById('statSuccess').textContent = state.stats.success;
    document.getElementById('statDuplicate').textContent = state.stats.duplicate;
    document.getElementById('statTotal').textContent = state.stats.total;
}

function resetStats() {
    state.stats = { success: 0, duplicate: 0, total: 0 };
    state.history = [];
    updateStats();
    renderHistory();
}

// ==========================================
// UI HELPERS
// ==========================================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay?.classList.add('active');
    } else {
        overlay?.classList.remove('active');
    }
}


// ==========================================
// SOUND
// ==========================================
function playBeep(type = 'success') {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (type === 'success') {
            oscillator.frequency.value = 1200;
            oscillator.type = 'sine';
        } else {
            oscillator.frequency.value = 400;
            oscillator.type = 'square';
        }

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        // Ignorar error de audio
    }
}

// ==========================================
// MEJORA D: CACHE DE CODIGOS ESCANEADOS
// ==========================================
function addToScannedCache(codeOrId, clientName, ticketType) {
    // Evitar que el cache crezca indefinidamente
    if (scannedCodesCache.size >= MAX_CACHE_SIZE) {
        // Eliminar la entrada mas antigua
        const oldest = scannedCodesCache.keys().next().value;
        scannedCodesCache.delete(oldest);
    }
    scannedCodesCache.set(codeOrId, {
        timestamp: Date.now(),
        clientName,
        ticketType
    });
}

// ==========================================
// CAMERA SWITCH
// ==========================================
window.switchCamera = switchCamera;
