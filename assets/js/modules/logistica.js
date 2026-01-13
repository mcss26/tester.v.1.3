/**
 * Logistica Module - Interactive Flow
 * Auth -> Welcome -> Date Chips -> Actions (2x2 Grid)
 */

window.LogisticaModule = {
    session: null,
    profile: null,
    activeEvent: null,

    init: async function() {
        console.log('LogisticaModule init...');
        
        // 1. Check Session & Auth
        if (!window.sb) return;
        const { data: { session }, error } = await window.sb.auth.getSession();
        
        if (error || !session) {
            window.location.href = '../../login.html';
            return;
        }
        this.session = session;
        await this.loadUserProfile(session.user.id);
        
        // 2. Identify Page Context
        const page = document.body.dataset.page; 
        
        if (page === 'erp') {
            await this.loadOpenEvents();
            this.bindUI_ERP();
        } else {
             // Index page
             this.bindUI_Index();
        }
    },

    bindUI_Index: function() {
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            if (window.sb) {
                await window.sb.auth.signOut();
                window.location.href = '../../login.html';
            }
        });
    },

    bindUI_ERP: function() {
        // Actions
        document.getElementById('btn-ready-to-go')?.addEventListener('click', () => {
             this.openDashboard('ready-to-go');
        });
        
        document.getElementById('btn-nomina')?.addEventListener('click', () => {
             this.openDashboard('nomina');
        });

        document.getElementById('btn-requests')?.addEventListener('click', () => {
             this.openDashboard('requests');
        });

        document.getElementById('btn-replenishment')?.addEventListener('click', () => {
             this.openDashboard('replenishment');
        });
        
        // Close Dashboard
        document.getElementById('btn-close-dashboard')?.addEventListener('click', () => {
            document.getElementById('staff-dashboard').classList.add('hidden');
            this.toggleActionContainer(true);
        });
    },

    openDashboard: function(mode) {
        // Enforce Event Selection? 
        if (!this.activeEvent) {
             // For now, simple alert or check
             // alert('Selecciona una fecha primero.'); // UX choice: maybe allow browsing without event?
             // But logistics is usually event-centric.
             // Let's assume yes.
        }

        const dashboard = document.getElementById('staff-dashboard');
        const title = document.getElementById('dashboard-title');
        const list = document.getElementById('content-list');
        
        if (dashboard && list) {
            list.textContent = ''; 
            dashboard.classList.remove('hidden');
            this.toggleActionContainer(false);
            
            if (title) title.textContent = this.getModeTitle(mode);
            
            const msg = document.createElement('p');
            msg.className = 'op-muted op-message';
            msg.textContent = 'Módulo en desarrollo: ' + mode;
            list.appendChild(msg);
        }
    },

    getModeTitle: function(mode) {
        const map = {
            'ready-to-go': 'Ready-to-go',
            'nomina': 'Personal',
            'requests': 'Solicitudes',
            'replenishment': 'Reposiciones'
        };
        return map[mode] || mode;
    },

    toggleActionContainer: function(show) {
        const container = document.getElementById('action-container');
        if (container) container.classList.toggle('hidden', !show);
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

        // Strict Role Check: 'logistica'
        const role = (data.role || '').toLowerCase();
        
        if (role !== 'logistica') {
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

        // Show Action Container
        this.toggleActionContainer(true);
        
        // Hide dashboard if open
        const dash = document.getElementById('staff-dashboard');
        if (dash) dash.classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    LogisticaModule.init();
});
