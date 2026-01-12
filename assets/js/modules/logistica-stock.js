'use strict';

window.LogisticsStockModule = {
    suppliersCache: [],
    currentRequestId: null,

    init: async function() {
        console.log('LogisticsStockModule initialized');
        this.bindModal();
        try {
            const { data } = await window.sb.from('suppliers').select('id, nombre').order('nombre');
            this.suppliersCache = data || [];
        } catch (e) {
            console.error('Error fetching suppliers:', e);
        }
    },

    loadStockList: async function() {
        const container = document.getElementById('logistics-repos-list');
        if (!container) return;
        this.setMessage(container, 'Cargando solicitudes por procesar...', false);
        const sb = window.sb;

        // Fetch requests with status 'in_replenishment'
        const { data: requests, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                replenishment_items ( 
                    requested_packs, 
                    inventory_skus(name) 
                )
            `)
            .eq('status', 'in_replenishment')
            .order('created_at', { ascending: false });

        if (error) {
            this.setMessage(container, 'Error al cargar: ' + error.message, true);
            return;
        }

        if (requests.length === 0) {
            this.setMessage(container, 'No hay solicitudes pendientes de asignación logística.', false);
            return;
        }

        container.textContent = '';
        requests.forEach(req => {
            const card = document.createElement('div');
            card.className = 'card mb-md';

            const header = document.createElement('div');
            header.className = 'row-between';

            const meta = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'text-strong';
            title.textContent = `Pedido #${req.id.slice(0, 8)}`;
            meta.appendChild(title);

            const date = document.createElement('div');
            date.className = 'text-muted';
            date.textContent = `Soli: ${new Date(req.created_at).toLocaleDateString()}`;
            meta.appendChild(date);

            const opDate = document.createElement('div');
            opDate.className = 'text-muted';
            opDate.textContent = `F. Operativa: ${req.operational_date || '-'}`;
            meta.appendChild(opDate);

            const actions = document.createElement('div');
            const assignBtn = document.createElement('button');
            assignBtn.type = 'button';
            assignBtn.className = 'btn-primary btn-sm';
            assignBtn.textContent = 'Asignar datos';
            assignBtn.addEventListener('click', () => this.openAssignModal(req.id));
            actions.appendChild(assignBtn);

            header.appendChild(meta);
            header.appendChild(actions);
            card.appendChild(header);

            const list = document.createElement('ul');
            list.className = 'list-unstyled text-muted mt-sm';
            req.replenishment_items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.inventory_skus.name} (${item.requested_packs} packs)`;
                list.appendChild(li);
            });
            card.appendChild(list);

            container.appendChild(card);
        });
    },

    openAssignModal: async function(id) {
        this.currentRequestId = id;
        const sb = window.sb;
        
        const { data: request, error } = await sb
            .from('replenishment_requests')
            .select(`
                *,
                replenishment_items ( 
                    id,
                    supplier_id,
                    requested_packs, 
                    confirmed_total_cost,
                    delivery_date,
                    inventory_skus(name) 
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            alert('Error al cargar items: ' + error.message);
            return;
        }

        this.showModal();
        
        const container = document.getElementById('assign-items-container');
        if (!container) return;
        container.textContent = '';

        const headerRow = document.createElement('div');
        headerRow.className = 'row-between mb-md';
        const note = document.createElement('div');
        note.className = 'text-muted';
        note.textContent = 'Completa proveedor, costo y fecha de arribo.';
        headerRow.appendChild(note);
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-secondary btn-sm';
        addBtn.textContent = '+ Agregar item extra';
        addBtn.addEventListener('click', () => this.addExtraRow());
        headerRow.appendChild(addBtn);
        container.appendChild(headerRow);

        const table = document.createElement('table');
        table.id = 'logistics-assign-table';
        table.className = 'table-compact';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Item / Nombre', 'Cant.', 'Proveedor', 'Costo Total', 'F. Arribo'].forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            if (label === 'Cant.') th.classList.add('text-center');
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.id = 'logistics-assign-tbody';
        
        request.replenishment_items.forEach((item, idx) => {
            const costVal = item.confirmed_total_cost !== null ? item.confirmed_total_cost : ''; 
            const dateVal = item.delivery_date ? item.delivery_date : ''; 
            const row = document.createElement('tr');
            row.className = `assign-row ${idx % 2 === 1 ? 'row-alt' : ''}`;
            row.dataset.id = item.id;
            row.dataset.extra = 'false';

            row.appendChild(this.buildCell(item.inventory_skus ? item.inventory_skus.name : 'Unknown Item'));

            const qtyCell = document.createElement('td');
            qtyCell.className = 'text-center text-strong';
            qtyCell.textContent = item.requested_packs;
            row.appendChild(qtyCell);

            const supplierCell = document.createElement('td');
            const supplierSelect = document.createElement('select');
            supplierSelect.className = 'item-supplier-select';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '-- Seleccionar --';
            supplierSelect.appendChild(placeholder);
            this.suppliersCache.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.nombre;
                if (item.supplier_id === s.id) option.selected = true;
                supplierSelect.appendChild(option);
            });
            supplierCell.appendChild(supplierSelect);
            row.appendChild(supplierCell);

            const costCell = document.createElement('td');
            const costWrap = document.createElement('div');
            costWrap.className = 'input-prefix';
            const costPrefix = document.createElement('span');
            costPrefix.textContent = '$';
            const costInput = document.createElement('input');
            costInput.type = 'number';
            costInput.className = 'item-cost-input';
            costInput.placeholder = '0.00';
            costInput.step = '0.01';
            costInput.value = costVal;
            costWrap.appendChild(costPrefix);
            costWrap.appendChild(costInput);
            costCell.appendChild(costWrap);
            row.appendChild(costCell);

            const dateCell = document.createElement('td');
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'item-date-input';
            dateInput.value = dateVal;
            dateCell.appendChild(dateInput);
            row.appendChild(dateCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    },

    addExtraRow: function() {
        const tbody = document.getElementById('logistics-assign-tbody');
        if (!tbody) return;

        let supplierOptions = '<option value="">-- Seleccionar --</option>';
        this.suppliersCache.forEach(s => {
            supplierOptions += `<option value="${s.id}">${s.nombre}</option>`;
        });

        const tr = document.createElement('tr');
        tr.className = 'assign-row row-extra';
        tr.dataset.extra = "true";
        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'extra-name-input';
        nameInput.placeholder = 'Nombre del Item Extra';
        nameCell.appendChild(nameInput);
        tr.appendChild(nameCell);

        const qtyCell = document.createElement('td');
        qtyCell.className = 'text-center';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'extra-qty-input table-input';
        qtyInput.value = '1';
        qtyInput.min = '1';
        qtyCell.appendChild(qtyInput);
        tr.appendChild(qtyCell);

        const supplierCell = document.createElement('td');
        const supplierSelect = document.createElement('select');
        supplierSelect.className = 'item-supplier-select';
        supplierSelect.innerHTML = supplierOptions;
        supplierCell.appendChild(supplierSelect);
        tr.appendChild(supplierCell);

        const costCell = document.createElement('td');
        const costWrap = document.createElement('div');
        costWrap.className = 'input-prefix';
        const costPrefix = document.createElement('span');
        costPrefix.textContent = '$';
        const costInput = document.createElement('input');
        costInput.type = 'number';
        costInput.className = 'item-cost-input';
        costInput.placeholder = '0.00';
        costInput.step = '0.01';
        costWrap.appendChild(costPrefix);
        costWrap.appendChild(costInput);
        costCell.appendChild(costWrap);
        tr.appendChild(costCell);

        const dateCell = document.createElement('td');
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'item-date-input';
        dateCell.appendChild(dateInput);
        tr.appendChild(dateCell);

        tbody.appendChild(tr);
    },

    confirmLogisticsAction: async function() {
        const rows = document.querySelectorAll('.assign-row');
        const processingItems = [];
        let allValid = true;

        rows.forEach(row => {
            const isExtra = row.dataset.extra === "true";
            const supplierSelect = row.querySelector('.item-supplier-select');
            const costInput = row.querySelector('.item-cost-input');
            const dateInput = row.querySelector('.item-date-input');
            
            const supplierId = supplierSelect.value;
            const cost = parseFloat(costInput.value);
            const date = dateInput.value;

            if (!supplierId || isNaN(cost) || !date) {
                allValid = false;
                row.classList.add('row-error');
            } else {
                row.classList.remove('row-error');
            }

            if (isExtra) {
                const nameInput = row.querySelector('.extra-name-input');
                const qtyInput = row.querySelector('.extra-qty-input');
                const name = nameInput.value.trim();
                const qty = parseInt(qtyInput.value) || 1;
                
                if (!name) {
                    allValid = false;
                    nameInput.classList.add('input-error');
                } else {
                    nameInput.classList.remove('input-error');
                }

                processingItems.push({
                    isExtra: true,
                    name: name,
                    requested_packs: qty,
                    supplierId,
                    cost,
                    date
                });
            } else {
                const id = row.dataset.id;
                processingItems.push({
                    isExtra: false,
                    id: id,
                    supplierId,
                    cost,
                    date
                });
            }
        });

        if (!allValid) {
            alert('Por favor complete todos los campos (Proveedor, Costo, Fecha, Nombre para extras).');
            return;
        }

        const sb = window.sb;
        try {
            // 1. Update Existing items
            const existingItems = processingItems.filter(i => !i.isExtra);
            for (const item of existingItems) {
                const { error: updErr } = await sb.from('replenishment_items').update({
                    supplier_id: item.supplierId,
                    confirmed_total_cost: item.cost,
                    delivery_date: item.date
                }).eq('id', item.id);
                if (updErr) throw updErr;
            }

            // 2. Insert Extra Items
            // IMPORTANT: We need to insert these into replenishment_items.
            // Assumption: we have columns to support text names or we utilize existing ones creatively.
            // Best practice: Add 'extra_details'::jsonb or 'item_name'::text to table.
            // Since we can't migrate easily, let's try to insert. If sku_id is mandatory non-null, this will fail.
            // Optimistic approach: Insert with sku_id: null (if allowed) and store name in metadata if possible or 
            // check available columns. Since I can't check, I'll try to insert. 
            // If it fails, I'll catch and alert user to add columns.
            
            const extraItems = processingItems.filter(i => i.isExtra);
            const { data: requestHeader } = await sb.from('replenishment_requests').select('*').eq('id', this.currentRequestId).single();
            
            for (const item of extraItems) {
                // We'll create a new replenishment_item linked to this request
                // We hope sku_id is nullable. storing name in a 'notes' field would be good if exists.
                // Assuming 'justification' or 'comments' field exists? 
                // Let's rely on adding a new column implicitly or using 'justification' to store the name if we have to.
                // But better: Try to upsert.
                
                const payload = {
                    request_id: this.currentRequestId,
                    requested_packs: item.requested_packs,
                    supplier_id: item.supplierId,
                    confirmed_total_cost: item.cost,
                    delivery_date: item.date,
                    // We put the name in 'justification' as a temporary workaround if no name column exists 
                    // or ideally we use 'metadata' or 'extra_name'
                    justification: `[EXTRA ITEM] ${item.name}`,
                    // sku_id: null // Implicit
                };
                
                // Try insert
                const { error: insErr } = await sb.from('replenishment_items').insert(payload);
                if (insErr) {
                    console.error('Insert extra item error:', insErr);
                    throw new Error(`Failed to insert extra item "${item.name}". Ensure table allows null sku_id or add fields.`);
                }
            }

            // 3. Logic to split requests by supplier (Same as before)
            // ... (We repeat the grouping logic to ensure all items move to correct child requests)
             // Re-fetch all items for this request to including newly added ones
            const { data: allItems, error: fetchErr } = await sb.from('replenishment_items').select('*').eq('request_id', this.currentRequestId);
            if(fetchErr) throw fetchErr;

            // Group by Supplier
             const itemsBySupplier = {};
             allItems.forEach(it => {
                 if (!itemsBySupplier[it.supplier_id]) itemsBySupplier[it.supplier_id] = [];
                 itemsBySupplier[it.supplier_id].push(it);
             });

            const supplierIds = Object.keys(itemsBySupplier);
            
            for (let i = 0; i < supplierIds.length; i++) {
                const sId = supplierIds[i];
                const groupItems = itemsBySupplier[sId];
                
                const totalForRequest = groupItems.reduce((sum, it) => sum + (it.confirmed_total_cost || 0), 0);
                
                // Dates
                 const dates = groupItems.map(it => it.delivery_date ? new Date(it.delivery_date).getTime() : Date.now());
                 const minDate = new Date(Math.min(...dates));
                 const requestDateStr = minDate.toISOString().split('T')[0];

                let targetRequestId;

                if (i === 0) {
                     // Reuse/Update original ID
                     targetRequestId = this.currentRequestId;
                     await sb.from('replenishment_requests').update({
                         supplier_id: sId,
                         replenishment_date: requestDateStr,
                         total_estimated_cost: totalForRequest,
                         status: 'in_replenishment'
                     }).eq('id', targetRequestId);
                } else {
                    // Create new split request
                    const { data: newReq, error: newReqErr } = await sb.from('replenishment_requests').insert({
                        operational_date: requestHeader.operational_date,
                        requested_by: requestHeader.requested_by,
                        status: 'in_replenishment',
                        supplier_id: sId,
                        replenishment_date: requestDateStr,
                        total_estimated_cost: totalForRequest,
                        payment_status: 'pending'
                    }).select().single();

                    if (newReqErr) throw newReqErr;
                    targetRequestId = newReq.id;
                }

                // Move items to this request
                const itemIds = groupItems.map(x => x.id);
                await sb.from('replenishment_items').update({
                    request_id: targetRequestId
                }).in('id', itemIds);
            }

            alert('Logística confirmada y items extras agregados.');
            this.hideModal();
            this.loadStockList();

        } catch (err) {
            console.error('Error confirming logistics:', err);
            alert('Error: ' + err.message);
        }
    },

    bindModal: function() {
        const closeBtn = document.getElementById('btn-close-logistics-modal');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());

        const cancelBtn = document.getElementById('btn-cancel-logistics');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideModal());

        const confirmBtn = document.getElementById('btn-confirm-logistics');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmLogisticsAction());

        const modal = document.getElementById('modal-assign-logistics');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.hideModal();
            });
        }
    },

    showModal: function() {
        const modal = document.getElementById('modal-assign-logistics');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    },

    hideModal: function() {
        const modal = document.getElementById('modal-assign-logistics');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    },

    buildCell: function(value) {
        const cell = document.createElement('td');
        cell.textContent = value || '-';
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
