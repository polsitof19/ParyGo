// js/codes.js - GENERACIÓN DE CÓDIGOS QR Y GESTIÓN DE STOCK
import { db, APP_CONFIG } from './config.js';
import { state, getActiveEvent, getPromoterById } from './state.js';
import { Validator, toast, openModal, closeModals, generateCode } from './utils.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    writeBatch, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. CACHE DE PROMOTORES
// ==========================================

/**
 * Cargar cache de promotores para dropdown
 */
export async function loadPromotersCache() {
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

        const snapshot = await getDocs(staffQuery);
        
        state.allPromotersData = snapshot.docs.map(d => {
            const data = d.data();
            return { 
                id: d.id, 
                name: `${data.name || ''} ${data.lastname || ''}`.trim(),
                dni: data.dni || 'S/D',
                email: data.email || ''
            };
        });
        
        console.log(`📋 ${state.allPromotersData.length} promotores cargados`);
        
        updatePromotersDropdown();
        
    } catch (error) {
        console.error("Error cargando promotores:", error);
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
                <div class="custom-dropdown-item" onclick="window.selectPromoter('${Validator.sanitizeHTML(p.name)}', '${p.id}')">
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
    
    const btn = document.getElementById("btnGenCodes");
    const originalText = btn ? btn.innerHTML : "GENERAR CÓDIGOS";
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
            btn.disabled = true;
        }
        
        const batch = writeBatch(db);
        let totalGenerated = 0;
        const generatedCodes = new Set();
        const allGeneratedCodes = []; // Para descarga del admin
        const codesByTarget = {}; // Para enviar por correo a cada uno
        
        for (const targetPerson of targets) {
            codesByTarget[targetPerson.email || targetPerson.id || 'admin'] = {
                name: targetPerson.name,
                email: targetPerson.email,
                codes: []
            };
            
            for (let i = 0; i < qty; i++) {
                let code;
                let attempts = 0;
                
                // Generar código único
                do {
                    code = generateCode(event.name || "TKT");
                    attempts++;
                } while (attempts < 10 && generatedCodes.has(code));
                
                generatedCodes.add(code);
                
                const ref = doc(collection(db, APP_CONFIG.COLLECTIONS.TICKETS));
                
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
                
                batch.set(ref, codeData);
                allGeneratedCodes.push(codeData);
                codesByTarget[targetPerson.email || targetPerson.id || 'admin'].codes.push(codeData);
                totalGenerated++;
            }
        }

        await batch.commit();
        
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
        console.error("Error generando códigos:", error);
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

/**
 * Cargar tabla de stock asignado
 */
export async function loadStockTable() {
    if (!state.activeEventId) return;
    
    try {
        const snapshot = await getDocs(
            query(
                collection(db, APP_CONFIG.COLLECTIONS.QUOTAS),
                where("event_id", "==", state.activeEventId)
            )
        );
        
        const tbody = document.querySelector("#tblStock tbody");
        if (!tbody) return;
        
        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:40px; color:var(--muted);">
                        No hay stock asignado para este evento
                    </td>
                </tr>
            `;
            return;
        }
        
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
                        <button class="btn-icon" onclick="window.editStock('${d.id}')" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
        
    } catch (error) {
        console.error("Error cargando stock:", error);
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
        
        await setDoc(doc(db, APP_CONFIG.COLLECTIONS.QUOTAS, quotaId), {
            company_id: event?.company_id || "",
            event_id: state.activeEventId,
            promoter_id: promoterId,
            promoter_name: promoter?.name || "",
            ticket_id: ticketId,
            ticket_name: ticket?.name || "",
            assigned: qty,
            used: 0,
            assigned_at: new Date().toISOString()
        }, { merge: true });
        
        toast("✅ Stock asignado correctamente");
        
        closeModals();
        await loadStockTable();
        
    } catch (error) {
        console.error("Error asignando stock:", error);
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
        console.error("Error creando código:", error);
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