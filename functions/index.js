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

// ==========================================
// MEJORA 2: Validar código (sin exponer PII)
// ==========================================

/**
 * Cloud Function: Validar un código de entrada
 * No requiere auth (reclamar.html es público)
 * Retorna solo datos públicos del evento, sin PII de otros clientes
 */
exports.validateCode = functions.https.onCall(async (data) => {
    const { code } = data;

    if (!code || typeof code !== 'string' || code.length < 3 || code.length > 30) {
        throw new functions.https.HttpsError("invalid-argument", "Código inválido");
    }

    const sanitizedCode = code.trim().toUpperCase();
    const dbAdmin = admin.firestore();

    // Buscar en tickets por code o qr_token
    let codeDoc = null;
    let source = null;

    const collections = [
        { name: "tickets", field: "code", src: "tickets" },
        { name: "tickets", field: "qr_token", src: "tickets" },
        { name: "promotorCodes", field: "code", src: "promotorCodes" },
        { name: "codes", field: "code", src: "codes" }
    ];

    for (const col of collections) {
        const snap = await dbAdmin.collection(col.name)
            .where(col.field, "==", sanitizedCode).limit(1).get();
        if (!snap.empty) {
            codeDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
            source = col.src;
            break;
        }
    }

    if (!codeDoc) {
        throw new functions.https.HttpsError("not-found", "Código no encontrado");
    }

    // Validar estado
    if (source === 'promotorCodes' && (codeDoc.status === 'PENDING' || codeDoc.status === 'REJECTED')) {
        const msg = codeDoc.status === 'PENDING' ? "Código pendiente de aprobación" : "Código rechazado por el administrador";
        throw new functions.https.HttpsError("failed-precondition", msg);
    }

    const blockedStatuses = ['CLAIMED', 'SCANNED', 'USED', 'CANCELLED'];
    const codeType = codeDoc.type || "UNIQUE";
    if (codeType === "UNIQUE" && (blockedStatuses.includes(codeDoc.status) || codeDoc.current_uses > 0)) {
        throw new functions.https.HttpsError("already-exists", "Código ya utilizado");
    }

    if (codeType === "SHARED") {
        const maxUses = codeDoc.max_uses || 1;
        const currentUses = codeDoc.current_uses || 0;
        if (currentUses >= maxUses) {
            throw new functions.https.HttpsError("resource-exhausted", "Código alcanzó su límite de usos");
        }
    }

    // Verificar expiración
    if (codeDoc.expires_at) {
        const expiry = new Date(codeDoc.expires_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (expiry < today) {
            throw new functions.https.HttpsError("deadline-exceeded", "Código expirado");
        }
    }

    // Obtener datos del evento (solo públicos)
    let eventName = codeDoc.event_name || "";
    let eventDate = "";
    let eventTime = "";
    let eventVenue = "";
    let eventStatus = "ACTIVE";

    if (codeDoc.event_id) {
        try {
            const eventDoc = await dbAdmin.collection("events").doc(codeDoc.event_id).get();
            if (eventDoc.exists) {
                const event = eventDoc.data();
                eventName = event.name || eventName;
                eventDate = event.date || "";
                eventTime = event.time || "";
                eventVenue = event.venue || event.location || "";
                eventStatus = event.status || "ACTIVE";

                if (eventStatus === 'FINISHED' || eventStatus === 'CANCELLED') {
                    throw new functions.https.HttpsError("failed-precondition", "El evento ya finalizó");
                }
            }
        } catch (e) {
            if (e instanceof functions.https.HttpsError) throw e;
        }
    }

    // Retornar SOLO datos públicos (sin PII)
    return {
        success: true,
        codeId: codeDoc.id,
        source: source,
        codeType: codeType,
        maxUses: codeDoc.max_uses || 1,
        currentUses: codeDoc.current_uses || 0,
        ticketName: codeDoc.ticket_name || "General",
        ticketColor: codeDoc.ticket_color || "",
        brandId: codeDoc.brand_id || "",
        eventId: codeDoc.event_id || "",
        eventName: eventName,
        eventDate: eventDate,
        eventTime: eventTime,
        eventVenue: eventVenue
    };
});

/**
 * Cloud Function: Reclamar un código
 * No requiere auth. Recibe datos del cliente y actualiza el código atómicamente.
 */
exports.claimCode = functions.https.onCall(async (data) => {
    const { codeId, source, clientName, clientLastname, clientDni, clientEmail, clientPhone, idType } = data;

    if (!codeId || !source || !clientName || !clientLastname || !clientDni) {
        throw new functions.https.HttpsError("invalid-argument", "Datos incompletos");
    }

    // Sanitizar inputs
    const sanitize = (s) => (s || '').toString().trim().replace(/[<>]/g, '');
    const name = sanitize(clientName);
    const lastname = sanitize(clientLastname);
    const dni = sanitize(clientDni);
    const email = sanitize(clientEmail || '').toLowerCase();
    const phone = (clientPhone || '').trim().replace(/\D/g, '');
    const fullName = `${name} ${lastname}`;

    const dbAdmin = admin.firestore();
    const now = new Date().toISOString();

    // Generar QR token
    const crypto = require('crypto');
    const qrToken = `TKT${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;

    const collectionName = source === 'promotorCodes' ? 'promotorCodes' :
                           source === 'codes' ? 'codes' : 'tickets';
    const codeRef = dbAdmin.collection(collectionName).doc(codeId);

    // Usar transacción para atomicidad
    await dbAdmin.runTransaction(async (transaction) => {
        const freshDoc = await transaction.get(codeRef);
        if (!freshDoc.exists) throw new functions.https.HttpsError("not-found", "Código no encontrado");

        const freshData = freshDoc.data();
        const codeType = freshData.type || "UNIQUE";

        if (source === 'promotorCodes' || source === 'codes') {
            const blocked = ['CLAIMED', 'SCANNED', 'USED', 'REJECTED', 'CANCELLED'];
            if (blocked.includes(freshData.status)) {
                throw new functions.https.HttpsError("already-exists", "Código ya fue utilizado");
            }
            transaction.update(codeRef, {
                status: 'CLAIMED',
                claimed_at: now,
                qr_token: qrToken,
                claimed_by: { name: fullName, dni, email, phone },
                claimed_name: fullName
            });
        } else {
            // tickets collection
            if (codeType === "UNIQUE") {
                if (freshData.status === 'CLAIMED' || freshData.current_uses > 0) {
                    throw new functions.https.HttpsError("already-exists", "Código ya fue utilizado");
                }
                transaction.update(codeRef, {
                    status: 'CLAIMED',
                    current_uses: 1,
                    claimed_at: now,
                    client_name: fullName, client_dni: dni,
                    client_email: email, client_phone: phone,
                    id_type: idType || 'DNI', qr_token: qrToken,
                    claimed_by: { name: fullName, dni, email, phone }
                });
            } else {
                // SHARED: incremento atómico
                const currentUses = freshData.current_uses || 0;
                const maxUses = freshData.max_uses || 1;
                if (currentUses >= maxUses) {
                    throw new functions.https.HttpsError("resource-exhausted", "Límite de usos alcanzado");
                }
                const newUses = currentUses + 1;
                transaction.update(codeRef, {
                    current_uses: newUses,
                    status: newUses >= maxUses ? 'EXHAUSTED' : 'ACTIVE',
                    last_claimed_at: now,
                    client_name: fullName, client_dni: dni,
                    client_email: email, client_phone: phone,
                    id_type: idType || 'DNI', qr_token: qrToken
                });
            }
        }
    });

    // Registrar acceso
    await dbAdmin.collection("accesses").add({
        brand_id: data.brandId || "",
        event_id: data.eventId || "",
        event_name: data.eventName || "",
        code_id: codeId, code: data.code || "",
        ticket_name: data.ticketName || "General",
        promoter_id: data.promoterId || "",
        promoter_name: data.promoterName || "",
        client_name: fullName, client_dni: dni,
        client_email: email, client_phone: phone,
        id_type: idType || 'DNI', qr_token: qrToken,
        status: 'CLAIMED', is_free: true,
        created_at: now
    });

    return { success: true, qrToken: qrToken };
});

// ==========================================
// MEJORA 3: Buscar cliente por DNI (sin exponer PII masivo)
// ==========================================

/**
 * Cloud Function: Buscar cliente por documento
 * Retorna solo nombre (para autocompletado), sin exponer toda la colección
 */
exports.searchClientByDoc = functions.https.onCall(async (data) => {
    const { docNumber, brandId } = data;

    if (!docNumber || typeof docNumber !== 'string' || docNumber.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "Documento inválido");
    }

    const dbAdmin = admin.firestore();

    // Buscar perfil en esta marca
    let result = { found: false, hasAccount: false };

    if (brandId) {
        const qProfile = await dbAdmin.collection("clientes")
            .where("brand_id", "==", brandId)
            .where("doc_number", "==", docNumber)
            .limit(1).get();

        if (!qProfile.empty) {
            const profile = qProfile.docs[0].data();
            result = {
                found: true,
                hasAccount: true,
                name: profile.name || "",
                lastname: profile.lastname || "",
                sameBrand: true
            };
            return result;
        }
    }

    // Buscar en cualquier marca (para vincular cuenta)
    const qGlobal = await dbAdmin.collection("clientes")
        .where("doc_number", "==", docNumber)
        .limit(1).get();

    if (!qGlobal.empty) {
        const profile = qGlobal.docs[0].data();
        result = {
            found: true,
            hasAccount: true,
            name: profile.name || "",
            lastname: profile.lastname || "",
            sameBrand: false
        };
    }

    return result;
});
