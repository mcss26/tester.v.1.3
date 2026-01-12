/**
 * Gerencia Module - Hierarchical Dashboard
 * Auth -> Welcome -> Balances (High Level) -> Operations (Grid)
 */

window.GerenciaModule = {
    session: null,
    profile: null,

    init: async function() {
        console.log('GerenciaModule init...');
        
        // 1. Check Session & Auth
        if (!window.sb) return;
        const { data: { session }, error } = await window.sb.auth.getSession();
        
        if (error || !session) {
            window.location.href = '../../login.html';
            return;
        }
        this.session = session;
        await this.loadUserProfile(session.user.id);
        
        // 2. UI Bindings
        this.bindUI();
    },

    bindUI: function() {
        // Balances
        document.getElementById('btn-balance-weekly')?.addEventListener('click', () => {
             alert('Reporte Balance Semanal: Próximamente');
        });
        document.getElementById('btn-balance-monthly')?.addEventListener('click', () => {
             alert('Reporte Balance Mensual: Próximamente');
        });

        // Operations Grid - Eventos
        document.getElementById('btn-events')?.addEventListener('click', () => {
             window.location.href = 'eventos.html';
        });
        
        // Modal Actions (Legacy/Cleanup - removed listener for btn-close-events as it's now a link in HTML)


        // Tabs
        ['new', 'active', 'history'].forEach(tab => {
            document.getElementById(`tab-btn-${tab}`)?.addEventListener('click', () => this.switchTab(tab));
        });

        // Create Event Submit
        document.getElementById('btn-create-submit')?.addEventListener('click', () => this.createEvent());

        // Placeholders
        document.getElementById('btn-select-date')?.addEventListener('click', () => alert('Módulo Seleccionar Fechas: Próximamente'));
        document.getElementById('btn-stock-live')?.addEventListener('click', () => alert('Módulo Stock En Vivo: Próximamente'));
        document.getElementById('btn-requests')?.addEventListener('click', () => alert('Módulo Solicitudes: Próximamente'));
        document.getElementById('btn-accounts-payable')?.addEventListener('click', () => alert('Módulo Cuentas por Pagar: Próximamente'));
        document.getElementById('btn-master-data')?.addEventListener('click', () => alert('Módulo Master Data: Próximamente'));

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            if (window.sb) {
                await window.sb.auth.signOut();
                window.location.href = '../../login.html';
            }
        });
    },

    // methods


    switchTab: function(tabName) {
        // Hide all contents
        ['new', 'active', 'history'].forEach(t => {
            document.getElementById(`tab-content-${t}`).classList.add('hidden');
            document.getElementById(`tab-btn-${t}`).classList.remove('active');
        });

        // Show selected
        document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
        document.getElementById(`tab-btn-${tabName}`).classList.add('active');

        if (tabName !== 'new') {
            this.loadEvents(tabName);
        }
    },

    loadEvents: async function(type) {
        const container = document.getElementById(type === 'active' ? 'list-active-events' : 'list-history-events');
        container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:13px;">Cargando...</p>';

        const { data: events, error } = await window.sb
            .from('events')
            .select('*')
            .order('date', { ascending: false });

        if (error) {
            container.innerHTML = '<p>Error al cargar eventos.</p>';
            return;
        }

        let filtered = [];
        if (type === 'active') {
            filtered = events.filter(e => ['planning', 'open'].includes(e.status));
        } else {
            filtered = events.filter(e => ['closed', 'cancelled'].includes(e.status));
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:13px;">No hay eventos.</p>';
            return;
        }

        container.innerHTML = '';
        filtered.forEach(e => {
            const dateStr = new Date(e.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
            
            // Render Table Row
            const tr = document.createElement('tr');
            
            // Status Badge Class
            const statusClass = `status-${e.status}`; // planning, open, closed
            
            // Columns
            tr.innerHTML = `
                <td>${dateStr.toUpperCase()}</td>
                <td>${e.name || 'Sin nombre'}</td>
                <td><span class="status-badge ${statusClass}">${e.status.toUpperCase()}</span></td>
                ${type === 'active' ? `<td><button class="btn-icon" style="opacity:0.7">Ver</button></td>` : ''}
            `;
            container.appendChild(tr);
        });
    },

    createEvent: async function() {
        const dateInput = document.getElementById('input-event-date');
        const nameInput = document.getElementById('input-event-name');
        
        if (!dateInput.value) {
            alert('Por favor ingrese una fecha.');
            return;
        }

        const { data, error } = await window.sb.from('events').insert({
            date: dateInput.value,
            name: nameInput.value || null,
            status: 'planning', // Default status
            created_by: this.session.user.id
        });

        if (error) {
            alert('Error: ' + error.message);
        } else {
            alert('Evento creado exitosamente.');
            dateInput.value = '';
            nameInput.value = '';
            this.switchTab('active'); // Go to list
        }
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

        // Strict Role Check: 'gerencia'
        const role = (data.role || '').toLowerCase();
        
        if (role !== 'gerencia') {
            window.location.href = '../../login.html';
            return;
        }

        this.profile = data;
        
        // Display Name (Uppercase) - Default to LUCIANO if matches or generic
        const nameEl = document.getElementById('user-name');
        if (nameEl) {
            const fullName = data.full_name || data.email || 'LUCIANO';
            // If user data has a name, use it, usually we want to respect the hardcoded design req "LUCIANO" but better to be dynamic if possible.
            // Requirement was "nombre luciano". We hardcoded it in HTML. We can overwrite if needed or leave as static if only one user.
            // Leaving static in HTML "LUCIANO" as requested, but if dynamic needed:
            // nameEl.textContent = fullName.toUpperCase(); 
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    GerenciaModule.init();
});
