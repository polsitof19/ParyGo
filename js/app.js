// ========================================
// PARYGO - Aplicación Principal
// ========================================

const App = {
    init() {
        // Inicializar datos
        initializeData();
        
        // Inicializar módulos
        Brands.init();
        Events.init();
        Promoters.init();
        Admins.init();
        Codes.init();
        Access.init();
        Scanner.init();
        Metrics.init();
        
        // Navegación
        this.initNavigation();
        
        // Modales
        this.initModals();
        
        // Dashboard
        this.updateDashboard();
        
    },
    
    initNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view) {
                    switchView(view);
                    
                    // Iniciar scanner si es la vista de scanner
                    if (view === 'scanner') {
                        Scanner.startScanner();
                    } else {
                        Scanner.stopScanner();
                    }
                }
            });
        });
    },
    
    initModals() {
        // Cerrar modal al hacer click fuera
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });
        
        // Cerrar con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllModals();
            }
        });
    },
    
    updateDashboard() {
        const brands = Brands.getAll();
        const events = Events.getAll();
        const entries = Storage.get('entries') || [];
        
        const revenue = entries
            .filter(e => e.status !== 'cancelled')
            .reduce((sum, e) => sum + (parseFloat(e.price) || 0), 0);
        
        document.getElementById('statBrands').textContent = brands.length;
        document.getElementById('statEvents').textContent = events.length;
        document.getElementById('statTickets').textContent = entries.length;
        document.getElementById('statRevenue').textContent = formatCurrency(revenue);
        
        // Eventos recientes
        const recentEvents = events.slice(-5).reverse();
        const recentEventsContainer = document.getElementById('recentEvents');
        
        if (recentEvents.length) {
            recentEventsContainer.innerHTML = recentEvents.map(e => {
                const brand = Brands.getById(e.brandId);
                return `
                    <div class="recent-item" onclick="Events.showDetail('${e.id}')" style="cursor: pointer;">
                        <div class="recent-item-image">
                            ${e.flyer ? `<img src="${e.flyer}" alt="">` : '<i class="fas fa-calendar-alt"></i>'}
                        </div>
                        <div class="recent-item-info">
                            <h4>${e.name}</h4>
                            <p>${brand?.name || ''} - ${formatDate(e.date)}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Entradas recientes
        const recentEntries = entries.slice(-5).reverse();
        const recentEntriesContainer = document.getElementById('recentEntries');
        
        if (recentEntries.length) {
            recentEntriesContainer.innerHTML = recentEntries.map(entry => {
                const event = Events.getById(entry.eventId);
                const statusColors = { pending: 'warning', paid: 'blue', redeemed: 'success', cancelled: 'danger' };
                return `
                    <div class="recent-item">
                        <div class="recent-item-image" style="background: var(--${statusColors[entry.status] || 'warning'}-soft);">
                            <i class="fas fa-ticket-alt" style="color: var(--${statusColors[entry.status] || 'warning'});"></i>
                        </div>
                        <div class="recent-item-info">
                            <h4>${entry.code}</h4>
                            <p>${entry.clientName || 'Sin cliente'} - ${event?.name || ''}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
};

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    
    // Verificar si hay sesión activa
    if (Auth.init()) {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        App.init();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
    }
});
