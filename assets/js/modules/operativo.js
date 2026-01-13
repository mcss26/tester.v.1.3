/**
 * Operativo Module - Interactive Flow
 * Auth -> Welcome -> Date Chips -> Actions -> Specific Dashboard
 */

window.OperativoModule = {
    session: null,
    profile: null,
    activeEvent: null,
    stockItems: [],
    stockItems: [],
    stockFilter: 'active',
    stockIdealMode: '500', // '500' or '900'
    analysisTab: 'importar',
    analysisCache: {
        summary: null,
        history: null
    },
    analysisPanels: null,
    dashboardMode: null,
    dashboardRequestId: 0,
    activeMode: 'erp',

    // Helper to find event silently
    findNextEventSilent: async function() {
        if (this.activeEvent) return;
        const { data } = await window.sb
            .from('events')
            .select('id, date, status')
            .neq('status', 'closed')
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .limit(1)
            .single();
        if (data) this.activeEvent = data;
    },

    init: async function() {
        console.log('OperativoModule init...');
        
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
        const page = document.body.dataset.page; // 'erp', 'crm', or undefined (index)
        
        if (page === 'erp') {
            this.activeMode = 'erp';
            this.bindUI_ERP();
            // Event logic removed as per request
            // this.loadOpenEvents();
        } else if (page === 'crm') {
            this.activeMode = 'crm';
            this.bindUI_CRM();
        } else {
            // Index page (Greeting only)
        }
    },

    bindUI_ERP: function() {
        // Actions
        document.getElementById('btn-open-convocation')?.addEventListener('click', () => {
            this.openDashboard('convocation');
        });
        
        document.getElementById('btn-stock-check')?.addEventListener('click', () => {
            this.openDashboard('stock');
        });

        document.getElementById('btn-requests')?.addEventListener('click', () => {
            this.openDashboard('requests'); // ERP Request View
        });

        document.getElementById('btn-load-consumption')?.addEventListener('click', () => {
            this.openDashboard('analysis');
        });
        
        document.getElementById('btn-sku-list')?.addEventListener('click', () => {
             this.openDashboard('sku');
        });
        
        this.bindCommonUI();
    },

    bindUI_CRM: function() {
        // CRM Actions
        document.getElementById('btn-crm-requests')?.addEventListener('click', () => {
             this.openDashboard('requests'); 
        });
        document.getElementById('btn-crm-access')?.addEventListener('click', () => {
             this.openDashboard('access');
        });
        document.getElementById('btn-crm-birthday')?.addEventListener('click', () => {
             this.openDashboard('birthday');
        });
        
        this.bindCommonUI();
    },

    bindCommonUI: function() {
        // Common Dashboard bindings
        document.getElementById('btn-close-dashboard')?.addEventListener('click', () => {
            document.getElementById('staff-dashboard').classList.add('hidden');
            this.restoreActions();
            this.toggleActionContainer(true);
        });

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
            .select('id, full_name, email, role, area_id, is_active')
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

        // Strict Role Check: 'operativo'
        const role = (data.role || '').toLowerCase();
        
        if (role !== 'operativo') {
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

    // --- Event Caching ---
    getCachedOpenEvents: function() {
        const cached = localStorage.getItem('op_open_events');
        if (!cached) return null;
        try {
            const parsed = JSON.parse(cached);
            // Valid for 5 minutes
            if (Date.now() - parsed.timestamp > 300000) {
                localStorage.removeItem('op_open_events');
                return null;
            }
            return { events: parsed.events, fresh: false };
        } catch (e) {
            return null;
        }
    },

    setCachedOpenEvents: function(events) {
        localStorage.setItem('op_open_events', JSON.stringify({
            timestamp: Date.now(),
            events: events
        }));
    },
    
    loadOpenEvents: async function() {
        const chipsContainer = document.getElementById('date-chips');
        if (!chipsContainer) return;
        document.body.classList.remove('event-selected');

        const cached = this.getCachedOpenEvents();
        if (cached?.events?.length) {
            this.renderOpenEvents(cached.events, chipsContainer);
        }

        if (cached?.fresh === false) { 
             // If we have cached data but it's "stale-valid" (implied logic), 
             // we might still want to re-fetch in background or just use it.
             // For now, if we have valid cache, we stop unless we force fresh.
             // But the original logic seemed to imply: result = cached. If present, render. If "fresh" (flag?), return.
             // The implementation of getCachedOpenEvents above returns fresh: false effectively. 
             // Let's assume user wants to avoid network if cache exists.
             if (cached.events) return;
        }

        const { data: events, error } = await window.sb
            .from('events')
            .select('id, date, status')
            .neq('status', 'closed')
            .order('date', { ascending: true });

        if (error || !events || events.length === 0) {
            if (!cached?.events?.length) {
                chipsContainer.textContent = '';
                const empty = document.createElement('p');
                empty.className = 'op-muted op-message';
                empty.textContent = 'No hay eventos abiertos.';
                chipsContainer.appendChild(empty);
            }
            this.activeEvent = null;
            this.toggleActionContainer(false);
            return;
        }

        this.setCachedOpenEvents(events);
        this.renderOpenEvents(events, chipsContainer);
    },

    renderOpenEvents: function(events, container) {
        container.textContent = '';
        if (!events || !events.length) return;

        events.forEach(event => {
            const dateObj = new Date(event.date + 'T12:00:00'); // Normalize
            const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const label = `${dayName.toUpperCase()} ${dayNum}`;

            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip-date';
            chip.textContent = label;
            
            // Auto Select if Active Event matches
            if (this.activeEvent && this.activeEvent.id === event.id) {
                chip.classList.add('active');
            }

            chip.addEventListener('click', () => {
                this.selectEvent(event, chip);
            });

            container.appendChild(chip);
        });
    },

    selectEvent: function(event, chipEl) {
        this.activeEvent = event;
        document.body.classList.add('event-selected');

        // Highlight Active Chip
        document.querySelectorAll('.chip-date').forEach(c => c.classList.remove('active'));
        chipEl.classList.add('active');

        // Show Actions
        this.toggleActionContainer(true);
        
        // Hide dashboard if open
        document.getElementById('staff-dashboard').classList.add('hidden');
    },

    toggleActionContainer: function(show) {
        // Legacy support if needed, or simple toggle
        const actionContainer = document.getElementById('action-container');
        if (actionContainer) {
            actionContainer.classList.toggle('hidden', !show);
        }
    },

    moveActionsToHeader: function() {
        const actions = document.querySelector('.actions-flex');
        const header = document.querySelector('.operativo-header');
        if (actions && header) {
            // Check if already moved
            if (actions.parentElement === header) return;
            
            // Insert after back button (index 1)
            // Header: [BackLink, UserDiv] -> insertBefore UserDiv
            const userDiv = header.querySelector('.operativo-user');
            if (userDiv) {
                header.insertBefore(actions, userDiv);
            } else {
                header.appendChild(actions);
            }
            
            actions.classList.add('header-mode');
            // Inline styles for header mode
            actions.style.position = 'absolute';
            actions.style.left = '50%';
            actions.style.transform = 'translateX(-50%)';
            actions.style.gap = '20px';
            actions.style.fontSize = '0.9em';
            actions.style.margin = '0';
            actions.style.width = 'auto';
        }
    },

    restoreActions: function() {
        const actions = document.querySelector('.actions-flex');
        const originalContainer = document.getElementById('action-container');
        if (actions && originalContainer) {
             if (actions.parentElement === originalContainer.querySelector('.actions-flex')?.parentElement) return; 

             // Restore to .actions-flex container? No, .actions-flex IS the element.
             // Restore to #action-container
             originalContainer.appendChild(actions);
             
             actions.classList.remove('header-mode');
             // Reset inline styles
             actions.style.position = '';
             actions.style.left = '';
             actions.style.transform = '';
             actions.style.gap = '25px';
             actions.style.fontSize = '';
             actions.style.margin = '';
             actions.style.width = '';
        }
    },

    openDashboard: async function(mode) {
        // Guard clauses removed. Actions are always available.
        // If an action specifically needs an event (like convocation), it should handle it internally (e.g. pick next event or show error).
        
        /* 
        const eventRequiredModes = ['convocation', 'analysis', 'stock']; 
        if (eventRequiredModes.includes(mode) && !this.activeEvent) { ... }
        */

        this.dashboardMode = mode;
        const requestId = ++this.dashboardRequestId;

        const dashboard = document.getElementById('staff-dashboard');
        const listContainer = document.getElementById('content-list');
        if (!dashboard || !listContainer) return;
        
        // Sticky Nav Logic
        this.moveActionsToHeader();
        this.toggleActionContainer(false); // Hide the empty container

        dashboard.classList.remove('hidden');
        this.resetDashboard();

        if (mode === 'convocation') {
            this.setDashboardTitle('Personal');
            // Auto-fetch next event if none selected? Or just list staff?
            // "Elimina logica de eventos" implies we might not even care about the event context yet.
            // But convocation writes to a table joined with event_id.
            // Quick fix: Try to find the next open event silently.
            if (!this.activeEvent) {
                 await this.findNextEventSilent();
            }
            
            if (this.activeEvent) {
                 this.setDashboardSubtitle(`Evento: ${this.activeEvent.date}`);
                 this.setDashboardLoading('Cargando equipo...');
                 await this.loadStaffForEvent(this.activeEvent.id, requestId);
            } else {
                 this.setDashboardEmpty('No hay eventos próximos configurados.');
            }
            return;
        }

        if (mode === 'stock') {
            this.stockFilter = 'active';
            await this.loadStockOverview(requestId);
            return;
        }

        if (mode === 'requests') {
            await this.loadRequestsOverview(requestId);
            return;
        }

        if (mode === 'analysis') {
            await this.loadAnalysisOverview(requestId);
            return;
        }

        if (mode === 'access') {
            this.setDashboardTitle('Control de Accesos');
            this.setDashboardEmpty('Módulo en desarrollo: Gestión de accesos y listas.');
            return;
        }

        if (mode === 'sku') {
            await this.loadSKUOverview(requestId);
            return;
        }

        if (mode === 'birthday') {
            this.setDashboardTitle('Agenda de Cumpleaños');
            this.setDashboardEmpty('Módulo en desarrollo: Próximos cumpleaños de clientes.');
            return;
        }
    },

    resetDashboard: function() {
        const listContainer = document.getElementById('content-list');
        if (listContainer) listContainer.textContent = '';
        this.setDashboardSubtitle('');
        this.hideAllocationSubtitle();
        this.setDashboardToolbar(null);
    },

    setDashboardTitle: function(text) {
        const title = document.getElementById('dashboard-title');
        if (title) title.textContent = text;
    },

    setDashboardSubtitle: function(text) {
        const subtitle = document.getElementById('dashboard-subtitle');
        if (!subtitle) return;
        if (text) {
            subtitle.textContent = text;
            subtitle.classList.remove('hidden');
        } else {
            subtitle.textContent = '';
            subtitle.classList.add('hidden');
        }
    },

    hideAllocationSubtitle: function() {
        const subtitleEl = document.getElementById('allocation-subtitle');
        if (subtitleEl) subtitleEl.classList.add('hidden');
    },

    setDashboardToolbar: function(contentNode) {
        const toolbar = document.getElementById('dashboard-toolbar');
        if (!toolbar) return;
        toolbar.textContent = '';
        if (contentNode) {
            toolbar.classList.remove('hidden');
            toolbar.appendChild(contentNode);
        } else {
            toolbar.classList.add('hidden');
        }
    },

    setDashboardMessage: function(message) {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';
        const text = message || 'Cargando...';
        const note = document.createElement('div');
        note.className = 'op-muted op-message';
        note.textContent = text;
        listContainer.appendChild(note);
    },

    setDashboardLoading: function(message) {
        this.setDashboardMessage(message || 'Cargando...');
    },

    setDashboardEmpty: function(message) {
        this.setDashboardMessage(message || 'Sin datos.');
    },

    isDashboardRequestActive: function(requestId, mode) {
        return this.dashboardRequestId === requestId && this.dashboardMode === mode;
    },

    loadStockOverview: async function(requestId) {
        if (!this.isDashboardRequestActive(requestId, 'stock')) return;
        if (!this.isDashboardRequestActive(requestId, 'stock')) return;
        this.setDashboardTitle('');
        this.setDashboardSubtitle('');
        this.setDashboardLoading('Cargando stock...');
        if (!window.sb) {
            this.setDashboardEmpty('No se pudo conectar con el servidor.');
            return;
        }

        try {
            const idealPromise = window.AnalysisHelpers
                ? window.AnalysisHelpers.getIdealMap(window.sb).catch(() => ({}))
                : Promise.resolve({});

            const { data: skus, error: skuError } = await window.sb
                .from('inventory_skus')
                .select('id, name, ml, pack_quantity, is_active')
                .order('name');

            if (skuError) throw skuError;
            if (!skus || skus.length === 0) {
                this.setDashboardEmpty('No se encontraron productos.');
                return;
            }

            const skuIds = skus.map(sku => sku.id);
            let stocks = [];
            if (skuIds.length) {
            const { data: stockData, error: stockError } = await window.sb
                .from('inventory_stock')
                .select('sku_id, stock_actual')
                .in('sku_id', skuIds);

            if (stockError) throw stockError;
            stocks = stockData || [];
            }

            const stockMap = new Map();
            stocks.forEach(stock => stockMap.set(stock.sku_id, stock));

            if (!this.isDashboardRequestActive(requestId, 'stock')) return;
            const idealMap = await idealPromise;
            if (!this.isDashboardRequestActive(requestId, 'stock')) return;

            this.stockItems = skus.map(sku => {
                const stockEntry = stockMap.get(sku.id) || {};
                const actual = stockEntry.stock_actual || 0;
                const idealValues = idealMap[sku.id] || { ideal1: 0, ideal2: 0 };
                const ideal1 = idealValues.ideal1 || 0;
                const ideal2 = idealValues.ideal2 || 0;
                const packQty = sku.pack_quantity || 1;
                const gap500 = Math.max(ideal1 - actual, 0);
                const gap900 = Math.max(ideal2 - actual, 0);
                
                // Suggested in UNITS
                const suggested500 = gap500; 
                const suggested900 = gap900;
                
                const isActive = sku.is_active !== false;
                return {
                    id: sku.id,
                    name: sku.name,
                    unit: sku.ml ? `${sku.ml} ml` : '',
                    packQty,
                    is_active: isActive,
                    actual,
                    ideal_500: ideal1,
                    ideal_900: ideal2,
                    suggested: suggested500, // Default base
                    suggested900: suggested900,
                };
            });

            this.stockItems.sort((a, b) => {
                if (b.suggested !== a.suggested) return b.suggested - a.suggested;
                return a.name.localeCompare(b.name);
            });

            if (!this.isDashboardRequestActive(requestId, 'stock')) return;
            this.setDashboardToolbar(this.renderStockToolbar());
            this.renderStockTable();
        } catch (err) {
            console.error('Error loading stock overview:', err);
            if (this.isDashboardRequestActive(requestId, 'stock')) {
                this.setDashboardEmpty('No se pudo cargar el stock.');
            }
        }
    },

    renderStockToolbar: function() {
        const activeCount = this.stockItems.filter(item => item.is_active).length;
        const inactiveCount = this.stockItems.filter(item => !item.is_active).length;

        const wrapper = document.createElement('div');
        wrapper.className = 'op-toolbar';
        wrapper.style.justifyContent = 'space-between'; 
        wrapper.style.display = 'flex';
        wrapper.style.width = '100%';

        const leftGroup = document.createElement('div');
        leftGroup.className = 'op-tabs';
        leftGroup.appendChild(this.buildStockFilterButton('active', `Activos (${activeCount})`));
        leftGroup.appendChild(this.buildStockFilterButton('inactive', `Descontinuados (${inactiveCount})`));
        wrapper.appendChild(leftGroup);

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '10px';
        rightGroup.style.alignItems = 'center';

        // Ideal Toggle (Only when 'active' is selected)
        if (this.stockFilter === 'active') {
             const toggleBtn = document.createElement('button');
             toggleBtn.type = 'button';
             toggleBtn.className = 'glass-button op-tab-btn';
             toggleBtn.textContent = this.stockIdealMode === '500' ? 'Ideal 500' : 'Ideal 900';
             toggleBtn.addEventListener('click', () => {
                 this.stockIdealMode = this.stockIdealMode === '500' ? '900' : '500';
                 this.setDashboardToolbar(this.renderStockToolbar());
                 this.renderStockTable();
             });
             rightGroup.appendChild(toggleBtn);
        }
        
        // Remove Refresh button as requested
        wrapper.appendChild(rightGroup);

        return wrapper;
    },

    buildStockFilterButton: function(filter, label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'glass-button op-tab-btn';
        btn.textContent = label;
        btn.classList.toggle('active', this.stockFilter === filter);
        btn.addEventListener('click', () => {
            this.stockFilter = filter;
            this.setDashboardToolbar(this.renderStockToolbar());
            this.renderStockTable();
        });
        return btn;
    },

    renderStockTable: function() {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';

        const panel = document.createElement('div');
        panel.className = 'op-panel';

        const filtered = this.stockItems.filter(item => {
            if (this.stockFilter === 'inactive') return !item.is_active;
            return item.is_active;
        });

        if (!filtered.length) {
            const empty = document.createElement('p');
            empty.className = 'op-muted';
            empty.textContent = 'No hay productos para este filtro.';
            panel.appendChild(empty);
            listContainer.appendChild(panel);
            return;
        }

        const scroll = document.createElement('div');
        scroll.className = 'op-scroll';

        const table = document.createElement('table');
        table.className = 'op-table';
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        
        const idealLabel = this.stockIdealMode === '500' ? 'Ideal 500' : 'Ideal 900';

        const columns = [
            { text: 'Producto', align: 'left', width: '40%' },
            { text: 'Actual', align: 'center', width: '15%' },
            { text: idealLabel, align: 'center', width: '15%' },
            { text: 'Sugerido (u)', align: 'center', width: '15%' },
            { text: 'Solicitar', align: 'center', width: '15%' }
        ];

        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.text;
            th.style.textAlign = col.align;
            th.style.width = col.width; // Fixed width
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const fragment = document.createDocumentFragment();
        filtered.forEach(item => {
            const row = document.createElement('tr');
            
            // Logic for suggested value based on mode
            const idealVal = this.stockIdealMode === '500' ? (item.ideal_500 || 0) : (item.ideal_900 || 0);
            const suggestedVal = Math.max(idealVal - item.actual, 0);

            if (suggestedVal > 0) row.classList.add('is-low');

            const nameCell = document.createElement('td');
            const name = document.createElement('div');
            name.textContent = item.name;
            nameCell.appendChild(name);
            if (item.unit) {
                const unit = document.createElement('div');
                unit.className = 'op-muted';
                unit.textContent = item.unit;
                nameCell.appendChild(unit);
            }
            if (!item.is_active) {
                const badge = document.createElement('span');
                badge.className = 'op-status-pill op-status-other';
                badge.textContent = 'Descontinuado';
                nameCell.appendChild(badge);
            }
            row.appendChild(nameCell);

            // Helper to build centered cells
            const buildCenteredCell = (val) => {
                const td = document.createElement('td');
                td.textContent = val !== undefined && val !== null ? val : '-';
                td.style.textAlign = 'center';
                return td;
            };

            row.appendChild(buildCenteredCell(item.actual));
            row.appendChild(buildCenteredCell(idealVal));
            
            // Sugerido (Units)
            row.appendChild(buildCenteredCell(suggestedVal));
            
            // Solicitar (Checkbox)
            const checkCell = document.createElement('td');
            checkCell.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'op-checkbox'; 
            checkbox.value = item.id;
            
            checkCell.appendChild(checkbox);
            row.appendChild(checkCell);

            fragment.appendChild(row);
        });
        tbody.appendChild(fragment);
        table.appendChild(tbody);
        scroll.appendChild(table);
        panel.appendChild(scroll);
        listContainer.appendChild(panel);
    },

    loadRequestsOverview: async function(requestId) {
        if (!this.isDashboardRequestActive(requestId, 'requests')) return;
        if (!this.isDashboardRequestActive(requestId, 'requests')) return;
        this.setDashboardTitle('');
        this.setDashboardSubtitle('');
        this.setDashboardToolbar(this.buildActionToolbar('Actualizar', () => this.loadRequestsOverview(this.dashboardRequestId)));
        this.setDashboardLoading('Cargando solicitudes...');
        if (!window.sb) {
            this.setDashboardEmpty('No se pudo conectar con el servidor.');
            return;
        }

        try {
            const { data: requests, error } = await window.sb
                .from('replenishment_requests')
                .select(`
                    id,
                    status,
                    operational_date,
                    created_at,
                    replenishment_items (
                        id,
                        requested_packs,
                        is_deleted,
                        inventory_skus ( name, pack_quantity )
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            if (!this.isDashboardRequestActive(requestId, 'requests')) return;
            this.renderRequestsOverview(requests || []);
        } catch (err) {
            console.error('Error loading requests:', err);
            if (this.isDashboardRequestActive(requestId, 'requests')) {
                this.setDashboardEmpty('No se pudieron cargar las solicitudes.');
            }
        }
    },

    renderRequestsOverview: function(requests) {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';

        const statusConfig = {
            pending: { label: 'Pendientes', pill: 'op-status-pending' },
            approved: { label: 'Aprobadas', pill: 'op-status-approved' },
            in_replenishment: { label: 'En reposición', pill: 'op-status-inreplenishment' },
            completed: { label: 'Completadas', pill: 'op-status-completed' },
            other: { label: 'Otros', pill: 'op-status-other' }
        };

        const groups = {
            pending: [],
            approved: [],
            in_replenishment: [],
            completed: [],
            other: []
        };

        requests.forEach(req => {
            const status = req.status || 'other';
            if (groups[status]) groups[status].push(req);
            else groups.other.push(req);
        });

        const groupOrder = ['pending', 'approved', 'in_replenishment', 'completed', 'other'];
        groupOrder.forEach(key => {
            const groupItems = groups[key];
            if (!groupItems.length) return; // Skip empty groups entirely

            const panel = document.createElement('div');
            panel.className = 'op-panel';

            const heading = document.createElement('h4');
            heading.className = 'op-heading';
            heading.textContent = `${statusConfig[key].label} (${groupItems.length})`;
            panel.appendChild(heading);

            const list = document.createElement('div');
            list.className = 'op-chart';
            
            // Empty check removed because we skip empty groups above
            // if (!groupItems.length) { ... }

            groupItems.forEach(req => {
                const detail = document.createElement('details');
                detail.className = 'op-detail';

                const summary = document.createElement('summary');
                const left = document.createElement('div');
                left.className = 'op-detail-left';

                const title = document.createElement('div');
                title.className = 'op-detail-title';
                title.textContent = `Solicitud #${String(req.id).slice(0, 8)}`;
                left.appendChild(title);

                const meta = document.createElement('div');
                meta.className = 'op-detail-meta';
                meta.appendChild(this.buildMetaItem('Operativa', req.operational_date || '-'));

                const items = (req.replenishment_items || []).filter(item => !item.is_deleted);
                const totalPacks = items.reduce((sum, item) => sum + (item.requested_packs || 0), 0);
                meta.appendChild(this.buildMetaItem('Items', items.length));
                meta.appendChild(this.buildMetaItem('Packs', totalPacks));
                left.appendChild(meta);

                const statusPill = document.createElement('span');
                statusPill.className = `op-status-pill ${statusConfig[key].pill}`;
                statusPill.textContent = statusConfig[key].label;

                summary.appendChild(left);
                summary.appendChild(statusPill);
                detail.appendChild(summary);

                const body = document.createElement('div');
                body.className = 'op-detail-body';

                if (!items.length) {
                    const empty = document.createElement('p');
                    empty.className = 'op-muted';
                    empty.textContent = 'Sin items activos en esta solicitud.';
                    body.appendChild(empty);
                } else {
                    const table = document.createElement('table');
                    table.className = 'op-table';
                    const thead = document.createElement('thead');
                    const headRow = document.createElement('tr');
                    ['Producto', 'Packs', 'Unidades'].forEach(label => {
                        const th = document.createElement('th');
                        th.textContent = label;
                        headRow.appendChild(th);
                    });
                    thead.appendChild(headRow);
                    table.appendChild(thead);

                    const tbody = document.createElement('tbody');
                    items.forEach(item => {
                        const row = document.createElement('tr');
                        const packQty = item.inventory_skus?.pack_quantity || 1;
                        const units = (item.requested_packs || 0) * packQty;
                        row.appendChild(this.buildTextCell(item.inventory_skus?.name || 'Producto'));
                        row.appendChild(this.buildTextCell(item.requested_packs || 0));
                        row.appendChild(this.buildTextCell(units));
                        tbody.appendChild(row);
                    });
                    table.appendChild(tbody);
                    body.appendChild(table);
                }

                detail.appendChild(body);
                list.appendChild(detail);
            });

            panel.appendChild(list);
            listContainer.appendChild(panel);
        });

        if (!listContainer.children.length) {
            this.setDashboardEmpty('No hay solicitudes para mostrar.');
        }
    },

    loadAnalysisOverview: async function(requestId) {
        if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
        if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
        this.setDashboardTitle('Cargar Consumos');
        this.setDashboardSubtitle('');
        this.analysisTab = 'importar';

        if (!window.sb) {
            this.setDashboardEmpty('No se pudo conectar con el servidor.');
            return;
        }

        // Render Toolbar Tabs
        const tabList = [
            { id: 'importar', label: 'Importar' },
            { id: 'analizar', label: 'Analizar' },
            { id: 'historico', label: 'Histórico' }
        ];

        const toolbarWrapper = document.createElement('div');
        toolbarWrapper.className = 'op-toolbar';
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'op-tabs';
        
        tabList.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'glass-button op-tab-btn';
            btn.textContent = tab.label;
            btn.classList.toggle('active', this.analysisTab === tab.id);
            btn.addEventListener('click', () => {
                this.analysisTab = tab.id;
                this.handleAnalysisTabChange(tab.id, requestId);
                tabsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            tabsContainer.appendChild(btn);
        });
        toolbarWrapper.appendChild(tabsContainer);
        this.setDashboardToolbar(toolbarWrapper);

        // Render Content Panels
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';

        const mainPanel = document.createElement('div');
        mainPanel.className = 'op-panel';

        // 1. Import Panel
        const importPanel = this.buildAnalysisImportPanel();
        
        // 2. Analyze Panel (Table structure)
        const analyzePanel = document.createElement('div');
        analyzePanel.className = 'op-tab-panel hidden';
        analyzePanel.dataset.tab = 'analizar';
        analyzePanel.innerHTML = `
            <div class="op-panel">
                <div class="op-scroll">
                    <table class="op-table" style="width:100%; table-layout:fixed;" id="analysis-table">
                        <thead>
                            <tr>
                                <th style="text-align:left; width:50%">Producto</th>
                                <th style="text-align:center; width:25%">Total</th>
                                <th style="text-align:center; width:25%">Promedio/Op</th>
                            </tr>
                        </thead>
                        <tbody id="analysis-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        // 3. History Panel (Table structure)
        const historyPanel = document.createElement('div');
        historyPanel.className = 'op-tab-panel hidden';
        historyPanel.dataset.tab = 'historico';
        historyPanel.innerHTML = `
            <div class="op-panel">
                <div class="op-scroll">
                    <table class="op-table" id="history-table" style="width:100%; border-collapse: collapse;">
                        <thead id="history-thead"></thead>
                        <tbody id="history-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        mainPanel.appendChild(importPanel);
        mainPanel.appendChild(analyzePanel);
        mainPanel.appendChild(historyPanel);
        listContainer.appendChild(mainPanel);

        this.analysisPanels = {
            importar: importPanel,
            analizar: analyzePanel,
            historico: historyPanel
        };
        
        this.showAnalysisTab(this.analysisTab);
    },

    buildAnalysisImportPanel: function() {
        const panel = document.createElement('div');
        panel.className = 'op-tab-panel';
        panel.dataset.tab = 'importar';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'glass-button op-tab-btn';
        openBtn.textContent = 'Importa reporte';
        openBtn.addEventListener('click', () => {
            window.location.href = '../herramientas/herramientas-analisis.html';
        });
        panel.appendChild(openBtn);

        return panel;
    },


    showAnalysisTab: function(tabId) {
        const panels = document.querySelectorAll('#content-list [data-tab]');
        panels.forEach(panel => {
            panel.classList.toggle('hidden', panel.dataset.tab !== tabId);
        });
    },

    handleAnalysisTabChange: function(tabId, requestId) {
        if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
        this.showAnalysisTab(tabId);

        if (tabId === 'analizar' && this.analysisPanels?.analizar) {
            this.loadAnalysisSummary(this.analysisPanels.analizar, requestId);
        }

        if (tabId === 'historico' && this.analysisPanels?.historico) {
            this.loadHistorySummary(this.analysisPanels.historico, requestId);
        }
    },

    clearAnalysisCache: function() {
        this.analysisCache.summary = null;
        this.analysisCache.history = null;
    },

    loadAnalysisSummary: async function(panel, requestId) {
        const tbody = panel.querySelector('#analysis-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3" class="op-muted" style="text-align:center">Cargando análisis...</td></tr>';
        
        if (!window.sb) return;

        try {
            // Fetch last 30 days
            const since = new Date();
            since.setDate(since.getDate() - 30);
            const sinceStr = since.toISOString().split('T')[0];

            const { data: reports, error: reportsError } = await window.sb
                .from('consumption_reports')
                .select('id, operational_date')
                .gte('operational_date', sinceStr);
            
            if (reportsError) throw reportsError;
            if (!reports || !reports.length) {
                tbody.innerHTML = '<tr><td colspan="3" class="op-muted" style="text-align:center">Sin datos recientes.</td></tr>';
                return;
            }

            const reportIds = reports.map(r => r.id);
            const { data: details, error: detailsError } = await window.sb
                .from('consumption_details')
                .select('quantity, inventory_skus (id, name, unit)')
                .in('report_id', reportIds);

            if (detailsError) throw detailsError;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;

            // Process Data
            const itemMap = new Map();
            details.forEach(d => {
                if (!d.inventory_skus) return;
                const sku = d.inventory_skus;
                const id = sku.id;
                if (!itemMap.has(id)) {
                    itemMap.set(id, { name: sku.name, total: 0, count: 0 });
                }
                const entry = itemMap.get(id);
                entry.total += (d.quantity || 0);
                entry.count += 1; // Can refine to count per distinct report if needed, but simplistic avg/op is typically total / reports count
            });
            
            // Re-calculate avg based on UNIQUE reports count where item appeared? Or total operational days?
            // "Promedio/Op" usually means Average per Operation (Day).
            // Let's use total / reports.length (total days with ANY data) or count of days item appeared?
            // Usually simpler: Total / Total Reports found in period.
            const totalOps = reports.length;

            const rows = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);
            
            tbody.innerHTML = '';
            rows.forEach(item => {
                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.textContent = item.name;
                tdName.style.textAlign = 'left';
                tr.appendChild(tdName);
                
                const tdTotal = document.createElement('td');
                tdTotal.textContent = Math.round(item.total);
                tdTotal.style.textAlign = 'center';
                tr.appendChild(tdTotal);
                
                const tdAvg = document.createElement('td');
                tdAvg.textContent = (item.total / totalOps).toFixed(1);
                tdAvg.style.textAlign = 'center';
                tr.appendChild(tdAvg);
                
                tbody.appendChild(tr);
            });
            
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="3" class="op-error">Error cargando datos.</td></tr>';
        }
    },

    loadHistorySummary: async function(panel, requestId) {
        const thead = panel.querySelector('#history-thead');
        const tbody = panel.querySelector('#history-tbody');
        if (!thead || !tbody) return;
        
        tbody.innerHTML = '<tr><td class="op-muted">Cargando historial...</td></tr>';
        
        try {
            // Fetch last 15 reports for column limit
            const { data: reports, error: reportsError } = await window.sb
                .from('consumption_reports')
                .select('id, operational_date')
                .order('operational_date', { ascending: false })
                .limit(15);
                
            if (reportsError) throw reportsError;
            if (!reports || !reports.length) {
                tbody.innerHTML = '<tr><td class="op-muted">Sin reportes registrados.</td></tr>';
                return;
            }
            
            // Sort Chronologically for headers (Oldest -> Newest) or leave Rev Chrono?
            // Usually Matrix is Product | Date 1 | Date 2...
            // Let's do Descending (Newest First) as it's more relevant.
            
            const reportIds = reports.map(r => r.id);
            const { data: details, error: detailsError } = await window.sb
                .from('consumption_details')
                .select('quantity, report_id, inventory_skus (id, name)')
                .in('report_id', reportIds);

            if (detailsError) throw detailsError;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
            
            // Matrix Construction
            const skuMap = new Map();
            // Distinct SKUs
            details.forEach(d => {
                if (!d.inventory_skus) return;
                const sid = d.inventory_skus.id;
                if (!skuMap.has(sid)) {
                    skuMap.set(sid, { name: d.inventory_skus.name, data: {} });
                }
                skuMap.get(sid).data[d.report_id] = (skuMap.get(sid).data[d.report_id] || 0) + d.quantity;
            });
            
            // Render Headers
            thead.innerHTML = '';
            const trHead = document.createElement('tr');
            
            const thProd = document.createElement('th');
            thProd.textContent = 'Producto';
            thProd.style.textAlign = 'left';
            thProd.style.minWidth = '150px';
            thProd.style.position = 'sticky';
            thProd.style.left = '0';
            thProd.style.background = '#1a0505'; // Match theme bg for sticky
            thProd.style.zIndex = '10';
            trHead.appendChild(thProd);
            
            reports.forEach(rep => {
                const th = document.createElement('th');
                // Format date: DD/MM
                const dateParts = rep.operational_date.split('-');
                th.textContent = `${dateParts[2]}/${dateParts[1]}`;
                th.style.textAlign = 'center';
                th.style.minWidth = '60px';
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);
            
            // Render Body
            tbody.innerHTML = '';
            const rows = Array.from(skuMap.values()).sort((a,b) => a.name.localeCompare(b.name));
            
            rows.forEach(item => {
                const tr = document.createElement('tr');
                const tdName = document.createElement('td');
                tdName.textContent = item.name;
                tdName.style.textAlign = 'left';
                tdName.style.position = 'sticky';
                tdName.style.left = '0';
                tdName.style.background = '#1a0505'; // Match theme
                tdName.style.zIndex = '5';
                tdName.style.borderRight = '1px solid #330d0d';
                tr.appendChild(tdName);
                
                reports.forEach(rep => {
                    const td = document.createElement('td');
                    const val = item.data[rep.id];
                    td.textContent = val ? Math.round(val) : '-';
                    td.style.textAlign = 'center';
                    if (!val) td.className = 'op-muted';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

        } catch (err) {
             console.error(err);
             tbody.innerHTML = '<tr><td class="op-error">Error al cargar historial.</td></tr>';
        }
    },


    applyAnalysisSummary: function(data, panel) {
        const reportsEl = panel.querySelector('[data-summary="reports"]');
        const totalEl = panel.querySelector('[data-summary="total"]');
        const latestEl = panel.querySelector('[data-summary="latest"]');
        if (!reportsEl || !totalEl || !latestEl) return;
        reportsEl.textContent = data.reports;
        totalEl.textContent = data.total;
        latestEl.textContent = data.latest;
    },

    renderHistorySummary: function(chart, tbody, items, maxValueOverride) {
        if (!chart || !tbody) return;
        const maxValue = maxValueOverride || (items[0]?.qty || 1);

        chart.textContent = '';
        const chartFragment = document.createDocumentFragment();
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'op-bar-row';

            const label = document.createElement('span');
            label.textContent = item.name;
            row.appendChild(label);

            const track = document.createElement('div');
            track.className = 'op-bar-track';
            const fill = document.createElement('div');
            fill.className = 'op-bar-fill';
            fill.style.width = `${Math.round((item.qty / maxValue) * 100)}%`;
            track.appendChild(fill);
            row.appendChild(track);

            const value = document.createElement('span');
            value.textContent = Math.round(item.qty);
            row.appendChild(value);

            chartFragment.appendChild(row);
        });
        chart.appendChild(chartFragment);

        const tableFragment = document.createDocumentFragment();
        items.forEach(item => {
            const row = document.createElement('tr');
            row.appendChild(this.buildTextCell(item.name));
            row.appendChild(this.buildTextCell(Math.round(item.qty)));
            row.appendChild(this.buildTextCell('En desarrollo'));
            row.appendChild(this.buildTextCell('En desarrollo'));
            tableFragment.appendChild(row);
        });
        tbody.appendChild(tableFragment);
    },

    buildMetaItem: function(label, value) {
        const item = document.createElement('span');
        item.className = 'op-muted';
        item.textContent = `${label}: ${value}`;
        return item;
    },

    buildActionToolbar: function(label, onClick) {
        const toolbar = document.createElement('div');
        toolbar.className = 'op-toolbar';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'glass-button op-tab-btn';
        button.textContent = label;
        button.addEventListener('click', onClick);
        toolbar.appendChild(button);
        return toolbar;
    },

    buildOpCell: function(value, center) {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (center) cell.classList.add('cell-center');
        return cell;
    },

    buildTextCell: function(value) {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
    },

    getDateOffset: function(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    },

    getMonthStart: function() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return start.toISOString().slice(0, 10);
    },

    getMonthLabel: function(date) {
        return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    },

    getMonthKey: function(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${date.getFullYear()}-${month}`;
    },

    // --- Convocation Logic (Reused) ---

    loadStaffForEvent: async function(eventId, requestId) {
        if (!this.isDashboardRequestActive(requestId, 'convocation')) return;
        const listContainer = document.getElementById('content-list');
        
        // 1. Determine Area (From Profile)
        const areaId = this.profile.area_id;

        if (!areaId) {
            this.setDashboardEmpty('Error: Tu usuario no tiene área asignada.');
            return;
        }

        // 2. Fetch Staff
        const { data: staffUsers } = await window.sb
            .from('profiles')
            .select('id, full_name, email, area_id')
            .eq('role', 'staff barra')
            .eq('area_id', areaId)
            .eq('is_active', true);

        if (!this.isDashboardRequestActive(requestId, 'convocation')) return;
        if (!staffUsers || staffUsers.length === 0) {
            this.setDashboardEmpty('No hay personal disponible en tu área.');
        }

        // Calculate Requirements in parallel
        this.calculateRequiredStaff(eventId, areaId, requestId);

        // 3. Fetch Convocations
        const { data: convocations } = await window.sb
            .from('staff_convocations')
            .select('user_id, status')
            .eq('event_id', eventId);

        const convocationMap = {};
        if (convocations) {
            convocations.forEach(c => convocationMap[c.user_id] = c.status);
        }

        // 4. Render (Exclude Me)
        if (staffUsers && staffUsers.length > 0) {
            const filteredStaff = staffUsers.filter(u => u.id !== this.session.user.id);
            filteredStaff.sort((a, b) => {
                const aName = (a.full_name || a.email || '').toLowerCase();
                const bName = (b.full_name || b.email || '').toLowerCase();
                return aName.localeCompare(bName);
            });
            this.renderStaffList(filteredStaff, convocationMap);
        }
    },

    calculateRequiredStaff: async function(eventId, areaId, requestId) {
        if (!this.isDashboardRequestActive(requestId, 'convocation')) return;
        const countEl = document.getElementById('required-count');
        const subtitleEl = document.getElementById('allocation-subtitle');
        if (!countEl) return;

        if (subtitleEl) subtitleEl.classList.remove('hidden');
        countEl.textContent = '...';

        // 1. Get Positions for Area
        const { data: positions } = await window.sb
            .from('job_positions')
            .select('id')
            .eq('area_id', areaId);
            
        const positionIds = (positions || []).map(p => p.id);
        
        // 2. Get Allocations matching Area or Positions
        const { data: allocations } = await window.sb
            .from('staff_allocations')
            .select('quantity, position_id, area_id')
            .eq('event_id', eventId);
        if (!this.isDashboardRequestActive(requestId, 'convocation')) return;
            
        let total = 0;
        if (allocations) {
            allocations.forEach(alloc => {
                if (alloc.area_id === areaId || (positionIds.length && positionIds.includes(alloc.position_id))) {
                    total += (alloc.quantity || 0);
                }
            });
        }
        
        countEl.textContent = total > 0 ? total : '0';
    },

    renderStaffList: function(staff, convocationMap) {
        const listContainer = document.getElementById('content-list');
        listContainer.innerHTML = '';

        staff.forEach(person => {
            const status = convocationMap[person.id];
            
            const row = document.createElement('div');
            row.className = 'staff-row';
            const displayName = person.full_name || person.email || 'Sin nombre';

            const info = document.createElement('div');
            info.className = 'staff-info';
            const name = document.createElement('span');
            name.className = 'staff-name';
            name.textContent = displayName;
            const role = document.createElement('span');
            role.className = 'staff-role';
            role.textContent = 'Staff';
            info.appendChild(name);
            info.appendChild(role);

            const actions = document.createElement('div');
            actions.className = 'staff-actions';

            if (!status) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-convocate-small';
                button.textContent = 'Convocar';
                button.addEventListener('click', () => this.convocate(person.id, button));
                actions.appendChild(button);
            } else {
                const statusMap = {
                    pending: { label: 'Enviado', className: 'staff-status-pending' },
                    accepted: { label: 'Confirmado', className: 'staff-status-accepted' },
                    rejected: { label: 'Rechazado', className: 'staff-status-rejected' }
                };
                const statusConfig = statusMap[status] || statusMap.pending;
                const statusEl = document.createElement('span');
                statusEl.className = `staff-status ${statusConfig.className}`;
                statusEl.textContent = statusConfig.label;
                actions.appendChild(statusEl);
            }

            row.appendChild(info);
            row.appendChild(actions);
            listContainer.appendChild(row);
        });
    },

    convocate: async function(staffId, btnElement) {
        if (!this.activeEvent) return;
        const originalText = btnElement.textContent;
        btnElement.textContent = '...';
        btnElement.disabled = true;

        const { error } = await window.sb
            .from('staff_convocations')
            .insert({
                event_id: this.activeEvent.id,
                user_id: staffId,
                status: 'pending',
                created_at: new Date()
            });

        if (error) {
            console.error(error);
            alert('Error al convocar');
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        } else {
            const parent = btnElement.parentElement;
            if (!parent) return;
            parent.textContent = '';
            const status = document.createElement('span');
            status.className = 'staff-status staff-status-pending';
            status.textContent = 'Enviado';
            parent.appendChild(status);
        }
    },

    loadSKUOverview: async function(requestId) {
        if (!this.isDashboardRequestActive(requestId, 'sku')) return;
        this.setDashboardTitle('Visor de SKU');
        this.setDashboardSubtitle('');
        this.setDashboardToolbar(null); // Optional: Add search later
        this.setDashboardLoading('Cargando catálogo...');

        
        if (!window.sb) {
            this.setDashboardEmpty('No se pudo conectar con el servidor.');
            return;
        }

        try {
            const [skusResponse, categoriesResponse] = await Promise.all([
                window.sb
                    .from('inventory_skus')
                    .select('id, name, ml, cost, category_id, is_active')
                    .eq('is_active', true)
                    .order('name'),
                window.sb
                    .from('categories')
                    .select('id, nombre')
            ]);

            if (skusResponse.error) throw skusResponse.error;
            
            const skus = skusResponse.data || [];
            const categories = categoriesResponse.data || [];
            const catMap = new Map(categories.map(c => [c.id, c.nombre]));

            // Store State
            this.skuData = { skus, categories, catMap };
            this.skuState = this.skuState || { category: 'all', search: '' };

            if (!this.isDashboardRequestActive(requestId, 'sku')) return;
            if (!skus.length) {
                this.setDashboardEmpty('No hay SKUs activos.');
                return;
            }

            this.renderSKUToolbar();
            this.renderSKUList();

        } catch (err) {
            console.error('Error loading SKU overview:', err);
            if (this.isDashboardRequestActive(requestId, 'sku')) {
                this.setDashboardEmpty('Error al cargar el catálogo.');
            }
        }
    },

    renderSKUToolbar: function() {
        const toolbar = document.createElement('div');
        toolbar.className = 'op-toolbar';
        toolbar.style.display = 'flex';
        toolbar.style.flexDirection = 'column';
        toolbar.style.alignItems = 'stretch';
        toolbar.style.gap = '12px';
        toolbar.style.padding = '0';
        toolbar.style.background = 'transparent';

        // Search Bar
        const searchContainer = document.createElement('div');
        searchContainer.style.position = 'relative';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Buscar producto...';
        searchInput.className = 'op-input glass-input';
        searchInput.style.width = '100%';
        searchInput.style.paddingLeft = '15px';
        searchInput.value = this.skuState.search;
        
        searchInput.addEventListener('input', (e) => {
            this.skuState.search = e.target.value.toLowerCase();
            this.renderSKUList();
        });
        
        searchContainer.appendChild(searchInput);
        toolbar.appendChild(searchContainer);

        // Category Tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'op-tabs'; // Using standard class
        tabsContainer.style.display = 'flex';
        tabsContainer.style.gap = '8px';
        tabsContainer.style.overflowX = 'auto';
        tabsContainer.style.whiteSpace = 'nowrap';
        tabsContainer.style.paddingBottom = '4px';
        tabsContainer.style.scrollbarWidth = 'none'; 
        
        const createTab = (id, label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `glass-button op-tab-btn ${id === this.skuState.category ? 'active' : ''}`;
            btn.textContent = label;
            btn.onclick = () => {
                this.skuState.category = id;
                this.renderSKUToolbar(); // Re-render toolbar to update active state
                this.renderSKUList();
            };
            return btn;
        };

        tabsContainer.appendChild(createTab('all', 'Todo'));
        this.skuData.categories.forEach(cat => {
            tabsContainer.appendChild(createTab(cat.id, cat.nombre));
        });

        toolbar.appendChild(tabsContainer);
        this.setDashboardToolbar(toolbar);
    },

    renderSKUList: function() {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';

        const panel = document.createElement('div');
        panel.className = 'op-panel';
        
        const scroll = document.createElement('div');
        scroll.className = 'op-scroll';
        
        const table = document.createElement('table');
        table.className = 'op-table';
        table.style.width = '100%';
        
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th style="text-align:left">Nombre</th>
                <th style="text-align:left">Categoría</th>
                <th style="text-align:center">Unidad</th>
            </tr>
        `;
        table.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        
        const term = this.skuState.search;
        const catId = this.skuState.category;
        
        const filtered = this.skuData.skus.filter(sku => {
            const matchesTerm = sku.name.toLowerCase().includes(term);
            const matchesCat = catId === 'all' || sku.category_id === catId;
            return matchesTerm && matchesCat;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="op-muted" style="text-align:center; padding: 20px;">Sin resultados.</td></tr>';
        } else {
            filtered.forEach(sku => {
                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.textContent = sku.name;
                tr.appendChild(tdName);
                
                const tdCat = document.createElement('td');
                tdCat.textContent = this.skuData.catMap.get(sku.category_id) || '-';
                tr.appendChild(tdCat);
                
                const tdUnit = document.createElement('td');
                tdUnit.textContent = sku.ml ? `${sku.ml} ml` : '-';
                tdUnit.style.textAlign = 'center';
                tr.appendChild(tdUnit);
                
                tbody.appendChild(tr);
            });
        }
        
        table.appendChild(tbody);
        scroll.appendChild(table);
        panel.appendChild(scroll);
        listContainer.appendChild(panel);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    OperativoModule.init();
});
