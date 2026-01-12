'use strict';

window.EncargadosAreaModule = {
    activeTab: 'convocatoria',
    searchQuery: '',
    activeEvent: null,
    areaId: null,
    areaName: null,
    staffList: [],
    convocationsMap: {},

    init: async function() {
        this.bindUI();
        await this.resolveArea();
        await this.loadActiveEvent();
        await this.loadStaffAndConvocations();
        this.setActiveTab(this.activeTab);
    },

    bindUI: function() {
        const tabs = document.querySelectorAll('#encargados-tabs .tab-btn');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => this.setActiveTab(tab.dataset.tab));
        });

        const searchInput = document.getElementById('search-encargados-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = this.normalizeKey(event.target.value);
                this.applyFilters();
            });
        }
    },

    resolveArea: async function() {
        const page = document.getElementById('page-content');
        const areaKey = (page?.dataset?.encargadosArea || '').trim();
        if (!areaKey) return;

        const sb = window.sb;
        if (!sb) return;

        const { data, error } = await sb
            .from('areas')
            .select('id, name, slug')
            .eq('active', true)
            .eq('slug', areaKey)
            .single();

        if (error) {
            console.error('Error loading areas:', error);
            return;
        }

        if (data) {
            this.areaId = data.id;
            this.areaName = data.name;
        }
    },

    loadActiveEvent: async function() {
        const sb = window.sb;
        if (!sb) return;

        const { data, error } = await sb
            .from('events')
            .select('*')
            .neq('status', 'closed')
            .order('date', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error loading events:', error);
            return;
        }

        if (data && data.length > 0) {
            this.activeEvent = data[0];
            const dateInput = document.getElementById('encargados-date');
            if (dateInput) dateInput.value = this.activeEvent.date;
        }
    },

    loadStaffAndConvocations: async function() {
        const tbody = document.getElementById('encargados-table-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';

        const sb = window.sb;
        if (!sb) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Sin conexion.</td></tr>';
            return;
        }

        if (!this.activeEvent) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay eventos activos.</td></tr>';
            return;
        }

        // 1. Fetch Area Allocations (Limit)
        let areaLimit = 0;
        if (this.areaId) {
            const { data: allocations, error: allocError } = await sb.from('staff_allocations')
                .select('quantity')
                .eq('event_id', this.activeEvent.id)
                .eq('area_id', this.areaId);
            
            if (!allocError && allocations) {
                areaLimit = allocations.reduce((sum, item) => sum + (item.quantity || 0), 0);
            }
        }
        
        // Show Limit in UI (Optional but good UX)
        // We can inject a banner or log it
        console.log(`Limit for area ${this.areaName}: ${areaLimit}`);


        // 2. Fetch Staff
        let staffQuery = sb.from('profiles')
            .select('id, full_name, email, area_id')
            .eq('role', 'staff barra');
        if (this.areaId) {
            staffQuery = staffQuery.eq('area_id', this.areaId);
        }

        const { data: staff, error: staffError } = await staffQuery.eq('is_active', true).order('full_name');
        if (staffError) {
            console.error('Error loading staff', staffError);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error cargando staff.</td></tr>';
            return;
        }

        this.staffList = staff || [];
        const staffIds = this.staffList.map(item => item.id);
        if (staffIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay staff para esta area.</td></tr>';
            return;
        }

        // 3. Fetch Convocations
        const { data: convocations, error: convError } = await sb
            .from('staff_convocations')
            .select('*')
            .eq('event_id', this.activeEvent.id)
            .in('user_id', staffIds);

        if (convError) {
            console.error('Error loading convocatorias', convError);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error cargando convocatorias.</td></tr>';
            return;
        }

        this.convocationsMap = {};
        let currentConvocationsCount = 0;
        
        (convocations || []).forEach(conv => {
            this.convocationsMap[conv.user_id] = conv.status;
            if (conv.status !== 'rejected') {
                currentConvocationsCount++;
            }
        });

        // 4. Render
        const isLimitReached = currentConvocationsCount >= areaLimit;
        this.renderStaffList(this.staffList, isLimitReached, areaLimit, currentConvocationsCount);
        this.applyFilters();
    },

    renderStaffList: function(staffList, isLimitReached, areaLimit, currentCount) {
        const tbody = document.getElementById('encargados-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Header Info
        const infoRow = document.createElement('tr');
        infoRow.innerHTML = `
            <td colspan="4" class="text-right text-muted text-sm" style="background: rgba(0,0,0,0.2);">
                Capacidad: <span class="text-strong text-white">${currentCount}</span> / <span class="text-strong text-white">${areaLimit}</span>
                ${isLimitReached ? '<span class="text-danger ms-2">(Límite alcanzado)</span>' : ''}
            </td>
        `;
        tbody.appendChild(infoRow);

        if (!staffList.length) {
            tbody.innerHTML += '<tr><td colspan="4" class="text-center text-muted">No se encontro personal.</td></tr>';
            return;
        }

        staffList.forEach(staff => {
            const status = this.convocationsMap[staff.id] || null;
            const statusLabel = this.getStatusLabel(status);
            const statusClass = this.getStatusClass(status);
            const actionHtml = this.getActionButton(status, staff.id, isLimitReached);

            const displayName = staff.full_name || staff.email || 'Sin nombre';
            const tr = document.createElement('tr');
            tr.dataset.encargadosRow = '';
            tr.dataset.name = this.normalizeKey(displayName);
            tr.innerHTML = `
                <td>${displayName}</td>
                <td>Staff</td>
                <td class="text-center"><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td class="text-center">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('button[data-action="convocar"]').forEach(button => {
            button.addEventListener('click', () => this.convocate(button.dataset.staffId));
        });
    },

    getStatusLabel: function(status) {
        if (status === 'pending') return 'Convocado';
        if (status === 'accepted') return 'Confirmado';
        if (status === 'rejected') return 'Rechazado';
        return 'Disponible';
    },

    getStatusClass: function(status) {
        if (status === 'pending') return 'status-warning';
        if (status === 'accepted') return 'status-ok';
        if (status === 'rejected') return 'status-critical';
        return 'status-neutral';
    },

    getActionButton: function(status, staffId, isLimitReached) {
        if (status === 'pending') {
            return '<button type="button" class="btn-secondary btn-sm" disabled>Enviado</button>';
        }
        if (status === 'accepted') {
            return '<button type="button" class="btn-secondary btn-sm" disabled>Listo</button>';
        }
        if (status === 'rejected') {
            return '<button type="button" class="btn-secondary btn-sm" disabled>Rechazado</button>';
        }
        
        // Available
        if (isLimitReached) {
             return '<button type="button" class="btn-secondary btn-sm" disabled title="Límite alcanzado">Lleno</button>';
        }

        return `<button type="button" class="btn-success btn-sm" data-action="convocar" data-staff-id="${staffId}">Convocar</button>`;
    },

    convocate: async function(staffId) {
        if (!this.activeEvent) return;
        const sb = window.sb;
        if (!sb) return;

        const { error } = await sb.from('staff_convocations').insert({
            event_id: this.activeEvent.id,
            user_id: staffId,
            status: 'pending'
        });

        if (error) {
            alert('Error al convocar: ' + error.message);
            return;
        }

        this.convocationsMap[staffId] = 'pending';
        this.loadStaffAndConvocations();
    },

    setActiveTab: function(tab) {
        this.activeTab = tab;
        const tabs = document.querySelectorAll('#encargados-tabs .tab-btn');
        tabs.forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });

        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach((panel) => {
            panel.classList.toggle('hidden', panel.id !== `tab-${tab}`);
        });
    },

    applyFilters: function() {
        const rows = document.querySelectorAll('[data-encargados-row]');
        rows.forEach((row) => {
            const name = row.dataset.name || '';
            const matches = !this.searchQuery || name.includes(this.searchQuery);
            row.classList.toggle('hidden', !matches);
        });
    },

    normalizeKey: function(value) {
        return (value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }
};
