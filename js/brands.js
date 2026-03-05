// js/brands.js - MÓDULO DE GESTIÓN DE MARCAS
// ACTUALIZADO: Edición completa, slug automático, link para clientes
import { db, storage, APP_CONFIG } from './config.js';
import { state } from './state.js';
import { Validator, toast, openModal, closeModals, customConfirm, uploadToStorage, logger } from './utils.js';
import { collection, query, getDocs, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, where, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN
// ==========================================
const DOMAIN = "parygo.com"; // Cambiar si usas otro dominio

// ==========================================
// 1. CARGAR Y RENDERIZAR MARCAS
// ==========================================

/**
 * CARGAR MARCAS desde Firebase con filtrado por permisos
 */
export async function loadBrandsWithLogos() { 
    if (!state.currentUser) return;
    
    try {
        const q = query(collection(db, "brands")); 
        const snapshot = await getDocs(q);
        
        let rawBrands = snapshot.docs.map(d => ({id: d.id, ...d.data()})); 

        // ✅ FILTRO DE SEGURIDAD
        const isGodMode = state.isSuperAdmin || 
                          state.currentUser.role === 'super_admin' || 
                          state.currentUser.collection === 'empresa' || 
                          (state.currentUser.role === 'admin' && (!state.currentUser.allowed_brands || state.currentUser.allowed_brands.length === 0));

        if (isGodMode) {
            state.allBrands = rawBrands;
        } else {
            const myPermissions = state.currentUser.allowed_brands || [];
            state.allBrands = rawBrands.filter(b => myPermissions.includes(b.id));
        }

        // Renderizar en sidebar
        renderBrandsSidebar(isGodMode);
        
    } catch (error) {
        console.error("Error cargando marcas:", error);
        toast("Error cargando marcas", "error");
    }
}

/**
 * RENDERIZAR marcas en el sidebar (LIMPIO - solo logo y nombre)
 */
function renderBrandsSidebar(isGodMode) {
    const container = document.getElementById("brandsContainer");
    if (!container) return;
    
    if (state.allBrands.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#666; font-size:12px;">No hay marcas disponibles.</div>';
        return;
    }

    container.innerHTML = state.allBrands.map(b => {
        const iconHtml = b.logo 
            ? `<div class="brand-logo-sidebar-container"><img src="${b.logo}" class="brand-logo-sidebar"></div>` 
            : `<div class="brand-dot" style="background:${b.color || '#f43f5e'}"></div>`;
        
        const activeClass = state.activeBrandId === b.id ? 'active' : '';

        return `
        <div class="nav-item brand-item ${activeClass}" data-brand-id="${b.id}">
            <div style="display:flex; align-items:center; gap:12px; flex:1; overflow:hidden; cursor:pointer;" class="brand-click">
                ${iconHtml}
                <span style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${Validator.sanitizeHTML(b.name)}</span>
            </div>
        </div>`;
    }).join("");

    // Event listeners para seleccionar marca
    container.querySelectorAll('.brand-click').forEach(item => {
        item.addEventListener('click', function() {
            const parent = this.closest('[data-brand-id]');
            const brandId = parent.getAttribute('data-brand-id');
            if(window.filterByBrand) window.filterByBrand(brandId);
        });
    });
}

// ==========================================
// 2. CREAR MARCA
// ==========================================

/**
 * ABRIR MODAL para crear marca nueva
 */
export function openNewBrandModal() {
    // Limpiar formulario
    document.getElementById("br_editing_id").value = "";
    document.getElementById("br_name").value = "";
    document.getElementById("br_slug").value = "";
    document.getElementById("br_color").value = "#f43f5e";
    document.getElementById("br_color_secondary").value = "#a855f7";
    document.getElementById("br_description").value = "";
    if (document.getElementById("br_bg_color")) document.getElementById("br_bg_color").value = "#0a0a0a";
if (document.getElementById("br_text_color")) document.getElementById("br_text_color").value = "#ffffff";
if (document.getElementById("br_card_color")) document.getElementById("br_card_color").value = "#1a1a1a";
    // Limpiar campos de contacto
    document.getElementById("br_phone").value = "";
    document.getElementById("br_email").value = "";
    document.getElementById("br_instagram").value = "";
    document.getElementById("br_facebook").value = "";
    document.getElementById("br_tiktok").value = "";
    
    // Limpiar logo
    clearBrandLogo();
    
    // Actualizar título
    document.getElementById("brandModalTitle").textContent = "Nueva Marca";
    
    // Ocultar link (es nueva)
    document.getElementById("br_link_section")?.classList.add("hidden");
    
    // Preview URL
    document.getElementById("br_preview_url").textContent = "xxx.parygo.com";
    
    // Colapsar contacto
    document.getElementById("br_contact_fields")?.classList.add("hidden");
    const icon = document.getElementById("br_contact_icon");
    if (icon) {
        icon.classList.remove("fa-chevron-up");
        icon.classList.add("fa-chevron-down");
    }
    
    // Limpiar slug guardado
    state.editingBrandSlug = null;
    
    openModal('modalBrand');
}

/**
 * GENERAR SLUG automáticamente del nombre
 */
export function generateSlug(name) {
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s-]/g, '') // Solo letras, números, espacios, guiones
        .replace(/\s+/g, '-') // Espacios a guiones
        .replace(/-+/g, '-') // Múltiples guiones a uno
        .replace(/^-|-$/g, ''); // Quitar guiones al inicio/final
}

/**
 * AUTO-GENERAR slug cuando se escribe el nombre
 */
export function onBrandNameChange() {
    const name = document.getElementById("br_name")?.value || "";
    const slugInput = document.getElementById("br_slug");
    const previewUrl = document.getElementById("br_preview_url");
    
    // Solo auto-generar si estamos creando (no editando) o si el slug está vacío
    const editingId = document.getElementById("br_editing_id")?.value;
    if (!editingId || !slugInput.value) {
        const slug = generateSlug(name);
        slugInput.value = slug;
    }
    
    // Actualizar preview
    if (previewUrl) {
        previewUrl.textContent = `${slugInput.value || 'xxx'}.${DOMAIN}`;
    }
}

/**
 * GUARDAR MARCA (crear o actualizar)
 */
export async function saveBrand() {
    const editingId = document.getElementById("br_editing_id")?.value;
    const name = document.getElementById("br_name")?.value.trim();
    const slug = document.getElementById("br_slug")?.value.trim().toLowerCase();
    const color = document.getElementById("br_color")?.value || "#f43f5e";
    const colorSecondary = document.getElementById("br_color_secondary")?.value || "#a855f7";
    const description = document.getElementById("br_description")?.value.trim() || "";
    
    // Campos opcionales de contacto
    const phone = document.getElementById("br_phone")?.value.trim() || "";
    const email = document.getElementById("br_email")?.value.trim() || "";
    const instagram = document.getElementById("br_instagram")?.value.trim() || "";
    const facebook = document.getElementById("br_facebook")?.value.trim() || "";
    const tiktok = document.getElementById("br_tiktok")?.value.trim() || "";
    
    // Validaciones
    if (!name) return toast("El nombre es obligatorio", "error");
    if (!slug) return toast("El slug es obligatorio", "error");
    if (!/^[a-z0-9-]+$/.test(slug)) return toast("El slug solo puede tener letras minúsculas, números y guiones", "error");
    
    // Verificar que el slug no exista (solo si es nuevo o si cambió)
    const slugChanged = editingId && slug !== state.editingBrandSlug;
    if (!editingId || slugChanged) {
        const slugExists = await checkSlugExists(slug, editingId);
        if (slugExists) {
            return toast("Este slug ya está en uso, elige otro", "error");
        }
    }
    
    try {
        // SEC-5 FIX: Subir logo a Firebase Storage
        const newRef = editingId ? null : doc(collection(db, "brands"));
        const docId = editingId || newRef.id;
        let logoUrl = state.tempBrandLogo || "";
        if (logoUrl && logoUrl.startsWith('data:')) {
            const storagePath = `images/brands/${docId}/${Date.now()}.png`;
            logoUrl = await uploadToStorage(storage, logoUrl, storagePath);
        }

        const brandData = {
            name,
            slug,
            color,
            color_secondary: colorSecondary,
            description,
            logo: logoUrl,
            contact: {
                phone,
                email,
                instagram,
                facebook,
                tiktok
            },
            bg_color: document.getElementById("br_bg_color")?.value || "#0a0a0a",
            text_color: document.getElementById("br_text_color")?.value || "#ffffff",
            card_color: document.getElementById("br_card_color")?.value || "#1a1a1a",
            updated_at: new Date().toISOString()

        };
        
        if (editingId) {
            // ACTUALIZAR
            await updateDoc(doc(db, "brands", editingId), brandData);
            toast("✅ Marca actualizada");
        } else {
            // CREAR con ID pre-generado (para que Storage path coincida)
            brandData.created_at = new Date().toISOString();
            brandData.status = "ACTIVE";
            await setDoc(newRef, brandData);
            toast("✅ Marca creada");
        }
        
        closeModals();
        state.tempBrandLogo = null;
        state.editingBrandSlug = null;
        await loadBrandsWithLogos();
        
    } catch (error) {
        console.error("Error guardando marca:", error);
        toast("Error al guardar marca", "error");
    }
}

/**
 * VERIFICAR si el slug ya existe
 */
async function checkSlugExists(slug, excludeId = null) {
    // R20 FIX: Query filtrado en lugar de cargar todas las marcas
    const q = query(collection(db, "brands"), where("slug", "==", slug), limit(2));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        if (excludeId && docSnap.id === excludeId) continue;
        return true;
    }
    return false;
}

// ==========================================
// 3. EDITAR MARCA
// ==========================================

/**
 * ABRIR MODAL para editar marca
 */
export async function editBrand(brandId, event) {
    if (event) event.stopPropagation();
    
    try {
        const docSnap = await getDoc(doc(db, "brands", brandId));
        if (!docSnap.exists()) {
            return toast("Marca no encontrada", "error");
        }
        
        const brand = { id: docSnap.id, ...docSnap.data() };
        
        // Llenar formulario
        document.getElementById("br_editing_id").value = brand.id;
        document.getElementById("br_name").value = brand.name || "";
        document.getElementById("br_slug").value = brand.slug || "";
        document.getElementById("br_color").value = brand.color || "#f43f5e";
        document.getElementById("br_color_secondary").value = brand.color_secondary || "#a855f7";
        document.getElementById("br_description").value = brand.description || "";
        if (document.getElementById("br_bg_color")) document.getElementById("br_bg_color").value = brand.bg_color || "#0a0a0a";
if (document.getElementById("br_text_color")) document.getElementById("br_text_color").value = brand.text_color || "#ffffff";
if (document.getElementById("br_card_color")) document.getElementById("br_card_color").value = brand.card_color || "#1a1a1a";
        
        // Guardar slug original para comparar
        state.editingBrandSlug = brand.slug;
        
        // ========== CONTROL DE PERMISOS PARA SLUG ==========
        const slugInput = document.getElementById("br_slug");
        const slugGroup = slugInput?.closest('.form-group');
        
        // Verificar si es Super Admin
        const isSuperAdmin = state.isSuperAdmin || 
                            state.currentUser?.role === 'super_admin' || 
                            state.currentUser?.collection === 'empresa';
        
        if (slugInput) {
            if (isSuperAdmin) {
                // Super Admin puede editar
                slugInput.removeAttribute('readonly');
                slugInput.style.opacity = '1';
                slugInput.style.cursor = 'text';
                if (slugGroup) {
                    // Quitar mensaje de restricción si existe
                    const restrictMsg = slugGroup.querySelector('.slug-restricted');
                    if (restrictMsg) restrictMsg.remove();
                }
            } else {
                // Admin de marca NO puede editar
                slugInput.setAttribute('readonly', 'true');
                slugInput.style.opacity = '0.6';
                slugInput.style.cursor = 'not-allowed';
                // Agregar mensaje
                if (slugGroup && !slugGroup.querySelector('.slug-restricted')) {
                    const msg = document.createElement('small');
                    msg.className = 'slug-restricted';
                    msg.style.cssText = 'color: #f59e0b; font-size: 11px; display: flex; align-items: center; gap: 4px; margin-top: 4px;';
                    msg.innerHTML = '<i class="fa-solid fa-lock"></i> Solo el Super Admin puede modificar el slug';
                    slugGroup.appendChild(msg);
                }
            }
        }
        // ===================================================
        
        // Contacto
        const contact = brand.contact || {};
        document.getElementById("br_phone").value = contact.phone || "";
        document.getElementById("br_email").value = contact.email || "";
        document.getElementById("br_instagram").value = contact.instagram || "";
        document.getElementById("br_facebook").value = contact.facebook || "";
        document.getElementById("br_tiktok").value = contact.tiktok || "";
        
        // Logo
        if (brand.logo) {
            state.tempBrandLogo = brand.logo;
            const preview = document.getElementById("br_logo_preview");
            if (preview) {
                const imgEl = preview.querySelector('img');
                if (imgEl) imgEl.src = brand.logo;
                preview.style.display = 'block';
            }
            const zone = document.getElementById("br_upload_zone");
            if (zone) zone.style.display = 'none';
        } else {
            clearBrandLogo();
        }
        
        // Mostrar link
        const linkSection = document.getElementById("br_link_section");
        const linkUrl = document.getElementById("br_link_url");
        if (linkSection && linkUrl && brand.slug) {
            linkUrl.textContent = `${brand.slug}.${DOMAIN}`;
            linkUrl.href = `https://${brand.slug}.${DOMAIN}`;
            linkSection.classList.remove("hidden");
        } else {
            linkSection?.classList.add("hidden");
        }
        
        // Preview URL
        const previewUrl = document.getElementById("br_preview_url");
        if (previewUrl) {
            previewUrl.textContent = `${brand.slug || 'xxx'}.${DOMAIN}`;
        }
        
        // Título
        document.getElementById("brandModalTitle").innerHTML = '<i class="fa-solid fa-store"></i> Editar Marca';
        
        openModal('modalBrand');
        
    } catch (error) {
        console.error("Error cargando marca:", error);
        toast("Error al cargar marca", "error");
    }
}

/**
 * COPIAR LINK al portapapeles
 */
export async function copyBrandLink() {
    const slug = document.getElementById("br_slug")?.value;
    if (!slug) return toast("No hay link disponible", "error");
    
    const url = `https://${slug}.${DOMAIN}`;
    
    try {
        await navigator.clipboard.writeText(url);
        toast("✅ Link copiado: " + url);
    } catch (e) {
        // Fallback para navegadores que no soportan clipboard
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        toast("✅ Link copiado: " + url);
    }
}

// ==========================================
// 4. ELIMINAR MARCA
// ==========================================

/**
 * ELIMINAR MARCA
 */
export async function deleteBrand(brandId, event) {
    if (event) event.stopPropagation();
    
    const confirmed = await customConfirm("¿Eliminar esta marca? Los eventos asociados quedarán sin marca.");
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(db, "brands", brandId));
        toast("✅ Marca eliminada");
        await loadBrandsWithLogos();
        
        if (state.activeBrandId === brandId) {
            if (window.showGlobalEvents) window.showGlobalEvents();
        }
    } catch (error) {
        console.error("Error eliminando marca:", error);
        toast("Error al eliminar marca", "error");
    }
}

// ==========================================
// 5. LOGO
// ==========================================

/**
 * LIMPIAR logo temporal
 */
export function clearBrandLogo() {
    state.tempBrandLogo = null;
    
    const preview = document.getElementById("br_logo_preview");
    if (preview) preview.style.display = 'none';
    
    const zone = document.getElementById("br_upload_zone");
    if (zone) zone.style.display = 'flex';
}

/**
 * MANEJAR selección de logo
 */
export async function handleBrandLogoSelect(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    if (!file.type.match(/image.*/)) return toast("Solo se permiten imágenes", "error");
    if (file.size > APP_CONFIG.LIMITS.MAX_LOGO_SIZE) return toast("Imagen muy grande (máx 2MB)", "error");
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            // Redimensionar si es muy grande
            const canvas = document.createElement('canvas');
            const maxSize = APP_CONFIG.LIMITS.IMAGE_THUMB_WIDTH;
            const scale = maxSize / Math.max(img.width, img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            state.tempBrandLogo = canvas.toDataURL('image/png', 0.8);
            
            // Mostrar preview
            const preview = document.getElementById("br_logo_preview");
            if (preview) {
                const imgEl = preview.querySelector('img');
                if (imgEl) imgEl.src = state.tempBrandLogo;
                preview.style.display = 'block';
            }
            
            const zone = document.getElementById("br_upload_zone");
            if (zone) zone.style.display = 'none';
        };
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 6. TOGGLE CONTACTO (Colapsable)
// ==========================================

/**
 * TOGGLE sección de contacto
 */
export function toggleContactSection() {
    const section = document.getElementById("br_contact_fields");
    const icon = document.getElementById("br_contact_icon");
    
    if (section) {
        const isHidden = section.classList.contains('hidden');
        section.classList.toggle("hidden");
        
        if (icon) {
            if (isHidden) {
                icon.classList.remove("fa-chevron-down");
                icon.classList.add("fa-chevron-up");
            } else {
                icon.classList.remove("fa-chevron-up");
                icon.classList.add("fa-chevron-down");
            }
        }
    }
}

// ==========================================
// 7. MI MARCA (Para admin de marca)
// ==========================================

/**
 * ABRIR "Mi Marca" - Para admin de marca
 */
export async function openMyBrand() {
    // Obtener la marca del admin actual
    const myBrandId = state.currentUser?.companyId || state.currentUser?.allowed_brands?.[0];
    
    if (!myBrandId) {
        return toast("No tienes una marca asignada", "error");
    }
    
    await editBrand(myBrandId, null);
}

// ==========================================
// 8. FUNCIONES PARA HEADER DE EVENTOS
// ==========================================

/**
 * MOSTRAR/OCULTAR botones de marca en el header
 */
export function updateBrandHeaderActions(brandId) {
    const brandActions = document.getElementById("brandActions");
    const brandLinkText = document.getElementById("brandLinkText");
    
    if (!brandActions) return;
    
    if (brandId) {
        // Buscar la marca
        const brand = state.allBrands?.find(b => b.id === brandId);
        if (brand) {
            brandActions.classList.remove("hidden");
            if (brandLinkText) {
                if (brand.slug) {
                    brandLinkText.textContent = `${brand.slug}.parygo.com`;
                } else {
                    brandLinkText.textContent = `Sin link configurado`;
                }
            }
            // Guardar el ID activo
            state.activeBrandId = brandId;
        } else {
            brandActions.classList.add("hidden");
        }
    } else {
        // Vista global - ocultar botones
        brandActions.classList.add("hidden");
    }
}

/**
 * EDITAR la marca actualmente seleccionada
 */
export async function editCurrentBrand() {
    if (!state.activeBrandId) {
        return toast("No hay marca seleccionada", "error");
    }
    await editBrand(state.activeBrandId, null);
}

/**
 * COPIAR el link de la marca actualmente seleccionada
 */
export async function copyCurrentBrandLink() {
    if (!state.activeBrandId) {
        return toast("No hay marca seleccionada", "error");
    }
    
    const brand = state.allBrands?.find(b => b.id === state.activeBrandId);
    if (!brand || !brand.slug) {
        return toast("Esta marca no tiene slug configurado", "error");
    }
    
    const url = `https://${brand.slug}.${DOMAIN}`;
    
    try {
        await navigator.clipboard.writeText(url);
        toast("✅ Link copiado: " + url);
    } catch (e) {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        toast("✅ Link copiado: " + url);
    }
}

// ==========================================
// EXPORTAR PARA WINDOW (se hace en logic.js)
// ==========================================
