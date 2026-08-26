import { createCancellationError, throwIfAborted } from '../providers/transport.js';

export async function runQueue(items, concurrency, worker, onError) {
    let next = 0;
    let firstError = null;
    async function runWorker() {
        while (next < items.length && !firstError) {
            const item = items[next++];
            try {
                await worker(item);
            } catch (error) {
                firstError = error;
                if (typeof onError === 'function') onError(item, error);
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker);
    await Promise.all(workers);
    if (firstError) throw firstError;
}

export function renderProgress(root, plans) {
    if (!root) return;
    root.innerHTML = plans.map(panel => `
        <div class="bbcf-progress-row" data-panel="${panel.number}" data-state="idle">
            <b>Panel ${panel.number}</b>
            <div class="bbcf-progress-bar"><span></span></div>
            <span class="bbcf-progress-label">Ожидает</span>
        </div>
    `).join('');
}

export function updateProgress(root, panelNumber, stateName, label) {
    if (!root) return;
    const row = root.querySelector(`.bbcf-progress-row[data-panel="${panelNumber}"]`);
    if (!row) return;
    row.dataset.state = stateName;
    const labelEl = row.querySelector('.bbcf-progress-label');
    if (labelEl) labelEl.textContent = label || stateName;
}

export function startElapsedProgress(root, panelNumber, prefix) {
    const startedAt = Date.now();
    const timer = setInterval(() => {
        const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        updateProgress(root, panelNumber, 'running', `${prefix}: ${seconds} sec`);
    }, 1000);
    return () => clearInterval(timer);
}

export async function waitWithProgress(ms, onTick, signal = null) {
    const total = Math.max(0, Number(ms) || 0);
    if (!total) return;
    const startedAt = Date.now();
    while (Date.now() - startedAt < total) {
        throwIfAborted(signal);
        const left = Math.ceil((total - (Date.now() - startedAt)) / 1000);
        if (typeof onTick === 'function') onTick(`КД перед запросом: ${left} sec`);
        await delay(Math.min(1000, total - (Date.now() - startedAt)), signal);
    }
}

function delay(ms, signal = null) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener?.('abort', onAbort);
            resolve();
        }, Math.max(0, ms));
        const onAbort = () => {
            clearTimeout(timer);
            reject(createCancellationError());
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}

