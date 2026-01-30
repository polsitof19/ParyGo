// js/tickets.js - GESTIÓN DE TIPOS DE ENTRADA
import { db, APP_CONFIG } from './config.js';
import { state, getActiveEvent } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, generateCode, formatDate } from './utils.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. RENDERIZAR TABLA DE TICKETS
// ==========================================

export function renderTicketTable(event) {
    const table = document.getElementById("tblTickets");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const tickets = event?.tickets || [];

    if (tickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color:var(--text-muted); padding:50px;">
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
                    <div>
                        <strong>${Validator.sanitizeHTML(tk.name)}</strong>
                        ${tk.description ? `<br><small style="color:var(--text-muted);">${Validator.sanitizeHTML(tk.description)}</small>` : ''}
                    </div>
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

export function togglePriceMode(mode) {
    document.querySelectorAll('#nt_price_mode .price-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const freeSection = document.getElementById('priceFree');
    const fixedSection = document.getElementById('priceFixed');
    const phasesSection = document.getElementById('pricePhases');
    if (freeSection) freeSection.classList.toggle('hidden', mode !== 'FREE');
    if (fixedSection) fixedSection.classList.toggle('hidden', mode !== 'FIXED');
    if (phasesSection) phasesSection.classList.toggle('hidden', mode !== 'PHASES');

    if (mode === 'PHASES') {
        const container = document.getElementById('phasesContainer');
        if (container && container.children.length === 0) {
            addPhaseRow();
        }
    }

    updateTicketPreview();
}

function getSelectedPriceMode() {
    const activeBtn = document.querySelector('#nt_price_mode .price-mode-btn.active');
    return activeBtn?.dataset.mode || 'FREE';
}

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
                <input type="text" class="phase-name" placeholder="Ej: Early Bird" value="${data?.name || ''}" oninput="window.updateTicketPreview()">
            </div>
            <div class="phase-row-inline">
                <div class="form-group">
                    <label>Precio S/.</label>
                    <input type="number" class="phase-price" placeholder="0.00" step="0.01" min="0" value="${data?.price || ''}" oninput="window.updateTicketPreview()">
                </div>
                <div class="form-group">
                    <label>Disponible hasta</label>
                    <input type="datetime-local" class="phase-until" value="${data?.until || ''}">
                </div>
            </div>
        </div>
    `;
    container.appendChild(row);
    updateTicketPreview();
}

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
            updateTicketPreview();
        }, 200);
    }
}

function renumberPhases() {
    const container = document.getElementById('phasesContainer');
    if (!container) return;
    container.querySelectorAll('.phase-card').forEach((card, i) => {
        const num = card.querySelector('.phase-number');
        if (num) num.textContent = `Fase ${i + 1}`;
    });
}

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

export function getActivePhasePrice(phases, doorPrice) {
    if (!phases || phases.length === 0) return doorPrice || 0;

    const now = new Date();
    const sorted = [...phases].sort((a, b) => new Date(a.until) - new Date(b.until));

    for (const phase of sorted) {
        if (phase.until && new Date(phase.until) >= now) {
            return phase.price;
        }
    }
    return doorPrice || sorted[sorted.length - 1].price;
}

// ==========================================
// 3. TEMPLATES RÁPIDOS
// ==========================================

export function applyTemplate(type) {
    document.getElementById('nt_name').value = '';
    const descEl = document.getElementById('nt_description');
    if (descEl) descEl.value = '';

    switch (type) {
        case 'general':
            document.getElementById('nt_name').value = 'General';
            togglePriceMode('FIXED');
            document.getElementById('nt_price').value = '30';
            document.getElementById('nt_color').value = '#3b82f6';
            break;
        case 'vip':
            document.getElementById('nt_name').value = 'VIP';
            togglePriceMode('FIXED');
            document.getElementById('nt_price').value = '60';
            document.getElementById('nt_color').value = '#f59e0b';
            if (descEl) descEl.value = 'Acceso preferencial + beneficios exclusivos';
            break;
        case 'gratis':
            document.getElementById('nt_name').value = 'Free Pass';
            togglePriceMode('FREE');
            document.getElementById('nt_color').value = '#10b981';
            break;
    }

    setDefaultDatesFromEvent();
    updateTicketPreview();
}

// ==========================================
// 4. FECHAS INTELIGENTES
// ==========================================

function setDefaultDatesFromEvent() {
    const event = getActiveEvent();
    if (!event || !event.date) return;

    const eventDate = new Date(event.date + 'T00:00:00');
    if (isNaN(eventDate)) return;

    // Reclamar hasta: día del evento 18:00
    const claimDate = new Date(eventDate);
    claimDate.setHours(18, 0, 0, 0);
    const claimEl = document.getElementById('nt_claim');
    if (claimEl) claimEl.value = toLocalDateTimeString(claimDate);

    // Válido hasta: día siguiente 06:00
    const validDate = new Date(eventDate);
    validDate.setDate(validDate.getDate() + 1);
    validDate.setHours(6, 0, 0, 0);
    const validEl = document.getElementById('nt_valid_until');
    if (validEl) validEl.value = toLocalDateTimeString(validDate);

    // Banner informativo
    const banner = document.getElementById('event_detected_info');
    const nameEl = document.getElementById('detected_event_name');
    if (banner && nameEl) {
        nameEl.textContent = event.name || '';
        banner.classList.remove('hidden');
    }
}

function toLocalDateTimeString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

// ==========================================
// 5. VISTA PREVIA
// ==========================================

export function updateTicketPreview() {
    const preview = document.getElementById('ticket_preview');
    if (!preview) return;

    const name = document.getElementById('nt_name')?.value || 'Nombre entrada';
    const mode = getSelectedPriceMode();
    const color = document.getElementById('nt_color')?.value || '#f43f5e';
    const description = document.getElementById('nt_description')?.value || '';

    let priceHTML = '';

    if (mode === 'FREE') {
        priceHTML = '<span class="preview-price free">GRATIS</span>';
    } else if (mode === 'FIXED') {
        const price = document.getElementById('nt_price')?.value || '0';
        priceHTML = `<span class="preview-price">S/. ${parseFloat(price).toFixed(2)}</span>`;
    } else if (mode === 'PHASES') {
        const phases = readPhasesFromDOM();
        if (phases.length > 0) {
            priceHTML = '<div class="preview-phases">' + phases.map((p, i) => `
                <div class="preview-phase ${i === 0 ? 'active' : 'locked'}">
                    <span>${Validator.sanitizeHTML(p.name || 'Fase ' + (i + 1))}</span>
                    <span>S/. ${parseFloat(p.price || 0).toFixed(2)}</span>
                </div>
            `).join('') + '</div>';
        }
    }

    preview.innerHTML = `
        <div class="preview-ticket" style="border-left: 4px solid ${color}">
            <div class="preview-header">
                <strong>${Validator.sanitizeHTML(name)}</strong>
                ${description ? `<small>${Validator.sanitizeHTML(description)}</small>` : ''}
            </div>
            <div class="preview-content">
                ${priceHTML}
            </div>
        </div>
    `;
}

// ==========================================
// 6. CREAR/EDITAR TICKETS
// ==========================================

export function openTicketModal() {
    openModal('modalTicket');

    const indexInput = document.getElementById("nt_editing_index");
    if (indexInput) indexInput.value = "";

    const titleEl = document.querySelector('#modalTicket h2');
    if (titleEl) titleEl.textContent = "Nuevo tipo de acceso";

    // Mostrar templates, ocultar banner
    const templates = document.getElementById('templates_section');
    if (templates) templates.classList.remove('hidden');
    const banner = document.getElementById('event_detected_info');
    if (banner) banner.classList.add('hidden');

    // Limpiar campos
    document.getElementById("nt_name").value = "";
    document.getElementById("nt_price").value = "0";
    document.getElementById("nt_color").value = "#f43f5e";
    const descEl = document.getElementById("nt_description");
    if (descEl) descEl.value = "";
    const limitEl = document.getElementById("nt_limit");
    if (limitEl) limitEl.value = "";

    // Generar SKU
    const sku = generateCode("TKT").split("-").slice(0, 2).join("-");
    document.getElementById("nt_sku").value = sku;

    // Config
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = "1";
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = "1";
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = "";

    // Precio: por defecto FREE
    togglePriceMode('FREE');
    if (document.getElementById("nt_door_price")) document.getElementById("nt_door_price").value = "";
    if (document.getElementById("nt_door_price_check")) document.getElementById("nt_door_price_check").checked = false;
    if (document.getElementById("door_price_field")) document.getElementById("door_price_field").classList.add("hidden");
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";

    // Fechas inteligentes
    setDefaultDatesFromEvent();

    updateTicketPreview();
}

export function editTicket(index) {
    const event = getActiveEvent();
    if (!event || !event.tickets || !event.tickets[index]) {
        toast("Ticket no encontrado", "error");
        return;
    }

    const tk = event.tickets[index];

    openModal('modalTicket');

    // Modo edición
    const indexInput = document.getElementById("nt_editing_index");
    if (indexInput) indexInput.value = index;

    const titleEl = document.querySelector('#modalTicket h2');
    if (titleEl) titleEl.textContent = "Editar tipo de acceso";

    // Ocultar templates y banner
    const templates = document.getElementById('templates_section');
    if (templates) templates.classList.add('hidden');
    const banner = document.getElementById('event_detected_info');
    if (banner) banner.classList.add('hidden');

    // Campos básicos
    document.getElementById("nt_name").value = tk.name || "";
    document.getElementById("nt_price").value = tk.price || 0;
    document.getElementById("nt_color").value = tk.color || "#f43f5e";
    document.getElementById("nt_sku").value = tk.sku || "";
    const descEl = document.getElementById("nt_description");
    if (descEl) descEl.value = tk.description || "";
    const limitEl = document.getElementById("nt_limit");
    if (limitEl) limitEl.value = tk.limitPerPerson || "";

    // Config
    if (document.getElementById("nt_uses")) document.getElementById("nt_uses").value = tk.max_uses || 1;
    if (document.getElementById("nt_scans")) document.getElementById("nt_scans").value = tk.max_scans || 1;
    if (document.getElementById("nt_claim")) document.getElementById("nt_claim").value = tk.claim_until || "";
    if (document.getElementById("nt_valid_until")) document.getElementById("nt_valid_until").value = tk.valid_until || "";

    // Modalidad de precio
    let mode = tk.priceMode;
    if (!mode) {
        mode = (tk.isFree || tk.price === 0) ? 'FREE' : 'FIXED';
    }
    togglePriceMode(mode);

    // Fases
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";
    if (mode === 'PHASES' && tk.phases) {
        tk.phases.forEach(phase => addPhaseRow(phase));
    }

    // Precio puerta
    const hasDoorPrice = tk.doorPrice != null && tk.doorPrice > 0;
    const doorCheck = document.getElementById("nt_door_price_check");
    const doorField = document.getElementById("door_price_field");
    if (doorCheck) doorCheck.checked = hasDoorPrice;
    if (doorField) doorField.classList.toggle("hidden", !hasDoorPrice);
    if (document.getElementById("nt_door_price")) {
        document.getElementById("nt_door_price").value = tk.doorPrice || "";
    }

    updateTicketPreview();
}

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
        description: document.getElementById("nt_description")?.value.trim() || "",
        sku: document.getElementById("nt_sku")?.value.toUpperCase() || generateCode("TKT"),
        color: document.getElementById("nt_color")?.value || "#f43f5e",
        max_uses: Math.max(1, Number(document.getElementById("nt_uses")?.value) || 1),
        max_scans: Math.max(1, Number(document.getElementById("nt_scans")?.value) || 1),
        claim_until: document.getElementById("nt_claim")?.value || "",
        valid_until: document.getElementById("nt_valid_until")?.value || "",
        limitPerPerson: parseInt(document.getElementById("nt_limit")?.value) || null
    };

    if (priceMode === 'PHASES') {
        ticketData.phases = phases;
        if (doorPrice !== null) ticketData.doorPrice = doorPrice;
    }

    const btn = document.getElementById("btnSaveTicket");
    const originalText = btn ? btn.textContent : "GUARDAR";

    try {
        if (btn) {
            btn.textContent = "Guardando...";
            btn.disabled = true;
        }

        const ref = doc(db, APP_CONFIG.COLLECTIONS.EVENTS, state.activeEventId);
        const event = state.allEvents.find(x => x.id === state.activeEventId);
        let updatedTickets = [...(event?.tickets || [])];

        if (isEditing) {
            const idx = parseInt(editingIndex);
            ticketData.id = updatedTickets[idx]?.id || Date.now().toString();
            ticketData.slug = updatedTickets[idx]?.slug || name.toLowerCase().replace(/\s+/g, '-');
            updatedTickets[idx] = ticketData;
            toast("Ticket actualizado");
        } else {
            ticketData.id = Date.now().toString();
            ticketData.slug = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 3);
            updatedTickets.push(ticketData);
            toast("Ticket creado");
        }

        await updateDoc(ref, { tickets: updatedTickets });

        if (event) {
            event.tickets = updatedTickets;
        }

        const eventIndex = state.allEvents.findIndex(e => e.id === state.activeEventId);
        if (eventIndex !== -1) {
            state.allEvents[eventIndex].tickets = updatedTickets;
        }

        closeModals();

        const updatedEvent = state.allEvents.find(e => e.id === state.activeEventId);
        renderTicketTable(updatedEvent);

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

export function toggleUsesField() {
    // Legacy - mantenido para compatibilidad
}
