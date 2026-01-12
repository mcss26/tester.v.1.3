// analysis.js - Lógica para Análisis de Consumo
'use strict';

let importData = []
let chartInstance = null
let importFileName = ''

// Ensure Supabase client is available
const sb = window.sb;

// --- INITIALIZATION ---

window.loadConsumptionAnalysis = function() {
    renderAnalysisTabs()
    showAnalysisTab('importar') // Default tab

    const previewContainer = document.getElementById('import-preview')
    setMessage(previewContainer, 'Seleccione un archivo para previsualizar.', false)

    const resultsContainer = document.getElementById('analysis-results')
    setMessage(resultsContainer, 'Seleccione un rango para calcular recomendaciones.', false)

    const analyzeBtn = document.getElementById('btn-analyze-ideal')
    if (analyzeBtn) analyzeBtn.addEventListener('click', window.analyzeIdealStock)
}

function renderAnalysisTabs() {
    const container = document.getElementById('analysis-tabs-container')
    if (!container) return
    container.textContent = ''

    const tabs = [
        { id: 'importar', label: 'Importar' },
        { id: 'analizar', label: 'Analizar' },
        { id: 'historica', label: 'Histórica' }
    ]

    tabs.forEach((tab, index) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.id = `tab-btn-${tab.id}`
        btn.className = 'tab-btn'
        if (index === 0) btn.classList.add('active')
        btn.textContent = tab.label
        btn.addEventListener('click', () => window.showAnalysisTab(tab.id))
        container.appendChild(btn)
    })
}

window.showAnalysisTab = function(tabId) {
    // Use classList for visibility consistency
    ['importar', 'analizar', 'historica'].forEach(t => {
        const el = document.getElementById(`analysis-tab-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (el) el.classList.add('hidden');
        if (btn) btn.classList.remove('active');
    });

    // Show selected
    const activeEl = document.getElementById(`analysis-tab-${tabId}`);
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeEl) activeEl.classList.remove('hidden');
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'historica') {
        loadHistoryChart()
    }
}

function setMessage(container, message, isError) {
    if (!container) return
    container.textContent = ''
    const paragraph = document.createElement('p')
    paragraph.textContent = message
    paragraph.className = isError ? 'text-danger' : 'text-muted'
    container.appendChild(paragraph)
}

function normalizeString(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
}

function parseQuantity(value) {
    if (value === null || value === undefined || value === '') return 0
    const raw = String(value).trim()
    if (!raw) return 0
    const hasComma = raw.includes(',')
    const hasDot = raw.includes('.')
    let normalized = raw
    if (hasComma && hasDot) {
        normalized = raw.replace(/\./g, '').replace(',', '.')
    } else {
        normalized = raw.replace(',', '.')
    }
    const clean = normalized.replace(/[^0-9.-]/g, '')
    const parsed = parseFloat(clean)
    return Number.isFinite(parsed) ? parsed : 0
}

// --- IMPORT LOGIC ---

window.handleFileSelect = function(event) {
    const file = event.target.files[0]
    if (!file) return
    importFileName = file.name || ''

    const fileNameEl = document.getElementById('import-file-name')
    if (fileNameEl) {
        fileNameEl.textContent = importFileName ? `Archivo: ${importFileName}` : ''
    }

    const reader = new FileReader()
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Assume first sheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // 1. Read as Array of Arrays to find header
        const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
        
        let headerRowIndex = 0
        let foundHeader = false

        // Scan first 20 rows
        for (let i = 0; i < Math.min(20, aoa.length); i++) {
            const row = aoa[i]
            // check columns
            const rowStr = row.join(' ').toLowerCase()
            if (rowStr.includes('producto') || rowStr.includes('nombre') || rowStr.includes('item') || rowStr.includes('articulo')) {
                headerRowIndex = i
                foundHeader = true
                break
            }
        }

        let headerOverride = null
        if (!foundHeader) {
            const firstRow = aoa[headerRowIndex] || []
            headerOverride = []
            if (firstRow.length > 0) {
                headerOverride[0] = 'producto'
                if (firstRow.length > 1) headerOverride[1] = 'cantidad'
                for (let i = 2; i < firstRow.length; i++) {
                    headerOverride[i] = `col_${i + 1}`
                }
            }
        }

        // 2. Parse again with correct range
        const json = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, header: headerOverride || undefined, defval: '' })
        
        processImportData(json, foundHeader)
    }
    reader.readAsArrayBuffer(file)
}

async function processImportData(json, foundHeader) {
    const previewContainer = document.getElementById('import-preview')
    setMessage(previewContainer, 'Procesando...', false)

    if (!sb) {
        setMessage(previewContainer, 'No se pudo conectar con Supabase.', true)
        return
    }

    // Fetch current SKUs for matching
    const { data: skus, error: skuError } = await sb.from('inventory_skus').select('id, name, external_id')
    if (skuError) {
        setMessage(previewContainer, 'Error al cargar SKUs: ' + skuError.message, true)
        return
    }

    if (!json || json.length === 0) {
        setMessage(previewContainer, 'No se encontraron filas en el archivo.', true)
        return
    }
    
    importData = [] // Reset
    let matchedCount = 0
    let unmatchedCount = 0

    json.forEach(row => {
        // Normalize keys match
        const keys = Object.keys(row);
        
        const productKey = keys.find(k => 
            k.toLowerCase().includes('articulo') || 
            k.toLowerCase().includes('producto') || 
            k.toLowerCase().includes('nombre') || 
            k.toLowerCase().includes('item') ||
            k.toLowerCase().includes('descrip')
        );
        
        const qtyKey = keys.find(k => 
            k.toLowerCase() === 'cantidad' || 
            k.toLowerCase() === 'cant' || 
            k.toLowerCase().includes('consumo') ||
            k.toLowerCase().includes('final') ||
            k.toLowerCase().includes('total')
        );

        const productName = productKey ? row[productKey] : null;
        const qty = qtyKey ? row[qtyKey] : 0;

        if (productName && String(productName).trim().length > 0) {
            // Normalize string for matching
            const cleanName = normalizeString(productName)
            
            // Try Match by Name OR External ID
            // Safe trim on DB fields matching
            let match = skus.find(s => {
                const dbName = normalizeString(s.name);
                const dbExtId = normalizeString(s.external_id);
                return dbName === cleanName || (dbExtId && dbExtId === cleanName);
            })

            importData.push({
                excelName: productName, // Keep original for display
                skuId: match ? match.id : null,
                skuName: match ? match.name : 'NO ENCONTRADO',
                quantity: parseQuantity(qty)
            })

            if (match) matchedCount++
            else unmatchedCount++
        }
    })

    const detectedKeys = json.length > 0 ? Object.keys(json[0]).join(', ') : 'Ninguna';

    if (matchedCount === 0) {
        // Collect debug samples
        const sampleSkus = skus.slice(0, 5).map(s => `${s.name} [ID:${s.external_id}]`).join(', ');
        // Filter out empty ones just in case for debug display
        const sampleExcel = importData.slice(0, 5).map(d => `"${d.excelName}"`).join(', ');

        renderNoMatches({
            detectedKeys,
            importCount: importData.length,
            sampleSkus,
            sampleExcel,
            foundHeader
        })
        return
    }

    renderImportPreview(matchedCount, unmatchedCount, foundHeader)
}

function renderNoMatches({ detectedKeys, importCount, sampleSkus, sampleExcel, foundHeader }) {
    const container = document.getElementById('import-preview')
    if (!container) return
    container.textContent = ''

    const title = document.createElement('h4')
    title.textContent = 'No se encontraron coincidencias (0 matches)'
    container.appendChild(title)

    const warning = document.createElement('p')
    warning.className = 'text-muted'
    warning.textContent = foundHeader
        ? 'Revisa que las columnas y nombres coincidan con los SKUs.'
        : 'No se detectó cabecera clara. Se asumió: Columna 1 = Producto, Columna 2 = Cantidad.'
    container.appendChild(warning)

    const keys = document.createElement('p')
    keys.textContent = `Columnas detectadas: ${detectedKeys}`
    container.appendChild(keys)

    const list = document.createElement('ul')
    list.className = 'detail-list'
    list.appendChild(buildInfoItem('Procesados', `${importCount} items válidos del Excel.`))
    list.appendChild(buildInfoItem('Ejemplos DB', `${sampleSkus} ...`))
    list.appendChild(buildInfoItem('Ejemplos Excel (Primeros 5)', `${sampleExcel} ...`))
    container.appendChild(list)

    const hint = document.createElement('p')
    hint.className = 'text-muted'
    hint.textContent = 'El sistema busca coincidencia exacta por Nombre o ID externo.'
    container.appendChild(hint)
}

function renderImportPreview(matched, unmatched, foundHeader) {
    const container = document.getElementById('import-preview')
    if (!container) return
    container.textContent = ''

    const summary = document.createElement('div')
    summary.className = 'analysis-summary'

    const summaryTitle = document.createElement('p')
    summaryTitle.textContent = 'Resultados del mapeo'
    summary.appendChild(summaryTitle)

    const matchedText = document.createElement('p')
    matchedText.className = 'text-muted'
    matchedText.textContent = `Encontrados: ${matched}`
    summary.appendChild(matchedText)

    const unmatchedText = document.createElement('p')
    unmatchedText.className = unmatched > 0 ? 'text-danger' : 'text-muted'
    unmatchedText.textContent = `No encontrados: ${unmatched}`
    summary.appendChild(unmatchedText)

    container.appendChild(summary)

    if (!foundHeader) {
        const warning = document.createElement('p')
        warning.className = 'text-muted'
        warning.textContent = 'No se detectó cabecera clara. Se asumió: Columna 1 = Producto, Columna 2 = Cantidad.'
        container.appendChild(warning)
    }

    const tableWrap = document.createElement('div')
    tableWrap.className = 'analysis-preview'

    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    ;['Excel', 'Sistema', 'Cant'].forEach(label => {
        const th = document.createElement('th')
        th.textContent = label
        headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    importData.forEach(item => {
        const row = document.createElement('tr')
        if (!item.skuId) row.classList.add('row-warning')
        row.appendChild(buildCell(item.excelName))
        row.appendChild(buildCell(item.skuName))
        row.appendChild(buildCell(item.quantity))
        tbody.appendChild(row)
    })
    table.appendChild(tbody)

    tableWrap.appendChild(table)
    container.appendChild(tableWrap)

    const actionRow = document.createElement('div')
    actionRow.className = 'form-actions'
    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = 'btn-success'
    confirmBtn.textContent = 'Confirmar importación'
    confirmBtn.disabled = matched === 0
    confirmBtn.addEventListener('click', window.confirmImport)
    actionRow.appendChild(confirmBtn)
    container.appendChild(actionRow)
}

function buildCell(value) {
    const cell = document.createElement('td')
    const text = value === null || value === undefined || value === '' ? '-' : String(value)
    cell.textContent = text
    return cell
}

function buildInfoItem(label, value) {
    const item = document.createElement('li')
    const strong = document.createElement('strong')
    strong.textContent = label + ': '
    item.appendChild(strong)
    item.appendChild(document.createTextNode(value))
    return item
}

window.confirmImport = async function() {
    const dateVal = document.getElementById('import-date').value
    if (!dateVal) {
        alert('Por favor seleccione una fecha operativa.')
        return
    }

    if (importData.length === 0) return
    if (!sb) {
        alert('No se pudo conectar con Supabase.')
        return
    }

    // Create Report Header
    const { data: report, error: repError } = await sb
        .from('consumption_reports')
        .insert({
            operational_date: dateVal,
            file_name: importFileName || ('Import ' + new Date().toLocaleDateString())
        })
        .select()
        .single()

    if (repError) {
        if (repError.code === '23505') { // Unique violation
            alert('Ya existe un reporte para esta fecha. Elimínelo antes de importar uno nuevo.')
        } else {
            alert('Error al crear reporte: ' + repError.message)
        }
        return
    }

    // Prepare Details
    const details = importData
        .filter(d => d.skuId) // Only valid matches
        .map(d => ({
            report_id: report.id,
            sku_id: d.skuId,
            quantity: d.quantity
        }))

    if (details.length === 0) {
        alert('No hay filas válidas para importar.')
        return
    }

    const { error: detError } = await sb
        .from('consumption_details')
        .insert(details)

    if (detError) {
        alert('Reporte creado pero hubo error en detalles: ' + detError.message)
    } else {
        alert('Importación exitosa.')
        importData = []
        document.getElementById('import-preview').textContent = ''
        document.getElementById('import-file').value = ''
        const fileNameEl = document.getElementById('import-file-name')
        if (fileNameEl) fileNameEl.textContent = ''
    }
}

// --- ANALYZE LOGIC ---

window.analyzeIdealStock = async function() {
    const start = document.getElementById('analyze-date-start').value
    const end = document.getElementById('analyze-date-end').value
    
    if(!start || !end) {
        alert('Seleccione rango de fechas.')
        return
    }

    const container = document.getElementById('analysis-results')
    setMessage(container, 'Calculando...', false)
    if (!sb) {
        setMessage(container, 'No se pudo conectar con Supabase.', true)
        return
    }

    // 1. Get reports in range
    const { data: reports, error: reportError } = await sb
        .from('consumption_reports')
        .select('id')
        .gte('operational_date', start)
        .lte('operational_date', end)

    if (reportError) {
        setMessage(container, 'Error al cargar reportes: ' + reportError.message, true)
        return
    }

    if (!reports || reports.length === 0) {
        setMessage(container, 'No hay reportes en este rango.', false)
        return
    }
    
    const reportIds = reports.map(r => r.id)

    // 2. Aggregate Details
    const { data: details, error: detailError } = await sb
        .from('consumption_details')
        .select('sku_id, quantity, sku:inventory_skus(name, category_id)')
        .in('report_id', reportIds)

    if (detailError) {
        setMessage(container, 'Error al cargar detalles: ' + detailError.message, true)
        return
    }

    if (!details || details.length === 0) {
        setMessage(container, 'No hay detalles en este rango.', false)
        return
    }

    // 3. Process Logic: Average Consumption
    window.currentAnalysisResults = [] // Store for bulk update

    const skuMap = {}
    details.forEach(d => {
        if (!skuMap[d.sku_id]) {
            skuMap[d.sku_id] = { 
                name: d.sku.name, 
                totalQty: 0, 
            }
        }
        skuMap[d.sku_id].totalQty += d.quantity
    })
    
    const daysCount = reportIds.length

    container.textContent = ''
    const summary = document.createElement('div')
    summary.className = 'analysis-summary'

    const summaryText = document.createElement('p')
    summaryText.textContent = `Basado en ${daysCount} días reportados.`
    summary.appendChild(summaryText)

    const bulkBtn = document.createElement('button')
    bulkBtn.type = 'button'
    bulkBtn.className = 'btn-success'
    bulkBtn.textContent = 'Fijar todos los ideales'
    bulkBtn.addEventListener('click', window.updateAllStockIdeal)
    summary.appendChild(bulkBtn)
    container.appendChild(summary)

    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    ;['Producto', 'Consumo Promedio', 'Sugerido (Redondeado)', 'Acción'].forEach(label => {
        const th = document.createElement('th')
        th.textContent = label
        headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (const [id, data] of Object.entries(skuMap)) {
        const avg = (data.totalQty / daysCount)
        const rounded = Math.ceil(avg)
        
        // Save to global
        window.currentAnalysisResults.push({ sku_id: id, ideal: rounded })

        const row = document.createElement('tr')
        row.appendChild(buildCell(data.name))
        row.appendChild(buildCell(avg.toFixed(2)))

        const idealCell = document.createElement('td')
        idealCell.textContent = rounded
        idealCell.className = 'analysis-ideal'
        row.appendChild(idealCell)

        const actionCell = document.createElement('td')
        const actionBtn = document.createElement('button')
        actionBtn.type = 'button'
        actionBtn.className = 'btn-secondary'
        actionBtn.textContent = 'Fijar Individual'
        actionBtn.addEventListener('click', () => window.updateStockIdeal(id, rounded))
        actionCell.appendChild(actionBtn)
        row.appendChild(actionCell)

        tbody.appendChild(row)
    }

    table.appendChild(tbody)
    container.appendChild(table)
}

window.updateAllStockIdeal = async function() {
    if (!window.currentAnalysisResults || window.currentAnalysisResults.length === 0) return
    if (!confirm(`¿Actualizar el Stock Ideal de ${window.currentAnalysisResults.length} productos?`)) return
    if (!sb) {
        alert('No se pudo conectar con Supabase.')
        return
    }

    const updates = window.currentAnalysisResults.map(item => ({
        sku_id: item.sku_id,
        stock_ideal: item.ideal
    }))

    const { error } = await sb
        .from('inventory_stock')
        .upsert(updates, { onConflict: 'sku_id' })

    if (error) {
        alert('Error al actualizar masivamente: ' + error.message)
    } else {
        alert('Todos los Stocks Ideales han sido actualizados exitosamente.')
    }
}

window.updateStockIdeal = async function(skuId, value) {
    if (!confirm(`¿Actualizar Stock Ideal a ${value}?`)) return
    if (!sb) {
        alert('No se pudo conectar con Supabase.')
        return
    }
    
    // Upsert into inventory_stock
    const { error } = await sb
        .from('inventory_stock')
        .upsert({ sku_id: skuId, stock_ideal: value }, { onConflict: 'sku_id' })

    if (error) alert('Error: ' + error.message)
    else alert('Actualizado.')
}

// --- HISTORY CHART LOGIC ---

window.loadHistoryChart = async function() {
    if (!sb) return

    const canvas = document.getElementById('history-chart')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    
    if (chartInstance) chartInstance.destroy()

    // 1. Load last 30 days reports
    const { data: reports, error: reportError } = await sb
        .from('consumption_reports')
        .select('operational_date, id')
        .order('operational_date', { ascending: false })
        .limit(30)
    
    if (reportError || !reports || reports.length === 0) return

    const orderedReports = reports.slice().reverse()

    const reportIds = orderedReports.map(r => r.id)
    const dates = orderedReports.map(r => r.operational_date)

    // 2. Load Details for these reports
    const { data: details, error: detailsError } = await sb
        .from('consumption_details')
        .select('report_id, sku_id, quantity, sku:inventory_skus(name)')
        .in('report_id', reportIds)
    
    if (detailsError || !details || details.length === 0) return

    // 3. Find Top 5 SKUs by Total Volume
    const skuTotals = {}
    
    details.forEach(d => {
        if (!skuTotals[d.sku_id]) {
            skuTotals[d.sku_id] = { 
                name: d.sku?.name || 'Desconocido', 
                total: 0,
                id: d.sku_id
            }
        }
        skuTotals[d.sku_id].total += d.quantity
    })

    const top5 = Object.values(skuTotals)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

    // 4. Build Datasets
    const datasets = top5.map((sku, index) => {
        const data = dates.map(date => {
            // Find report ID for this date
            const rep = orderedReports.find(r => r.operational_date === date)
            if (!rep) return 0
            
            // Find detail for this report and sku
            const det = details.find(d => d.report_id === rep.id && d.sku_id === sku.id)
            return det ? det.quantity : 0
        })

        const colors = [
            '#ff3b30', // Red
            '#ff9500', // Orange
            '#ff6b5b', // Soft red
            '#ffb347', // Amber
            '#ff7a1a'  // Deep orange
        ]

        return {
            label: sku.name,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            tension: 0.1,
            fill: false
        }
    })

    if (datasets.length === 0) {
         // Fallback if no data
         datasets.push({ label: 'Sin Datos', data: [] })
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Top 5 Productos Más Consumidos (Últimos 30 días)',
                    color: '#e0e0e0'
                },
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        color: '#e0e0e0'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                },
                y: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        }
    })
}
