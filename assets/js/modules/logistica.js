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
        
        // 2. Load Open Events
        await this.loadOpenEvents();

        // 3. UI Bindings
        this.bindUI();
    },

    bindUI: function() {
        // Actions
        document.getElementById('btn-ready-to-go')?.addEventListener('click', () => {
             alert('Módulo Ready-to-go: Próximamente');
        });
        
        document.getElementById('btn-nomina')?.addEventListener('click', () => {
             alert('Módulo Nómina: Próximamente');
        });

        document.getElementById('btn-replenishment')?.addEventListener('click', () => {
             alert('Módulo Reposiciones: Próximamente');
        });

        document.getElementById('btn-arrivals')?.addEventListener('click', () => {
             alert('Módulo Arribos: Próximamente');
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
        const actionContainer = document.getElementById('action-container');
        if(actionContainer) actionContainer.classList.remove('hidden');
        
        // Hide dashboard if open
        document.getElementById('staff-dashboard').classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    LogisticaModule.init();
});
