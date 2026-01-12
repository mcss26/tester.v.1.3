/**
 * Encargado de Barra - Interactive Flow
 * Auth -> Welcome -> Date Chips -> Action -> Staff Dashboard
 */

window.EncargadoBarra = {
    MANAGED_AREA_SLUG: 'barra',
    session: null,
    profile: null,
    activeEvent: null,

    init: async function() {
        console.log('EncargadoBarra init...');
        
        // 1. Check Session & Auth
        if (!window.sb) return;
        const { data: { session }, error } = await window.sb.auth.getSession();
        
        if (error || !session) {
            window.location.href = '../../login.html';
            return;
        }
        this.session = session;
        await this.loadUserProfile(session.user.id);
        
        // 2. Load Open Events
        await this.loadOpenEvents();

        // 3. UI Bindings
        this.bindUI();
    },

    bindUI: function() {
        // Convocar Action
        document.getElementById('btn-open-convocation')?.addEventListener('click', () => {
            this.openStaffDashboard();
        });
        
        // Future Actions
        document.getElementById('btn-replenishment')?.addEventListener('click', () => {
            alert('Módulo de Reposición próximamente.');
        });
        
        document.getElementById('btn-night-mode')?.addEventListener('click', () => {
            alert('Módulo de Noche próximamente.');
        });
        
        // Close Dashboard
        document.getElementById('btn-close-dashboard')?.addEventListener('click', () => {
            document.getElementById('staff-dashboard').classList.add('hidden');
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            if (window.sb) {
                await window.sb.auth.signOut();
                window.location.href = '../../login.html';
            }
        });
    },

    loadUserProfile: async function(userId) {
        const { data, error } = await window.sb
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !data) {
            window.location.href = '../../login.html';
            return;
        }

        if (data.is_active === false) {
            await window.sb.auth.signOut();
            window.location.href = '../../login.html';
            return;
        }

        // Strict Role Check
        const role = (data.role || '').toLowerCase();
        const isEncargadoBarra = role === 'encargado barra';
        
        if (!isEncargadoBarra) {
            // alert('Acceso no autorizado.'); // Removed for cleaner UX flow
            window.location.href = '../../login.html';
            return;
        }

        this.profile = data;
        
        // Display Name (Uppercase)
        const nameEl = document.getElementById('user-name');
        if (nameEl) {
            const fullName = data.full_name || data.email || 'Usuario';
            nameEl.textContent = fullName.toUpperCase();
        }
    },

    loadOpenEvents: async function() {
        const { data: events, error } = await window.sb
            .from('events')
            .select('*')
            .neq('status', 'closed')
            .order('date', { ascending: true });

        const chipsContainer = document.getElementById('date-chips');
        if (!chipsContainer) return;

        chipsContainer.innerHTML = ''; 

        if (error || !events || events.length === 0) {
            chipsContainer.innerHTML = '<p style="font-size:12px; opacity:0.6;">No hay eventos abiertos.</p>';
            return;
        }

        events.forEach(event => {
            const dateStr = new Date(event.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
            
            const chip = document.createElement('div');
            chip.className = 'date-chip';
            chip.textContent = dateStr.toUpperCase();
            chip.onclick = () => this.selectEvent(event, chip);
            
            chipsContainer.appendChild(chip);
        });
    },

    selectEvent: function(event, chipEl) {
        this.activeEvent = event;

        // Highlight Active Chip
        document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
        chipEl.classList.add('active');

        // Show Action Button (Reveal)
        const actionContainer = document.getElementById('action-container');
        if(actionContainer) actionContainer.classList.remove('hidden');
        
        // Hide dashboard if changing event to reset state
        const dash = document.getElementById('staff-dashboard');
        if(dash) dash.classList.add('hidden');
    },

    openStaffDashboard: async function() {
        if (!this.activeEvent) return;

        const dashboard = document.getElementById('staff-dashboard');
        if(!dashboard) return;
        
        dashboard.classList.remove('hidden');
        
        // Load Staff for this event
        await this.loadStaffForEvent(this.activeEvent.id);
    },

    loadStaffForEvent: async function(eventId) {
        const listContainer = document.getElementById('staff-list');
        if(!listContainer) return;

        listContainer.innerHTML = '<div style="text-align:center; padding:20px;">Cargando equipo...</div>';

        // 1. Get Area ID
        let areaId = this.profile.area_id;
        if (!areaId) {
            const { data: areaData } = await window.sb
                .from('areas')
                .select('id')
                .eq('slug', this.MANAGED_AREA_SLUG)
                .single();
            areaId = areaData?.id || null;
        }

        if (!areaId) {
            listContainer.innerHTML = '<p>Error: Área no definida.</p>';
            return;
        }

        // 2. Fetch Staff
        const { data: staffUsers } = await window.sb
            .from('profiles')
            .select('id, full_name, email, area_id')
            .eq('role', 'staff barra')
            .eq('area_id', areaId)
            .eq('is_active', true);

        if (!staffUsers || staffUsers.length === 0) {
             listContainer.innerHTML = '<p>No hay personal disponible.</p>';
             // Continue to calculate requirements even if no staff available to show cost/need
        }

        // Calculate Requirements in parallel
        this.calculateRequiredStaff(eventId, areaId);

        // 3. Fetch Convocations
        const { data: convocations } = await window.sb
            .from('staff_convocations')
            .select('user_id, status')
            .eq('event_id', eventId);

        const convocationMap = {};
        if (convocations) {
            convocations.forEach(c => convocationMap[c.user_id] = c.status);
        }

        // 4. Render (Exclude Me)
        if (staffUsers && staffUsers.length > 0) {
            // Filter out current user
            const filteredStaff = staffUsers.filter(u => u.id !== this.session.user.id);
            
            // Sort remaining alphabetically
            filteredStaff.sort((a, b) => {
                const aName = (a.full_name || a.email || '').toLowerCase();
                const bName = (b.full_name || b.email || '').toLowerCase();
                return aName.localeCompare(bName);
            });
            
            this.renderStaffList(filteredStaff, convocationMap);
        }
    },

    calculateRequiredStaff: async function(eventId, areaId) {
        const countEl = document.getElementById('required-count');
        if (!countEl) return;
        
        countEl.textContent = '...';

        // 1. Get Positions for Area
        const { data: positions } = await window.sb
            .from('job_positions')
            .select('id')
            .eq('area_id', areaId);
            
        const positionIds = (positions || []).map(p => p.id);
        
        // 2. Get Allocations for Event
        const { data: allocations } = await window.sb
            .from('staff_allocations')
            .select('quantity, position_id, area_id')
            .eq('event_id', eventId);
            
        let total = 0;
        if (allocations) {
            allocations.forEach(alloc => {
                // Match by explicit area_id OR by position belonging to area
                if (alloc.area_id === areaId || (positionIds.length && positionIds.includes(alloc.position_id))) {
                    total += (alloc.quantity || 0);
                }
            });
        }
        
        countEl.textContent = total > 0 ? total : '0';
    },

    renderStaffList: function(staff, convocationMap) {
        const listContainer = document.getElementById('staff-list');
        listContainer.innerHTML = '';

        staff.forEach(person => {
            const status = convocationMap[person.id];
            
            const row = document.createElement('div');
            row.className = 'staff-row';

            let actionHtml = '';
            // If already accepted/rejected/pending
            if (!status) {
                // Not convocated
                actionHtml = `<button class="btn-convocate-small" onclick="EncargadoBarra.convocate('${person.id}', this)">Convocar</button>`;
            } else {
                // Status Badge
                const label = status === 'pending' ? 'Enviado' : (status === 'accepted' ? 'Confirmado' : 'Rechazado');
                const color = status === 'accepted' ? '#30D158' : (status === 'rejected' ? '#FF453A' : '#FF9F0A');
                actionHtml = `<span style="font-size:12px; color:${color}; font-weight:500;">${label}</span>`;
            }

            const displayName = person.full_name || person.email || 'Sin nombre';
            row.innerHTML = `
                <div class="staff-info">
                    <span class="staff-name">${displayName}</span>
                    <span class="staff-role">Staff</span>
                </div>
                <div>${actionHtml}</div>
            `;
            listContainer.appendChild(row);
        });
    },

    convocate: async function(staffId, btnElement) {
        if (!this.activeEvent) return;
        const originalText = btnElement.textContent;
        btnElement.textContent = '...';
        btnElement.disabled = true;

        const { error } = await window.sb
            .from('staff_convocations')
            .insert({
                event_id: this.activeEvent.id,
                user_id: staffId,
                status: 'pending',
                created_at: new Date()
            });

        if (error) {
            console.error(error);
            alert('Error al convocar');
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        } else {
            // Immediate feedback update logic replacement
            const parent = btnElement.parentElement;
            parent.innerHTML = `<span style="font-size:12px; color:#FF9F0A; font-weight:500;">Enviado</span>`;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    EncargadoBarra.init();
});
