// logic.js - ORQUESTADOR PRINCIPAL DE PARYGO ADMIN
// Este archivo importa todos los módulos y expone las funciones necesarias al objeto window

// ==========================================
// 1. IMPORTAR MÓDULOS
// ==========================================

import { db } from './config.js';
import { state, resetTemps, getActiveEvent, debugState, cleanupListeners } from './state.js';
import {
    Validator,
    toast,
    openModal,
    closeModals,
    closeModal,
    customConfirm,
    switchView,
    debounce,
    initErrorMonitor,
    logger
} from './utils.js';

import {
    doLogin,
    doLogout,
    checkAuth,
    getCurrentUser,
    registerUser,
    changePassword
} from './auth.js';

import {
    loadEvents,
    renderEvents,
    filterEvents,
    showGlobalEvents,
    backToEvents,
    openEventDetail,
    openEventModal,
    editCurrentEvent,
    handleFileSelect,
    saveEvent,
    deleteEvent,
    showSkeletonLoading,
    hideSkeletonLoading
} from './events.js';

import {
    loadBrandsWithLogos,
    deleteBrand,
    saveBrand,
    clearBrandLogo,
    handleBrandLogoSelect,
    editBrand,
    copyBrandLink,
    toggleContactSection,
    onBrandNameChange,
    openNewBrandModal,
    openMyBrand,
    generateSlug,
    updateBrandHeaderActions,
    editCurrentBrand,
    copyCurrentBrandLink
} from './brands.js';

import {
    renderTicketTable,
    openTicketModal,
    editTicket,
    saveNewTicket,
    deleteTicket,
    toggleUsesField,
    togglePriceMode,
    addPhaseRow,
    removePhaseRow,
    toggleDoorPrice,
    onDateChange,
    togglePromotorSection,
    toggleCommissionType,
    toggleFreeSection,
    toggleFreeField,
    addTicketGoal,
    removeTicketGoal
} from './tickets.js';

import {
    loadPromotersCache,
    selectPromoter,
    fillCodeGen,
    generateCodes,
    openStockModal,
    loadStockTable,
    saveStockAssignment,
    togglePromoterField,
    downloadCodesAsExcel,
    downloadCodesAsTxt,
    loadPendingPayments,
    approvePayment,
    rejectPayment,
    cleanupCodesListeners
} from './codes.js';
import {
    loadEventMetrics,
    switchMetricTab,
    loadEventSales,
    loadAllSales,
    filterSalesByStatus,
    filterSalesByMethod,
    searchSalesFilter,
    toggleSaleSelect,
    clearSalesSelection,
    approveSelectedSales,
    toggleSalesSound,
    viewProof,
    approveSale,
    rejectSale,
    confirmApproveSale,
    loadAccesses,
    applyAccessFilters,
    cancelAccess,
    filterAccessTable,
    openDrawer,
    closeDrawer,
    markPromoterPaid,
    loadLiquidation
} from './metrics.js';

import {
    loadPromotersView,
    openNewPromoterModal,
    editPromoter,
    savePromoter,
    deletePromoter,
    renderPromoterBrandSelector,
    toggleBrandDropdown,
    selectBrand,
    removeBrandChip,
    loadAdminsView,
    openAdminModal,
    editAdmin,
    saveAdmin,
    deleteAdmin,
    renderAdminBrandSelector,
    toggleAdminBrandDropdown,
    selectAdminBrand,
    removeAdminBrandChip,
    loadScannersView,
    openScannerModal,
    saveScanner,
    deleteScanner,
    handlePromoterImage
} from './staff.js';

import {
    loadRewardsView,
    renderRewards,
    deliverReward
} from './rewards.js';

import { consultarDNI, autocompletarDNI } from './dni-api.js';

// ==========================================
// 2. EXPONER FUNCIONES AL WINDOW
// ==========================================

// Utilidades
window.toast = toast;
window.openModal = openModal;
window.closeModals = closeModals;
window.closeModal = closeModal;
window.customConfirm = customConfirm;
window.switchView = switchView;
window.confirmApproveSale = confirmApproveSale;

// Autenticación
window.doLogin = doLogin;
window.doLogout = doLogout;

// Eventos
window.loadEvents = loadEvents;
window.filterByBrand = filterEvents;
window.showGlobalEvents = showGlobalEvents;
window.backToEvents = () => { cleanupCodesListeners(); backToEvents(); };
window.openEventDetail = openEventDetail;
window.openEventModal = openEventModal;
window.editCurrentEvent = editCurrentEvent;
window.handleFileSelect = handleFileSelect;
window.saveEvent = saveEvent;
window.deleteEvent = deleteEvent;

// Marcas
window.loadBrandsWithLogos = loadBrandsWithLogos;
window.deleteBrand = deleteBrand;
window.editBrand = editBrand;
window.openNewBrandModal = openNewBrandModal;
window.openBrandModal = openNewBrandModal; // Alias para compatibilidad
window.saveBrand = saveBrand;
window.clearBrandLogo = clearBrandLogo;
window.handleBrandLogoSelect = handleBrandLogoSelect;
window.copyBrandLink = copyBrandLink;
window.toggleContactSection = toggleContactSection;
window.onBrandNameChange = onBrandNameChange;
window.openMyBrand = openMyBrand;
window.generateSlug = generateSlug;
window.updateBrandHeaderActions = updateBrandHeaderActions;
window.editCurrentBrand = editCurrentBrand;
window.copyCurrentBrandLink = copyCurrentBrandLink;

// Tickets
window.renderTicketTable = renderTicketTable;
window.openTicketModal = openTicketModal;
window.editTicket = editTicket;
window.saveNewTicket = saveNewTicket;
window.deleteTicket = deleteTicket;
window.toggleUsesField = toggleUsesField;
window.togglePriceMode = togglePriceMode;
window.addPhaseRow = addPhaseRow;
window.removePhaseRow = removePhaseRow;
window.toggleDoorPrice = toggleDoorPrice;
window.onDateChange = onDateChange;
window.togglePromotorSection = togglePromotorSection;
window.toggleCommissionType = toggleCommissionType;
window.toggleFreeSection = toggleFreeSection;
window.toggleFreeField = toggleFreeField;
window.addTicketGoal = addTicketGoal;
window.removeTicketGoal = removeTicketGoal;

// Códigos y Stock
window.loadPromotersCache = loadPromotersCache;
window.selectPromoter = selectPromoter;
window.fillCodeGen = fillCodeGen;
window.generateCodes = generateCodes;
window.openStockModal = openStockModal;
window.loadStockTable = loadStockTable;
window.saveStockAssignment = saveStockAssignment;
window.togglePromoterField = togglePromoterField;
window.downloadCodesAsExcel = downloadCodesAsExcel;
window.downloadCodesAsTxt = downloadCodesAsTxt;
window.loadPendingPayments = loadPendingPayments;
window.approvePayment = approvePayment;
window.rejectPayment = rejectPayment;

// Métricas y Ventas
window.loadEventMetrics = loadEventMetrics;
window.switchMetricTab = switchMetricTab;
window.markPromoterPaid = markPromoterPaid;
window.loadLiquidation = loadLiquidation;
window.loadEventSales = loadEventSales;
window.loadAllSales = loadAllSales;
window.filterSalesByStatus = filterSalesByStatus;
window.filterSalesByMethod = filterSalesByMethod;
window.searchSalesFilter = searchSalesFilter;
window.toggleSaleSelect = toggleSaleSelect;
window.clearSalesSelection = clearSalesSelection;
window.approveSelectedSales = approveSelectedSales;
window.toggleSalesSound = toggleSalesSound;
window.viewProof = viewProof;
window.approveSale = approveSale;
window.rejectSale = rejectSale;
window.loadAccesses = loadAccesses;
window.filterAccessTable = filterAccessTable;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.applyAccessFilters = applyAccessFilters;
window.cancelAccess = cancelAccess;

// Staff - Promotores
window.loadPromotersView = loadPromotersView;
window.openNewPromoterModal = openNewPromoterModal;
window.editPromoter = editPromoter;
window.savePromoter = savePromoter;
window.deletePromoter = deletePromoter;
window.renderPromoterBrandSelector = renderPromoterBrandSelector;
window.toggleBrandDropdown = toggleBrandDropdown;
window.selectBrand = selectBrand;
window.removeBrandChip = removeBrandChip;
window.handlePromoterImage = handlePromoterImage;

// Staff - Admins
window.loadAdminsView = loadAdminsView;
window.openAdminModal = openAdminModal;
window.editAdmin = editAdmin;
window.saveAdmin = saveAdmin;
window.deleteAdmin = deleteAdmin;
window.renderAdminBrandSelector = renderAdminBrandSelector;
window.toggleAdminBrandDropdown = toggleAdminBrandDropdown;
window.selectAdminBrand = selectAdminBrand;
window.removeAdminBrandChip = removeAdminBrandChip;

// Staff - Scanners
window.loadScannersView = loadScannersView;
window.openScannerModal = openScannerModal;
window.saveScanner = saveScanner;
window.deleteScanner = deleteScanner;

// Rewards
window.loadRewardsView = loadRewardsView;
window.renderRewards = renderRewards;
window.deliverReward = deliverReward;

// DNI API
window.consultarDNI = consultarDNI;
window.autocompletarDNI = autocompletarDNI;

// Debug
window.debugState = debugState;

// Listeners
window.cleanupListeners = cleanupListeners;

// ==========================================
// 3. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // MEJORA 6: Error monitoring
    initErrorMonitor(db, 'admin');

    // Verificar autenticación
    const user = await checkAuth();
    
    if (user) {
        // Cargar datos iniciales
        await Promise.all([
            loadBrandsWithLogos(),
            loadEvents(),
            loadPromotersCache()
        ]);
        
    }
    
    // Configurar event listeners globales
    setupGlobalEventListeners();
});

// ==========================================
// 4. EVENT LISTENERS GLOBALES
// ==========================================

function setupGlobalEventListeners() {
    
    // LOGIN - Botón y Enter
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        btnLogin.addEventListener('click', doLogin);
    }
    
    const loginInputs = document.querySelectorAll('#adm_email, #adm_pass');
    loginInputs.forEach(input => {
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doLogin();
        });
    });
    
    // LOGOUT
    document.getElementById('btnLogout')?.addEventListener('click', doLogout);
    
    // NAVEGACIÓN SIDEBAR
    document.getElementById('nav_events')?.addEventListener('click', showGlobalEvents);
    document.getElementById('nav_promoters')?.addEventListener('click', loadPromotersView);
    document.getElementById('nav_scanners')?.addEventListener('click', loadScannersView);
    document.getElementById('nav_admins')?.addEventListener('click', loadAdminsView);
    document.getElementById('nav_rewards')?.addEventListener('click', loadRewardsView);
    
    // CREAR EVENTO
    document.getElementById('btnCreateEvent')?.addEventListener('click', openEventModal);
    
    // CREAR MARCA
    document.getElementById('btnCreateBrand')?.addEventListener('click', () => window.openBrandModal());
    
    // STAFF - BOTONES DE CREAR
    document.getElementById('btnNewPromoter')?.addEventListener('click', openNewPromoterModal);
    document.getElementById('btnNewAdmin')?.addEventListener('click', openAdminModal);
    document.getElementById('btnNewScanner')?.addEventListener('click', openScannerModal);
    
    // GUARDAR PROMOTOR
    document.getElementById('btnSavePromoter')?.addEventListener('click', savePromoter);
    
    // GUARDAR ADMIN
    document.getElementById('btnSaveAdminModal')?.addEventListener('click', saveAdmin);
    
    // GUARDAR SCANNER
    document.getElementById('btnSaveScanner')?.addEventListener('click', saveScanner);
    
    // GUARDAR EVENTO
    document.getElementById('btnSaveEvent')?.addEventListener('click', saveEvent);
    
    // GUARDAR MARCA
    document.getElementById('btnSaveBrand')?.addEventListener('click', saveBrand);
    
    // GUARDAR TICKET
    document.getElementById('btnSaveTicket')?.addEventListener('click', saveNewTicket);
    
    // GENERAR CÓDIGOS
    document.getElementById('btnGenCodes')?.addEventListener('click', generateCodes);   
    
    // CREAR TICKET
    document.getElementById('btnNewTicket')?.addEventListener('click', openTicketModal);
    
    // ASIGNAR STOCK
    document.getElementById('btnAddStock')?.addEventListener('click', openStockModal);
    document.getElementById('btnSaveStock')?.addEventListener('click', saveStockAssignment);

    // PAGOS PENDIENTES
    document.getElementById('btnRefreshPendingPayments')?.addEventListener('click', loadPendingPayments);
    
    // EDITAR EVENTO ACTUAL
    document.getElementById('btnEditEvent')?.addEventListener('click', editCurrentEvent);
    
    // ELIMINAR EVENTO
    document.getElementById('btnDeleteEvent')?.addEventListener('click', deleteEvent);
    
    // VOLVER A EVENTOS
    document.getElementById('btnBackEvents')?.addEventListener('click', () => window.backToEvents());
    document.getElementById('mobileBackBtn')?.addEventListener('click', () => window.backToEvents());

    // MOBILE ACTION BUTTONS
    document.getElementById('mobileEditBtn')?.addEventListener('click', editCurrentEvent);
    document.getElementById('mobileDeleteBtn')?.addEventListener('click', deleteEvent);
    document.getElementById('mobileLinkBtn')?.addEventListener('click', () => {
        if (window.copyCurrentBrandLink) window.copyCurrentBrandLink();
    });
    
    // CERRAR MODALES - Clicks en overlay
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });
    
    // CERRAR MODALES - Botones X
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    // TABS DE EVENTO
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            if (!tabId) return;
            
            document.querySelectorAll('.sub-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tabId)?.classList.remove('hidden');
            
            document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Cargar datos según tab
            if (tabId === 'tab_accesses' && state.activeEventId) {
                loadAccesses(state.activeEventId);
            }
            if (tabId === 'tab_sales' && state.activeEventId) {
                loadAllSales(state.activeEventId);
            }
            if (tabId === 'tab_stock' && state.activeEventId) {
                loadStockTable();
            }
            if (tabId === 'tab_pending_payments' && state.activeEventId) {
                loadPendingPayments();
            }
            if (tabId === 'tab_tickets' && state.activeEventId) {
                const event = state.allEvents.find(e => e.id === state.activeEventId);
                if (event) renderTicketTable(event);
            } else if (tabId === 'tab_codegen' && state.activeEventId) {
                const event = state.allEvents.find(e => e.id === state.activeEventId);
                if (event) fillCodeGen(event);
            } else if (tabId === 'tab_metrics' && state.activeEventId) {
                if (window.loadEventMetrics) window.loadEventMetrics(state.activeEventId);
            }
        });
    });
    
    // TABS DE MÉTRICAS
    document.querySelectorAll('.met-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const type = this.id.replace('mt_', '');
            switchMetricTab(type);
        });
    });
    
    // FILTROS DE ACCESOS
    document.querySelectorAll('.filter-tabs .f-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            // Actualizar UI de tabs
            document.querySelectorAll('.filter-tabs .f-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            // Actualizar select oculto y aplicar filtros
            const filterSelect = document.getElementById('filterAccessStatus');
            if (filterSelect) filterSelect.value = filter;
            if (window.applyAccessFilters) window.applyAccessFilters();
        });
    });
    
    // BÚSQUEDA DE ACCESOS
    const searchAccess = document.getElementById('searchAccess');
    if (searchAccess) {
        searchAccess.addEventListener('input', debounce(filterAccessTable, 300));
    }
    
    // CERRAR DRAWER
    document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
    document.getElementById('btnCloseDrawer')?.addEventListener('click', closeDrawer);
    
    // DROPDOWN DE PROMOTORES (para generación de códigos)
    const genSearch = document.getElementById('gen_search');
    const promotersDropdown = document.getElementById('promoters_dropdown');
    
    if (genSearch && promotersDropdown) {
        genSearch.addEventListener('focus', () => promotersDropdown.classList.add('active'));
        // filterPromotersList fue removido - el filtrado se hace directo en codes.js si es necesario
        
        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!genSearch.contains(e.target) && !promotersDropdown.contains(e.target)) {
                promotersDropdown.classList.remove('active');
            }
        });
    }
    
    // TOGGLE PAYMENT FIELDS
    const hasPaymentChk = document.getElementById('ev_has_payment');
    if (hasPaymentChk) {
        hasPaymentChk.addEventListener('change', function() {
            document.getElementById('payment_fields')?.classList.toggle('hidden', !this.checked);
        });
    }
    
    // UPLOAD DE IMAGEN DE EVENTO
    const evFileInput = document.getElementById('ev_file');
    if (evFileInput) {
        evFileInput.addEventListener('change', function() {
            handleFileSelect(this);
        });
    }
    
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        uploadZone.addEventListener('click', () => {
            document.getElementById('ev_file')?.click();
        });
    }
    
    // UPLOAD DE FOTO DE PROMOTOR
    const pPhotoInput = document.getElementById('p_photo');
    if (pPhotoInput) {
        pPhotoInput.addEventListener('change', function() {
            handlePromoterImage(this);
        });
    }
    
    // UPLOAD DE LOGO DE MARCA (ACTUALIZADO)
    const brLogoInput = document.getElementById('br_logo_input');
    if (brLogoInput) {
        brLogoInput.addEventListener('change', function() {
            handleBrandLogoSelect(this);
        });
    }
    
}

// ==========================================
// 5. FUNCIONES AUXILIARES
// ==========================================

/**
 * Limpiar preview de imagen de evento
 */
window.clearEventImage = function() {
    state.tempImgBase64 = null;
    const prev = document.getElementById('ev_prev');
    if (prev) {
        prev.src = '';
        prev.style.display = 'none';
    }
    const prevCont = document.getElementById('ev_prev_container');
    if (prevCont) prevCont.style.display = 'none';
    const zone = document.getElementById('uploadZone');
    if (zone) zone.style.display = 'flex';
};

// ========== MI CUENTA / PERFIL ==========
document.getElementById('btnMyAccount')?.addEventListener('click', () => {
    const user = getCurrentUser();
    if (!user) return;
    
    document.getElementById('profileName').textContent = user.name || user.email;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('currentUserName').textContent = user.name || user.email;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    document.getElementById('modalProfile')?.classList.remove('hidden');
});

document.getElementById('btnChangePassword')?.addEventListener('click', async () => {
    const currentPass = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    
    if (!currentPass || !newPass || !confirmPass) {
        toast('Completa todos los campos', 'error');
        return;
    }
    
    if (newPass.length < 6) {
        toast('Mínimo 6 caracteres', 'error');
        return;
    }
    
    if (newPass !== confirmPass) {
        toast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    const result = await changePassword(currentPass, newPass);
    
    if (result.success) {
        toast('Contraseña actualizada', 'success');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    } else {
        toast('Contraseña actual incorrecta', 'error');
    }
});

document.getElementById('btnLogout')?.addEventListener('click', async () => {
    const confirmed = await customConfirm('¿Estás seguro que deseas cerrar sesión?');
    if (confirmed) {
        doLogout();
    }
});
// Botón confirmar aprobación de venta
document.getElementById('btnConfirmApprove')?.addEventListener('click', () => {
    confirmApproveSale();
});

// ========================================
// MOBILE NAVIGATION
// ========================================

let navigationHistory = ['eventos'];
let handlingPopstate = false;

function mobileGoTo(section) {
    // Guardar en historial
    if (navigationHistory[navigationHistory.length - 1] !== section) {
        navigationHistory.push(section);
    }

    // History API - sincronizar con navegador
    if (!handlingPopstate) {
        history.pushState({ section }, '', `#${section}`);
    }

    // Update active nav item
    document.querySelectorAll('.mobile-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.mobile-nav .nav-item[data-section="${section}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Transition effect
    const mainContent = document.querySelector('.main-content');
    mainContent.classList.add('transitioning');

    setTimeout(() => {
        switch(section) {
            case 'eventos':
                if (typeof showGlobalEvents === 'function') showGlobalEvents();
                else switchView('view_events');
                break;
            case 'marca':
                if (state.isSuperAdmin) {
                    if (typeof loadBrandsWithLogos === 'function') loadBrandsWithLogos();
                    else switchView('view_brands');
                } else {
                    if (typeof openMyBrand === 'function') openMyBrand();
                    else if (typeof loadBrandsWithLogos === 'function') loadBrandsWithLogos();
                    else switchView('view_brands');
                }
                break;
            case 'promo':
                if (typeof loadPromotersView === 'function') loadPromotersView();
                else switchView('view_promoters');
                break;
            case 'seguridad':
                if (typeof loadScannersView === 'function') loadScannersView();
                else switchView('view_scanners');
                break;
            case 'premios':
                if (typeof loadRewardsView === 'function') loadRewardsView();
                else switchView('view_rewards');
                break;
            case 'admins':
                if (typeof loadAdminsView === 'function') loadAdminsView();
                else switchView('view_admins');
                break;
            case 'todas-marcas':
                if (typeof loadBrandsWithLogos === 'function') loadBrandsWithLogos();
                else switchView('view_brands');
                break;
            case 'config':
                break;
        }

        mainContent.classList.remove('transitioning');
    }, 150);
}

function goBack() {
    if (navigationHistory.length > 1) {
        if (history.state?.section) {
            history.back();
        } else {
            navigationHistory.pop();
            const previousSection = navigationHistory[navigationHistory.length - 1];
            const temp = navigationHistory.slice();
            mobileGoTo(previousSection);
            navigationHistory = temp;
        }
    }
}

function openNewEventModal() {
    if (typeof openEventModal === 'function') openEventModal();
}

function openExtrasPanel() {
    document.getElementById('extrasPanel').classList.add('active');
    document.getElementById('extrasOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeExtrasPanel() {
    document.getElementById('extrasPanel').classList.remove('active');
    document.getElementById('extrasOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// History API - botón atrás del navegador
history.replaceState({ section: 'eventos' }, '', '#eventos');
window.addEventListener('popstate', function(event) {
    handlingPopstate = true;
    try {
        const section = event.state?.section || 'eventos';
        // Sincronizar historial interno
        navigationHistory.push(section);
        mobileGoTo(section);
    } finally {
        handlingPopstate = false;
    }
});

function handleLogout() {
    closeExtrasPanel();
    if (typeof doLogout === 'function') doLogout();
}

// ========================================
// MOBILE SEARCH
// ========================================

document.getElementById('mobileSearchBtn')?.addEventListener('click', () => {
    document.getElementById('mobileSearchBar').classList.add('active');
    document.getElementById('mobileSearchInput').focus();
});

document.getElementById('mobileSearchClose')?.addEventListener('click', () => {
    document.getElementById('mobileSearchBar').classList.remove('active');
    document.getElementById('mobileSearchInput').value = '';
    const cards = document.querySelectorAll('#eventsGrid .card');
    cards.forEach(card => { card.style.display = ''; });
});

document.getElementById('mobileSearchInput')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('#eventsGrid .card');
    cards.forEach(card => {
        const title = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
        card.style.display = title.includes(query) ? '' : 'none';
    });
});

// ========================================
// PULL TO REFRESH
// ========================================

let pullTouchStartY = 0;
let isPulling = false;

document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0 && e.touches[0].clientX >= 30) {
        pullTouchStartY = e.touches[0].clientY;
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (pullTouchStartY && window.scrollY === 0) {
        const diff = e.touches[0].clientY - pullTouchStartY;
        if (diff > 80 && !isPulling) {
            isPulling = true;
            document.getElementById('pullRefresh')?.classList.add('active');
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (isPulling) {
        if (typeof loadEvents === 'function') {
            const result = loadEvents();
            if (result && typeof result.then === 'function') {
                result.then(() => {
                    setTimeout(() => {
                        document.getElementById('pullRefresh')?.classList.remove('active');
                        isPulling = false;
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    document.getElementById('pullRefresh')?.classList.remove('active');
                    isPulling = false;
                }, 500);
            }
        } else {
            setTimeout(() => {
                document.getElementById('pullRefresh')?.classList.remove('active');
                isPulling = false;
            }, 1000);
        }
    }
    pullTouchStartY = 0;
});

// ========================================
// SWIPE BACK (iOS style)
// ========================================

let swipeStartX = 0;
let swipeStartY = 0;
let isSwipingBack = false;

document.addEventListener('touchstart', (e) => {
    if (e.touches[0].clientX < 30 && window.innerWidth <= 768) {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        isSwipingBack = true;
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!isSwipingBack) return;
    const diffX = e.touches[0].clientX - swipeStartX;
    const diffY = Math.abs(e.touches[0].clientY - swipeStartY);

    if (diffX > 50 && diffX > diffY) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.transform = `translateX(${Math.min(diffX, 100)}px)`;
            mainContent.style.opacity = 1 - (diffX / 300);
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (!isSwipingBack) return;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        const transform = mainContent.style.transform;
        const translateX = parseInt(transform.replace('translateX(', '').replace('px)', '')) || 0;
        if (translateX > 80) {
            goBack();
        }
        mainContent.style.transform = '';
        mainContent.style.opacity = '';
    }
    isSwipingBack = false;
    swipeStartX = 0;
    swipeStartY = 0;
});

// ========================================
// INIT MOBILE
// ========================================

function initMobile() {
    // Set avatar initial
    const avatarInitial = document.getElementById('mobileAvatarInitial');
    if (avatarInitial && state?.currentUser?.name) {
        avatarInitial.textContent = state.currentUser.name.charAt(0).toUpperCase();
    }

    // Avatar click opens profile
    const avatarBtn = document.getElementById('mobileAvatarBtn');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', () => {
            const profileModal = document.getElementById('profileModal');
            if (profileModal) profileModal.classList.remove('hidden');
        });
    }

    // Notification bell - same as profile for now
    const notifBtn = document.getElementById('mobileNotifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            mobileGoTo('promo');
        });
    }

    // Mostrar opciones de super admin
    if (state.isSuperAdmin) {
        const superExtras = document.getElementById('superAdminExtras');
        if (superExtras) superExtras.style.display = 'block';
    }
}

if (window.innerWidth <= 768) {
    document.addEventListener('DOMContentLoaded', initMobile);
}

/**
 * Actualizar dot de notificación en bottom nav (Promo) y header bell
 */
function updatePromoNotifDot(hasPending) {
    const promoDot = document.getElementById('promoNotifDot');
    const headerDot = document.getElementById('headerNotifDot');
    if (promoDot) promoDot.classList.toggle('visible', hasPending);
    if (headerDot) headerDot.classList.toggle('visible', hasPending);
}

// Expose functions globally
window.mobileGoTo = mobileGoTo;
window.goBack = goBack;
window.openNewEventModal = openNewEventModal;
window.openExtrasPanel = openExtrasPanel;
window.closeExtrasPanel = closeExtrasPanel;
window.handleLogout = handleLogout;
window.initMobile = initMobile;
window.updatePromoNotifDot = updatePromoNotifDot;
// ========== EXPORTAR A EXCEL ==========
// ========== EXPORTAR REPORTE COMPLETO DE MÉTRICAS ==========
function exportMetricsReport() {
    if (typeof XLSX === 'undefined') {
        toast('Error: librería de Excel no cargada. Recarga la página.', 'error');
        return;
    }
    try {
    const wb = XLSX.utils.book_new();
    const fecha = new Date().toISOString().slice(0,10);
    
    // HOJA 1: Resumen General
    const tblGeneral = document.getElementById('tblMetGeneral');
    if (tblGeneral) {
        const wsGeneral = tableToSheet(tblGeneral);
        XLSX.utils.book_append_sheet(wb, wsGeneral, 'Resumen General');
    }
    
    // HOJA 2: Por Promotores
    const tblPromoters = document.getElementById('tblMetPromoters');
    if (tblPromoters) {
        const wsPromoters = tableToSheet(tblPromoters);
        XLSX.utils.book_append_sheet(wb, wsPromoters, 'Por Promotor');
    }
    
    // HOJA 3: Por Canales
    const tblChannels = document.getElementById('tblMetChannels');
    if (tblChannels) {
        const wsChannels = tableToSheet(tblChannels);
        XLSX.utils.book_append_sheet(wb, wsChannels, 'Por Canal');
    }
    
    // HOJA 4: Lista de Accesos
    const tblAccesses = document.getElementById('tblAccesses');
    if (tblAccesses) {
        const wsAccesses = tableToSheet(tblAccesses);
        XLSX.utils.book_append_sheet(wb, wsAccesses, 'Accesos');
    }
    
    // HOJA 5: Ventas
    const tblSales = document.getElementById('tblEventSales');
    if (tblSales) {
        const wsSales = tableToSheet(tblSales);
        XLSX.utils.book_append_sheet(wb, wsSales, 'Ventas');
    }
    
    // HOJA 6: Stock
    const tblStock = document.getElementById('tblStock');
    if (tblStock) {
        const wsStock = tableToSheet(tblStock);
        XLSX.utils.book_append_sheet(wb, wsStock, 'Stock');
    }
    
    // Descargar
    const eventName = document.querySelector('.event-header h2')?.textContent || 'Evento';
    const fileName = `Reporte_${eventName.replace(/[^a-zA-Z0-9]/g, '_')}_${fecha}`;
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    
    toast('Reporte completo descargado', 'success');
    } catch (e) {
        logger.error('Error exportando reporte:', e);
        toast('Error al exportar reporte', 'error');
    }
}

// Función auxiliar para convertir tabla a hoja
function tableToSheet(table) {
    const rows = [];
    const headers = [];
    
    // Headers
    table.querySelectorAll('thead th').forEach(th => {
        const text = th.textContent.trim();
        if (text) headers.push(text);
    });
    rows.push(headers);
    
    // Data
    table.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach((td, i) => {
            if (i < headers.length) {
                row.push(td.textContent.trim());
            }
        });
        if (row.length > 0 && row.some(cell => cell !== '')) {
            rows.push(row);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Ajustar ancho
    ws['!cols'] = headers.map((h, i) => {
        let max = h.length;
        rows.forEach(row => {
            if (row[i] && row[i].length > max) max = row[i].length;
        });
        return { wch: Math.min(max + 2, 50) };
    });
    
    return ws;
}

// Botón exportar métricas
const btnExportMetrics = document.getElementById('btnExportMetrics');
if (btnExportMetrics) {
    btnExportMetrics.addEventListener('click', exportMetricsReport);
}
