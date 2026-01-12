'use strict';

window.MasterProveedoresModule = {
    suppliers: [],
    editingId: null,

    init: function() {
        console.log('SuppliersModule initialized');
        const newBtn = document.getElementById('btn-new-supplier');
        if (newBtn) {
            newBtn.addEventListener('click', () => this.openSupplierModal());
        }

        const closeBtn = document.getElementById('close-supplier-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeSupplierModal());
        }

        const cancelBtn = document.getElementById('btn-cancel-supplier');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeSupplierModal());
        }

        const modal = document.getElementById('modal-proveedores');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.closeSupplierModal();
                }
            });
        }

        const form = document.getElementById('supplier-form');
        if (form) {
            form.addEventListener('submit', (event) => this.handleSubmit(event));
        }
    },

    loadSuppliers: async function() {
        this.setTableMessage('Cargando...');
        const sb = window.sb;
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching suppliers:', error);
            this.setTableMessage('Error cargando proveedores.', true);
            return;
        }

        this.suppliers = data || [];
        this.renderSuppliers(this.suppliers);
    },

    setTableMessage: function(message, isError) {
        const tbody = document.getElementById('suppliers-table-body');
        if (!tbody) return;

        tbody.textContent = '';
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = message;
        cell.classList.add(isError ? 'text-danger' : 'text-muted');
        row.appendChild(cell);
        tbody.appendChild(row);
    },

    renderSuppliers: function(suppliers) {
        const tbody = document.getElementById('suppliers-table-body');
        if (!tbody) return;
        tbody.textContent = '';

        if (!suppliers || suppliers.length === 0) {
            this.setTableMessage('No hay proveedores registrados.');
            return;
        }

        suppliers.forEach(supplier => {
            const row = document.createElement('tr');
            row.classList.add('row-clickable');
            row.addEventListener('click', () => this.toggleSupplierDetails(supplier.id));

            row.appendChild(this.buildCell(supplier.nombre));
            row.appendChild(this.buildCell(supplier.razon_social));
            row.appendChild(this.buildCell(supplier.cuit));
            row.appendChild(this.buildCell(supplier.banco));
            row.appendChild(this.buildCell(supplier.cbu));
            row.appendChild(this.buildCell(supplier.alias));

            const actionsCell = document.createElement('td');
            const actions = document.createElement('div');
            actions.className = 'table-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-primary';
            editBtn.textContent = 'Editar';
            editBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openSupplierModal(supplier.id);
            });

            actions.appendChild(editBtn);
            actionsCell.appendChild(actions);
            row.appendChild(actionsCell);

            tbody.appendChild(row);
            tbody.appendChild(this.buildDetailRow(supplier));
        });
    },

    buildCell: function(value) {
        const cell = document.createElement('td');
        const text = value === null || value === undefined || value === '' ? '-' : String(value);
        cell.textContent = text;
        return cell;
    },

    buildDetailRow: function(supplier) {
        const detailRow = document.createElement('tr');
        detailRow.id = `detail-${supplier.id}`;
        detailRow.classList.add('detail-row', 'hidden');

        const cell = document.createElement('td');
        cell.colSpan = 7;

        const heading = document.createElement('div');
        heading.className = 'detail-heading';
        heading.textContent = 'Detalles adicionales';

        const list = document.createElement('ul');
        list.className = 'detail-list';

        const email = supplier.email || 'N/A';
        const telefonos = this.formatListValue(supplier.telefonos);
        const contactos = this.formatListValue(supplier.contactos);

        list.appendChild(this.buildDetailItem('Email', email));
        list.appendChild(this.buildDetailItem('Telefonos', telefonos || 'N/A'));
        list.appendChild(this.buildDetailItem('Contactos', contactos || 'N/A'));

        cell.appendChild(heading);
        cell.appendChild(list);
        detailRow.appendChild(cell);

        return detailRow;
    },

    buildDetailItem: function(label, value) {
        const item = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = label + ':';
        item.appendChild(strong);
        item.appendChild(document.createTextNode(' ' + value));
        return item;
    },

    toggleSupplierDetails: function(id) {
        const detailRow = document.getElementById(`detail-${id}`);
        if (detailRow) {
            detailRow.classList.toggle('hidden');
        }
    },

    openSupplierModal: function(id) {
        const modal = document.getElementById('modal-proveedores');
        const form = document.getElementById('supplier-form');
        const title = document.getElementById('supplier-modal-title');
        if (!modal || !form || !title) return;

        this.setFormLoading(false);
        this.clearFormMessage();

        if (id) {
            const supplier = this.suppliers.find((item) => item.id === id);
            if (!supplier) return;
            this.editingId = id;
            title.textContent = 'Editar Proveedor';
            form.nombre.value = supplier.nombre || '';
            form.razon_social.value = supplier.razon_social || '';
            form.cuit.value = supplier.cuit || '';
            form.banco.value = supplier.banco || '';
            form.cbu.value = supplier.cbu || '';
            form.alias.value = supplier.alias || '';
            form.email.value = supplier.email || '';
            form.telefonos.value = this.formatListValue(supplier.telefonos);
            form.contactos.value = this.formatListValue(supplier.contactos);
        } else {
            this.editingId = null;
            title.textContent = 'Nuevo Proveedor';
            form.reset();
        }

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    closeSupplierModal: function() {
        const modal = document.getElementById('modal-proveedores');
        const form = document.getElementById('supplier-form');
        if (!modal || !form) return;

        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        this.editingId = null;
        form.reset();
        this.clearFormMessage();
        this.setFormLoading(false);
    },

    handleSubmit: async function(event) {
        event.preventDefault();
        const form = event.target;
        if (!form) return;

        const payload = this.buildPayload(form);
        if (!payload) return;

        this.setFormLoading(true);

        const sb = window.sb;
        let error;
        if (this.editingId) {
            ({ error } = await sb.from('suppliers').update(payload).eq('id', this.editingId));
        } else {
            ({ error } = await sb.from('suppliers').insert(payload));
        }

        if (error) {
            console.error('Error saving supplier:', error);
            this.setFormMessage('Error al guardar proveedor: ' + error.message);
        } else {
            this.closeSupplierModal();
            this.loadSuppliers();
        }

        this.setFormLoading(false);
    },

    buildPayload: function(form) {
        const nombre = form.nombre.value.trim();
        if (!nombre) {
            this.setFormMessage('El nombre es obligatorio.');
            return null;
        }

        const email = form.email.value.trim();
        if (email && !this.isValidEmail(email)) {
            this.setFormMessage('El email no es valido.');
            return null;
        }

        const cuitRaw = form.cuit.value.trim();
        const cuitDigits = this.onlyDigits(cuitRaw);
        if (cuitRaw && cuitDigits.length !== 11) {
            this.setFormMessage('El CUIT debe tener 11 digitos.');
            return null;
        }

        const cbuRaw = form.cbu.value.trim();
        const cbuDigits = this.onlyDigits(cbuRaw);
        if (cbuRaw && cbuDigits.length !== 22) {
            this.setFormMessage('El CBU debe tener 22 digitos.');
            return null;
        }

        const telefonos = this.parseListInput(form.telefonos.value);
        const contactos = this.parseListInput(form.contactos.value);

        return {
            nombre: nombre,
            razon_social: this.nullIfEmpty(form.razon_social.value),
            cuit: this.nullIfEmpty(cuitRaw),
            banco: this.nullIfEmpty(form.banco.value),
            cbu: this.nullIfEmpty(cbuRaw),
            alias: this.nullIfEmpty(form.alias.value),
            email: this.nullIfEmpty(email),
            telefonos: telefonos.length ? telefonos : null,
            contactos: contactos.length ? contactos : null
        };
    },

    setFormLoading: function(isLoading) {
        const saveBtn = document.getElementById('btn-save-supplier');
        if (saveBtn) {
            saveBtn.disabled = isLoading;
            saveBtn.textContent = isLoading ? 'Guardando...' : 'Guardar';
        }
    },

    setFormMessage: function(message) {
        const messageEl = document.getElementById('supplier-form-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    },

    clearFormMessage: function() {
        this.setFormMessage('');
    },

    parseListInput: function(value) {
        return String(value || '')
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    },

    formatListValue: function(value) {
        if (!value) return '';
        if (Array.isArray(value)) return value.filter(Boolean).join(', ');
        if (typeof value === 'string') return value;
        return '';
    },

    onlyDigits: function(value) {
        return String(value || '').replace(/\D/g, '');
    },

    nullIfEmpty: function(value) {
        const trimmed = String(value || '').trim();
        return trimmed.length ? trimmed : null;
    },

    isValidEmail: function(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
};
