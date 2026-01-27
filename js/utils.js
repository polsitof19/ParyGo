// js/utils.js - UTILIDADES GLOBALES

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
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found');
        return;
    }
    
    const toastEl = document.createElement('div');
    toastEl.className = `custom-toast ${type}`;
    
    // Iconos según tipo
    const icons = {
        success: '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>',
        error: '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i>',
        info: '<i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i>'
    };
    
    const icon = icons[type] || icons.success;
    toastEl.innerHTML = `${icon} <span>${Validator.sanitizeHTML(msg)}</span>`;
    
    container.appendChild(toastEl);
    
    // Remover después de 3 segundos
    setTimeout(() => {
        toastEl.classList.add('hiding');
        toastEl.addEventListener('animationend', () => {
            if (toastEl.parentNode) {
                toastEl.remove();
            }
        });
    }, 3000);
}

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
        console.error(`Modal ${id} not found`);
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
                    <h3>${title}</h3>
                    <p>${message}</p>
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
        console.error(`Vista no encontrada: ${viewId}`);
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
export function compressImage(file, maxWidth = 800, quality = 0.7) {
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

export default {
    Validator,
    toast,
    openModal,
    closeModals,
    closeModal,
    customConfirm,
    switchView,
    formatDate,
    formatDateTime,
    formatCurrency,
    compressImage,
    generateCode,
    generateUID,
    debounce,
    throttle,
    escapeHtml
};
