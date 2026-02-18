// js/events.js - MÓDULO COMPLETO DE EVENTOS
import { db } from './config.js';
import { state, resetTemps } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, switchView } from './utils.js';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. CARGAR Y RENDERIZAR EVENTOS
// ==========================================

// Referencia al unsubscribe del listener de eventos
let eventsUnsubscribe = null;

/**
 * Procesar snapshot de eventos y actualizar estado + UI
 */
function processEventsSnapshot(snapshot) {
    let fetchedEvents = snapshot.docs.map(d => ({id: d.id, ...d.data()}))
                                     .sort((a, b) => new Date(b.date) - new Date(a.date));

    const user = state.currentUser;
    if (!user) return;

    // Sincronizar isSuperAdmin
    state.isSuperAdmin = user.is_super_admin === true ||
                         user.role === 'super_admin' ||
                         user.collection === 'empresa';

    // FILTRADO POR PERMISOS
    if (state.isSuperAdmin) {
        state.allEvents = fetchedEvents;
    } else {
        state.allEvents = fetchedEvents.filter(event => {
            // Filtrar por company_id (sistema nuevo)
            if (event.company_id === user.companyId) return true;

            // Fallback: brand_id (sistema antiguo)
            const myPermissions = user.allowed_brands || [];
            if (myPermissions.includes(event.brand_id)) return true;

            return false;
        });
    }

    renderEvents();
}

/**
 * CARGAR EVENTOS con listener en tiempo real
 * Si ya existe un listener activo, no crea otro.
 */
export function loadEvents() {
    // Si ya hay un listener activo, solo re-renderizar
    if (eventsUnsubscribe) {
        renderEvents();
        return;
    }

    try {
        const q = query(collection(db, "events"));
        eventsUnsubscribe = onSnapshot(q,
            (snapshot) => processEventsSnapshot(snapshot),
            (error) => {
                console.error("Error en listener de eventos:", error);
                toast("Error cargando eventos", "error");
            }
        );
        state.activeListeners.push(eventsUnsubscribe);
    } catch (error) {
        console.error("Error configurando listener de eventos:", error);
        toast("Error cargando eventos", "error");
    }
}

/**
 * Desuscribir listener de eventos (para limpieza)
 */
export function cleanupEventsListener() {
    if (eventsUnsubscribe) {
        const oldUnsub = eventsUnsubscribe;
        eventsUnsubscribe = null;
        oldUnsub();
        state.activeListeners = state.activeListeners.filter(fn => fn !== oldUnsub);
    }
}

/**
 * RENDERIZAR EVENTOS en la grilla
 */
export function renderEvents() {
    const filtered = state.currentFilter === 'ALL' 
        ? state.allEvents 
        : state.allEvents.filter(e => e.brand_id === state.currentFilter);
    
    const grid = document.getElementById("eventsGrid");
    if (!grid) return;

    // Actualizar títulos
    const titleEl = document.getElementById("viewTitle");
    const subEl = document.getElementById("viewSub");
    
    if (state.currentFilter === 'ALL') {
        if(titleEl) titleEl.textContent = "Todos tus eventos";
        if(subEl) subEl.textContent = "Panel de control principal";
    } else {
        const brand = state.allBrands.find(b => b.id === state.currentFilter);
        if(brand && titleEl) {
            titleEl.textContent = brand.name;
            if(subEl) subEl.textContent = `Eventos de ${brand.name}`;
        }
    }

    // Sin eventos
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--muted);">
                <i class="fa-solid fa-calendar-xmark" style="font-size:48px; margin-bottom:20px; opacity:0.3;"></i>
                <p>No hay eventos ${state.currentFilter !== 'ALL' ? 'en esta marca' : 'disponibles'}</p>
            </div>
        `;
        return;
    }

    // Renderizar eventos
    grid.innerHTML = filtered.map(e => {
        const brand = state.allBrands.find(b => b.id === e.brand_id);
        const brandName = brand ? Validator.sanitizeHTML(brand.name) : 'Global';
        
        return `
    <div class="card ${e.status === 'PAUSED' ? 'is-paused' : e.status === 'FINISHED' ? 'is-finished' : ''}" data-event-id="${e.id}">
        ${getEventStatusBadge(e.status)}
        <img class="card-img" 
             src="${e.image || ''}" 
             onerror="this.style.background='#222'; this.style.display='block';"
             alt="${Validator.sanitizeHTML(e.name)}">
        <div class="card-badge">${brandName}</div>
        <div class="card-body">
            <h3>${Validator.sanitizeHTML(e.name)}</h3>
            <p>${e.date || 'Fecha TBA'} • ${Validator.sanitizeHTML(e.venue || 'Lugar TBA')}</p>
        </div>
    </div>
`;
    }).join("");
    
    // Event listeners
    grid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', function() {
            const eventId = this.getAttribute('data-event-id');
            if (eventId) openEventDetail(eventId);
        });
    });
}

/**
 * FILTRAR eventos por marca
 */
export function filterEvents(brandId) {
    state.currentFilter = brandId;
    state.activeBrandId = brandId;
    renderEvents();
    switchView('view_events');
    
    // Actualizar sidebar
    document.querySelectorAll('.brand-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-brand-id="${brandId}"]`)?.classList.add('active');
    document.getElementById('nav_events')?.classList.remove('active');
    
    // Mostrar botones de marca en el header
    if (window.updateBrandHeaderActions) {
        window.updateBrandHeaderActions(brandId);
    }
}

/**
 * MOSTRAR todos los eventos (sin filtro)
 */
export function showGlobalEvents() {
    state.currentFilter = 'ALL';
    state.activeBrandId = null;
    renderEvents();
    switchView('view_events');
    
    // Actualizar sidebar
    document.querySelectorAll('.brand-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav_events')?.classList.add('active');
    
    // Ocultar botones de marca en el header
    if (window.updateBrandHeaderActions) {
        window.updateBrandHeaderActions(null);
    }
}

/**
 * VOLVER a la lista de eventos
 */
export function backToEvents() {
    state.activeEventId = null;
    switchView('view_events');
    renderEvents(); // Listener ya mantiene los datos actualizados
}

// ==========================================
// 2. DETALLE DEL EVENTO
// ==========================================

/**
 * ABRIR DETALLE del evento
 */
export function openEventDetail(eid) {
    state.activeEventId = eid;
    switchView('view_event_detail');
    
    const event = state.allEvents.find(x => x.id === eid);
    if (!event) return;

    // Actualizar UI
    const imgEl = document.getElementById("dEvImg");
    if (imgEl) imgEl.src = event.image || '';
    
    const bgEl = document.getElementById("heroBg");
    if (bgEl) bgEl.style.backgroundImage = `url(${event.image || ''})`;
    
    const nameEl = document.getElementById("dEvName");
    if (nameEl) nameEl.textContent = event.name;
    
    const dateEl = document.getElementById("dEvDate");
    if (dateEl) dateEl.textContent = event.date || 'Fecha TBA';
    
    const venueEl = document.getElementById("dEvVenue");
    if (venueEl) venueEl.textContent = event.venue || 'Lugar TBA';
    
    const brandEl = document.getElementById("dEvBrand");
    if (brandEl) {
        const brand = state.allBrands.find(b => b.id === event.brand_id);
        brandEl.textContent = brand ? brand.name : 'GLOBAL';
    }
    
    // Activar primera pestaña
    const firstTab = document.querySelector('.sub-tab[data-tab="tab_metrics"]');
    if (firstTab) {
        document.querySelectorAll('.sub-content').forEach(e => e.classList.add('hidden'));
        document.getElementById('tab_metrics')?.classList.remove('hidden');
        document.querySelectorAll('.sub-tab').forEach(e => e.classList.remove('active'));
        firstTab.classList.add('active');
    }
    // Cargar tabla de tickets
if (window.renderTicketTable) {
    window.renderTicketTable(event);
}
// Cargar selector de códigos
if (window.fillCodeGen) {
    window.fillCodeGen(event);
}
  // Al final de openEventDetail, antes del cierre
if (window.loadEventMetrics) window.loadEventMetrics(event.id);
if (window.loadAccesses) window.loadAccesses(event.id);

// Cargar datos del evento (importados de otros módulos)
    // Estos se llamarán desde logic.js al importar metrics.js, tickets.js, etc.
}

// ==========================================
// 3. CREAR/EDITAR EVENTOS
// ==========================================

/**
 * ABRIR MODAL para crear evento
 */
export function openEventModal() {
    openModal('modalEvent');
    
    // Limpiar formulario
    document.getElementById("ev_id").value = "";
    
    // Llenar marcas
    const brandSelect = document.getElementById("ev_brand_sel");
    if (brandSelect) {
        brandSelect.innerHTML = state.allBrands.map(b => 
            `<option value="${b.id}">${Validator.sanitizeHTML(b.name)}</option>`
        ).join("");
    }
    
    // Limpiar campos
    document.getElementById("ev_name").value = "";
    document.getElementById("ev_status").value = "ACTIVE";
    if(document.getElementById("ev_desc")) document.getElementById("ev_desc").value = "";
    document.getElementById("ev_date").value = "";
    setTimeToSelects("");
    document.getElementById("ev_venue").value = "";
    
    // Resetear imagen
    const prevCont = document.getElementById('ev_prev_container');
    if (prevCont) prevCont.style.display = 'none';
    const zone = document.getElementById('uploadZone');
    if (zone) zone.style.display = 'flex';
    
    state.tempImgBase64 = null;
}

/**
 * EDITAR evento actual
 */
export function editCurrentEvent() {
    const event = state.allEvents.find(x => x.id === state.activeEventId);
    if (!event) return toast("Evento no encontrado", "error");
    
    // Verificar permisos
    if (!canEditEvent(event)) {
        return toast("No tienes permiso para editar este evento", "error");
    }
    
    openModal('modalEvent');
    
    // Cargar marcas
    const brandSelect = document.getElementById("ev_brand_sel");
    if (brandSelect) {
        brandSelect.innerHTML = state.allBrands.map(b => 
            `<option value="${b.id}" ${b.id === event.brand_id ? 'selected' : ''}>${b.name}</option>`
        ).join("");
    }

    // Cargar datos básicos
    document.getElementById("ev_id").value = event.id;
    document.getElementById("ev_name").value = event.name || "";
    document.getElementById("ev_status").value = event.status || "ACTIVE";
    document.getElementById("ev_date").value = event.date || "";
    setTimeToSelects(event.time || "");
    document.getElementById("ev_venue").value = event.venue || "";
    
    // Cargar imagen
    if(event.image) {
        state.tempImgBase64 = event.image;
        const prev = document.getElementById("ev_prev");
        if(prev) prev.src = event.image;
        const prevCont = document.getElementById("ev_prev_container");
        if(prevCont) prevCont.style.display = 'block';
        const zone = document.getElementById("uploadZone");
        if(zone) zone.style.display = 'none';
    }

    // CARGAR PAGOS (si existen los campos)
    const pc = event.payment_config || {};
    const hasPaymentChk = document.getElementById("ev_has_payment");
    if(hasPaymentChk) {
        hasPaymentChk.checked = pc.active === true;
        document.getElementById("ev_pay_name").value = pc.name || "";
        document.getElementById("ev_pay_phone").value = pc.phone || "";
        if(window.togglePaymentFields) window.togglePaymentFields();
    }

    // CARGAR INCENTIVOS (si existen los campos)
    const inc = event.incentives || {};
    if(document.getElementById("ev_comm_free")) {
        document.getElementById("ev_comm_free").value = inc.comm_free || "";
        document.getElementById("ev_comm_sale").value = inc.comm_sale || "";
    }
    
    // CARGAR LEGAL (si existen los campos)
    const leg = event.legal || {};
    if(document.getElementById("ev_terms")) {
        document.getElementById("ev_terms").value = leg.terms || "";
        document.getElementById("ev_wsp_msg").value = leg.wsp_template || "";
    }
}

/**
 * MANEJAR selección de archivo de imagen
 */
export async function handleFileSelect(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    if (!file.type.match(/image.*/)) return toast("Solo se permiten imágenes", "error");
    if (file.size > 5 * 1024 * 1024) return toast("Imagen muy grande (máx 5MB)", "error");
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxWidth = 800;
            const scale = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            state.tempImgBase64 = canvas.toDataURL('image/jpeg', 0.7);
            
            const prev = document.getElementById("ev_prev");
            if (prev) prev.src = state.tempImgBase64;
            
            const prevCont = document.getElementById('ev_prev_container');
            if (prevCont) prevCont.style.display = 'block';
            
            const zone = document.getElementById('uploadZone');
            if (zone) zone.style.display = 'none';
        };
    };
    reader.readAsDataURL(file);
}

/**
 * GUARDAR evento (crear o actualizar)
 */
export async function saveEvent() {
    const id = document.getElementById("ev_id").value;
    const brandId = document.getElementById("ev_brand_sel")?.value;
    const name = document.getElementById("ev_name").value.trim();
    
    // Validaciones básicas
    if (!name) return toast("El nombre es obligatorio", "error");
    if (!state.currentUser.companyId && !state.isSuperAdmin) {
        return toast("Error: No tienes una empresa asignada", "error");
    }

    // 1. DATOS DE PAGO (opcionales)
    let paymentConfig = { active: false };
    const hasPaymentChk = document.getElementById("ev_has_payment");
    if(hasPaymentChk) {
        const hasPayment = hasPaymentChk.checked;
        const payName = document.getElementById("ev_pay_name")?.value.trim() || "";
        const payPhone = document.getElementById("ev_pay_phone")?.value.trim() || "";
        
        if (hasPayment && (!payName || !payPhone)) {
            return toast("Completa los datos de Yape/Plin", "error");
        }
        
        paymentConfig = {
            active: hasPayment,
            name: payName,
            phone: payPhone
        };
    }

    // 2. INCENTIVOS (opcionales)
    let incentives = { comm_free: 0, comm_sale: 0 };
    if(document.getElementById("ev_comm_free")) {
        incentives = {
            comm_free: parseFloat(document.getElementById("ev_comm_free").value) || 0,
            comm_sale: parseFloat(document.getElementById("ev_comm_sale").value) || 0
        };
    }

    // 4. LEGAL (opcional)
    let legal = { terms: "", wsp_template: "" };
    if(document.getElementById("ev_terms")) {
        legal = {
            terms: document.getElementById("ev_terms").value,
            wsp_template: document.getElementById("ev_wsp_msg")?.value || ""
        };
    }

    // Construir objeto del evento
    const eventData = {
        name: name,
        date: document.getElementById("ev_date").value,
        time: getTimeFromSelects(),
        venue: document.getElementById("ev_venue").value || "",
        company_id: state.currentUser.companyId || "",
        brand_id: brandId || state.activeBrandId || state.currentUser.companyId || "",
        image: state.tempImgBase64 || "",
        payment_config: paymentConfig,
        incentives: incentives,
        legal: legal,
        status: document.getElementById("ev_status")?.value || "ACTIVE",
        updated_at: new Date().toISOString()
    };
    
    try {
        if (id) {
            // BUG-6 FIX: Optimistic locking con runTransaction
            const eventRef = doc(db, "events", id);
            await runTransaction(db, async (transaction) => {
                const currentDoc = await transaction.get(eventRef);
                if (!currentDoc.exists()) throw new Error("El evento ya no existe");

                const currentData = currentDoc.data();
                const loadedEvent = state.allEvents.find(x => x.id === id);
                const loadedUpdatedAt = loadedEvent?.updated_at;

                // Si otro usuario modificó el evento después de que lo cargamos, abortar
                // Para eventos legacy sin updated_at: si nosotros tenemos timestamp pero
                // el server no, permitir (primera vez que se guarda con lock)
                if (loadedUpdatedAt && currentData.updated_at &&
                    currentData.updated_at !== loadedUpdatedAt) {
                    throw new Error("CONCURRENT_EDIT");
                }

                // Generar updated_at dentro de la transacción (timestamp fresco)
                transaction.update(eventRef, {
                    ...eventData,
                    updated_at: new Date().toISOString()
                });
            });
            toast("✅ Evento actualizado");
        } else {
            // Crear nuevo
            eventData.tickets = [];
            eventData.created_at = new Date().toISOString();
            await addDoc(collection(db, "events"), eventData);
            toast("✅ Evento creado");
        }

        closeModals();
        resetTemps();
        // onSnapshot se encarga de re-renderizar automáticamente

    } catch (error) {
        if (error.message === "CONCURRENT_EDIT") {
            toast("Otro usuario modificó este evento. Recarga e intenta de nuevo.", "error");
        } else {
            console.error("Error guardando evento:", error);
            toast("Error al guardar evento", "error");
        }
    }
}

/**
 * ELIMINAR evento
 */
export async function deleteEvent() {
    if (!state.activeEventId) return toast("No hay evento activo", "error");

    const event = state.allEvents.find(e => e.id === state.activeEventId);
    if (!event) return toast("Evento no encontrado", "error");

    // Verificar permisos
    if (!canEditEvent(event)) {
        return toast("No tienes permiso para eliminar este evento", "error");
    }

    // BUG-5 FIX: Confirmación detallada y eliminación en cascada
    const eventId = state.activeEventId;
    const confirmed = await customConfirm(
        `¿Eliminar el evento "${event.name}"?\n\nEsto eliminará el evento y todos sus datos (entradas, códigos, cuotas, compras). Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
        // Eliminar datos relacionados en batches
        const collectionsToClean = [
            { name: "tickets", field: "event_id" },
            { name: "promotorCodes", field: "event_id" },
            { name: "codes", field: "event_id" },
            { name: "quotas", field: "event_id" },
            { name: "purchases", field: "event_id" },
            { name: "sales", field: "event_id" },
            { name: "accesos", field: "event_id" },
            { name: "accesses", field: "event_id" }
        ];

        for (const col of collectionsToClean) {
            const q = query(collection(db, col.name), where(col.field, "==", eventId));
            const snap = await getDocs(q);

            // Firestore batch limit es 500
            const batchSize = 450;
            for (let i = 0; i < snap.docs.length; i += batchSize) {
                const batch = writeBatch(db);
                const chunk = snap.docs.slice(i, i + batchSize);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        }

        // Eliminar el evento
        await deleteDoc(doc(db, "events", eventId));

        toast("Evento y datos asociados eliminados");
        state.activeEventId = null;
        switchView('view_events');
    } catch (error) {
        console.error("Error eliminando evento:", error);
        toast("Error al eliminar evento", "error");
    }
}

// ==========================================
// 4. UTILIDADES
// ==========================================

/**
 * VERIFICAR si puede editar el evento
 */
function canEditEvent(event) {
    if (state.isSuperAdmin) return true;
    
    if (state.currentUser.companyId && event.company_id === state.currentUser.companyId) {
        return true;
    }
    
    if (state.currentUser.allowed_brands && state.currentUser.allowed_brands.includes(event.brand_id)) {
        return true;
    }
    
    return false;
}
// ========== ESTADO DE EVENTOS ==========
function getEventStatusBadge(status) {
    switch(status) {
        case 'ACTIVE':
            return '<div class="event-status status-active">Activo</div>';
        case 'PAUSED':
            return '<div class="event-status status-paused">Pausado</div>';
        case 'FINISHED':
            return '<div class="event-status status-finished">Finalizado</div>';
        case 'DRAFT':
            return '<div class="event-status status-draft">Borrador</div>';
        default:
            return '<div class="event-status status-active">Activo</div>';
    }
}
// ==========================================
// FUNCIONES PARA MANEJAR HORA
// ==========================================

/**
 * Obtener hora desde los selectores
 */
function getTimeFromSelects() {
    const hour = document.getElementById("ev_hour")?.value || "";
    const minute = document.getElementById("ev_minute")?.value || "00";
    const ampm = document.getElementById("ev_ampm")?.value || "PM";
    
    if (!hour) return "";
    
    return `${hour}:${minute} ${ampm}`;
}

/**
 * Establecer hora en los selectores
 */
function setTimeToSelects(timeStr) {
    const hourEl = document.getElementById("ev_hour");
    const minuteEl = document.getElementById("ev_minute");
    const ampmEl = document.getElementById("ev_ampm");
    
    if (!timeStr) {
        if (hourEl) hourEl.value = "";
        if (minuteEl) minuteEl.value = "00";
        if (ampmEl) ampmEl.value = "PM";
        return;
    }
    
    // Parsear formato "10:30 PM" o "22:30"
    try {
        let hour, minute, ampm;
        
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
            // Formato 12h: "10:30 PM"
            const parts = timeStr.replace(/\s+/g, ' ').trim().split(' ');
            const timePart = parts[0].split(':');
            hour = timePart[0];
            minute = timePart[1] || '00';
            ampm = parts[1] || 'PM';
        } else {
            // Formato 24h: "22:30"
            const parts = timeStr.split(':');
            let h = parseInt(parts[0]);
            minute = parts[1] || '00';
            
            if (h >= 12) {
                ampm = 'PM';
                if (h > 12) h -= 12;
            } else {
                ampm = 'AM';
                if (h === 0) h = 12;
            }
            hour = h.toString().padStart(2, '0');
        }
        
        if (hourEl) hourEl.value = hour;
        if (minuteEl) minuteEl.value = minute;
        if (ampmEl) ampmEl.value = ampm;
        
    } catch (e) {
        console.error('Error parseando hora:', e);
    }
}