// js/events.js - MÓDULO COMPLETO DE EVENTOS
import { db, storage, APP_CONFIG } from './config.js';
import { state, resetTemps } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, switchView, uploadToStorage, logger } from './utils.js';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot, writeBatch, runTransaction, limit, orderBy, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. CARGAR Y RENDERIZAR EVENTOS
// ==========================================

// Referencia al unsubscribe del listener de eventos
let eventsUnsubscribe = null;
// Paginación: último documento del snapshot actual
let lastEventDoc = null;
let hasMoreEvents = true;
let isLoadingMore = false;
// Cache for mini stats (mobile)
const miniStatsCache = new Map();

/**
 * Procesar snapshot de eventos y actualizar estado + UI
 */
function processEventsSnapshot(snapshot, append = false) {
    const newEvents = snapshot.docs.map(d => ({id: d.id, ...d.data()}));

    // Guardar último documento para paginación
    if (snapshot.docs.length > 0) {
        lastEventDoc = snapshot.docs[snapshot.docs.length - 1];
    }
    hasMoreEvents = snapshot.docs.length >= (APP_CONFIG.LIMITS.ITEMS_PER_PAGE || 50);

    let fetchedEvents;
    if (append) {
        // Merge: agregar nuevos sin duplicados
        const existingIds = new Set(state.allEvents.map(e => e.id));
        const unique = newEvents.filter(e => !existingIds.has(e.id));
        fetchedEvents = [...state.allEvents, ...unique]
                          .sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
        fetchedEvents = newEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

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

    // Mostrar skeleton mientras se cargan los datos
    showSkeletonLoading();

    try {
        const q = query(collection(db, "events"), orderBy("date", "desc"), limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE));
        eventsUnsubscribe = onSnapshot(q,
            (snapshot) => processEventsSnapshot(snapshot),
            (error) => {
                logger.error("Error en listener de eventos:", error);
                toast("Error cargando eventos", "error");
            }
        );
        state.activeListeners.push(eventsUnsubscribe);
    } catch (error) {
        logger.error("Error configurando listener de eventos:", error);
        toast("Error cargando eventos", "error");
    }
}

/**
 * CARGAR MÁS EVENTOS (paginación)
 */
export async function loadMoreEvents() {
    if (!hasMoreEvents || isLoadingMore || !lastEventDoc) return;
    isLoadingMore = true;

    try {
        const q = query(
            collection(db, "events"),
            orderBy("date", "desc"),
            startAfter(lastEventDoc),
            limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
        );
        const snapshot = await getDocs(q);
        processEventsSnapshot(snapshot, true);
    } catch (error) {
        logger.error("Error cargando más eventos:", error);
        toast("Error cargando más eventos", "error");
    } finally {
        isLoadingMore = false;
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
 * Mostrar skeleton cards mientras cargan los eventos
 */
export function showSkeletonLoading() {
    const grid = document.getElementById("eventsGrid");
    if (!grid) return;
    const count = window.innerWidth < 768 ? 3 : 6;
    grid.innerHTML = Array.from({length: count}, () => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-body">
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line tiny"></div>
            </div>
        </div>
    `).join('');
}

/**
 * Ocultar skeleton (se reemplaza al renderizar eventos reales)
 */
export function hideSkeletonLoading() {
    const grid = document.getElementById("eventsGrid");
    if (!grid) return;
    const skeletons = grid.querySelectorAll('.skeleton-card');
    skeletons.forEach(s => s.remove());
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

    // Sin eventos - empty state
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="empty-icon"><i class="fa-solid fa-calendar-plus"></i></div>
                <div class="empty-title">No tienes eventos</div>
                <div class="empty-text">${state.currentFilter !== 'ALL' ? 'No hay eventos en esta marca' : 'Crea tu primer evento y empieza a vender entradas'}</div>
                <button class="btn btn-primary" onclick="openNewEventModal()"><i class="fa-solid fa-plus"></i> Crear Evento</button>
            </div>
        `;
        return;
    }

    // Detectar mobile (match CSS @media max-width: 768px)
    const isMobile = window.innerWidth <= 768;

    // Renderizar eventos
    if (isMobile) {
        grid.classList.add('mobile-cards-grid');
        grid.innerHTML = filtered.map(e => {
            const statusPill = getMobileStatusPill(e.status);
            const cached = miniStatsCache.get(e.id);
            const ticketCount = cached?.ticketCount || 0;
            const pendingCount = cached?.pendingCount || 0;

            return `
        <div class="event-card-mobile" data-event-id="${e.id}">
            <div class="card-img-wrapper">
                <img class="card-img"
                     src="${e.image || ''}"
                     onerror="this.style.background='#222'; this.style.display='block';"
                     alt="${Validator.sanitizeHTML(e.name)}">
                ${statusPill}
            </div>
            <div class="card-body">
                <h3>${Validator.sanitizeHTML(e.name)}</h3>
                <div class="mini-stats">
                    <span class="mini-stat"><i class="fa-solid fa-ticket"></i> <span class="num">${ticketCount}</span> entradas</span>
                    <span class="mini-stat"><i class="fa-solid fa-clock"></i> <span class="num">${pendingCount}</span> pendientes</span>
                </div>
                <div class="card-meta">
                    <i class="fa-regular fa-calendar"></i> ${e.date || 'Fecha TBA'} &bull; ${Validator.sanitizeHTML(e.venue || 'Lugar TBA')}
                </div>
            </div>
        </div>
    `;
        }).join("");
    } else {
        grid.classList.remove('mobile-cards-grid');
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
    }

    // Event listeners (both mobile and desktop cards)
    const cardSelector = isMobile ? '.event-card-mobile' : '.card';
    grid.querySelectorAll(cardSelector).forEach(card => {
        card.addEventListener('click', function() {
            const eventId = this.getAttribute('data-event-id');
            if (eventId) openEventDetail(eventId);
        });
    });

    // Fetch mini stats for mobile cards (async, non-blocking)
    if (isMobile && filtered.length > 0) {
        fetchMiniStats(filtered);
    }

    // Botón "Cargar más" si hay más eventos
    const existingBtn = document.getElementById('loadMoreEventsBtn');
    if (existingBtn) existingBtn.remove();

    if (hasMoreEvents) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'loadMoreEventsBtn';
        loadMoreBtn.style.cssText = 'grid-column:1/-1; text-align:center; padding:20px;';
        loadMoreBtn.innerHTML = `<button style="padding:12px 32px; border-radius:8px; border:1px solid var(--border); background:var(--bg-secondary,#1a1a1a); color:var(--text); cursor:pointer; font-family:inherit; font-weight:600;" id="btnLoadMore">Cargar más eventos</button>`;
        grid.appendChild(loadMoreBtn);
        document.getElementById('btnLoadMore').addEventListener('click', async () => {
            const btn = document.getElementById('btnLoadMore');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
            btn.disabled = true;
            await loadMoreEvents();
        });
    }
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

    // Sync mobile brand chips
    syncMobileBrandChips(brandId);

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

    // Sync mobile brand chips
    syncMobileBrandChips('ALL');

    // Ocultar botones de marca en el header
    if (window.updateBrandHeaderActions) {
        window.updateBrandHeaderActions(null);
    }
}

/**
 * Sincronizar chips de marca mobile con filtro actual
 */
function syncMobileBrandChips(filter) {
    const container = document.getElementById('mobileBrandSelector');
    if (!container) return;
    container.querySelectorAll('.brand-chip').forEach(c => c.classList.remove('active'));
    container.querySelector(`[data-brand-filter="${filter}"]`)?.classList.add('active');
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

    // Actualizar UI desktop
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

    // Actualizar UI mobile hero
    const mobileBg = document.getElementById("heroBgMobile");
    if (mobileBg) mobileBg.style.backgroundImage = `url(${event.image || ''})`;
    const mobilePoster = document.getElementById("mobilePoster");
    if (mobilePoster) mobilePoster.src = event.image || '';
    const mobileEvName = document.getElementById("mobileEvName");
    if (mobileEvName) mobileEvName.textContent = event.name;
    const mobileEvDate = document.getElementById("mobileEvDate");
    if (mobileEvDate) mobileEvDate.textContent = event.date || 'Fecha TBA';
    const mobileEvVenue = document.getElementById("mobileEvVenue");
    if (mobileEvVenue) mobileEvVenue.textContent = event.venue || 'Lugar TBA';

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
    if(document.getElementById("ev_desc")) document.getElementById("ev_desc").value = event.description || "";
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
    if (file.size > APP_CONFIG.LIMITS.MAX_IMAGE_SIZE) return toast("Imagen muy grande (máx 5MB)", "error");
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxWidth = APP_CONFIG.LIMITS.IMAGE_MAX_WIDTH;
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

    // 5. DESCRIPCIÓN (opcional)
    const description = document.getElementById("ev_desc")?.value || "";

    // Construir objeto del evento
    const eventData = {
        name: name,
        description: description,
        date: document.getElementById("ev_date").value,
        time: getTimeFromSelects(),
        venue: document.getElementById("ev_venue").value || "",
        company_id: state.currentUser.companyId || "",
        brand_id: brandId || state.activeBrandId || state.currentUser.companyId || state.currentUser.allowed_brands?.[0] || "",
        image: state.tempImgBase64 || "",
        payment_config: paymentConfig,
        incentives: incentives,
        legal: legal,
        status: document.getElementById("ev_status")?.value || "ACTIVE",
        updated_at: new Date().toISOString()
    };

    try {
        // SEC-5 FIX: Subir imagen a Firebase Storage en lugar de base64 en Firestore
        const newRef = id ? null : doc(collection(db, "events"));
        const docId = id || newRef.id;
        if (state.tempImgBase64 && state.tempImgBase64.startsWith('data:')) {
            const storagePath = `images/events/${docId}/${Date.now()}.jpg`;
            eventData.image = await uploadToStorage(storage, state.tempImgBase64, storagePath);
        }
        if (id) {
            // BUG-6 FIX: Optimistic locking con getDoc + updateDoc
            // (runTransaction causa failed-precondition por conflicto con onSnapshot listener)
            const eventRef = doc(db, "events", id);
            const currentDoc = await getDoc(eventRef);
            if (!currentDoc.exists()) throw new Error("El evento ya no existe");

            const currentData = currentDoc.data();
            const loadedEvent = state.allEvents.find(x => x.id === id);
            const loadedUpdatedAt = loadedEvent?.updated_at;

            if (loadedUpdatedAt && currentData.updated_at &&
                currentData.updated_at !== loadedUpdatedAt) {
                throw new Error("CONCURRENT_EDIT");
            }

            // Preservar imagen existente si no se seleccionó una nueva
            if (!eventData.image && currentData.image) {
                eventData.image = currentData.image;
            }

            await updateDoc(eventRef, {
                ...eventData,
                updated_at: new Date().toISOString()
            });
            toast("✅ Evento actualizado");
        } else {
            // Crear nuevo con ID pre-generado (para que Storage path coincida)
            eventData.tickets = [];
            eventData.created_at = new Date().toISOString();
            await setDoc(newRef, eventData);
            toast("✅ Evento creado");
        }

        closeModals();
        resetTemps();
        // onSnapshot se encarga de re-renderizar automáticamente

    } catch (error) {
        if (error.message === "CONCURRENT_EDIT") {
            toast("Otro usuario modificó este evento. Recarga e intenta de nuevo.", "error");
        } else {
            logger.error("Error guardando evento:", error);
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
            { name: "accesses", field: "event_id" },
            { name: "rewards", field: "event_id" }
        ];

        // R18 FIX: Paginar eliminación en cascada con limit para no cargar todo en memoria
        const batchSize = APP_CONFIG.LIMITS.BATCH_LIMIT || 450;
        for (const col of collectionsToClean) {
            let hasMore = true;
            while (hasMore) {
                const q = query(collection(db, col.name), where(col.field, "==", eventId), limit(batchSize));
                const snap = await getDocs(q);

                if (snap.empty) {
                    hasMore = false;
                    break;
                }

                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();

                // Si trajo menos que el límite, ya no hay más
                if (snap.docs.length < batchSize) hasMore = false;
            }
        }

        // Eliminar el evento
        await deleteDoc(doc(db, "events", eventId));

        toast("Evento y datos asociados eliminados");
        state.activeEventId = null;
        switchView('view_events');
    } catch (error) {
        logger.error("Error eliminando evento:", error);
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
// ========== MOBILE STATUS PILL ==========
function getMobileStatusPill(status) {
    switch(status) {
        case 'ACTIVE':
            return '<div class="status-pill active"><span class="pulse-dot"></span> Activo</div>';
        case 'PAUSED':
            return '<div class="status-pill paused">Pausado</div>';
        case 'FINISHED':
            return '<div class="status-pill finished">Finalizado</div>';
        case 'DRAFT':
            return '<div class="status-pill draft">Borrador</div>';
        default:
            return '<div class="status-pill active"><span class="pulse-dot"></span> Activo</div>';
    }
}

/**
 * Fetch ticket counts for mobile mini stats (non-blocking, parallel)
 */
async function fetchMiniStats(events) {
    try {
        const results = await Promise.all(events.map(async (event) => {
            // Use cache if available
            if (miniStatsCache.has(event.id)) {
                return { eventId: event.id, ...miniStatsCache.get(event.id) };
            }
            const ticketsSnap = await getDocs(query(
                collection(db, "tickets"),
                where("event_id", "==", event.id),
                limit(500)
            ));
            const tickets = ticketsSnap.docs.map(d => d.data());
            const ticketCount = tickets.length;
            const pendingCount = tickets.filter(t => t.status === 'PENDING').length;
            miniStatsCache.set(event.id, { ticketCount, pendingCount });
            return { eventId: event.id, ticketCount, pendingCount };
        }));

        // Batch update DOM
        for (const r of results) {
            const card = document.querySelector(`.event-card-mobile[data-event-id="${r.eventId}"]`);
            if (card) {
                const nums = card.querySelectorAll('.mini-stat .num');
                if (nums[0]) nums[0].textContent = r.ticketCount;
                if (nums[1]) nums[1].textContent = r.pendingCount;
            }
        }
    } catch (e) {
        logger.warn("Error fetching mini stats:", e);
    }
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
        logger.error('Error parseando hora:', e);
    }
}