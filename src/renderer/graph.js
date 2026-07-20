// Detached graph window renderer. Self-contained (does not share app.js
// state): it pulls the usage history + latest usage (for forecasts) over IPC,
// draws a multi-provider Chart.js line chart, and re-renders whenever the main
// process signals new data. Also owns its own always-on-top pin.
(async function () {
    const api = window.electronAPI;
    const COMPANY = { anthropic: '#d97757', openai: '#10a37f', google: '#4285f4' };
    const CODE = { codex: '#2dd4bf', gemini: '#4285f4' };
    const SCOPED_COLORS = { fable: '#d946ef' };
    const SCOPED_FALLBACK = ['#84cc16', '#14b8a6', '#a855f7', '#64748b'];
    const canvas = document.getElementById('usageChart');
    const empty = document.getElementById('gEmpty');
    let chart = null;

    function build(history, latest) {
        if (chart) { chart.destroy(); chart = null; }
        if (!history || !history.length) {
            canvas.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }
        canvas.style.display = '';
        empty.style.display = 'none';
        const forecasts = (latest && latest.forecasts) || {};

        const scopedKeys = [];
        const seen = new Set();
        for (const e of history) {
            for (const k of Object.keys(e.scoped || {})) { if (!seen.has(k)) { seen.add(k); scopedKeys.push(k); } }
        }

        const line = (label, color, pick, dash) => ({
            label,
            data: history.map((e) => ({ x: e.timestamp, y: pick(e) || 0 })),
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: dash || undefined,
            stepped: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
        });

        const datasets = [
            line('Session', '#8b5cf6', (e) => e.session),
            line('Weekly', '#3b82f6', (e) => e.weekly)
        ];
        let ci = 0;
        for (const k of scopedKeys) {
            const vals = history.map((e) => (e.scoped ? e.scoped[k] : 0) || 0);
            if (!vals.some((v) => v > 0)) continue;
            const lbl = k.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const color = SCOPED_COLORS[k] || SCOPED_FALLBACK[ci++ % SCOPED_FALLBACK.length];
            datasets.push(line(lbl, color, (e) => (e.scoped ? e.scoped[k] : 0)));
        }
        // Cross-provider comparison lines (already 0-100%). CLI second accounts dashed.
        const PROVIDERS = [
            ['Codex', CODE.codex, 'codex', null],
            ['Gemini', COMPANY.google, 'gemini', null],
            ['Claude CLI', COMPANY.anthropic, 'claudeCli', [5, 3]],
            ['Codex CLI', CODE.codex, 'codexCli', [5, 3]],
            ['Gemini CLI', COMPANY.google, 'geminiCli', [5, 3]]
        ];
        for (const [lbl, color, key, dash] of PROVIDERS) {
            const vals = history.map((e) => e[key] || 0);
            if (!vals.some((v) => v > 0)) continue;
            datasets.push(line(lbl, color, (e) => e[key], dash));
        }

        // Forecast projection lines (dotted, to the 100% crossing).
        const last = history[history.length - 1];
        let xMax = last.timestamp;
        const addProj = (label, color, lastVal, etaIso) => {
            if (etaIso == null || lastVal == null) return;
            const t = new Date(etaIso).getTime();
            if (!(t > last.timestamp)) return;
            datasets.push({
                label: label + ' → 100%',
                data: [{ x: last.timestamp, y: lastVal }, { x: t, y: 100 }],
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
            xMax = Math.max(xMax, t);
        };
        addProj('Weekly', '#3b82f6', last.weekly, forecasts.weekly);
        for (const k of scopedKeys) {
            addProj(k.charAt(0).toUpperCase() + k.slice(1), SCOPED_COLORS[k] || '#84cc16',
                last.scoped ? last.scoped[k] : null, forecasts.scoped ? forecasts.scoped[k] : null);
        }
        for (const [lbl, color, key] of [
            ['Codex', CODE.codex, 'codex'], ['Gemini', COMPANY.google, 'gemini'],
            ['Claude CLI', COMPANY.anthropic, 'claudeCli'], ['Codex CLI', CODE.codex, 'codexCli'],
            ['Gemini CLI', COMPANY.google, 'geminiCli']
        ]) {
            addProj(lbl, color, last[key], forecasts[key]);
        }
        xMax = Math.min(xMax, Date.now() + 3 * 24 * 60 * 60 * 1000);

        let maxV = 0;
        for (const d of datasets) for (const pt of d.data) if (pt.y > maxV) maxV = pt.y;
        const yMax = Math.max(10, Math.ceil(maxV / 10) * 10);
        const first = new Date(history[0].timestamp); first.setHours(0, 0, 0, 0);

        chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'nearest' },
                scales: {
                    x: {
                        type: 'linear',
                        min: first.getTime(),
                        max: xMax,
                        ticks: { font: { size: 10 }, color: '#8a8aa0', maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        min: 0,
                        max: yMax,
                        ticks: { font: { size: 10 }, color: '#8a8aa0', callback: (v) => v + '%' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            boxWidth: 8, boxHeight: 8, padding: 6,
                            font: { size: 9 }, color: '#b9b9cc',
                            filter: (item) => !/→ 100%|reset/i.test(item.text)
                        }
                    }
                }
            }
        });
    }

    async function refresh() {
        try {
            const [history, latest] = await Promise.all([api.getUsageHistory(), api.getLatestUsage()]);
            build(history, latest);
        } catch (err) { /* window may be closing */ }
    }

    // Always-on-top pin (persisted in main via settings.graphAlwaysOnTop).
    const pin = document.getElementById('pinBtn');
    const pinLabel = document.getElementById('pinLabel');
    let onTop = true;
    try { onTop = await api.graphGetAlwaysOnTop(); } catch (e) { /* default true */ }
    const paintPin = () => { pin.classList.toggle('on', onTop); pinLabel.textContent = onTop ? 'On top' : 'Not pinned'; };
    paintPin();
    pin.addEventListener('click', () => { onTop = !onTop; api.graphSetAlwaysOnTop(onTop); paintPin(); });

    if (api.onUsageUpdated) api.onUsageUpdated(() => refresh());
    refresh();
})();
