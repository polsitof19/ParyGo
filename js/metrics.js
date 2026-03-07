// js/metrics.js - MÉTRICAS, VENTAS Y ACCESOS
import { db, APP_CONFIG } from './config.js';
import { state, getPromoterById } from './state.js';
import { Validator, toast, openModal, customConfirm, formatDateTime, logger } from './utils.js';
import {
    collection,
    query,
    where,
    getDoc,
    getDocs,
    doc,
    updateDoc,
    addDoc,
    runTransaction
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
            if (t.status === 'SCANNED' || t.status === 'SCANNED_IN') typeStats[typeName].scanned++;
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
            if (t.status === 'SCANNED' || t.status === 'SCANNED_IN') promoStats[pid].scanned++;
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

        // MOBILE: Stats, Chart, Entry List
        if (window.innerWidth <= 768) {
            renderMobileMetrics(tickets, typeStats);
        }

    } catch (error) {
        logger.error("Error cargando métricas:", error);
        toast("Error cargando métricas", "error");
    }
}

/**
 * Renderizar metricas mobile: stats scroll, mini chart, entry list
 */
function renderMobileMetrics(tickets, typeStats) {
    // Totals
    const totalGen = tickets.length;
    const totalClaimed = tickets.filter(t => t.status === 'CLAIMED' || t.client_name).length;
    const totalAvailable = totalGen - totalClaimed;
    const totalScanned = tickets.filter(t => t.status === 'SCANNED' || t.status === 'SCANNED_IN').length;

    // 3B: Stats scroll
    const statsEl = document.getElementById('mobileStatsScroll');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="mobile-stat-card">
                <div class="stat-icon pink"><i class="fa-solid fa-ticket"></i></div>
                <div class="stat-value">${totalGen}</div>
                <div class="stat-label">Generados</div>
            </div>
            <div class="mobile-stat-card">
                <div class="stat-icon green"><i class="fa-solid fa-check"></i></div>
                <div class="stat-value">${totalClaimed}</div>
                <div class="stat-label">Reclamados</div>
            </div>
            <div class="mobile-stat-card">
                <div class="stat-icon blue"><i class="fa-solid fa-box-open"></i></div>
                <div class="stat-value">${totalAvailable}</div>
                <div class="stat-label">Disponibles</div>
            </div>
            <div class="mobile-stat-card">
                <div class="stat-icon yellow"><i class="fa-solid fa-qrcode"></i></div>
                <div class="stat-value">${totalScanned}</div>
                <div class="stat-label">Escaneados</div>
            </div>
        `;
    }

    // 3D: Mini chart - ventas/claims por dia ultimos 7 dias
    const chartEl = document.getElementById('miniChart');
    if (chartEl) {
        const dayCounts = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            dayCounts[d.toISOString().split('T')[0]] = 0;
        }
        tickets.forEach(t => {
            const raw = t.claimed_at || t.created_at || '';
            let date = '';
            if (typeof raw === 'string') date = raw.split('T')[0];
            else if (raw && raw.toDate) date = raw.toDate().toISOString().split('T')[0];
            else if (raw) try { date = new Date(raw).toISOString().split('T')[0]; } catch(e) {}
            if (date in dayCounts) dayCounts[date]++;
        });
        const values = Object.values(dayCounts);
        const max = Math.max(...values, 1);
        const maxIdx = values.indexOf(max);
        chartEl.innerHTML = values.map((v, i) => {
            const h = Math.max(3, (v / max) * 40);
            const isMax = i === maxIdx && v > 0;
            return `<div class="chart-bar${isMax ? ' highlight' : ''}" style="height:${h}px"></div>`;
        }).join('');
    }

    // 3E: Entry list by type
    const listEl = document.getElementById('mobileEntryList');
    if (listEl) {
        const types = Object.entries(typeStats);
        if (types.length === 0) {
            listEl.innerHTML = '';
        } else {
            const colors = ['#f43f5e', '#a855f7', '#3b82f6', '#22c55e', '#eab308', '#06b6d4'];
            listEl.innerHTML = types.map(([name, s], i) => {
                const color = colors[i % colors.length];
                const initial = name.charAt(0).toUpperCase();
                return `
                    <div class="entry-item">
                        <div class="entry-avatar" style="background:${color}20; color:${color}">${Validator.sanitizeHTML(initial)}</div>
                        <div class="entry-info">
                            <div class="name">${Validator.sanitizeHTML(name)}</div>
                            <div class="sub">${s.claimed} reclamados &bull; ${s.scanned} escaneados</div>
                        </div>
                        <div class="entry-value">
                            <div class="number">${s.gen}</div>
                            <div class="label">generados</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// ==========================================
// 1.5 LIQUIDACIÓN DE PROMOTORES
// ==========================================

/**
 * Cargar datos de liquidación por promotor
 */
export async function loadLiquidation(eid) {
    if (!eid) return;

    try {
        // Cargar evento, tickets, promotorCodes, codes, y pagos previos
        const [eventSnap, ticketsSnap, promoCodesSnap, codesSnap, paymentsSnap] = await Promise.all([
            getDoc(doc(db, "events", eid)),
            getDocs(query(collection(db, APP_CONFIG.COLLECTIONS.TICKETS), where("event_id", "==", eid))),
            getDocs(query(collection(db, "promotorCodes"), where("event_id", "==", eid))),
            getDocs(query(collection(db, "codes"), where("event_id", "==", eid))),
            getDocs(query(collection(db, "promotorPayments"), where("event_id", "==", eid)))
        ]);

        if (!eventSnap.exists()) return;
        const event = eventSnap.data();
        const ticketTypes = event.tickets || [];

        // Pagos ya realizados
        const payments = {};
        paymentsSnap.docs.forEach(d => {
            const p = d.data();
            payments[p.promoter_id] = p;
        });

        // Códigos de promotores (nuevo sistema)
        const promoCodes = promoCodesSnap.docs.map(d => d.data());
        // Códigos legacy
        const legacyCodes = codesSnap.docs.map(d => d.data());

        // Agrupar por promotor
        const promoterMap = {};
        const validSt = ['APPROVED', 'CLAIMED', 'SCANNED', 'USED', 'FREE', 'EXHAUSTED'];

        // Procesar promotorCodes
        promoCodes.forEach(c => {
            if (!c.promoter_id || !validSt.includes(c.status)) return;
            if (!promoterMap[c.promoter_id]) {
                promoterMap[c.promoter_id] = { name: c.promoter_name || 'Sin nombre', sold: 0, free: 0, salesCommission: 0, freeCommission: 0, freeExtras: [] };
            }
            const p = promoterMap[c.promoter_id];
            const tk = ticketTypes.find(t => t.id === c.ticket_id || t.name === c.ticket_type);

            if (c.type === 'sell' || c.type === 'sale') {
                p.sold++;
                if (tk?.promotorCommission) {
                    if (tk.promotorCommission.type === 'percentage') {
                        p.salesCommission += (Number(tk.price || c.price || 0) * tk.promotorCommission.value / 100);
                    } else {
                        p.salesCommission += Number(tk.promotorCommission.value || 0);
                    }
                }
            } else {
                p.free++;
                if (tk?.freeCommission?.cash) {
                    p.freeCommission += Number(tk.freeCommission.cash);
                }
                if (tk?.freeCommission?.drinks) {
                    p.freeExtras.push(`${tk.freeCommission.drinks} trago${tk.freeCommission.drinks > 1 ? 's' : ''}`);
                }
                if (tk?.freeCommission?.other) {
                    p.freeExtras.push(tk.freeCommission.other);
                }
            }
        });

        // Procesar codes legacy
        legacyCodes.forEach(c => {
            if (!c.promoter_id || !validSt.includes(c.status)) return;
            if (!promoterMap[c.promoter_id]) {
                promoterMap[c.promoter_id] = { name: c.promoter_name || 'Sin nombre', sold: 0, free: 0, salesCommission: 0, freeCommission: 0, freeExtras: [] };
            }
            const p = promoterMap[c.promoter_id];
            const tk = ticketTypes.find(t => t.id === c.ticket_id || t.name === c.ticket_type);
            p.free++;
            if (tk?.freeCommission?.cash) {
                p.freeCommission += Number(tk.freeCommission.cash);
            }
        });

        // Renderizar tabla
        const tbody = document.querySelector("#tblLiquidation tbody");
        if (!tbody) return;

        const entries = Object.entries(promoterMap);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--muted);">No hay promotores con actividad</td></tr>';
            return;
        }

        let totalRecaudado = 0;
        let totalComisiones = 0;

        tbody.innerHTML = entries.map(([pid, p]) => {
            const total = p.salesCommission + p.freeCommission;
            totalComisiones += total;
            // Recaudado por ventas del promotor (entradas vendidas × precio)
            const ticketsSold = promoCodes.filter(c => c.promoter_id === pid && (c.type === 'sell' || c.type === 'sale') && validSt.includes(c.status));
            const recaudado = ticketsSold.reduce((sum, c) => sum + Number(c.price || 0), 0);
            totalRecaudado += recaudado;

            const payment = payments[pid];
            const isPaid = !!payment;
            const extras = [...new Set(p.freeExtras)].join(', ');
            const freeCommText = p.freeCommission > 0
                ? `S/. ${p.freeCommission.toFixed(2)}${extras ? ` + ${Validator.sanitizeHTML(extras)}` : ''}`
                : (extras || '-');

            return `
                <tr>
                    <td><strong>${Validator.sanitizeHTML(p.name)}</strong></td>
                    <td style="text-align:center">${p.sold}</td>
                    <td style="text-align:center">${p.free}</td>
                    <td style="text-align:center">S/. ${p.salesCommission.toFixed(2)}</td>
                    <td style="text-align:center">${freeCommText}</td>
                    <td style="text-align:center; font-weight:bold">S/. ${total.toFixed(2)}</td>
                    <td style="text-align:center">
                        ${isPaid
                            ? `<span style="color:var(--success)">✅ Pagado ${payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('es-PE') : ''}</span>`
                            : `<button class="btn btn-sm btn-outline btn-liq-pay" data-pid="${Validator.sanitizeHTML(pid)}" data-pname="${Validator.sanitizeHTML(p.name)}" data-amount="${total.toFixed(2)}" data-eid="${Validator.sanitizeHTML(eid)}">Marcar Pagado</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

        // Event delegation para botones de pago
        tbody.querySelectorAll('.btn-liq-pay').forEach(btn => {
            btn.addEventListener('click', () => {
                markPromoterPaid(btn.dataset.pid, btn.dataset.pname, btn.dataset.amount, btn.dataset.eid);
            });
        });

        // Actualizar resumen
        const ganancia = totalRecaudado - totalComisiones;
        const elRecaudado = document.getElementById("liq_total_recaudado");
        const elComisiones = document.getElementById("liq_total_comisiones");
        const elGanancia = document.getElementById("liq_ganancia_neta");
        if (elRecaudado) elRecaudado.textContent = `S/. ${totalRecaudado.toFixed(2)}`;
        if (elComisiones) elComisiones.textContent = `S/. ${totalComisiones.toFixed(2)}`;
        if (elGanancia) elGanancia.textContent = `S/. ${ganancia.toFixed(2)}`;

    } catch (error) {
        logger.error("Error cargando liquidación:", error);
        toast("Error cargando liquidación", "error");
    }
}

/**
 * Marcar promotor como pagado
 */
export async function markPromoterPaid(promoterId, promoterName, amount, eventId) {
    const confirmed = await customConfirm(
        `¿Marcar a ${promoterName} como pagado? Total: S/. ${Number(amount).toFixed(2)}`,
        'Confirmar Liquidación'
    );
    if (!confirmed) return;

    try {
        await addDoc(collection(db, "promotorPayments"), {
            event_id: eventId,
            promoter_id: promoterId,
            promoter_name: promoterName,
            cash_amount: Number(amount),
            paid_at: new Date().toISOString(),
            paid_by: state.currentUser?.email || 'admin'
        });
        toast('Promotor marcado como pagado', 'success');
        loadLiquidation(eventId);
    } catch (e) {
        logger.error("Error marcando pago:", e);
        toast("Error al registrar pago", "error");
    }
}

/**
 * Cambiar tab de métricas
 */
export function switchMetricTab(type) {
    document.querySelectorAll('.metric-view').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.met-tab').forEach(t => t.classList.remove('active'));
    
    const viewMap = { 'gen': 'view_met_gen', 'pro': 'view_met_pro', 'can': 'view_met_can', 'liq': 'view_met_liq' };
    document.getElementById(viewMap[type])?.classList.remove('hidden');
    document.getElementById('mt_' + type)?.classList.add('active');

    if (type === 'liq' && state.activeEventId) {
        loadLiquidation(state.activeEventId);
    }
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
    state.activeEventId = eid;

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
        logger.error("Error cargando ventas:", error);
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
        const clientName = sale.full_name || [sale.client_name, sale.client_lastname].filter(Boolean).join(' ') || 'Sin nombre';
        const initials = clientName.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
        const method = sale.payment_method || 'transfer';
        const methodLabel = method === 'yape' ? 'Yape' : method === 'plin' ? 'Plin' : 'Transferencia';
        const timeAgo = getTimeAgo(sale.created_at);
        const isSelected = selectedSaleIds.includes(sale.id);
        const qty = sale.quantity || 1;
        const ticketName = sale.ticket_name || sale.ticket_type || 'General';
        const total = Number(sale.total_price || sale.total || 0);

        const safeId = Validator.sanitizeHTML(sale.id);
        const checkboxHtml = sale.status === APP_CONFIG.STATUS.PENDING
            ? `<div class="sv2-checkbox ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); window.toggleSaleSelect('${safeId}')"></div>`
            : '';

        // Acciones según estado
        let actionsHtml = '';
        if (sale.status === APP_CONFIG.STATUS.PENDING) {
            actionsHtml = `
                <div class="sv2-actions">
                    ${sale.proof_image || sale.payment_proof ? `<button class="sv2-action-btn view" onclick="window.viewProof('${safeId}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button>` : ''}
                    <button class="sv2-action-btn approve" onclick="window.approveSale('${safeId}')"><i class="fa-solid fa-check"></i><span>Aprobar</span></button>
                    <button class="sv2-action-btn reject" onclick="window.rejectSale('${safeId}')"><i class="fa-solid fa-xmark"></i><span>Rechazar</span></button>
                </div>`;
        } else if (sale.status === APP_CONFIG.STATUS.APPROVED) {
            actionsHtml = sale.proof_image || sale.payment_proof
                ? `<div class="sv2-actions"><button class="sv2-action-btn view" onclick="window.viewProof('${safeId}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button></div>`
                : '';
        } else {
            actionsHtml = sale.proof_image || sale.payment_proof
                ? `<div class="sv2-actions"><button class="sv2-action-btn view" onclick="window.viewProof('${safeId}')"><i class="fa-solid fa-image"></i><span>Comprobante</span></button></div>`
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

        // Obtener datos del CLIENTE (dueño de la cuenta), NO del pagador
        let clientName = sale.full_name || [sale.client_name, sale.client_lastname].filter(Boolean).join(' ');
        let clientDni = sale.client_dni || '';

        // Si no hay nombre del cliente, buscar en colección "clientes"
        if (!clientName && sale.client_id) {
            try {
                const clientDoc = await getDoc(doc(db, "clientes", sale.client_id));
                if (clientDoc.exists()) {
                    const c = clientDoc.data();
                    clientName = [c.name, c.lastname].filter(Boolean).join(' ');
                    clientDni = clientDni || c.doc_number || c.dni || '';
                }
            } catch (e) {
                logger.warn("No se pudo buscar cliente:", e);
            }
        }

        document.getElementById('approveSaleId').value = id;
        document.getElementById('approveTicketInfo').textContent = `${qty}x ${ticketName}`;
        document.getElementById('approveSaleTotal').textContent = `S/. ${total.toFixed(2)}`;
        document.getElementById('approveClientName').textContent = clientName || '---';
        document.getElementById('approveClientDni').textContent = clientDni || '---';
        document.getElementById('modalApproveSale').classList.remove('hidden');

    } catch (error) {
        logger.error("Error:", error);
        toast("Error al cargar venta", "error");
    }
}

// Confirmar aprobación de venta
export async function confirmApproveSale() {
    const id = document.getElementById('approveSaleId').value;
    const btn = document.getElementById('btnConfirmApprove');

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aprobando...'; }

    try {
        // R11 FIX: Pre-generar doc IDs y códigos FUERA de la transacción
        // para evitar duplicados si Firestore hace retry
        const saleRef = doc(db, APP_CONFIG.COLLECTIONS.SALES, id);
        const saleSnap = await getDoc(saleRef);
        if (!saleSnap.exists()) throw new Error("Venta no encontrada");
        const sale = saleSnap.data();
        const quantity = sale.quantity || 1;

        const preGeneratedTickets = [];
        for (let i = 0; i < quantity; i++) {
            const code = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${i}`;
            const ticketRef = doc(db, APP_CONFIG.COLLECTIONS.TICKETS, code);
            preGeneratedTickets.push({ ticketRef, code });
        }

        await runTransaction(db, async (transaction) => {
            // Re-leer dentro de la transacción para consistencia
            const freshSaleSnap = await transaction.get(saleRef);
            if (!freshSaleSnap.exists()) throw new Error("Venta no encontrada");
            const freshSale = freshSaleSnap.data();

            if (freshSale.status === APP_CONFIG.STATUS.APPROVED) {
                throw new Error("Esta venta ya fue aprobada");
            }

            const unitPrice = freshSale.unit_price || (parseFloat(freshSale.total_price || freshSale.total || 0) / quantity);
            const clientName = freshSale.full_name || freshSale.client_name || "";
            const now = new Date().toISOString();

            // Actualizar venta como aprobada
            transaction.update(saleRef, {
                status: APP_CONFIG.STATUS.APPROVED,
                approved_at: now,
                approved_by: state.currentUser?.id
            });

            // Crear UN TICKET POR CADA ENTRADA con IDs pre-generados
            for (const { ticketRef, code } of preGeneratedTickets) {
                const ticketData = {
                    company_id: freshSale.company_id || "",
                    event_id: freshSale.event_id,
                    event_name: freshSale.event_name || "",
                    event_date: freshSale.event_date || "",
                    brand_id: freshSale.brand_id || "",
                    user_id: freshSale.client_id || "",
                    user_name: clientName,
                    user_doc: freshSale.client_dni || "",
                    user_email: freshSale.client_email || "",
                    user_phone: freshSale.client_phone || "",
                    ticket_id: freshSale.ticket_id || "",
                    ticket_name: freshSale.ticket_name || "",
                    ticket_type: freshSale.ticket_name || "",
                    client_name: clientName,
                    client_dni: freshSale.client_dni || "",
                    is_free: false,
                    price_paid: unitPrice,
                    qr_token: code,
                    qr_data: code,
                    code: code,
                    status: 'ACTIVE',
                    claimed_at: now,
                    sale_id: id,
                    channel: 'web',
                    created_at: now
                };

                if (freshSale.promoter_id) {
                    ticketData.promoter_id = freshSale.promoter_id;
                    ticketData.promoter_name = freshSale.promoter_name || "";
                }

                transaction.set(ticketRef, ticketData);
            }
        });

        document.getElementById('modalApproveSale').classList.add('hidden');
        const qty = document.getElementById('approveTicketInfo')?.textContent || '';
        toast(`Venta aprobada: ${qty} generadas`, "success");

        if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
        loadAllSales(state.activeEventId);

    } catch (error) {
        logger.error("Error aprobando venta:", error);
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
        logger.error("Error rechazando venta:", error);
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
        logger.error("Error cargando accesos:", error);
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
            if (expDate < today && a.status !== "CLAIMED" && a.status !== 'SCANNED' && a.status !== 'SCANNED_IN') {
                realStatus = "EXPIRED";
            } else if (a.status === "CLAIMED" || a.status === 'SCANNED' || a.status === 'SCANNED_IN' || a.client_name) {
                realStatus = "CLAIMED";
            }
        } else if (a.status === "CLAIMED" || a.status === 'SCANNED' || a.status === 'SCANNED_IN' || a.client_name) {
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
            <tr data-access-id="${Validator.sanitizeHTML(a.id)}" style="cursor: pointer;" onclick="window.openDrawer('${Validator.sanitizeHTML(a.id)}')">
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
                            <button class="btn-cancel" onclick="window.cancelAccess('${Validator.sanitizeHTML(a.id)}')" title="Anular entrada">
                                <i class="fa-solid fa-times"></i>
                            </button>
                            <button class="btn-favorite" onclick="window.openDrawer('${Validator.sanitizeHTML(a.id)}')" title="Ver detalles">
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
        logger.error("Error anulando entrada:", error);
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
    } else if (access.status === 'SCANNED' || access.status === 'SCANNED_IN') {
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