'use strict';

window.AdminPlanModule = {
    currentEvents: [],
    areas: [],
    positions: [],
    currentAllocationMap: {}, // key: position_id, val: { quantity: int, remuneration: float }
    activeEventId: null,

    init: async function() {
        console.log('AdminPlanModule initialized');
        this.bindUI();
        await this.loadReferenceData(); // Areas & Positions
        this.showPlanTab('nueva'); // Default tab
    },

    bindUI: function() {
        // Tabs
        ['nueva', 'en-curso', 'historial'].forEach(tabId => {
            const btn = document.getElementById(`btn-tab-${tabId}`);
            if (btn) btn.addEventListener('click', () => this.showPlanTab(tabId));
        });

        // Create Event
        const createBtn = document.getElementById('btn-create-event');
        if (createBtn) createBtn.addEventListener('click', () => this.createEvent());

        // Modal Actions
        const areaSelect = document.getElementById('select-area-filter');
        if (areaSelect) areaSelect.addEventListener('change', (e) => this.renderAllocationPositions(e.target.value));

        const saveAllocBtn = document.getElementById('btn-save-allocation');
        if (saveAllocBtn) saveAllocBtn.addEventListener('click', () => this.saveAllocation(false));

        const saveNotifyBtn = document.getElementById('btn-save-notify');
        if (saveNotifyBtn) saveNotifyBtn.addEventListener('click', () => this.saveAllocation(true));
    },

    loadReferenceData: async function() {
        const sb = window.sb;
        if (!sb) return;
        // Load Areas
        const { data: areas } = await sb.from('areas').select('*').eq('active', true).order('name');
        this.areas = areas || [];

        // Load Positions
        const { data: positions } = await sb.from('job_positions').select('*').eq('active', true).order('name');
        this.positions = positions || [];
    },

    renderAreaTabs: function() {
        const container = document.getElementById('allocation-area-tabs');
        if (!container) return;

        container.innerHTML = '';

        // "Todos" Tab
        const allBtn = document.createElement('button');
        allBtn.className = 'btn-tab-sm active';
        allBtn.textContent = 'Todos';
        allBtn.onclick = () => this.renderAllocationPositions('all');
        container.appendChild(allBtn);

        // Area Tabs
        this.areas.forEach(area => {
            const btn = document.createElement('button');
            btn.className = 'btn-tab-sm';
            btn.textContent = area.name;
            btn.dataset.areaId = area.id;
            btn.onclick = () => this.renderAllocationPositions(area.id);
            container.appendChild(btn);
        });
    },

    showPlanTab: function(tabId) {
        // Toggle Tabs
        ['nueva', 'en-curso', 'historial'].forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            const btn = document.getElementById(`btn-tab-${t}`);
            if (el) el.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        });

        const target = document.getElementById(`tab-${tabId}`);
        const activeBtn = document.getElementById(`btn-tab-${tabId}`);
        if (target) target.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');

        if (tabId !== 'nueva') {
            this.loadEvents();
        }
    },

    loadEvents: async function() {
        const sb = window.sb;
        const { data, error } = await sb
            .from('events')
            .select('*')
            .order('date', { ascending: false });

        if (error) {
            console.error('Error loading events:', error);
            return;
        }

        this.currentEvents = data || [];
        this.renderEventLists();
    },

    renderEventLists: function() {
        const activeContainer = document.getElementById('list-active-events');
        const historyContainer = document.getElementById('list-history-events');

        const activeEvents = this.currentEvents.filter(e => ['planning', 'open'].includes(e.status));
        const historyEvents = this.currentEvents.filter(e => ['closed', 'cancelled'].includes(e.status));

        this.renderTable(activeContainer, activeEvents, true);
        this.renderTable(historyContainer, historyEvents, false);
    },

    renderTable: function(container, events, isActive) {
        if (!events.length) {
            container.innerHTML = '<p class="text-muted">No hay eventos.</p>';
            return;
        }

        container.innerHTML = `
            <table class="table-compact">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Nombre</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${events.map(e => `
                        <tr class="${isActive ? 'cursor-pointer hover-row' : ''}" 
                            onclick="${isActive ? `AdminPlanModule.toggleEventDetails('${e.id}', this)` : ''}">
                            <td><span class="chip-date">${e.date}</span></td>
                            <td>${e.name || '-'}</td>
                            <td><span class="badge">${e.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    toggleEventDetails: async function(eventId, rowEl) {
        const existingDetail = document.getElementById(`detail-${eventId}`);
        if (existingDetail) {
            existingDetail.remove();
            return;
        }

        // Create detail row
        const detailRow = document.createElement('tr');
        detailRow.id = `detail-${eventId}`;
        detailRow.innerHTML = `
            <td colspan="3" class="p-0">
                <div class="p-md" style="background: var(--bg-card); border-bottom: 2px solid var(--primary-color);">
                    <div class="text-center text-muted">Cargando proyección...</div>
                </div>
            </td>
        `;
        rowEl.after(detailRow);

        // Fetch Data
        const sb = window.sb;
        const event = this.currentEvents.find(e => e.id === eventId);
        
        // 1. Staff Allocations
        const { data: allocations } = await sb.from('staff_allocations')
            .select('quantity, remuneration, position_id')
            .eq('event_id', eventId);
        
        let staffTotal = 0;
        let staffCount = 0;
        (allocations || []).forEach(a => {
            staffTotal += (a.quantity * (a.remuneration || 0));
            staffCount += a.quantity;
        });

        // 2. Opening Costs (Fixed/Apertura from AP)
        const { data: payables } = await sb.from('accounts_payable')
            .select('*')
            .eq('event_id', eventId)
            .in('category', ['apertura', 'fijos']);
        
        let openingTotal = 0;
        (payables || []).forEach(p => openingTotal += (p.amount || 0));

        // 3. Replenishment Requests (Logistics)
        let replenishmentTotal = 0;
        let requests = [];
        
        if (event && event.date) {
            const { data: replData } = await sb.from('replenishment_requests')
                .select('*')
                .eq('operational_date', event.date)
                .neq('status', 'cancelled');
            
            requests = replData || [];
            requests.forEach(r => replenishmentTotal += (r.total_estimated_cost || 0));
        }

        const grandTotal = staffTotal + openingTotal + replenishmentTotal;

        // Render Detail Content
        const detailDiv = detailRow.querySelector('div');
        detailDiv.innerHTML = `
            <div class="flex-row gap-md align-start mobile-col">
                
                <!-- Col 1: Personal -->
                <div class="flex-1 card p-sm border-light">
                    <h4 class="text-primary mb-sm">Personal</h4>
                    <div class="flex-row justify-between text-sm mb-xs">
                        <span>Dotación:</span> <span class="text-strong">${staffCount} pax</span>
                    </div>
                    <div class="flex-row justify-between text-sm mb-md">
                        <span>Costo Elim.:</span> <span class="text-strong">$${staffTotal.toLocaleString()}</span>
                    </div>
                    <button class="btn-secondary btn-sm width-100" 
                            onclick="event.stopPropagation(); AdminPlanModule.openAllocationModal('${eventId}')">
                        Gest. Dotación
                    </button>
                    <!-- Quick action to notify if planning -->
                    ${event.status === 'planning' ? `
                        <button class="btn-success btn-sm width-100 mt-xs"
                             onclick="event.stopPropagation(); AdminPlanModule.updateEventStatus('${eventId}', 'open')">
                             Abrir Convocatoria
                        </button>
                    ` : ''}
                </div>

                <!-- Col 2: Costos Operativos -->
                <div class="flex-1 card p-sm border-light">
                    <h4 class="text-primary mb-sm">Apertura / Fijos</h4>
                     <ul class="list-unstyled text-sm" style="max-height: 100px; overflow-y: auto;">
                        ${(payables && payables.length) ? payables.map(p => `
                            <li class="flex-row justify-between mb-xs">
                                <span class="text-muted text-xs">${p.concept}</span>
                                <span>$${p.amount.toLocaleString()}</span>
                            </li>
                        `).join('') : '<li class="text-muted text-xs">Sin costos registrados</li>'}
                    </ul>
                    <div class="border-top mt-sm pt-xs text-right">
                        <span class="text-strong text-sm">$${openingTotal.toLocaleString()}</span>
                    </div>
                </div>

                <!-- Col 3: Solicitudes (Logística) -->
                <div class="flex-1 card p-sm border-light">
                    <h4 class="text-primary mb-sm">Reposiciones</h4>
                    <ul class="list-unstyled text-sm" style="max-height: 100px; overflow-y: auto;">
                        ${(requests && requests.length) ? requests.map(r => `
                            <li class="flex-row justify-between mb-xs">
                                <span class="text-muted text-xs">#${r.id.substr(0,6)}</span>
                                <span>$${(r.total_estimated_cost||0).toLocaleString()}</span>
                            </li>
                        `).join('') : '<li class="text-muted text-xs">Sin solicitudes</li>'}
                    </ul>
                    <div class="border-top mt-sm pt-xs text-right">
                        <span class="text-strong text-sm">$${replenishmentTotal.toLocaleString()}</span>
                    </div>
                </div>

            </div>

            <!-- Footer Total -->
            <div class="mt-md pt-sm border-top text-right">
                <span class="text-muted mr-sm">Proyección Total Evento:</span>
                <span class="text-xl text-primary text-strong">$${grandTotal.toLocaleString()}</span>
            </div>
        `;
    },

    updateEventStatus: async function(eventId, newStatus) {
        const { error } = await window.sb.from('events').update({ status: newStatus }).eq('id', eventId);
        if (error) alert('Error: ' + error.message);
        else {
             alert('Estado actualizado a: ' + newStatus);
             this.loadEvents(); 
        }
    },

    createEvent: async function() {
        const dateInput = document.getElementById('input-event-date');
        const nameInput = document.getElementById('input-event-name');
        
        if (!dateInput.value) {
            alert('Ingrese una fecha.');
            return;
        }

        const sb = window.sb;
        const { data: session } = await sb.auth.getSession();

        const { data: newEvent, error } = await sb.from('events').insert({
            date: dateInput.value,
            name: nameInput.value || null,
            status: 'planning', // created in planning state
            created_by: session?.session?.user?.id
        }).select();

        if (error) {
            alert('Error al crear evento: ' + error.message);
        } else {
            console.log('Event created:', newEvent);
            dateInput.value = '';
            nameInput.value = '';
            
            // Immediately open allocation modal logic
            if(newEvent && newEvent.length > 0) {
               // Update local list first so openAllocationModal finds it
               this.currentEvents.unshift(newEvent[0]); 
               this.openAllocationModal(newEvent[0].id);
            } else {
               // Fallback
               await this.loadEvents();
            }
        }
    },

    // --- Allocation Logic ---

    openAllocationModal: async function(eventId) {
        this.activeEventId = eventId;
        const event = this.currentEvents.find(e => e.id === eventId);
        
        document.getElementById('allocation-event-id').value = eventId;
        document.getElementById('allocation-event-info').textContent = `Evento: ${event?.date || ''} - ${event?.name || ''}`;
        
        // Load existing allocations
        const sb = window.sb;
        const { data: allocations } = await sb.from('staff_allocations').select('*').eq('event_id', eventId);
        
        this.currentAllocationMap = {};
        
        if (allocations && allocations.length > 0) {
            allocations.forEach(a => {
                this.currentAllocationMap[a.position_id] = {
                    quantity: a.quantity,
                    remuneration: a.remuneration || 0 
                };
            });
        } else {
            // PRE-FILL from Default Quantity
            console.log('Pre-filling allocations from defaults...');
            this.positions.forEach(p => {
                if(p.default_quantity > 0) {
                    this.currentAllocationMap[p.id] = {
                        quantity: p.default_quantity,
                        remuneration: this.getBaseSalary(p)
                    };
                }
            });
        }

        // Reset UI (Render Tabs first)
        this.renderAreaTabs();
        this.renderAllocationPositions('all'); // Deafult to all

        this.updateTotalCostDisplay();
        document.getElementById('modal-allocation').classList.remove('hidden');
    },

    renderAllocationPositions: function(areaId) {
        const container = document.getElementById('positions-list');
        const tabsContainer = document.getElementById('allocation-area-tabs');
        
        if (!container) return;

        // Update active tab visual
        if (tabsContainer) {
            const tabs = tabsContainer.querySelectorAll('button');
            tabs.forEach(btn => {
                if (areaId === 'all') {
                    if (btn.textContent === 'Todos') btn.classList.add('active');
                    else btn.classList.remove('active');
                } else {
                    if (btn.dataset.areaId === areaId) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            });
        }

        let filteredPositions = [];

        if (areaId === 'all' || !areaId) {
            filteredPositions = this.positions;
        } else {
            const areaName = this.getAreaNameById(areaId);
            const normalizedArea = this.normalizeKey(areaName);
            
            filteredPositions = this.positions.filter(p => {
                if (p.area_id) return p.area_id === areaId;
                const areaValue = this.normalizeKey(p.area || '');
                return normalizedArea ? areaValue === normalizedArea : false;
            });
        }
        
        if (filteredPositions.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No hay cargos configurados.</p>';
            return;
        }

        container.innerHTML = filteredPositions.map(p => {
            const stored = this.currentAllocationMap[p.id] || { quantity: 0, remuneration: this.getBaseSalary(p) };
            const quantity = stored.quantity;
            const remuneration = stored.remuneration;
            const subtotal = quantity * remuneration;
            
            return `
                <div class="allocation-grid">
                    <span class="text-strong">${p.name}</span>
                    <input type="number" min="0" class="table-input" 
                           placeholder="Cant."
                           value="${quantity}"
                           onchange="AdminPlanModule.updateLocalAllocation('${p.id}', 'quantity', this.value)">
                    
                    <input type="number" min="0" step="0.01" class="table-input" 
                           placeholder="$ Remun."
                           value="${remuneration}"
                           onchange="AdminPlanModule.updateLocalAllocation('${p.id}', 'remuneration', this.value)">

                    <span class="text-right" id="subtotal-${p.id}">$${subtotal.toLocaleString()}</span>
                </div>
            `;
        }).join('');
    },

    updateLocalAllocation: function(positionId, field, value) {
        if (!this.currentAllocationMap[positionId]) {
            const pos = this.positions.find(p => p.id === positionId);
            this.currentAllocationMap[positionId] = { quantity: 0, remuneration: this.getBaseSalary(pos) || 0 };
        }
        
        this.currentAllocationMap[positionId][field] = parseFloat(value) || 0;
        
        // Update Subtotal Display
        const stored = this.currentAllocationMap[positionId];
        const subtotal = stored.quantity * stored.remuneration;
        const subtotalEl = document.getElementById(`subtotal-${positionId}`);
        if(subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString()}`;

        this.updateTotalCostDisplay();
    },

    updateTotalCostDisplay: function() {
        let total = 0;
        Object.values(this.currentAllocationMap).forEach(v => {
            total += (v.quantity * v.remuneration);
        });
        document.getElementById('allocation-total-cost').textContent = `$${total.toLocaleString()}`;
    },

    saveAllocation: async function(andNotify = false) {
        if (!this.activeEventId) return;

        const sb = window.sb;
        const event = this.currentEvents.find(e => e.id === this.activeEventId);
        if (!event) return;

        // 1. Save allocations
        const upsertData = [];
        let totalEventCost = 0;

        Object.keys(this.currentAllocationMap).forEach(posId => {
            const pos = this.positions.find(p => p.id === posId);
            const val = this.currentAllocationMap[posId];
            
            if (pos && val.quantity > 0) {
                  const remuneration = Number.isFinite(val.remuneration)
                      ? val.remuneration
                      : this.getBaseSalary(pos);
                  const areaId = pos.area_id || this.getAreaIdByName(pos.area);
                  upsertData.push({
                      event_id: this.activeEventId,
                      area_id: areaId || null,
                      position_id: pos.id,
                      quantity: val.quantity,
                      remuneration: remuneration
                  });
                  totalEventCost += (val.quantity * remuneration);
            }
        });

        const { error: delError } = await sb.from('staff_allocations')
            .delete()
            .eq('event_id', this.activeEventId);
            
        if (delError) {
            alert('Error syncing allocations: ' + delError.message);
            return;
        }

        if (upsertData.length > 0) {
             const { error: insError } = await sb.from('staff_allocations').insert(upsertData);
             if (insError) {
                 alert('Error saving allocations: ' + insError.message);
                 return;
             }
        }

        // 2. Generate Accounts Payable - Staff Budget
        await sb.from('accounts_payable')
            .delete()
            .eq('event_id', this.activeEventId)
            .eq('concept', 'Presupuesto Staff');

        if (totalEventCost > 0) {
            await sb.from('accounts_payable').insert({
                event_id: this.activeEventId,
                concept: 'Presupuesto Staff',
                amount: totalEventCost,
                due_date: event.date,
                status: 'pending',
                category: 'staff'
            });
        }

        // 3. Generate Operational Costs (Fixed & Opening)
        await this.generateOperationalCosts(event);

        // 4. Update Event Status if Notifying
        if (andNotify) {
            const { error: statusError } = await sb.from('events')
                .update({ status: 'open' })
                .eq('id', this.activeEventId);
            
            if (statusError) alert('Error al actualizar estado del evento: ' + statusError.message);
            else alert('Dotación guardada y evento ABIERTO a encargados.');
        } else {
            alert('Dotación guardada (Borrador).');
        }
        
        document.getElementById('modal-allocation').classList.add('hidden');
        this.loadEvents(); 
    },

    generateOperationalCosts: async function(event) {
        const sb = window.sb;
        
        // --- Fixed Costs ---
        const { data: fixedCosts } = await sb.from('fixed_costs').select('*').eq('active', true);
        if (fixedCosts && fixedCosts.length > 0) {
            const fixedConcepts = fixedCosts.map(fc => fc.description || fc.name).filter(Boolean);
            
            // Clean up old auto-generated fixed costs
            if (fixedConcepts.length > 0) {
                await sb.from('accounts_payable')
                    .delete()
                    .eq('event_id', this.activeEventId)
                    .in('concept', fixedConcepts);
            }

            // Insert new
            const fixedPayables = fixedCosts.map(fc => {
                const dueDate = fc.next_due_date || event.date;
                return {
                    event_id: this.activeEventId,
                    concept: fc.description || fc.name,
                    amount: fc.amount,
                    due_date: dueDate,
                    status: 'pending',
                    category: 'fijos'
                };
            }).filter(item => item.concept);

            if (fixedPayables.length > 0) {
                await sb.from('accounts_payable').insert(fixedPayables);
            }
        }

        // --- Opening Costs ---
        const { data: openingCosts } = await sb.from('opening_costs').select('*').eq('active', true);
        if (openingCosts && openingCosts.length > 0) {
            const openingConcepts = openingCosts
                .map(cost => cost.description)
                .filter(Boolean);

            if (openingConcepts.length > 0) {
                await sb.from('accounts_payable')
                    .delete()
                    .eq('event_id', this.activeEventId)
                    .in('concept', openingConcepts);
            }

            const openingPayables = openingCosts.map(cost => {
                const evtDate = new Date(event.date + 'T12:00:00');
                evtDate.setDate(evtDate.getDate() - (cost.payment_day_offset || 0));
                
                return {
                    event_id: this.activeEventId,
                    concept: cost.description,
                    amount: cost.amount,
                    due_date: evtDate.toISOString().split('T')[0],
                    status: 'pending',
                    category: 'apertura'
                };
            }).filter(item => item.concept);

            if (openingPayables.length > 0) {
                await sb.from('accounts_payable').insert(openingPayables);
            }
        }
    },

    getAreaNameById: function(areaId) {
        const match = this.areas.find(area => area.id === areaId);
        return match ? match.name : '';
    },

    getAreaIdByName: function(name) {
        const normalized = this.normalizeKey(name);
        const match = this.areas.find(area => this.normalizeKey(area.name) === normalized);
        return match ? match.id : '';
    },

    getBaseSalary: function(position) {
        if (Number.isFinite(position.base_salary)) return position.base_salary;
        return 0;
    },

    normalizeKey: function(value) {
        return (value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }
};
