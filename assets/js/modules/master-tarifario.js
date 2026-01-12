'use strict';

window.MasterTarifarioModule = {
    // State
    currentTab: 'cargos',
    suppliers: [],
    areas: [],
    areaMap: {},

    init: async function() {
        console.log('MasterTarifarioModule initialized');
        this.bindEvents();
        await this.loadSuppliers(); // Cache suppliers for dropdowns
        await this.loadAreas();
        await this.loadCurrentTab();
    },

    bindEvents: function() {
        // Tab Switching
        const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Modals - Generic Close
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                document.getElementById(targetId)?.classList.add('hidden');
            });
        });

        // === CARGOS HANDLERS ===
        document.querySelector('#btn-create-cargo')?.addEventListener('click', () => this.openModalCargo());
        document.querySelector('#form-cargo')?.addEventListener('submit', (e) => this.saveCargo(e));
        document.querySelector('#search-cargos-input')?.addEventListener('input', (e) => this.filterCargos(e.target.value));

        // === APERTURA HANDLERS ===
        document.querySelector('#btn-create-apertura')?.addEventListener('click', () => this.openModalApertura());
        document.querySelector('#form-apertura')?.addEventListener('submit', (e) => this.saveApertura(e));

        // === FIJOS HANDLERS ===
        document.querySelector('#btn-create-fijo')?.addEventListener('click', () => this.openModalFijo());
        document.querySelector('#form-fijo')?.addEventListener('submit', (e) => this.saveFijo(e));
    },

    loadSuppliers: async function() {
        const sb = window.sb;
        if (!sb) return;
        const { data } = await sb.from('suppliers').select('id, nombre').order('nombre');
        this.suppliers = data || [];
        this.populateSupplierSelects();
    },

    loadAreas: async function() {
        const sb = window.sb;
        if (!sb) return;
        const { data } = await sb.from('areas').select('id, name, slug').eq('active', true).order('name');
        this.areas = data || [];
        this.areaMap = {};
        this.areas.forEach(area => {
            this.areaMap[area.id] = area.name;
        });
        this.populateAreaSelect();
    },

    populateAreaSelect: function() {
        const select = document.getElementById('select-cargo-area');
        if (!select) return;
        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        this.areas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area.id;
            opt.textContent = area.name;
            select.appendChild(opt);
        });
    },

    populateSupplierSelects: function() {
        const selects = ['select-apertura-supplier', 'select-fijo-supplier'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '<option value="">-- Seleccionar --</option>';
            this.suppliers.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.nombre;
                el.appendChild(opt);
            });
        });
    },

    switchTab: function(tabName) {
        this.currentTab = tabName;
        // UI Tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
        
        // Panels
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');

        this.loadCurrentTab();
    },

    loadCurrentTab: async function() {
        if (this.currentTab === 'cargos') await this.loadCargos();
        if (this.currentTab === 'apertura') await this.loadApertura();
        if (this.currentTab === 'fijos') await this.loadFijos();
    },

    // ================= CARGOS LOGIC =================
    loadCargos: async function() {
        const sb = window.sb;
        const tbody = document.getElementById('cargos-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';
        if (!sb) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Sin conexion.</td></tr>';
            return;
        }

        const { data, error } = await sb
            .from('job_positions')
            .select('*')
            .eq('active', true)
            .order('name');
        if (error) return console.error(error);
        
        this.allCargos = data || [];
        this.renderCargos(this.allCargos);
    },

    renderCargos: function(list) {
        const tbody = document.getElementById('cargos-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if(list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin datos.</td></tr>'; return; }
        
        list.forEach(item => {
            const tr = document.createElement('tr');
            const areaLabel = item.area_id ? (this.areaMap[item.area_id] || '-') : (item.area || '-');
            tr.innerHTML = `
                <td class="text-strong">${item.name || '-'}</td>
                <td>${areaLabel}</td>
                <td class="text-center"><span class="pill-muted">${item.shift || '-'}</span></td>
                <td class="text-center">${item.default_quantity || 0}</td>
                <td class="text-right">$${(item.base_salary || 0).toFixed(2)}</td>
                <td class="text-center">
                    <button class="btn-icon btn-edit-cargo">✏️</button>
                    <button class="btn-icon btn-delete-cargo text-danger">🗑️</button>
                </td>
            `;
            tr.querySelector('.btn-edit-cargo').addEventListener('click', () => this.openModalCargo(item));
            tr.querySelector('.btn-delete-cargo').addEventListener('click', () => this.deleteGeneric('job_positions', item.id, () => this.loadCargos()));
            tbody.appendChild(tr);
        });
    },

    filterCargos: function(val) {
        if(!this.allCargos) return;
        const term = val.toLowerCase();
        const filtered = this.allCargos.filter(c => {
            const name = (c.name || '').toLowerCase();
            const areaLabel = c.area_id ? (this.areaMap[c.area_id] || '') : (c.area || '');
            return name.includes(term) || areaLabel.toLowerCase().includes(term);
        });
        this.renderCargos(filtered);
    },

    openModalCargo: function(item = null) {
        const modal = document.getElementById('modal-cargo');
        modal.classList.remove('hidden');
        this.cargoId = item ? item.id : null;
        document.getElementById('modal-title-cargo').textContent = item ? 'Editar Cargo' : 'Nuevo Cargo';
        
        document.getElementById('input-cargo-name').value = item?.name || '';
        let areaValue = item?.area_id || '';
        if (!areaValue && item?.area) {
            const match = this.areas.find(a => a.name.toLowerCase() === String(item.area).toLowerCase());
            areaValue = match ? match.id : '';
        }
        document.getElementById('select-cargo-area').value = areaValue;
        document.getElementById('select-cargo-shift').value = item?.shift || '';
        document.getElementById('input-cargo-quantity').value = item?.default_quantity || 0;
        document.getElementById('input-cargo-salary').value = item?.base_salary || '';
    },

    saveCargo: async function(e) {
        e.preventDefault();
        const areaId = document.getElementById('select-cargo-area').value || null;
        const areaName = areaId ? (this.areaMap[areaId] || null) : null;
        const payload = {
            name: document.getElementById('input-cargo-name').value,
            area_id: areaId,
            area: areaName,
            shift: document.getElementById('select-cargo-shift').value,
            default_quantity: parseInt(document.getElementById('input-cargo-quantity').value) || 0,
            base_salary: parseFloat(document.getElementById('input-cargo-salary').value) || 0
        };
        await this.saveGeneric('job_positions', this.cargoId, payload, 'modal-cargo', () => this.loadCargos());
    },


    // ================= APERTURA LOGIC =================
    loadApertura: async function() {
        const sb = window.sb;
        const tbody = document.getElementById('apertura-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';
        if (!sb) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Sin conexion.</td></tr>';
            return;
        }

        const { data, error } = await sb.from('opening_costs')
            .select(`*, supplier:suppliers(nombre)`)
            .eq('active', true)
            .order('created_at', { ascending: false });

        if(error) return console.error(error);

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
             tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin registros.</td></tr>'; return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-strong">${item.description || '-'}</td>
                <td>${item.supplier?.nombre || '-'}</td>
                <td class="text-right">$${(item.amount || 0).toFixed(2)}</td>
                <td class="text-center">${item.payment_day_offset} días antes</td>
                <td class="text-center">
                    <button class="btn-icon btn-edit-apertura">✏️</button>
                    <button class="btn-icon btn-delete-apertura text-danger">🗑️</button>
                </td>
            `;
            tr.querySelector('.btn-edit-apertura').addEventListener('click', () => this.openModalApertura(item));
            tr.querySelector('.btn-delete-apertura').addEventListener('click', () => this.deleteGeneric('opening_costs', item.id, () => this.loadApertura()));
            tbody.appendChild(tr);
        });
    },

    openModalApertura: function(item = null) {
        const modal = document.getElementById('modal-apertura');
        modal.classList.remove('hidden');
        this.aperturaId = item ? item.id : null;
        document.getElementById('modal-title-apertura').textContent = item ? 'Editar Costo' : 'Nuevo Costo';

        document.getElementById('input-apertura-desc').value = item?.description || '';
        document.getElementById('select-apertura-supplier').value = item?.supplier_id || '';
        document.getElementById('input-apertura-amount').value = item?.amount || '';
        document.getElementById('input-apertura-offset').value = item?.payment_day_offset || 0;
    },

    saveApertura: async function(e) {
        e.preventDefault();
        const payload = {
            description: document.getElementById('input-apertura-desc').value,
            supplier_id: document.getElementById('select-apertura-supplier').value || null,
            amount: parseFloat(document.getElementById('input-apertura-amount').value) || 0,
            payment_day_offset: parseInt(document.getElementById('input-apertura-offset').value) || 0
        };
        await this.saveGeneric('opening_costs', this.aperturaId, payload, 'modal-apertura', () => this.loadApertura());
    },


    // ================= FIJOS LOGIC =================
    loadFijos: async function() {
        const sb = window.sb;
        const tbody = document.getElementById('fijos-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';
        if (!sb) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Sin conexion.</td></tr>';
            return;
        }

        const { data, error } = await sb.from('fixed_costs')
            .select(`*, supplier:suppliers(nombre)`)
            .eq('active', true)
            .order('next_due_date', { ascending: true });

        if(error) return console.error(error);

        tbody.innerHTML = '';
        if(!data || data.length === 0) {
             tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin registros.</td></tr>'; return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-strong">${item.description || '-'}</td>
                <td>${item.supplier?.nombre || '-'}</td>
                <td class="text-right">$${(item.amount || 0).toFixed(2)}</td>
                <td class="text-center"><span class="pill-muted">${item.frequency || '-'}</span></td>
                <td>${item.next_due_date || '-'}</td>
                <td class="text-center">
                    <button class="btn-icon btn-edit-fijo">✏️</button>
                    <button class="btn-icon btn-delete-fijo text-danger">🗑️</button>
                </td>
            `;
            tr.querySelector('.btn-edit-fijo').addEventListener('click', () => this.openModalFijo(item));
            tr.querySelector('.btn-delete-fijo').addEventListener('click', () => this.deleteGeneric('fixed_costs', item.id, () => this.loadFijos()));
            tbody.appendChild(tr);
        });
    },

    openModalFijo: function(item = null) {
        const modal = document.getElementById('modal-fijo');
        modal.classList.remove('hidden');
        this.fijoId = item ? item.id : null;
        document.getElementById('modal-title-fijo').textContent = item ? 'Editar Costo Fijo' : 'Nuevo Costo Fijo';

        document.getElementById('input-fijo-desc').value = item?.description || '';
        document.getElementById('select-fijo-supplier').value = item?.supplier_id || '';
        document.getElementById('input-fijo-amount').value = item?.amount || '';
        document.getElementById('select-fijo-freq').value = item?.frequency || 'Mensual';
        document.getElementById('input-fijo-date').value = item?.next_due_date || '';
    },

    saveFijo: async function(e) {
        e.preventDefault();
        const payload = {
            description: document.getElementById('input-fijo-desc').value,
            supplier_id: document.getElementById('select-fijo-supplier').value || null,
            amount: parseFloat(document.getElementById('input-fijo-amount').value) || 0,
            frequency: document.getElementById('select-fijo-freq').value,
            next_due_date: document.getElementById('input-fijo-date').value || null
        };
        await this.saveGeneric('fixed_costs', this.fijoId, payload, 'modal-fijo', () => this.loadFijos());
    },


    // ================= GENERIC HELPERS =================
    saveGeneric: async function(table, id, payload, modalId, callback) {
        const sb = window.sb;
        try {
            if (id) {
                const { error } = await sb.from(table).update(payload).eq('id', id);
                if(error) throw error;
            } else {
                const { error } = await sb.from(table).insert([payload]);
                if(error) throw error;
            }
            document.getElementById(modalId).classList.add('hidden');
            if(callback) await callback();
        } catch (err) {
            console.error(err);
            alert('Error al guardar: ' + err.message);
        }
    },

    deleteGeneric: async function(table, id, callback) {
        if(!confirm('¿Eliminar registro?')) return;
        const sb = window.sb;
        try {
            const { error } = await sb.from(table).update({ active: false }).eq('id', id);
            if(error) throw error;
            if(callback) await callback();
        } catch(err) {
            console.error(err);
            alert('Error al eliminar');
        }
    }
};
