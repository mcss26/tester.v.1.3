'use strict';

'use strict';

window.GerenciaBalanceModule = {
    currentDate: null,

    init: async function() {
        console.log('GerenciaBalanceModule initialized');
        this.bindEvents();
        await this.loadAvailableDates();
    },

    bindEvents: function() {
        // Tab switching
        const buttons = document.querySelectorAll('.tab-btn[data-tab]');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Date selection
        const dateSelect = document.getElementById('balance-date-select');
        if (dateSelect) {
            dateSelect.addEventListener('change', (e) => this.onDateSelect(e.target.value));
        }
    },

    switchTab: function(tabName) {
        // Hide all tabs
        const contents = document.querySelectorAll('.tab-panel');
        contents.forEach(el => el.classList.add('hidden'));

        // Remove active class from buttons
        const btns = document.querySelectorAll('.tab-btn[data-tab]');
        btns.forEach(el => el.classList.remove('active'));

        // Show target tab
        const target = document.getElementById(`tab-${tabName}`);
        if (target) target.classList.remove('hidden');

        // Highlight button
        const clickedBtn = Array.from(btns).find(b => b.dataset.tab === tabName);
        if (clickedBtn) clickedBtn.classList.add('active');
    },

    loadAvailableDates: async function() {
        const sb = window.sb;
        if (!sb) return;

        try {
            // We'll use 'operational_days' table to get the dates created
            const { data: dates, error } = await sb
                .from('operational_days')
                .select('id, op_date')
                .order('op_date', { ascending: false });

            if (error) throw error;

            const select = document.getElementById('balance-date-select');
            if (!select) return;
            
            // Clear existing options except default
            select.innerHTML = '<option value="">-- Seleccione una fecha --</option>';

            dates.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.op_date;
                opt.textContent = this.formatDate(d.op_date);
                select.appendChild(opt);
            });

        } catch (err) {
            console.error('Error loading dates:', err);
        }
    },

    onDateSelect: async function(dateValue) {
        const container = document.getElementById('main-balance-container');
        if (!dateValue) {
            container.classList.add('hidden');
            this.currentDate = null;
            return;
        }

        this.currentDate = dateValue;
        container.classList.remove('hidden');
        await this.loadBalanceData(dateValue);
    },

    loadBalanceData: async function(date) {
        console.log(`Loading balance data for date: ${date}`);
        const sb = window.sb;
        
        try {
            // 1. Fetch Reposiciones (Replenishment Requests for this date)
            // matching operational_date
            const { data: reposiciones, error: errRepo } = await sb
                .from('replenishment_requests')
                .select(`
                    id,
                    total_estimated_cost,
                    operational_date,
                    payment_status,
                    payment_category:payment_categories ( id, tipo_comprobante ),
                    supplier:suppliers ( nombre ),
                    items:replenishment_items (
                        id,
                        quantity,
                        unit_price,
                        sku:inventory_skus ( name, unit )
                    )
                `)
                .eq('operational_date', date)
                .order('created_at', { ascending: false });

            if (errRepo) throw errRepo;

            // 2. Fetch "Costos de Apertura" & "Sueldos" -- MOCKED for now due to missing backend tables
            // Check if there are specific categories in replenishment_requests that match these?
            // For now, we assume they are empty or derived differently.
            // We will render empty tables for them.

            this.renderReposiciones(reposiciones || []);
            this.renderApertura([]); // Placeholder
            this.renderSueldos([]);   // Placeholder
            this.renderIngresos([]);  // Placeholder for Ingresos

            this.calculateBalanceSummary(reposiciones || [], [], []);

        } catch (err) {
            console.error('Error fetching balance data:', err);
            alert('Error cargando los datos del balance.');
        }
    },

    renderReposiciones: function(data) {
        const tbody = document.querySelector('#table-reposiciones tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay reposiciones para esta fecha.</td></tr>';
            return;
        }

        data.forEach(req => {
            const proveedor = req.supplier?.nombre || 'Desconocido';
            const dia = this.formatDate(req.operational_date);
            const monto = req.total_estimated_cost || 0;
            const tipo = req.payment_category?.tipo_comprobante || '-';
            const factura = '-'; // Pending field in DB

            // Main Row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${proveedor}</td>
                <td>${dia}</td>
                <td class="text-right">$${monto.toFixed(2)}</td>
                <td>${tipo}</td>
                <td>${factura}</td>
                <td class="text-center">
                    <button class="btn-icon btn-expand" title="Ver Detalle">⬇</button>
                </td>
            `;
            tbody.appendChild(tr);

            // Details Row (Hidden by default)
            const trDetail = document.createElement('tr');
            trDetail.classList.add('details-row', 'hidden');
            
            // Build items list
            let itemsHtml = '<ul class="pl-md">';
            if (req.items && req.items.length > 0) {
                req.items.forEach(item => {
                    const itemName = item.sku?.name || 'Item';
                    const qty = item.quantity || 0;
                    const unit = item.sku?.unit || '';
                    const subtotal = (item.quantity * item.unit_price) || 0;
                    itemsHtml += `<li>${itemName} (${qty} ${unit}) - $${subtotal.toFixed(2)}</li>`;
                });
            } else {
                itemsHtml += '<li>Sin ítems detallados</li>';
            }
            itemsHtml += '</ul>';

            trDetail.innerHTML = `
                <td colspan="6">
                    <div class="p-sm">
                        <strong>Detalle de Ítems:</strong>
                        ${itemsHtml}
                    </div>
                </td>
            `;
            tbody.appendChild(trDetail);

            // Toggle Event
            const btnExpand = tr.querySelector('.btn-expand');
            btnExpand.addEventListener('click', () => {
                trDetail.classList.toggle('hidden');
                btnExpand.textContent = trDetail.classList.contains('hidden') ? '⬇' : '⬆';
            });
        });
    },

    renderApertura: function(data) {
        const tbody = document.querySelector('#egresos-apertura-container tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay costos de apertura registrados.</td></tr>';
            return;
        }
        // Implementation for when data exists matches spec: Proveedor, Monto, Dia, Tipo, Factura
    },

    renderSueldos: function(data) {
        const tbody = document.querySelector('#egresos-sueldos-container tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No hay sueldos registrados.</td></tr>';
            return;
        }
        // Implementation matches spec: Cargo, Monto
    },

    renderIngresos: function(data) {
        // Placeholder
    },

    calculateBalanceSummary: function(repos, apertura, sueldos) {
        const totalRepos = repos.reduce((acc, r) => acc + (r.total_estimated_cost || 0), 0);
        // Add others when available
        
        const summaryDiv = document.getElementById('balance-summary-content');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <p><strong>Total Reposiciones:</strong> $${totalRepos.toFixed(2)}</p>
                <p class="text-muted">(Otros balances pendientes de implementación)</p>
            `;
        }
    },

    formatDate: function(dateStr) {
        if (!dateStr) return '-';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
};
