'use strict';

(function() {
    const CACHE_KEY = 'analysis-ideal-cache-v1';
    const DEFAULT_DAYS = 30;
    const DEFAULT_TTL = 120000;
    const IDEAL_900_FACTOR = 900 / 500;

    function getDateOffset(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    }

    function loadCache() {
        try {
            const raw = window.sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.timestamp || !parsed.data) return null;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    function saveCache(payload) {
        try {
            window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch (err) {
            // Ignore storage errors.
        }
    }

    function buildIdealMap(totals, reportCount) {
        const idealMap = {};
        if (!reportCount) return idealMap;
        Object.entries(totals).forEach(([skuId, totalQty]) => {
            const avg = totalQty / reportCount;
            const ideal1 = Math.ceil(avg);
            const ideal2 = Math.ceil(avg * IDEAL_900_FACTOR);
            idealMap[skuId] = {
                ideal1,
                ideal2
            };
        });
        return idealMap;
    }

    async function getIdealMap(sb, options = {}) {
        if (!sb) return {};
        const days = options.days ?? DEFAULT_DAYS;
        const ttlMs = options.ttlMs ?? DEFAULT_TTL;

        const cached = loadCache();
        if (cached && cached.days === days && (Date.now() - cached.timestamp) < ttlMs) {
            return cached.data || {};
        }

        const since = getDateOffset(-days);
        const { data: reports, error: reportError } = await sb
            .from('consumption_reports')
            .select('id, operational_date')
            .gte('operational_date', since);

        if (reportError || !reports || !reports.length) {
            const emptyPayload = {
                timestamp: Date.now(),
                days,
                data: {}
            };
            saveCache(emptyPayload);
            return {};
        }

        const reportIds = reports.map(rep => rep.id);
        const { data: details, error: detailError } = await sb
            .from('consumption_details')
            .select('sku_id, quantity')
            .in('report_id', reportIds);

        if (detailError || !details) {
            throw detailError || new Error('No se pudieron cargar los consumos.');
        }

        const totals = {};
        details.forEach(item => {
            const skuId = item.sku_id || 'unknown';
            totals[skuId] = (totals[skuId] || 0) + (item.quantity || 0);
        });

        const idealMap = buildIdealMap(totals, reports.length);
        saveCache({
            timestamp: Date.now(),
            days,
            data: idealMap
        });
        return idealMap;
    }

    window.AnalysisHelpers = {
        getIdealMap
    };
})();
