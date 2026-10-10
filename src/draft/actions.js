// Revision edits the current draft; clearing removes its content and is undoable.
const CONTENT_FIELDS = {
    scene: '#bbcf-draft-scene',
    characterLock: '#bbcf-draft-lock',
    panelNotes: '#bbcf-draft-notes',
    bubbles: '#bbcf-draft-bubbles',
    inserts: '#bbcf-draft-inserts',
    sfx: '#bbcf-draft-sfx',
};

export function createDraftActionsController({ runAiDraft, cancelAiDraft, isBusy, getScopeKey, getSavedDraft, saveDraftFromModal, refreshForgeWorkflowSummary }) {
    const states = new WeakMap();
    function bind(root) {
        const revise = root.querySelector('#bbcf-draft-revise');
        const editor = root.querySelector('#bbcf-draft-revision');
        const instruction = root.querySelector('#bbcf-draft-revision-text');
        const apply = root.querySelector('#bbcf-draft-revise-apply');
        const clear = root.querySelector('#bbcf-draft-clear');
        const undo = root.querySelector('#bbcf-draft-clear-undo');
        const status = root.querySelector('#bbcf-draft-action-status');
        const assemble = root.querySelector('#bbcf-ai-draft');
        const state = { undo: null, pending: false, revision: false, assembleHtml: assemble.innerHTML };
        states.set(root, state);
        const busy = () => state.pending || isBusy();
        root.querySelector('#bbcf-draft-revise-cancel').addEventListener('click', () => { if (state.pending) cancelAiDraft(); });
        const resetUndo = () => { state.undo = null; undo.hidden = true; status.textContent = ''; };
        const showEditor = show => {
            editor.hidden = !show;
            revise.setAttribute('aria-expanded', String(show));
            if (show) instruction.focus();
        };
        revise.addEventListener('click', () => { if (!busy()) showEditor(editor.hidden); });
        root.querySelector('#bbcf-draft-revise-close').addEventListener('click', () => { if (!busy()) showEditor(false); });
        async function run(options = {}) {
            if (busy()) return;
            state.pending = true;
            state.revision = Boolean(options.instruction);
            updateBusy(root);
            try {
                const applied = await runAiDraft(root, options);
                if (applied) {
                    resetUndo();
                    if (options.instruction) { instruction.value = ''; showEditor(false); }
                }
            } finally { state.pending = false; updateBusy(root); }
        }
        assemble.addEventListener('click', () => {
            if (state.pending && !state.revision) { cancelAiDraft(); return; }
            return run();
        });
        apply.addEventListener('click', () => {
            const text = instruction.value.trim();
            if (!text) { instruction.focus(); return; }
            return run({ instruction: text });
        });
        clear.addEventListener('click', () => {
            if (busy()) return;
            const values = Object.fromEntries(Object.entries(CONTENT_FIELDS).map(([field, selector]) => [field, root.querySelector(selector).value]));
            if (!Object.values(values).some(value => value.trim())) return;
            state.undo = { scope: getScopeKey(), values, manualFields: getSavedDraft().manualFields || [] };
            for (const selector of Object.values(CONTENT_FIELDS)) root.querySelector(selector).value = '';
            saveDraftFromModal(root, { manualFields: Object.keys(CONTENT_FIELDS) });
            refreshForgeWorkflowSummary(root);
            undo.hidden = false;
            status.textContent = 'Черновик очищен. Настройки и референсы сохранены.';
        });
        undo.addEventListener('click', () => {
            if (busy() || !state.undo) return;
            if (state.undo.scope !== getScopeKey()) { resetUndo(); return; }
            for (const [field, selector] of Object.entries(CONTENT_FIELDS)) root.querySelector(selector).value = state.undo.values[field];
            const content = new Set(Object.keys(CONTENT_FIELDS));
            const manualFields = [...getSavedDraft().manualFields.filter(field => !content.has(field)), ...state.undo.manualFields.filter(field => content.has(field))];
            saveDraftFromModal(root, { replaceManualFields: manualFields });
            refreshForgeWorkflowSummary(root);
            resetUndo();
        });
        for (const name of ['input', 'change']) root.querySelector('#bbcf-draft-form').addEventListener(name, event => {
            if (Object.values(CONTENT_FIELDS).some(selector => event.target.matches(selector))) resetUndo();
        });
        updateBusy(root);
    }
    function updateBusy(root) {
        const state = states.get(root);
        if (!state) return;
        const busy = state.pending || isBusy();
        const assembling = state.pending && !state.revision;
        const assemble = root.querySelector('#bbcf-ai-draft');
        assemble.disabled = busy && !assembling;
        assemble.innerHTML = assembling
            ? '<i class="fa-solid fa-xmark"></i><span>Отменить</span>'
            : state.assembleHtml;
        for (const id of ['bbcf-draft-revise', 'bbcf-draft-revise-apply', 'bbcf-draft-revise-close', 'bbcf-draft-clear', 'bbcf-draft-clear-undo']) root.querySelector(`#${id}`).disabled = busy;
        root.querySelector('#bbcf-draft-revision-text').readOnly = busy;
        root.querySelector('#bbcf-draft-revise-cancel').hidden = !state.pending || !state.revision;
    }
    function reset(root) {
        const state = states.get(root);
        if (!state) return;
        state.undo = null;
        root.querySelector('#bbcf-draft-clear-undo').hidden = true;
        root.querySelector('#bbcf-draft-action-status').textContent = '';
        root.querySelector('#bbcf-draft-revision').hidden = true;
        root.querySelector('#bbcf-draft-revise').setAttribute('aria-expanded', 'false');
        root.querySelector('#bbcf-draft-revision-text').value = '';
    }
    return { bind, reset, updateBusy };
}
