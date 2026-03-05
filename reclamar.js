// ==========================================
// RECLAMAR ENTRADA - JAVASCRIPT
// ==========================================

import { db, functions } from './js/config.js';
import { detectBrandSlug, loadBrandBySlug } from './utils/brand-detector.js';
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { escapeHtml, showToast, logger, createRateLimiter, initErrorMonitor } from './js/utils.js';

// ==========================================
// MEJORA 5: Cache de eventos (30s TTL)
// ==========================================
const eventCache = new Map();
const EVENT_CACHE_TTL = 30000;

async function getCachedEvent(eventId) {
    const cached = eventCache.get(eventId);
    if (cached && Date.now() - cached.ts < EVENT_CACHE_TTL) return cached.data;
    try {
        const eventDoc = await getDoc(doc(db, "events", eventId));
        if (eventDoc.exists()) {
            const data = eventDoc.data();
            eventCache.set(eventId, { data, ts: Date.now() });
            return data;
        }
    } catch (e) { /* no cache */ }
    return null;
}

// ==========================================
// RATE LIMITERS (MEJORA 4)
// ==========================================
const validateRateLimit = createRateLimiter(5, 60000);   // max 5 validaciones/min
const claimRateLimit = createRateLimiter(3, 60000);      // max 3 reclamos/min
const dniRateLimit = createRateLimiter(5, 60000);        // max 5 consultas DNI/min

// ==========================================
// UTILIDADES
// ==========================================
let isProcessing = false;
let currentStep = 1;
let handlingPopstate = false;

function sanitizeInput(str) {
    if (!str) return '';
    return str.toString().trim().replace(/[<>]/g, '');
}

function isValidPhone(phone) {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 9 && cleaned.length <= 15;
}

// ==========================================
// ESTADO GLOBAL
// ==========================================
let state = {
    brand: null,
    code: null,
    codeData: null,
    userData: {
        idType: 'DNI',
        dni: '',
        name: '',
        lastname: '',
        email: '',
        phone: ''
    }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initErrorMonitor(db, 'reclamar');
    await loadBrand();
    setupEventListeners();
});

// ==========================================
// CARGAR MARCA
// ==========================================
async function loadBrand() {
    showLoading(true);

    try {
        // Detectar marca: subdominio > query param
        const brandSlug = detectBrandSlug();

        if (!brandSlug) {
            showLoading(false);
            showErrorScreen('Marca no encontrada', 'No se pudo determinar la marca. Verifica la URL.');
            return;
        }

        const brand = await loadBrandBySlug(brandSlug);

        if (!brand) {
            showLoading(false);
            showErrorScreen('Marca no encontrada', `La marca "${brandSlug}" no existe o no está disponible.`);
            return;
        }

        state.brand = brand;
        applyBrandTheme();

    } catch (error) {
        logger.error('Error cargando marca:', error);
        showErrorScreen('Error de conexion', 'No se pudo conectar con el servidor. Verifica tu conexion a internet.');
    }

    showLoading(false);
}

// ==========================================
// APLICAR TEMA DE MARCA
// ==========================================
function applyBrandTheme() {
    if (!state.brand) return;
    
    const logo = state.brand.logo || state.brand.image || '';
    const primaryColor = state.brand.color || '#f43f5e';
    const bgColor = state.brand.bg_color || '#0a0a0a';
    const textColor = state.brand.text_color || '#ffffff';
    const cardColor = state.brand.card_color || '#1a1a1a';
    
    document.querySelectorAll('.brand-logo, .brand-logo-small').forEach(img => {
        if (logo) {
            img.src = logo;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    });
    
    document.documentElement.style.setProperty('--primary', primaryColor);
    document.documentElement.style.setProperty('--bg', bgColor);
    document.documentElement.style.setProperty('--text', textColor);
    document.documentElement.style.setProperty('--card', cardColor);
    
    document.body.style.background = bgColor;
    document.body.style.color = textColor;
    
    const borderColor = isColorLight(bgColor) ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    document.documentElement.style.setProperty('--card-border', borderColor);
    document.documentElement.style.setProperty('--input-border', borderColor);
    
    const mutedColor = isColorLight(bgColor) ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    document.documentElement.style.setProperty('--text-muted', mutedColor);
    
    const inputBg = isColorLight(bgColor) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    document.documentElement.style.setProperty('--input-bg', inputBg);
    
}

function isColorLight(color) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    document.getElementById('btnValidateCode')?.addEventListener('click', validateCode);
    document.getElementById('inputCode')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validateCode();
    });
    
    document.getElementById('btnSearchDNI')?.addEventListener('click', searchDNI);
    document.getElementById('inputDNI')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchDNI();
    });
    
    document.getElementById('btnGetQR')?.addEventListener('click', claimTicket);
    document.getElementById('btnDownloadTicket')?.addEventListener('click', downloadTicket);
    document.getElementById('btnWhatsApp')?.addEventListener('click', sendToWhatsApp);
}

// ==========================================
// PASO 1: VALIDAR CÓDIGO
// ==========================================
async function validateCode() {
    if (isProcessing) return;

    if (!validateRateLimit()) {
        showToast('Demasiados intentos. Espera un momento.', 'error');
        return;
    }

    const codeInput = document.getElementById('inputCode');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        showToast('Ingresa un código', 'error');
        return;
    }

    isProcessing = true;
    showLoading(true);

    try {
        // MEJORA 2: Validar código via Cloud Function (sin exponer PII)
        const validateFn = httpsCallable(functions, 'validateCode');
        const result = await validateFn({ code });
        const codeData = result.data;

        if (!codeData.success) {
            showToast('Código no válido', 'error');
            showLoading(false);
            isProcessing = false;
            return;
        }

        // Guardar datos validados (solo datos públicos del evento)
        state.codeData = {
            id: codeData.codeId,
            source: codeData.source,
            type: codeData.codeType,
            max_uses: codeData.maxUses,
            current_uses: codeData.currentUses,
            ticket_name: codeData.ticketName,
            ticket_color: codeData.ticketColor,
            brand_id: codeData.brandId,
            event_id: codeData.eventId,
            event_name: codeData.eventName,
            event_date: codeData.eventDate,
            event_time: codeData.eventTime,
            event_venue: codeData.eventVenue
        };

        if (state.brand && state.codeData.brand_id && state.codeData.brand_id !== state.brand.id) {
            showToast(`Este código pertenece a otra marca, no a ${state.brand.name || 'esta'}`, 'error');
            showLoading(false);
            isProcessing = false;
            return;
        }

        state.code = code;
        goToStep(2);
        
    } catch (error) {
        const errorMsg = error?.code === 'functions/not-found' ? 'Código no encontrado' :
                         error?.code === 'functions/already-exists' ? 'Este código ya fue utilizado' :
                         error?.code === 'functions/failed-precondition' ? 'Este código está pendiente de aprobación' :
                         error?.code === 'functions/resource-exhausted' ? 'Este código alcanzó su límite de usos' :
                         error?.code === 'functions/deadline-exceeded' ? 'Este código ha expirado' :
                         'Error al validar el código';
        logger.error('Error validando código:', error);
        showToast(errorMsg, 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
    }
}

// ==========================================
// PASO 2: BUSCAR DNI
// ==========================================
async function searchDNI() {
    if (isProcessing) return;

    if (!dniRateLimit()) {
        showToast('Demasiados intentos. Espera un momento.', 'error');
        return;
    }

    const idType = document.getElementById('idType').value;
    const dni = document.getElementById('inputDNI').value.trim();

    if (!dni) {
        showToast('Ingresa tu identificación', 'error');
        return;
    }

    if (idType === 'DNI' && dni.length !== 8) {
        showToast('El DNI debe tener 8 dígitos', 'error');
        return;
    }

    isProcessing = true;
    showLoading(true);
    
    state.userData.idType = idType;
    state.userData.dni = dni;
    state.userData.name = '';
    state.userData.lastname = '';
    
    try {
        if (idType === 'DNI') {
            try {
                const fn = httpsCallable(functions, 'consultaDNIPublic');
                const result = await fn({ dni });
                const data = result.data;

                if (data?.success && data?.nombres) {
                    state.userData.name = data.nombres || '';
                    state.userData.lastname = `${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
                }
            } catch (apiError) {
                logger.error('Error API DNI:', apiError);
            }
        }
        
        document.getElementById('showIdType').value = idType;
        document.getElementById('showDNI').value = dni;
        document.getElementById('inputName').value = state.userData.name;
        document.getElementById('inputLastname').value = state.userData.lastname;
        document.getElementById('inputEmail').value = state.userData.email || '';
        document.getElementById('inputPhone').value = state.userData.phone || '';
        
        goToStep(3);
        
    } catch (error) {
        logger.error('Error buscando DNI:', error);
        document.getElementById('showIdType').value = idType;
        document.getElementById('showDNI').value = dni;
        goToStep(3);
    } finally {
        isProcessing = false;
        showLoading(false);
    }
}

// ==========================================
// PASO 3: RECLAMAR TICKET
// ==========================================
async function claimTicket() {
    if (isProcessing) return;

    if (!claimRateLimit()) {
        showToast('Demasiados intentos. Espera un momento.', 'error');
        return;
    }

    if (!state.codeData) {
        showToast('Primero debes ingresar un código válido', 'error');
        goToStep(1);
        return;
    }

    const name = sanitizeInput(document.getElementById('inputName').value);
    const lastname = sanitizeInput(document.getElementById('inputLastname').value);
    const email = sanitizeInput(document.getElementById('inputEmail').value).toLowerCase();
    const phone = document.getElementById('inputPhone').value.trim().replace(/\D/g, '');

    if (!name) {
        showToast('Ingresa tu nombre', 'error');
        return;
    }

    if (!lastname) {
        showToast('Ingresa tu apellido', 'error');
        return;
    }

    if (!email || !isValidEmail(email)) {
        showToast('Ingresa un correo válido', 'error');
        return;
    }

    if (!isValidPhone(phone)) {
        showToast('Ingresa un celular válido (9 dígitos)', 'error');
        return;
    }

    isProcessing = true;
    showLoading(true);

    state.userData.name = name;
    state.userData.lastname = lastname;
    state.userData.email = email;
    state.userData.phone = phone;

    try {
        // MEJORA 2: Reclamar via Cloud Function (atómico, sin acceso directo a Firestore)
        const claimFn = httpsCallable(functions, 'claimCode');
        const result = await claimFn({
            codeId: state.codeData.id,
            source: state.codeData.source,
            code: state.code,
            clientName: name,
            clientLastname: lastname,
            clientDni: state.userData.dni,
            clientEmail: email,
            clientPhone: phone,
            idType: state.userData.idType,
            brandId: state.codeData.brand_id || state.brand?.id || "",
            eventId: state.codeData.event_id || "",
            eventName: state.codeData.event_name || "",
            ticketName: state.codeData.ticket_name || "General",
            promoterId: state.codeData.promoter_id || "",
            promoterName: state.codeData.promoter_name || ""
        });

        const qrToken = result.data.qrToken;
        await showTicket(qrToken);

    } catch (error) {
        const errorMsg = error?.code === 'functions/already-exists' ? 'Este código ya fue utilizado' :
                         error?.code === 'functions/resource-exhausted' ? 'Este código alcanzó su límite de usos' :
                         'Error al generar el ticket';
        logger.error('Error reclamando ticket:', error);
        showToast(errorMsg, 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
    }
}

// ==========================================
// MOSTRAR TICKET
// ==========================================
async function showTicket(qrToken) {
    // Guardar token para descarga
    state.qrToken = qrToken;
    
    let eventName = state.codeData.event_name || 'Evento';
    let eventVenue = '';
    let eventDate = '';
    let eventTime = '';
    
    if (state.codeData.event_id) {
        const event = await getCachedEvent(state.codeData.event_id);
        if (event) {
            eventName = event.name || 'Evento';
            eventVenue = event.venue || event.location || event.address || '';
            eventDate = event.date || '';
            eventTime = event.time || event.hour || event.hora || event.start_time || '';
        }
    }
    
    document.getElementById('ticketEvent').textContent = eventName.toUpperCase();
    
    const venueEl = document.getElementById('ticketVenue');
    if (venueEl) {
        venueEl.textContent = eventVenue ? `📍 ${eventVenue}` : '';
        venueEl.style.display = eventVenue ? 'block' : 'none';
    }
    
    const dateEl = document.getElementById('ticketDate');
if (dateEl) {
    let formattedDate = '';
    if (eventDate) {
        formattedDate = formatEventDate(eventDate, eventTime);
    }
    dateEl.textContent = formattedDate ? `📅 ${formattedDate}` : '';
    dateEl.style.display = formattedDate ? 'block' : 'none';
}
    
    document.getElementById('ticketName').textContent = `${state.userData.name} ${state.userData.lastname}`.toUpperCase();
    document.getElementById('ticketDNI').textContent = state.userData.dni;
    document.getElementById('ticketType').textContent = state.codeData.ticket_name || 'GENERAL';
    
    const brandName = state.brand?.name || state.codeData.brand_name || '';
    const brandEl = document.getElementById('ticketBrand');
    if (brandEl) {
        brandEl.textContent = brandName ? `Productora: ${brandName}` : '';
        brandEl.style.display = brandName ? 'block' : 'none';
    }
    
    // Generar QR
    const qrContainer = document.getElementById('qrContainer');
    const oldQr = document.getElementById('qrCanvas');
    if (oldQr) oldQr.innerHTML = '';
    
    const qrDiv = document.getElementById('qrCanvas') || document.createElement('div');
    qrDiv.id = 'qrCanvas';
    if (!qrDiv.parentElement) {
        qrContainer.appendChild(qrDiv);
    }

    if (typeof QRCode === 'undefined') {
        showToast('Error: No se pudo cargar el generador QR', 'error');
        return;
    }

    new QRCode(qrDiv, {
        text: qrToken,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    goToStep(4);
}

// ==========================================
// DESCARGAR TICKET COMO IMAGEN
// ==========================================
async function downloadTicket() {
    if (isProcessing) return;
    isProcessing = true;
    showLoading(true);

    try {
        const qrToken = state.qrToken;
        
        if (!qrToken) {
            showToast('Error: No se encontró el código QR', 'error');
            showLoading(false);
            return;
        }
        
        // Obtener datos del ticket
        const eventName = document.getElementById('ticketEvent')?.textContent || '';
        const venue = document.getElementById('ticketVenue')?.textContent || '';
        const dateTime = document.getElementById('ticketDate')?.textContent || '';
        const clientName = document.getElementById('ticketName')?.textContent || '';
        const dni = document.getElementById('ticketDNI')?.textContent || '';
        const ticketType = document.getElementById('ticketType')?.textContent || 'GENERAL';
        const brandName = document.getElementById('ticketBrand')?.textContent || '';
        
        // Crear canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Dimensiones del ticket
        const width = 400;
        const height = 700;
        const scale = 3;
        
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);
        
        // Fondo blanco
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Generar QR como imagen
        const qrCanvas = document.createElement('canvas');
        const qrSize = 180;
        
        // Usar la librería QRCode para generar en canvas
        if (typeof QRCode === 'undefined') {
            showToast('Error: No se pudo cargar el generador QR', 'error');
            return;
        }

        await new Promise((resolve) => {
            const qrDiv = document.createElement('div');
            qrDiv.style.position = 'absolute';
            qrDiv.style.left = '-9999px';
            document.body.appendChild(qrDiv);

            new QRCode(qrDiv, {
                text: qrToken,
                width: qrSize,
                height: qrSize,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            // Esperar a que el QR se renderice con polling (max 3s)
            let attempts = 0;
            const maxAttempts = 30;
            const checkQR = () => {
                attempts++;
                const qrImg = qrDiv.querySelector('img');
                const qrCanvas = qrDiv.querySelector('canvas');

                const imgReady = qrImg && qrImg.src && qrImg.complete && qrImg.naturalWidth > 0;
                const canvasReady = qrCanvas && qrCanvas.width > 0;

                if (imgReady || canvasReady) {
                    const source = imgReady ? qrImg : qrCanvas;
                    const img = new Image();
                    img.onload = () => {
                        const qrX = (width - qrSize) / 2;
                        const qrY = 40;
                        ctx.shadowColor = 'rgba(0,0,0,0.1)';
                        ctx.shadowBlur = 20;
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30);
                        ctx.shadowBlur = 0;
                        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
                        try { document.body.removeChild(qrDiv); } catch (_) {}
                        resolve();
                    };
                    img.onerror = () => {
                        try { document.body.removeChild(qrDiv); } catch (_) {}
                        resolve();
                    };
                    img.src = imgReady ? qrImg.src : qrCanvas.toDataURL();
                } else if (attempts < maxAttempts) {
                    setTimeout(checkQR, 100);
                } else {
                    // Max intentos: continuar sin QR
                    try { document.body.removeChild(qrDiv); } catch (_) {}
                    resolve();
                }
            };
            setTimeout(checkQR, 100);
        });
        
        // Texto "Sujeto a capacidad de aforo"
        ctx.fillStyle = '#999999';
        ctx.font = '12px Urbanist, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sujeto a capacidad de aforo', width / 2, 250);
        
        // Línea divisoria punteada
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 280);
        ctx.lineTo(width - 30, 280);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Nombre del evento
        ctx.fillStyle = '#0a0a0a';
        ctx.font = 'bold 18px Urbanist, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(eventName, width / 2, 320);
        
        // Ubicación
        if (venue) {
            ctx.fillStyle = '#666666';
            ctx.font = '13px Urbanist, Arial, sans-serif';
            ctx.fillText(venue, width / 2, 345);
        }
        
        // Fecha y hora
        if (dateTime) {
            ctx.fillStyle = '#666666';
            ctx.font = '13px Urbanist, Arial, sans-serif';
            ctx.fillText(dateTime, width / 2, 370);
        }
        
        // Línea divisoria
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(30, 400);
        ctx.lineTo(width - 30, 400);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Nombre del cliente
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 16px Urbanist, Arial, sans-serif';
        ctx.fillText(clientName, width / 2, 440);
        
        // DNI
        ctx.fillStyle = '#666666';
        ctx.font = '14px Urbanist, Arial, sans-serif';
        ctx.fillText(`DNI: ${dni}`, width / 2, 465);
        
        // Línea divisoria
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(30, 495);
        ctx.lineTo(width - 30, 495);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Tipo de entrada (botón rosa)
        const btnWidth = 160;
        const btnHeight = 45;
        const btnX = (width - btnWidth) / 2;
        const btnY = 520;
        
        // Gradiente para el botón
        const gradient = ctx.createLinearGradient(btnX, btnY, btnX + btnWidth, btnY + btnHeight);
        gradient.addColorStop(0, '#f43f5e');
        gradient.addColorStop(1, '#e11d48');
        
        // Dibujar botón redondeado
        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(btnX, btnY, btnWidth, btnHeight, 12);
        } else {
            // Polyfill for browsers without roundRect
            const r = 12;
            ctx.moveTo(btnX + r, btnY);
            ctx.lineTo(btnX + btnWidth - r, btnY);
            ctx.quadraticCurveTo(btnX + btnWidth, btnY, btnX + btnWidth, btnY + r);
            ctx.lineTo(btnX + btnWidth, btnY + btnHeight - r);
            ctx.quadraticCurveTo(btnX + btnWidth, btnY + btnHeight, btnX + btnWidth - r, btnY + btnHeight);
            ctx.lineTo(btnX + r, btnY + btnHeight);
            ctx.quadraticCurveTo(btnX, btnY + btnHeight, btnX, btnY + btnHeight - r);
            ctx.lineTo(btnX, btnY + r);
            ctx.quadraticCurveTo(btnX, btnY, btnX + r, btnY);
            ctx.closePath();
        }
        ctx.fill();
        
        // Texto del tipo de entrada
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Urbanist, Arial, sans-serif';
        ctx.fillText(ticketType, width / 2, btnY + 30);
        
        // Productora
        if (brandName) {
            ctx.fillStyle = '#888888';
            ctx.font = '13px Urbanist, Arial, sans-serif';
            ctx.fillText(brandName, width / 2, 600);
        }
        
        // Descargar
        const link = document.createElement('a');
        link.download = `entrada_${state.userData.dni}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        
        showToast('Entrada descargada', 'success');
        
    } catch (error) {
        logger.error('Error descargando ticket:', error);
        showToast('Error al descargar', 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
    }
}
// ==========================================
// UTILIDADES
// ==========================================
function goToStep(step) {
    const prevStep = currentStep;
    currentStep = step;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');
    window.scrollTo(0, 0);

    // History API
    if (!handlingPopstate) {
        if (step > prevStep) {
            history.pushState({ step }, '', `#paso${step}`);
        } else if (step < prevStep) {
            // Retroceso manual desde UI, no pushear
        }
    }
}

window.goToStep = goToStep;

// History API - botón atrás del navegador
history.replaceState({ step: 1 }, '', '#paso1');
window.addEventListener('popstate', function(event) {
    handlingPopstate = true;
    try {
        const step = event.state?.step || 1;
        if (step < currentStep) {
            currentStep = step;
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(`step${step}`)?.classList.add('active');
            window.scrollTo(0, 0);
        }
    } finally {
        handlingPopstate = false;
    }
});

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// ==========================================
// ENVIAR A WHATSAPP
// ==========================================
function sendToWhatsApp() {
    const eventName = document.getElementById('ticketEvent')?.textContent || 'Evento';
    const venue = document.getElementById('ticketVenue')?.textContent || '';
    const dateTime = document.getElementById('ticketDate')?.textContent || '';
    const ticketType = document.getElementById('ticketType')?.textContent || 'GENERAL';
    const code = state.code || '';
    const phone = state.userData.phone || '';

    // Build ticket URL - link to event portal (preserves brand subdomain)
    const ticketURL = window.location.origin;

    const message = `🎉 ¡Tu entrada para ${eventName}!\n\n${dateTime ? '📅 ' + dateTime + '\n' : ''}${venue ? venue + '\n' : ''}🎫 ${ticketType}\n🔑 Codigo: ${code}\n\n👉 Ver tu entrada: ${ticketURL}`;

    // Format phone: add Peru country code if 9 digits
    const cleaned = phone.replace(/\D/g, '');
    const fullPhone = cleaned.length === 9 ? `51${cleaned}` : cleaned;

    const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
}

// ==========================================
// PANTALLA DE ERROR AMIGABLE
// ==========================================
function showErrorScreen(title, subtitle) {
    const brandSlug = state.brand?.slug || detectBrandSlug() || '';
    const homeUrl = brandSlug ? `https://${brandSlug}.parygo.com` : 'https://parygo.com';

    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;background:#0a0a0a;color:#fff;font-family:'Urbanist',sans-serif;">
            <div style="font-size:64px;margin-bottom:16px;">😕</div>
            <h1 style="font-size:22px;font-weight:700;margin-bottom:8px;">${escapeHtml(title)}</h1>
            <p style="color:#888;font-size:14px;margin-bottom:24px;max-width:300px;">${escapeHtml(subtitle)}</p>
            <a href="${escapeHtml(homeUrl)}" style="background:#f43f5e;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Volver al inicio</a>
        </div>
    `;
}

// ==========================================
// FORMATEAR FECHA DEL EVENTO
// ==========================================
function formatEventDate(dateStr, timeStr) {
    if (!dateStr) return '';
    
    try {
        const date = new Date(dateStr + 'T00:00:00');
        
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        const diaSemana = dias[date.getDay()];
        const dia = date.getDate();
        const mes = meses[date.getMonth()];
        
        let resultado = `${diaSemana} ${dia} de ${mes}`;
        
        // Agregar hora si existe (convertir a AM/PM)
        if (timeStr) {
            resultado += ` - ${formatTime12h(timeStr)}`;
        }
        
        return resultado;
        
    } catch (e) {
        logger.error('Error formateando fecha:', e);
        return dateStr + (timeStr ? ' - ' + timeStr : '');
    }
}

// Convertir hora de 24h a 12h AM/PM
// Convertir hora a formato 12h AM/PM
function formatTime12h(timeStr) {
    if (!timeStr) return '';
    
    try {
        // Si ya tiene AM o PM, solo limpiar y devolver
        if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
            return timeStr.trim();
        }
        
        // Si es formato 24h, convertir
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours);
        const m = minutes || '00';
        
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        
        return `${h}:${m} ${ampm}`;
        
    } catch (e) {
        return timeStr;
    }
}