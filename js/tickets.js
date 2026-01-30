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
                ${tk.priceMode === 'PHASES'
                    ? `<span style="color:#a78bfa;">Preventa</span> <small style="opacity:0.6;">S/ ${Number(tk.price).toFixed(2)}</small>`
                    : tk.price > 0 ? 'S/ ' + Number(tk.price).toFixed(2) : 'GRATIS'}
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
// 2. MODALIDAD DE PRECIOS
// ==========================================

/**
 * Cambiar modalidad de precio visible en el modal
 */
export function togglePriceMode(mode) {
    // Actualizar botones
    document.querySelectorAll('#nt_price_mode .price-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Mostrar/ocultar secciones
    const freeSection = document.getElementById('priceFree');
    const fixedSection = document.getElementById('priceFixed');
    const phasesSection = document.getElementById('pricePhases');
    if (freeSection) freeSection.classList.toggle('hidden', mode !== 'FREE');
    if (fixedSection) fixedSection.classList.toggle('hidden', mode !== 'FIXED');
    if (phasesSection) phasesSection.classList.toggle('hidden', mode !== 'PHASES');

    // Si PHASES y no hay filas, agregar una por defecto
    if (mode === 'PHASES') {
        const container = document.getElementById('phasesContainer');
        if (container && container.children.length === 0) {
            addPhaseRow();
        }
    }
}

/**
 * Obtener modo de precio seleccionado actualmente
 */
function getSelectedPriceMode() {
    const activeBtn = document.querySelector('#nt_price_mode .price-mode-btn.active');
    return activeBtn?.dataset.mode || 'FREE';
}

/**
 * Agregar fila de fase de preventa
 */
export function addPhaseRow(data) {
    const container = document.getElementById('phasesContainer');
    if (!container) return;

    const phaseNum = container.children.length + 1;

    const row = document.createElement('div');
    row.className = 'phase-card';
    row.innerHTML = `
        <div class="phase-header">
            <span class="phase-number">Fase ${phaseNum}</span>
            <button type="button" class="phase-remove" onclick="window.removePhaseRow(this)" title="Eliminar">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="phase-fields">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" class="phase-name" placeholder="Ej: Early Bird" value="${data?.name || ''}">
            </div>
            <div class="phase-row-inline">
                <div class="form-group">
                    <label>Precio S/.</label>
                    <input type="number" class="phase-price" placeholder="0.00" step="0.01" min="0" value="${data?.price || ''}">
                </div>
                <div class="form-group">
                    <label>Disponible hasta</label>
                    <input type="datetime-local" class="phase-until" value="${data?.until || ''}">
                </div>
            </div>
        </div>
    `;
    container.appendChild(row);
}

/**
 * Eliminar fila de fase (mínimo 1 fila) y renumerar
 */
export function removePhaseRow(btn) {
    const container = document.getElementById('phasesContainer');
    if (container && container.children.length <= 1) {
        toast("Debe haber al menos una fase", "error");
        return;
    }
    const row = btn.closest('.phase-card');
    if (row) {
        row.classList.add('phase-removing');
        setTimeout(() => {
            row.remove();
            renumberPhases();
        }, 200);
    }
}

/**
 * Renumerar fases después de eliminar
 */
function renumberPhases() {
    const container = document.getElementById('phasesContainer');
    if (!container) return;
    container.querySelectorAll('.phase-card').forEach((card, i) => {
        const num = card.querySelector('.phase-number');
        if (num) num.textContent = `Fase ${i + 1}`;
    });
}

/**
 * Mostrar/ocultar campo precio en puerta
 */
export function toggleDoorPrice() {
    const checkbox = document.getElementById('nt_door_price_check');
    const field = document.getElementById('door_price_field');
    if (field) {
        if (checkbox?.checked) {
            field.classList.remove('hidden');
            field.classList.add('slide-in');
        } else {
            field.classList.add('hidden');
            field.classList.remove('slide-in');
            const input = document.getElementById('nt_door_price');
            if (input) input.value = '';
        }
    }
}

/**
 * Leer fases del DOM
 */
function readPhasesFromDOM() {
    const cards = document.querySelectorAll('#phasesContainer .phase-card');
    const phases = [];
    cards.forEach(card => {
        const name = card.querySelector('.phase-name')?.value.trim();
        const price = Number(card.querySelector('.phase-price')?.value) || 0;
        const until = card.querySelector('.phase-until')?.value || '';
        if (name && price >= 0) {
            phases.push({ name, price, until });
        }
    });
    return phases;
}

/**
 * Calcular precio activo según fases y fecha actual
 */
export function getActivePhasePrice(phases, doorPrice) {
    if (!phases || phases.length === 0) return doorPrice || 0;

    const now = new Date();
    // Ordenar fases por fecha
    const sorted = [...phases].sort((a, b) => new Date(a.until) - new Date(b.until));

    for (const phase of sorted) {
        if (phase.until && new Date(phase.until) >= now) {
            return phase.price;
        }
    }
    // Si todas las fases pasaron, usar precio puerta
    return doorPrice || sorted[sorted.length - 1].price;
}

// ==========================================
// 3. CREAR/EDITAR TICKETS
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
    // Limpiar campos
    document.getElementById("nt_name").value = "";
    document.getElementById("nt_price").value = "0";
    document.getElementById("nt_color").value = "#f43f5e";

    // Generar SKU único
    const sku = generateCode("TKT").split("-").slice(0, 2).join("-");
    document.getElementById("nt_sku").value = sku;

    // Campos de configuración
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = "1";
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = "1";
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = "";

    // Modalidad de precio: por defecto FREE
    togglePriceMode('FREE');
    if (document.getElementById("nt_door_price")) document.getElementById("nt_door_price").value = "";
    if (document.getElementById("nt_door_price_check")) document.getElementById("nt_door_price_check").checked = false;
    if (document.getElementById("door_price_field")) document.getElementById("door_price_field").classList.add("hidden");
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";
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

    // Llenar campos básicos
    document.getElementById("nt_name").value = tk.name || "";
    document.getElementById("nt_price").value = tk.price || 0;
    document.getElementById("nt_color").value = tk.color || "#f43f5e";
    document.getElementById("nt_sku").value = tk.sku || "";

    // Campos de configuración
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = tk.max_uses || 1;
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = tk.max_scans || 1;
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = tk.claim_until || "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = tk.valid_until || "";

    // Detectar modalidad de precio (compatibilidad hacia atrás)
    let mode = tk.priceMode;
    if (!mode) {
        mode = (tk.isFree || tk.price === 0) ? 'FREE' : 'FIXED';
    }
    togglePriceMode(mode);

    // Restaurar fases si es PHASES
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";
    if (mode === 'PHASES' && tk.phases) {
        tk.phases.forEach(phase => addPhaseRow(phase));
    }
    // Restaurar precio puerta
    const hasDoorPrice = tk.doorPrice != null && tk.doorPrice > 0;
    const doorCheck = document.getElementById("nt_door_price_check");
    const doorField = document.getElementById("door_price_field");
    if (doorCheck) doorCheck.checked = hasDoorPrice;
    if (doorField) doorField.classList.toggle("hidden", !hasDoorPrice);
    if (document.getElementById("nt_door_price")) {
        document.getElementById("nt_door_price").value = tk.doorPrice || "";
    }
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

    const priceMode = getSelectedPriceMode();

    // Calcular precio según modalidad
    let price = 0;
    let isFree = false;
    let phases = null;
    let doorPrice = null;

    if (priceMode === 'FREE') {
        price = 0;
        isFree = true;
    } else if (priceMode === 'FIXED') {
        price = Math.max(0, Number(document.getElementById("nt_price")?.value) || 0);
        isFree = price === 0;
    } else if (priceMode === 'PHASES') {
        phases = readPhasesFromDOM();
        if (phases.length === 0) {
            toast("Agrega al menos una fase de preventa", "error");
            return;
        }
        const doorCheck = document.getElementById("nt_door_price_check");
        doorPrice = doorCheck?.checked ? (Number(document.getElementById("nt_door_price")?.value) || null) : null;
        price = getActivePhasePrice(phases, doorPrice);
        isFree = false;
    }

    const ticketData = {
        name,
        price,
        isFree,
        priceMode,
        sku: document.getElementById("nt_sku")?.value.toUpperCase() || generateCode("TKT"),
        color: document.getElementById("nt_color")?.value || "#f43f5e",
        max_uses: Math.max(1, Number(document.getElementById("nt_uses")?.value) || 1),
        max_scans: Math.max(1, Number(document.getElementById("nt_scans")?.value) || 1),
        claim_until: document.getElementById("nt_claim")?.value || "",
        valid_until: document.getElementById("nt_valid_until")?.value || ""
    };

    // Agregar datos de fases si es PHASES
    if (priceMode === 'PHASES') {
        ticketData.phases = phases;
        if (doorPrice !== null) ticketData.doorPrice = doorPrice;
    }

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
            toast("Ticket actualizado");
        } else {
            // MODO CREACIÓN
            ticketData.id = Date.now().toString();
            ticketData.slug = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 3);
            updatedTickets.push(ticketData);
            toast("Ticket creado");
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
        
        toast("Ticket eliminado");
        renderTicketTable(event);
        
        if (window.fillCodeGen) window.fillCodeGen(event);
        
    } catch (error) {
        console.error("Error eliminando ticket:", error);
        toast("Error al eliminar ticket", "error");
    }
}
/**
 * Mostrar/ocultar campo de usos según tipo (legacy, mantenido para compatibilidad)
 */
export function toggleUsesField() {
    // Campo nt_type_edit eliminado del modal - función mantenida para evitar errores
}