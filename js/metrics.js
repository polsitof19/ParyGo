// js/metrics.js - MÉTRICAS, VENTAS Y ACCESOS
import { db, APP_CONFIG } from './config.js';
import { state, getPromoterById } from './state.js';
import { Validator, toast, openModal, customConfirm, formatDateTime } from './utils.js';
import { 
    collection, 
    query, 
    where, 
    getDoc,
    getDocs, 
    doc, 
    updateDoc, 
    runTransaction, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables locales
let currentAccessData = [];
let filteredAccessData = [];

// ==========================================
// 1. MÉTRICAS DEL EVENTO
// ==========================================

/**
 * Cargar métricas del evento
 */
export async function loadEventMetrics(eid) {
    try {
        const [snapTickets, snapQuotas] = await Promise.all([
            getDocs(query(collection(db, APP_CONFIG.COLLECTIONS.TICKETS), where("event_id", "==", eid))),
            getDocs(query(collection(db, APP_CONFIG.COLLECTIONS.QUOTAS), where("event_id", "==", eid)))
        ]);

        const tickets = snapTickets.docs.map(d => d.data());
        const quotas = snapQuotas.docs.map(d => d.data());

        // TABLA GENERAL (TIPOS DE ENTRADA)
        let typeStats = {};
        tickets.forEach(t => {
            const typeName = t.ticket_name || 'Sin tipo';
            if (!typeStats[typeName]) typeStats[typeName] = { gen: 0, claimed: 0, scanned: 0 };
            typeStats[typeName].gen++;
            if (t.status === 'CLAIMED' || t.client_name) typeStats[typeName].claimed++;
            if (t.status?.includes('SCANNED')) typeStats[typeName].scanned++;
        });
        
        const tblGen = document.getElementById("tblMetGeneral");
        if (tblGen) {
            const tbody = tblGen.querySelector("tbody");
            if (tbody) {
                if (Object.keys(typeStats).length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--muted);">No hay tickets generados aún</td></tr>';
                } else {
                    tbody.innerHTML = Object.entries(typeStats).map(([name, s]) => `
                        <tr>
                            <td><strong>${Validator.sanitizeHTML(name)}</strong></td>
                            <td style="text-align:center">${s.gen}</td>
                            <td style="text-align:center">${s.claimed}</td>
                            <td style="text-align:center">${s.gen - s.claimed}</td>
                            <td style="text-align:center; font-weight:bold; color:var(--success)">${s.scanned}</td>
                        </tr>
                    `).join("");
                }
            }
        }

        // TABLA PROMOTORES
        let promoStats = {};
        tickets.forEach(t => {
            const pid = t.promoter_id || 'sin_asignar';
            if (!promoStats[pid]) {
                promoStats[pid] = {
                    name: t.promoter_name || 'Sin asignar',
                    gen: 0,
                    scanned: 0,
                    asignado: 0
                };
            }
            promoStats[pid].gen++;
            if (t.status?.includes('SCANNED')) promoStats[pid].scanned++;
        });

        quotas.forEach(q => {
            const pid = q.promoter_id || 'sin_asignar';
            if (!promoStats[pid]) {
                promoStats[pid] = {
                    name: q.promoter_name || 'Sin asignar',
                    gen: 0,
                    scanned: 0,
                    asignado: 0
                };
            }
            promoStats[pid].asignado += (q.assigned || 0);
        });

        const tblPro = document.getElementById("tblMetPromoters");
        if (tblPro) {
            const tbody = tblPro.querySelector("tbody");
            if (tbody) {
                if (Object.keys(promoStats).length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--muted);">No hay promotores asignados</td></tr>';
                } else {
                    tbody.innerHTML = Object.values(promoStats).map(p => {
                        const disponible = p.asignado - p.gen;
                        return `
                            <tr>
                                <td><strong>${Validator.sanitizeHTML(p.name)}</strong></td>
                                <td style="text-align:center">${p.gen}</td>
                                <td style="text-align:center; color:var(--success)">${p.scanned}</td>
                                <td style="text-align:center">${p.gen - p.scanned}</td>
                                <td style="text-align:center; font-weight:bold; color:${disponible >= 0 ? 'var(--success)' : 'var(--danger)'}">${disponible}</td>
                            </tr>
                        `;
                    }).join("");
                }
            }
        }

        // TABLA CANALES
        const tblCan = document.getElementById("tblMetChannels");
        if (tblCan) {
            const tbody = tblCan.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:30px; color:var(--muted);">Métricas por canal en desarrollo</td></tr>';
            }
        }

    } catch (error) {
        console.error("Error cargando métricas:", error);
        toast("Error cargando métricas", "error");
    }
}

/**
 * Cambiar tab de métricas
 */
export function switchMetricTab(type) {
    document.querySelectorAll('.metric-view').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.met-tab').forEach(t => t.classList.remove('active'));
    
    const viewMap = { 'gen': 'view_met_gen', 'pro': 'view_met_pro', 'can': 'view_met_can' };
    document.getElementById(viewMap[type])?.classList.remove('hidden');
    document.getElementById('mt_' + type)?.classList.add('active');
}

// ==========================================
// 2. VENTAS PENDIENTES
// ==========================================

/**
 * Cargar ventas pendientes del evento
 */
export async function loadEventSales(eid) {
    try {
        const snapshot = await getDocs(
            query(
                collection(db, APP_CONFIG.COLLECTIONS.SALES),
                where("event_id", "==", eid),
                where("status", "==", APP_CONFIG.STATUS.PENDING)
            )
        );

        const tbody = document.querySelector("#tblEventSales tbody");
        if (!tbody) return;

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--muted);">No hay ventas pendientes de aprobación</td></tr>';
            return;
        }

        tbody.innerHTML = snapshot.docs.map(d => {
            const sale = d.data();
            return `
                <tr id="sale_${d.id}">
                    <td>${Validator.sanitizeHTML(sale.promoter_name || '-')}</td>
                    <td>
                        <strong>${Validator.sanitizeHTML(sale.full_name || sale.client_name || '-')}</strong>
                        <br><small style="color:var(--muted);">DNI: ${Validator.sanitizeHTML(sale.client_dni || '-')}</small>
                    </td>
                    <td>${Validator.sanitizeHTML(sale.ticket_name || '-')}</td>
                    <td style="font-weight:700; color:var(--success);">S/ ${Number(sale.total_price || 0).toFixed(2)}</td>
                    <td>
                        ${sale.proof_image 
                            ? `<button class="btn-icon" onclick="window.viewProof('${sale.proof_image}')" title="Ver comprobante"><i class="fa-solid fa-image"></i></button>` 
                            : '<span style="color:var(--muted);">-</span>'
                        }
                    </td>
                    <td>
                        <div style="display:flex; gap:8px;">
                            <button class="btn" style="background:var(--success); color:#fff; padding:8px 12px; height:auto; font-size:11px;" onclick="window.approveSale('${d.id}')">
                                <i class="fa-solid fa-check"></i> APROBAR
                            </button>
                            <button class="btn" style="background:var(--danger); color:#fff; padding:8px 12px; height:auto; font-size:11px;" onclick="window.rejectSale('${d.id}')">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
        
    } catch (error) {
        console.error("Error cargando ventas:", error);
        toast("Error cargando ventas", "error");
    }
}

/**
 * Ver comprobante de pago
 */
export function viewProof(imageUrl) {
    const img = document.getElementById("proofImg");
    if (img) img.src = imageUrl;
    openModal('modalProof');
}

/**
 * Aprobar venta
 */
export async function approveSale(id) {
    // Obtener datos de la venta
    try {
        const saleRef = doc(db, APP_CONFIG.COLLECTIONS.SALES, id);
        const saleSnap = await getDoc(saleRef);
        
        if (!saleSnap.exists()) {
            toast("Venta no encontrada", "error");
            return;
        }
        
        const sale = saleSnap.data();
        
        // Mostrar modal
        document.getElementById('approveSaleId').value = id;
        document.getElementById('approveSaleTotal').textContent = `S/. ${parseFloat(sale.total_price || sale.total || 0).toFixed(2)}`;
        document.getElementById('operationNumber').value = '';
        document.getElementById('modalApproveSale').classList.remove('hidden');
        document.getElementById('operationNumber').focus();
        
    } catch (error) {
        console.error("Error:", error);
        toast("Error al cargar venta", "error");
    }
}

// Confirmar aprobación con número de operación
export async function confirmApproveSale() {
    const id = document.getElementById('approveSaleId').value;
    const operationNumber = document.getElementById('operationNumber').value.trim();
    
    if (!operationNumber) {
        toast("Ingresa el número de operación", "error");
        return;
    }
    
    try {
        await runTransaction(db, async (transaction) => {
            const saleRef = doc(db, APP_CONFIG.COLLECTIONS.SALES, id);
            const saleSnap = await transaction.get(saleRef);
            
            if (!saleSnap.exists()) throw new Error("Venta no encontrada");
            
            const sale = saleSnap.data();
            
            // Actualizar venta con número de operación
            transaction.update(saleRef, {
                status: APP_CONFIG.STATUS.APPROVED,
                operation_number: operationNumber,
                approved_at: new Date().toISOString(),
                approved_by: state.currentUser?.id
            });
            
            // Crear ticket
            const ticketRef = doc(collection(db, APP_CONFIG.COLLECTIONS.TICKETS));
            const code = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            
            transaction.set(ticketRef, {
                company_id: sale.company_id || "",
                event_id: sale.event_id,
                promoter_id: sale.promoter_id,
                promoter_name: sale.promoter_name,
                ticket_id: sale.ticket_id,
                ticket_name: sale.ticket_name,
                client_name: sale.full_name || sale.client_name,
                client_dni: sale.client_dni,
                is_free: false,
                price_paid: sale.total_price,
                qr_token: code,
                status: 'CLAIMED',
                sale_id: id,
                operation_number: operationNumber,
                created_at: new Date().toISOString()
            });
        });
        
        // Cerrar modal y actualizar
        document.getElementById('modalApproveSale').classList.add('hidden');
        document.getElementById(`sale_${id}`)?.remove();
        
        toast("✅ Venta aprobada y ticket generado");
        
        if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
        if (window.loadAllSales) window.loadAllSales(state.activeEventId);
        
    } catch (error) {
        console.error("Error aprobando venta:", error);
        toast("Error al aprobar venta", "error");
    }
}

/**
 * Rechazar venta
 */
export async function rejectSale(id) {
    const confirmed = await customConfirm("¿Rechazar esta venta?");
    if (!confirmed) return;
    
    try {
        await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.SALES, id), {
            status: APP_CONFIG.STATUS.REJECTED,
            rejected_at: new Date().toISOString(),
            rejected_by: state.currentUser?.id
        });
        
        document.getElementById(`sale_${id}`)?.remove();
        toast("Venta rechazada");
        
    } catch (error) {
        console.error("Error rechazando venta:", error);
        toast("Error al rechazar venta", "error");
    }
}

// ==========================================
// 3. ACCESOS (TICKETS GENERADOS)
// ==========================================

/**
 * Cargar accesos del evento
 */
export async function loadAccesses(eid) {
    try {
        const snapshot = await getDocs(
            query(collection(db, APP_CONFIG.COLLECTIONS.TICKETS), where("event_id", "==", eid))
        );
        
        currentAccessData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Llenar dropdown de tipos de entrada
        fillAccessTypeFilter();
        
        // Aplicar filtros
        applyAccessFilters();
        
    } catch (error) {
        console.error("Error cargando accesos:", error);
        toast("Error cargando accesos", "error");
    }
}

/**
 * Llenar filtro de tipos de entrada
 */
function fillAccessTypeFilter() {
    const select = document.getElementById("filterAccessType");
    if (!select) return;
    
    // Obtener tipos únicos
    const types = [...new Set(currentAccessData.map(a => a.ticket_name || 'Sin tipo'))];
    
    select.innerHTML = '<option value="ALL">Todos</option>' +
        types.map(t => `<option value="${t}">${Validator.sanitizeHTML(t)}</option>`).join('');
}

/**
 * Aplicar filtros de accesos
 */
export function applyAccessFilters() {
    const typeFilter = document.getElementById("filterAccessType")?.value || "ALL";
    const statusFilter = document.getElementById("filterAccessStatus")?.value || "ALL";
    const searchQuery = document.getElementById("searchAccess")?.value.toLowerCase() || "";
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    filteredAccessData = currentAccessData.filter(a => {
        // Filtro por tipo
        if (typeFilter !== "ALL" && a.ticket_name !== typeFilter) {
            return false;
        }
        
        // Determinar estado real
        let realStatus = "ACTIVE";
        if (a.status === "CANCELLED") {
            realStatus = "CANCELLED";
        } else if (a.expires_at) {
            const expDate = new Date(a.expires_at);
            if (expDate < today && a.status !== "CLAIMED" && !a.status?.includes("SCANNED")) {
                realStatus = "EXPIRED";
            } else if (a.status === "CLAIMED" || a.status?.includes("SCANNED") || a.client_name) {
                realStatus = "CLAIMED";
            }
        } else if (a.status === "CLAIMED" || a.status?.includes("SCANNED") || a.client_name) {
            realStatus = "CLAIMED";
        }
        
        // Guardar estado real para renderizado
        a._realStatus = realStatus;
        
        // Filtro por estado
        if (statusFilter !== "ALL" && realStatus !== statusFilter) {
            return false;
        }
        
        // Filtro por búsqueda
        if (searchQuery) {
            const searchIn = [
                a.client_name || '',
                a.client_dni || '',
                a.ticket_name || '',
                a.qr_token || '',
                a.code || '',
                a.promoter_name || ''
            ].join(' ').toLowerCase();
            
            if (!searchIn.includes(searchQuery)) {
                return false;
            }
        }
        
        return true;
    });
    
    renderAccessTable();
}

/**
 * Buscar en tabla de accesos
 */
export function filterAccessTable() {
    applyAccessFilters();
}

/**
 * Renderizar tabla de accesos
 */
function renderAccessTable() {
    const tbody = document.querySelector("#tblAccesses tbody");
    if (!tbody) return;
    
    if (filteredAccessData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; color:var(--muted); padding:50px;">
                    <i class="fa-solid fa-ticket" style="font-size:32px; opacity:0.2; display:block; margin-bottom:10px;"></i>
                    No se encontraron accesos
                </td>
            </tr>
        `;
        const pagination = document.getElementById("txtPagination");
        if (pagination) pagination.textContent = "0 registros";
        return;
    }
    
    tbody.innerHTML = filteredAccessData.slice(0, 100).map(a => {
        // Obtener iniciales
        const name = a.client_name || a.claimed_by?.name || 'Invitado';
        const initials = name.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
        
        // Estado y clase
        let statusText, statusClass;
        switch (a._realStatus) {
            case 'CLAIMED':
                statusText = 'Utilizada';
                statusClass = 'status-claimed';
                break;
            case 'EXPIRED':
                statusText = 'Expirada';
                statusClass = 'status-expired';
                break;
            case 'CANCELLED':
                statusText = 'Anulado';
                statusClass = 'status-cancelled';
                break;
            default:
                statusText = 'Sin utilizar';
                statusClass = 'status-active';
        }
        
        const idType = a.id_type || 'DNI';
        const idNumber = a.client_dni || a.claimed_by?.dni || '-';
        
        return `
            <tr data-access-id="${a.id}" style="cursor: pointer;" onclick="window.openDrawer('${a.id}')">
                <td>
                    <div class="table-name-cell">
                        <div class="table-avatar" style="background: ${a.ticket_color || 'var(--primary)'};">${initials}</div>
                        <span style="font-weight: 600; text-transform: uppercase;">${Validator.sanitizeHTML(name)}</span>
                    </div>
                </td>
                <td>
                    <span style="color: var(--muted); font-size: 12px;">${idType}</span><br>
                    <span style="font-weight: 600;">${Validator.sanitizeHTML(idNumber)}</span>
                </td>
                <td>${Validator.sanitizeHTML(a.ticket_name || '-')}</td>
                <td>
                    <div class="action-btns">
                        ${a._realStatus !== 'CANCELLED' ? `
                            <button class="btn-cancel" onclick="window.cancelAccess('${a.id}')" title="Anular entrada">
                                <i class="fa-solid fa-times"></i>
                            </button>
                            <button class="btn-favorite" onclick="window.openDrawer('${a.id}')" title="Ver detalles">
                                <i class="fa-regular fa-heart"></i>
                            </button>
                        ` : `
                            <span class="${statusClass}" style="padding: 8px 12px; font-weight: 600;">${statusText}</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    
    const pagination = document.getElementById("txtPagination");
    if (pagination) {
        pagination.textContent = filteredAccessData.length > 100 
            ? `Mostrando 100 de ${filteredAccessData.length} registros` 
            : `${filteredAccessData.length} registros`;
    }
}

/**
 * Cancelar/Anular un acceso
 */
export async function cancelAccess(id) {
    const confirmed = await customConfirm("¿Estás seguro de anular esta entrada?", "Esta acción no se puede deshacer");
    if (!confirmed) return;
    
    try {
        await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.TICKETS, id), {
            status: 'CANCELLED',
            cancelled_at: new Date().toISOString(),
            cancelled_by: state.currentUser?.id || 'admin'
        });
        
        // Actualizar en memoria
        const access = currentAccessData.find(a => a.id === id);
        if (access) {
            access.status = 'CANCELLED';
            access._realStatus = 'CANCELLED';
        }
        
        applyAccessFilters();
        toast("Entrada anulada correctamente");
        
    } catch (error) {
        console.error("Error anulando entrada:", error);
        toast("Error al anular la entrada", "error");
    }
}

/**
 * Abrir drawer con detalle del acceso
 */
export function openDrawer(id) {
    const access = currentAccessData.find(x => x.id === id);
    if (!access) return;
    
    // Obtener datos del cliente (del nivel raíz o de claimed_by)
    const clientName = access.client_name || access.claimed_by?.name || 'Invitado';
    const clientDni = access.client_dni || access.claimed_by?.dni || '-';
    const clientPhone = access.client_phone || access.claimed_by?.phone || '-';
    const clientEmail = access.client_email || access.claimed_by?.email || '-';
    
    const updateField = (elementId, value) => {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value || '-';
    };
    
    updateField("dr_name", clientName);
    updateField("dr_dni", `DNI ${clientDni}`);
    
    // Estado
    let statusText = 'Sin utilizar';
    if (access.status === 'CANCELLED') {
        statusText = 'Anulado';
    } else if (access.status?.includes('SCANNED')) {
        statusText = 'Escaneado';
    } else if (access.status === 'CLAIMED' || access.client_name || access.claimed_by?.name) {
        statusText = 'Sin utilizar';
    }
    updateField("dr_status", statusText);
    
    updateField("dr_phone", clientPhone);
    updateField("dr_email", clientEmail);
    updateField("dr_code", access.code || access.qr_token || '-');
    updateField("dr_type", access.ticket_name || '-');
    updateField("dr_promoter", access.promoter_name || '-');
    
    // Marca
    const event = state.allEvents?.find(e => e.id === access.event_id);
    if (event) {
        const brand = state.allBrands?.find(b => b.id === event.brand_id);
        updateField("dr_brand", brand?.name || 'Global');
    } else {
        updateField("dr_brand", access.brand_name || '-');
    }
    
    // Avatar
    const avatar = document.getElementById("dr_avatar");
    if (avatar) {
        const initials = clientName.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
        avatar.textContent = initials;
    }
    
    document.getElementById("accessDrawer")?.classList.add("open");
    document.getElementById("drawerOverlay")?.classList.add("open");
}
/**
 * Cerrar drawer
 */
export function closeDrawer() {
    document.getElementById("accessDrawer")?.classList.remove("open");
    document.getElementById("drawerOverlay")?.classList.remove("open");
}