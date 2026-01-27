// js/dni-api.js - CONSULTA DNI CON APIS PERÚ
import { APIS_PERU_TOKEN } from './config.js';
import { toast } from './utils.js';

/**
 * Consultar DNI en RENIEC vía APIs Perú
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
        const response = await fetch(`https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${APIS_PERU_TOKEN}`,
                'Content-Type': 'application/json',
                'Referer': window.location.origin
            }
        });

        if (!response.ok) {
            console.error("Error en API:", response.status);
            
            const errorMap = {
                404: "DNI no encontrado en RENIEC",
                401: "Token de APIs Perú inválido o expirado",
                429: "Límite de consultas alcanzado. Intenta más tarde"
            };
            
            return {
                success: false,
                error: errorMap[response.status] || `Error ${response.status}: ${response.statusText}`
            };
        }

        const data = await response.json();

        if (data && data.nombres) {
            return {
                success: true,
                data: {
                    dni: data.numeroDocumento || dni,
                    nombres: data.nombres || "",
                    apellidoPaterno: data.apellidoPaterno || "",
                    apellidoMaterno: data.apellidoMaterno || "",
                    nombreCompleto: `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim(),
                    apellidos: `${data.apellidoPaterno} ${data.apellidoMaterno}`.trim()
                }
            };
        } else {
            return {
                success: false,
                error: "Respuesta inválida de la API"
            };
        }

    } catch (error) {
        console.error("❌ Error consultando DNI:", error);
        
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            return {
                success: false,
                error: "Error de conexión. Verifica tu internet"
            };
        }
        
        return {
            success: false,
            error: error.message || "Error al consultar DNI"
        };
    }
}

/**
 * Consultar RUC en SUNAT vía APIs Perú
 * @param {string} ruc - RUC de 11 dígitos
 */
export async function consultarRUC(ruc) {
    if (!/^\d{11}$/.test(ruc)) {
        return { success: false, error: "RUC debe tener 11 dígitos" };
    }

    try {
        const response = await fetch(`https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${APIS_PERU_TOKEN}`,
                'Content-Type': 'application/json',
                'Referer': window.location.origin
            }
        });

        if (!response.ok) {
            return { success: false, error: response.status === 404 ? "RUC no encontrado" : `Error ${response.status}` };
        }

        const data = await response.json();

        if (data && data.razonSocial) {
            return {
                success: true,
                data: {
                    ruc: data.numeroDocumento || ruc,
                    razonSocial: data.razonSocial || "",
                    estado: data.estado || "",
                    condicion: data.condicion || "",
                    direccion: data.direccion || "",
                    departamento: data.departamento || "",
                    provincia: data.provincia || "",
                    distrito: data.distrito || ""
                }
            };
        }

        return { success: false, error: "Respuesta inválida" };

    } catch (error) {
        console.error("❌ Error consultando RUC:", error);
        return { success: false, error: error.message || "Error al consultar RUC" };
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

    toast("🔍 Consultando RENIEC...", "info");

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

        toast("✅ Datos encontrados en RENIEC");
        return result;

    } else {
        toast(result.error, "error");
        return result;
    }
}
