// admin-stock.js - Lógica para Gestión de Stock

window.AdminStockModule = {
    currentCategoryId: 'all',
    categoryMap: {},
    searchTimer: null,

    init: function() {
        console.log('AdminStockModule init');
        // Ensure Supabase is available
        this.sb = window.sb;
        if (!this.sb) {
            console.error('Supabase client not found');
            return;
        }

        // Search listener
        const searchInput = document.getElementById('search-stock-input');
        if (searchInput) {
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.loadLiveStock();
                }
            });

            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimer);
                const value = searchInput.value.trim();
                if (value.length > 0 && value.length < 2) return;
                this.searchTimer = setTimeout(() => this.loadLiveStock(), 300);
            });
        }

        const refreshBtn = document.getElementById('btn-refresh-stock');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadLiveStock());
        }

        this.loadCategories();
    },

    loadCategories: async function() {
        const container = document.getElementById('stock-tabs-container');
        if (!container) return;

        const { data: categories, error } = await this.sb
            .from('categories')
            .select('id, nombre')
            .order('created_at', { ascending: true });

        if (error) {
            container.textContent = '';
            return;
        }

        this.categoryMap = {};
        categories.forEach(cat => {
            this.categoryMap[cat.id] = cat.nombre;
        });

        container.textContent = '';
        const allBtn = this.buildTabButton('all', 'Todas');
        container.appendChild(allBtn);

        categories.forEach(cat => {
            container.appendChild(this.buildTabButton(cat.id, cat.nombre));
        });

        this.updateActiveTab();
    },

    buildTabButton: function(id, label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-btn';
        btn.dataset.id = id;
        if (id === this.currentCategoryId) btn.classList.add('active');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            this.currentCategoryId = id;
            this.updateActiveTab();
            this.loadLiveStock();
        });
        return btn;
    },

    updateActiveTab: function() {
        const container = document.getElementById('stock-tabs-container');
        if (!container) return;
        Array.from(container.children).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.id === this.currentCategoryId);
        });
    },

    getCategoryLabel: function(id) {
        if (id === 'all') return 'Todas';
        return this.categoryMap[id] || 'Sin categoría';
    },

    loadLiveStock: async function() {
        const container = document.getElementById('live-stock-container');
        this.setMessage(container, 'Cargando stock...', false);

        const searchVal = document.getElementById('search-stock-input')?.value || '';

        try {
            const idealPromise = window.AnalysisHelpers
                ? window.AnalysisHelpers.getIdealMap(this.sb).catch(() => ({}))
                : Promise.resolve({});

            // 1. Fetch SKUs
            let querySkus = this.sb.from('inventory_skus')
                .select('id, name, external_id, category_id')
                .order('name');
            if (searchVal) {
                querySkus = querySkus.ilike('name', `%${searchVal}%`);
            }
            if (this.currentCategoryId && this.currentCategoryId !== 'all') {
                querySkus = querySkus.eq('category_id', this.currentCategoryId);
            }
            const { data: skus, error: skuError } = await querySkus;
            
            if (skuError) throw skuError;

            // 2. Fetch Current Stock for these SKUs
            // Use left join approach via code or if relationship exists
            // Since we need to show ALL SKUs even if no stock entry, we iterate SKUs
            
            if (!skus || skus.length === 0) {
                this.setMessage(container, 'No se encontraron productos.', false);
                return;
            }

            const skuIds = skus.map(s => s.id);
            let stocks = [];
            if (skuIds.length > 0) {
                const { data: stockData, error: stockError } = await this.sb
                    .from('inventory_stock')
                    .select('sku_id, stock_actual, updated_at')
                    .in('sku_id', skuIds);

                if (stockError) throw stockError;
                stocks = stockData || [];
            }

            const stockMap = new Map();
            stocks.forEach(stock => {
                stockMap.set(stock.sku_id, stock);
            });

            // 3. Merge Data
            const idealMap = await idealPromise;
            const merged = skus.map(sku => {
                const stockEntry = stockMap.get(sku.id);
                const idealValues = idealMap[sku.id] || { ideal1: 0, ideal2: 0 };
                return {
                    ...sku,
                    stock_actual: stockEntry ? stockEntry.stock_actual : 0,
                    ideal_500: idealValues.ideal1 || 0,
                    ideal_900: idealValues.ideal2 || 0,
                    last_updated: stockEntry ? stockEntry.updated_at : null
                };
            });

            this.renderStockTable(merged);

        } catch (err) {
            console.error('Error loading stock:', err);
            this.setMessage(container, 'Error al cargar stock: ' + err.message, true);
        }
    },

    renderStockTable: function(data) {
        const container = document.getElementById('live-stock-container');
        if (data.length === 0) {
            this.setMessage(container, 'No se encontraron productos.', false);
            return;
        }

        container.textContent = '';

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Producto', 'Categoría', 'Stock Actual', 'Ideal 500', 'Ideal 900', 'Estado', 'Acción'].forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        data.forEach(item => {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            const nameStrong = document.createElement('strong');
            nameStrong.textContent = item.name;
            nameCell.appendChild(nameStrong);
            const meta = document.createElement('div');
            meta.className = 'text-muted';
            meta.textContent = item.external_id || '-';
            nameCell.appendChild(meta);
            row.appendChild(nameCell);

            const categoryCell = document.createElement('td');
            const categoryName = this.categoryMap[item.category_id] || item.category_id || '-';
            categoryCell.textContent = categoryName;
            row.appendChild(categoryCell);

            const actualCell = document.createElement('td');
            const actualInput = document.createElement('input');
            actualInput.type = 'number';
            actualInput.id = `stock-val-${item.id}`;
            actualInput.value = item.stock_actual;
            actualInput.className = 'table-input';
            actualCell.appendChild(actualInput);
            row.appendChild(actualCell);

            const idealCell = document.createElement('td');
            idealCell.textContent = item.ideal_500 || '-';
            row.appendChild(idealCell);

            const ideal2Cell = document.createElement('td');
            ideal2Cell.textContent = item.ideal_900 || '-';
            row.appendChild(ideal2Cell);

            const statusCell = document.createElement('td');
            const statusPill = document.createElement('span');
            const status = this.getStockStatus(item.stock_actual, item.ideal_500);
            statusPill.className = `status-pill ${status.className}`;
            statusPill.textContent = status.label;
            statusCell.appendChild(statusPill);
            row.appendChild(statusCell);

            const actionCell = document.createElement('td');
            const updateBtn = document.createElement('button');
            updateBtn.type = 'button';
            updateBtn.className = 'btn-primary btn-sm';
            updateBtn.textContent = 'Actualizar';
            updateBtn.addEventListener('click', () => this.updateStock(item.id));
            actionCell.appendChild(updateBtn);
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    },

    updateStock: async function(skuId) {
        const inputActual = document.getElementById(`stock-val-${skuId}`);
        
        const newActual = parseFloat(inputActual.value);

        if (isNaN(newActual)) {
            alert('Ingrese números válidos');
            return;
        }

        if (!confirm(`¿Actualizar stock?\nActual: ${newActual}`)) return;

        try {
            // Upsert to handle cases where entry doesn't exist yet
            const { error } = await this.sb
                .from('inventory_stock')
                .upsert({ 
                    sku_id: skuId, 
                    stock_actual: newActual,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'sku_id' });

            if (error) throw error;

            alert('Stock actualizado');
            // Reload to refresh status calculations
            this.loadLiveStock();

        } catch (err) {
            console.error('Error updating stock', err);
            alert('Error al actualizar: ' + err.message);
        }
    },

    getStockStatus: function(actual, ideal) {
        if (!ideal || ideal <= 0) {
            return { label: 'SIN IDEAL', className: 'status-neutral' };
        }
        if (actual <= ideal * 0.2) {
            return { label: 'CRÍTICO', className: 'status-critical' };
        }
        if (actual < ideal) {
            return { label: 'BAJO', className: 'status-low' };
        }
        if (actual > ideal * 1.5) {
            return { label: 'EXCEDENTE', className: 'status-excess' };
        }
        return { label: 'OK', className: 'status-ok' };
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
