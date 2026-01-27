// ========================================
// PARYGO - Gestión de Entradas/Accesos
// ========================================

const Access = {
    currentFilter: '',
    
    getAll() {
        return Storage.get('entries') || [];
    },
    
    getById(id) {
        return this.getAll().find(e => e.id === id);
    },
    
    getByCode(code) {
        return this.getAll().find(e => e.code === code);
    },
    
    update(id, data) {
        const entries = this.getAll();
        const index = entries.findIndex(e => e.id === id);
        if (index !== -1) {
            entries[index] = { ...entries[index], ...data };
            Storage.set('entries', entries);
            return entries[index];
        }
        return null;
    },
    
    render() {
        const container = document.getElementById('accessTable');
        let entries = this.getAll();
        
        // Filtros
        const search = document.getElementById('searchAccess')?.value?.toLowerCase() || '';
        const eventFilter = document.getElementById('filterAccessEvent')?.value || '';
        
        if (search) {
            entries = entries.filter(e => 
                e.code?.toLowerCase().includes(search) ||
                e.clientName?.toLowerCase().includes(search) ||
                e.clientDni?.includes(search)
            );
        }
        
        if (eventFilter) {
            entries = entries.filter(e => e.eventId === eventFilter);
        }
        
        if (this.currentFilter) {
            entries = entries.filter(e => e.status === this.currentFilter);
        }
        
        // Ordenar por fecha (más recientes primero)
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (!entries.length) {
            container.innerHTML = '<tr><td colspan="7" class="empty-state">No hay entradas</td></tr>';
            return;
        }
        
        container.innerHTML = entries.map(entry => {
            const event = Events.getById(entry.eventId);
            const promoter = Promoters.getById(entry.promoterId);
            const statusBadge = {
                pending: '<span class="badge badge-warning"><i class="fas fa-clock"></i> Pendiente</span>',
                paid: '<span class="badge badge-blue"><i class="fas fa-check"></i> Pagado</span>',
                redeemed: '<span class="badge badge-success"><i class="fas fa-check-double"></i> Canjeado</span>',
                cancelled: '<span class="badge badge-danger"><i class="fas fa-times"></i> Cancelado</span>'
            };
            
            return `
                <tr>
                    <td><strong style="font-family: monospace; letter-spacing: 1px;">${entry.code}</strong></td>
                    <td>
                        <div>${entry.clientName || '-'}</div>
                        <small style="color: var(--text-muted);">${entry.clientDni || ''}</small>
                    </td>
                    <td>${event?.name || '-'}</td>
                    <td>${entry.ticketType || '-'}</td>
                    <td>${promoter?.name || 'Directo'}</td>
                    <td>${statusBadge[entry.status] || statusBadge.pending}</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-ghost btn-sm btn-icon" onclick="Access.showDetail('${entry.id}')" title="Ver detalle">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${entry.status === 'pending' ? `
                                <button class="btn btn-success btn-sm btn-icon" onclick="Access.markAsPaid('${entry.id}')" title="Marcar pagado">
                                    <i class="fas fa-check"></i>
                                </button>
                            ` : ''}
                            ${entry.status === 'paid' ? `
                                <button class="btn btn-primary btn-sm btn-icon" onclick="Access.markAsRedeemed('${entry.id}')" title="Canjear">
                                    <i class="fas fa-check-double"></i>
                                </button>
                            ` : ''}
                            ${entry.proofImage ? `
                                <button class="btn btn-ghost btn-sm btn-icon" onclick="Access.showProof('${entry.id}')" title="Ver comprobante">
                                    <i class="fas fa-receipt"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },
    
    showDetail(id) {
        const entry = this.getById(id);
        if (!entry) return;
        
        const event = Events.getById(entry.eventId);
        const promoter = Promoters.getById(entry.promoterId);
        const brand = Brands.getById(event?.brandId);
        
        const statusText = { pending: 'Pendiente', paid: 'Pagado', redeemed: 'Canjeado', cancelled: 'Cancelado' };
        
        document.getElementById('accessDetailContent').innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${QRService.generateURL(entry.code, 200)}" alt="QR">
                <h2 style="margin-top: 12px; font-family: monospace; letter-spacing: 3px;">${entry.code}</h2>
            </div>
            
            <div class="proof-info">
                <p><span>Estado</span><span class="badge badge-${entry.status === 'redeemed' ? 'success' : entry.status === 'paid' ? 'blue' : 'warning'}">${statusText[entry.status]}</span></p>
                <p><span>Evento</span><strong>${event?.name || '-'}</strong></p>
                <p><span>Tipo</span><span>${entry.ticketType}</span></p>
                <p><span>Precio</span><span>${formatCurrency(entry.price)}</span></p>
                <p><span>Cliente</span><span>${entry.clientName || '-'}</span></p>
                <p><span>DNI</span><span>${entry.clientDni || '-'}</span></p>
                <p><span>Teléfono</span><span>${entry.clientPhone || '-'}</span></p>
                <p><span>Email</span><span>${entry.clientEmail || '-'}</span></p>
                <p><span>Promotor</span><span>${promoter?.name || 'Directo'}</span></p>
                ${entry.operationNumber ? `<p><span>Nº Operación</span><span>${entry.operationNumber}</span></p>` : ''}
                <p><span>Creado</span><span>${formatDate(entry.createdAt)}</span></p>
                ${entry.paidAt ? `<p><span>Pagado</span><span>${formatDate(entry.paidAt)}</span></p>` : ''}
                ${entry.redeemedAt ? `<p><span>Canjeado</span><span>${formatDate(entry.redeemedAt)}</span></p>` : ''}
            </div>
            
            <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: center;">
                ${entry.clientPhone ? `<button class="btn btn-success" onclick="Codes.sendWhatsApp('${entry.id}')"><i class="fab fa-whatsapp"></i> WhatsApp</button>` : ''}
                <button class="btn btn-ghost" onclick="Codes.copy('${entry.code}')"><i class="fas fa-copy"></i> Copiar</button>
            </div>
        `;
        
        openModal('modalAccess');
    },
    
    showProof(id) {
        const entry = this.getById(id);
        if (!entry?.proofImage) return;
        
        document.getElementById('proofContent').innerHTML = `
            <img src="${entry.proofImage}" alt="Comprobante" style="max-width: 100%; border-radius: 8px;">
            <div class="proof-info" style="margin-top: 16px;">
                <p><span>Método de Pago</span><span>${entry.paymentMethod || '-'}</span></p>
                <p><span>Nº Operación</span><span>${entry.operationNumber || '-'}</span></p>
                <p><span>Fecha de Pago</span><span>${entry.paidAt ? formatDate(entry.paidAt) : '-'}</span></p>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: center;">
                <button class="btn btn-success" onclick="Access.approvePay('${id}')"><i class="fas fa-check"></i> Aprobar</button>
                <button class="btn btn-danger" onclick="Access.rejectPay('${id}')"><i class="fas fa-times"></i> Rechazar</button>
            </div>
        `;
        
        openModal('modalProof');
    },
    
    markAsPaid(id) {
        this.update(id, { status: 'paid', paidAt: new Date().toISOString() });
        this.render();
        showToast('Entrada marcada como pagada', 'success');
    },
    
    markAsRedeemed(id) {
        this.update(id, { status: 'redeemed', redeemedAt: new Date().toISOString() });
        this.render();
        showToast('Entrada canjeada', 'success');
    },
    
    approvePay(id) {
        this.update(id, { status: 'paid', paidAt: new Date().toISOString() });
        closeModal('modalProof');
        this.render();
        showToast('Pago aprobado', 'success');
    },
    
    rejectPay(id) {
        this.update(id, { status: 'pending', proofImage: null, operationNumber: null });
        closeModal('modalProof');
        this.render();
        showToast('Pago rechazado', 'warning');
    },
    
    setFilter(status) {
        this.currentFilter = status;
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.status === status);
        });
        this.render();
    },
    
    init() {
        Events.fillSelect('filterAccessEvent');
        
        document.getElementById('searchAccess')?.addEventListener('input', debounce(() => this.render(), 300));
        document.getElementById('filterAccessEvent')?.addEventListener('change', () => this.render());
        
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => this.setFilter(tab.dataset.status));
        });
        
        this.render();
    }
};
