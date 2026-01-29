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
// 2. VENTAS - SISTEMA COMPLETO CON CARDS
// ==========================================

let allSalesData = [];
let currentSalesFilter = 'PENDING';
let currentMethodFilter = 'all';
let selectedSaleIds = [];
let salesSoundEnabled = true;

/**
 * Cargar TODAS las ventas del evento (todos los estados)
 */
export async function loadAllSales(eid) {
    if (!eid) return;
    window._activeEventId = eid;

    try {
        const snapshot = await getDocs(
            query(
                collection(db, APP_CONFIG.COLLECTIONS.SALES),
                where("event_id", "==", eid)
            )
        );

        allSalesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Actualizar contadores
        const pending = allSalesData.filter(s => s.status === APP_CONFIG.STATUS.PENDING).length;
        const approved = allSalesData.filter(s => s.status === APP_CONFIG.STATUS.APPROVED).length;
        const rejected = allSalesData.filter(s => s.status === APP_CONFIG.STATUS.REJECTED).length;

        const bp = document.getElementById("badgePending");
        const ba = document.getElementById("badgeApproved");
        const br = document.getElementById("badgeRejected");
        const bt = document.getElementById("badgeAllSales");
        if (bp) bp.textContent = pending;
        if (ba) ba.textContent = approved;
        if (br) br.textContent = rejected;
        if (bt) bt.textContent = allSalesData.length;

        // Actualizar resumen
        const approvedSales = allSalesData.filter(s => s.status === APP_CONFIG.STATUS.APPROVED);
        const totalRecaudado = approvedSales.reduce((sum, s) => sum + Number(s.total_price || s.total || 0), 0);
        const trEl = document.getElementById("totalRecaudado");
        const tvEl = document.getElementById("totalVentas");
        const tpEl = document.getElementById("totalPendientes");
        if (trEl) trEl.textContent = `S/. ${totalRecaudado.toFixed(2)}`;
        if (tvEl) tvEl.textContent = approvedSales.length;
        if (tpEl) tpEl.textContent = pending;

        // Actualizar tabla oculta para exportación
        updateSalesExportTable();

        // Renderizar cards
        renderSalesCards();

    } catch (error) {
        console.error("Error cargando ventas:", error);
        toast("Error cargando ventas", "error");
    }
}

/**
 * Alias de retrocompatibilidad
 */
export async function loadEventSales(eid) {
    return loadAllSales(eid);
}

/**
 * Filtrar ventas por estado (local)
 */
export function filterSalesByStatus(status) {
    currentSalesFilter = status;

    // Actualizar botones activos
    document.querySelectorAll('.sales-tab-v2').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });

    renderSalesCards();
}

/**
 * Filtrar ventas por método de pago
 */
export function filterSalesByMethod(method) {
    currentMethodFilter = method;
    document.querySelectorAll('.sales-method-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-method') === method);
    });
    renderSalesCards();
}

/**
 * Búsqueda en ventas
 */
export function searchSalesFilter() {
    renderSalesCards();
}

/**
 * Toggle selección de venta
 */
export function toggleSaleSelect(saleId) {
    const idx = selectedSaleIds.indexOf(saleId);
    if (idx > -1) selectedSaleIds.splice(idx, 1);
    else selectedSaleIds.push(saleId);
    updateBulkUI();
    renderSalesCards();
}

function updateBulkUI() {
    const el = document.getElementById('salesSelectedCount');
    const container = document.getElementById('salesBulkActions');
    if (el) el.textContent = selectedSaleIds.length;
    if (container) container.classList.toggle('visible', selectedSaleIds.length > 0);
}

export function clearSalesSelection() {
    selectedSaleIds = [];
    updateBulkUI();
    renderSalesCards();
}

export async function approveSelectedSales() {
    for (const id of selectedSaleIds) {
        await approveSale(id);
    }
    selectedSaleIds = [];
    updateBulkUI();
}

export function toggleSalesSound() {
    salesSoundEnabled = !salesSoundEnabled;
    const btn = document.getElementById('soundToggle');
    if (btn) {
        btn.classList.toggle('active', salesSoundEnabled);
        btn.innerHTML = salesSoundEnabled
            ? '<i class="fa-solid fa-bell"></i>'
            : '<i class="fa-solid fa-bell-slash"></i>';
    }
}

function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
    return `Hace ${Math.floor(diff / 86400)}d`;
}

/**
 * Renderizar cards de ventas v6.5.0
 */
function renderSalesCards() {
    const container = document.getElementById("salesCardsContainer");
    if (!container) return;

    const searchTerm = (document.getElementById('salesSearchInput')?.value || '').toLowerCase();

    // Filtrar por estado
    let filtered = allSalesData;
    if (currentSalesFilter !== 'ALL') {
        filtered = filtered.filter(s => s.status === currentSalesFilter);
    }

    // Filtrar por método de pago
    if (currentMethodFilter !== 'all') {
        filtered = filtered.filter(s => s.payment_method === currentMethodFilter);
    }

    // Filtrar por búsqueda
    if (searchTerm) {
        filtered = filtered.filter(s => {
            const name = (s.full_name || s.client_name || '').toLowerCase();
            const dni = (s.client_dni || '').toLowerCase();
            return name.includes(searchTerm) || dni.includes(searchTerm);
        });
    }

    // Ordenar: pendientes primero, luego por fecha
    filtered.sort((a, b) => {
        if (a.status === APP_CONFIG.STATUS.PENDING && b.status !== APP_CONFIG.STATUS.PENDING) return -1;
        if (b.status === APP_CONFIG.STATUS.PENDING && a.status !== APP_CONFIG.STATUS.PENDING) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (!filtered.length) {
        const msg = currentSalesFilter === 'PENDING' ? 'No hay ventas pendientes' :
                    currentSalesFilter === 'APPROVED' ? 'No hay ventas aprobadas' :
                    currentSalesFilter === 'REJECTED' ? 'No hay ventas rechazadas' :
                    'No hay ventas registradas';
        container.innerHTML = `
            <div class="sales-empty-state">
                <i class="fa-solid fa-money-bill"></i>
                <p>${msg}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(sale => {
        const clientName = sale.full_name || sale.payer_name || [sale.client_name, sale.client_lastname].filter(Boolean).join(' ') || 'Sin nombre';
        const initials = clientName.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
        const method = sale.payment_method || 'transfer';
        const methodLabel = method === 'yape' ? 'Yape' : method === 'plin' ? 'Plin' : 'Transferencia';
        const timeAgo = getTimeAgo(sale.created_at);
        const isSelected = selectedSaleIds.includes(sale.id);
        const qty = sale.quantity || 1;
        const ticketName = sale.ticket_name || sale.ticket_type || 'General';
        const total = Number(sale.total_price || sale.total || 0);

        const checkboxHtml = sale.status === APP_CONFIG.STATUS.PENDING
            ? `<div class="sv2-checkbox ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); window.toggleSaleSelect('${sale.id}')"></div>`
            : '';

        // Acciones según estado
        let actionsHtml = '';
        if (sale.status === APP_CONFIG.STATUS.PENDING) {
            actionsHtml = `
                <div class="sv2-actions">
                    ${sale.proof_image || sale.payment_proof ? `<button class="sv2-action-btn view" onclick="window.viewProof('${sale.id}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button>` : ''}
                    <button class="sv2-action-btn approve" onclick="window.approveSale('${sale.id}')"><i class="fa-solid fa-check"></i><span>Aprobar</span></button>
                    <button class="sv2-action-btn reject" onclick="window.rejectSale('${sale.id}')"><i class="fa-solid fa-xmark"></i><span>Rechazar</span></button>
                </div>`;
        } else if (sale.status === APP_CONFIG.STATUS.APPROVED) {
            actionsHtml = sale.proof_image || sale.payment_proof
                ? `<div class="sv2-actions"><button class="sv2-action-btn view" onclick="window.viewProof('${sale.id}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button></div>`
                : '';
        } else {
            actionsHtml = sale.proof_image || sale.payment_proof
                ? `<div class="sv2-actions"><button class="sv2-action-btn view" onclick="window.viewProof('${sale.id}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button></div>`
                : '';
        }

        return `
            <div class="sv2-card ${isSelected ? 'selected' : ''}" id="sale_${sale.id}">
                ${checkboxHtml}
                <div class="sv2-avatar ${method}">${initials}</div>
                <div class="sv2-info">
                    <div class="sv2-client-name">${Validator.sanitizeHTML(clientName)}</div>
                    <div class="sv2-client-dni">DNI: ${Validator.sanitizeHTML(sale.client_dni || '---')}</div>
                    <div class="sv2-ticket-line">
                        <span class="sv2-ticket-qty">${qty}x</span>
                        <span class="sv2-ticket-type">${Validator.sanitizeHTML(ticketName)}</span>
                        <span class="sv2-sale-amount">S/. ${total.toFixed(2)}</span>
                    </div>
                    <div class="sv2-payment-line">
                        <span class="sv2-payment-badge ${method}">
                            <i class="fa-solid fa-${method === 'bank' ? 'building-columns' : 'mobile-screen'}"></i>
                            ${methodLabel}
                        </span>
                        <span class="sv2-time">${timeAgo}</span>
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
    }).join('');
}

/**
 * Actualizar tabla oculta para exportación Excel
 */
function updateSalesExportTable() {
    const tbody = document.querySelector("#tblEventSales tbody");
    if (!tbody) return;

    tbody.innerHTML = allSalesData.map(sale => {
        const statusText = sale.status === APP_CONFIG.STATUS.PENDING ? 'Pendiente' :
                          sale.status === APP_CONFIG.STATUS.APPROVED ? 'Aprobada' : 'Rechazada';
        return `
            <tr>
                <td>${Validator.sanitizeHTML(sale.full_name || sale.client_name || '-')}</td>
                <td>${Validator.sanitizeHTML(sale.ticket_name || '-')}</td>
                <td>S/ ${Number(sale.total_price || sale.total || 0).toFixed(2)}</td>
                <td>${statusText}</td>
                <td>${sale.created_at ? new Date(sale.created_at).toLocaleString('es-PE') : '-'}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Ver comprobante de pago (acepta ID de sale o URL directa)
 */
export function viewProof(saleIdOrUrl) {
    let imageUrl = saleIdOrUrl;

    // Si es un ID, buscar en allSalesData
    if (saleIdOrUrl && !saleIdOrUrl.startsWith('data:') && !saleIdOrUrl.startsWith('http')) {
        const sale = allSalesData.find(s => s.id === saleIdOrUrl);
        if (sale) {
            imageUrl = sale.proof_image || sale.payment_proof;
        }
    }

    if (!imageUrl) {
        toast("No hay comprobante disponible", "error");
        return;
    }

    const img = document.getElementById("proofImg");
    if (img) img.src = imageUrl;
    openModal('modalProof');
}

/**
 * Aprobar venta
 */
export async function approveSale(id) {
    try {
        const saleRef = doc(db, APP_CONFIG.COLLECTIONS.SALES, id);
        const saleSnap = await getDoc(saleRef);

        if (!saleSnap.exists()) {
            toast("Venta no encontrada", "error");
            return;
        }

        const sale = saleSnap.data();
        const qty = sale.quantity || 1;
        const ticketName = sale.ticket_name || sale.ticket_type || 'General';
        const total = parseFloat(sale.total_price || sale.total || 0);
        const clientName = sale.full_name || sale.payer_name || [sale.client_name, sale.client_lastname].filter(Boolean).join(' ') || '---';
        const clientDni = sale.client_dni || '---';

        document.getElementById('approveSaleId').value = id;
        document.getElementById('approveTicketInfo').textContent = `${qty}x ${ticketName}`;
        document.getElementById('approveSaleTotal').textContent = `S/. ${total.toFixed(2)}`;
        document.getElementById('approveClientName').textContent = clientName;
        document.getElementById('approveClientDni').textContent = clientDni;
        document.getElementById('modalApproveSale').classList.remove('hidden');

    } catch (error) {
        console.error("Error:", error);
        toast("Error al cargar venta", "error");
    }
}

// Confirmar aprobación con número de operación
export async function confirmApproveSale() {
    const id = document.getElementById('approveSaleId').value;
    const btn = document.getElementById('btnConfirmApprove');

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aprobando...'; }

    try {
        await runTransaction(db, async (transaction) => {
            const saleRef = doc(db, APP_CONFIG.COLLECTIONS.SALES, id);
            const saleSnap = await transaction.get(saleRef);

            if (!saleSnap.exists()) throw new Error("Venta no encontrada");

            const sale = saleSnap.data();

            // Actualizar venta
            transaction.update(saleRef, {
                status: APP_CONFIG.STATUS.APPROVED,
                approved_at: new Date().toISOString(),
                approved_by: state.currentUser?.id
            });

            // Crear ticket
            const ticketRef = doc(collection(db, APP_CONFIG.COLLECTIONS.TICKETS));
            const code = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

            const ticketData = {
                company_id: sale.company_id || "",
                event_id: sale.event_id,
                event_name: sale.event_name || "",
                event_date: sale.event_date || "",
                brand_id: sale.brand_id || "",
                user_id: sale.client_id || "",
                user_name: sale.full_name || sale.client_name || "",
                user_doc: sale.client_dni || "",
                user_email: sale.client_email || "",
                user_phone: sale.client_phone || "",
                ticket_id: sale.ticket_id || "",
                ticket_name: sale.ticket_name || "",
                ticket_type: sale.ticket_name || "",
                client_name: sale.full_name || sale.client_name || "",
                client_dni: sale.client_dni || "",
                is_free: false,
                price_paid: sale.total_price || sale.total || 0,
                qr_token: code,
                qr_data: code,
                code: code,
                status: 'ACTIVE',
                sale_id: id,
                created_at: new Date().toISOString()
            };

            if (sale.promoter_id) {
                ticketData.promoter_id = sale.promoter_id;
                ticketData.promoter_name = sale.promoter_name || "";
            }

            transaction.set(ticketRef, ticketData);
        });

        document.getElementById('modalApproveSale').classList.add('hidden');
        toast("Venta aprobada y ticket generado", "success");

        if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
        loadAllSales(state.activeEventId);

    } catch (error) {
        console.error("Error aprobando venta:", error);
        toast("Error al aprobar venta", "error");
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar'; }
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
        
        toast("Venta rechazada");
        loadAllSales(state.activeEventId);
        
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