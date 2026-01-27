// ========================================
// PARYGO - Gestión de Promotores
// ========================================

const Promoters = {
    getAll() {
        return Storage.get('promoters') || [];
    },
    
    getById(id) {
        return this.getAll().find(p => p.id === id);
    },
    
    save(data) {
        const promoters = this.getAll();
        
        if (data.id) {
            const index = promoters.findIndex(p => p.id === data.id);
            if (index !== -1) {
                // No actualizar password si está vacío
                if (!data.password) data.password = promoters[index].password;
                promoters[index] = { ...promoters[index], ...data, updatedAt: new Date().toISOString() };
            }
        } else {
            data.id = generateId();
            data.createdAt = new Date().toISOString();
            promoters.push(data);
            
            // Crear usuario para login
            const users = Storage.get('users') || [];
            users.push({
                id: data.id,
                email: data.email,
                password: data.password,
                name: `${data.name} ${data.lastname || ''}`.trim(),
                role: 'promoter'
            });
            Storage.set('users', users);
        }
        
        Storage.set('promoters', promoters);
        return data;
    },
    
    delete(id) {
        const promoters = this.getAll().filter(p => p.id !== id);
        Storage.set('promoters', promoters);
        
        // Eliminar usuario
        const users = (Storage.get('users') || []).filter(u => u.id !== id);
        Storage.set('users', users);
    },
    
    render() {
        const container = document.getElementById('promotersTable');
        const promoters = this.getAll();
        
        if (!promoters.length) {
            container.innerHTML = '<tr><td colspan="6" class="empty-state">No hay promotores registrados</td></tr>';
            return;
        }
        
        container.innerHTML = promoters.map(p => {
            const brands = (p.brandIds || []).map(id => Brands.getById(id)?.name).filter(Boolean).join(', ');
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="user-avatar" style="width: 36px; height: 36px; font-size: 12px;">
                                ${p.photo ? `<img src="${p.photo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : getInitials(p.name)}
                            </div>
                            <div>
                                <strong>${p.name} ${p.lastname || ''}</strong>
                            </div>
                        </div>
                    </td>
                    <td>${p.dni || '-'}</td>
                    <td>${p.email}</td>
                    <td>${p.phone || '-'}</td>
                    <td>${brands || 'Sin marcas'}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-ghost btn-sm" onclick="Promoters.edit('${p.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm btn-icon" onclick="Promoters.confirmDelete('${p.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },
    
    new() {
        this.resetForm();
        document.getElementById('modalPromoterTitle').textContent = 'Nuevo Promotor';
        this.renderBrandCheckboxes();
        openModal('modalPromoter');
    },
    
    edit(id) {
        const p = this.getById(id);
        if (!p) return;
        
        this.resetForm();
        document.getElementById('modalPromoterTitle').textContent = 'Editar Promotor';
        this.renderBrandCheckboxes(p.brandIds || []);
        
        document.getElementById('promoterId').value = p.id;
        document.getElementById('promoterDni').value = p.dni || '';
        document.getElementById('promoterName').value = p.name || '';
        document.getElementById('promoterLastname').value = p.lastname || '';
        document.getElementById('promoterEmail').value = p.email || '';
        document.getElementById('promoterPhone').value = p.phone || '';
        
        if (p.photo) {
            document.getElementById('promoterPhotoPreview').src = p.photo;
            document.getElementById('promoterPhotoPreview').classList.remove('hidden');
            document.getElementById('promoterPhotoPlaceholder').classList.add('hidden');
        }
        
        openModal('modalPromoter');
    },
    
    async saveForm(e) {
        e.preventDefault();
        
        const brandIds = [];
        document.querySelectorAll('#promoterBrands input:checked').forEach(cb => {
            brandIds.push(cb.value);
        });
        
        const data = {
            id: document.getElementById('promoterId').value || null,
            dni: document.getElementById('promoterDni').value,
            name: document.getElementById('promoterName').value,
            lastname: document.getElementById('promoterLastname').value,
            email: document.getElementById('promoterEmail').value,
            phone: document.getElementById('promoterPhone').value,
            password: document.getElementById('promoterPass').value,
            brandIds
        };
        
        const photoFile = document.getElementById('promoterPhoto').files[0];
        if (photoFile) {
            data.photo = await imageToBase64(photoFile);
        } else {
            const preview = document.getElementById('promoterPhotoPreview');
            if (preview.src && !preview.classList.contains('hidden')) {
                data.photo = preview.src;
            }
        }
        
        this.save(data);
        closeModal('modalPromoter');
        this.render();
        showToast('Promotor guardado', 'success');
    },
    
    async confirmDelete(id) {
        const p = this.getById(id);
        const confirmed = await confirmAction('Eliminar Promotor', `¿Eliminar a "${p.name}"?`);
        if (confirmed) {
            this.delete(id);
            this.render();
            showToast('Promotor eliminado', 'success');
        }
    },
    
    renderBrandCheckboxes(selectedIds = []) {
        const container = document.getElementById('promoterBrands');
        const brands = Brands.getAll();
        
        container.innerHTML = brands.map(b => `
            <label>
                <input type="checkbox" value="${b.id}" ${selectedIds.includes(b.id) ? 'checked' : ''}>
                ${b.name}
            </label>
        `).join('') || '<p class="text-muted">No hay marcas creadas</p>';
    },
    
    async searchDni() {
        const dni = document.getElementById('promoterDni').value;
        if (!isValidDni(dni)) {
            showToast('DNI inválido', 'error');
            return;
        }
        
        try {
            showToast('Buscando...', 'warning');
            const result = await DniAPI.search(dni);
            if (result.name) {
                const names = result.name.split(' ');
                document.getElementById('promoterName').value = names.slice(0, 2).join(' ');
                document.getElementById('promoterLastname').value = names.slice(2).join(' ');
                showToast('Datos encontrados', 'success');
            } else {
                showToast('No se encontraron datos', 'warning');
            }
        } catch (error) {
            showToast('Error al buscar DNI', 'error');
        }
    },
    
    resetForm() {
        document.getElementById('promoterForm').reset();
        document.getElementById('promoterId').value = '';
        document.getElementById('promoterPhotoPreview').classList.add('hidden');
        document.getElementById('promoterPhotoPlaceholder').classList.remove('hidden');
    },
    
    fillSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const promoters = this.getAll();
        select.innerHTML = '<option value="">Seleccionar promotor</option>';
        promoters.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.name} ${p.lastname || ''}</option>`;
        });
    },
    
    init() {
        document.getElementById('promoterForm')?.addEventListener('submit', (e) => this.saveForm(e));
        document.getElementById('btnNewPromoter')?.addEventListener('click', () => this.new());
        document.getElementById('btnSearchPromoterDni')?.addEventListener('click', () => this.searchDni());
        
        document.getElementById('promoterPhotoUpload')?.addEventListener('click', () => {
            document.getElementById('promoterPhoto').click();
        });
        
        document.getElementById('promoterPhoto')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('promoterPhotoPreview').src = await imageToBase64(file);
                document.getElementById('promoterPhotoPreview').classList.remove('hidden');
                document.getElementById('promoterPhotoPlaceholder').classList.add('hidden');
            }
        });
        
        this.render();
    }
};
