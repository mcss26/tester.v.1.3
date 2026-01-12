'use strict';

window.AdminPagosModule = {
    init: function() {
        console.log('AdminPagosModule initialized');
        // Bind functions to global scope
        window.loadPaymentsList = this.loadPaymentsList.bind(this);
        window.updatePaymentDate = this.updatePaymentDate.bind(this);
        this.bindModal();
        // Attempt to load payments after a short delay to allow Supabase auth to settle
        const tryLoad = () => {
            if (window.sb && window.sb.auth) {
                window.sb.auth.getSession().then(({ data: { session } }) => {
                    if (session) {
                        // this.loadPaymentsList(); // Auto-load removed, let page call it
                    } else {
                        // No session yet, retry shortly
                        setTimeout(tryLoad, 500);
                    }
                }).catch(() => setTimeout(tryLoad, 500));
            } else {
                // Supabase client not ready, retry
                setTimeout(tryLoad, 200);
            }
        };
        tryLoad();
    },

    bindModal: function() {
        const closeBtn = document.getElementById('btn-close-payment');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());

        const cancelBtn = document.getElementById('btn-cancel-payment');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideModal());

        const confirmBtn = document.getElementById('btn-confirm-payment');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmPayment());

        const modal = document.getElementById('modal-payment');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.hideModal();
            });
        }
    },

    loadPaymentsList: async function() {
        const container = document.getElementById('payments-list');
        if (!container) return;
        
        this.setMessage(container, 'Cargando pagos pendientes...', false);
        const sb = window.sb;

        // Fetch Requests that have a supplier assigned (Logistics step completed)
        // and are not paid yet.
        const { data: payments, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                supplier:suppliers ( nombre ),
                replenishment_items ( 
                    requested_packs,
                    pack_cost_snapshot
                )
            `)
            .not('supplier_id', 'is', null)
            .eq('payment_status', 'pending')
            .order('replenishment_date', { ascending: true });

        if (error) {
            this.setMessage(container, 'Error: ' + error.message, true);
            return;
        }

        if (payments.length === 0) {
            this.setMessage(container, 'No hay cuentas por pagar pendientes de procesamiento logístico.', false);
            return;
        }

        let html = `
            <table class="table-compact">
                <thead>
                    <tr>
                        <th>Referencia / Items</th>
                        <th>Proveedor</th>
                        <th class="text-center">F. Reposición</th>
                        <th class="text-center">F. Pago (Op.)</th>
                        <th class="text-right">Costos (Budg / Actual)</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
        `;

        payments.forEach(p => {
            // Calculate Budgeted Cost based on snapshot
            const budgetedCost = p.replenishment_items.reduce((sum, item) => {
                const qty = item.requested_packs || 0;
                const cost = item.pack_cost_snapshot || 0; 
                return sum + (qty * cost);
            }, 0);

            const actualCost = p.total_estimated_cost || 0;

            html += `
                <tr>
                    <td>
                        <strong>#${p.id.slice(0,6)}</strong>
                        <div class="text-muted">${p.replenishment_items.length} sku(s)</div>
                    </td>
                    <td>${p.supplier?.nombre || '-'}</td>
                    <td class="text-center">
                        ${p.replenishment_date ? new Date(p.replenishment_date + 'T12:00:00').toLocaleDateString() : '-'}
                    </td>
                    <td class="text-center">
                        <input type="date" class="table-input date-input" data-id="${p.id}" value="${p.payment_date || ''}">
                    </td>
                    <td class="text-right">
                        <div class="text-muted">Budg: $${budgetedCost.toFixed(2)}</div>
                        <div class="amount-highlight-sm">Act: $${actualCost.toFixed(2)}</div>
                    </td>
                    <td class="text-center">
                        <button type="button" data-action="pay" data-id="${p.id}" class="btn-success btn-sm">Pagar</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('input[type="date"][data-id]').forEach(input => {
            input.addEventListener('change', (event) => {
                const id = event.target.dataset.id;
                this.updatePaymentDate(id, event.target.value);
            });
        });

        container.querySelectorAll('button[data-action="pay"]').forEach(button => {
            button.addEventListener('click', (event) => {
                const id = event.currentTarget.dataset.id;
                this.openPaymentModal(id);
            });
        });
    },

    updatePaymentDate: async function(id, newDate) {
        const sb = window.sb;
        const { error } = await sb.from('replenishment_requests').update({
            payment_date: newDate || null
        }).eq('id', id);

        if (error) {
            alert('Error al actualizar fecha: ' + error.message);
        } else {
            console.log('Payment date updated for', id);
            // Optional: refresh if in calendar view
        }
    },

    openPaymentModal: async function(reqId) {
        this.currentPaymentId = reqId;
        const sb = window.sb;
        
        // Fetch full request details with supplier banking info
        const { data: req, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                supplier:suppliers ( * )
            `)
            .eq('id', reqId)
            .single();

        if (error) {
            alert('Error al cargar datos del pago: ' + error.message);
            return;
        }

        const modal = document.getElementById('modal-payment');
        const infoContainer = document.getElementById('payment-supplier-info');
        const amountDisplay = document.getElementById('payment-amount-display');
        document.getElementById('payment-file-input').value = ''; // Reset file input

        const s = req.supplier;
        const razonSocial = s.razon_social || s.nombre || 'N/A';
        const cuit = s.cuit || '-';
        const banco = s.banco || '-';
        const cbu = s.cbu || '-';
        const alias = s.alias || '-';

        infoContainer.textContent = '';

        const title = document.createElement('div');
        title.className = 'text-strong';
        title.textContent = `Razón Social: ${razonSocial}`;
        infoContainer.appendChild(title);

        const cuitRow = document.createElement('div');
        cuitRow.className = 'text-muted';
        cuitRow.textContent = `CUIT: ${cuit}`;
        infoContainer.appendChild(cuitRow);

        const divider = document.createElement('div');
        divider.className = 'divider';
        infoContainer.appendChild(divider);

        const bancoRow = document.createElement('div');
        bancoRow.className = 'text-muted';
        bancoRow.textContent = `Banco: ${banco}`;
        infoContainer.appendChild(bancoRow);

        const cbuRow = document.createElement('div');
        cbuRow.className = 'text-muted';
        cbuRow.textContent = `CBU: ${cbu}`;
        infoContainer.appendChild(cbuRow);

        const aliasRow = document.createElement('div');
        aliasRow.className = 'text-muted';
        aliasRow.textContent = `Alias: ${alias}`;
        infoContainer.appendChild(aliasRow);
        amountDisplay.textContent = `$${(req.total_estimated_cost || 0).toFixed(2)}`;
        
        // Load Payment Categories
        const typeSelect = document.getElementById('payment-type-select');
        if (typeSelect) {
            typeSelect.innerHTML = '<option value="">Cargando...</option>';
            const { data: categories } = await sb.from('payment_categories').select('*').order('tipo_comprobante');
            
            let options = '<option value="">Seleccione...</option>';
            if (categories) {
                categories.forEach(c => {
                    options += `<option value="${c.id}">${c.tipo_comprobante}</option>`;
                });
            }
            typeSelect.innerHTML = options;
        }

        this.showModal();
    },

    confirmPayment: async function() {
        if (!this.currentPaymentId) return;
        
        const fileInput = document.getElementById('payment-file-input');
        const file = fileInput.files[0];
        let proofUrl = null;
        
        const btn = document.getElementById('btn-confirm-payment');
        const originalText = btn.textContent;
        btn.textContent = 'Procesando...';
        btn.disabled = true;

        const sb = window.sb;

        try {
            // Upload proof if exists
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `payment_proof_${this.currentPaymentId}_${Date.now()}.${fileExt}`;
                const filePath = `${fileName}`;
                
                // Assuming 'finance-attachments' bucket exists. If not, this might fail unless we verify/create it.
                // For safety in this environment, if upload fails we proceed but warn.
                const { data: uploadData, error: uploadError } = await sb.storage
                    .from('finance-attachments')
                    .upload(filePath, file);

                if (uploadError) {
                   console.warn('Upload failed:', uploadError);
                   if(!confirm('Falló la subida del comprobante. ¿Desea continuar sin adjuntarlo?')) {
                       throw new Error('Carga de archivo cancelada.');
                   }
                } else {
                    // Get public URL
                     const { data: { publicUrl } } = sb.storage.from('finance-attachments').getPublicUrl(filePath);
                     proofUrl = publicUrl;
                }
            }

            // Update Request Status
            const { error: updateError } = await sb
                .from('replenishment_requests')
                .update({ 
                    payment_status: 'paid',
                    payment_proof_url: proofUrl,
                    payment_category_id: document.getElementById('payment-type-select').value || null,
                    payment_date: new Date().toISOString().split('T')[0] // auto-set payment date to today if confirming
                })
                .eq('id', this.currentPaymentId);

            if (updateError) throw updateError;

            alert('Pago registrado correctamente.');
            this.hideModal();
            this.loadPaymentsList();

        } catch (err) {
            console.error('Error confirming payment:', err);
            alert('Error: ' + err.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    markAsPaid: function(id) {
        this.openPaymentModal(id);
    },

    loadPaymentsCalendar: async function() {
        const container = document.getElementById('payments-calendar');
        if (!container) return;
        this.setMessage(container, 'Cargando calendario...', false);
        const sb = window.sb;

        const { data: payments, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                supplier:suppliers ( nombre )
            `)
            .not('payment_date', 'is', null)
            .eq('payment_status', 'pending')
            .order('payment_date', { ascending: true });

        if (error) {
            this.setMessage(container, 'Error: ' + error.message, true);
            return;
        }

        if (payments.length === 0) {
            this.setMessage(container, 'No hay pagos programados con fecha asignada.', false);
            return;
        }

        // Group by date
        const groups = {};
        payments.forEach(p => {
            const date = p.payment_date;
            if (!groups[date]) groups[date] = [];
            groups[date].push(p);
        });

        const sortedDates = Object.keys(groups).sort();
        let html = '';

        sortedDates.forEach(date => {
            const dateObj = new Date(date + 'T12:00:00');
            const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const dayNum = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            const totalDay = groups[date].reduce((sum, p) => sum + (p.total_estimated_cost || 0), 0);

            html += `
                <div class="panel mb-md">
                    <div class="row-between">
                        <span class="text-strong">${dayName}, ${dayNum}</span>
                        <span class="amount-highlight-sm">$${totalDay.toFixed(2)}</span>
                    </div>
                    <div class="divider"></div>
            `;

            groups[date].forEach(p => {
                html += `
                    <div class="row-between row-divider">
                        <div>
                            <strong>${p.supplier?.nombre || '-'}</strong>
                            <div class="text-muted">Ref: #${p.id.slice(0,6)}</div>
                        </div>
                        <div class="text-right">
                            <div class="amount-highlight-sm">$${(p.total_estimated_cost || 0).toFixed(2)}</div>
                            <button type="button" data-action="pay" data-id="${p.id}" class="btn-success btn-sm">Pagar</button>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        });

        container.innerHTML = html;

        container.querySelectorAll('button[data-action="pay"]').forEach(button => {
            button.addEventListener('click', (event) => {
                const id = event.currentTarget.dataset.id;
                this.markAsPaid(id);
            });
        });
    },

    showModal: function() {
        const modal = document.getElementById('modal-payment');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    hideModal: function() {
        const modal = document.getElementById('modal-payment');
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
