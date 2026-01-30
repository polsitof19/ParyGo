// ==========================================
// SCANNER QR - JAVASCRIPT
// ==========================================

import { db, auth } from './js/config.js';
import { escapeHtml } from './js/utils.js';
import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    updateDoc
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

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupLoginListeners();
    checkAuth();
});

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
        await loadEvents();
        setupEventListeners();

    } catch (error) {
        console.error("Error validando rol:", error);
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
        console.error("Error login:", error);
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
}

function showEventSelection() {
    document.getElementById('loginScreen')?.classList.remove('active');
    document.getElementById('eventSelection')?.classList.remove('hidden');
    document.querySelector('.header')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.add('hidden');
}

function showScannerScreen() {
    document.getElementById('loginScreen')?.classList.remove('active');
    document.getElementById('eventSelection')?.classList.add('hidden');
    document.querySelector('.header')?.classList.remove('hidden');
    document.getElementById('mainContent')?.classList.remove('hidden');
}

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
async function loadEvents() {
    const eventList = document.getElementById('eventList');
    if (!eventList) return;

    eventList.innerHTML = `
        <div class="event-list-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando eventos...</p>
        </div>
    `;

    try {
        const snapshot = await getDocs(collection(db, "events"));
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
            const dateStr = event.date
                ? new Date(event.date + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
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

    } catch (error) {
        console.error('Error cargando eventos:', error);
        eventList.innerHTML = `
            <div class="event-list-empty">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error al cargar eventos</p>
            </div>
        `;
    }
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

    showEventSelection();
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
        console.error("Error iniciando cámara:", err);
        showToast('Error al acceder a la cámara', 'error');
    }
}

async function stopScanner() {
    if (state.html5QrCode && state.html5QrCode.isScanning) {
        try {
            await state.html5QrCode.stop();
        } catch (err) {
            console.error('Error deteniendo scanner:', err);
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
        console.error('Error cambiando cámara:', error);
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

    await validateCode(decodedText);

    // Cooldown
    setTimeout(() => {
        state.isScanning = false;
    }, 2000);
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
    isProcessing = true;
    showLoading(true);

    try {
        let snapshot;

        const codeUpper = code.trim().toUpperCase();
        const codeOriginal = code.trim();

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
        if (ticketData.status?.includes('SCANNED')) {
            const scannedAt = ticketData.scanned_at
                ? new Date(ticketData.scanned_at).toLocaleString('es-PE')
                : 'Desconocido';

            playBeep('error');
            showResult('warning', 'Ya Escaneado', `Ingresó: ${scannedAt}`, clientData);
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
        showResult('success', 'Entrada Válida', 'Esperando aprobación', clientData, ticketDoc.id);
        addToHistory(clientName, 'success', ticketType);

    } catch (error) {
        console.error('Error validando código:', error);
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
        await updateDoc(doc(db, "tickets", pendingTicketId), {
            status: 'SCANNED',
            scanned_at: new Date().toISOString(),
            scanned_by: state.currentUser?.email || 'scanner_app'
        });

        state.stats.success++;
        state.stats.total++;
        updateStats();

        playBeep('success');
        showToast('Entrada aprobada', 'success');
    } catch (error) {
        console.error('Error aprobando entrada:', error);
        showToast('Error al aprobar', 'error');
    } finally {
        isProcessing = false;
        pendingTicketId = null;
        closeResult();
    }
}

function rejectEntry() {
    pendingTicketId = null;
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

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
        ${escapeHtml(message)}
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
// CAMERA SWITCH
// ==========================================
window.switchCamera = switchCamera;
