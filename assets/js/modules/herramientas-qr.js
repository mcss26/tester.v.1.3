'use strict';

window.HerramientasQRModule = {
    init: function() {
        console.log('HerramientasQRModule (Access) initialized');
        const loadBtn = document.getElementById('btn-load-qr');
        if (loadBtn) loadBtn.addEventListener('click', () => this.loadItems());

        const printBtn = document.getElementById('btn-print-qr');
        if (printBtn) printBtn.addEventListener('click', () => window.print());

        const generateBtn = document.getElementById('btn-generate-qr');
        if (generateBtn) generateBtn.addEventListener('click', () => this.generateBatch());
    },

    loadItems: async function() {
        const dateVal = document.getElementById('qr-date-select').value;
        const container = document.getElementById('qr-preview-container');
        
        if (!dateVal) {
            alert('Por favor seleccione una fecha.');
            return;
        }

        this.setMessage(container, 'Buscando lotes de acceso...', false);
        const sb = window.sb;

        try {
            // 1. Find batches for this date
            const { data: batches, error: batchError } = await sb
                .from('qr_batches')
                .select('id, name, description')
                .eq('event_date', dateVal);

            if (batchError) throw batchError;

            if (!batches || batches.length === 0) {
                this.setMessage(container, 'No se encontraron Lotes de QR (Batches) para esta fecha.', false);
                return;
            }

            // 2. For the found batches, get the codes
            const batchIds = batches.map(b => b.id);
            const { data: codes, error: codesError } = await sb
                .from('qr_codes')
                .select('*')
                .in('batch_id', batchIds)
                .eq('status', 'active'); // Only active codes

            if (codesError) throw codesError;

            if (!codes || codes.length === 0) {
                this.setMessage(container, `Se encontraron ${batches.length} lote(s), pero no contienen códigos activos.`, false);
                return;
            }

            container.innerHTML = '';
            
            batches.forEach(batch => {
                const batchCodes = codes.filter(c => c.batch_id === batch.id);
                
                if (batchCodes.length > 0) {
                    const batchHeader = document.createElement('div');
                    batchHeader.className = 'qr-header';
                    batchHeader.innerHTML = `<h3>${batch.name} <small class="text-muted">(${batchCodes.length} códigos)</small></h3><p class="text-muted">${batch.description || ''}</p>`;
                    container.appendChild(batchHeader);

                    batchCodes.forEach(item => {
                        const card = document.createElement('div');
                        card.className = 'qr-card page-break-inside-avoid'; 

                        // QR Container
                        const qrDiv = document.createElement('div');
                        qrDiv.className = 'qr-code';
                        
                        card.appendChild(qrDiv);
                        
                        // Text details
                        const codeP = document.createElement('div');
                        codeP.className = 'qr-code-text';
                        codeP.innerHTML = `<strong>${item.code}</strong>`;

                        card.appendChild(codeP);
                        container.appendChild(card);

                        // Generate QR
                        new QRCode(qrDiv, {
                            text: item.code,
                            width: 150,
                            height: 150,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
                        });
                    });
                }
            });

        } catch (err) {
            console.error('Error loading Access QRs:', err);
            this.setMessage(container, 'Error: ' + err.message, true);
        }
    },

    generateBatch: async function() {
        const dateVal = document.getElementById('qr-date-select').value;
        const qtyVal = parseInt(document.getElementById('qr-gen-qty').value) || 0;
        
        if (!dateVal) {
            alert('Seleccione una fecha para el lote.');
            return;
        }
        if (qtyVal <= 0) {
            alert('Ingrese una cantidad válida mayor a 0.');
            return;
        }

        if (!confirm(`¿Generar un lote de ${qtyVal} accesos para el ${dateVal}?`)) return;

        const sb = window.sb;
        try {
            // 1. Create Batch
            const batchName = `Lote Auto ${dateVal}`;
            const { data: batch, error: batchErr } = await sb
                .from('qr_batches')
                .insert({
                    name: batchName,
                    description: `Generado automáticamente el ${new Date().toLocaleString()}`,
                    event_date: dateVal
                })
                .select()
                .single();

            if (batchErr) throw batchErr;

            // 2. Generate Codes
            const codesToInsert = [];
            for (let i = 0; i < qtyVal; i++) {
                // Generate random code: 8 chars alphanumeric
                const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                codesToInsert.push({
                    batch_id: batch.id,
                    code: randomCode,
                    status: 'active'
                });
            }

            const { error: insertErr } = await sb
                .from('qr_codes')
                .insert(codesToInsert);

            if (insertErr) throw insertErr;

            alert('Lote generado correctamente.');
            this.loadItems();

        } catch (err) {
            console.error('Error creating batch:', err);
            alert('Error al generar lote: ' + err.message);
        }
    },

    setMessage: function(container, message, isError) {
        if (!container) return;
        container.textContent = '';
        const p = document.createElement('p');
        p.textContent = message;
        p.className = isError ? 'text-danger grid-full' : 'text-muted grid-full';
        container.appendChild(p);
    }
};
