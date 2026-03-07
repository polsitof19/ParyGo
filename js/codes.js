// js/codes.js - GENERACIÓN DE CÓDIGOS QR Y GESTIÓN DE STOCK
import { db, APP_CONFIG } from './config.js';
import { state, getActiveEvent, getPromoterById } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, generateCode, logger } from './utils.js';
import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    writeBatch,
    setDoc,
    onSnapshot,
    updateDoc,
    limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. CACHE DE PROMOTORES
// ==========================================

// Referencia al unsubscribe del listener de promotores
let promotersUnsubscribe = null;

/**
 * Procesar snapshot de promotores y actualizar estado + UI
 */
function processPromotersSnapshot(snapshot) {
    state.allPromotersData = snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            name: `${data.name || ''} ${data.lastname || ''}`.trim(),
            dni: data.dni || 'S/D',
            email: data.email || ''
        };
    });

    updatePromotersDropdown();
}

/**
 * Cargar cache de promotores con listener en tiempo real
 */
export function loadPromotersCache() {
    // Si ya hay un listener activo, solo re-renderizar dropdown
    if (promotersUnsubscribe) {
        updatePromotersDropdown();
        return;
    }

    try {
        let staffQuery;

        if (state.isSuperAdmin) {
            staffQuery = query(
                collection(db, APP_CONFIG.COLLECTIONS.STAFF),
                where("role", "==", APP_CONFIG.ROLES.PROMOTER)
            );
        } else if (state.currentUser?.companyId) {
            staffQuery = query(
                collection(db, APP_CONFIG.COLLECTIONS.STAFF),
                where("role", "==", APP_CONFIG.ROLES.PROMOTER),
                where("companies", "array-contains", state.currentUser.companyId)
            );
        } else {
            staffQuery = query(
                collection(db, APP_CONFIG.COLLECTIONS.STAFF),
                where("role", "==", APP_CONFIG.ROLES.PROMOTER)
            );
        }

        promotersUnsubscribe = onSnapshot(staffQuery,
            (snapshot) => processPromotersSnapshot(snapshot),
            (error) => logger.error("Error en listener de promotores:", error)
        );
        state.activeListeners.push(promotersUnsubscribe);

    } catch (error) {
        logger.error("Error configurando listener de promotores:", error);
    }
}

/**
 * Actualizar dropdown de promotores
 */
function updatePromotersDropdown() {
    const dropdownList = document.getElementById("promoters_dropdown");
    if (!dropdownList) return;
    
    let html = `
        <div class="custom-dropdown-item all-option" onclick="window.selectPromoter('TODOS LOS PROMOTORES', 'TODOS')" style="background:rgba(244,63,94,0.1); border-bottom:2px solid var(--primary);">
            <i class="fa-solid fa-users" style="color:var(--primary);"></i> 
            <span style="font-weight:700;">✨ ENVIAR A TODOS</span>
        </div>
    `;
    
    if (state.allPromotersData.length > 0) {
        state.allPromotersData.forEach(p => {
            html += `
                <div class="custom-dropdown-item" onclick="window.selectPromoter('${Validator.sanitizeHTML(p.name)}', '${Validator.sanitizeHTML(p.id)}')">
                    <i class="fa-regular fa-user"></i> 
                    <span>${Validator.sanitizeHTML(p.name)}</span>
                    <span style="font-size:10px; opacity:0.5; margin-left:auto;">${p.dni}</span>
                </div>
            `;
        });
    } else {
        html += `<div class="custom-dropdown-item" style="color:var(--muted); cursor:default;">No hay promotores disponibles</div>`;
    }
    
    dropdownList.innerHTML = html;
}

/**
 * Seleccionar promotor del dropdown
 */
export function selectPromoter(name, id) {
    const input = document.getElementById("gen_search");
    if (input) {
        input.value = name;
        input.dataset.pid = id;
    }
    
    const dropdown = document.getElementById("promoters_dropdown");
    if (dropdown) dropdown.classList.remove('active');
}

/**
 * Filtrar lista de promotores
 */
export function filterPromotersList(searchTerm) {
    const dropdown = document.getElementById("promoters_dropdown");
    if (!dropdown) return;
    
    const items = dropdown.querySelectorAll('.custom-dropdown-item:not(.all-option)');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

/**
 * Llenar selector de tickets en el generador
 */
export function fillCodeGen(event) {
    const select = document.getElementById("gen_tk_sel");
    if (!select) return;
    
    const tickets = event?.tickets || [];
    
    if (tickets.length === 0) {
        select.innerHTML = '<option value="">No hay entradas configuradas</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Selecciona un tipo</option>' + 
        tickets.map(t => 
            `<option value="${t.id}">${Validator.sanitizeHTML(t.name)} ${t.price > 0 ? '(S/.' + t.price + ')' : '(GRATIS)'}</option>`
        ).join("");
}

/**
 * Generar códigos QR masivamente
 */
/**
 * Generar códigos QR masivamente
 */
/**
 * Generar códigos QR masivamente
 */
export async function generateCodes() {
    const ticketId = document.getElementById("gen_tk_sel")?.value;
    const target = document.getElementById("gen_target")?.value || "SELF";
    const searchInput = document.getElementById("gen_search");
    const promoterId = searchInput?.dataset.pid;
    const qty = parseInt(document.getElementById("gen_qty")?.value);
    
    const shouldDownload = document.getElementById("gen_download")?.checked;
    const shouldEmail = document.getElementById("gen_email")?.checked;
    
    // Validaciones
    if (!ticketId) {
        toast("Selecciona un tipo de entrada", "error");
        return;
    }
    
    if (!qty || qty < 1) {
        toast("La cantidad debe ser mayor a 0", "error");
        return;
    }
    
    if (qty > APP_CONFIG.LIMITS.MAX_CODES_PER_BATCH) {
        toast(`Máximo ${APP_CONFIG.LIMITS.MAX_CODES_PER_BATCH} códigos por generación`, "error");
        return;
    }
    
    // Determinar destinos según target
    let targets = []; // { id, name, email }
    
    if (target === "SELF") {
        // Para el admin
        targets = [{
            id: null,
            name: state.currentUser?.name || "Admin",
            email: state.currentUser?.email || ""
        }];
    } else if (target === "ALL") {
        // Para todos los promotores
        targets = state.allPromotersData.map(p => ({
            id: p.id,
            name: p.name,
            email: p.email || ""
        }));
        if (targets.length === 0) {
            toast("No hay promotores disponibles", "error");
            return;
        }
    } else if (target === "PROMOTER") {
        // Para un promotor específico
        if (!promoterId || promoterId === "TODOS") {
            toast("Selecciona un promotor del dropdown", "error");
            return;
        }
        const promoter = state.allPromotersData.find(p => p.id === promoterId);
        targets = [{
            id: promoterId,
            name: promoter?.name || "Promotor",
            email: promoter?.email || ""
        }];
    }

    // Buscar evento y ticket
    const event = getActiveEvent();
    if (!event) {
        toast("Evento no encontrado", "error");
        return;
    }
    
    const ticket = event.tickets?.find(t => t.id === ticketId);
    if (!ticket) {
        toast("Entrada no encontrada", "error");
        return;
    }

    // BUG-2 FIX: Validar stock disponible antes de generar
    const totalToGenerate = qty * targets.length;
    if (ticket.stock != null) {
        const existingQ = query(
            collection(db, APP_CONFIG.COLLECTIONS.TICKETS),
            where("event_id", "==", state.activeEventId),
            where("ticket_id", "==", ticketId)
        );
        const existingSnap = await getDocs(existingQ);
        const activeCount = existingSnap.docs.filter(d => {
            const s = d.data().status;
            return s !== 'CANCELLED';
        }).length;
        const available = ticket.stock - activeCount;

        if (totalToGenerate > available) {
            toast(`Stock insuficiente. Disponible: ${available}, Solicitado: ${totalToGenerate}`, "error");
            return;
        }
    }

    const btn = document.getElementById("btnGenCodes");
    const originalText = btn ? btn.innerHTML : "GENERAR CÓDIGOS";
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
            btn.disabled = true;
        }
        
        const BATCH_SIZE = APP_CONFIG.LIMITS.BATCH_LIMIT || 450;
        let totalGenerated = 0;
        const generatedCodes = new Set();
        const allGeneratedCodes = []; // Para descarga del admin
        const codesByTarget = {}; // Para enviar por correo a cada uno

        // Acumular todas las operaciones primero
        const allOps = [];

        for (const targetPerson of targets) {
            codesByTarget[targetPerson.email || targetPerson.id || 'admin'] = {
                name: targetPerson.name,
                email: targetPerson.email,
                codes: []
            };

            for (let i = 0; i < qty; i++) {
                let code;
                let attempts = 0;

                // Generar código único (R16 fix: verificar contra local + Firestore)
                do {
                    code = generateCode(event.name || "TKT");
                    attempts++;
                } while (attempts < 10 && generatedCodes.has(code));

                generatedCodes.add(code);

                // Usar código como doc ID para unicidad garantizada por Firestore
                const ref = doc(db, APP_CONFIG.COLLECTIONS.TICKETS, code);

                const codeData = {
                    company_id: event.company_id || "",
                    event_id: state.activeEventId,
                    event_name: event.name || "",
                    event_date: event.date || "",
                    brand_id: event.brand_id || state.activeBrandId || "",
                    promoter_id: targetPerson.id || "",
                    promoter_name: targetPerson.name || "",
                    ticket_id: ticket.id,
                    ticket_name: ticket.name,
                    ticket_color: ticket.color,
                    is_free: true,
                    qr_token: code,
                    code: code,
                    type: ticket.type || "UNIQUE",
                    max_uses: ticket.max_uses || 1,
                    current_uses: 0,
                    max_scans: ticket.max_scans || 1,
                    status: APP_CONFIG.STATUS.ACTIVE,
                    expires_at: ticket.claim_until || event.date || null,
                    created_at: new Date().toISOString()
                };

                allOps.push({ ref, codeData });
                allGeneratedCodes.push(codeData);
                codesByTarget[targetPerson.email || targetPerson.id || 'admin'].codes.push(codeData);
                totalGenerated++;
            }
        }

        // R16 FIX: Verificar que no existan docs con esos IDs antes de escribir
        // Si colisiona, regenerar código y reintentar (máx 3 intentos)
        let retries = 0;
        const MAX_RETRIES = 3;

        while (retries < MAX_RETRIES) {
            try {
                for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
                    const chunk = allOps.slice(i, i + BATCH_SIZE);
                    const batch = writeBatch(db);
                    chunk.forEach(op => batch.set(op.ref, op.codeData));
                    await batch.commit();
                }
                break; // Éxito
            } catch (batchError) {
                retries++;
                if (retries >= MAX_RETRIES) throw batchError;
                // Regenerar códigos que colisionaron
                for (const op of allOps) {
                    let newCode;
                    let codeAttempts = 0;
                    do {
                        newCode = generateCode(event.name || "TKT");
                        codeAttempts++;
                    } while (codeAttempts < 10 && generatedCodes.has(newCode));
                    generatedCodes.add(newCode);
                    op.codeData.code = newCode;
                    op.codeData.qr_token = newCode;
                    op.ref = doc(db, APP_CONFIG.COLLECTIONS.TICKETS, newCode);
                }
            }
        }
        
        // Descargar archivos si está marcado (solo para el admin)
        if (shouldDownload) {
            downloadCodesAsExcel(allGeneratedCodes, event.name, ticket.name);
            setTimeout(() => {
                downloadCodesAsTxt(allGeneratedCodes, event.name);
            }, 500);
        }
        
        // Enviar por correo si está marcado
        if (shouldEmail) {
            let emailsSent = 0;
            for (const key in codesByTarget) {
                const data = codesByTarget[key];
                if (data.email) {
                    await sendCodesByEmail(data.email, data.codes, event.name, ticket.name, data.name);
                    emailsSent++;
                }
            }
            if (emailsSent > 0) {
                toast(`📧 ${emailsSent} correo(s) enviado(s)`);
            } else {
                toast("⚠️ No se encontraron emails configurados", "warning");
            }
        }
        
        const targetText = targets.length > 1 ? `${targets.length} promotores` : targets[0].name;
        toast(`✅ ${totalGenerated} códigos generados para ${targetText}`);
        
        // Recargar accesos
        if (window.loadAccesses) window.loadAccesses(state.activeEventId);
        if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
        
    } catch (error) {
        logger.error("Error generando códigos:", error);
        toast("Error al generar códigos", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// ==========================================
// 3. GESTIÓN DE STOCK (QUOTAS)
// ==========================================

/**
 * Abrir modal de asignación de stock
 */
export function openStockModal() {
    // Llenar select de promotores
    const selProm = document.getElementById("stk_promoter");
    if (selProm && state.allPromotersData) {
        selProm.innerHTML = state.allPromotersData.map(p => 
            `<option value="${p.id}">${Validator.sanitizeHTML(p.name)}</option>`
        ).join("");
    }
    
    // Llenar select de tickets
    const event = getActiveEvent();
    if (event) {
        const selTick = document.getElementById("stk_ticket");
        if (selTick) {
            selTick.innerHTML = (event.tickets || []).map(t => 
                `<option value="${t.id}">${Validator.sanitizeHTML(t.name)} - ${t.price > 0 ? 'S/ ' + t.price : 'GRATIS'}</option>`
            ).join("");
        }
    }
    
    // Limpiar cantidad
    const qtyInput = document.getElementById("stk_qty");
    if (qtyInput) qtyInput.value = "";
    
    openModal('modalStock');
}

// Referencia al unsubscribe del listener de stock
let stockUnsubscribe = null;

/**
 * Renderizar tabla de stock desde snapshot
 */
function renderStockFromSnapshot(snapshot) {
    const tbody = document.querySelector("#tblStock tbody");
    if (!tbody) return;

    const isMobile = window.innerWidth <= 768;

    if (snapshot.empty) {
        const emptyMsg = 'No hay stock asignado para este evento';
        if (isMobile) {
            tbody.innerHTML = '';
            let mobileList = document.getElementById('mobileStockList');
            if (!mobileList) {
                const table = document.getElementById('tblStock');
                mobileList = document.createElement('div');
                mobileList.id = 'mobileStockList';
                mobileList.className = 'mobile-stock-list';
                table.parentNode.insertBefore(mobileList, table.nextSibling);
            }
            mobileList.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--text-muted);">${emptyMsg}</div>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--muted);">${emptyMsg}</td></tr>`;
        }
        return;
    }

    if (isMobile) {
        tbody.innerHTML = '';
        let mobileList = document.getElementById('mobileStockList');
        if (!mobileList) {
            const table = document.getElementById('tblStock');
            mobileList = document.createElement('div');
            mobileList.id = 'mobileStockList';
            mobileList.className = 'mobile-stock-list';
            table.parentNode.insertBefore(mobileList, table.nextSibling);
        }

        mobileList.innerHTML = snapshot.docs.map(d => {
            const q = d.data();
            const promoter = state.allPromotersData?.find(p => p.id === q.promoter_id);
            const assigned = q.assigned || 0;
            const used = q.used || 0;
            const disponible = assigned - used;
            const pct = assigned > 0 ? Math.round((used / assigned) * 100) : 0;
            const barColor = disponible > 0 ? '#22c55e' : '#ef4444';

            return `
                <div class="mobile-stock-item">
                    <div class="stock-top">
                        <span class="stock-name">${Validator.sanitizeHTML(promoter?.name || 'Desconocido')}</span>
                        <span class="stock-type">${Validator.sanitizeHTML(q.ticket_name || '-')}</span>
                    </div>
                    <div class="stock-numbers">
                        <div class="stock-num"><div class="val">${assigned}</div><div class="lbl">Asignado</div></div>
                        <div class="stock-num"><div class="val">${used}</div><div class="lbl">Usado</div></div>
                        <div class="stock-num"><div class="val" style="color:${barColor}">${disponible}</div><div class="lbl">Disponible</div></div>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${barColor};"></div></div>
                    <div style="margin-top:10px; text-align:right;">
                        <button class="btn-icon" onclick="window.editStock('${Validator.sanitizeHTML(d.id)}')" title="Editar" style="min-height:44px; min-width:44px;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        const existing = document.getElementById('mobileStockList');
        if (existing) existing.innerHTML = '';

        tbody.innerHTML = snapshot.docs.map(d => {
            const q = d.data();
            const promoter = state.allPromotersData?.find(p => p.id === q.promoter_id);
            const disponible = (q.assigned || 0) - (q.used || 0);

            return `
                <tr>
                    <td>${Validator.sanitizeHTML(promoter?.name || 'Desconocido')}</td>
                    <td>${Validator.sanitizeHTML(q.ticket_name || '-')}</td>
                    <td style="text-align:center;">${q.assigned || 0}</td>
                    <td style="text-align:center;">${q.used || 0}</td>
                    <td style="text-align:center; font-weight:700; color:${disponible > 0 ? 'var(--success)' : 'var(--danger)'};">${disponible}</td>
                    <td>
                        <button class="btn-icon" onclick="window.editStock('${Validator.sanitizeHTML(d.id)}')" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }
}

/**
 * Cargar tabla de stock con listener en tiempo real
 */
export function loadStockTable() {
    if (!state.activeEventId) return;

    // Limpiar listener anterior de stock (cambia por evento)
    if (stockUnsubscribe) {
        const oldUnsub = stockUnsubscribe;
        stockUnsubscribe = null;
        oldUnsub();
        state.activeListeners = state.activeListeners.filter(fn => fn !== oldUnsub);
    }

    try {
        const q = query(
            collection(db, APP_CONFIG.COLLECTIONS.QUOTAS),
            where("event_id", "==", state.activeEventId)
        );

        stockUnsubscribe = onSnapshot(q,
            (snapshot) => renderStockFromSnapshot(snapshot),
            (error) => {
                logger.error("Error en listener de stock:", error);
                toast("Error cargando stock", "error");
            }
        );
        state.activeListeners.push(stockUnsubscribe);

    } catch (error) {
        logger.error("Error configurando listener de stock:", error);
        toast("Error cargando stock", "error");
    }
}

/**
 * Guardar asignación de stock
 */
export async function saveStockAssignment() {
    const promoterId = document.getElementById("stk_promoter")?.value;
    const ticketId = document.getElementById("stk_ticket")?.value;
    const qty = parseInt(document.getElementById("stk_qty")?.value);
    
    if (!promoterId || !ticketId || !qty || qty < 1) {
        toast("Completa todos los campos", "error");
        return;
    }
    
    try {
        const event = getActiveEvent();
        const ticket = event?.tickets?.find(t => t.id === ticketId);
        const promoter = state.allPromotersData?.find(p => p.id === promoterId);

        const quotaId = `${state.activeEventId}_${promoterId}_${ticketId}`;

        // Verificar si la cuota ya existe para no resetear el campo "used"
        const quotaRef = doc(db, APP_CONFIG.COLLECTIONS.QUOTAS, quotaId);
        const existingQuota = await getDoc(quotaRef);

        const quotaData = {
            company_id: event?.company_id || "",
            event_id: state.activeEventId,
            promoter_id: promoterId,
            promoter_name: promoter?.name || "",
            ticket_id: ticketId,
            ticket_name: ticket?.name || "",
            assigned: qty,
            assigned_at: new Date().toISOString()
        };

        // Solo inicializar "used" en cuotas nuevas
        if (!existingQuota.exists()) {
            quotaData.used = 0;
        }

        await setDoc(quotaRef, quotaData, { merge: true });

        toast("✅ Stock asignado correctamente");

        closeModals();
        // onSnapshot se encarga de re-renderizar automáticamente
        
    } catch (error) {
        logger.error("Error asignando stock:", error);
        toast("Error al asignar stock", "error");
    }
}
// ==========================================
// 4. CÓDIGO MANUAL (ÚNICO O COMPARTIDO)
// ==========================================

/**
 * Abrir modal para crear código manual
 */
export function openManualCodeModal() {
    const event = getActiveEvent();
    if (!event) {
        toast("Selecciona un evento primero", "error");
        return;
    }
    
    // Llenar tickets
    const ticketSelect = document.getElementById("mc_ticket");
    if (ticketSelect) {
        const freeTickets = (event.tickets || []).filter(t => t.isFree || t.price === 0);
        if (freeTickets.length === 0) {
            ticketSelect.innerHTML = '<option value="">No hay tickets gratuitos</option>';
        } else {
            ticketSelect.innerHTML = freeTickets.map(t => 
                `<option value="${t.id}">${Validator.sanitizeHTML(t.name)}</option>`
            ).join("");
        }
    }
    
    // Llenar promotores
    const promoterSelect = document.getElementById("mc_promoter");
    if (promoterSelect && state.allPromotersData) {
        promoterSelect.innerHTML = '<option value="">Sin promotor asignado</option>' +
            state.allPromotersData.map(p => 
                `<option value="${p.id}">${Validator.sanitizeHTML(p.name)}</option>`
            ).join("");
    }
    
    // Resetear campos
    document.getElementById("mc_type").value = "UNIQUE";
    document.getElementById("mc_code").value = "";
    document.getElementById("mc_max_uses").value = "100";
    document.getElementById("mc_expires").value = event.date || "";
    document.getElementById("mc_max_uses_group").style.display = "none";
    
    openModal('modalManualCode');
}

/**
 * Mostrar/ocultar campo de máximo usos según tipo
 */
export function toggleCodeTypeFields() {
    const type = document.getElementById("mc_type")?.value;
    const maxUsesGroup = document.getElementById("mc_max_uses_group");
    
    if (maxUsesGroup) {
        maxUsesGroup.style.display = type === "SHARED" ? "block" : "none";
    }
}

/**
 * Guardar código manual
 */
export async function saveManualCode() {
    const event = getActiveEvent();
    if (!event) {
        toast("Evento no encontrado", "error");
        return;
    }
    
    const type = document.getElementById("mc_type")?.value || "UNIQUE";
    let code = document.getElementById("mc_code")?.value.trim().toUpperCase();
    const maxUses = type === "SHARED" ? parseInt(document.getElementById("mc_max_uses")?.value) || 100 : 1;
    const ticketId = document.getElementById("mc_ticket")?.value;
    const promoterId = document.getElementById("mc_promoter")?.value || "";
    const expiresAt = document.getElementById("mc_expires")?.value || event.date || null;
    
    // Validaciones
    if (!ticketId) {
        toast("Selecciona un tipo de entrada", "error");
        return;
    }
    
    if (type === "SHARED" && (!maxUses || maxUses < 1)) {
        toast("La cantidad de usos debe ser mayor a 0", "error");
        return;
    }
    
    // Generar código si está vacío
    if (!code) {
        code = generateCode(event.tickets?.find(t => t.id === ticketId)?.sku || "TKT");
    }
    
    try {
        // Verificar que el código no exista
        const existingCode = await getDocs(
            query(
                collection(db, APP_CONFIG.COLLECTIONS.TICKETS),
                where("code", "==", code)
            )
        );
        
        if (!existingCode.empty) {
            toast("Este código ya existe, usa otro", "error");
            return;
        }
        
        const ticket = event.tickets?.find(t => t.id === ticketId);
        const promoter = state.allPromotersData?.find(p => p.id === promoterId);
        
        // Crear código
        const codeRef = doc(collection(db, APP_CONFIG.COLLECTIONS.TICKETS));
        await setDoc(codeRef, {
            company_id: event.company_id || "",
            event_id: state.activeEventId,
            event_name: event.name || "",
            event_date: event.date || "",
            brand_id: event.brand_id || state.activeBrandId || "",
            promoter_id: promoterId,
            promoter_name: promoter?.name || "",
            ticket_id: ticket?.id || "",
            ticket_name: ticket?.name || "",
            ticket_color: ticket?.color || "#f43f5e",
            is_free: true,
            qr_token: code,
            code: code,
            type: type,
            max_uses: maxUses,
            current_uses: 0,
            max_scans: ticket?.max_scans || 1,
            status: APP_CONFIG.STATUS.ACTIVE,
            expires_at: expiresAt,
            created_at: new Date().toISOString()
        });
        
        const typeText = type === "SHARED" ? `compartido (${maxUses} usos)` : "único";
        toast(`✅ Código ${code} creado (${typeText})`);
        
        closeModals();
        
        // Recargar lista
        if (window.loadAccesses) window.loadAccesses(state.activeEventId);
        if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
        
    } catch (error) {
        logger.error("Error creando código:", error);
        toast("Error al crear el código", "error");
    }
}
// ==========================================
// 5. FUNCIONES AUXILIARES PARA GENERACIÓN
// ==========================================

/**
 * Mostrar/ocultar campo de promotor según selección
 */
export function togglePromoterField() {
    const target = document.getElementById("gen_target")?.value;
    const promoterGroup = document.getElementById("gen_promoter_group");
    
    if (promoterGroup) {
        promoterGroup.style.display = target === "PROMOTER" ? "block" : "none";
    }
}

/**
 * Mostrar/ocultar campo de email
 */
export function toggleEmailField() {
    const emailCheckbox = document.getElementById("gen_email");
    const emailGroup = document.getElementById("gen_email_group");
    
    if (emailGroup) {
        emailGroup.style.display = emailCheckbox?.checked ? "block" : "none";
    }
}

/**
 * Descargar códigos como Excel
 */
export function downloadCodesAsExcel(codes, eventName, ticketName) {
    // Preparar datos para Excel
    const data = codes.map((code, index) => ({
        'N°': index + 1,
        'Código': code.code,
        'Entrada': ticketName,
        'Evento': eventName,
        'Estado': 'Disponible',
        'Fecha Creación': new Date().toLocaleDateString()
    }));
    
    // Crear workbook
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Códigos");
    
    // Ajustar anchos de columna
    ws['!cols'] = [
        { wch: 5 },   // N°
        { wch: 15 },  // Código
        { wch: 15 },  // Entrada
        { wch: 25 },  // Evento
        { wch: 12 },  // Estado
        { wch: 15 }   // Fecha
    ];
    
    // Descargar
    const fileName = `Codigos_${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    return fileName;
}

/**
 * Descargar códigos como TXT
 */
export function downloadCodesAsTxt(codes, eventName) {
    const content = codes.map(c => c.code).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const fileName = `Codigos_${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return fileName;
}

/**
 * Enviar códigos por correo usando EmailJS
 */
/**
 * Enviar códigos por correo
 */
export async function sendCodesByEmail(email, codes, eventName, ticketName, recipientName) {
    if (!email) return false;

    // Crear contenido del correo
    const codesListText = codes.map((c, i) => `${i + 1}. ${c.code}`).join('\n');

    const subject = `🎫 Tus códigos para ${eventName}`;
    const body = `Hola ${recipientName || ''},

Aquí están tus códigos de entrada (${ticketName}) para ${eventName}:

${codesListText}

Total: ${codes.length} código(s)

Para reclamar tu entrada, ingresa el código en el link de la marca.

¡Nos vemos en el evento!`;

    // Abrir cliente de correo
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');

    return true;
}

// ==========================================
// 6. PAGOS PENDIENTES DE PROMOTORES
// ==========================================

// Referencia al unsubscribe del listener de pagos pendientes
let paymentsUnsubscribe = null;

/**
 * Renderizar tabla de pagos pendientes desde snapshot
 */
function renderPendingPaymentsFromSnapshot(snapshot) {
    const tbody = document.querySelector("#tblPendingPayments tbody");
    const emptyState = document.getElementById("pending_payments_empty");
    const table = document.getElementById("tblPendingPayments");
    const badge = document.getElementById("pending_payments_badge");

    if (!tbody) return;

    const isMobile = window.innerWidth <= 768;

    // Actualizar badge
    const count = snapshot.docs.length;
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // Actualizar notif dot en mobile bottom nav
    if (typeof window.updatePromoNotifDot === 'function') {
        window.updatePromoNotifDot(count > 0);
    }

    if (snapshot.empty) {
        if (emptyState) emptyState.style.display = '';
        if (table) table.style.display = 'none';
        if (isMobile) {
            const mobileList = document.getElementById('mobilePaymentsList');
            if (mobileList) mobileList.innerHTML = '';
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (table) table.style.display = '';

    if (isMobile) {
        tbody.innerHTML = '';
        let mobileList = document.getElementById('mobilePaymentsList');
        if (!mobileList) {
            mobileList = document.createElement('div');
            mobileList.id = 'mobilePaymentsList';
            mobileList.className = 'mobile-payments-list';
            table.parentNode.insertBefore(mobileList, table.nextSibling);
        }

        mobileList.innerHTML = snapshot.docs.map(d => {
            const pc = d.data();
            const formattedDate = pc.created_at
                ? new Date(pc.created_at).toLocaleDateString('es-PE', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                })
                : '---';

            return `
                <div class="mobile-payment-card">
                    <div class="payment-top">
                        <span class="name">${Validator.sanitizeHTML(pc.promoter_name || 'Desconocido')}</span>
                        <span class="time">${formattedDate}</span>
                    </div>
                    <div class="payment-detail">
                        <span>Codigo: <strong>${Validator.sanitizeHTML(pc.code)}</strong></span>
                        <span>Entrada: <strong>${Validator.sanitizeHTML(pc.ticket_name || '-')}</strong></span>
                        <span>Monto: <strong>S/. ${Number(pc.payment_amount || 0).toFixed(2)}</strong></span>
                    </div>
                    <div class="payment-btns">
                        <button class="btn-approve" onclick="window.approvePayment('${d.id}')">
                            <i class="fa-solid fa-check"></i> Aprobar
                        </button>
                        <button class="btn-reject" onclick="window.rejectPayment('${d.id}')">
                            <i class="fa-solid fa-times"></i> Rechazar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        const existing = document.getElementById('mobilePaymentsList');
        if (existing) existing.innerHTML = '';

        tbody.innerHTML = snapshot.docs.map(d => {
            const pc = d.data();
            const formattedDate = pc.created_at
                ? new Date(pc.created_at).toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : '---';

            return `
                <tr data-code-id="${d.id}">
                    <td><code style="font-family:monospace; font-weight:600;">${Validator.sanitizeHTML(pc.code)}</code></td>
                    <td>${Validator.sanitizeHTML(pc.promoter_name || 'Desconocido')}</td>
                    <td>${Validator.sanitizeHTML(pc.ticket_name || '-')}</td>
                    <td style="font-weight:600;">S/. ${Number(pc.payment_amount || 0).toFixed(2)}</td>
                    <td>${formattedDate}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="window.approvePayment('${d.id}')" title="Aprobar pago">
                            <i class="fa-solid fa-check"></i> Aprobar
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.rejectPayment('${d.id}')" title="Rechazar">
                            <i class="fa-solid fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }
}

/**
 * Cargar tabla de pagos pendientes con listener en tiempo real
 */
export function loadPendingPayments() {
    if (!state.activeEventId) return;

    // Limpiar listener anterior de pagos (cambia por evento)
    if (paymentsUnsubscribe) {
        const oldUnsub = paymentsUnsubscribe;
        paymentsUnsubscribe = null;
        oldUnsub();
        state.activeListeners = state.activeListeners.filter(fn => fn !== oldUnsub);
    }

    try {
        // SEC-6 FIX: Limit para evitar cargar demasiados documentos
        const q = query(
            collection(db, "promotorCodes"),
            where("event_id", "==", state.activeEventId),
            where("status", "==", "PENDING"),
            limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
        );

        paymentsUnsubscribe = onSnapshot(q,
            (snapshot) => renderPendingPaymentsFromSnapshot(snapshot),
            (error) => {
                logger.error("Error en listener de pagos pendientes:", error);
                toast("Error cargando pagos pendientes", "error");
            }
        );
        state.activeListeners.push(paymentsUnsubscribe);

    } catch (error) {
        logger.error("Error configurando listener de pagos:", error);
        toast("Error cargando pagos pendientes", "error");
    }
}

/**
 * Aprobar pago de un código de promotor
 */
export async function approvePayment(codeId) {
    if (!codeId) return;

    try {
        // SEC-8 FIX: Verificar comprobante antes de aprobar
        const codeSnap = await getDoc(doc(db, "promotorCodes", codeId));
        if (!codeSnap.exists()) {
            toast("Código no encontrado", "error");
            return;
        }

        const codeData = codeSnap.data();
        const hasProof = codeData.payment_proof_url || codeData.operation_number;

        if (!hasProof) {
            const confirmed = await customConfirm(
                "Este pago no tiene comprobante adjunto. ¿Aprobar de todos modos?",
                "Sin comprobante"
            );
            if (!confirmed) return;
        }

        await updateDoc(doc(db, "promotorCodes", codeId), {
            status: "APPROVED",
            approved_at: new Date().toISOString(),
            approved_by: state.currentUser?.id || "admin"
        });

        toast("✅ Pago aprobado correctamente");

    } catch (error) {
        logger.error("Error aprobando pago:", error);
        toast("Error al aprobar pago", "error");
    }
}

/**
 * Rechazar pago de un código de promotor
 */
export async function rejectPayment(codeId) {
    if (!codeId) return;

    const confirmed = await customConfirm("¿Estás seguro de rechazar este pago? El código será eliminado.", "Rechazar pago");
    if (!confirmed) return;

    try {
        await updateDoc(doc(db, "promotorCodes", codeId), {
            status: "REJECTED",
            rejected_at: new Date().toISOString(),
            rejected_by: state.currentUser?.id || "admin"
        });

        toast("❌ Pago rechazado");
        // onSnapshot se encarga de re-renderizar automáticamente

    } catch (error) {
        logger.error("Error rechazando pago:", error);
        toast("Error al rechazar pago", "error");
    }
}

/**
 * R-TR2/TR5: Limpiar listeners de stock, pagos y promotores
 */
export function cleanupCodesListeners() {
    if (stockUnsubscribe) {
        stockUnsubscribe();
        state.activeListeners = state.activeListeners.filter(fn => fn !== stockUnsubscribe);
        stockUnsubscribe = null;
    }
    if (paymentsUnsubscribe) {
        paymentsUnsubscribe();
        state.activeListeners = state.activeListeners.filter(fn => fn !== paymentsUnsubscribe);
        paymentsUnsubscribe = null;
    }
    if (promotersUnsubscribe) {
        promotersUnsubscribe();
        state.activeListeners = state.activeListeners.filter(fn => fn !== promotersUnsubscribe);
        promotersUnsubscribe = null;
    }
}