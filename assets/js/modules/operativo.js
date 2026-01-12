/**
 * Operativo Module - Interactive Flow
 * Auth -> Welcome -> Date Chips -> Actions -> Specific Dashboard
 */

window.OperativoModule = {
    session: null,
    profile: null,
    activeEvent: null,
    stockItems: [],
    stockFilter: 'active',
    analysisTab: 'importar',
    analysisCache: {
        summary: null,
        history: null
    },
    analysisPanels: null,
    dashboardMode: null,
    dashboardRequestId: 0,
    activeMode: 'erp',

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
        this.bindUI();
        
        // 2. Load Profile + Open Events in parallel
        await Promise.all([
            this.loadUserProfile(session.user.id),
            this.loadOpenEvents()
        ]);
    },

    bindUI: function() {
        // Actions
        document.getElementById('btn-open-convocation')?.addEventListener('click', () => {
            this.openDashboard('convocation');
        });
        
        document.getElementById('btn-stock-check')?.addEventListener('click', () => {
            this.openDashboard('stock');
        });

        document.getElementById('btn-requests')?.addEventListener('click', () => {
            this.openDashboard('requests');
        });

        document.getElementById('btn-load-consumption')?.addEventListener('click', () => {
            this.openDashboard('analysis');
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

        // Mode Switcher
        document.querySelectorAll('.mode-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                if (mode) this.setMode(mode);
            });
        });

        // CRM Actions (Placeholders)
        document.getElementById('btn-crm-requests')?.addEventListener('click', () => {
             this.openDashboard('requests'); // Reusing requests dashboard
        });
        document.getElementById('btn-crm-access')?.addEventListener('click', () => {
             alert('Módulo de Accesos: Próximamente');
        });
        document.getElementById('btn-crm-birthday')?.addEventListener('click', () => {
             alert('Módulo de Cumpleaños: Próximamente');
        });
        document.getElementById('btn-crm-menu')?.addEventListener('click', () => {
             // Redirect to Carta if available, or placeholder
             window.location.href = '../../carta.html'; 
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
            // alert('Acceso no autorizado.');
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
        const chipsContainer = document.getElementById('date-chips');
        if (!chipsContainer) return;

        const cached = this.getCachedOpenEvents();
        if (cached?.events?.length) {
            this.renderOpenEvents(cached.events, chipsContainer);
        }

        if (cached?.fresh) return;

        const { data: events, error } = await window.sb
            .from('events')
            .select('id, date, status')
            .neq('status', 'closed')
            .order('date', { ascending: true });

        if (error || !events || events.length === 0) {
            if (!cached?.events?.length) {
                chipsContainer.innerHTML = '<p style="font-size:12px; opacity:0.6;">No hay eventos abiertos.</p>';
            }
            return;
        }

        this.setCachedOpenEvents(events);
        this.renderOpenEvents(events, chipsContainer);
    },

    renderOpenEvents: function(events, container) {
        container.innerHTML = '';

        if (!events || events.length === 0) {
            container.innerHTML = '<p style="font-size:12px; opacity:0.6;">No hay eventos abiertos.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        events.forEach(event => {
            const dateStr = new Date(event.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
            
            const chip = document.createElement('div');
            chip.className = 'chip-date cursor-pointer';
            chip.style.margin = '0 4px';
            chip.textContent = dateStr.toUpperCase();
            chip.onclick = () => this.selectEvent(event, chip);
            
            fragment.appendChild(chip);
        });
        container.appendChild(fragment);
    },

    getCachedOpenEvents: function() {
        try {
            const raw = window.sessionStorage.getItem('op-open-events');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.events)) return null;
            const ageMs = Date.now() - parsed.timestamp;
            return {
                events: parsed.events,
                fresh: ageMs < 60000
            };
        } catch (err) {
            return null;
        }
    },

    setCachedOpenEvents: function(events) {
        try {
            window.sessionStorage.setItem('op-open-events', JSON.stringify({
                events,
                timestamp: Date.now()
            }));
        } catch (err) {
            // Ignore storage errors (quota/private mode)
        }
    },

    selectEvent: function(event, chipEl) {
        this.activeEvent = event;

        // Highlight Active Chip
        document.querySelectorAll('.chip-date').forEach(c => c.classList.remove('active'));
        chipEl.classList.add('active');

        // Show Action Container based on Mode
        this.refreshActionVisibility();
        this.updateEventDateLabel();
        
        // Hide dashboard if open
        document.getElementById('staff-dashboard').classList.add('hidden');
    },

    setMode: function(mode) {
        this.activeMode = mode;
        
        // Update Chips UI
        document.querySelectorAll('.mode-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update Visibility
        this.refreshActionVisibility();
        this.updateEventDateLabel();
        
        // Optional: Close dashboard on mode switch?
        document.getElementById('staff-dashboard').classList.add('hidden');
    },

    updateEventDateLabel: function() {
        const label = document.getElementById('event-date-label');
        if (!label) return;

        if (this.activeMode !== 'erp' || !this.activeEvent) {
            label.textContent = '';
            label.classList.add('hidden');
            return;
        }

        const dateText = new Date(this.activeEvent.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
        label.textContent = `Evento: ${dateText}`;
        label.classList.remove('hidden');
    },

    refreshActionVisibility: function() {
        const actionContainer = document.getElementById('action-container');
        const crmContainer = document.getElementById('crm-action-container');
        
        // Hide all first
        if (actionContainer) actionContainer.classList.add('hidden');
        if (crmContainer) crmContainer.classList.add('hidden');

        // Only show if event is selected
        if (!this.activeEvent) return;

        if (this.activeMode === 'erp') {
            if (actionContainer) actionContainer.classList.remove('hidden');
        } else {
            if (crmContainer) crmContainer.classList.remove('hidden');
        }
    },

    openDashboard: async function(mode) {
        if (mode === 'convocation' && !this.activeEvent) return;

        this.dashboardMode = mode;
        const requestId = ++this.dashboardRequestId;

        const dashboard = document.getElementById('staff-dashboard');
        const listContainer = document.getElementById('content-list');
        if (!dashboard || !listContainer) return;
        
        dashboard.classList.remove('hidden');
        this.resetDashboard();

        if (mode === 'convocation') {
            this.setDashboardTitle('Convocar Equipo');
            this.setDashboardLoading('Cargando equipo...');
            await this.loadStaffForEvent(this.activeEvent.id, requestId);
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
        if (subtitleEl) subtitleEl.style.display = 'none';
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

    setDashboardLoading: function(message) {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        const text = message || 'Cargando...';
        listContainer.innerHTML = `<div class="op-muted" style="text-align:center; padding:16px;">${text}</div>`;
    },

    setDashboardEmpty: function(message) {
        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.innerHTML = `<div class="op-muted" style="text-align:center; padding:16px;">${message}</div>`;
    },

    isDashboardRequestActive: function(requestId, mode) {
        return this.dashboardRequestId === requestId && this.dashboardMode === mode;
    },

    loadStockOverview: async function(requestId) {
        if (!this.isDashboardRequestActive(requestId, 'stock')) return;
        this.setDashboardTitle('Stock Check');
        this.setDashboardSubtitle('Producto / Actual / Ideal 500 / Ideal 900 / Sugerido / Packs');
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
                const gap = Math.max(ideal1 - actual, 0);
                const suggested = gap > 0 ? Math.ceil(gap / packQty) : 0;
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
                    suggested
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

        const tabs = document.createElement('div');
        tabs.className = 'op-tabs';
        tabs.appendChild(this.buildStockFilterButton('active', `Activos (${activeCount})`));
        tabs.appendChild(this.buildStockFilterButton('inactive', `Descontinuados (${inactiveCount})`));
        wrapper.appendChild(tabs);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.alignItems = 'center';
        actions.style.gap = '8px';

        const meta = document.createElement('div');
        meta.className = 'op-muted';
        meta.textContent = `Total: ${this.stockItems.length}`;
        actions.appendChild(meta);

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'glass-button op-tab-btn';
        refresh.textContent = 'Actualizar';
        refresh.addEventListener('click', () => this.loadStockOverview(this.dashboardRequestId));
        actions.appendChild(refresh);

        wrapper.appendChild(actions);

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

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Producto', 'Actual', 'Ideal 500', 'Ideal 900', 'Sugerido', 'Packs'].forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const fragment = document.createDocumentFragment();
        filtered.forEach(item => {
            const row = document.createElement('tr');
            if (item.suggested > 0) row.classList.add('is-low');

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

            row.appendChild(this.buildOpCell(item.actual, true));
            row.appendChild(this.buildOpCell(item.ideal_500 || '-', true));
            row.appendChild(this.buildOpCell(item.ideal_900 || '-', true));
            row.appendChild(this.buildOpCell(item.suggested || '-', true));
            row.appendChild(this.buildOpCell(item.packQty, true));

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
        this.setDashboardTitle('Solicitudes');
        this.setDashboardSubtitle('Pendientes, aprobadas, en reposición y completadas.');
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

            const panel = document.createElement('div');
            panel.className = 'op-panel';

            const heading = document.createElement('h4');
            heading.className = 'op-heading';
            heading.textContent = `${statusConfig[key].label} (${groupItems.length})`;
            panel.appendChild(heading);

            const list = document.createElement('div');
            list.className = 'op-chart';

            if (!groupItems.length) {
                const empty = document.createElement('p');
                empty.className = 'op-muted';
                empty.textContent = 'Sin solicitudes en este estado.';
                list.appendChild(empty);
            }

            groupItems.forEach(req => {
                const detail = document.createElement('details');
                detail.className = 'op-detail';

                const summary = document.createElement('summary');
                const left = document.createElement('div');
                left.style.display = 'flex';
                left.style.flexDirection = 'column';
                left.style.gap = '6px';

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
        this.setDashboardTitle('Cargar consumos');
        this.setDashboardSubtitle('');
        this.setDashboardToolbar(null);
        this.analysisTab = 'importar';
        if (!window.sb) {
            this.setDashboardEmpty('No se pudo conectar con el servidor.');
            return;
        }

        const listContainer = document.getElementById('content-list');
        if (!listContainer) return;
        listContainer.textContent = '';

        const panel = document.createElement('div');
        panel.className = 'op-panel';

        const tabs = document.createElement('div');
        tabs.className = 'op-tabs';
        const tabList = [
            { id: 'importar', label: 'Importa reporte' }
        ];

        tabList.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'glass-button op-tab-btn';
            btn.textContent = tab.label;
            btn.classList.toggle('active', this.analysisTab === tab.id);
            btn.addEventListener('click', () => {
                this.analysisTab = tab.id;
                this.handleAnalysisTabChange(tab.id, requestId);
                tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            tabs.appendChild(btn);
        });
        panel.appendChild(tabs);

        const importarPanel = this.buildAnalysisImportPanel();

        panel.appendChild(importarPanel);
        listContainer.appendChild(panel);

        this.analysisPanels = null;
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
        const reportsEl = panel.querySelector('[data-summary="reports"]');
        const totalEl = panel.querySelector('[data-summary="total"]');
        const latestEl = panel.querySelector('[data-summary="latest"]');
        if (!reportsEl || !totalEl || !latestEl) return;
        if (!window.sb) return;
        if (!this.isDashboardRequestActive(requestId, 'analysis')) return;

        const cached = this.analysisCache.summary;
        if (cached && (Date.now() - cached.timestamp) < 120000) {
            this.applyAnalysisSummary(cached.data, panel);
            return;
        }

        reportsEl.textContent = '...';
        totalEl.textContent = '...';
        latestEl.textContent = '...';

        try {
            const since = this.getDateOffset(-30);
            const { data: reports, error } = await window.sb
                .from('consumption_reports')
                .select('id, operational_date')
                .gte('operational_date', since);

            if (error) throw error;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
            if (!reports || !reports.length) {
                this.applyAnalysisSummary({ reports: 0, total: 0, latest: '-' }, panel);
                this.analysisCache.summary = {
                    timestamp: Date.now(),
                    data: { reports: 0, total: 0, latest: '-' }
                };
                return;
            }

            const reportIds = reports.map(rep => rep.id);
            const latestDate = reports.reduce((latest, rep) => {
                if (!latest || rep.operational_date > latest) return rep.operational_date;
                return latest;
            }, '');

            const { data: details, error: detailsError } = await window.sb
                .from('consumption_details')
                .select('quantity')
                .in('report_id', reportIds);

            if (detailsError) throw detailsError;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
            const total = (details || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

            const summaryData = {
                reports: reports.length,
                total: Math.round(total),
                latest: latestDate || '-'
            };
            this.applyAnalysisSummary(summaryData, panel);
            this.analysisCache.summary = {
                timestamp: Date.now(),
                data: summaryData
            };
        } catch (err) {
            console.error('Error loading analysis summary:', err);
            reportsEl.textContent = '-';
            totalEl.textContent = '-';
            latestEl.textContent = '-';
        }
    },

    loadHistorySummary: async function(panel, requestId) {
        const chart = panel.querySelector('[data-chart="history"]');
        const tbody = panel.querySelector('[data-history-table]');
        const monthLabel = panel.querySelector('[data-history-month="true"]');
        if (!chart || !tbody) return;
        if (!window.sb) return;
        if (!this.isDashboardRequestActive(requestId, 'analysis')) return;

        const monthKey = this.getMonthKey(new Date());
        const cached = this.analysisCache.history;
        if (cached && cached.monthKey === monthKey && (Date.now() - cached.timestamp) < 120000) {
            if (monthLabel) monthLabel.textContent = cached.label;
            this.renderHistorySummary(chart, tbody, cached.items);
            return;
        }

        chart.innerHTML = '<p class="op-muted">Cargando diagrama...</p>';
        tbody.innerHTML = '';

        try {
            const monthStart = this.getMonthStart();
            const today = this.getDateOffset(0);
            if (monthLabel) {
                monthLabel.textContent = this.getMonthLabel(new Date());
            }
            const { data: reports, error } = await window.sb
                .from('consumption_reports')
                .select('id, operational_date')
                .gte('operational_date', monthStart)
                .lte('operational_date', today);

            if (error) throw error;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
            if (!reports || !reports.length) {
                chart.innerHTML = '<p class="op-muted">Sin consumos registrados este mes.</p>';
                return;
            }

            const reportIds = reports.map(rep => rep.id);
            const { data: details, error: detailsError } = await window.sb
                .from('consumption_details')
                .select('sku_id, quantity')
                .in('report_id', reportIds);

            if (detailsError) throw detailsError;
            if (!this.isDashboardRequestActive(requestId, 'analysis')) return;
            if (!details || !details.length) {
                chart.innerHTML = '<p class="op-muted">Sin detalles disponibles.</p>';
                return;
            }

            const totals = {};
            details.forEach(item => {
                const skuId = item.sku_id || 'unknown';
                totals[skuId] = (totals[skuId] || 0) + (item.quantity || 0);
            });

            const ranked = Object.entries(totals)
                .map(([skuId, qty]) => ({ skuId, qty }))
                .sort((a, b) => b.qty - a.qty);

            const topItems = ranked.slice(0, 10);
            const maxValue = topItems[0]?.qty || 1;

            const skuIds = topItems.map(item => item.skuId).filter(id => id !== 'unknown');
            const skuMap = new Map();
            if (skuIds.length) {
                const { data: skus, error: skuError } = await window.sb
                    .from('inventory_skus')
                    .select('id, name')
                    .in('id', skuIds);
                if (skuError) throw skuError;
                (skus || []).forEach(sku => skuMap.set(sku.id, sku.name));
            }

            const itemsWithNames = topItems.map(item => ({
                name: skuMap.get(item.skuId) || 'Producto',
                qty: item.qty
            }));

            this.renderHistorySummary(chart, tbody, itemsWithNames, maxValue);
            this.analysisCache.history = {
                timestamp: Date.now(),
                monthKey,
                label: this.getMonthLabel(new Date()),
                items: itemsWithNames
            };
        } catch (err) {
            console.error('Error loading history summary:', err);
            chart.innerHTML = '<p class="op-muted">No se pudo cargar el histórico.</p>';
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
        if (center) cell.style.textAlign = 'center';
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
            listContainer.innerHTML = '<p>Error: Tu usuario no tiene área asignada.</p>';
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
             listContainer.innerHTML = '<p>No hay personal disponible en tu área.</p>';
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
        
        subtitleEl.style.display = 'block'; // Ensure visible
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

            let actionHtml = '';
            if (!status) {
                actionHtml = `<button class="btn-convocate-small" onclick="OperativoModule.convocate('${person.id}', this)">Convocar</button>`;
            } else {
                const label = status === 'pending' ? 'Enviado' : (status === 'accepted' ? 'Confirmado' : 'Rechazado');
                const color = status === 'accepted' ? '#30D158' : (status === 'rejected' ? '#FF453A' : '#FF9F0A');
                actionHtml = `<span style="font-size:12px; color:${color}; font-weight:500;">${label}</span>`;
            }

            const displayName = person.full_name || person.email || 'Sin nombre';
            row.innerHTML = `
                <div class="staff-info">
                    <span class="staff-name">${displayName}</span>
                    <span class="staff-role">Staff</span>
                </div>
                <div>${actionHtml}</div>
            `;
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
            parent.innerHTML = `<span style="font-size:12px; color:#FF9F0A; font-weight:500;">Enviado</span>`;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    OperativoModule.init();
});
