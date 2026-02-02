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
            <td>${(tk.claim_until || tk.buy_until) ? formatDate(tk.claim_until || tk.buy_until) : (tk.priceMode === 'PHASES' ? '<span style="color:var(--text-muted);">Por fases</span>' : '-')}</td>
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
}

function getSelectedPriceMode() {
    const activeBtn = document.querySelector('#nt_price_mode .price-mode-btn.active');
    return activeBtn?.dataset.mode || 'FREE';
}

// ==========================================
// 3. SELECTOR FECHA/HORA CON DROPDOWNS
// ==========================================

function getDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

function buildOptions(start, end, selected, pad) {
    let html = '';
    for (let i = start; i <= end; i++) {
        const val = pad ? String(i).padStart(2, '0') : String(i);
        html += `<option value="${i}" ${i === selected ? 'selected' : ''}>${val}</option>`;
    }
    return html;
}

function buildMinuteOptions(selected) {
    let html = '';
    for (let i = 0; i <= 55; i += 5) {
        const val = String(i).padStart(2, '0');
        html += `<option value="${i}" ${i === selected ? 'selected' : ''}>${val}</option>`;
    }
    return html;
}

export function onDateChange(sel) {
    const container = sel.closest('.date-time-selector');
    if (!container) return;
    const monthEl = container.querySelector('.sel-month');
    const yearEl = container.querySelector('.sel-year');
    const dayEl = container.querySelector('.sel-day');
    if (!monthEl || !yearEl || !dayEl) return;

    const month = parseInt(monthEl.value) || 1;
    const year = parseInt(yearEl.value) || new Date().getFullYear();
    const maxDay = getDaysInMonth(month, year);
    const currentDay = parseInt(dayEl.value) || 1;

    // Reconstruir opciones de día
    dayEl.innerHTML = buildOptions(1, maxDay, Math.min(currentDay, maxDay), true);
}

function createDateTimeSelector(isoValue) {
    let day, month, year, hour, min, ampm;

    if (isoValue) {
        const d = new Date(isoValue);
        if (!isNaN(d)) {
            day = d.getDate();
            month = d.getMonth() + 1;
            year = d.getFullYear();
            let h = d.getHours();
            min = d.getMinutes();
            ampm = h >= 12 ? 'PM' : 'AM';
            hour = h % 12 || 12;
        }
    }

    if (!day) {
        const now = new Date();
        day = now.getDate();
        month = now.getMonth() + 1;
        year = now.getFullYear();
        hour = 11;
        min = 0;
        ampm = 'PM';
    }

    min = Math.round(min / 5) * 5;
    if (min === 60) { min = 0; hour++; }
    if (hour > 12) hour = 12;

    const currentYear = new Date().getFullYear();
    const maxDay = getDaysInMonth(month, year);

    return `
        <div class="date-time-selector">
            <div class="dt-date-group">
                <div class="dt-label">Fecha</div>
                <div class="dt-selects">
                    <select class="dt-select sel-day" onchange="window.onDateChange(this)">
                        ${buildOptions(1, maxDay, day, true)}
                    </select>
                    <span class="dt-sep">/</span>
                    <select class="dt-select sel-month" onchange="window.onDateChange(this)">
                        ${buildOptions(1, 12, month, true)}
                    </select>
                    <span class="dt-sep">/</span>
                    <select class="dt-select sel-year" onchange="window.onDateChange(this)">
                        ${buildOptions(currentYear, currentYear + 5, year, false)}
                    </select>
                </div>
            </div>
            <div class="dt-time-group">
                <div class="dt-label">Hora</div>
                <div class="dt-selects">
                    <select class="dt-select sel-hour">
                        ${buildOptions(1, 12, hour, true)}
                    </select>
                    <span class="dt-sep">:</span>
                    <select class="dt-select sel-min">
                        ${buildMinuteOptions(min)}
                    </select>
                    <select class="dt-select sel-ampm">
                        <option value="AM" ${ampm === 'AM' ? 'selected' : ''}>AM</option>
                        <option value="PM" ${ampm === 'PM' ? 'selected' : ''}>PM</option>
                    </select>
                </div>
            </div>
        </div>
    `;
}

function readDateTimeFromSelector(container) {
    const dayEl = container.querySelector('.sel-day');
    const monthEl = container.querySelector('.sel-month');
    const yearEl = container.querySelector('.sel-year');
    const hourEl = container.querySelector('.sel-hour');
    const minEl = container.querySelector('.sel-min');
    const ampmEl = container.querySelector('.sel-ampm');

    if (!dayEl || !monthEl || !yearEl || !hourEl || !minEl) return '';

    const day = parseInt(dayEl.value) || 1;
    const month = parseInt(monthEl.value) || 1;
    const year = parseInt(yearEl.value) || new Date().getFullYear();
    let hour = parseInt(hourEl.value) || 12;
    const min = parseInt(minEl.value) || 0;
    const ampm = ampmEl?.value || 'PM';

    // Convertir 12h a 24h
    if (ampm === 'AM' && hour === 12) hour = 0;
    else if (ampm === 'PM' && hour !== 12) hour += 12;

    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    const mi = String(min).padStart(2, '0');
    return `${year}-${m}-${d}T${h}:${mi}`;
}

// ==========================================
// 4. FASES DE PREVENTA
// ==========================================

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
            <div class="phase-row-inline">
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" class="phase-name" placeholder="Ej: Early Bird" value="${data?.name || ''}">
                </div>
                <div class="form-group">
                    <label>Precio S/.</label>
                    <input type="number" class="phase-price" placeholder="0.00" step="0.01" min="0" value="${data?.price || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Disponible hasta</label>
                ${createDateTimeSelector(data?.until || '')}
            </div>
        </div>
    `;
    container.appendChild(row);
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
        const selectorEl = card.querySelector('.date-time-selector');
        const until = selectorEl ? readDateTimeFromSelector(selectorEl) : '';
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
// 5. FECHAS INTELIGENTES
// ==========================================

function getDefaultDatesFromEvent() {
    const event = getActiveEvent();
    if (!event || !event.date) return { claim: '', buy: '', scan: '' };

    const eventDate = new Date(event.date + 'T00:00:00');
    if (isNaN(eventDate)) return { claim: '', buy: '', scan: '' };

    // Reclamar/Comprar hasta: día del evento 18:00
    const claimDate = new Date(eventDate);
    claimDate.setHours(18, 0, 0, 0);

    // Escanear hasta: día siguiente 06:00
    const scanDate = new Date(eventDate);
    scanDate.setDate(scanDate.getDate() + 1);
    scanDate.setHours(6, 0, 0, 0);

    return {
        claim: toLocalDateTimeString(claimDate),
        buy: toLocalDateTimeString(claimDate),
        scan: toLocalDateTimeString(scanDate)
    };
}

function initDateTimeSelectors(claimValue, buyValue, scanValue) {
    const freeClaimEl = document.getElementById('free_claim_until_selector');
    const fixedBuyEl = document.getElementById('fixed_buy_until_selector');
    const scanEl = document.getElementById('scan_until_selector');

    if (freeClaimEl) freeClaimEl.innerHTML = createDateTimeSelector(claimValue);
    if (fixedBuyEl) fixedBuyEl.innerHTML = createDateTimeSelector(buyValue);
    if (scanEl) scanEl.innerHTML = createDateTimeSelector(scanValue);
}

function showEventDetectedBanner() {
    const event = getActiveEvent();
    if (!event) return;
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
// 6. PROMOTORES - UI TOGGLES
// ==========================================

export function togglePromotorSection() {
    const checked = document.getElementById('nt_promotor_enabled')?.checked;
    const section = document.getElementById('promotorConfigSection');
    if (section) section.classList.toggle('hidden', !checked);
}

export function toggleCommissionType(type) {
    document.querySelectorAll('#nt_commission_type .commission-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    const label = document.getElementById('nt_commission_label');
    if (label) label.textContent = type === 'percentage' ? 'Porcentaje por venta (%)' : 'Monto por venta (S/.)';
}

export function toggleFreeCommissionSection() {
    const checked = document.getElementById('nt_free_enabled')?.checked;
    const section = document.getElementById('freeCommissionSection');
    if (section) section.classList.toggle('hidden', !checked);
}

export function toggleFreeField(field) {
    const checked = document.getElementById(`nt_free_${field}_check`)?.checked;
    const el = document.getElementById(`free_${field}_field`);
    if (el) el.classList.toggle('hidden', !checked);
}

function getSelectedCommissionType() {
    const activeBtn = document.querySelector('#nt_commission_type .commission-type-btn.active');
    return activeBtn?.dataset.type || 'fixed';
}

function resetPromotorFields() {
    const pe = document.getElementById('nt_promotor_enabled');
    if (pe) pe.checked = false;
    const section = document.getElementById('promotorConfigSection');
    if (section) section.classList.add('hidden');

    // Comisión por venta
    toggleCommissionType('fixed');
    const cv = document.getElementById('nt_commission_value');
    if (cv) cv.value = '0';

    // Entradas gratis
    const fe = document.getElementById('nt_free_enabled');
    if (fe) fe.checked = false;
    const fcs = document.getElementById('freeCommissionSection');
    if (fcs) fcs.classList.add('hidden');

    ['cash', 'drinks', 'other'].forEach(f => {
        const chk = document.getElementById(`nt_free_${f}_check`);
        if (chk) chk.checked = false;
        const fld = document.getElementById(`free_${f}_field`);
        if (fld) fld.classList.add('hidden');
        const input = document.getElementById(`nt_free_${f}`);
        if (input) input.value = '';
    });
}

function loadPromotorFields(tk) {
    const pe = document.getElementById('nt_promotor_enabled');
    if (pe) pe.checked = !!tk.promotorEnabled;
    togglePromotorSection();

    if (tk.promotorCommission) {
        toggleCommissionType(tk.promotorCommission.type || 'fixed');
        const cv = document.getElementById('nt_commission_value');
        if (cv) cv.value = tk.promotorCommission.value || 0;
    }

    const fe = document.getElementById('nt_free_enabled');
    if (fe) fe.checked = !!tk.freeEnabled;
    toggleFreeCommissionSection();

    if (tk.freeCommission) {
        const fc = tk.freeCommission;
        if (fc.cash != null && fc.cash > 0) {
            const chk = document.getElementById('nt_free_cash_check');
            if (chk) chk.checked = true;
            toggleFreeField('cash');
            const inp = document.getElementById('nt_free_cash');
            if (inp) inp.value = fc.cash;
        }
        if (fc.drinks != null && fc.drinks > 0) {
            const chk = document.getElementById('nt_free_drinks_check');
            if (chk) chk.checked = true;
            toggleFreeField('drinks');
            const inp = document.getElementById('nt_free_drinks');
            if (inp) inp.value = fc.drinks;
        }
        if (fc.other) {
            const chk = document.getElementById('nt_free_other_check');
            if (chk) chk.checked = true;
            toggleFreeField('other');
            const inp = document.getElementById('nt_free_other');
            if (inp) inp.value = fc.other;
        }
    }
}

function readPromotorFields() {
    const enabled = document.getElementById('nt_promotor_enabled')?.checked || false;
    if (!enabled) return { promotorEnabled: false };

    const commType = getSelectedCommissionType();
    const commValue = Math.max(0, Number(document.getElementById('nt_commission_value')?.value) || 0);

    const freeEnabled = document.getElementById('nt_free_enabled')?.checked || false;

    const result = {
        promotorEnabled: true,
        promotorCommission: { type: commType, value: commValue }
    };

    if (freeEnabled) {
        result.freeEnabled = true;
        const freeCommission = {};
        if (document.getElementById('nt_free_cash_check')?.checked) {
            freeCommission.cash = Math.max(0, Number(document.getElementById('nt_free_cash')?.value) || 0);
        }
        if (document.getElementById('nt_free_drinks_check')?.checked) {
            freeCommission.drinks = Math.max(0, Number(document.getElementById('nt_free_drinks')?.value) || 0);
        }
        if (document.getElementById('nt_free_other_check')?.checked) {
            freeCommission.other = document.getElementById('nt_free_other')?.value.trim() || null;
        }
        result.freeCommission = freeCommission;
    } else {
        result.freeEnabled = false;
    }

    return result;
}

// ==========================================
// 7. CREAR/EDITAR TICKETS
// ==========================================

export function openTicketModal() {
    openModal('modalTicket');

    const indexInput = document.getElementById("nt_editing_index");
    if (indexInput) indexInput.value = "";

    const titleEl = document.querySelector('#modalTicket h2');
    if (titleEl) titleEl.textContent = "Nuevo tipo de acceso";

    // Ocultar banner
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

    // Precio: por defecto FREE
    togglePriceMode('FREE');
    if (document.getElementById("nt_door_price")) document.getElementById("nt_door_price").value = "";
    if (document.getElementById("nt_door_price_check")) document.getElementById("nt_door_price_check").checked = false;
    if (document.getElementById("door_price_field")) document.getElementById("door_price_field").classList.add("hidden");
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";

    // Promotores: limpiar campos
    resetPromotorFields();

    // Fechas inteligentes con selectores personalizados
    const defaults = getDefaultDatesFromEvent();
    initDateTimeSelectors(defaults.claim, defaults.buy, defaults.scan);
    if (defaults.claim) showEventDetectedBanner();
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

    // Ocultar banner
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

    // Modalidad de precio
    let mode = tk.priceMode;
    if (!mode) {
        mode = (tk.isFree || tk.price === 0) ? 'FREE' : 'FIXED';
    }
    togglePriceMode(mode);

    // Selectores de fecha/hora según modalidad
    initDateTimeSelectors(
        tk.claim_until || '',
        tk.buy_until || tk.claim_until || '',
        tk.valid_until || ''
    );

    // Fases
    const phasesContainer = document.getElementById("phasesContainer");
    if (phasesContainer) phasesContainer.innerHTML = "";
    if (mode === 'PHASES' && tk.phases) {
        tk.phases.forEach(phase => addPhaseRow(phase));
    }

    // Promotores
    resetPromotorFields();
    loadPromotorFields(tk);

    // Precio puerta
    const hasDoorPrice = tk.doorPrice != null && tk.doorPrice > 0;
    const doorCheck = document.getElementById("nt_door_price_check");
    const doorField = document.getElementById("door_price_field");
    if (doorCheck) doorCheck.checked = hasDoorPrice;
    if (doorField) doorField.classList.toggle("hidden", !hasDoorPrice);
    if (document.getElementById("nt_door_price")) {
        document.getElementById("nt_door_price").value = tk.doorPrice || "";
    }
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

    // Leer escanear hasta (compartido para todas las modalidades)
    const scanSelectorEl = document.querySelector('#scan_until_selector .date-time-selector');
    const validUntil = scanSelectorEl ? readDateTimeFromSelector(scanSelectorEl) : '';

    // Leer fecha específica según modalidad
    let claimUntil = '';
    let buyUntil = '';
    if (priceMode === 'FREE') {
        const freeClaimEl = document.querySelector('#free_claim_until_selector .date-time-selector');
        claimUntil = freeClaimEl ? readDateTimeFromSelector(freeClaimEl) : '';
    } else if (priceMode === 'FIXED') {
        const fixedBuyEl = document.querySelector('#fixed_buy_until_selector .date-time-selector');
        buyUntil = fixedBuyEl ? readDateTimeFromSelector(fixedBuyEl) : '';
    }

    // Leer campos de promotores
    const promotorData = readPromotorFields();

    const ticketData = {
        name,
        price,
        isFree,
        priceMode,
        description: document.getElementById("nt_description")?.value.trim() || "",
        sku: document.getElementById("nt_sku")?.value.toUpperCase() || generateCode("TKT"),
        color: document.getElementById("nt_color")?.value || "#f43f5e",
        max_uses: Math.max(1, Number(document.getElementById("nt_uses")?.value) || 1),
        valid_until: validUntil,
        limitPerPerson: parseInt(document.getElementById("nt_limit")?.value) || null,
        promotorEnabled: promotorData.promotorEnabled || false,
        promotorCommission: promotorData.promotorCommission || null,
        freeEnabled: promotorData.freeEnabled || false,
        freeCommission: promotorData.freeCommission || null
    };

    if (priceMode === 'FREE') {
        ticketData.claim_until = claimUntil;
    } else if (priceMode === 'FIXED') {
        ticketData.buy_until = buyUntil;
    }

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
