// js/dni-api.js - CONSULTA DNI VÍA CLOUD FUNCTION (seguro)
import { functions } from './config.js';
import { toast, logger } from './utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

/**
 * Consultar DNI en RENIEC vía Cloud Function
 * @param {string} dni - DNI de 8 dígitos
 * @returns {Object} { success: boolean, data?: {...}, error?: string }
 */
export async function consultarDNI(dni) {
    // Validar formato
    if (!/^\d{8}$/.test(dni)) {
        return {
            success: false,
            error: "DNI debe tener 8 dígitos"
        };
    }

    try {
        const fn = httpsCallable(functions, 'consultaDNI');
        const result = await fn({ dni });
        const data = result.data;

        if (data && data.success && data.nombres) {
            return {
                success: true,
                data: {
                    dni: dni,
                    nombres: data.nombres || "",
                    apellidoPaterno: data.apellidoPaterno || "",
                    apellidoMaterno: data.apellidoMaterno || "",
                    nombreCompleto: data.nombreCompleto || "",
                    apellidos: `${data.apellidoPaterno || ""} ${data.apellidoMaterno || ""}`.trim()
                }
            };
        } else {
            return {
                success: false,
                error: "DNI no encontrado en RENIEC"
            };
        }

    } catch (error) {
        logger.error("Error consultando DNI:", error);

        // Extraer mensaje del HttpsError
        const msg = error?.message || "Error al consultar DNI";
        return {
            success: false,
            error: msg
        };
    }
}

/**
 * Autocompletar formulario con datos de DNI
 * @param {string} dni - DNI a consultar
 * @param {Object} fields - Mapeo de campos
 */
export async function autocompletarDNI(dni, fields = {}) {
    const defaultFields = {
        nombres: 'pm_name',
        apellidos: 'pm_lastname',
        dni: 'pm_dni',
        ...fields
    };

    toast("Consultando RENIEC...", "info");

    const result = await consultarDNI(dni);

    if (result.success) {
        const data = result.data;

        if (defaultFields.nombres) {
            const input = document.getElementById(defaultFields.nombres);
            if (input) input.value = data.nombres;
        }

        if (defaultFields.apellidos) {
            const input = document.getElementById(defaultFields.apellidos);
            if (input) input.value = data.apellidos;
        }

        if (defaultFields.dni) {
            const input = document.getElementById(defaultFields.dni);
            if (input) input.value = data.dni;
        }

        toast("Datos encontrados en RENIEC");
        return result;

    } else {
        toast(result.error, "error");
        return result;
    }
}
