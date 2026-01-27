// js/register.js - MÓDULO DE REGISTRO DE USUARIOS
import { auth, db } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * REGISTRAR NUEVO USUARIO
 * @param {Object} userData - Datos del usuario
 * @param {string} password - Contraseña
 * @param {string} targetCollection - 'empresa', 'admins' o 'staff'
 * @returns {Object} { success: boolean, uid?: string, error?: string }
 */
export async function registerNewUser(userData, password, targetCollection = 'staff') {
    try {
        console.log(`🔐 Registrando usuario en ${targetCollection}...`);

        // Validaciones básicas
        if (!userData.email || !password) {
            throw new Error("Email y contraseña son obligatorios");
        }

        if (password.length < 6) {
            throw new Error("La contraseña debe tener al menos 6 caracteres");
        }

        // Validar que solo super admins puedan crear en 'empresa'
        if (targetCollection === 'empresa' && !state.isSuperAdmin) {
            throw new Error("No tienes permisos para crear super admins");
        }

        // 1. CREAR USUARIO EN FIREBASE AUTH
        console.log(`📧 Creando cuenta de autenticación para: ${userData.email}`);
        
        let userCredential;
        try {
            userCredential = await createUserWithEmailAndPassword(auth, userData.email, password);
        } catch (authError) {
            console.error("Error en Firebase Auth:", authError);
            
            if (authError.code === 'auth/email-already-in-use') {
                throw new Error("Este email ya está registrado");
            } else if (authError.code === 'auth/invalid-email') {
                throw new Error("Email inválido");
            } else if (authError.code === 'auth/weak-password') {
                throw new Error("Contraseña muy débil (mín. 6 caracteres)");
            } else {
                throw new Error(`Error de autenticación: ${authError.message}`);
            }
        }

        const uid = userCredential.user.uid;
        console.log(`✅ Usuario creado en Firebase Auth con UID: ${uid}`);

        // 2. GUARDAR DATOS EN FIRESTORE
        console.log(`💾 Guardando datos en Firestore (${targetCollection}/${uid})...`);
        
        const firestoreData = {
            ...userData,
            uid,
            email: userData.email,
            status: userData.status || "ACTIVE",
            created_at: new Date().toISOString(),
            created_by: state.currentUser.id
        };

        // NO guardar contraseña en Firestore
        delete firestoreData.password;
        delete firestoreData.pass;

        await setDoc(doc(db, targetCollection, uid), firestoreData);
        console.log(`✅ Datos guardados en ${targetCollection}/${uid}`);

        return { 
            success: true, 
            uid,
            message: "Usuario creado exitosamente"
        };

    } catch (error) {
        console.error("❌ Error registrando usuario:", error);
        return { 
            success: false, 
            error: error.message || "Error al crear usuario"
        };
    }
}

/**
 * REGISTRAR ADMIN DE MARCA
 */
export async function registerAdmin(formData) {
    const userData = {
        name: formData.name,
        lastname: formData.lastname || '',
        dni: formData.dni || '',
        email: formData.email.toLowerCase().trim(),
        phone: formData.phone || '',
        role: 'brand_admin',
        allowed_brands: formData.allowed_brands || [],
        company_id: state.currentUser.companyId || null
    };

    const password = formData.password || generateRandomPassword();
    
    return await registerNewUser(userData, password, 'admins');
}

/**
 * REGISTRAR PROMOTOR
 */
export async function registerPromoter(formData) {
    const userData = {
        name: formData.name,
        lastname: formData.lastname || '',
        email: formData.email.toLowerCase().trim(),
        dni: formData.dni,
        phone: formData.phone || '',
        role: 'promoter',
        companies: formData.companies || [],
        photo: formData.photo || ''
    };

    const password = formData.password || formData.dni || generateRandomPassword();
    
    return await registerNewUser(userData, password, 'staff');
}

/**
 * REGISTRAR SCANNER
 */
export async function registerScanner(formData) {
    const userData = {
        name: formData.name,
        email: formData.email.toLowerCase().trim(),
        role: 'scanner',
        companies: formData.companies || [],
        assigned_events: formData.assigned_events || []
    };

    const password = formData.password || generateRandomPassword();
    
    return await registerNewUser(userData, password, 'staff');
}

/**
 * GENERAR CONTRASEÑA ALEATORIA
 */
function generateRandomPassword() {
    const length = 8;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

/**
 * VALIDAR EMAIL
 */
export function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * VALIDAR DNI PERUANO
 */
export function isValidDNI(dni) {
    return /^\d{8}$/.test(dni);
}
