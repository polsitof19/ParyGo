const functions = require("firebase-functions");
const fetch = require("node-fetch");

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
