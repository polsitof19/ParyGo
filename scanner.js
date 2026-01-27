// ==========================================
// SCANNER QR - JAVASCRIPT
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";



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
const db = getFirestore(app);
const auth = getAuth(app);
// ==========================================
// STATE    
// ==========================================
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

// Keep for backwards compat
function hideLoginScreen() {
    showEventSelection();
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
                        brand_name: event.brand_name || ''
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
            return `
                <button class="event-card" data-event-id="${event.id}" data-event-name="${escapeHtml(event.name)}">
                    <div class="event-card-icon">
                        <i class="fa-solid fa-calendar-day"></i>
                    </div>
                    <div class="event-card-info">
                        <span class="event-card-name">${escapeHtml(event.name)}</span>
                        <span class="event-card-meta">
                            <i class="fa-regular fa-calendar"></i> ${dateStr}
                            ${event.location ? `<span class="event-card-sep">·</span> <i class="fa-solid fa-location-dot"></i> ${escapeHtml(event.location)}` : ''}
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

    showScannerScreen();
    initScanner();
}

async function goBackToEvents() {
    await stopScanner();
    state.currentEventId = null;
    state.currentEventName = '';
    resetStats();
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

    // Input manual - Enter key
    document.getElementById('manualCode')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            validateManual();
        }
    });

    // Botón buscar manual
    document.getElementById('btnSearch')?.addEventListener('click', validateManual);

    // Botón continuar en modal
    document.getElementById('btnContinue')?.addEventListener('click', closeResult);

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
// QR SCANNER
// ==========================================
function initScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;
    
    state.html5QrCode = new Html5Qrcode("reader");
    
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
        console.log('Scanner iniciado');
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
    await stopScanner();
    state.currentCamera = state.currentCamera === 'environment' ? 'user' : 'environment';
    await startScanner();
    showToast(`Cámara ${state.currentCamera === 'environment' ? 'trasera' : 'frontal'}`, 'success');
}

// ==========================================
// SCAN CALLBACKS
// ==========================================
async function onScanSuccess(decodedText) {
    if (state.isScanning) return;
    state.isScanning = true;
    
    // Vibrar si está disponible
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    // Sonido de beep (opcional)
    playBeep();
    
    await validateCode(decodedText);
    
    // Cooldown para evitar escaneos múltiples
    setTimeout(() => {
        state.isScanning = false;
    }, 2000);
}

function onScanFailure(error) {
    // Ignorar errores de escaneo (son normales cuando no hay QR)
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
    
    showLoading(true);
    
    try {
        let ticketDoc = null;
        let ticketData = null;
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
        
        // 2. Si no encuentra, buscar por qr_token
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("qr_token", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }
        
        // 3. Si no encuentra, buscar por client_dni
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("client_dni", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }
        
        // 4. Si no encuentra, buscar por claimed_by.dni
        if (snapshot.empty) {
            q = query(
                collection(db, "tickets"),
                where("event_id", "==", state.currentEventId),
                where("claimed_by.dni", "==", codeOriginal)
            );
            snapshot = await getDocs(q);
        }
        
        // Si no se encontró nada
        if (snapshot.empty) {
            showResult('error', 'No Encontrado', 'Código o DNI no válido para este evento', {});
            addToHistory(codeOriginal, 'error', 'No encontrado');
            state.stats.total++;
            updateStats();
            showLoading(false);
            return;
        }
        
        ticketDoc = snapshot.docs[0];
        ticketData = ticketDoc.data();
        
        // Obtener datos del cliente
        const clientName = ticketData.client_name || ticketData.claimed_by?.name || 'Invitado';
        const clientDni = ticketData.client_dni || ticketData.claimed_by?.dni || '-';
        const clientPhone = ticketData.client_phone || ticketData.claimed_by?.phone || '-';
        const clientEmail = ticketData.client_email || ticketData.claimed_by?.email || '-';
        const ticketType = ticketData.ticket_name || 'General';
        const promoterName = ticketData.promoter_name || '-';
        
        const clientData = {
            name: clientName,
            dni: clientDni,
            phone: clientPhone,
            email: clientEmail,
            type: ticketType,
            promoter: promoterName
        };
        
        // Verificar si ya fue escaneado
        if (ticketData.status?.includes('SCANNED')) {
            const scannedAt = ticketData.scanned_at 
                ? new Date(ticketData.scanned_at).toLocaleString('es-PE') 
                : 'Desconocido';
            
            showResult('warning', 'Ya Escaneado', `Ingresó: ${scannedAt}`, clientData);
            addToHistory(clientName, 'warning', 'Duplicado');
            state.stats.duplicate++;
            state.stats.total++;
            updateStats();
            showLoading(false);
            return;
        }
        
        // Verificar si está cancelado
        if (ticketData.status === 'CANCELLED') {
            showResult('error', 'Entrada Anulada', 'Esta entrada fue cancelada', clientData);
            addToHistory(clientName, 'error', 'Anulada');
            state.stats.total++;
            updateStats();
            showLoading(false);
            return;
        }
        
        // Verificar si está expirada
        if (ticketData.expires_at) {
            const expiryDate = new Date(ticketData.expires_at);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (expiryDate < today && ticketData.status !== 'CLAIMED') {
                showResult('error', 'Entrada Expirada', 'Esta entrada ha vencido', clientData);
                addToHistory(clientName, 'error', 'Expirada');
                state.stats.total++;
                updateStats();
                showLoading(false);
                return;
            }
        }
        
        // Verificar si no ha sido reclamada
        if (!ticketData.client_name && !ticketData.claimed_by?.name && ticketData.status !== 'CLAIMED') {
            showResult('warning', 'No Reclamada', 'Esta entrada no ha sido reclamada aún', clientData);
            addToHistory(codeOriginal, 'warning', 'Sin reclamar');
            state.stats.total++;
            updateStats();
            showLoading(false);
            return;
        }
        
        // ¡ÉXITO! - Marcar como escaneado
        // ¡ÉXITO! - Mostrar para aprobar/rechazar (NO marcar automáticamente)
        showResult('success', 'Entrada Válida', 'Esperando aprobación', clientData, ticketDoc.id);
        addToHistory(clientName, 'success', ticketType);
        
    } catch (error) {
        console.error('Error validando código:', error);
        showResult('error', 'Error', 'Error al validar el código', {});
    }
    
    showLoading(false);
}

// ==========================================
// MANUAL VALIDATION
// ==========================================
async function validateManual() {
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

// Exponer para onclick
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
    if (!pendingTicketId) return;
    
    try {
        await updateDoc(doc(db, "tickets", pendingTicketId), {
            status: 'SCANNED',
            scanned_at: new Date().toISOString(),
            scanned_by: state.currentUser?.email || 'scanner_app'
        });
        
        state.stats.success++;
        state.stats.total++;
        updateStats();
        
        showToast('Entrada aprobada', 'success');
    } catch (error) {
        console.error('Error aprobando entrada:', error);
        showToast('Error al aprobar', 'error');
    }
    
    pendingTicketId = null;
    closeResult();
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
    
    state.history.unshift({
        name: name,
        type: type,
        detail: detail,
        time: time
    });
    
    // Mantener máximo 50 registros
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
            <div class="time">${h.time}</div>
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// SOUND
// ==========================================
function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 1000;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        // Ignorar error de audio
    }
}

// ==========================================
// CAMERA SWITCH
// ==========================================
window.switchCamera = switchCamera;
