    
    edit(id) {
        const a = this.getById(id);
        if (!a) return;
        this.resetForm();
        document.getElementById('modalAdminTitle').textContent = 'Editar Admin';
        Brands.fillSelect('adminBrand');
        document.getElementById('adminId').value = a.id;
        document.getElementById('adminName').value = a.name || '';
        document.getElementById('adminEmail').value = a.email || '';
        document.getElementById('adminBrand').value = a.brandId || '';
        openModal('modalAdmin');
    },
    
    saveForm(e) {
        e.preventDefault();
        const data = {
            id: document.getElementById('adminId').value || null,
            name: document.getElementById('adminName').value,
            email: document.getElementById('adminEmail').value,
            password: document.getElementById('adminPass').value,
            brandId: document.getElementById('adminBrand').value
        };
        this.save(data);
        closeModal('modalAdmin');
        this.render();
        showToast('Administrador guardado', 'success');
    },
    
    async confirmDelete(id) {
        const a = this.getById(id);
        if (await confirmAction('Eliminar Admin', `¿Eliminar a "${a.name}"?`)) {
            this.delete(id);
            this.render();
            showToast('Administrador eliminado', 'success');
        }
    },
    
    resetForm() {
        document.getElementById('adminForm').reset();
        document.getElementById('adminId').value = '';
    },
    
    init() {
        document.getElementById('adminForm')?.addEventListener('submit', (e) => this.saveForm(e));
        document.getElementById('btnNewAdmin')?.addEventListener('click', () => this.new());
        this.render();
    }
};
