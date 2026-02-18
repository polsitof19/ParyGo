// js/config.js - CONFIGURACIÓN CENTRALIZADA Y SEGURA
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================
// NOTA: En producción, considera usar Firebase Hosting con configuración automática
// o variables de entorno del servidor

const firebaseConfig = {
    apiKey: "AIzaSyANnihyrgd02ViR_GeKn6Mdf85nLwUjQg0",
    authDomain: "parygo-da36a.firebaseapp.com",
    projectId: "parygo-da36a",
    storageBucket: "parygo-da36a.firebasestorage.app",
    messagingSenderId: "58655250311",
    appId: "1:58655250311:web:9b8f46dd35d0a44ce2e522"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// Configurar persistencia de sesión
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Error configurando persistencia:", error);
});

// ==========================================
// CONSULTA DNI VÍA CLOUD FUNCTION
// ==========================================
// Token movido a Cloud Function (functions/index.js)
// Configurar con: firebase functions:config:set reniec.token="TU_TOKEN"
export async function consultarDNISeguro(dni) {
    const fn = httpsCallable(functions, 'consultaDNI');
    const result = await fn({ dni });
    return result.data;
}

// ==========================================
// CONSTANTES DE LA APLICACIÓN
// ==========================================
export const APP_CONFIG = {
    APP_NAME: "ParyGo",
    VERSION: "2.0.0",
    
    // Roles del sistema
    ROLES: {
        SUPER_ADMIN: 'super_admin',
        BRAND_ADMIN: 'brand_admin',
        ADMIN: 'admin',
        PROMOTER: 'promoter',
        SCANNER: 'scanner'
    },
    
    // Colecciones de Firestore
    COLLECTIONS: {
        EMPRESA: 'empresa',
        ADMINS: 'admins',
        STAFF: 'staff',
        BRANDS: 'brands',
        EVENTS: 'events',
        TICKETS: 'tickets',
        QUOTAS: 'quotas',
        SALES: 'sales',
        REWARDS: 'rewards'
    },
    
    // Estados
    STATUS: {
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        SCANNED: 'SCANNED',
        DELIVERED: 'DELIVERED'
    },
    
    // Límites
    LIMITS: {
        MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
        MAX_LOGO_SIZE: 2 * 1024 * 1024,  // 2MB
        MAX_CODES_PER_BATCH: 1000,
        MIN_PASSWORD_LENGTH: 6
    }
};

// ==========================================
// HELPERS DE SEGURIDAD
// ==========================================

/**
 * Verificar si es un Super Admin
 */
export function isSuperAdminRole(user) {
    if (!user) return false;
    return user.is_super_admin === true || 
           user.role === APP_CONFIG.ROLES.SUPER_ADMIN || 
           user.collection === APP_CONFIG.COLLECTIONS.EMPRESA;
}

/**
 * Verificar permisos de marca
 */
export function hasPermissionForBrand(user, brandId) {
    if (!user || !brandId) return false;
    if (isSuperAdminRole(user)) return true;
    
    const allowedBrands = user.allowed_brands || user.companies || [];
    return allowedBrands.includes(brandId);
}

