const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// Token seguro en variables de entorno de Firebase
// Configurar con: firebase functions:config:set reniec.token="TU_TOKEN"
// O con variable de entorno: RENIEC_TOKEN
const RENIEC_TOKEN = process.env.RENIEC_TOKEN;

/**
 * Cloud Function: Consulta DNI en RENIEC
 * Uso desde frontend: httpsCallable(functions, 'consultaDNI')({ dni: '12345678' })
 */
exports.consultaDNI = functions.https.onCall(async (data, context) => {
    // Verificar autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes iniciar sesión para consultar DNI"
        );
    }

    const { dni } = data;

    // Validar formato DNI
    if (!dni || !/^\d{8}$/.test(dni)) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "DNI debe tener 8 dígitos numéricos"
        );
    }

    try {
        // Intentar con dniruc.apisperu.com (API principal)
        const response = await fetch(
            `https://dniruc.apisperu.com/api/v1/dni/${dni}?token=${RENIEC_TOKEN}`,
            { headers: { "Content-Type": "application/json" } }
        );

        if (!response.ok) {
            throw new functions.https.HttpsError(
                "not-found",
                "DNI no encontrado en RENIEC"
            );
        }

        const result = await response.json();

        if (!result || !result.nombres) {
            throw new functions.https.HttpsError(
                "not-found",
                "DNI no encontrado en RENIEC"
            );
        }

        return {
            success: true,
            nombres: result.nombres || "",
            apellidoPaterno: result.apellidoPaterno || "",
            apellidoMaterno: result.apellidoMaterno || "",
            nombreCompleto: `${result.nombres} ${result.apellidoPaterno || ""} ${result.apellidoMaterno || ""}`.trim()
        };

    } catch (error) {
        // Re-throw si ya es un HttpsError
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        console.error("Error consultando RENIEC:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Error al consultar RENIEC"
        );
    }
});

/**
 * Cloud Function: Consulta DNI sin autenticación (para reclamar.html)
 * Tiene rate limiting implícito de Firebase Functions
 */
exports.consultaDNIPublic = functions.https.onCall(async (data) => {
    const { dni } = data;

    // Validar formato DNI
    if (!dni || !/^\d{8}$/.test(dni)) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "DNI debe tener 8 dígitos numéricos"
        );
    }

    try {
        const response = await fetch(
            `https://dniruc.apisperu.com/api/v1/dni/${dni}?token=${RENIEC_TOKEN}`,
            { headers: { "Content-Type": "application/json" } }
        );

        if (!response.ok) {
            return { success: false };
        }

        const result = await response.json();

        if (!result || !result.nombres) {
            return { success: false };
        }

        return {
            success: true,
            nombres: result.nombres || "",
            apellidoPaterno: result.apellidoPaterno || "",
            apellidoMaterno: result.apellidoMaterno || "",
            nombreCompleto: `${result.nombres} ${result.apellidoPaterno || ""} ${result.apellidoMaterno || ""}`.trim()
        };

    } catch (error) {
        console.error("Error consultando RENIEC:", error);
        return { success: false };
    }
});

/**
 * Cloud Function: Obtener ticket compartido (validación server-side)
 * Valida share_token y devuelve solo datos públicos (sin info personal)
 */
exports.getSharedTicket = functions.https.onCall(async (data) => {
    const { ticketId, token } = data;

    if (!ticketId || !token) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "ticketId y token son requeridos"
        );
    }

    const dbAdmin = admin.firestore();

    // Leer ticket
    const ticketDoc = await dbAdmin.collection("tickets").doc(ticketId).get();
    if (!ticketDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ticket no encontrado");
    }

    const ticket = ticketDoc.data();

    // Validar share_token server-side
    if (ticket.share_token !== token) {
        throw new functions.https.HttpsError("permission-denied", "Token inválido");
    }

    // Leer datos del evento
    let eventData = null;
    if (ticket.event_id) {
        try {
            const eventDoc = await dbAdmin.collection("events").doc(ticket.event_id).get();
            if (eventDoc.exists) eventData = eventDoc.data();
        } catch (e) {
            console.error("Error leyendo evento:", e);
        }
    }

    // Leer datos de la marca por brand_id
    let brandData = null;
    if (ticket.brand_id) {
        try {
            // Intentar como document ID primero
            const brandDoc = await dbAdmin.collection("brands").doc(ticket.brand_id).get();
            if (brandDoc.exists) {
                brandData = brandDoc.data();
            } else {
                // Fallback: buscar por slug
                const brandSnap = await dbAdmin.collection("brands")
                    .where("slug", "==", ticket.brand_id).limit(1).get();
                if (!brandSnap.empty) brandData = brandSnap.docs[0].data();
            }
        } catch (e) {
            console.error("Error leyendo marca:", e);
        }
    }

    // Retornar SOLO datos públicos (sin user_id, user_name, user_doc, user_phone, user_email)
    return {
        success: true,
        event_name: ticket.event_name || eventData?.name || "",
        event_date: ticket.event_date || eventData?.date || "",
        ticket_type: ticket.ticket_type || "General",
        qr_data: ticket.qr_data || ticket.code || ticket.qr_token || "",
        location: eventData?.venue || eventData?.location || ticket.location || "",
        address: eventData?.address || "",
        time: eventData?.time || "",
        brand_name: brandData?.name || "",
        brand_color: brandData?.color || ""
    };
});

/**
 * Cloud Function: Generar share_token para un ticket
 * Requiere autenticación. Solo el dueño del ticket puede generar el token.
 */
exports.generateShareToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión");
    }

    const { ticketId } = data;
    if (!ticketId) {
        throw new functions.https.HttpsError("invalid-argument", "ticketId es requerido");
    }

    const dbAdmin = admin.firestore();
    const ticketDoc = await dbAdmin.collection("tickets").doc(ticketId).get();

    if (!ticketDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ticket no encontrado");
    }

    const ticket = ticketDoc.data();

    // Verificar que el ticket pertenece al usuario autenticado
    if (ticket.user_id !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "No tienes acceso a este ticket");
    }

    // Si ya tiene share_token, retornarlo
    if (ticket.share_token) {
        return { success: true, token: ticket.share_token };
    }

    // Generar nuevo token
    const crypto = require('crypto');
    const token = crypto.randomUUID();

    await dbAdmin.collection("tickets").doc(ticketId).update({
        share_token: token,
        share_token_created_at: new Date().toISOString()
    });

    return { success: true, token };
});
