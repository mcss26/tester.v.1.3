'use strict';

window.OperationalStockModule = {
    operationalSkusCache: [],
    selectedForRequest: new Map(), // Key: sku_id, Value: { item, requested_packs, justification }
    sb: null,

    init: function() {
        console.log('OperationalStockModule initialized');
        this.sb = window.sb;
        // Expose functions required by inline HTML events
        window.showOpStockTab = this.showOpStockTab.bind(this);
        window.toggleRequestItem = this.toggleRequestItem.bind(this);
        window.openRequestModal = this.openRequestModal.bind(this);
        window.updateRequestPack = this.updateRequestPack.bind(this);
        window.updateRequestJustification = this.updateRequestJustification.bind(this);
        window.submitReplenishmentRequest = this.submitReplenishmentRequest.bind(this);
        // Expose load function for navigation
        window.loadOpStockList = this.loadOpStockList.bind(this);

        const tabActual = document.getElementById('tab-btn-op-stock-actual');
        if (tabActual) {
            tabActual.addEventListener('click', () => this.showOpStockTab('actual'));
        }

        const tabPending = document.getElementById('tab-btn-op-stock-pending');
        if (tabPending) {
            tabPending.addEventListener('click', () => this.showOpStockTab('pending'));
        }

        const openRequestBtn = document.getElementById('btn-open-request');
        if (openRequestBtn) {
            openRequestBtn.addEventListener('click', () => this.openRequestModal());
        }

        const closeModalBtn = document.getElementById('btn-close-request-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.hideModal());
        }

        const cancelBtn = document.getElementById('btn-cancel-request');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideModal());
        }

        const confirmBtn = document.getElementById('btn-confirm-request');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.submitReplenishmentRequest());
        }

        const modal = document.getElementById('modal-request-stock');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.hideModal();
            });
        }
    },

    showOpStockTab: function(tabName) {
        // Hide all tabs
        const tabs = ['actual', 'pending'];
        tabs.forEach(t => {
            const tab = document.getElementById(`op-tab-${t}`);
            const btn = document.getElementById(`tab-btn-op-stock-${t}`);
            if (tab) tab.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        });

        // Show selected
        const activeTab = document.getElementById(`op-tab-${tabName}`);
        const activeBtn = document.getElementById(`tab-btn-op-stock-${tabName}`);
        if (activeTab) activeTab.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');

        if (tabName === 'actual') this.loadOpStockList();
        if (tabName === 'pending') this.loadOpPendingList();
    },

    loadOpStockList: async function() {
        const listContainer = document.getElementById('op-stock-list');
        this.setMessage(listContainer, 'Cargando items...', false);
        const sb = this.sb;
        if (!sb) {
            this.setMessage(listContainer, 'No se pudo conectar con Supabase.', true);
            return;
        }

        const { data: stocks, error } = await sb
            .from('inventory_stock')
            .select(`
                stock_actual,
                stock_ideal,
                sku:inventory_skus!inner (
                    id,
                    name,
                    ml,
                    pack_quantity,
                    pack_cost,
                    is_active,
                    default_supplier_id
                )
            `)
            .eq('sku.is_active', true);

        if (error) {
            console.error('Error fetching operational stock:', error);
            this.setMessage(listContainer, 'Error al cargar stock: ' + error.message, true);
            return;
        }

        this.operationalSkusCache = stocks
            .map(item => {
                const actual = item.stock_actual || 0;
                const ideal = item.stock_ideal || 0;
                const sku = item.sku;
                const packQty = sku.pack_quantity || 1;
                
                let unit = 'Unidades';
                if (sku.ml) unit = `${sku.ml} ml`;
                
                let suggested = 0;
                if (actual < ideal) {
                    const gap = ideal - actual;
                    suggested = Math.ceil(gap / packQty); // Calculation Logic
                }

                return {
                    id: sku.id,
                    name: sku.name,
                    unit: unit,
                    pack_quantity: sku.pack_quantity,
                    pack_cost: sku.pack_cost, 
                    actual,
                    ideal,
                    packQty,
                    suggested,
                    default_supplier_id: sku.default_supplier_id
                };
            });

        // Sort: Suggested Descending, then Name
        this.operationalSkusCache.sort((a, b) => {
            if (b.suggested !== a.suggested) {
                return b.suggested - a.suggested; 
            }
            return a.name.localeCompare(b.name);
        });

        // Sync selectedForRequest with fresh data
        this.selectedForRequest.forEach((value, key) => {
            const freshItem = this.operationalSkusCache.find(i => i.id === key);
            if (freshItem) {
                // Update the item reference to ensure latest values (packQty, suggested, etc)
                value.item = freshItem;
                // Optional: Auto-update requested quantity if it matched the old suggestion
                // For now, we just ensure the preview allows seeing the new suggestion to compare
                this.selectedForRequest.set(key, value);
            } else {
                // Item might have become inactive or deleted
                this.selectedForRequest.delete(key);
            }
        });

        this.renderOpStockTable(this.operationalSkusCache);
        this.updateSummary();
    },

    renderOpStockTable: function(items) {
        const listContainer = document.getElementById('op-stock-list');
        if (items.length === 0) {
            this.setMessage(listContainer, 'No hay items activos.', false);
            return;
        }

        listContainer.textContent = '';

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Item', 'Stock Actual', 'Ideal', 'Pack', 'Sugerencia (Packs)', 'Solicitar'].forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        items.forEach(item => {
            const isSelected = this.selectedForRequest.has(item.id);
            const row = document.createElement('tr');
            row.dataset.skuId = item.id;
            if (item.suggested > 0) row.classList.add('is-low');
            if (isSelected) row.classList.add('is-selected');

            row.appendChild(this.buildCell(item.name));
            row.appendChild(this.buildCell(item.actual, 'center'));
            row.appendChild(this.buildCell(item.ideal, 'center'));
            row.appendChild(this.buildCell(item.packQty, 'center'));

            const suggestionCell = document.createElement('td');
            suggestionCell.classList.add('cell-center');
            const suggestionPill = document.createElement('span');
            if (item.suggested > 0) {
                suggestionPill.className = 'status-pill status-low';
                suggestionPill.textContent = item.suggested;
            } else {
                suggestionPill.className = 'status-pill status-neutral';
                suggestionPill.textContent = '-';
            }
            suggestionCell.appendChild(suggestionPill);
            row.appendChild(suggestionCell);

            const selectCell = document.createElement('td');
            selectCell.classList.add('cell-center');
            if (item.suggested > 0) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'checkbox-lg';
                checkbox.checked = isSelected;
                checkbox.addEventListener('change', () => this.toggleRequestItem(item.id));
                selectCell.appendChild(checkbox);
            } else {
                const muted = document.createElement('span');
                muted.className = 'text-muted';
                muted.textContent = '-';
                selectCell.appendChild(muted);
            }
            row.appendChild(selectCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        listContainer.appendChild(table);
    },

    toggleRequestItem: function(skuId) {
        if (this.selectedForRequest.has(skuId)) {
            this.selectedForRequest.delete(skuId);
        } else {
            const item = this.operationalSkusCache.find(i => i.id === skuId);
            if (item) {
                this.selectedForRequest.set(skuId, {
                    item: item,
                    requested_packs: item.suggested,
                    justification: ''
                });
            }
        }
        const row = document.querySelector(`tr[data-sku-id="${skuId}"]`);
        if (row) row.classList.toggle('is-selected', this.selectedForRequest.has(skuId));
        this.updateSummary();
    },

    openRequestModal: async function() {
        if (this.selectedForRequest.size === 0) {
            alert('Seleccione al menos un item para solicitar.');
            return;
        }

        const sb = this.sb;
        if (!sb) {
            alert('No se pudo conectar con Supabase.');
            return;
        }

        this.showModal();
        
        // Fetch Operational Days
        const select = document.getElementById('request-op-date-select');
        if (select) {
            select.textContent = '';
            const loadingOption = document.createElement('option');
            loadingOption.value = '';
            loadingOption.textContent = 'Cargando fechas...';
            select.appendChild(loadingOption);
        }
        
        const { data: days, error } = await sb
            .from('operational_days')
            .select('op_date')
            .order('op_date', { ascending: false });

        if (error) {
            alert('Error al cargar fechas: ' + error.message);
            return;
        }

        if (select) {
            select.textContent = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Seleccione una fecha...';
            select.appendChild(placeholder);
            days.forEach(d => {
                const option = document.createElement('option');
                option.value = d.op_date;
                option.textContent = d.op_date;
                select.appendChild(option);
            });
        }

        this.renderRequestPreview();
    },

    renderRequestPreview: function() {
        const tbody = document.getElementById('request-preview-body');
        if (!tbody) return;
        tbody.textContent = '';

        this.selectedForRequest.forEach((data, skuId) => {
            const tr = document.createElement('tr');
            tr.appendChild(this.buildCell(data.item.name));
            tr.appendChild(this.buildCell(data.item.actual, 'center'));
            tr.appendChild(this.buildCell(data.item.ideal, 'center'));
            tr.appendChild(this.buildCell(data.item.packQty, 'center'));
            tr.appendChild(this.buildCell(data.item.suggested, 'center'));

            const packCell = document.createElement('td');
            const packInput = document.createElement('input');
            packInput.type = 'number';
            packInput.min = '1';
            packInput.value = data.requested_packs;
            packInput.className = 'table-input';
            packInput.addEventListener('input', (event) => {
                this.updateRequestPack(skuId, event.target.value);
            });
            packCell.appendChild(packInput);
            tr.appendChild(packCell);

            const justificationCell = document.createElement('td');
            const justificationInput = document.createElement('input');
            justificationInput.type = 'text';
            justificationInput.placeholder = 'Razón...';
            justificationInput.value = data.justification;
            justificationInput.className = 'table-input-full';
            justificationInput.addEventListener('input', (event) => {
                this.updateRequestJustification(skuId, event.target.value);
            });
            justificationCell.appendChild(justificationInput);
            tr.appendChild(justificationCell);

            tbody.appendChild(tr);
        });
        this.updateRequestSummary();
    },

    updateRequestPack: function(skuId, value) {
        const entry = this.selectedForRequest.get(skuId);
        if (entry) {
            const parsed = parseFloat(value);
            entry.requested_packs = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
            this.selectedForRequest.set(skuId, entry);
        }
        this.updateRequestSummary();
        this.updateSummary();
    },

    updateRequestJustification: function(skuId, value) {
        const entry = this.selectedForRequest.get(skuId);
        if (entry) {
            entry.justification = value;
            this.selectedForRequest.set(skuId, entry);
        }
    },

    submitReplenishmentRequest: async function() {
        console.log('Starting submitReplenishmentRequest');
        const opDate = document.getElementById('request-op-date-select').value;
        if (!opDate) {
            alert('Debe seleccionar una fecha operativa planificada.');
            return;
        }

        try {
            const sb = this.sb;
            if (!sb) {
                alert('No se pudo conectar con Supabase.');
                return;
            }
            const { data: userData, error: userError } = await sb.auth.getUser();
            if (userError || !userData.user) {
                alert('Error de sesión.');
                return;
            }
            const userId = userData.user.id;

            const { data: header, error: headerError } = await sb
                .from('replenishment_requests')
                .insert({
                    status: 'pending',
                    requested_by: userId,
                    operational_date: opDate
                })
                .select()
                .single();

            if (headerError) {
                alert('Error al crear solicitud: ' + headerError.message);
                console.error('Header Error:', headerError);
                return;
            }
            console.log('Header created:', header);

            const itemsPayload = [];
            this.selectedForRequest.forEach((data, skuId) => {
                itemsPayload.push({
                    request_id: header.id,
                    sku_id: skuId,
                    current_stock: data.item.actual,
                    ideal_stock: data.item.ideal,
                    suggested_packs: data.item.suggested,
                    requested_packs: data.requested_packs,
                    original_packs: data.requested_packs, // Store original requested
                    justification: data.justification,
                    pack_cost_snapshot: data.item.pack_cost || 0,
                    supplier_id: data.item.default_supplier_id
                });
            });

            console.log('Inserting items:', itemsPayload.length);
            const { error: itemsError } = await sb
                .from('replenishment_items')
                .insert(itemsPayload);

            if (itemsError) {
                alert('Error al agregar items: ' + itemsError.message);
                console.error('Items Error:', itemsError);
            } else {
                alert('Solicitud enviada exitosamente.');
                this.hideModal();
                this.selectedForRequest.clear();
                this.loadOpStockList();
                this.showOpStockTab('pending');
            }
        } catch (err) {
            console.error('Unexpected error in submitReplenishmentRequest:', err);
            alert('Error inesperado: ' + err.message);
        }
    },
    updateSummary: function() {
        const totalItems = this.operationalSkusCache.length;
        const lowItems = this.operationalSkusCache.filter(item => item.suggested > 0).length;
        const totalSuggested = this.operationalSkusCache.reduce((sum, item) => sum + (item.suggested || 0), 0);
        const selectedCount = this.selectedForRequest.size;
        const selectedPacks = Array.from(this.selectedForRequest.values())
            .reduce((sum, entry) => sum + (parseFloat(entry.requested_packs) || 0), 0);

        const totalEl = document.getElementById('op-summary-total');
        if (totalEl) totalEl.textContent = totalItems;
        const lowEl = document.getElementById('op-summary-low');
        if (lowEl) lowEl.textContent = lowItems;
        const suggestedEl = document.getElementById('op-summary-suggested');
        if (suggestedEl) suggestedEl.textContent = totalSuggested;
        const selectedEl = document.getElementById('op-summary-selected');
        if (selectedEl) selectedEl.textContent = selectedCount;
        const selectedPacksEl = document.getElementById('op-summary-selected-packs');
        if (selectedPacksEl) selectedPacksEl.textContent = selectedPacks;

        const openRequestBtn = document.getElementById('btn-open-request');
        if (openRequestBtn) openRequestBtn.disabled = selectedCount === 0;
    },
    updateRequestSummary: function() {
        const itemsCount = this.selectedForRequest.size;
        const packsCount = Array.from(this.selectedForRequest.values())
            .reduce((sum, entry) => sum + (parseFloat(entry.requested_packs) || 0), 0);

        const itemsEl = document.getElementById('request-summary-items');
        if (itemsEl) itemsEl.textContent = itemsCount;
        const packsEl = document.getElementById('request-summary-packs');
        if (packsEl) packsEl.textContent = packsCount;
    },

    loadOpPendingList: async function() {
        const container = document.getElementById('op-pending-list');
        if (!container) return;
        this.setMessage(container, 'Cargando solicitudes...', false);
        const sb = this.sb;
        if (!sb) {
            this.setMessage(container, 'No se pudo conectar con Supabase.', true);
            return;
        }

        // Show requests that are either just created (pending) or being processed (in_replenishment)
        // We exclude 'completed' to keep list clean, or maybe show last 5 completed? For now just active flow.
        const { data: requests, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                replenishment_items ( 
                    id, 
                    requested_packs, 
                    original_packs, 
                    is_deleted,
                    inventory_skus ( id, name, pack_quantity )
                )
            `)
            .in('status', ['pending', 'in_replenishment'])
            .order('created_at', { ascending: false });

        if (error) {
            this.setMessage(container, 'Error al cargar.', true);
            return;
        }

        if (requests.length === 0) {
            this.setMessage(container, 'No hay solicitudes pendientes o en reposición.', false);
            return;
        }

        container.textContent = '';
        const list = document.createElement('div');
        list.className = 'request-list';
        requests.forEach(req => {
            const statusLabel = req.status === 'pending' ? 'Pendiente de Aprobación' : 'En Reposición (Logística)';
            const statusClass = req.status === 'pending' ? 'status-low' : 'status-excess';

            const items = req.replenishment_items || [];
            const activeItems = items.filter(i => !i.is_deleted);
            const deletedCount = items.filter(i => i.is_deleted).length;
            const modifiedCount = activeItems.filter(i => i.requested_packs !== i.original_packs).length;

            const card = document.createElement('div');
            card.className = 'request-card';

            const meta = document.createElement('div');
            meta.className = 'request-meta';
            const title = document.createElement('div');
            title.textContent = `Solicitud #${req.id.slice(0, 8)}`;
            meta.appendChild(title);

            if (deletedCount > 0 || modifiedCount > 0) {
                const mod = document.createElement('div');
                mod.className = 'text-muted';
                const parts = [];
                if (deletedCount > 0) parts.push(`${deletedCount} elim.`);
                if (modifiedCount > 0) parts.push(`${modifiedCount} modif.`);
                mod.textContent = `Cambios: ${parts.join(' / ')}`;
                meta.appendChild(mod);
            }

            const op = document.createElement('div');
            op.className = 'text-muted';
            op.textContent = `Operativa: ${req.operational_date || '-'}`;
            meta.appendChild(op);

            const itemsCount = document.createElement('div');
            itemsCount.className = 'text-muted';
            itemsCount.textContent = `Items: ${activeItems.length}`;
            meta.appendChild(itemsCount);

            const actions = document.createElement('div');
            actions.className = 'request-actions';

            const statusPill = document.createElement('span');
            statusPill.className = `status-pill ${statusClass}`;
            statusPill.textContent = statusLabel;
            actions.appendChild(statusPill);

            if (req.status === 'in_replenishment') {
                const confirmBtn = document.createElement('button');
                confirmBtn.type = 'button';
                confirmBtn.className = 'btn-success btn-sm';
                confirmBtn.textContent = 'Confirmar recepción';
                confirmBtn.addEventListener('click', () => this.confirmReception(req.id));
                actions.appendChild(confirmBtn);
            }

            card.appendChild(meta);
            card.appendChild(actions);
            list.appendChild(card);
        });
        container.appendChild(list);
    },

    confirmReception: async function(requestId) {
        if (!confirm('¿Confirma que ha recibido físicamente la mercadería? Esto actualizará el Stock Actual.')) return;
        
        const sb = this.sb;
        try {
            // 1. Get Items
            const { data: request, error: reqErr } = await sb
                .from('replenishment_requests')
                .select(`
                    id,
                    replenishment_items (
                        id,
                        requested_packs,
                        inventory_skus ( id, pack_quantity )
                    )
                `)
                .eq('id', requestId)
                .single();

            if (reqErr) throw reqErr;

            // 2. Update Stock for each item
            // Note: Parallel updates might be better done via RPC but we'll do loop for now.
            // Ideally we need to know the CURRENT stock row ID for the sku, but inventory_stock links to sku.
            // We assume 1 inventory_stock row per SKU.
            
            for (const item of request.replenishment_items) {
                const skuId = item.inventory_skus.id;
                const packQty = item.inventory_skus.pack_quantity || 1;
                const unitsToAdd = item.requested_packs * packQty;

                // Call RPC or calculate manually. Let's do RPC if safer, but since we don't have one, query+update.
                // Fetch current stock
                const { data: stockRow, error: stockFetchErr } = await sb
                    .from('inventory_stock')
                    .select('id, stock_actual')
                    .eq('sku_id', skuId)
                    .single();

                if (stockFetchErr) {
                    console.error(`Could not find stock row for SKU ${skuId}, skipping update.`);
                    continue; 
                }

                // Update
                const newStock = (stockRow.stock_actual || 0) + unitsToAdd;
                const { error: updateErr } = await sb
                    .from('inventory_stock')
                    .update({ stock_actual: newStock })
                    .eq('id', stockRow.id);

                if (updateErr) throw updateErr;
            }

            // 3. Close Request
            const { error: closeErr } = await sb
                .from('replenishment_requests')
                .update({ status: 'completed' })
                .eq('id', requestId);

            if (closeErr) throw closeErr;

            alert('Recepción confirmada. Stock actualizado.');
            this.loadOpPendingList();
            // Refresh main list too if visible
            if (!document.getElementById('op-tab-actual').classList.contains('hidden')) {
                this.loadOpStockList();
            }

        } catch (err) {
            console.error('Error receiving stock:', err);
            alert('Error al recibir: ' + err.message);
        }
    },

    showModal: function() {
        const modal = document.getElementById('modal-request-stock');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    hideModal: function() {
        const modal = document.getElementById('modal-request-stock');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    },

    buildCell: function(value, align) {
        const cell = document.createElement('td');
        const text = value === null || value === undefined || value === '' ? '-' : String(value);
        cell.textContent = text;
        if (align === 'center') cell.classList.add('cell-center');
        return cell;
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
