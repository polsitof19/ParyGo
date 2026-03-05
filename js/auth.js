// js/auth.js - AUTENTICACIÓN CON FIREBASE AUTH (SEGURO)
import { db, auth, APP_CONFIG, isSuperAdminRole } from './config.js';
import { state, clearSession } from './state.js';
import { toast, logger } from './utils.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getDocs, 
    query, 
    collection, 
    where, 
    doc, 
    getDoc,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. LOGIN CON FIREBASE AUTH
// ==========================================

/**
 * Iniciar sesión con email y contraseña
 */
export async function doLogin() {
    const emailInput = document.getElementById("adm_email");
    const passInput = document.getElementById("adm_pass");
    const btn = document.getElementById("btnLogin");
    
    if (!emailInput || !passInput) {
        toast("Error: Campos de login no encontrados", "error");
        return;
    }
    
    const email = emailInput.value.trim().toLowerCase();
    const pass = passInput.value.trim();
    const originalText = btn ? btn.textContent : "INICIAR SESIÓN";

    // Ocultar error anterior
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.style.display = 'none';

    if (!email || !pass) {
        toast("Completa todos los campos", "error");
        return;
    }

    if (btn) {
        btn.textContent = "Verificando...";
        btn.disabled = true;
    }

    let authSucceeded = false;
    try {
        // Autenticar con Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        authSucceeded = true;
        const firebaseUser = userCredential.user;

        // Buscar datos del usuario en Firestore
        const userData = await getUserData(firebaseUser.uid, email);

        if (!userData) {
            await signOut(auth);
            throw new Error("Usuario no encontrado en el sistema");
        }

        // Crear sesión
        await createSession(userData, firebaseUser.uid);

        toast(`¡Bienvenido ${userData.name}!`, "success");

        // Recargar para aplicar la sesión
        setTimeout(() => window.location.reload(), 800);

    } catch (error) {
        logger.error("Error Login:", error);

        // BUG-10 FIX: Limpiar sesión solo si Firebase Auth aceptó las credenciales
        // pero la verificación de Firestore falló (evita cerrar sesiones de otras pestañas)
        if (authSucceeded && auth.currentUser) {
            try { await signOut(auth); } catch (e) { /* ignore */ }
        }

        let errorMsg = error.message || "Error al iniciar sesión";
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
                errorMsg = "Correo o contraseña incorrectos";
                break;
            case 'auth/user-not-found':
                errorMsg = "Usuario no encontrado";
                break;
            case 'auth/too-many-requests':
                errorMsg = "Demasiados intentos. Espera unos minutos";
                break;
            case 'auth/invalid-email':
                errorMsg = "Email inválido";
                break;
        }

        toast(errorMsg, "error");

        if (errorDiv) {
            errorDiv.textContent = errorMsg;
            errorDiv.style.display = 'block';
        }

        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}

// ==========================================
// 2. BUSCAR DATOS DEL USUARIO
// ==========================================

/**
 * Buscar usuario en Firestore por UID o email
 */
async function getUserData(uid, email) {
    const { COLLECTIONS } = APP_CONFIG;
    const collections = [COLLECTIONS.EMPRESA, COLLECTIONS.ADMINS, COLLECTIONS.STAFF];
    
    let userData = null;
    let collectionName = "";

    // 1. Buscar por UID (más rápido y seguro)
    for (const col of collections) {
        try {
            const docSnap = await getDoc(doc(db, col, uid));
            if (docSnap.exists()) {
                userData = { id: docSnap.id, ...docSnap.data() };
                collectionName = col;
                break;
            }
        } catch (error) {
            // R19 FIX: Log para depuración
            logger.error(`getUserData: Error buscando UID en ${col}:`, error);
        }
    }

    // 2. Si no se encuentra por UID, buscar por email (compatibilidad legacy)
    if (!userData) {
        for (const col of collections) {
            try {
                const q = query(collection(db, col), where("email", "==", email));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    const docRef = snap.docs[0];
                    userData = { id: docRef.id, ...docRef.data() };
                    collectionName = col;

                    // Migrar: actualizar documento con UID correcto
                    if (docRef.id !== uid) {
                        await setDoc(doc(db, col, uid), { ...userData, uid }, { merge: true });
                        userData.id = uid;
                    }

                    break;
                }
            } catch (error) {
                // R19 FIX: Log para depuración
                logger.error(`getUserData: Error buscando email en ${col}:`, error);
            }
        }
    }

    if (!userData) return null;

    // Validar que no sea promotor intentando acceder al panel admin
    const userRole = userData.role || userData.rol;
    if (collectionName === COLLECTIONS.STAFF && userRole === APP_CONFIG.ROLES.PROMOTER) {
        throw new Error("Acceso denegado: Usa el portal de promotores");
    }

    // Detectar tipo de admin
    const isSuperAdmin = isSuperAdminRole(userData) || collectionName === COLLECTIONS.EMPRESA;

    // Obtener datos de empresa si aplica
    let companyData = null;
    const companyId = userData.id_empresa || userData.company_id || userData.created_by;

    if (!isSuperAdmin && companyId) {
        try {
            const companySnap = await getDoc(doc(db, COLLECTIONS.EMPRESA, companyId));
            if (companySnap.exists()) {
                companyData = { id: companyId, ...companySnap.data() };
            }
        } catch (e) {
            // Could not load company data
        }
    }

    return {
        uid,
        id: uid,
        name: userData.name || userData.nombre || 'Usuario',
        lastname: userData.lastname || '',
        email: userData.email,
        role: userRole,
        companyId: companyId || null,
        companyData: companyData,
        allowed_brands: userData.allowed_brands || userData.companies || [],
        collection: collectionName,
        is_super_admin: isSuperAdmin
    };
}

// ==========================================
// 3. CREAR SESIÓN
// ==========================================

/**
 * Crear sesión en state y aplicar configuración
 */
async function createSession(userData, uid) {
    // Guardar en state global
    state.currentUser = userData;
    state.isSuperAdmin = userData.is_super_admin;
    state.currentCompany = userData.companyData;

    // Aplicar color de empresa si existe
    if (userData.companyData?.color) {
        document.documentElement.style.setProperty('--primary', userData.companyData.color);
    }

    // Guardar backup en localStorage
    localStorage.setItem("PARYGO_ADM_SESSION", JSON.stringify({
        uid,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        is_super_admin: userData.is_super_admin,
        collection: userData.collection,
        timestamp: Date.now()
    }));

}

// ==========================================
// 4. LOGOUT
// ==========================================

/**
 * Cerrar sesión
 */
export async function doLogout() {
    try {
        await signOut(auth);
        
        // Limpiar todo
        localStorage.removeItem("PARYGO_ADM_SESSION");
        clearSession();
        
        toast("Sesión cerrada", "info");
        
        setTimeout(() => window.location.reload(), 500);
        
    } catch (error) {
        logger.error("Error al cerrar sesión:", error);
        toast("Error al cerrar sesión", "error");
    }
}
// ==========================================
// 5. VERIFICAR AUTENTICACIÓN
// ==========================================

/**
 * Verificar estado de autenticación al cargar la página
 */
export function checkAuth() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            unsubscribe(); // Solo necesitamos el primer resultado
            
            if (firebaseUser) {
                try {
                    const userData = await getUserData(firebaseUser.uid, firebaseUser.email);
                    
                    if (userData) {
                        await createSession(userData, firebaseUser.uid);
                        
                        // Mostrar app, ocultar login
                        document.getElementById("loginOverlay")?.classList.add("hidden");
                        document.getElementById("appLayout")?.classList.remove("hidden");
                        
                        applyAdminUI();
                        
                        resolve(userData);
                    } else {
                        // Usuario de Firebase Auth sin datos en Firestore
                        await signOut(auth);
                        showLoginScreen();
                        resolve(null);
                    }
                } catch (error) {
                    await signOut(auth);
                    localStorage.removeItem("PARYGO_ADM_SESSION");
                    showLoginScreen();
                    resolve(null);
                }
            } else {
                showLoginScreen();
                resolve(null);
            }
        });
    });
}

/**
 * Mostrar pantalla de login
 */
function showLoginScreen() {
    document.getElementById("loginOverlay")?.classList.remove("hidden");
    document.getElementById("appLayout")?.classList.add("hidden");
}

/**
 * Obtener usuario actual
 */
export function getCurrentUser() {
    return state.currentUser;
}

// ==========================================
// 6. UI DE ADMINISTRADOR
// ==========================================

/**
 * Aplicar UI según tipo de admin
 */
function applyAdminUI() {
    const isGod = state.isSuperAdmin;
    
    // Elementos que solo ve el Super Admin
    const superAdminElements = [
        'nav_admins',
        'btnCreateBrand'
    ];
    
    superAdminElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = isGod ? 'flex' : 'none';
        }
    });
    
    // Indicador visual para Super Admin
    if (isGod) {
        const logo = document.querySelector('.logo');   
    }
    
}

// ==========================================
// 7. REGISTRO DE USUARIOS (SEGURO)
// ==========================================

/**
 * Registrar nuevo usuario en Firebase Auth + Firestore
 * NO guarda contraseñas en Firestore
 */
export async function registerUser(email, password, userData, targetCollection = 'staff') {
    try {
        // Validaciones
        if (!email || !password) {
            throw new Error("Email y contraseña son obligatorios");
        }
        
        if (password.length < APP_CONFIG.LIMITS.MIN_PASSWORD_LENGTH) {
            throw new Error(`La contraseña debe tener al menos ${APP_CONFIG.LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
        }

        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        // Preparar datos para Firestore (SIN contraseña)
        const firestoreData = {
            ...userData,
            uid,
            email: email.toLowerCase().trim(),
            status: userData.status || APP_CONFIG.STATUS.ACTIVE,
            created_at: new Date().toISOString(),
            created_by: state.currentUser?.id || 'system'
        };
        
        // Asegurar que NO se guarde la contraseña
        delete firestoreData.password;
        delete firestoreData.pass;

        // Guardar en Firestore
        await setDoc(doc(db, targetCollection, uid), firestoreData);

        return { success: true, uid };
        
    } catch (error) {
        logger.error("Error registrando usuario:", error);
        
        let errorMsg = "Error al crear usuario";
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMsg = "Este email ya está registrado";
                break;
            case 'auth/weak-password':
                errorMsg = "La contraseña debe tener al menos 6 caracteres";
                break;
            case 'auth/invalid-email':
                errorMsg = "Email inválido";
                break;
        }
        
        return { success: false, error: error.message || errorMsg };
    }
}

/**
 * Cambiar contraseña del usuario actual
 */
export async function changePassword(currentPassword, newPassword) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No hay usuario autenticado");
        
        // Re-autenticar primero
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Cambiar contraseña
        await updatePassword(user, newPassword);
        
        return { success: true };
    } catch (error) {
        logger.error("Error cambiando contraseña:", error);
        return { success: false, error: error.message };
    }
}
