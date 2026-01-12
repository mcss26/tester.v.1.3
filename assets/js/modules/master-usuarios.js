'use strict';

window.MasterUsuariosModule = {
    // State
    activeView: 'system', // 'system' or 'staff'
    activeAreaFilter: 'all', // for system view
    searchQuery: '',
    
    // Data
    users: [],
    staffList: [],
    areas: [],
    
    // Staff Editing
    currentStaffId: null,

    init: async function() {
        console.log('MasterUsuariosModule initialized');
        this.bindEvents();
        await this.loadAreas(); 
        await this.loadUsers(); // Load system users
    },

    bindEvents: function() {
        // Main View Tabs (System vs Staff)
        const viewTabs = document.querySelectorAll('.tab-btn[data-view]');
        viewTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchView(tab.dataset.view);
            });
        });

        // System: Area Filter Tabs
        const areaTabs = document.querySelectorAll('.tab-btn[data-area]');
        areaTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.setAreaFilter(tab.dataset.area);
            });
        });

        // Search
        const searchInput = document.getElementById('search-users-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = event.target.value.toLowerCase().trim();
                this.renderUsers();
            });
        }

        // --- Modals ---
        
        // Modal Privileges (System)
        const formPriv = document.getElementById('form-privileges');
        if(formPriv) {
            formPriv.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveUserChanges();
            });
        }

        // Modal Staff
        const btnCreateStaff = document.getElementById('btn-create-staff');
        if(btnCreateStaff) btnCreateStaff.addEventListener('click', () => this.openModalStaff());

        const formStaff = document.getElementById('form-staff');
        if(formStaff) {
            formStaff.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveStaff();
            });
        }

        // Generic Close Modal
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                document.getElementById(targetId).classList.add('hidden');
            });
        });
    },

    // ================= VIEW LOGIC =================

    switchView: function(viewName) {
        this.activeView = viewName;
        
        // Toggle Buttons
        document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
            if(btn.dataset.view === viewName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Toggle Content
        const viewSystem = document.getElementById('view-system');
        const viewStaff = document.getElementById('view-staff');

        if(viewName === 'system') {
            viewSystem.classList.remove('hidden');
            viewStaff.classList.add('hidden');
        } else {
            viewSystem.classList.add('hidden');
            viewStaff.classList.remove('hidden');
            if(this.staffList.length === 0) this.loadStaff(); // Lazy load
        }
    },

    setAreaFilter: function(area) {
        this.activeAreaFilter = area;
        document.querySelectorAll('.tab-btn[data-area]').forEach(btn => {
            if(btn.dataset.area === area) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        this.renderUsers();
    },

    // ================= DATA LOGIC: SHARED =================

    loadAreas: async function() {
        const sb = window.sb;
        if (!sb) return;
        const { data, error } = await sb.from('areas').select('id, name').eq('active', true).order('name');
        if (error) return console.error(error);
        this.areas = data || [];
        
        this.populateAreaSelects();
    },

    populateAreaSelects: function() {
        const selects = ['edit-user-area', 'staff-area'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if(!el) return;
            el.innerHTML = '<option value="">-- Seleccionar --</option>';
            this.areas.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                el.appendChild(opt);
            });
        });
    },

    // ================= DATA LOGIC: SYSTEM USERS =================

    loadUsers: async function() {
        const sb = window.sb;
        const tbody = document.getElementById('users-table-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';

        const { data, error } = await sb.from('profiles').select('*, area:areas(name)').order('full_name');
        if (error) {
            console.error(error);
            if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error.</td></tr>';
            return;
        }
        this.users = (data || []).filter(u => (u.role || '').toLowerCase() !== 'staff barra');
        this.renderUsers();
    },

    renderUsers: function() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const filtered = this.users.filter(u => {
            const areaName = u.area?.name?.toLowerCase() || '';
            const rawName = (u.full_name || '').toLowerCase();
            const rawEmail = (u.email || '').toLowerCase();

            // Filter
            let passArea = true;
            if (this.activeAreaFilter !== 'all') {
                passArea = areaName.includes(this.activeAreaFilter);
            }
            
            // Search
            const passSearch = !this.searchQuery || rawName.includes(this.searchQuery) || rawEmail.includes(this.searchQuery);

            return passArea && passSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin resultados.</td></tr>';
            return;
        }

        filtered.forEach(u => {
            const tr = document.createElement('tr');
            const areaLabel = u.area ? `<span class="pill">${u.area.name}</span>` : '<span class="text-muted text-sm">Sin asignar</span>';
            
            tr.innerHTML = `
                <td class="font-medium">${u.full_name || '-'}</td>
                <td>${areaLabel}</td>
                <td class="text-sm text-muted">${u.email || '-'}</td>
                <td class="text-center">
                    <button type="button" class="btn-secondary btn-sm btn-edit-sys">Editar</button>
                </td>
            `;
            tr.querySelector('.btn-edit-sys').addEventListener('click', () => this.openModalPrivileges(u));
            tbody.appendChild(tr);
        });
    },

    openModalPrivileges: function(user) {
        this.currentSysUser = user;
        const modal = document.getElementById('modal-privileges');
        document.getElementById('edit-user-name').value = user.full_name || user.email;
        document.getElementById('edit-user-role').value = user.role || 'staff barra';
        document.getElementById('edit-user-area').value = user.area_id || '';
        modal.classList.remove('hidden');
    },

    saveUserChanges: async function() {
        if(!this.currentSysUser) return;
        const sb = window.sb;
        const role = document.getElementById('edit-user-role').value;
        const areaId = document.getElementById('edit-user-area').value || null;

        const { error } = await sb.from('profiles').update({ role, area_id: areaId }).eq('id', this.currentSysUser.id);
        if(error) return alert('Error: ' + error.message);

        document.getElementById('modal-privileges').classList.add('hidden');
        this.loadUsers();
    },

    // ================= DATA LOGIC: STAFF USERS =================

    loadStaff: async function() {
        const sb = window.sb;
        const tbody = document.getElementById('staff-table-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando...</td></tr>';

        const { data, error } = await sb
            .from('profiles')
            .select('id, full_name, email, area_id, area:areas(name), role, staff_salary, is_active')
            .eq('role', 'staff barra')
            .eq('is_active', true)
            .order('full_name');
        if(error) {
            console.error(error);
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error.</td></tr>';
            return;
        }
        this.staffList = data || [];
        this.renderStaff();
    },

    renderStaff: function() {
        const tbody = document.getElementById('staff-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        if(this.staffList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Sin staff cargado.</td></tr>';
            return;
        }

        this.staffList.forEach(s => {
            const tr = document.createElement('tr');
            const areaLabel = s.area ? `<span class="pill">${s.area.name}</span>` : '-';
            const statusLabel = s.is_active ? 'Activo' : 'Inactivo';
            const statusClass = s.is_active ? 'badge-success' : 'badge-muted';
            
            tr.innerHTML = `
                <td class="font-medium">${s.full_name || '-'}</td>
                <td>${s.email || '-'}</td>
                <td>${areaLabel}</td>
                <td class="text-center">${s.role || '-'}</td>
                <td class="text-center">$${Number(s.staff_salary || 0).toFixed(2)}</td>
                <td class="text-center"><span class="${statusClass}">${statusLabel}</span></td>
                <td class="text-center">
                    <button class="btn-icon btn-edit-staff">✏️</button>
                    <button class="btn-icon btn-delete-staff text-danger">🗑️</button>
                </td>
            `;
            
            tr.querySelector('.btn-edit-staff').addEventListener('click', () => this.openModalStaff(s));
            tr.querySelector('.btn-delete-staff').addEventListener('click', () => this.deleteStaff(s.id));
            
            tbody.appendChild(tr);
        });
    },

    openModalStaff: function(staff = null) {
        this.currentStaffId = staff ? staff.id : null;
        const modal = document.getElementById('modal-staff');
        const title = document.getElementById('modal-title-staff');
        
        title.textContent = staff ? 'Editar Staff' : 'Nuevo Usuario Staff';
        document.getElementById('staff-full-name').value = staff ? staff.full_name || '' : '';
        document.getElementById('staff-email').value = staff ? staff.email || '' : '';
        document.getElementById('staff-password').value = '';
        document.getElementById('staff-area').value = staff ? staff.area_id : '';
        document.getElementById('staff-salary').value = staff ? (staff.staff_salary || 0) : '';

        const emailInput = document.getElementById('staff-email');
        const passwordInput = document.getElementById('staff-password');
        if (emailInput) emailInput.disabled = !!staff;
        if (passwordInput) {
            passwordInput.required = !staff;
            passwordInput.disabled = !!staff;
            passwordInput.placeholder = staff ? 'Reset via admin' : 'Min. 6 caracteres';
        }

        modal.classList.remove('hidden');
    },

    saveStaff: async function() {
        const sb = window.sb;
        const payload = {
            full_name: document.getElementById('staff-full-name').value,
            email: document.getElementById('staff-email').value,
            password: document.getElementById('staff-password').value,
            area_id: document.getElementById('staff-area').value || null,
            role: 'staff barra',
            staff_salary: parseFloat(document.getElementById('staff-salary').value) || 0,
            is_active: true
        };

        let error;
        if (this.currentStaffId) {
            const res = await sb.from('profiles').update({
                full_name: payload.full_name,
                area_id: payload.area_id,
                role: payload.role,
                staff_salary: payload.staff_salary
            }).eq('id', this.currentStaffId);
            error = res.error;
        } else {
            const { error: fnError } = await sb.functions.invoke('create-staff', {
                body: payload
            });
            error = fnError;
        }

        if (error) return alert('Error: ' + error.message);

        document.getElementById('modal-staff').classList.add('hidden');
        this.loadStaff();
    },

    deleteStaff: async function(id) {
        if(!confirm('¿Eliminar este usuario staff?')) return;
        const sb = window.sb;
        const { error } = await sb.from('profiles').update({ is_active: false }).eq('id', id);
        if(error) return alert('Error: ' + error.message);
        this.loadStaff();
    }
};
