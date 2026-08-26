// Keeps wardrobe and reference-file UI behavior behind one controller while generation consumes selectors only.
import { SETTINGS_ID } from '../core/constants.js';
import { makeId } from '../core/id.js';
import {
    fetchUrlAsDataUrl,
    getImageFileFromPasteEvent,
    readClipboardImageFile,
    readFileAsDataUrl,
} from '../images/browser.js';
import { uploadReferenceImage } from '../images/storage.js';
import { getKnownModelsForProvider } from '../providers/models.js';
import {
    geminiApiHeaders,
    imageApiHeaders,
    normalizeGeminiGenerateUrl,
    normalizeOpenAiBase,
} from '../providers/request.js';
import { parseImageDataUrl } from '../providers/responses.js';
import { escapeHtml } from '../ui/html.js';
import {
    REFERENCE_SLOTS,
    WARDROBE_CATEGORIES,
    WARDROBE_CATEGORY_ORDER,
    WARDROBE_TARGETS,
} from './config.js';
import {
    normalizeReferences,
    normalizeWardrobeAssignment,
    normalizeWardrobeItems,
} from './normalizers.js';
import {
    findWardrobeItem,
    getAllowedWardrobeCategories,
    getFilteredWardrobeItems,
    getWardrobeTagsForOwner,
} from './selectors.js';
import { renderWardrobeModalHtml, renderWardrobeShellHtml } from './view.js';

export function createWardrobeController(dependencies) {
    const {
        createSettingsUi,
        fetchJson,
        getContext,
        getReferenceProfileKey,
        getSettings,
        notifyError,
        notifyInfo,
        notifySuccess,
        notifyWarning,
        persistWardrobeAssignments,
        saveSettings,
        saveSettingsImmediately,
        state,
    } = dependencies;

    function openWardrobeModal() {
        if (state.wardrobeModal?.isConnected) return;
        const root = document.createElement('div');
        root.className = 'bbcf-wardrobe-modal-root';
        root.innerHTML = renderWardrobeShellHtml();
        document.body.appendChild(root);
        state.wardrobeModal = root;
        root.querySelectorAll('[data-bbcf-wardrobe-close]').forEach(node => node.addEventListener('click', closeWardrobeModal));
        renderWardrobeModal();
    }

    function closeWardrobeModal() {
        state.wardrobeModal?.remove();
        state.wardrobeModal = null;
        state.wardrobeEditingId = null;
        state.wardrobeTempPath = '';
        refreshSettingsUi();
    }

    function renderWardrobeModal() {
        const root = state.wardrobeModal;
        const body = root?.querySelector('.bbcf-wardrobe-modal-body');
        if (!body) return;
        const settings = getSettings();
        if (!REFERENCE_SLOTS.some(owner => owner.id === state.wardrobeOwner)) state.wardrobeOwner = 'char';
        const owner = REFERENCE_SLOTS.find(slot => slot.id === state.wardrobeOwner) || REFERENCE_SLOTS[0];
        const assignment = settings.wardrobeAssignments[owner.id] || normalizeWardrobeAssignment();
        const allowedCategories = getAllowedWardrobeCategories(assignment.mode);
        if (state.wardrobeCategory !== 'all' && !allowedCategories.includes(state.wardrobeCategory)) {
            state.wardrobeCategory = 'all';
        }
        const visibleItems = getFilteredWardrobeItems(settings, owner.id, state.wardrobeCategory, state.wardrobeTag);
        const tags = getWardrobeTagsForOwner(settings, owner.id);
        if (state.wardrobeTag !== 'all' && !tags.includes(state.wardrobeTag)) state.wardrobeTag = 'all';
        body.innerHTML = renderWardrobeModalHtml({
            settings,
            owner,
            assignment,
            category: state.wardrobeCategory,
            tag: state.wardrobeTag,
            tags,
            editingId: state.wardrobeEditingId,
            tempPath: state.wardrobeTempPath,
            visibleItems,
        });
        bindWardrobeModalEvents(body);
    }

    function bindReferenceSettings(root) {
        root.querySelectorAll('.bbcf-ref-card').forEach(card => {
            bindReferenceImageFallbacks(card);
            const id = card.getAttribute('data-bbcf-ref');
            if (!id) return;
            const fileInput = card.querySelector('.bbcf-ref-file');
            card.querySelector('.bbcf-ref-upload')?.addEventListener('click', () => fileInput?.click());
            card.querySelector('.bbcf-ref-paste')?.addEventListener('click', async event => {
                await pasteReferenceImageFromClipboard(id, card, event.currentTarget);
            });
            card.addEventListener('paste', async event => {
                const file = getImageFileFromPasteEvent(event);
                if (!file) return;
                event.preventDefault();
                try {
                    await saveReferenceImageFile(file, id, card);
                } catch (error) {
                    console.error('[BB Comic Forge] reference paste failed', error);
                    notifyError(error?.message || String(error));
                }
            });
            fileInput?.addEventListener('change', async () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    const path = await saveReferenceImageToFile(dataUrl, id);
                    const ref = updateReference(id, { path }, { immediate: true });
                    syncReferenceCard(card, ref);
                    notifySuccess('Референс сохранен.');
                } catch (error) {
                    console.error('[BB Comic Forge] reference upload failed', error);
                    notifyError(error?.message || String(error));
                } finally {
                    fileInput.value = '';
                }
            });
            card.querySelector('.bbcf-ref-clear')?.addEventListener('click', () => {
                const ref = updateReference(id, { path: '' }, { immediate: true });
                syncReferenceCard(card, ref);
                notifyInfo('Референс очищен.');
            });
            card.querySelector('.bbcf-ref-enabled')?.addEventListener('change', event => {
                updateReference(id, { enabled: Boolean(event.target.checked) });
            });
            card.querySelector('.bbcf-ref-name')?.addEventListener('input', event => {
                updateReference(id, { name: String(event.target.value || '') });
            });
            card.querySelector('.bbcf-ref-description')?.addEventListener('input', event => {
                updateReference(id, { description: String(event.target.value || '') });
            });
        });
    }

    async function pasteReferenceImageFromClipboard(id, card, button = null) {
        try {
            await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Вставляю...</span>', async () => {
                const file = await readClipboardImageFile();
                await saveReferenceImageFile(file, id, card);
            });
        } catch (error) {
            console.error('[BB Comic Forge] reference paste failed', error);
            notifyError(error?.message || String(error));
        }
    }

    async function saveReferenceImageFile(file, id, card) {
        const dataUrl = await readFileAsDataUrl(file);
        const path = await saveReferenceImageToFile(dataUrl, id);
        const ref = updateReference(id, { path }, { immediate: true });
        syncReferenceCard(card, ref);
        notifySuccess('Референс сохранён.');
        return path;
    }

    function syncReferenceCard(card, ref) {
        if (!card || !ref) return;
        const thumb = card.querySelector('.bbcf-ref-thumb');
        if (thumb) {
            thumb.classList.toggle('has-image', Boolean(ref.path));
            thumb.classList.remove('is-broken');
            thumb.removeAttribute('title');
            thumb.innerHTML = ref.path
                ? `<img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.label)}" data-bbcf-ref-image>`
                : '<i class="fa-solid fa-user"></i>';
            bindReferenceImageFallbacks(card);
        }
        const clearButton = card.querySelector('.bbcf-ref-clear');
        if (clearButton) clearButton.disabled = !ref.path;
    }

    function bindReferenceImageFallbacks(root) {
        root.querySelectorAll('[data-bbcf-ref-image]').forEach(image => {
            if (image.dataset.bbcfErrorBound) return;
            image.dataset.bbcfErrorBound = '1';
            image.addEventListener('error', () => showBrokenReferenceThumb(image), { once: true });
            if (image.complete && !image.naturalWidth) showBrokenReferenceThumb(image);
        });
    }

    function showBrokenReferenceThumb(image) {
        const thumb = image.closest('.bbcf-ref-thumb');
        if (!thumb) return;
        thumb.classList.remove('has-image');
        thumb.classList.add('is-broken');
        thumb.title = 'Файл референса не найден в хранилище SillyTavern.';
        thumb.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    }

    function bindWardrobeRecoveryButtons(root) {
        root.querySelectorAll('[data-bbcf-wardrobe-recover]').forEach(button => {
            button.addEventListener('click', () => recoverWardrobeReferenceFiles(button));
        });
    }

    async function recoverWardrobeReferenceFiles(button = null) {
        try {
            await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Ищу...</span>', async () => {
                const settings = getSettings();
                const storedPaths = await listStoredReferenceImagePaths();
                const knownPaths = getKnownStoredReferencePaths(settings);
                const orphanWardrobePaths = storedPaths
                    .map(normalizeStoredImagePath)
                    .filter(path => isWardrobeUploadPath(path) && !knownPaths.has(path));
                const imported = orphanWardrobePaths.map(path => buildRecoveredWardrobeItem(path));

                if (imported.length) {
                    settings.wardrobeItems = normalizeWardrobeItems([...imported, ...settings.wardrobeItems]);
                    await saveSettingsImmediately();
                    refreshSettingsUi();
                    if (state.wardrobeModal?.isConnected) renderWardrobeModal();
                    notifySuccess(`Восстановлено вещей: ${imported.length}.`);
                } else {
                    notifyInfo('Новых гардеробных картинок не найдено.');
                }

                const brokenPaths = getBrokenStoredReferencePaths(settings, storedPaths);
                const brokenWardrobePaths = getBrokenWardrobeReferencePaths(settings, storedPaths);
                if (brokenPaths.length) {
                    console.warn('[BB Comic Forge] stored reference paths point to missing files', brokenPaths);
                }
                if (brokenWardrobePaths.length) {
                    notifyWarning(`В гардеробе есть битые ссылки на файлы: ${brokenWardrobePaths.length}. Их можно вернуть только из бэкапа user/images.`);
                }
            });
        } catch (error) {
            console.error('[BB Comic Forge] wardrobe recovery failed', error);
            notifyError(error?.message || String(error));
        }
    }

    async function listStoredReferenceImagePaths() {
        const context = getContext();
        const response = await fetch('/api/images/list', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({
                folder: 'bbcf_refs',
                sortField: 'date',
                sortOrder: 'desc',
            }),
        });
        if (!response.ok) {
            const raw = await response.text().catch(() => '');
            throw new Error(raw || `Reference image scan failed: ${response.status}`);
        }
        const files = await response.json();
        return (Array.isArray(files) ? files : [])
            .map(file => normalizeStoredImagePath(`/user/images/bbcf_refs/${file}`))
            .filter(isBbcfReferencePath);
    }

    function getKnownStoredReferencePaths(settings = getSettings()) {
        const paths = new Set();
        const addPath = value => {
            const path = normalizeStoredImagePath(value);
            if (path) paths.add(path);
        };
        normalizeReferences(settings.references).forEach(ref => addPath(ref.path));
        Object.values(settings.referenceProfiles || {}).forEach(profile => {
            normalizeReferences(profile).forEach(ref => addPath(ref.path));
        });
        normalizeWardrobeItems(settings.wardrobeItems).forEach(item => addPath(item.path));
        return paths;
    }

    function getBrokenStoredReferencePaths(settings, storedPaths) {
        const available = new Set(storedPaths.map(normalizeStoredImagePath));
        return [...getKnownStoredReferencePaths(settings)]
            .filter(path => isBbcfReferencePath(path) && !available.has(path));
    }

    function getBrokenWardrobeReferencePaths(settings, storedPaths) {
        const available = new Set(storedPaths.map(normalizeStoredImagePath));
        return normalizeWardrobeItems(settings.wardrobeItems)
            .map(item => normalizeStoredImagePath(item.path))
            .filter(path => isBbcfReferencePath(path) && !available.has(path));
    }

    function buildRecoveredWardrobeItem(path) {
        const createdAt = parseBbcfUploadTimestamp(path) || Date.now();
        const date = new Date(createdAt);
        const label = Number.isFinite(date.getTime())
            ? date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
            : '';
        return {
            id: makeId('wardrobe-item'),
            name: label ? `Восстановленный образ ${label}` : 'Восстановленный образ',
            description: '',
            path,
            category: 'full',
            target: 'all',
            tags: ['восстановлено'],
            favorite: false,
            createdAt,
        };
    }

    function parseBbcfUploadTimestamp(path) {
        const fileName = String(path || '').split('/').pop() || '';
        const match = fileName.match(/bbcf_ref_[a-z0-9_]+_(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/i);
        if (!match) return 0;
        const timestamp = Date.parse(`${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`);
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function normalizeStoredImagePath(path) {
        const normalized = String(path || '').trim().replace(/\\/g, '/');
        if (!normalized) return '';
        return normalized.startsWith('/') ? normalized : `/${normalized}`;
    }

    function isBbcfReferencePath(path) {
        return /^\/user\/images\/bbcf_refs\/[^/]+$/i.test(normalizeStoredImagePath(path));
    }

    function isWardrobeUploadPath(path) {
        return /^\/user\/images\/bbcf_refs\/bbcf_ref_wardrobe_item_/i.test(normalizeStoredImagePath(path));
    }

    function bindWardrobeModalEvents(root) {
        bindWardrobeRecoveryButtons(root);
        root.querySelectorAll('[data-bbcf-wardrobe-owner]').forEach(button => {
            button.addEventListener('click', () => {
                state.wardrobeOwner = button.getAttribute('data-bbcf-wardrobe-owner') || 'char';
                state.wardrobeEditingId = null;
                state.wardrobeTag = 'all';
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-mode]').forEach(button => {
            button.addEventListener('click', () => {
                const settings = getSettings();
                const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
                assignment.mode = button.getAttribute('data-bbcf-wardrobe-mode') === 'parts' ? 'parts' : 'full';
                if (assignment.mode === 'full') {
                    assignment.top = '';
                    assignment.bottom = '';
                    assignment.shoes = '';
                } else {
                    assignment.full = '';
                }
                settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
                if (state.wardrobeCategory !== 'all' && !getAllowedWardrobeCategories(assignment.mode).includes(state.wardrobeCategory)) {
                    state.wardrobeCategory = 'all';
                }
                state.wardrobeTag = 'all';
                persistWardrobeAssignments(settings);
                saveSettings();
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-category]').forEach(button => {
            button.addEventListener('click', () => {
                state.wardrobeCategory = button.getAttribute('data-bbcf-wardrobe-category') || 'all';
                state.wardrobeTag = 'all';
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-tag]').forEach(button => {
            button.addEventListener('click', () => {
                state.wardrobeTag = button.getAttribute('data-bbcf-wardrobe-tag') || 'all';
                renderWardrobeModal();
            });
        });
        root.querySelector('#bbcf-wardrobe-new')?.addEventListener('click', () => {
            state.wardrobeEditingId = 'new';
            state.wardrobeTempPath = '';
            renderWardrobeModal();
        });
        root.querySelectorAll('[data-bbcf-wardrobe-equip]').forEach(button => {
            button.addEventListener('click', () => {
                equipWardrobeItem(button.getAttribute('data-bbcf-wardrobe-equip'));
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-clear]').forEach(button => {
            button.addEventListener('click', () => {
                clearWardrobeSlot(button.getAttribute('data-bbcf-wardrobe-clear'));
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-edit]').forEach(button => {
            button.addEventListener('click', () => {
                state.wardrobeEditingId = button.getAttribute('data-bbcf-wardrobe-edit');
                state.wardrobeTempPath = '';
                renderWardrobeModal();
            });
        });
        root.querySelectorAll('[data-bbcf-wardrobe-delete]').forEach(button => {
            button.addEventListener('click', () => {
                deleteWardrobeItem(button.getAttribute('data-bbcf-wardrobe-delete'));
                renderWardrobeModal();
            });
        });
        bindWardrobeEditor(root);
    }

    function bindWardrobeEditor(root) {
        const form = root.querySelector('#bbcf-wardrobe-editor');
        if (!form) return;
        const fileInput = form.querySelector('#bbcf-wardrobe-editor-file');
        form.querySelector('#bbcf-wardrobe-editor-upload')?.addEventListener('click', () => fileInput?.click());
        form.querySelector('#bbcf-wardrobe-editor-paste')?.addEventListener('click', async event => {
            await pasteWardrobeEditorImageFromClipboard(event.currentTarget);
        });
        form.addEventListener('paste', async event => {
            const file = getImageFileFromPasteEvent(event);
            if (!file) return;
            event.preventDefault();
            try {
                await saveWardrobeEditorImageFile(file);
            } catch (error) {
                console.error('[BB Comic Forge] wardrobe paste failed', error);
                notifyError(error?.message || String(error));
            }
        });
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const path = await saveReferenceImageToFile(dataUrl, 'wardrobe_item');
                if (state.wardrobeEditingId && state.wardrobeEditingId !== 'new') {
                    updateWardrobeItem(state.wardrobeEditingId, { path }, { immediate: true });
                } else {
                    state.wardrobeTempPath = path;
                }
                renderWardrobeModal();
            } catch (error) {
                console.error('[BB Comic Forge] wardrobe upload failed', error);
                notifyError(error?.message || String(error));
            } finally {
                fileInput.value = '';
            }
        });
        form.querySelector('#bbcf-wardrobe-editor-cancel')?.addEventListener('click', () => {
            state.wardrobeEditingId = null;
            state.wardrobeTempPath = '';
            renderWardrobeModal();
        });
        form.querySelector('#bbcf-wardrobe-editor-describe')?.addEventListener('click', async () => {
            await describeWardrobeEditor(form);
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            saveWardrobeEditor(form);
            renderWardrobeModal();
        });
    }

    async function pasteWardrobeEditorImageFromClipboard(button = null) {
        try {
            await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Вставляю...</span>', async () => {
                const file = await readClipboardImageFile();
                await saveWardrobeEditorImageFile(file);
            });
        } catch (error) {
            console.error('[BB Comic Forge] wardrobe paste failed', error);
            notifyError(error?.message || String(error));
        }
    }

    async function saveWardrobeEditorImageFile(file) {
        const dataUrl = await readFileAsDataUrl(file);
        const path = await saveReferenceImageToFile(dataUrl, 'wardrobe_item');
        if (state.wardrobeEditingId && state.wardrobeEditingId !== 'new') {
            updateWardrobeItem(state.wardrobeEditingId, { path }, { immediate: true });
        } else {
            state.wardrobeTempPath = path;
        }
        renderWardrobeModal();
        return path;
    }

    function updateReference(id, patch, options = {}) {
        const settings = getSettings();
        const ref = settings.references.find(item => item.id === id);
        if (!ref) return null;
        Object.assign(ref, patch);
        settings.referenceProfiles[getReferenceProfileKey()] = structuredClone(settings.references);
        if (options.immediate) void saveSettingsImmediately();
        else saveSettings();
        return ref;
    }

    function updateWardrobeItem(id, patch, options = {}) {
        const settings = getSettings();
        const item = settings.wardrobeItems.find(entry => entry.id === id);
        if (!item) return;
        Object.assign(item, patch);
        if (options.immediate) void saveSettingsImmediately();
        else saveSettings();
    }

    function saveWardrobeEditor(form) {
        const settings = getSettings();
        const isNew = state.wardrobeEditingId === 'new';
        const id = isNew ? makeId('wardrobe-item') : state.wardrobeEditingId;
        const name = String(form.querySelector('#bbcf-wardrobe-editor-name')?.value || '').trim() || 'Новый образ';
        const item = {
            id,
            name,
            description: String(form.querySelector('#bbcf-wardrobe-editor-description')?.value || '').trim(),
            path: String(form.querySelector('#bbcf-wardrobe-editor-path')?.value || state.wardrobeTempPath || '').trim(),
            category: form.querySelector('#bbcf-wardrobe-editor-category')?.value || 'full',
            target: form.querySelector('#bbcf-wardrobe-editor-target')?.value || 'all',
            tags: String(form.querySelector('#bbcf-wardrobe-editor-tags')?.value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 8),
            favorite: false,
            createdAt: Date.now(),
        };
        if (!WARDROBE_CATEGORIES[item.category]) item.category = 'full';
        if (!WARDROBE_TARGETS[item.target]) item.target = 'all';
        const index = settings.wardrobeItems.findIndex(entry => entry.id === id);
        if (index >= 0) {
            item.favorite = Boolean(settings.wardrobeItems[index].favorite);
            item.createdAt = settings.wardrobeItems[index].createdAt || item.createdAt;
            settings.wardrobeItems[index] = item;
        } else {
            settings.wardrobeItems.unshift(item);
        }
        state.wardrobeEditingId = null;
        state.wardrobeTempPath = '';
        void saveSettingsImmediately();
        refreshSettingsUi();
    }

    function equipWardrobeItem(id) {
        const settings = getSettings();
        const item = findWardrobeItem(settings, id);
        if (!item) return;
        const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
        if (['top', 'bottom', 'shoes'].includes(item.category)) {
            assignment.mode = 'parts';
            assignment.full = '';
        }
        if (item.category === 'full') {
            assignment.mode = 'full';
            assignment.top = '';
            assignment.bottom = '';
            assignment.shoes = '';
        }
        assignment[item.category] = assignment[item.category] === item.id ? '' : item.id;
        settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
        persistWardrobeAssignments(settings);
        saveSettings();
        refreshSettingsUi();
    }

    function clearWardrobeSlot(category) {
        const settings = getSettings();
        const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
        if (WARDROBE_CATEGORIES[category]) {
            assignment[category] = '';
            settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
            persistWardrobeAssignments(settings);
            saveSettings();
            refreshSettingsUi();
        }
    }

    function deleteWardrobeItem(id) {
        if (!id) return;
        const settings = getSettings();
        const item = findWardrobeItem(settings, id);
        if (!item) return;
        if (!confirm(`Удалить «${item.name}» из гардероба?`)) return;
        settings.wardrobeItems = settings.wardrobeItems.filter(entry => entry.id !== id);
        for (const assignment of Object.values(settings.wardrobeAssignments)) {
            for (const category of WARDROBE_CATEGORY_ORDER) {
                if (assignment?.[category] === id) assignment[category] = '';
            }
        }
        for (const assignments of Object.values(settings.wardrobeProfiles || {})) {
            for (const assignment of Object.values(assignments || {})) {
                for (const category of WARDROBE_CATEGORY_ORDER) {
                    if (assignment?.[category] === id) assignment[category] = '';
                }
            }
        }
        persistWardrobeAssignments(settings);
        saveSettings();
        refreshSettingsUi();
    }

    async function describeWardrobeEditor(form) {
        const button = form.querySelector('#bbcf-wardrobe-editor-describe');
        const textarea = form.querySelector('#bbcf-wardrobe-editor-description');
        const path = String(form.querySelector('#bbcf-wardrobe-editor-path')?.value || state.wardrobeTempPath || '').trim();
        const category = form.querySelector('#bbcf-wardrobe-editor-category')?.value || 'full';
        if (!path) {
            notifyWarning('Сначала добавь картинку вещи.');
            return;
        }
        const originalHtml = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Описываю</span>';
        }
        try {
            const description = await describeWardrobeImage(path, category);
            if (description && textarea) {
                textarea.value = description;
                notifySuccess('Описание готово.');
            }
        } catch (error) {
            notifyError(error?.message || String(error));
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    }

    async function describeWardrobeImage(path, category) {
        const settings = getSettings();
        if (!settings.apiKey) throw new Error('Для описания нужен API key.');
        const model = settings.model || getKnownModelsForProvider(settings.apiType)[0];
        if (!model && settings.apiType !== 'naistera') throw new Error('Выбери модель для описания.');
        const dataUrl = await fetchUrlAsDataUrl(path);
        const parsed = parseImageDataUrl(dataUrl);
        const prompt = getWardrobeDescriptionPrompt(category);
        if (settings.apiType === 'gemini') {
            const endpoint = settings.endpoint || 'https://generativelanguage.googleapis.com';
            const result = await fetchJson(normalizeGeminiGenerateUrl(endpoint, model), {
                method: 'POST',
                headers: geminiApiHeaders({ ...settings, endpoint }),
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: `image/${parsed.subtype}`, data: parsed.base64Data } },
                            { text: prompt },
                        ],
                    }],
                    generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: 220 },
                }),
            });
            const text = (result?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n').trim();
            return cleanWardrobeDescription(text);
        }
        if (settings.apiType === 'openai-chat') {
            if (!settings.endpoint) throw new Error('Для OpenAI chat укажи endpoint.');
            const result = await fetchJson(`${normalizeOpenAiBase(settings.endpoint)}/chat/completions`, {
                method: 'POST',
                headers: imageApiHeaders(settings),
                body: JSON.stringify({
                    model,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: dataUrl } },
                        ],
                    }],
                    max_tokens: 220,
                    stream: false,
                }),
            });
            return cleanWardrobeDescription(result?.choices?.[0]?.message?.content || '');
        }
        throw new Error('Этот тип API не умеет описывать картинки. Используй Gemini или OpenAI chat.');
    }

    function getWardrobeDescriptionPrompt(category) {
        if (category === 'hair') {
            return 'Describe only the hairstyle in this image for an image generation prompt. Mention hair length, shape, styling, ornaments, and visible state. English only. Maximum 35 words. No preamble.';
        }
        if (category === 'accessories') {
            return 'Describe only the accessories in this image for an image generation prompt. Mention object type, material, color, placement, and style. English only. Maximum 45 words. No preamble.';
        }
        return 'Describe the visible outfit in this image for an image generation prompt. Mention garment names, fabric, fit, colors, details, accessories, and clothing condition. English only. Maximum 70 words. No preamble.';
    }

    function cleanWardrobeDescription(value) {
        const text = String(value || '')
            .replace(/^["'`\s]+|["'`\s]+$/g, '')
            .replace(/^(Here is|Here are|This image shows|The image shows|It shows|I see)\s*:?\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) throw new Error('API не вернул описание.');
        return text.slice(0, 700);
    }

    function refreshSettingsUi() {
        document.getElementById(SETTINGS_ID)?.remove();
        createSettingsUi();
    }

    async function withBusyButton(button, busyHtml, task) {
        const previousHtml = button?.innerHTML;
        const previousDisabled = button?.disabled;
        if (button) {
            button.disabled = true;
            button.innerHTML = busyHtml;
        }
        try {
            return await task();
        } finally {
            if (button) {
                button.disabled = previousDisabled;
                button.innerHTML = previousHtml;
            }
        }
    }

    async function saveReferenceImageToFile(dataUrl, slotId) {
        return uploadReferenceImage(dataUrl, slotId, {
            getContext: () => getContext(),
        });
    }

    return {
        bindReferenceSettings,
        bindWardrobeRecoveryButtons,
        openWardrobeModal,
        refreshSettingsUi,
        renderWardrobeModal,
    };
}
