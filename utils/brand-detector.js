// ==========================================
// BRAND DETECTOR - Detección de marca por subdominio
// ==========================================
// Uso: import { detectBrandSlug, loadBrandBySlug } from '../utils/brand-detector.js';

import { db } from '../js/config.js';
import {
    collection, query, where, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DOMAIN = "parygo.com";

/**
 * Detectar slug de marca desde subdominio, query param o path
 * hoesky.parygo.com → "hoesky"
 * localhost?brand=hoesky → "hoesky"
 */
export function detectBrandSlug() {
    const hostname = window.location.hostname;

    // Producción: subdominio.parygo.com
    if (hostname.includes(`.${DOMAIN}`) || hostname.includes('.parygo.')) {
        const parts = hostname.split('.');
        if (parts.length >= 3 && parts[0] !== 'www') {
            return parts[0].toLowerCase();
        }
    }

    // Desarrollo local: parámetro ?brand=xxx o ?marca=xxx
    const params = new URLSearchParams(window.location.search);
    const brandParam = params.get('brand') || params.get('marca');
    if (brandParam) {
        return brandParam.toLowerCase();
    }

    return null;
}

/**
 * Cargar datos de marca desde Firestore por slug
 * Busca en "brands", fallback a "companies", fallback a ID directo
 * @param {string} slug
 * @returns {Object|null} { id, name, slug, logo, color, ... }
 */
export async function loadBrandBySlug(slug) {
    if (!slug) return null;

    try {
        // Buscar en brands por slug
        const q = query(collection(db, "brands"), where("slug", "==", slug));
        let snap = await getDocs(q);

        // Fallback: buscar en companies
        if (snap.empty) {
            const q2 = query(collection(db, "companies"), where("slug", "==", slug));
            snap = await getDocs(q2);
        }

        // Fallback: buscar por ID directo
        if (snap.empty) {
            let docSnap = await getDoc(doc(db, "brands", slug));
            if (!docSnap.exists()) {
                docSnap = await getDoc(doc(db, "companies", slug));
            }
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
        }

        if (!snap.empty) {
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        }

        return null;
    } catch (e) {
        // Silently return null - brand not found is an expected scenario
        return null;
    }
}
