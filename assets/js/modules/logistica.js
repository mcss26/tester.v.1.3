/**
 * Logistica Module - Interactive Flow
 * Auth -> Welcome -> Date Chips -> Actions (2x2 Grid)
 */

window.LogisticaModule = {
    session: null,
    profile: null,

    suppliersCache: [],
    currentRequestId: null,

    init: async function() {
        console.log('LogisticaModule init...');
        
        if (!window.sb) return;
        const { data: { session }, error } = await window.sb.auth.getSession();
        
        if (error || !session) {
            window.location.href = '../../login.html';
            return;
        }
        this.session = session;
        await this.loadUserProfile(session.user.id);
        
        const page = document.body.dataset.page; 
        if (page === 'erp') {
            this.loadSuppliers();
            this.bindUI_ERP();
        } else {
             this.bindUI_Index();
        }
    },

    loadSuppliers: async function() {
        if (this.suppliersCache.length) return;
        try {
            const { data } = await window.sb.from('suppliers').select('id, nombre').order('nombre');
            this.suppliersCache = data || [];
        } catch (e) {
            console.error('Error fetching suppliers:', e);
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
        document.getElementById('btn-ready-to-go')?.addEventListener('click', () => this.openDashboard('ready-to-go'));
        document.getElementById('btn-nomina')?.addEventListener('click', () => this.openDashboard('nomina'));
        document.getElementById('btn-requests')?.addEventListener('click', () => this.openDashboard('requests'));
        document.getElementById('btn-replenishment')?.addEventListener('click', () => this.openDashboard('replenishment'));
        
        document.getElementById('btn-close-dashboard')?.addEventListener('click', () => {
            document.getElementById('staff-dashboard').classList.add('hidden');
            this.toggleActionContainer(true);
        });

        // Modal bindings
        // Panel bindings
        document.getElementById('btn-close-logistics-panel')?.addEventListener('click', () => this.hideAssignPanel());
        document.getElementById('btn-cancel-logistics')?.addEventListener('click', () => this.hideAssignPanel());
        document.getElementById('panel-overlay')?.addEventListener('click', () => this.hideAssignPanel());
        document.getElementById('btn-confirm-logistics')?.addEventListener('click', () => this.confirmLogisticsAction());
    },

    openDashboard: function(mode) {
        const dashboard = document.getElementById('staff-dashboard');
        const title = document.getElementById('dashboard-title');
        const list = document.getElementById('content-list');
        
        if (dashboard && list) {
            list.textContent = ''; 
            dashboard.classList.remove('hidden');
            this.toggleActionContainer(false);
            
            if (title) title.textContent = this.getModeTitle(mode);

            if (mode === 'requests') {
                this.loadRequestsOverview();
            } else {
                const msg = document.createElement('p');
                msg.className = 'op-muted op-message';
                msg.textContent = 'Módulo en desarrollo: ' + mode;
                list.appendChild(msg);
            }
        }
    },

    loadRequestsOverview: async function() {
        const container = document.getElementById('content-list');
        if (!container) return;
        container.innerHTML = '<p class="op-muted">Cargando solicitudes...</p>';
        
        const { data: requests, error } = await window.sb
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
            container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
            return;
        }

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="op-muted">No hay solicitudes pendientes.</p>';
            return;
        }

        container.textContent = '';
        requests.forEach(req => {
            const card = document.createElement('div');
            card.className = 'logistics-card';

            const header = document.createElement('div');
            header.className = 'card-header-flex';

            const meta = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = `Pedido #${req.id.slice(0, 8)}`;
            meta.appendChild(title);

            const date = document.createElement('div');
            date.className = 'card-date';
            date.textContent = `Solicitado: ${new Date(req.created_at).toLocaleDateString()}`;
            meta.appendChild(date);
            
            if (req.operational_date) {
                const opDate = document.createElement('div');
                opDate.className = 'card-date';
                opDate.textContent = `F. Op: ${req.operational_date}`;
                meta.appendChild(opDate);
            }

            const actions = document.createElement('div');
            const assignBtn = document.createElement('button');
            assignBtn.type = 'button';
            assignBtn.className = 'btn-manage';
            assignBtn.textContent = 'Gestionar';
            assignBtn.onclick = () => this.openAssignPanel(req.id);
            actions.appendChild(assignBtn);

            header.appendChild(meta);
            header.appendChild(actions);
            card.appendChild(header);

            // Preview items
            const itemList = document.createElement('ul');
            itemList.className = 'preview-list';
            
            const maxPreview = 3;
            req.replenishment_items.slice(0, maxPreview).forEach(item => {
                const li = document.createElement('li');
                const name = item.inventory_skus ? item.inventory_skus.name : 'Unknown';
                li.textContent = `${name} (${item.requested_packs} packs)`;
                itemList.appendChild(li);
            });
            if (req.replenishment_items.length > maxPreview) {
                const more = document.createElement('li');
                more.textContent = `... y ${req.replenishment_items.length - maxPreview} más.`;
                itemList.appendChild(more);
            }
            
            card.appendChild(itemList);
            container.appendChild(card);
        });
    },

    openAssignPanel: async function(id) {
        this.currentRequestId = id;
        
        const panel = document.getElementById('panel-assign-logistics');
        const overlay = document.getElementById('panel-overlay');

        if (panel && overlay) {
            panel.classList.remove('hidden'); // Ensure it's not display:none if that class was there
            // Force reflow
            void panel.offsetWidth;
            
            panel.classList.add('open');
            overlay.classList.add('open');
            
            document.body.style.overflow = 'hidden'; // Lock scroll
        }

        const container = document.getElementById('assign-items-container');
        if (!container) return;

        container.innerHTML = '<div style="display:flex; justify-content:center; padding:40px;"><div class="loader">Loading...</div></div>';

        const { data: request, error } = await window.sb
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
            container.innerHTML = `<p class="text-danger">${error.message}</p>`;
            return;
        }

        container.textContent = '';
        
        // Header info
        const info = document.createElement('div');
        info.style.marginBottom = '20px';
        info.innerHTML = `<p style="font-size:0.9em; opacity:0.8;">Completa la información logística para cada ítem solicitado.</p>`;
        container.appendChild(info);

        const listContainer = document.createElement('div');
        listContainer.className = 'assign-list-container';
        
        request.replenishment_items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'assign-item-card';
            card.dataset.id = item.id;
            
            const name = item.inventory_skus ? item.inventory_skus.name : 'Unknown';
            
            // Supplier Options
            let supplierOpts = '<option value="">Seleccionar Proveedor...</option>';
            this.suppliersCache.forEach(s => {
                const selected = item.supplier_id === s.id ? 'selected' : '';
                // Truncate to prevent layout blowout on small screens
                const displayName = s.nombre.length > 35 ? s.nombre.substring(0, 35) + '...' : s.nombre;
                supplierOpts += `<option value="${s.id}" ${selected}>${displayName}</option>`;
            });

            card.innerHTML = `
                <div class="item-header">
                    <span class="item-name">${name}</span>
                    <span class="item-qty">x${item.requested_packs}</span>
                </div>
                <div class="item-body">
                    <div class="form-group full-width">
                        <label>Proveedor</label>
                        <div class="custom-select-wrapper">
                            <select class="item-supplier-select">
                                ${supplierOpts}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Costo Total</label>
                            <div class="input-wrapper">
                                <span class="currency-symbol">$</span>
                                <input type="number" class="item-cost-input" placeholder="0.00" value="${item.confirmed_total_cost||''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Fecha de Arribo</label>
                            <input type="date" class="item-date-input" value="${item.delivery_date||''}">
                        </div>
                    </div>
                </div>
            `; 
            
            // Real-time Validation Binding
            const inputs = card.querySelectorAll('select, input');
            inputs.forEach(input => {
                input.addEventListener('input', () => this.validateCard(card));
                input.addEventListener('change', () => this.validateCard(card));
            });
            // Initial Check
            this.validateCard(card);
            
            listContainer.appendChild(card);
        });
        
        container.appendChild(listContainer);
    },

    validateCard: function(card) {
        const supplier = card.querySelector('.item-supplier-select').value;
        const cost = card.querySelector('.item-cost-input').value;
        const date = card.querySelector('.item-date-input').value;
        
        // Check if all fields have values
        if (supplier && cost && date) {
            card.classList.add('is-valid');
            
            // Optional: Dynamic checkmark if not exists
            if (!card.querySelector('.valid-icon')) {
                const icon = document.createElement('div');
                icon.className = 'valid-icon';
                icon.innerHTML = '✓';
                icon.style.position = 'absolute';
                icon.style.top = '12px';
                icon.style.right = '12px';
                icon.style.color = '#00ff88';
                icon.style.fontWeight = 'bold';
                icon.style.fontSize = '1.2em';
                icon.style.pointerEvents = 'none';
                card.appendChild(icon);
            }
        } else {
            card.classList.remove('is-valid');
            const icon = card.querySelector('.valid-icon');
            if (icon) icon.remove();
        }
    },

    confirmLogisticsAction: async function() {
        // Logic to update items
        const rows = document.querySelectorAll('.assign-item-card');
        const updates = [];
        let missing = 0;

        rows.forEach(row => {
            const id = row.dataset.id;
            const supplierId = row.querySelector('.item-supplier-select').value;
            const cost = row.querySelector('.item-cost-input').value;
            const date = row.querySelector('.item-date-input').value;

            if (supplierId && cost && date) {
                updates.push({ id, supplierId, cost, date });
            } else {
                missing++;
            }
        });

        if (missing > 0) {
            if(!confirm(`Hay ${missing} items incompletos. ¿Continuar y guardar solo los completos?`)) return;
        }

        if (updates.length === 0) return;

        try {
            document.getElementById('btn-confirm-logistics').textContent = 'Guardando...';
            
            // Minimal update logic strictly for items. 
            // In a real scenario we might split requests here like logicistica-stock.js did.
            // For now, I'll stick to updating item fields directly. 
            // Splitting logic requires more complex robust code, I will implement direct update first as MVP.
            
            for (const u of updates) {
                await window.sb.from('replenishment_items').update({
                    supplier_id: u.supplierId,
                    confirmed_total_cost: u.cost,
                    delivery_date: u.delivery_date || u.date
                }).eq('id', u.id);
            }
            
            this.hideAssignPanel();
            this.loadRequestsOverview(); // Refresh list to see updates (or remove if processed)
            
        } catch(e) {
            alert('Error: ' + e.message);
        } finally {
            document.getElementById('btn-confirm-logistics').textContent = 'Enviar';
        }
    },

    hideAssignPanel: function() {
        const panel = document.getElementById('panel-assign-logistics');
        const overlay = document.getElementById('panel-overlay');
        
        if (panel && overlay) {
            panel.classList.remove('open');
            overlay.classList.remove('open');
            document.body.style.overflow = ''; // Restore scroll
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
    }
};

document.addEventListener('DOMContentLoaded', () => {
    LogisticaModule.init();
});
