'use strict';

window.MasterSkusModule = {
    categoriesData: [],
    currentSkusData: [],
    suppliersData: [],
    currentCategoryId: null,
    currentCategoryName: null,

    init: function() {
        console.log('ProductsModule initialized');
        window.filterSkusByCategory = this.filterSkusByCategory.bind(this);
        window.openEditSkuModal = this.openEditSkuModal.bind(this);
        window.deleteSku = this.deleteSku.bind(this);
        window.addCategory = this.addCategory.bind(this);
        window.openSkuModal = this.openSkuModal.bind(this);

        const addCategoryBtn = document.getElementById('btn-add-category');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => this.addCategory());
        }

        const newSkuBtn = document.getElementById('btn-new-sku');
        if (newSkuBtn) {
            newSkuBtn.addEventListener('click', () => this.openSkuModal());
        }

        const closeNewSkuBtn = document.getElementById('btn-close-new-sku');
        if (closeNewSkuBtn) {
            closeNewSkuBtn.addEventListener('click', () => this.hideModal('modal-new-sku', true));
        }

        const cancelNewSkuBtn = document.getElementById('btn-cancel-new-sku');
        if (cancelNewSkuBtn) {
            cancelNewSkuBtn.addEventListener('click', () => this.hideModal('modal-new-sku', true));
        }

        const closeEditSkuBtn = document.getElementById('btn-close-edit-sku');
        if (closeEditSkuBtn) {
            closeEditSkuBtn.addEventListener('click', () => this.hideModal('modal-edit-sku'));
        }

        const cancelEditSkuBtn = document.getElementById('btn-cancel-edit-sku');
        if (cancelEditSkuBtn) {
            cancelEditSkuBtn.addEventListener('click', () => this.hideModal('modal-edit-sku'));
        }

        const deleteSkuBtn = document.getElementById('btn-delete-sku');
        if (deleteSkuBtn) {
            deleteSkuBtn.addEventListener('click', () => this.deleteSku());
        }

        const newSkuModal = document.getElementById('modal-new-sku');
        if (newSkuModal) {
            newSkuModal.addEventListener('click', (event) => {
                if (event.target === newSkuModal) {
                    this.hideModal('modal-new-sku', true);
                }
            });
        }

        const editSkuModal = document.getElementById('modal-edit-sku');
        if (editSkuModal) {
            editSkuModal.addEventListener('click', (event) => {
                if (event.target === editSkuModal) {
                    this.hideModal('modal-edit-sku');
                }
            });
        }
        
        // Listeners for forms
        const skuForm = document.getElementById('form-new-sku');
        if (skuForm) {
            skuForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createSku();
            });
        }
        
        const formEditSku = document.getElementById('form-edit-sku');
        if (formEditSku) {
           formEditSku.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.updateSku();
            });
        }
        
        // Auto-calc logic
        const inputCost = document.getElementById('new-sku-cost');
        const inputPackQty = document.getElementById('new-sku-pack-qty');
        const inputPackCost = document.getElementById('new-sku-pack-cost');

        const updatePackCost = () => {
            const cost = parseFloat(inputCost.value) || 0;
            const qty = parseFloat(inputPackQty.value) || 0;
            if (inputPackCost) {
                inputPackCost.value = (cost * qty).toFixed(2);
            }
        };

        if (inputCost && inputPackQty) {
            inputCost.addEventListener('input', updatePackCost);
            inputPackQty.addEventListener('input', updatePackCost);
        }
    },

    loadSkuCategories: async function() {
        console.log('Loading categories...');
        const container = document.getElementById('sku-tabs-container');
        container.textContent = 'Cargando categorías...';
        const sb = window.sb;

        try {
            const { data, error } = await sb
                .from('categories')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching categories:', error);
                container.textContent = 'Error al cargar categorías: ' + error.message;
                return;
            }

            const allCategories = [{ id: 'all', nombre: 'Todo' }, ...data];
            this.categoriesData = data; 
            this.renderSkuCategories(allCategories);
            
            if(allCategories.length > 0) {
                this.filterSkusByCategory('all', 'Todo');
            }

        } catch (err) {
            console.error('Unexpected error loading categories:', err);
            container.textContent = 'Error inesperado: ' + err.message;
        }
    },

    renderSkuCategories: function(categoriesDisplay) {
        const container = document.getElementById('sku-tabs-container');
        if (!container) return;
        container.textContent = '';

        categoriesDisplay.forEach(cat => {
            const btn = document.createElement('button');
            btn.textContent = cat.nombre;
            btn.dataset.id = cat.id;
            btn.onclick = () => {
                 this.filterSkusByCategory(cat.id, cat.nombre);
            };
            this.styleTabButton(btn, false);
            container.appendChild(btn);
        });
        
        if(container.firstChild) this.styleTabButton(container.firstChild, true);
    },

    styleTabButton: function(btn, isActive) {
        btn.classList.add('tab-btn');
        if (isActive) btn.classList.add('active');
        else btn.classList.remove('active');
    },

    updateSkuTabsActive: function(activeId) {
         const container = document.getElementById('sku-tabs-container');
         Array.from(container.children).forEach(btn => {
             this.styleTabButton(btn, btn.dataset.id === activeId);
         });
    },

    filterSkusByCategory: async function(categoryId, categoryName) {
        console.log('Filtering SKUs for:', categoryName);
        this.currentCategoryId = categoryId;
        this.currentCategoryName = categoryName;
        this.updateSkuTabsActive(categoryId);
        const sb = window.sb;

        const listContainer = document.getElementById('sku-list');
        if (!listContainer) return;
        listContainer.textContent = '';
        listContainer.appendChild(this.buildSectionTitle(`SKUs de: ${categoryName}`));
        listContainer.appendChild(this.buildMessage('Cargando SKUs...', false));

        let query = sb.from('inventory_skus').select('*').order('name', { ascending: true });
        
        if (categoryId !== 'all') {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;

        listContainer.textContent = '';
        listContainer.appendChild(this.buildSectionTitle(`SKUs de: ${categoryName}`));

        if (error) {
            console.error('Error fetching SKUs:', error);
            listContainer.appendChild(this.buildMessage('Error al cargar SKUs de ' + categoryName, true));
            return;
        }

        if (!data || data.length === 0) {
            listContainer.appendChild(this.buildMessage('No hay SKUs en esta categoría.', false));
            return;
        }

        const isBebidas = categoryName.toLowerCase() === 'bebidas';

        this.currentSkusData = data;
        listContainer.appendChild(this.buildSkuTable(data, isBebidas));
    },

    openEditSkuModal: async function(skuId) {
        const sku = this.currentSkusData.find(s => s.id === skuId);
        if (!sku) return;

        const sb = window.sb;
        if (this.suppliersData.length === 0) {
            const { data } = await sb.from('suppliers').select('id, nombre').order('nombre');
            this.suppliersData = data || [];
        }

        if (this.categoriesData.length === 0) {
            const { data } = await sb.from('categories').select('id, nombre').order('created_at', { ascending: true });
            this.categoriesData = data || [];
        }

        const selectCategory = document.getElementById('edit-sku-category');
        if (selectCategory) {
            selectCategory.textContent = '';
            const categories = this.categoriesData || [];
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nombre;
                if (sku.category_id === cat.id) option.selected = true;
                selectCategory.appendChild(option);
            });
        }

        const selectSupplier = document.getElementById('edit-sku-supplier');
        selectSupplier.innerHTML = '<option value="">-- Sin Proveedor --</option>';
        this.suppliersData.forEach(sup => {
            const option = document.createElement('option');
            option.value = sup.id;
            option.textContent = sup.nombre;
            if (sku.default_supplier_id === sup.id) option.selected = true;
            selectSupplier.appendChild(option);
        });

        document.getElementById('edit-sku-id').value = sku.id;
        document.getElementById('edit-sku-name').value = sku.name;
        document.getElementById('edit-sku-cost').value = sku.cost;
        document.getElementById('edit-sku-pack-quantity').value = sku.pack_quantity || 1;
        document.getElementById('edit-sku-active').value = sku.is_active !== false ? "true" : "false";
        
        this.showModal('modal-edit-sku');
    },

    updateSku: async function() {
        const id = document.getElementById('edit-sku-id').value;
        const name = document.getElementById('edit-sku-name').value;
        const cost = parseFloat(document.getElementById('edit-sku-cost').value) || 0;
        const packQuantity = parseInt(document.getElementById('edit-sku-pack-quantity').value) || 1;
        const isActive = document.getElementById('edit-sku-active').value === 'true';
        const supplierId = document.getElementById('edit-sku-supplier').value;
        const categoryId = document.getElementById('edit-sku-category')?.value || null;
        const sb = window.sb;

        const { error } = await sb
            .from('inventory_skus')
            .update({
                 name: name,
                 cost: cost,
                 pack_quantity: packQuantity,
                 is_active: isActive,
                 default_supplier_id: supplierId || null,
                 category_id: categoryId
            })
            .eq('id', id);

        if (error) {
            alert('Error al actualizar: ' + error.message);
        } else {
            alert('SKU actualizado.');
            this.hideModal('modal-edit-sku');
            this.loadSkuCategories();
        }
    },

    deleteSku: async function() {
        const id = document.getElementById('edit-sku-id').value;
        if (!confirm('¿CONFIRMAR ELIMINACIÓN? Esto puede romper stock si existen referencias.')) return;
        const sb = window.sb;

        const { error } = await sb
            .from('inventory_skus')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error al eliminar: ' + error.message);
        } else {
            alert('SKU eliminado.');
            this.hideModal('modal-edit-sku');
            this.loadSkuCategories();
        }
    },
    
    addCategory: async function() {
        const name = prompt("Ingrese el nombre de la nueva categoría:");
        if (!name) return;
        const sb = window.sb;

        const { data, error } = await sb
            .from('categories')
            .insert({ nombre: name })
            .select();

        if (error) {
            alert('Error al crear categoría: ' + error.message);
        } else {
            alert('Categoría creada exitosamente.');
            this.loadSkuCategories();
        }
    },

    openSkuModal: async function() {
        const selectCategory = document.getElementById('new-sku-category');
        const selectSupplier = document.getElementById('new-sku-supplier');
        const sb = window.sb;
        
        const validCategories = this.categoriesData.filter(c => c.id !== 'all');
        selectCategory.innerHTML = '';
        validCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.nombre;
            selectCategory.appendChild(option);
        });

        if (this.suppliersData.length === 0) {
            const { data, error } = await sb.from('suppliers').select('id, nombre').order('nombre');
            if (!error) this.suppliersData = data;
        }

        selectSupplier.innerHTML = '<option value="">-- Seleccionar --</option>';
        this.suppliersData.forEach(sup => {
            const option = document.createElement('option');
            option.value = sup.id;
            option.textContent = sup.nombre;
            selectSupplier.appendChild(option);
        });
        
        this.showModal('modal-new-sku');
    },
    
    createSku: async function() {
        const categoryId = document.getElementById('new-sku-category').value;
        const supplierId = document.getElementById('new-sku-supplier').value;
        const name = document.getElementById('new-sku-name').value;
        const ml = document.getElementById('new-sku-ml').value;
        const cost = document.getElementById('new-sku-cost').value;
        const packQty = document.getElementById('new-sku-pack-qty').value;
        const packCost = document.getElementById('new-sku-pack-cost').value;
        const sb = window.sb;

        const { error } = await sb
            .from('inventory_skus')
            .insert({
                category_id: categoryId,
                default_supplier_id: supplierId || null,
                name: name,
                ml: ml ? parseFloat(ml) : null,
                cost: cost ? parseFloat(cost) : 0,
                pack_quantity: packQty ? parseFloat(packQty) : 0,
                pack_cost: packCost ? parseFloat(packCost) : 0
            });

        if (error) {
            alert('Error al crear SKU: ' + error.message);
        } else {
            alert('SKU creado exitosamente.');
            this.hideModal('modal-new-sku', true);
        }
    },

    buildSkuTable: function(data, isBebidas) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const headers = ['Nombre'];

        if (isBebidas) headers.push('ML');
        headers.push('Costo', 'Pack', 'Costo Pack', 'Estado', 'Acción');

        headers.forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        data.forEach(sku => {
            const row = document.createElement('tr');

            row.appendChild(this.buildCell(sku.name));
            if (isBebidas) row.appendChild(this.buildCell(this.formatValue(sku.ml)));
            row.appendChild(this.buildCell(this.formatCurrency(sku.cost)));
            row.appendChild(this.buildCell(this.formatValue(sku.pack_quantity)));
            row.appendChild(this.buildCell(this.formatCurrency(sku.pack_cost)));

            const statusCell = document.createElement('td');
            const isActive = sku.is_active !== false;
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = `status-pill ${isActive ? 'is-active' : 'is-inactive'}`;
            toggleBtn.textContent = isActive ? 'Activo' : 'Inactivo';
            toggleBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            toggleBtn.title = isActive ? 'Desactivar SKU' : 'Activar SKU';
            toggleBtn.addEventListener('click', () => this.toggleSkuStatus(sku.id, isActive));
            statusCell.appendChild(toggleBtn);
            row.appendChild(statusCell);

            const actionCell = document.createElement('td');
            const actions = document.createElement('div');
            actions.className = 'table-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-secondary';
            editBtn.textContent = 'Editar';
            editBtn.addEventListener('click', () => this.openEditSkuModal(sku.id));

            actions.appendChild(editBtn);
            actionCell.appendChild(actions);
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        return table;
    },

    buildCell: function(value) {
        const cell = document.createElement('td');
        cell.textContent = value === null || value === undefined || value === '' ? '-' : String(value);
        return cell;
    },

    buildSectionTitle: function(text) {
        const title = document.createElement('h3');
        title.textContent = text;
        return title;
    },

    buildMessage: function(text, isError) {
        const msg = document.createElement('p');
        msg.textContent = text;
        msg.className = isError ? 'text-danger' : 'text-muted';
        return msg;
    },

    formatCurrency: function(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '$0';
        return '$' + number.toFixed(2);
    },

    formatValue: function(value) {
        if (value === null || value === undefined || value === '') return '-';
        return value;
    },

    showModal: function(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    hideModal: function(id, resetForm) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');

        if (resetForm && id === 'modal-new-sku') {
            const form = document.getElementById('form-new-sku');
            if (form) form.reset();
        }
    },

    toggleSkuStatus: async function(skuId, isActive) {
        const sb = window.sb;
        const { error } = await sb
            .from('inventory_skus')
            .update({ is_active: !isActive })
            .eq('id', skuId);

        if (error) {
            alert('Error al actualizar estado: ' + error.message);
            return;
        }

        if (this.currentCategoryId && this.currentCategoryName) {
            this.filterSkusByCategory(this.currentCategoryId, this.currentCategoryName);
        } else {
            this.loadSkuCategories();
        }
    }
};
