// js/utils.js - UTILIDADES GLOBALES
import { APP_CONFIG } from './config.js';
import { ref as storageRefFn, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { collection as fsCollection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 0. LOGGER (solo logea en desarrollo)
// ==========================================
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const logger = {
    log: (...args) => isDev && console.log(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => isDev && console.warn(...args)
};

// ==========================================
// 0.5 RATE LIMITER (MEJORA 4)
// ==========================================
/**
 * Crea un rate limiter client-side como primera barrera.
 * @param {number} maxCalls - Máximo de llamadas permitidas en la ventana
 * @param {number} windowMs - Ventana de tiempo en ms
 * @returns {function} - Retorna true si permitido, false si excede el límite
 */
export function createRateLimiter(maxCalls, windowMs) {
    let calls = [];
    return function() {
        const now = Date.now();
        calls = calls.filter(t => now - t < windowMs);
        if (calls.length >= maxCalls) return false;
        calls.push(now);
        return true;
    };
}

// ==========================================
// 1. VALIDADOR
// ==========================================
export const Validator = {
    /**
     * Validar email
     */
    email: (email) => {
        if (!email) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    },
    
    /**
     * Validar DNI peruano (8 dígitos)
     */
    dni: (dni) => {
        if (!dni) return false;
        return /^\d{8}$/.test(dni.trim());
    },
    
    /**
     * Validar teléfono
     */
    phone: (phone) => {
        if (!phone) return false;
        return /^[+]?[0-9]{9,15}$/.test(phone.replace(/\s/g, ''));
    },
    
    /**
     * Validar que no esté vacío
     */
    notEmpty: (str) => {
        return str && str.trim().length > 0;
    },
    
    /**
     * Validar longitud mínima
     */
    minLength: (str, min) => {
        return str && str.length >= min;
    },
    
    /**
     * Sanitizar HTML para prevenir XSS
     */
    sanitizeHTML: (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    /**
     * Validar contraseña (mínimo 6 caracteres)
     */
    password: (pass) => {
        return pass && pass.length >= 6;
    }
};

// ==========================================
// 2. TOAST (NOTIFICACIONES)
// ==========================================

/**
 * Mostrar notificación toast
 * @param {string} msg - Mensaje a mostrar
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 */
export function toast(msg, type = 'success') {
    const container = document.getElementById('toast-container') || document.getElementById('toastContainer');
    if (!container) {
        logger.warn('Toast container not found');
        return;
    }

    const toastEl = document.createElement('div');
    toastEl.className = `custom-toast toast toast-${type} ${type}`;

    // Iconos según tipo
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    const icon = icons[type] || icons.success;
    toastEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${Validator.sanitizeHTML(msg)}</span>`;

    container.appendChild(toastEl);

    const duration = APP_CONFIG.LIMITS.TOAST_DURATION;
    setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(-20px)';
        toastEl.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
        }, 300);
    }, duration);
}

// Alias para archivos que usan showToast (scanner.js, reclamar.js)
export const showToast = toast;

// ==========================================
// 3. MODALES - SISTEMA UNIFICADO
// ==========================================

/**
 * Abrir modal por ID
 * @param {string} id - ID del modal
 */
export function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
        logger.error(`Modal ${id} not found`);
        return;
    }
    
    // Remover clases conflictivas
    modal.classList.remove('hidden');
    
    // Forzar estilos para asegurar visibilidad
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    
    // Agregar clase open para animaciones CSS
    requestAnimationFrame(() => {
        modal.classList.add('open');
    });
    
    // Prevenir scroll del body
    document.body.style.overflow = 'hidden';
    
}

/**
 * Cerrar todos los modales
 */
export function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('open');
        modal.classList.add('hidden');
        
        // Resetear estilos inline
        modal.style.display = '';
        modal.style.opacity = '';
        modal.style.visibility = '';
    });
    
    // Restaurar scroll del body
    document.body.style.overflow = '';
    
    // Resetear previews de imágenes
    const prev = document.getElementById('ev_prev');
    if (prev) {
        prev.style.display = 'none';
        prev.src = '';
    }
    
    const prevCont = document.getElementById('ev_prev_container');
    if (prevCont) prevCont.style.display = 'none';
    
    const zone = document.getElementById('uploadZone');
    if (zone) zone.style.display = 'flex';
    
}

/**
 * Cerrar un modal específico
 * @param {string} id - ID del modal
 */
export function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    
    modal.classList.remove('open');
    modal.classList.add('hidden');
    modal.style.display = '';
    modal.style.opacity = '';
    modal.style.visibility = '';
    
    // Verificar si hay otros modales abiertos
    const openModals = document.querySelectorAll('.modal.open');
    if (openModals.length === 0) {
        document.body.style.overflow = '';
    }
}

// ==========================================
// 4. DIÁLOGO DE CONFIRMACIÓN
// ==========================================

/**
 * Mostrar diálogo de confirmación
 * @param {string} msg - Mensaje de confirmación
 * @returns {Promise<boolean>}
 */
export function customConfirm(message, title = 'Confirmar') {
    return new Promise((resolve) => {
        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px;">
                <div class="confirm-dialog">
                    <div class="confirm-icon">
                        <i class="fa-solid fa-question"></i>
                    </div>
                    <h3>${escapeHtml(title)}</h3>
                    <p>${escapeHtml(message)}</p>
                    <div class="confirm-actions">
                        <button class="btn btn-ghost" id="confirmCancel">Cancelar</button>
                        <button class="btn btn-primary" id="confirmOk">Sí, continuar</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus en el botón cancelar por seguridad
        modal.querySelector('#confirmCancel').focus();
        
        // Event listeners
        modal.querySelector('#confirmOk').addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });
        
        modal.querySelector('#confirmCancel').addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });
        
        // Cerrar con ESC
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                resolve(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // Cerrar al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });
    });
}

// ==========================================
// 5. NAVEGACIÓN DE VISTAS
// ==========================================

/**
 * Cambiar a una vista específica
 * @param {string} viewId - ID de la vista
 */
export function switchView(viewId) {
    // Ocultar todas las secciones
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Mostrar la vista deseada
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        
        // Scroll al inicio
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } else {
        logger.error(`Vista no encontrada: ${viewId}`);
    }
}

// ==========================================
// 6. FORMATEO DE DATOS
// ==========================================

/**
 * Formatear fecha
 */
export function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dateString;
    }
}

/**
 * Formatear fecha y hora
 */
export function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}

/**
 * Formatear moneda
 */
export function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'S/ 0.00';
    return `S/ ${Number(amount).toFixed(2)}`;
}

// ==========================================
// 7. HELPERS DE IMÁGENES
// ==========================================

/**
 * Comprimir imagen a base64
 * @param {File} file - Archivo de imagen
 * @param {number} maxWidth - Ancho máximo
 * @param {number} quality - Calidad (0-1)
 * @returns {Promise<string>}
 */
export function compressImage(file, maxWidth = APP_CONFIG.LIMITS.IMAGE_MAX_WIDTH, quality = 0.7) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.match(/image.*/)) {
            reject(new Error('Archivo no es una imagen'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = () => reject(new Error('Error cargando imagen'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsDataURL(file);
    });
}

/**
 * Subir imagen a Firebase Storage
 * @param {object} storageInstance - Firebase Storage instance
 * @param {string} base64Data - Datos base64 de la imagen
 * @param {string} path - Ruta en Storage (ej: images/events/docId/timestamp.jpg)
 * @returns {Promise<string>} URL de descarga
 */
export async function uploadToStorage(storageInstance, base64Data, path) {
    if (!base64Data || !base64Data.startsWith('data:')) {
        return base64Data || '';
    }
    const response = await fetch(base64Data);
    const blob = await response.blob();
    const sRef = storageRefFn(storageInstance, path);
    const snapshot = await uploadBytes(sRef, blob);
    return getDownloadURL(snapshot.ref);
}

// ==========================================
// 8. GENERADORES DE CÓDIGOS
// ==========================================

/**
 * Generar código único
 */
export function generateCode(eventName = 'TICKET') {
    // Tomar primeras 4 letras del evento (sin espacios, sin caracteres especiales)
    const prefix = eventName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 4)
        .padEnd(4, 'X');
    
    // Generar 4 caracteres aleatorios (letras y números)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
    let random = '';
    for (let i = 0; i < 4; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `${prefix}${random}`;
}

/**
 * Generar UID simple
 */
export function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ==========================================
// 9. DEBOUNCE & THROTTLE
// ==========================================

/**
 * Debounce function
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==========================================
// 10. EXPORT ALL
// ==========================================

/**
 * Escapar HTML para prevenir XSS
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// 11. ERROR MONITOR (MEJORA 6)
// ==========================================
const errorRateLimit = createRateLimiter(10, 60000); // max 10 errores/min al server

export function initErrorMonitor(dbInstance, pageName = 'unknown') {
    if (!dbInstance) return;

    const sendError = async (errorData) => {
        if (!errorRateLimit()) return;
        try {
            await addDoc(fsCollection(dbInstance, 'errors'), {
                ...errorData,
                page: pageName,
                url: window.location.origin + window.location.pathname,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            // Silently fail - don't cause more errors
        }
    };

    window.onerror = (message, source, lineno, colno) => {
        sendError({ type: 'error', message: String(message), source, lineno, colno });
    };

    window.addEventListener('unhandledrejection', (event) => {
        sendError({ type: 'unhandledrejection', message: String(event.reason) });
    });
}

export default {
    Validator,
    toast,
    showToast,
    openModal,
    closeModals,
    closeModal,
    customConfirm,
    switchView,
    formatDate,
    formatDateTime,
    formatCurrency,
    compressImage,
    uploadToStorage,
    generateCode,
    generateUID,
    debounce,
    throttle,
    escapeHtml,
    logger,
    createRateLimiter,
    initErrorMonitor
};
