'use strict';

window.AdminSolicitudesModule = {
    suppliersCache: [],
    itemsCache: [],
    
    formatCurrency: function(value) {
        return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    },


    init: async function() {
        console.log('RequestsManagementModule initialized');
        window.loadAdminSolicitudes = this.loadAdminSolicitudes.bind(this);
        this.bindModal();
        
        // Cache suppliers on init for performance
        try {
            const { data } = await window.sb.from('suppliers').select('id, nombre').order('nombre');
            this.suppliersCache = data || [];
        } catch (e) {
            console.error('Error caching suppliers:', e);
        }
    },

    requestsList: [], // Cache for requests

    loadAdminSolicitudes: async function() {
        const container = document.getElementById('mgmt-requests-list');
        if (!container) return; 
        this.setMessage(container, 'Cargando solicitudes pendientes...', false);
        const sb = window.sb;

        const { data: requests, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                replenishment_items (
                    id,
                    requested_packs,
                    original_packs,
                    is_deleted,
                    pack_cost_snapshot,
                    justification,
                    inventory_skus ( 
                        name, ml, default_supplier_id, pack_quantity,
                        inventory_stock ( stock_actual )
                    )
                )
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            this.setMessage(container, 'Error al cargar: ' + error.message, true);
            return;
        }

        this.requestsList = requests || [];

        if (this.requestsList.length === 0) {
            this.setMessage(container, 'No hay solicitudes pendientes.', false);
            return;
        }

        container.textContent = '';
        const list = document.createElement('div');
        list.className = 'request-list';

        this.requestsList.forEach(req => {
            const total = req.replenishment_items.reduce((sum, item) => {
                return sum + (item.requested_packs * (item.pack_cost_snapshot || 0));
            }, 0);

            const card = document.createElement('div');
            card.className = 'request-card';

            const meta = document.createElement('div');
            meta.className = 'request-meta';

            const title = document.createElement('div');
            title.className = 'text-strong';
            title.textContent = `Solicitud #${req.id.slice(0, 8)}`;
            meta.appendChild(title);

            const date = document.createElement('div');
            date.className = 'text-muted';
            date.textContent = `Fecha: ${new Date(req.created_at).toLocaleString()}`;
            meta.appendChild(date);

            const items = document.createElement('div');
            items.className = 'text-muted';
            items.textContent = `Items: ${req.replenishment_items.length}`;
            meta.appendChild(items);

            const actions = document.createElement('div');
            actions.className = 'request-actions';

            const totalEl = document.createElement('div');
            totalEl.className = 'amount-highlight-sm';
            totalEl.textContent = `Est. $${this.formatCurrency(total)}`;
            actions.appendChild(totalEl);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn-primary btn-sm';
            button.textContent = 'Valorizar y Aprobar';
            button.addEventListener('click', () => this.openApproveModal(req.id));
            actions.appendChild(button);

            card.appendChild(meta);
            card.appendChild(actions);
            list.appendChild(card);
        });
        container.appendChild(list);
    },

    openApproveModal: function(requestId) {
        console.log('Opening modal for:', requestId);
        const request = this.requestsList.find(r => r.id === requestId);
        if (!request) {
            console.error('Request not found in cache:', requestId);
            return;
        }

        this.showModal(request.id);
        document.getElementById('approve-request-id-display').innerText = request.id.slice(0, 8);

        // Map items and add temporary fields for logic
        const items = request.replenishment_items
            .filter(item => !item.is_deleted)
            .map(item => ({
                ...item,
                pack_cost_snapshot: item.pack_cost_snapshot || 0,
                stock_actual: (item.inventory_skus.inventory_stock && item.inventory_skus.inventory_stock[0]) 
                                ? item.inventory_skus.inventory_stock[0].stock_actual 
                                : 0
            }));

        this.itemsCache = items;
        this.deletedItemIds = []; // Track IDs to delete from DB
        this.renderApprovalTable();
    },

    deleteApprovalItem: function(index) {
        if (!this.itemsCache[index]) return;
        const item = this.itemsCache[index];
        if (item.id) this.deletedItemIds.push(item.id);
        this.itemsCache.splice(index, 1);
        this.renderApprovalTable();
    },


    renderApprovalTable: function() {
        const tbody = document.getElementById('approve-preview-body');
        const totalDisplay = document.getElementById('approve-total-cost');
        let total = 0;
        
        const items = this.itemsCache || [];

        if (!tbody) return;
        tbody.textContent = '';

        items.forEach((item, index) => {
            const cost = parseFloat(item.pack_cost_snapshot) || 0;
            const subtotal = item.requested_packs * cost;
            total += subtotal;

            const row = document.createElement('tr');

            const itemCell = document.createElement('td');
            const itemName = document.createElement('strong');
            itemName.textContent = item.inventory_skus.name;
            itemCell.appendChild(itemName);
            const itemMeta = document.createElement('div');
            itemMeta.className = 'text-muted';
            itemMeta.textContent = item.inventory_skus.ml || '';
            itemCell.appendChild(itemMeta);
            row.appendChild(itemCell);

            const packsCell = document.createElement('td');
            packsCell.className = 'text-center';
            const packsInput = document.createElement('input');
            packsInput.type = 'number';
            packsInput.step = '1';
            packsInput.min = '1';
            packsInput.value = item.requested_packs;
            packsInput.className = 'table-input';
            packsInput.addEventListener('input', (event) => {
                this.updateApprovalItem(index, 'packs', event.target.value);
            });
            packsCell.appendChild(packsInput);
            row.appendChild(packsCell);

            const unitsCell = document.createElement('td');
            unitsCell.className = 'text-center text-muted';
            unitsCell.textContent = (item.requested_packs * (item.inventory_skus.pack_quantity || 1)).toLocaleString();
            row.appendChild(unitsCell);

            const stockCell = document.createElement('td');
            stockCell.className = 'text-center';
            const stockValue = document.createElement('span');
            stockValue.textContent = item.stock_actual;
            stockValue.className = item.stock_actual < 5 ? 'text-danger' : '';
            stockCell.appendChild(stockValue);
            row.appendChild(stockCell);

            const costCell = document.createElement('td');
            costCell.className = 'text-right';
            const costInput = document.createElement('input');
            costInput.type = 'number';
            costInput.step = '0.01';
            costInput.value = cost.toFixed(2);
            costInput.className = 'table-input';
            costInput.addEventListener('input', (event) => {
                this.updateApprovalItem(index, 'cost', event.target.value);
            });
            costCell.appendChild(costInput);
            row.appendChild(costCell);

            const subtotalCell = document.createElement('td');
            subtotalCell.className = 'text-right text-strong';
            subtotalCell.textContent = `$${this.formatCurrency(subtotal)}`;
            row.appendChild(subtotalCell);

            const actionCell = document.createElement('td');
            actionCell.className = 'text-center';
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-icon';
            deleteBtn.textContent = '✕';
            deleteBtn.title = 'Eliminar Item';
            deleteBtn.addEventListener('click', () => this.deleteApprovalItem(index));
            actionCell.appendChild(deleteBtn);
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });

        if (totalDisplay) totalDisplay.innerText = '$' + this.formatCurrency(total);
    },

    updateApprovalItem: function(index, field, value) {
        if (!this.itemsCache[index]) return;
        const item = this.itemsCache[index];
        if (field === 'cost') item.pack_cost_snapshot = parseFloat(value);
        if (field === 'packs') item.requested_packs = parseFloat(value);
        this.renderApprovalTable();
    },

    approveRequestAction: async function() {
        if (this.itemsCache.length === 0 && this.deletedItemIds.length === 0) {
            alert('No hay items en el pedido.');
            return;
        }

        const requestId = document.getElementById('modal-approve-request').dataset.id;
        if (!requestId) return;
        
        if (!confirm('¿Confirmar aprobación y valorización? Se guardarán los cambios en cantidades y items eliminados.')) return;

        const sb = window.sb;
        const totalEstimated = this.itemsCache.reduce((sum, item) => sum + (item.requested_packs * item.pack_cost_snapshot), 0);

        try {
            // 1. Mark removed items as is_deleted = true
            if (this.deletedItemIds.length > 0) {
                const { error: delErr } = await sb.from('replenishment_items').update({ is_deleted: true }).in('id', this.deletedItemIds);
                if (delErr) throw delErr;
            }

            // 2. Update items (cost and quantity)
            for (const item of this.itemsCache) {
                const { error: updErr } = await sb.from('replenishment_items').update({
                    pack_cost_snapshot: item.pack_cost_snapshot,
                    requested_packs: item.requested_packs
                }).eq('id', item.id);
                if (updErr) throw updErr;
            }

            // 3. Update request status and total
            const { error: reqErr } = await sb.from('replenishment_requests').update({
                status: 'in_replenishment',
                total_estimated_cost: totalEstimated 
            }).eq('id', requestId);
            if (reqErr) throw reqErr;

            alert('Pedido valorizado y enviado a Logística.');
            this.hideModal();
            this.loadAdminSolicitudes();

        } catch (err) {
            console.error('Error during approval:', err);
            alert('Error al procesar la aprobación: ' + err.message);
        }
    },

    bindModal: function() {
        const closeBtn = document.getElementById('btn-close-approve');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());

        const cancelBtn = document.getElementById('btn-cancel-approve');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideModal());

        const confirmBtn = document.getElementById('btn-confirm-approve');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.approveRequestAction());

        const modal = document.getElementById('modal-approve-request');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.hideModal();
            });
        }
    },

    showModal: function(requestId) {
        const modal = document.getElementById('modal-approve-request');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        modal.dataset.id = requestId;
    },

    hideModal: function() {
        const modal = document.getElementById('modal-approve-request');
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
