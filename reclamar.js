// ==========================================
// RECLAMAR ENTRADA - JAVASCRIPT
// ==========================================

import { db, functions } from './js/config.js';
import { detectBrandSlug, loadBrandBySlug } from './utils/brand-detector.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

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

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
            showToast('No se especificó una marca', 'error');
            showLoading(false);
            return;
        }

        const brand = await loadBrandBySlug(brandSlug);

        if (!brand) {
            showToast('Marca no encontrada', 'error');
            showLoading(false);
            return;
        }

        state.brand = brand;
        applyBrandTheme();

    } catch (error) {
        console.error('Error cargando marca:', error);
        showToast('Error al cargar la marca', 'error');
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
}

// ==========================================
// PASO 1: VALIDAR CÓDIGO
// ==========================================
async function validateCode() {
    if (isProcessing) return;

    const codeInput = document.getElementById('inputCode');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        showToast('Ingresa un código', 'error');
        return;
    }

    isProcessing = true;
    showLoading(true);

    try {
        const q = query(
            collection(db, "tickets"),
            where("code", "==", code)
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            const q2 = query(
                collection(db, "tickets"),
                where("qr_token", "==", code)
            );
            const snapshot2 = await getDocs(q2);
            
            if (snapshot2.empty) {
                showToast('Código no encontrado. Verifica que esté bien escrito', 'error');
                showLoading(false);
                return;
            }
            
            state.codeData = { id: snapshot2.docs[0].id, ...snapshot2.docs[0].data() };
        } else {
            state.codeData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
        
        if (state.brand && state.codeData.brand_id && state.codeData.brand_id !== state.brand.id) {
            showToast(`Este código pertenece a otra marca, no a ${state.brand.name || 'esta'}`, 'error');
            showLoading(false);
            return;
        }
        
        const codeType = state.codeData.type || "UNIQUE";
        
        if (codeType === "UNIQUE") {
            if (state.codeData.status === 'CLAIMED' || state.codeData.status === 'SCANNED' || state.codeData.current_uses > 0) {
                showToast('Este código ya fue utilizado', 'error');
                showLoading(false);
                return;
            }
        } else if (codeType === "SHARED") {
            const maxUses = state.codeData.max_uses || 1;
            const currentUses = state.codeData.current_uses || 0;
            
            if (currentUses >= maxUses) {
                showToast(`Este código alcanzó su límite (${currentUses}/${maxUses} usos)`, 'error');
                showLoading(false);
                return;
            }
        }
        
        if (state.codeData.expires_at) {
            const expiryDate = new Date(state.codeData.expires_at);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (expiryDate < today) {
                const expStr = expiryDate.toLocaleDateString('es-PE');
                showToast(`Este código expiró el ${expStr}`, 'error');
                showLoading(false);
                return;
            }
        }
        
        if (state.codeData.event_id) {
            try {
                const eventDoc = await getDoc(doc(db, "events", state.codeData.event_id));
                if (eventDoc.exists()) {
                    const event = eventDoc.data();
                    
                    if (event.status === 'FINISHED' || event.status === 'CANCELLED') {
                        showToast(`El evento "${event.name || ''}" ya finalizó`, 'error');
                        showLoading(false);
                        return;
                    }
                    
                    if (event.date) {
                        const eventDate = new Date(event.date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        eventDate.setHours(23, 59, 59, 999);
                        
                        if (eventDate < today) {
                            showToast('Este evento ya pasó', 'error');
                            showLoading(false);
                            return;
                        }
                    }
                }
            } catch (e) {
                // No se pudo verificar evento
            }
        }
        
        state.code = code;
        goToStep(2);
        
    } catch (error) {
        console.error('Error validando código:', error);
        showToast('Error al validar el código', 'error');
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
                console.error('Error API DNI:', apiError);
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
        console.error('Error buscando DNI:', error);
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
        const qrToken = `TKT${generateUUID().replace(/-/g, '').toUpperCase()}`;

        const codeType = state.codeData.type || state.codeData.ticket_type || "UNIQUE";
        const codeRef = doc(db, "tickets", state.codeData.id);

        if (codeType === "UNIQUE") {
            await updateDoc(codeRef, {
                status: 'CLAIMED',
                current_uses: 1,
                claimed_at: new Date().toISOString(),
                client_name: `${name} ${lastname}`,
                client_dni: state.userData.dni,
                client_email: email,
                client_phone: phone,
                id_type: state.userData.idType,
                qr_token: qrToken,
                claimed_by: {
                    name: `${name} ${lastname}`,
                    dni: state.userData.dni,
                    email: email,
                    phone: phone
                }
            });
        } else {
            // Código compartido: incrementar usos
            const newUses = (state.codeData.current_uses || 0) + 1;
            const maxUses = state.codeData.max_uses || 1;

            await updateDoc(codeRef, {
                current_uses: newUses,
                status: newUses >= maxUses ? 'EXHAUSTED' : 'ACTIVE',
                last_claimed_at: new Date().toISOString(),
                client_name: `${name} ${lastname}`,
                client_dni: state.userData.dni,
                client_email: email,
                client_phone: phone,
                id_type: state.userData.idType,
                qr_token: qrToken
            });
        }

        await addDoc(collection(db, "accesses"), {
            brand_id: state.codeData.brand_id || state.brand?.id || "",
            event_id: state.codeData.event_id || '',
            event_name: state.codeData.event_name || '',
            code_id: state.codeData.id,
            code: state.code,
            code_type: codeType,
            ticket_id: state.codeData.ticket_id || '',
            ticket_name: state.codeData.ticket_name || 'General',
            promoter_id: state.codeData.promoter_id || '',
            promoter_name: state.codeData.promoter_name || '',
            client_name: `${name} ${lastname}`,
            client_dni: state.userData.dni,
            client_email: email,
            client_phone: phone,
            id_type: state.userData.idType,
            qr_token: qrToken,
            status: 'CLAIMED',
            is_free: true,
            created_at: new Date().toISOString()
        });

        await showTicket(qrToken);

    } catch (error) {
        console.error('Error reclamando ticket:', error);
        showToast('Error al generar el ticket', 'error');
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
        try {
            const eventDoc = await getDoc(doc(db, "events", state.codeData.event_id));
            if (eventDoc.exists()) {
                const event = eventDoc.data();
                eventName = event.name || 'Evento';
                eventVenue = event.venue || event.location || event.address || '';
                eventDate = event.date || '';
                eventTime = event.time || event.hour || event.hora || event.start_time || '';
            }
        } catch (e) {
            // No se pudo cargar evento
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
            document.body.appendChild(qrDiv);

            new QRCode(qrDiv, {
                text: qrToken,
                width: qrSize,
                height: qrSize,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            
            setTimeout(() => {
                const qrImg = qrDiv.querySelector('img');
                if (qrImg) {
                    const img = new Image();
                    img.onload = () => {
                        // Dibujar QR centrado
                        const qrX = (width - qrSize) / 2;
                        const qrY = 40;
                        
                        // Sombra del QR
                        ctx.shadowColor = 'rgba(0,0,0,0.1)';
                        ctx.shadowBlur = 20;
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30);
                        ctx.shadowBlur = 0;
                        
                        // Dibujar QR
                        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
                        
                        document.body.removeChild(qrDiv);
                        resolve();
                    };
                    img.src = qrImg.src;
                } else {
                    document.body.removeChild(qrDiv);
                    resolve();
                }
            }, 200);
        });
        
        // Texto "Sujeto a capacidad de aforo"
        ctx.fillStyle = '#999999';
        ctx.font = '12px Outfit, Arial, sans-serif';
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
        ctx.font = 'bold 18px Outfit, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(eventName, width / 2, 320);
        
        // Ubicación
        if (venue) {
            ctx.fillStyle = '#666666';
            ctx.font = '13px Outfit, Arial, sans-serif';
            ctx.fillText(venue, width / 2, 345);
        }
        
        // Fecha y hora
        if (dateTime) {
            ctx.fillStyle = '#666666';
            ctx.font = '13px Outfit, Arial, sans-serif';
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
        ctx.font = 'bold 16px Outfit, Arial, sans-serif';
        ctx.fillText(clientName, width / 2, 440);
        
        // DNI
        ctx.fillStyle = '#666666';
        ctx.font = '14px Outfit, Arial, sans-serif';
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
        ctx.roundRect(btnX, btnY, btnWidth, btnHeight, 12);
        ctx.fill();
        
        // Texto del tipo de entrada
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Outfit, Arial, sans-serif';
        ctx.fillText(ticketType, width / 2, btnY + 30);
        
        // Productora
        if (brandName) {
            ctx.fillStyle = '#888888';
            ctx.font = '13px Outfit, Arial, sans-serif';
            ctx.fillText(brandName, width / 2, 600);
        }
        
        // Descargar
        const link = document.createElement('a');
        link.download = `entrada_${state.userData.dni}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        
        showToast('Entrada descargada', 'success');
        
    } catch (error) {
        console.error('Error descargando ticket:', error);
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

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
        console.error('Error formateando fecha:', e);
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