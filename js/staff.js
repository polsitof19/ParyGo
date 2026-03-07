// js/staff.js - GESTIÓN DE PERSONAL (PROMOTORES, ADMINS, SCANNERS)
// VERSIÓN CORREGIDA - Soluciona problemas de botones y modales

import { db, storage, APP_CONFIG } from './config.js';
import { state, resetTemps } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, switchView, compressImage, uploadToStorage, logger } from './utils.js';
import { registerUser } from './auth.js';
import { 
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where,
    setDoc,
    limit,
    startAfter,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// VARIABLES DEL MÓDULO
// ==========================================
let tempSelectedBrands = [];  // Marcas seleccionadas para promotor
let tempAdminBrands = [];     // Marcas seleccionadas para admin
let tempPromoterPhoto = null; // Foto del promotor

// SEC-6 FIX: Paginación
let promotersLastDoc = null;
let adminsLastDoc = null;
let scannersLastDoc = null;

// ==========================================
// PROMOTORES
// ==========================================

/**
 * Cargar vista de promotores
 */
export function loadPromotersView() {
    switchView('view_promoters');
    loadPromotersTable();
}

/**
 * Cargar tabla de promotores
 */
async function loadPromotersTable(loadMore = false) {
    const tbody = document.querySelector('#tblPromoters tbody');
    if (!tbody) return;

    if (!loadMore) {
        promotersLastDoc = null;
        tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    }

    try {
        // SEC-6 FIX: Paginación con limit y orderBy
        let q = query(
            collection(db, APP_CONFIG.COLLECTIONS.STAFF),
            where("role", "==", APP_CONFIG.ROLES.PROMOTER),
            orderBy("created_at", "desc"),
            limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
        );
        if (loadMore && promotersLastDoc) {
            q = query(
                collection(db, APP_CONFIG.COLLECTIONS.STAFF),
                where("role", "==", APP_CONFIG.ROLES.PROMOTER),
                orderBy("created_at", "desc"),
                startAfter(promotersLastDoc),
                limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
            );
        }

        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
            promotersLastDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        const promoters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (promoters.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding:40px; text-align:center; color:var(--muted);">
                        <i class="fa-solid fa-users" style="font-size:32px; opacity:0.3; display:block; margin-bottom:10px;"></i>
                        No hay promotores registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        const brands = state.allBrands || [];

        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // Mobile: render as list
            let mobileList = document.getElementById('mobilePromotersList');
            if (!mobileList) {
                const table = document.getElementById('tblPromoters');
                mobileList = document.createElement('div');
                mobileList.id = 'mobilePromotersList';
                mobileList.className = 'mobile-promoters-list';
                table.parentNode.insertBefore(mobileList, table.nextSibling);
            }

            const mobileRows = promoters.map(p => {
                const initial = (p.name || 'P').charAt(0).toUpperCase();
                const fullName = `${Validator.sanitizeHTML(p.name || '')} ${Validator.sanitizeHTML(p.lastname || '')}`.trim();
                const subInfo = p.phone ? Validator.sanitizeHTML(p.phone) : (p.email ? Validator.sanitizeHTML(p.email) : Validator.sanitizeHTML(p.dni || '-'));

                return `
                    <div class="mobile-promoter-item">
                        <div class="promoter-avatar">${initial}</div>
                        <div class="promoter-info">
                            <div class="name">${fullName}</div>
                            <div class="sub">${subInfo}</div>
                        </div>
                        <div class="promoter-actions">
                            <button class="promoter-act" onclick="window.editPromoter('${Validator.sanitizeHTML(p.id)}')" title="Editar">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="promoter-act danger" onclick="window.deletePromoter('${Validator.sanitizeHTML(p.id)}')" title="Eliminar">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            if (loadMore) {
                const loadMoreBtn = mobileList.querySelector('.load-more-mobile');
                if (loadMoreBtn) loadMoreBtn.remove();
                mobileList.insertAdjacentHTML('beforeend', mobileRows);
            } else {
                tbody.innerHTML = '';
                mobileList.innerHTML = mobileRows;
            }

            // Botón "Cargar más"
            const existingMore = mobileList.querySelector('.load-more-mobile');
            if (existingMore) existingMore.remove();
            if (snapshot.docs.length >= APP_CONFIG.LIMITS.ITEMS_PER_PAGE) {
                mobileList.insertAdjacentHTML('beforeend', `
                    <div class="load-more-mobile" style="text-align:center; padding:15px;">
                        <button class="btn btn-ghost" onclick="window.loadMorePromoters()">
                            <i class="fa-solid fa-arrow-down"></i> Cargar más
                        </button>
                    </div>
                `);
            }
        } else {
            // Desktop: render as table rows
            const existing = document.getElementById('mobilePromotersList');
            if (existing) existing.innerHTML = '';

            const newRows = promoters.map(p => {
                const promoterBrands = (p.allowed_brands || p.companies || []).map(brandId => {
                    const brand = brands.find(b => b.id === brandId);
                    return brand ? `<span class="badge badge-blue" style="margin:2px;">${Validator.sanitizeHTML(brand.name)}</span>` : '';
                }).filter(Boolean).join('') || '<span style="color:var(--muted);">Sin marcas</span>';

                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:40px; height:40px; border-radius:50%; background:var(--primary); display:grid; place-items:center; color:#fff; font-weight:700;">
                                    ${(p.name || 'P').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style="font-weight:600;">${Validator.sanitizeHTML(p.name || '')} ${Validator.sanitizeHTML(p.lastname || '')}</div>
                                    <div style="font-size:12px; color:var(--muted);">${Validator.sanitizeHTML(p.phone || '-')}</div>
                                </div>
                            </div>
                        </td>
                        <td>${Validator.sanitizeHTML(p.email || '-')}</td>
                        <td style="font-family:monospace;">${Validator.sanitizeHTML(p.dni || '-')}</td>
                        <td>${promoterBrands}</td>
                        <td>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-icon" onclick="window.editPromoter('${Validator.sanitizeHTML(p.id)}')" title="Editar">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button class="btn-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="window.deletePromoter('${Validator.sanitizeHTML(p.id)}')" title="Eliminar">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if (loadMore) {
                const loadMoreRow = tbody.querySelector('.load-more-row');
                if (loadMoreRow) loadMoreRow.remove();
                tbody.insertAdjacentHTML('beforeend', newRows);
            } else {
                tbody.innerHTML = newRows;
            }

            // Botón "Cargar más"
            const loadMoreRow = tbody.querySelector('.load-more-row');
            if (loadMoreRow) loadMoreRow.remove();
            if (snapshot.docs.length >= APP_CONFIG.LIMITS.ITEMS_PER_PAGE) {
                tbody.insertAdjacentHTML('beforeend', `
                    <tr class="load-more-row">
                        <td colspan="5" style="text-align:center; padding:15px;">
                            <button class="btn btn-ghost" onclick="window.loadMorePromoters()">
                                <i class="fa-solid fa-arrow-down"></i> Cargar más
                            </button>
                        </td>
                    </tr>
                `);
            }
        }

    } catch (error) {
        logger.error('Error cargando promotores:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center; color:var(--danger);">Error al cargar promotores</td></tr>';
    }
}

// Exponer para HTML
window.loadMorePromoters = () => loadPromotersTable(true);

/**
 * Abrir modal para crear nuevo promotor
 */
export function openNewPromoterModal() {
    // Limpiar formulario
    const fields = ['p_editing_id', 'p_dni', 'p_name', 'p_last', 'p_email', 'p_phone', 'p_pass'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Título del modal
    const title = document.getElementById("modalPromoterTitle");
    if (title) title.textContent = "Nuevo Promotor";
    
    // Reset foto
    tempPromoterPhoto = null;
    const preview = document.getElementById("p_preview_img");
    const placeholder = document.getElementById("p_upload_placeholder");
    if (preview) {
        preview.style.display = "none";
        preview.src = "";
    }
    if (placeholder) placeholder.style.display = "flex";
    
    // Limpiar marcas seleccionadas
    tempSelectedBrands = [];
    renderPromoterBrandSelector();
    
    // Mostrar campo de contraseña (solo en creación)
    const passField = document.getElementById("p_pass");
    if (passField) {
        passField.closest('.form-group')?.style.setProperty('display', 'block');
        passField.required = true;
    }
    
    // Abrir modal
    openModal('modalPromoter');
}

/**
 * Editar promotor existente
 */
export async function editPromoter(promoterId) {
    try {
        const docSnap = await getDoc(doc(db, APP_CONFIG.COLLECTIONS.STAFF, promoterId));
        if (!docSnap.exists()) {
            toast("Promotor no encontrado", "error");
            return;
        }
        
        const p = docSnap.data();
        
        // Llenar formulario
        document.getElementById("p_editing_id").value = promoterId;
        document.getElementById("p_dni").value = p.dni || "";
        document.getElementById("p_name").value = p.name || "";
        document.getElementById("p_last").value = p.lastname || "";
        document.getElementById("p_email").value = p.email || "";
        document.getElementById("p_phone").value = p.phone || "";
        document.getElementById("p_pass").value = ""; // No mostrar contraseña
        
        // Título
        document.getElementById("modalPromoterTitle").textContent = "Editar Promotor";
        
        // Ocultar campo de contraseña en edición
        const passField = document.getElementById("p_pass");
        if (passField) {
            passField.closest('.form-group')?.style.setProperty('display', 'none');
            passField.required = false;
        }
        
        // Cargar marcas
        tempSelectedBrands = p.allowed_brands || p.companies || [];
        renderPromoterBrandSelector();
        
        // Foto
        tempPromoterPhoto = p.photo || null;
        const preview = document.getElementById("p_preview_img");
        const placeholder = document.getElementById("p_upload_placeholder");
        
        if (p.photo) {
            if (preview) {
                preview.src = p.photo;
                preview.style.display = "block";
            }
            if (placeholder) placeholder.style.display = "none";
        } else {
            if (preview) preview.style.display = "none";
            if (placeholder) placeholder.style.display = "flex";
        }
        
        // Abrir modal
        openModal('modalPromoter');
        
    } catch (error) {
        logger.error("Error cargando promotor:", error);
        toast("Error al cargar datos del promotor", "error");
    }
}

/**
 * Guardar promotor (crear o actualizar)
 */
export async function savePromoter() {
    const editingId = document.getElementById("p_editing_id")?.value;
    const isEditing = !!editingId;
    
    // Obtener valores
    const name = document.getElementById("p_name")?.value.trim();
    const lastname = document.getElementById("p_last")?.value.trim();
    const dni = document.getElementById("p_dni")?.value.trim();
    const email = document.getElementById("p_email")?.value.trim().toLowerCase();
    const phone = document.getElementById("p_phone")?.value.trim();
    const pass = document.getElementById("p_pass")?.value;
    
    // Validaciones
    if (!Validator.notEmpty(name)) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    
    if (!Validator.dni(dni)) {
        toast("DNI debe tener 8 dígitos", "error");
        return;
    }
    
    if (!Validator.email(email)) {
        toast("Email inválido", "error");
        return;
    }
    
    // Contraseña obligatoria solo en creación
    if (!isEditing && !Validator.password(pass)) {
        toast("La contraseña debe tener al menos 6 caracteres", "error");
        return;
    }
    
    // Botón de guardar
    const btn = document.getElementById("btnSavePromoter");
    const originalText = btn ? btn.innerHTML : "GUARDAR";
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btn.disabled = true;
        }
        
        // SEC-5 FIX: Subir foto a Firebase Storage
        let photoUrl = tempPromoterPhoto || '';
        if (photoUrl && photoUrl.startsWith('data:')) {
            const docId = editingId || 'new_' + Date.now();
            const storagePath = `images/staff/${docId}/${Date.now()}.jpg`;
            photoUrl = await uploadToStorage(storage, photoUrl, storagePath);
        }

        const promoterData = {
            name,
            lastname,
            dni,
            email,
            phone,
            role: APP_CONFIG.ROLES.PROMOTER,
            status: APP_CONFIG.STATUS.ACTIVE,
            allowed_brands: [...tempSelectedBrands],
            companies: [...tempSelectedBrands], // Compatibilidad
            photo: photoUrl,
            updated_at: new Date().toISOString()
        };
        
        if (isEditing) {
            // MODO EDICIÓN - Solo actualizar Firestore
            await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.STAFF, editingId), promoterData);
            toast("✅ Promotor actualizado correctamente");
            
        } else {
            // MODO CREACIÓN - Crear en Firebase Auth + Firestore
            promoterData.created_at = new Date().toISOString();
            
            const result = await registerUser(email, pass, promoterData, APP_CONFIG.COLLECTIONS.STAFF);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            toast("✅ Promotor creado correctamente");
        }
        
        // Cerrar modal y recargar tabla
        closeModals();
        tempSelectedBrands = [];
        tempPromoterPhoto = null;
        await loadPromotersTable();
        
    } catch (error) {
        logger.error("Error guardando promotor:", error);
        toast(error.message || "Error al guardar promotor", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Eliminar promotor
 */
export async function deletePromoter(id) {
    const confirmed = await customConfirm("¿Eliminar este promotor? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, APP_CONFIG.COLLECTIONS.STAFF, id));
        toast("✅ Promotor eliminado");
        loadPromotersTable();
    } catch (error) {
        logger.error("Error eliminando promotor:", error);
        toast("Error al eliminar promotor", "error");
    }
}

/**
 * Renderizar selector de marcas para promotor
 */
export function renderPromoterBrandSelector() {
    const dropdown = document.getElementById("ms_dropdown");
    const chipsArea = document.getElementById("ms_chips_area");
    const placeholder = document.getElementById("ms_placeholder");
    
    if (!dropdown || !chipsArea) return;
    
    const brands = state.allBrands || [];
    
    // Renderizar chips de marcas seleccionadas
    if (tempSelectedBrands.length === 0) {
        chipsArea.innerHTML = '';
        if (placeholder) placeholder.style.display = 'block';
    } else {
        if (placeholder) placeholder.style.display = 'none';
        chipsArea.innerHTML = tempSelectedBrands.map(id => {
            const brand = brands.find(b => b.id === id);
            const name = brand ? brand.name : 'Marca';
            return `
                <div class="brand-chip" style="display:inline-flex; align-items:center; gap:5px; padding:5px 10px; background:var(--primary); color:#fff; border-radius:20px; font-size:12px; margin:2px;">
                    <span>${Validator.sanitizeHTML(name)}</span>
                    <i class="fa-solid fa-times" style="cursor:pointer; opacity:0.8;" onclick="window.removeBrandChip('${Validator.sanitizeHTML(id)}')"></i>
                </div>
            `;
        }).join('');
    }
    
    // Renderizar dropdown
    if (brands.length === 0) {
        dropdown.innerHTML = '<div style="padding:15px; color:#999; font-size:12px; text-align:center;">No hay marcas disponibles</div>';
    } else {
        dropdown.innerHTML = brands.map(b => {
            const isSelected = tempSelectedBrands.includes(b.id);
            return `
                <div class="multi-option ${isSelected ? 'selected' : ''}" 
                     onclick="window.selectBrand('${Validator.sanitizeHTML(b.id)}')"
                     style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid var(--border); ${isSelected ? 'background:rgba(244,63,94,0.1);' : ''}">
                    ${b.logo 
                        ? `<img src="${b.logo}" style="width:24px; height:24px; border-radius:4px; object-fit:cover;">` 
                        : `<div style="width:24px; height:24px; border-radius:4px; background:${b.color || 'var(--primary)'}; display:grid; place-items:center;"><i class="fa-solid fa-tag" style="color:#fff; font-size:10px;"></i></div>`
                    }
                    <span style="font-weight:600;">${Validator.sanitizeHTML(b.name)}</span>
                    ${isSelected ? '<i class="fa-solid fa-check" style="margin-left:auto; color:var(--primary);"></i>' : ''}
                </div>
            `;
        }).join('');
    }
}

export function toggleBrandDropdown() {
    const dd = document.getElementById("ms_dropdown");
    if (dd) dd.classList.toggle("show");
}

export function selectBrand(id) {
    if (!tempSelectedBrands.includes(id)) {
        tempSelectedBrands.push(id);
    } else {
        tempSelectedBrands = tempSelectedBrands.filter(b => b !== id);
    }
    renderPromoterBrandSelector();
}

export function removeBrandChip(id) {
    tempSelectedBrands = tempSelectedBrands.filter(bId => bId !== id);
    renderPromoterBrandSelector();
}

// ==========================================
// ADMINISTRADORES
// ==========================================

/**
 * Cargar vista de administradores
 */
export function loadAdminsView() {
    switchView('view_admins');
    loadAdminsTable();
}

/**
 * Cargar tabla de administradores
 */
async function loadAdminsTable(loadMore = false) {
    const tbody = document.querySelector('#tblAdmins tbody');
    if (!tbody) return;

    if (!loadMore) {
        adminsLastDoc = null;
        tbody.innerHTML = '<tr><td colspan="7" style="padding:40px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    }

    try {
        // SEC-6 FIX: Paginación con limit y orderBy
        let q = query(collection(db, APP_CONFIG.COLLECTIONS.ADMINS), orderBy("created_at", "desc"), limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE));
        if (loadMore && adminsLastDoc) {
            q = query(collection(db, APP_CONFIG.COLLECTIONS.ADMINS), orderBy("created_at", "desc"), startAfter(adminsLastDoc), limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE));
        }
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) adminsLastDoc = snapshot.docs[snapshot.docs.length - 1];
        const admins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (admins.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding:40px; text-align:center; color:var(--muted);">
                        <i class="fa-solid fa-shield-halved" style="font-size:32px; opacity:0.3; display:block; margin-bottom:10px;"></i>
                        No hay administradores registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        const brands = state.allBrands || [];
        
        const newRows = admins.map(a => {
            const adminBrands = (a.allowed_brands || []).map(brandId => {
                const brand = brands.find(b => b.id === brandId);
                return brand ? `<span class="badge badge-blue" style="margin:2px;">${Validator.sanitizeHTML(brand.name)}</span>` : '';
            }).filter(Boolean).join('') || '<span style="color:var(--muted);">Sin marcas</span>';

            const statusBadge = a.status === 'ACTIVE'
                ? '<span class="badge badge-green">Activo</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Inactivo</span>';

            return `
                <tr>
                    <td style="font-weight:600;">${Validator.sanitizeHTML(a.name || '')} ${Validator.sanitizeHTML(a.lastname || '')}</td>
                    <td style="font-family:monospace;">${Validator.sanitizeHTML(a.dni || '-')}</td>
                    <td>${Validator.sanitizeHTML(a.email || '-')}</td>
                    <td>${Validator.sanitizeHTML(a.phone || '-')}</td>
                    <td>${adminBrands}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-icon" onclick="window.editAdmin('${Validator.sanitizeHTML(a.id)}')" title="Editar">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="window.deleteAdmin('${Validator.sanitizeHTML(a.id)}')" title="Eliminar">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (loadMore) {
            const loadMoreRow = tbody.querySelector('.load-more-row');
            if (loadMoreRow) loadMoreRow.remove();
            tbody.insertAdjacentHTML('beforeend', newRows);
        } else {
            tbody.innerHTML = newRows;
        }

        // Botón "Cargar más"
        const existingLoadMore = tbody.querySelector('.load-more-row');
        if (existingLoadMore) existingLoadMore.remove();
        if (snapshot.docs.length >= APP_CONFIG.LIMITS.ITEMS_PER_PAGE) {
            tbody.insertAdjacentHTML('beforeend', `
                <tr class="load-more-row">
                    <td colspan="7" style="text-align:center; padding:15px;">
                        <button class="btn btn-ghost" onclick="window.loadMoreAdmins()">
                            <i class="fa-solid fa-arrow-down"></i> Cargar más
                        </button>
                    </td>
                </tr>
            `);
        }

    } catch (error) {
        logger.error('Error cargando admins:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="padding:40px; text-align:center; color:var(--danger);">Error al cargar administradores</td></tr>';
    }
}

window.loadMoreAdmins = () => loadAdminsTable(true);

/**
 * Abrir modal para crear nuevo admin
 */
export function openAdminModal() {
    // Limpiar formulario
    const fields = ['adm_editing_id', 'adm_name', 'adm_lastname', 'adm_dni', 'adm_modal_email', 'adm_phone', 'adm_password'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Título
    const title = document.getElementById("adminModalTitle");
    if (title) title.textContent = "Nuevo Administrador";
    
    // Mostrar campo de contraseña
    const passField = document.getElementById("adm_password_field");
    if (passField) passField.style.display = 'block';
    
    // Limpiar marcas
    tempAdminBrands = [];
    renderAdminBrandSelector();
    
    // Abrir modal
    openModal('modalAdmin');
}

/**
 * Editar admin existente
 */
export async function editAdmin(adminId) {
    try {
        const docSnap = await getDoc(doc(db, APP_CONFIG.COLLECTIONS.ADMINS, adminId));
        if (!docSnap.exists()) {
            toast("Administrador no encontrado", "error");
            return;
        }
        
        const a = docSnap.data();
        
        // Llenar formulario
        document.getElementById("adm_editing_id").value = adminId;
        document.getElementById("adm_name").value = a.name || "";
        document.getElementById("adm_lastname").value = a.lastname || "";
        document.getElementById("adm_dni").value = a.dni || "";
        document.getElementById("adm_modal_email").value = a.email || "";
        document.getElementById("adm_phone").value = a.phone || "";
        
        // Título
        document.getElementById("adminModalTitle").textContent = "Editar Administrador";
        
        // Ocultar campo de contraseña en edición
        const passField = document.getElementById("adm_password_field");
        if (passField) passField.style.display = 'none';
        
        // Cargar marcas
        tempAdminBrands = a.allowed_brands || [];
        renderAdminBrandSelector();
        
        // Abrir modal
        openModal('modalAdmin');
        
    } catch (error) {
        logger.error("Error cargando admin:", error);
        toast("Error al cargar datos del administrador", "error");
    }
}

/**
 * Guardar admin (crear o actualizar)
 */
export async function saveAdmin() {
    const editingId = document.getElementById("adm_editing_id")?.value;
    const isEditing = !!editingId;
    
    // Obtener valores
    const name = document.getElementById("adm_name")?.value.trim();
    const lastname = document.getElementById("adm_lastname")?.value.trim();
    const dni = document.getElementById("adm_dni")?.value.trim();
    const email = document.getElementById("adm_modal_email")?.value.trim().toLowerCase();
    const phone = document.getElementById("adm_phone")?.value.trim();
    const password = document.getElementById("adm_password")?.value;
    
    // Validaciones
    if (!Validator.notEmpty(name)) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    
    if (!Validator.email(email)) {
        toast("Email inválido", "error");
        return;
    }
    
    if (tempAdminBrands.length === 0) {
        toast("Debes asignar al menos una marca", "warning");
        return;
    }
    
    // Contraseña obligatoria solo en creación
    if (!isEditing && !Validator.password(password)) {
        toast("La contraseña debe tener al menos 6 caracteres", "error");
        return;
    }
    
    // Botón
    const btn = document.getElementById("btnSaveAdminModal");
    const originalText = btn ? btn.innerHTML : "Guardar";
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btn.disabled = true;
        }
        
        const adminData = {
            name,
            lastname,
            dni,
            email,
            phone,
            role: APP_CONFIG.ROLES.ADMIN,
            status: APP_CONFIG.STATUS.ACTIVE,
            allowed_brands: [...tempAdminBrands],
            updated_at: new Date().toISOString()
        };
        
        if (isEditing) {
            // MODO EDICIÓN
            await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.ADMINS, editingId), adminData);
            toast("✅ Administrador actualizado correctamente");
            
        } else {
            // MODO CREACIÓN
            adminData.created_at = new Date().toISOString();
            
            const result = await registerUser(email, password, adminData, APP_CONFIG.COLLECTIONS.ADMINS);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            toast("✅ Administrador creado correctamente");
        }
        
        // Cerrar y recargar
        closeModals();
        tempAdminBrands = [];
        await loadAdminsTable();
        
    } catch (error) {
        logger.error("Error guardando admin:", error);
        toast(error.message || "Error al guardar administrador", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Eliminar admin
 */
export async function deleteAdmin(id) {
    const confirmed = await customConfirm("¿Eliminar este administrador? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, APP_CONFIG.COLLECTIONS.ADMINS, id));
        toast("✅ Administrador eliminado");
        loadAdminsTable();
    } catch (error) {
        logger.error("Error eliminando admin:", error);
        toast("Error al eliminar administrador", "error");
    }
}

/**
 * Renderizar selector de marcas para admin
 */
export function renderAdminBrandSelector() {
    const dropdown = document.getElementById("adminBrandDropdown");
    const chipsArea = document.getElementById("selectedAdminBrands");
    
    if (!dropdown || !chipsArea) return;
    
    const brands = state.allBrands || [];
    
    // Renderizar chips
    if (tempAdminBrands.length === 0) {
        chipsArea.innerHTML = '<span style="color:#999; font-size:12px;">Sin marcas seleccionadas</span>';
    } else {
        chipsArea.innerHTML = tempAdminBrands.map(id => {
            const brand = brands.find(b => b.id === id);
            const name = brand ? brand.name : 'Marca';
            return `
                <div class="brand-chip" style="display:inline-flex; align-items:center; gap:5px; padding:5px 10px; background:var(--primary); color:#fff; border-radius:20px; font-size:12px; margin:2px;">
                    <span>${Validator.sanitizeHTML(name)}</span>
                    <i class="fa-solid fa-times" style="cursor:pointer; opacity:0.8;" onclick="window.removeAdminBrandChip('${Validator.sanitizeHTML(id)}')"></i>
                </div>
            `;
        }).join('');
    }
    
    // Renderizar dropdown
    if (brands.length === 0) {
        dropdown.innerHTML = '<div style="padding:15px; color:#999; font-size:12px; text-align:center;">No hay marcas disponibles</div>';
    } else {
        dropdown.innerHTML = brands.map(b => {
            const isSelected = tempAdminBrands.includes(b.id);
            return `
                <div class="dropdown-item ${isSelected ? 'selected' : ''}" 
                     onclick="window.selectAdminBrand('${Validator.sanitizeHTML(b.id)}')"
                     style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px; ${isSelected ? 'background:rgba(244,63,94,0.1);' : ''}">
                    ${b.logo 
                        ? `<img src="${b.logo}" style="width:24px; height:24px; border-radius:4px; object-fit:cover;">` 
                        : `<i class="fa-solid fa-crown" style="color:var(--primary);"></i>`
                    }
                    <span style="font-weight:600;">${Validator.sanitizeHTML(b.name)}</span>
                    ${isSelected ? '<i class="fa-solid fa-check" style="margin-left:auto; color:var(--primary);"></i>' : ''}
                </div>
            `;
        }).join('');
    }
}

export function toggleAdminBrandDropdown() {
    const dd = document.getElementById("adminBrandDropdown");
    if (dd) {
        const isVisible = dd.style.display === 'block';
        dd.style.display = isVisible ? 'none' : 'block';
    }
}

export function selectAdminBrand(id) {
    if (!tempAdminBrands.includes(id)) {
        tempAdminBrands.push(id);
    } else {
        tempAdminBrands = tempAdminBrands.filter(b => b !== id);
    }
    renderAdminBrandSelector();
}

export function removeAdminBrandChip(id) {
    tempAdminBrands = tempAdminBrands.filter(bId => bId !== id);
    renderAdminBrandSelector();
}

// ==========================================
// SCANNERS
// ==========================================

/**
 * Cargar vista de scanners
 */
export function loadScannersView() {
    switchView('view_scanners');
    loadScannersTable();
}

/**
 * Cargar tabla de scanners
 */
async function loadScannersTable(loadMore = false) {
    const tbody = document.querySelector('#tblScanners tbody');
    if (!tbody) return;

    if (!loadMore) {
        scannersLastDoc = null;
        tbody.innerHTML = '<tr><td colspan="4" style="padding:40px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</td></tr>';
    }

    try {
        // SEC-6 FIX: Paginación con limit y orderBy
        let q = query(
            collection(db, APP_CONFIG.COLLECTIONS.STAFF),
            where("role", "==", APP_CONFIG.ROLES.SCANNER),
            orderBy("created_at", "desc"),
            limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
        );
        if (loadMore && scannersLastDoc) {
            q = query(
                collection(db, APP_CONFIG.COLLECTIONS.STAFF),
                where("role", "==", APP_CONFIG.ROLES.SCANNER),
                orderBy("created_at", "desc"),
                startAfter(scannersLastDoc),
                limit(APP_CONFIG.LIMITS.ITEMS_PER_PAGE)
            );
        }
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) scannersLastDoc = snapshot.docs[snapshot.docs.length - 1];

        const scanners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (scanners.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="padding:40px; text-align:center; color:var(--muted);">
                        <i class="fa-solid fa-qrcode" style="font-size:32px; opacity:0.3; display:block; margin-bottom:10px;"></i>
                        No hay scanners registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        const newRows = scanners.map(s => `
            <tr>
                <td style="font-weight:600;">${Validator.sanitizeHTML(s.name || '-')}</td>
                <td>${Validator.sanitizeHTML(s.email || '-')}</td>
                <td><span style="color:var(--muted);">Todos los eventos</span></td>
                <td>
                    <button class="btn-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="window.deleteScanner('${Validator.sanitizeHTML(s.id)}')" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        if (loadMore) {
            const loadMoreRow = tbody.querySelector('.load-more-row');
            if (loadMoreRow) loadMoreRow.remove();
            tbody.insertAdjacentHTML('beforeend', newRows);
        } else {
            tbody.innerHTML = newRows;
        }

        // Botón "Cargar más"
        const existingLoadMore = tbody.querySelector('.load-more-row');
        if (existingLoadMore) existingLoadMore.remove();
        if (snapshot.docs.length >= APP_CONFIG.LIMITS.ITEMS_PER_PAGE) {
            tbody.insertAdjacentHTML('beforeend', `
                <tr class="load-more-row">
                    <td colspan="4" style="text-align:center; padding:15px;">
                        <button class="btn btn-ghost" onclick="window.loadMoreScanners()">
                            <i class="fa-solid fa-arrow-down"></i> Cargar más
                        </button>
                    </td>
                </tr>
            `);
        }

    } catch (error) {
        logger.error('Error cargando scanners:', error);
        tbody.innerHTML = '<tr><td colspan="4" style="padding:40px; text-align:center; color:var(--danger);">Error al cargar scanners</td></tr>';
    }
}

window.loadMoreScanners = () => loadScannersTable(true);

/**
 * Abrir modal para crear scanner
 */
export function openScannerModal() {
    // Limpiar campos
    const fields = ['s_name', 's_email', 's_pass'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    openModal('modalScanner');
}

/**
 * Guardar scanner
 */
export async function saveScanner() {
    const name = document.getElementById("s_name")?.value.trim();
    const email = document.getElementById("s_email")?.value.trim().toLowerCase();
    const pass = document.getElementById("s_pass")?.value;
    
    // Validaciones
    if (!Validator.notEmpty(name)) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    
    if (!Validator.email(email)) {
        toast("Email inválido", "error");
        return;
    }
    
    if (!Validator.password(pass)) {
        toast("La contraseña debe tener al menos 6 caracteres", "error");
        return;
    }
    
    const btn = document.getElementById("btnSaveScanner");
    const originalText = btn ? btn.innerHTML : "GUARDAR SEGURIDAD";
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btn.disabled = true;
        }
        
        const scannerData = {
            name,
            email,
            role: APP_CONFIG.ROLES.SCANNER,
            status: APP_CONFIG.STATUS.ACTIVE,
            company_id: state.currentUser?.companyId || null,
            allowed_brands: state.currentUser?.allowed_brands || [],
            created_at: new Date().toISOString()
        };
        
        const result = await registerUser(email, pass, scannerData, APP_CONFIG.COLLECTIONS.STAFF);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        toast("✅ Scanner creado correctamente");
        closeModals();
        await loadScannersTable();
        
    } catch (error) {
        logger.error("Error creando scanner:", error);
        toast(error.message || "Error al crear scanner", "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Eliminar scanner
 */
export async function deleteScanner(id) {
    const confirmed = await customConfirm("¿Eliminar este scanner?");
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, APP_CONFIG.COLLECTIONS.STAFF, id));
        toast("✅ Scanner eliminado");
        loadScannersTable();
    } catch (error) {
        logger.error("Error eliminando scanner:", error);
        toast("Error al eliminar scanner", "error");
    }
}

// ==========================================
// MANEJO DE IMÁGENES
// ==========================================

/**
 * Manejar selección de imagen del promotor
 */
export async function handlePromoterImage(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    
    if (!file.type.match(/image.*/)) {
        toast("Solo se permiten imágenes", "error");
        return;
    }
    
    if (file.size > APP_CONFIG.LIMITS.MAX_LOGO_SIZE) {
        toast("Imagen muy grande (máx 2MB)", "error");
        return;
    }
    
    try {
        const base64 = await compressImage(file, 400, 0.8);
        tempPromoterPhoto = base64;
        
        const preview = document.getElementById("p_preview_img");
        const placeholder = document.getElementById("p_upload_placeholder");
        
        if (preview) {
            preview.src = base64;
            preview.style.display = "block";
        }
        if (placeholder) {
            placeholder.style.display = "none";
        }
        
    } catch (error) {
        logger.error("Error procesando imagen:", error);
        toast("Error al procesar imagen", "error");
    }
}

// ==========================================
// EXPORTAR FUNCIONES NECESARIAS PARA WINDOW
// ==========================================
// Estas se conectarán en logic.js
