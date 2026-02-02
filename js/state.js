// js/state.js - ESTADO GLOBAL DE LA APLICACIÓN

/**
 * Estado global centralizado
 * Mantiene todos los datos de la sesión actual
 */
export const state = {
    // ==========================================
    // DATOS PRINCIPALES
    // ==========================================
    allEvents: [],
    allBrands: [],
    allPromotersData: [],
    
    // ==========================================
    // SESIÓN Y USUARIO
    // ==========================================
    currentUser: null,
    currentCompany: null,
    isSuperAdmin: false,
    
    // ==========================================
    // FILTROS Y NAVEGACIÓN
    // ==========================================
    activeEventId: null,
    activeBrandId: null,
    currentFilter: 'ALL',
    currentView: 'view_events',
    
    // ==========================================
    // TEMPORALES (Para formularios y uploads)
    // ==========================================
    tempImgBase64: null,
    tempBrandLogo: null,
    tempSelectedBrands: [],  // Para selector de marcas en promotores
    tempAdminBrands: [],     // Para selector de marcas en admins
    tempPromoterPhoto: null, // Foto de perfil del promotor
    
    // ==========================================
    // UI STATE
    // ==========================================
    isLoading: false,
    modalStack: [], // Para manejar modales anidados
};

// ==========================================
// FUNCIONES HELPER
// ==========================================

/**
 * Limpiar todos los datos temporales
 */
export function resetTemps() {
    state.tempImgBase64 = null;
    state.tempBrandLogo = null;
    state.tempSelectedBrands = [];
    state.tempAdminBrands = [];
    state.tempPromoterPhoto = null;
}

/**
 * Limpiar sesión completa
 */
export function clearSession() {
    state.currentUser = null;
    state.currentCompany = null;
    state.isSuperAdmin = false;
    state.allEvents = [];
    state.allBrands = [];
    state.allPromotersData = [];
    state.activeEventId = null;
    state.activeBrandId = null;
    state.currentFilter = 'ALL';
    resetTemps();
}

/**
 * Obtener evento activo
 */
export function getActiveEvent() {
    if (!state.activeEventId) return null;
    return state.allEvents.find(e => e.id === state.activeEventId) || null;
}

/**
 * Obtener marca por ID
 */
export function getBrandById(brandId) {
    if (!brandId) return null;
    return state.allBrands.find(b => b.id === brandId) || null;
}

/**
 * Obtener promotor por ID
 */
export function getPromoterById(promoterId) {
    if (!promoterId) return null;
    return state.allPromotersData.find(p => p.id === promoterId) || null;
}

/**
 * Verificar si el usuario actual puede editar un evento
 */
export function canEditEvent(event) {
    if (!event || !state.currentUser) return false;
    if (state.isSuperAdmin) return true;
    
    // Verificar por company_id
    if (state.currentUser.companyId && event.company_id === state.currentUser.companyId) {
        return true;
    }
    
    // Verificar por brand_id
    const allowedBrands = state.currentUser.allowed_brands || [];
    if (allowedBrands.includes(event.brand_id)) {
        return true;
    }
    
    return false;
}

/**
 * Verificar si el usuario puede crear contenido para una marca
 */
export function canManageBrand(brandId) {
    if (!brandId || !state.currentUser) return false;
    if (state.isSuperAdmin) return true;
    
    const allowedBrands = state.currentUser.allowed_brands || state.currentUser.companies || [];
    return allowedBrands.includes(brandId);
}

/**
 * Set loading state
 */
export function setLoading(isLoading) {
    state.isLoading = isLoading;
    // Puedes agregar lógica para mostrar/ocultar un spinner global aquí
}

/**
 * Debug: Imprimir estado actual (solo en desarrollo)
 */
export function debugState() {
    // Deshabilitado en producción para no exponer datos sensibles
}
