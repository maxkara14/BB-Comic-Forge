import { SETTINGS_ID } from '../core/constants.js';
import { getKnownModelsForProvider } from '../providers/models.js';
import { getModelSuggestions } from '../providers/view.js';
import { escapeHtml } from './html.js';

// Search is transient; only choosing a suggestion or Enter commits a model.
export function createImageModelPicker({ getSettings, saveSettings, refreshSettingsDashboard }) {
    const states = new WeakMap();
    function stateFor(root) {
        if (!states.has(root)) states.set(root, { open: false, query: '', active: -1, models: [] });
        return states.get(root);
    }

    function update(root = document.getElementById(SETTINGS_ID)) {
        if (!root) return;
        const input = root.querySelector('#bbcf-model');
        const list = root.querySelector('#bbcf-model-options');
        if (!input || !list) return;
        const state = stateFor(root);
        const settings = getSettings();
        state.models = getModelSuggestions(settings).filter(model => model.toLowerCase().includes(state.query.trim().toLowerCase()));
        if (state.active >= state.models.length) state.active = -1;
        input.placeholder = getKnownModelsForProvider(settings.apiType)[0] || 'model';
        if (!state.open) input.value = settings.model || '';
        input.setAttribute('aria-expanded', String(state.open));
        if (state.open && state.active >= 0) input.setAttribute('aria-activedescendant', `bbcf-model-option-${state.active}`);
        else input.removeAttribute('aria-activedescendant');
        list.hidden = !state.open;
        list.innerHTML = state.models.length ? state.models.map((model, index) =>
            `<button type="button" role="option" tabindex="-1" id="bbcf-model-option-${index}" data-bbcf-model-index="${index}" aria-selected="${index === state.active}" class="bbcf-model-option">${escapeHtml(model)}</button>`
        ).join('') : '<div class="bbcf-model-empty">Нет совпадений — Enter применит введённое название</div>';
        if (state.open && state.active >= 0) list.querySelector(`#bbcf-model-option-${state.active}`)?.scrollIntoView({ block: 'nearest' });
    }

    function close(root) {
        Object.assign(stateFor(root), { open: false, query: '', active: -1 });
        update(root);
    }

    function commit(root, value) {
        const model = String(value || '').trim();
        if (model && model !== getSettings().model) {
            getSettings().model = model;
            saveSettings();
            refreshSettingsDashboard(root);
        }
        close(root);
    }

    function bind(root) {
        const input = root.querySelector('#bbcf-model');
        const list = root.querySelector('#bbcf-model-options');
        if (!input || !list) return;
        const state = stateFor(root);
        const open = () => {
            if (!state.open) Object.assign(state, { open: true, query: '', active: -1 });
            update(root);
        };
        input.addEventListener('focus', () => {
            open();
            input.select();
        });
        input.addEventListener('click', open);
        input.addEventListener('input', () => {
            Object.assign(state, { open: true, query: input.value, active: -1 });
            update(root);
        });
        input.addEventListener('blur', () => close(root));
        input.addEventListener('keydown', event => {
            if (event.isComposing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(root);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commit(root, state.open && state.active >= 0 ? state.models[state.active] : input.value);
            } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                if (!state.open) Object.assign(state, { open: true, query: '', active: -1 });
                const count = state.models.length;
                if (count) state.active = event.key === 'ArrowDown' ? (state.active + 1) % count : (state.active < 0 ? count - 1 : (state.active + count - 1) % count);
                update(root);
            }
        });
        // Keep focus on the input so blur cannot discard a pending pointer choice.
        list.addEventListener('mousedown', event => event.preventDefault());
        list.addEventListener('click', event => {
            const option = event.target.closest('[data-bbcf-model-index]');
            if (!option || !list.contains(option)) return;
            const index = Number(option.dataset.bbcfModelIndex);
            if (state.open && Number.isInteger(index) && state.models[index]) commit(root, state.models[index]);
        });
        update(root);
    }

    return { bind, close, update };
}
