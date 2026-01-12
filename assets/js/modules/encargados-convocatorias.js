'use strict';

window.EncargadosConvocatoriasModule = {
    userProfile: null,
    activeEvent: null,
    myStaff: [],
    convocationsMap: {}, // staff_id -> status
    currentAreaId: null,

    init: async function() {
        console.log('EncargadosConvocatoriasModule initialized');
        await this.loadUserProfile();
        await this.loadActiveEvent();
        
        if (this.activeEvent) {
            this.bindUI();
            await this.loadStaffAndConvocations();
        } else {
            this.showNoActiveEvent();
        }
    },

    bindUI: function() {
        const tabs = document.querySelectorAll('#encargados-tabs .tab-btn');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                // Filter logic if needed, or if multi-area
                // For now, if user has specific area, tabs might be disabled or uniform
                console.log('Tab clicked', tab.dataset.area);
            });
        });

        const searchInput = document.getElementById('search-encargados-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterStaff(e.target.value));
        }
    },

    loadUserProfile: async function() {
        const sb = window.sb;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;

        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        this.userProfile = profile;
        this.currentAreaId = profile?.area_id;

        // If user has area, update UI to reflect it
        if (this.currentAreaId) {
            // Hide tabs or select the one matching (mapped by name? ID is better but tabs use names)
            // Ideally we'd map area_id to tab name. For MVP we'll just show the staff we fetched.
            document.getElementById('encargados-tabs').style.display = 'none'; // Simplify: Hide tabs if filtered by DB
        }
    },

    loadActiveEvent: async function() {
        const sb = window.sb;
        // Look for 'open' event first, then 'planning'?
        // Usually Encargados only see 'planning' (to prepare) or 'open' (confirmed).
        // Let's take the latest event that is NOT closed.
        const { data, error } = await sb
            .from('events')
            .select('*')
            .neq('status', 'closed')
            .order('date', { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            this.activeEvent = data[0];
            const headerDate = document.getElementById('encargados-date');
            if (headerDate) headerDate.value = this.activeEvent.date;
        }
    },

    showNoActiveEvent: function() {
        const container = document.getElementById('encargados-table-body');
        container.innerHTML = '<tr><td colspan="4" class="text-center">No hay eventos activos o en planificación.</td></tr>';
    },

    loadStaffAndConvocations: async function() {
        const sb = window.sb;
        
        // 1. Fetch Staff
        let staffQuery = sb.from('profiles')
            .select('id, full_name, email, area_id')
            .eq('role', 'staff barra')
            .eq('is_active', true);
        
        if (this.currentAreaId) {
            staffQuery = staffQuery.eq('area_id', this.currentAreaId);
        }
        
        const { data: staff, error: staffError } = await staffQuery;
        if (staffError) {
            console.error('Error loading staff', staffError);
            return;
        }
        this.myStaff = staff || [];

        // 2. Fetch Convocations for this event
        const { data: convocations, error: convError } = await sb
            .from('staff_convocations')
            .select('*')
            .eq('event_id', this.activeEvent.id);

        this.convocationsMap = {};
        if (convocations) {
            convocations.forEach(c => {
                this.convocationsMap[c.user_id] = c.status;
            });
        }

        this.renderStaffList(this.myStaff);
    },

    renderStaffList: function(staffList) {
        const container = document.getElementById('encargados-table-body');
        
        if (!staffList.length) {
            container.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se encontró personal.</td></tr>';
            return;
        }

        container.innerHTML = staffList.map(s => {
            const status = this.convocationsMap[s.id] || null; // null means not convocated
            
            let statusBadge = '<span class="status-pill status-neutral">Disponible</span>';
            let actionBtn = `<button class="btn-success btn-sm" onclick="EncargadosConvocatoriasModule.convocate('${s.id}')">Convocar</button>`;

            if (status === 'pending') {
                statusBadge = '<span class="status-pill status-warning">Convocado</span>';
                actionBtn = `<button class="btn-secondary btn-sm" disabled>Enviado</button>`;
            } else if (status === 'accepted') {
                statusBadge = '<span class="status-pill status-ok">Confirmado</span>';
                actionBtn = `<button class="btn-secondary btn-sm" disabled>Listo</button>`;
            } else if (status === 'rejected') {
                statusBadge = '<span class="status-pill status-critical">Rechazado</span>';
                actionBtn = `<button class="btn-secondary btn-sm" disabled>Rechazado</button>`;
            }

            return `
                <tr>
                    <td>${s.full_name || s.email || 'Sin nombre'}</td>
                    <td>Staff</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    },

    convocate: async function(staffId) {
        if (!this.activeEvent) return;

        // Optimistic UI update could happen here, but let's just wait for DB
        const sb = window.sb;
        const { error } = await sb.from('staff_convocations').insert({
            event_id: this.activeEvent.id,
            user_id: staffId,
            status: 'pending'
        });

        if (error) {
            alert('Error al convocar: ' + error.message);
        } else {
            // Update local state
            this.convocationsMap[staffId] = 'pending';
            this.renderStaffList(this.myStaff); // re-render to show updated status
        }
    },

    filterStaff: function(query) {
        if (!query) {
            this.renderStaffList(this.myStaff);
            return;
        }
        const lower = query.toLowerCase();
        const filtered = this.myStaff.filter(s => {
            const name = (s.full_name || s.email || '').toLowerCase();
            return name.includes(lower);
        });
        this.renderStaffList(filtered);
    }
};
