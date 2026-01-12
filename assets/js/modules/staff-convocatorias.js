'use strict';

window.StaffConvocatoriasModule = {
    searchQuery: '',
    invitations: [],
    currentProfile: null,

    init: async function() {
        console.log('StaffConvocatoriasModule init');
        this.bindEvents();
        await this.loadInvitations();
    },

    bindEvents: function() {
        const searchInput = document.getElementById('search-staff-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = event.target.value.toLowerCase().trim();
                this.renderInvitations();
            });
        }
    },

    loadInvitations: async function() {
        const sb = window.sb;
        const listContainer = document.getElementById('staff-list');
        listContainer.innerHTML = '<p class="text-center text-muted">Cargando invitaciones...</p>';

        if (!sb) return;

        const { data: { user }, error: userError } = await sb.auth.getUser();
        if (userError || !user) {
            listContainer.innerHTML = '<p class="text-danger text-center">Sesión inválida.</p>';
            return;
        }

        const { data: profile } = await sb
            .from('profiles')
            .select('id, full_name, email, staff_salary, role, is_active')
            .eq('id', user.id)
            .single();
        this.currentProfile = profile || null;
        if (this.currentProfile && (this.currentProfile.role || '').toLowerCase() !== 'staff barra') {
            listContainer.innerHTML = '<p class="text-danger text-center">Acceso no autorizado.</p>';
            return;
        }
        if (this.currentProfile && this.currentProfile.is_active === false) {
            await sb.auth.signOut();
            listContainer.innerHTML = '<p class="text-danger text-center">Usuario desactivado.</p>';
            return;
        }

        const { data: invitations, error } = await sb
            .from('staff_convocations')
            .select(`
                *,
                event:events(id, name, date)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            listContainer.innerHTML = '<p class="text-danger text-center">Error cargando invitaciones.</p>';
            return;
        }

        this.invitations = invitations || [];
        this.renderInvitations();
    },

    renderInvitations: function() {
        const listContainer = document.getElementById('staff-list');
        listContainer.innerHTML = '';

        const filtered = this.invitations.filter(inv => {
            const evt = (inv.event?.name || '').toLowerCase();
            const date = (inv.event?.date || '').toLowerCase();
            return !this.searchQuery || evt.includes(this.searchQuery) || date.includes(this.searchQuery);
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted">No hay invitaciones.</p>';
            return;
        }

        filtered.forEach(inv => {
            const card = document.createElement('div');
            card.className = 'request-card';
            card.dataset.status = inv.status;
            
            const isPending = inv.status === 'pending';
            const statusLabel = inv.status === 'pending' ? 'Pendiente' : (inv.status === 'accepted' ? 'Confirmado' : 'Rechazado');
            const statusClass = inv.status === 'pending' ? 'status-neutral' : (inv.status === 'accepted' ? 'status-ok' : 'status-critical');

            card.innerHTML = `
                <div class="request-meta">
                    <span class="text-strong text-white">${inv.event?.name || 'Evento'}</span>
                    <span class="text-muted text-sm">${inv.event?.date || '-'}</span>
                    <div class="mt-sm text-sm">
                        <span class="pill">${this.currentProfile?.full_name || this.currentProfile?.email || 'Staff'}</span>
                    </div>
                </div>
                <div class="request-actions">
                    <span class="status-pill ${statusClass} me-2">${statusLabel}</span>
                    ${isPending ? `
                        <button class="btn-success btn-sm" data-action="accept">Aceptar</button>
                        <button class="btn-danger btn-sm" data-action="reject">Rechazar</button>
                    ` : ''}
                </div>
            `;
            
            if (isPending) {
                card.querySelector('[data-action="accept"]').addEventListener('click', () => this.handleDecision(inv, 'accepted'));
                card.querySelector('[data-action="reject"]').addEventListener('click', () => this.handleDecision(inv, 'rejected'));
            }

            listContainer.appendChild(card);
        });
    },

    handleDecision: async function(invitation, decision) {
        if (!confirm(`¿Confirmar decisión: ${decision === 'accepted' ? 'Asistiré' : 'Rechazar'}?`)) return;

        const sb = window.sb;
        
        // 1. Update Convocation Status
        const { error: updateError } = await sb.from('staff_convocations')
            .update({ status: decision })
            .eq('id', invitation.id);

        if (updateError) {
            alert('Error updating status: ' + updateError.message);
            return;
        }

        // 2. If Accepted, Generate Payment
        if (decision === 'accepted') {
            const amount = this.currentProfile?.staff_salary || 0;
            const { error: payError } = await sb.from('accounts_payable').insert({
                event_id: invitation.event_id,
                concept: `Pago Staff: ${this.currentProfile?.full_name || this.currentProfile?.email || 'Staff'}`,
                amount: amount,
                category: 'personal', // 'pagos personal'
                status: 'pending',
                due_date: invitation.event?.date // Payment due on event day
            });

            if (payError) {
                alert('Aviso: Se confirmó asistencia pero falló la generación del pago: ' + payError.message);
            } else {
                alert('Confirmado! Se ha generado tu orden de pago.');
            }
        } else {
            alert('Invitación rechazada.');
        }

        this.loadInvitations();
    }
};
