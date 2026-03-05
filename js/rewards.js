// js/rewards.js - GESTIÓN DE RECOMPENSAS
import { db, APP_CONFIG } from './config.js';
import { Validator, toast, switchView, logger } from './utils.js';
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. VISTA Y RENDERIZADO DE RECOMPENSAS
// ==========================================

/**
 * Cargar vista de recompensas
 */
export function loadRewardsView() {
    switchView('view_rewards');
    renderRewards();
}

/**
 * Renderizar tabla de recompensas
 */
export async function renderRewards() {
    try {
        const snapshot = await getDocs(collection(db, APP_CONFIG.COLLECTIONS.REWARDS));
        
        const tbody = document.querySelector("#tblRewards tbody");
        if (!tbody) return;
        
        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; color:var(--muted); padding:50px;">
                        <i class="fa-solid fa-gift" style="font-size:40px; opacity:0.2; display:block; margin-bottom:15px;"></i>
                        No hay premios registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = snapshot.docs.map(d => {
            const data = d.data();
            const statusBadge = data.status === APP_CONFIG.STATUS.DELIVERED 
                ? '<span class="badge badge-green">Entregado</span>' 
                : '<span class="badge badge-blue">Pendiente</span>';
            
            const deliverBtn = data.status !== APP_CONFIG.STATUS.DELIVERED 
                ? `<button class="btn" style="background:var(--success); color:#fff; padding:8px 16px; height:auto; font-size:12px;" onclick="window.deliverReward('${Validator.sanitizeHTML(d.id)}')">
                       <i class="fa-solid fa-check"></i> Entregar
                   </button>` 
                : '<span style="color:var(--success);"><i class="fa-solid fa-check-circle"></i> Entregado</span>';
            
            return `
                <tr>
                    <td><strong>${Validator.sanitizeHTML(data.promoter_name || '-')}</strong></td>
                    <td>${Validator.sanitizeHTML(data.reward_title || '-')}</td>
                    <td>${statusBadge}</td>
                    <td>${deliverBtn}</td>
                </tr>
            `;
        }).join("");
        
    } catch (error) {
        logger.error("Error cargando premios:", error);
        toast("Error cargando premios", "error");
    }
}

// ==========================================
// 2. GESTIÓN DE RECOMPENSAS
// ==========================================

/**
 * Marcar recompensa como entregada
 */
export async function deliverReward(id) {
    try {
        await updateDoc(doc(db, APP_CONFIG.COLLECTIONS.REWARDS, id), {
            status: APP_CONFIG.STATUS.DELIVERED,
            delivered_at: new Date().toISOString()
        });
        
        toast("✅ Premio marcado como entregado");
        renderRewards();
        
    } catch (error) {
        logger.error("Error actualizando premio:", error);
        toast("Error al actualizar premio", "error");
    }
}
