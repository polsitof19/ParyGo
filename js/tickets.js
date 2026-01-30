// js/tickets.js - GESTIÓN DE TIPOS DE ENTRADA
import { db, APP_CONFIG } from './config.js';
import { state, getActiveEvent } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, generateCode, formatDate } from './utils.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. RENDERIZAR TABLA DE TICKETS
// ==========================================

/**
 * Renderizar tabla de tipos de entrada del evento
 */
export function renderTicketTable(event) {
    const table = document.getElementById("tblTickets");
    if (!table) return;
    
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    
    const tickets = event?.tickets || [];
    
    if (tickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color:var(--muted); padding:50px;">
                    <i class="fa-solid fa-ticket" style="font-size:40px; opacity:0.2; display:block; margin-bottom:15px;"></i>
                    No hay tipos de entrada creados
                    <br><small style="opacity:0.7;">Crea tu primer tipo de entrada para comenzar</small>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = tickets.map((tk, index) => `
        <tr>
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:8px; height:30px; border-radius:4px; background:${tk.color || 'var(--primary)'};"></div>
                    <strong>${Validator.sanitizeHTML(tk.name)}</strong>
                </div>
            </td>
            <td style="font-weight:700; ${tk.price > 0 ? 'color:#10b981;' : 'color:var(--primary);'}">
                ${tk.price > 0 ? 'S/ ' + Number(tk.price).toFixed(2) : 'GRATIS'}
            </td>
            <td>${tk.claim_until ? formatDate(tk.claim_until) : '-'}</td>
            <td>${tk.valid_until ? formatDate(tk.valid_until) : '-'}</td>
            <td>
                <div style="width:28px; height:28px; border-radius:50%; background:${tk.color || 'var(--primary)'}; border:2px solid var(--border);"></div>
            </td>
            <td>
                <div style="display:flex; gap:8px;">
                    <button class="btn-icon" onclick="window.editTicket(${index})" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="window.deleteTicket(${index})" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join("");
}

// ==========================================
// 2. CREAR/EDITAR TICKETS
// ==========================================

/**
 * Abrir modal para crear ticket
 */
export function openTicketModal() {
    openModal('modalTicket');
    
    // Limpiar para modo creación
    const indexInput = document.getElementById("nt_editing_index");
    if (indexInput) indexInput.value = "";
    
    const titleEl = document.querySelector('#modalTicket h2');
    if (titleEl) titleEl.textContent = "Nuevo tipo de acceso";
    if (document.getElementById("nt_type_edit")) document.getElementById("nt_type_edit").value = "UNIQUE"; 
    
    // Limpiar campos
    document.getElementById("nt_name").value = "";
    document.getElementById("nt_price").value = "0";
    document.getElementById("nt_color").value = "#f43f5e";
    
    // Generar SKU único
    const sku = generateCode("TKT").split("-").slice(0, 2).join("-");
    document.getElementById("nt_sku").value = sku;
    
    // Campos avanzados
    if (document.getElementById("nt_stock")) document.getElementById("nt_stock").value = "";
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = "1";
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = "1";
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = "";

    // Ocultar configuración avanzada
    document.getElementById("adv_settings")?.classList.add("hidden");
}

/**
 * Editar ticket existente
 */
export function editTicket(index) {
    const event = getActiveEvent();
    if (!event || !event.tickets || !event.tickets[index]) {
        toast("Ticket no encontrado", "error");
        return;
    }
    
    const tk = event.tickets[index];
    
    openModal('modalTicket');
    
    // Indicar modo edición
    const indexInput = document.getElementById("nt_editing_index");
    if (indexInput) indexInput.value = index;
    
    const titleEl = document.querySelector('#modalTicket h2');
    if (titleEl) titleEl.textContent = "Editar tipo de acceso";
    
    // Llenar campos
    document.getElementById("nt_name").value = tk.name || "";
    document.getElementById("nt_price").value = tk.price || 0;
    document.getElementById("nt_color").value = tk.color || "#f43f5e";
    document.getElementById("nt_sku").value = tk.sku || "";
    if (document.getElementById("nt_type_edit")) document.getElementById("nt_type_edit").value = tk.type || "UNIQUE";
    
    // Campos avanzados
    if (document.getElementById("nt_stock")) document.getElementById("nt_stock").value = tk.stock || "";
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = tk.max_uses || 1;
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = tk.max_scans || 1;
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = tk.claim_until || "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = tk.valid_until || "";
}

/**
 * Guardar ticket (crear o actualizar)
 */
export async function saveNewTicket() {
    if (!state.activeEventId) {
        toast("No hay evento activo", "error");
        return;
    }
    
    const name = document.getElementById("nt_name")?.value.trim();
    if (!Validator.notEmpty(name)) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    
    const indexInput = document.getElementById("nt_editing_index");
    const editingIndex = indexInput?.value;
    const isEditing = editingIndex !== "" && editingIndex !== undefined;

    const price = Math.max(0, Number(document.getElementById("nt_price")?.value) || 0);
    const stock = Number(document.getElementById("nt_stock")?.value) || 999999;
    
    const ticketData = {
        name,
        price,
        isFree: price === 0,
        sku: document.getElementById("nt_sku")?.value.toUpperCase() || generateCode("TKT"),
        color: document.getElementById("nt_color")?.value || "#f43f5e",
        type: document.getElementById("nt_type_edit")?.value || "UNIQUE",
        stock,
        max_uses: Math.max(1, Number(document.getElementById("nt_uses")?.value) || 1),
        max_scans: Math.max(1, Number(document.getElementById("nt_scans")?.value) || 1),
        claim_until: document.getElementById("nt_claim")?.value || "",
        valid_until: document.getElementById("nt_valid_until")?.value || ""
    };

    const btn = document.getElementById("btnSaveTicket");
    const originalText = btn ? btn.textContent : "Guardar cambios";

    try {
        if (btn) {
            btn.textContent = "Guardando...";
            btn.disabled = true;
        }
        
        const ref = doc(db, APP_CONFIG.COLLECTIONS.EVENTS, state.activeEventId);
        const event = state.allEvents.find(x => x.id === state.activeEventId);
        let updatedTickets = [...(event?.tickets || [])];

        if (isEditing) {
            // MODO EDICIÓN
            const idx = parseInt(editingIndex);
            ticketData.id = updatedTickets[idx]?.id || Date.now().toString();
            ticketData.slug = updatedTickets[idx]?.slug || name.toLowerCase().replace(/\s+/g, '-');
            updatedTickets[idx] = ticketData;
            toast("✅ Ticket actualizado");
        } else {
            // MODO CREACIÓN
            ticketData.id = Date.now().toString();
            ticketData.slug = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 3);
            updatedTickets.push(ticketData);
            toast("✅ Ticket creado");
        }

        await updateDoc(ref, { tickets: updatedTickets });
        
        // Actualizar estado local
if (event) {
    event.tickets = updatedTickets;
}

// Actualizar en state.allEvents también
const eventIndex = state.allEvents.findIndex(e => e.id === state.activeEventId);
if (eventIndex !== -1) {
    state.allEvents[eventIndex].tickets = updatedTickets;
}

closeModals();

// Obtener evento actualizado y renderizar
const updatedEvent = state.allEvents.find(e => e.id === state.activeEventId);
renderTicketTable(updatedEvent);
        
        // Actualizar generador de códigos
        if (window.fillCodeGen) window.fillCodeGen(event);
        
    } catch (error) {
        console.error("Error guardando ticket:", error);
        toast("Error al guardar ticket", "error");
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Eliminar ticket
 */
export async function deleteTicket(index) {
    if (!state.activeEventId) return;
    
    const event = state.allEvents.find(e => e.id === state.activeEventId);
    if (!event || !event.tickets || !event.tickets[index]) {
        toast("Ticket no encontrado", "error");
        return;
    }
    
    const ticketName = event.tickets[index].name;
    const confirmed = await customConfirm(`¿Eliminar el tipo de entrada "${ticketName}"?`);
    if (!confirmed) return;
    
    try {
        const updatedTickets = event.tickets.filter((_, i) => i !== index);
        
        await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.EVENTS, state.activeEventId), {
            tickets: updatedTickets
        });
        
        event.tickets = updatedTickets;
        
        toast("✅ Ticket eliminado");
        renderTicketTable(event);
        
        if (window.fillCodeGen) window.fillCodeGen(event);
        
    } catch (error) {
        console.error("Error eliminando ticket:", error);
        toast("Error al eliminar ticket", "error");
    }
}
/**
 * Mostrar/ocultar campo de usos según tipo
 */
export function toggleUsesField() {
    const type = document.getElementById("nt_type_edit")?.value;
    const usesInput = document.getElementById("nt_uses");
    
    if (usesInput) {
        if (type === "UNIQUE") {
            usesInput.value = "1";
            usesInput.closest('.form-group').style.display = "none";
        } else {
            usesInput.value = "100";
            usesInput.closest('.form-group').style.display = "block";
        }
    }
}