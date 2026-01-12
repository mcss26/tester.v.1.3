'use strict';

window.LogisticaPersonalModule = {
    activeArea: 'all',
    searchQuery: '',
    activeEvent: null,
    rows: [],

    init: async function() {
        this.bindEvents();
        await this.loadActiveEvent();
        await this.loadConvocatorias();
    },

    bindEvents: function() {
        const tabs = document.querySelectorAll('#personal-tabs .tab-btn');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                this.setActiveTab(tab.dataset.area || 'all');
            });
        });

        const searchInput = document.getElementById('search-personal-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = this.normalizeKey(event.target.value);
                this.applyFilters();
            });
        }
    },

    setActiveTab: function(area) {
        this.activeArea = area;
        const tabs = document.querySelectorAll('#personal-tabs .tab-btn');
        tabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.area === area);
        });
        this.applyFilters();
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
            const dateInput = document.getElementById('personal-date');
            if (dateInput) dateInput.value = this.activeEvent.date;
        }
    },

    loadConvocatorias: async function() {
        const tbody = document.getElementById('personal-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Cargando...</td></tr>';

        const sb = window.sb;
        if (!sb) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Sin conexion.</td></tr>';
            return;
        }

        if (!this.activeEvent) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No hay eventos activos.</td></tr>';
            return;
        }

        const { data: staff, error: staffError } = await sb
            .from('profiles')
            .select('id, full_name, email, area:areas(name, slug)')
            .eq('role', 'staff barra')
            .eq('is_active', true)
            .order('full_name');

        if (staffError) {
            console.error('Error loading staff:', staffError);
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error cargando personal.</td></tr>';
            return;
        }

        if (!staff || staff.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin personal cargado.</td></tr>';
            return;
        }

        const { data: convocations, error } = await sb
            .from('staff_convocations')
            .select('user_id, status')
            .eq('event_id', this.activeEvent.id);

        if (error) {
            console.error('Error loading convocatorias:', error);
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error cargando convocatorias.</td></tr>';
            return;
        }

        const statusMap = {};
        (convocations || []).forEach(item => {
            statusMap[item.user_id] = item.status;
        });

        this.rows = staff.map(item => {
            const areaName = item.area?.name || '';
            const areaSlug = item.area?.slug || '';
            return {
                name: item.full_name || item.email || 'Sin nombre',
                area: areaName,
                areaKey: this.normalizeKey(areaSlug || areaName),
                status: statusMap[item.id] || 'not_convoked'
            };
        });

        this.renderRows();
        this.applyFilters();
    },

    renderRows: function() {
        const tbody = document.getElementById('personal-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin convocatorias.</td></tr>';
            return;
        }

        this.rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.dataset.personalRow = '';
            tr.dataset.area = row.areaKey;
            tr.dataset.name = this.normalizeKey(row.name);

            const statusLabel = this.getStatusLabel(row.status);
            const statusClass = this.getStatusClass(row.status);

            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.area || '-'}</td>
                <td class="text-center"><span class="status-pill ${statusClass}">${statusLabel}</span></td>
            `;

            tbody.appendChild(tr);
        });
    },

    getStatusLabel: function(status) {
        if (status === 'accepted') return 'Si';
        if (status === 'rejected') return 'No';
        if (status === 'pending') return 'Pendiente';
        return 'No convocado';
    },

    getStatusClass: function(status) {
        if (status === 'accepted') return 'status-ok';
        if (status === 'rejected') return 'status-critical';
        return 'status-neutral';
    },

    applyFilters: function() {
        const rows = document.querySelectorAll('[data-personal-row]');
        rows.forEach((row) => {
            const area = row.dataset.area || '';
            const name = row.dataset.name || '';
            const matchesArea = this.activeArea === 'all' || area.includes(this.activeArea);
            const matchesSearch = !this.searchQuery || name.includes(this.searchQuery) || area.includes(this.searchQuery);
            row.classList.toggle('hidden', !(matchesArea && matchesSearch));
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
