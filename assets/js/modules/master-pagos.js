'use strict';

window.MasterPagosModule = {
    paymentTypes: [],

    init: function() {
        console.log('MasterPagosModule initialized');
        this.loadPaymentTypes();
        this.bindModal();

        const formNew = document.getElementById('form-new-pago');
        if (formNew) {
            formNew.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createPaymentType();
            });
        }
    },

    loadPaymentTypes: async function() {
        const container = document.getElementById('pagos-list');
        this.setMessage(container, 'Cargando...', false);
        const sb = window.sb;

        const { data, error } = await sb
            .from('payment_categories')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error loading payments:', error);
            this.setMessage(container, 'Error: ' + error.message, true);
            return;
        }

        this.paymentTypes = data;
        this.renderTable(data);
    },

    renderTable: function(data) {
        const container = document.getElementById('pagos-list');
        if (data.length === 0) {
            this.setMessage(container, 'No hay tipos de pago registrados.', false);
            return;
        }

        let html = `
            <table class="table-compact">
                <thead>
                    <tr>
                        <th class="text-center">ID</th>
                        <th>Tipo de Comprobante</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(item => {
            html += `
                <tr>
                    <td class="text-center">${item.id}</td>
                    <td>${item.tipo_comprobante}</td>
                    <td class="text-center">
                        <button type="button" class="btn-danger btn-sm" data-id="${item.id}">Eliminar</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('button[data-id]').forEach(button => {
            button.addEventListener('click', () => this.deletePaymentType(button.dataset.id));
        });
    },

    createPaymentType: async function() {
        const input = document.getElementById('new-pago-name');
        const name = input.value.trim();
        if (!name) return;

        const sb = window.sb;
        const { error } = await sb
            .from('payment_categories')
            .insert({ tipo_comprobante: name });

        if (error) {
            alert('Error al crear: ' + error.message);
        } else {
            alert('Tipo de pago creado.');
            input.value = '';
            this.closeModal();
            this.loadPaymentTypes();
        }
    },

    deletePaymentType: async function(id) {
        if (!confirm('¿Seguro de eliminar este tipo de pago?')) return;
        
        const sb = window.sb;
        const { error } = await sb
            .from('payment_categories')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error al eliminar: ' + error.message);
        } else {
            this.loadPaymentTypes();
        }
    },

    bindModal: function() {
        const openBtn = document.getElementById('btn-new-payment-type');
        if (openBtn) openBtn.addEventListener('click', () => this.openModal());

        const closeBtn = document.getElementById('btn-close-payment-type');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());

        const cancelBtn = document.getElementById('btn-cancel-payment-type');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

        const modal = document.getElementById('modal-new-pago');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.closeModal();
            });
        }
    },

    openModal: function() {
        const modal = document.getElementById('modal-new-pago');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    closeModal: function() {
        const modal = document.getElementById('modal-new-pago');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    },

    setMessage: function(container, message, isError) {
        if (!container) return;
        container.textContent = '';
        const p = document.createElement('p');
        p.textContent = message;
        p.className = isError ? 'text-danger' : 'text-muted';
        container.appendChild(p);
    }
};
