import { escapeHtml, option } from '../ui/html.js';
import { REFERENCE_SLOTS, WARDROBE_CATEGORIES, WARDROBE_TARGETS } from './config.js';
import { normalizeWardrobeAssignment } from './normalizers.js';
import {
    findWardrobeItem,
    getAllowedWardrobeCategories,
    getTargetForOwner,
    getWardrobeActiveItems,
    getWardrobeCategoryIcon,
} from './selectors.js';

export function renderWardrobeShellHtml() {
    return `
        <div class="bbcf-wardrobe-backdrop" data-bbcf-wardrobe-close></div>
        <div class="bbcf-wardrobe-modal" role="dialog" aria-modal="true">
            <header class="bbcf-wardrobe-modal-header">
                <div>
                    <h3><i class="fa-solid fa-shirt"></i> Гардероб Comic Forge</h3>
                    <p>Сохраняй сеты, детали одежды и аксессуары. Потом надевай их на нужного героя.</p>
                </div>
                <button type="button" class="bbcf-modal-close" title="Закрыть" data-bbcf-wardrobe-close><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="bbcf-wardrobe-modal-body"></div>
        </div>
    `;
}

export function renderWardrobeModalHtml({
    settings,
    owner,
    assignment,
    category,
    tag,
    tags,
    editingId,
    tempPath,
    visibleItems,
}) {
    return `
        <aside class="bbcf-wardrobe-closet">
            <div class="bbcf-wardrobe-tabs">
                ${REFERENCE_SLOTS.map(slot => `<button type="button" class="${slot.id === owner.id ? 'active' : ''}" data-bbcf-wardrobe-owner="${escapeHtml(slot.id)}">${escapeHtml(slot.label)}</button>`).join('')}
            </div>
            <div class="bbcf-wardrobe-mode">
                <button type="button" class="${assignment.mode === 'full' ? 'active' : ''}" data-bbcf-wardrobe-mode="full"><i class="fa-solid fa-user"></i><span>Сет</span></button>
                <button type="button" class="${assignment.mode === 'parts' ? 'active' : ''}" data-bbcf-wardrobe-mode="parts"><i class="fa-solid fa-layer-group"></i><span>По частям</span></button>
            </div>
            <div class="bbcf-wardrobe-slots">
                ${buildWardrobeSlotsHtml(settings, owner.id)}
            </div>
        </aside>
        <main class="bbcf-wardrobe-library">
            <div class="bbcf-wardrobe-library-top">
                <div class="bbcf-wardrobe-filter">
                    ${buildWardrobeCategoryFiltersHtml(assignment, category)}
                </div>
                <div class="bbcf-wardrobe-library-actions">
                    <button type="button" class="menu_button" data-bbcf-wardrobe-recover title="Найти гардеробные картинки без записи в библиотеке"><i class="fa-solid fa-rotate-left"></i><span>Восстановить</span></button>
                    <button type="button" class="menu_button bbcf-primary" id="bbcf-wardrobe-new"><i class="fa-solid fa-plus"></i><span>Новая вещь</span></button>
                </div>
            </div>
            ${buildWardrobeTagFiltersHtml(tags, tag)}
            ${editingId ? buildWardrobeEditorHtml(settings, owner.id, category, editingId, tempPath) : ''}
            <div class="bbcf-wardrobe-items">
                ${visibleItems.length ? visibleItems.map(item => buildWardrobeItemCardHtml(settings, owner.id, item)).join('') : '<div class="bbcf-wardrobe-empty-large"><i class="fa-solid fa-shirt"></i><span>Здесь пока пусто</span></div>'}
            </div>
        </main>
    `;
}

function buildWardrobeCategoryFiltersHtml(assignment, selectedCategory) {
    const allowed = getAllowedWardrobeCategories(assignment.mode);
    const chips = [{ id: 'all', label: 'Все' }, ...allowed.map(id => ({ id, label: WARDROBE_CATEGORIES[id] }))];
    return chips.map(chip => `<button type="button" class="${selectedCategory === chip.id ? 'active' : ''}" data-bbcf-wardrobe-category="${escapeHtml(chip.id)}">${escapeHtml(chip.label)}</button>`).join('');
}

function buildWardrobeTagFiltersHtml(tags, selectedTag) {
    if (!tags.length) return '';
    return `
        <div class="bbcf-wardrobe-tag-filter">
            <button type="button" class="${selectedTag === 'all' ? 'active' : ''}" data-bbcf-wardrobe-tag="all">Все теги</button>
            ${tags.map(tag => `<button type="button" class="${selectedTag === tag ? 'active' : ''}" data-bbcf-wardrobe-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
        </div>
    `;
}

function buildWardrobeSlotsHtml(settings, ownerId) {
    const assignment = settings.wardrobeAssignments[ownerId] || normalizeWardrobeAssignment();
    const categories = assignment.mode === 'parts'
        ? ['top', 'bottom', 'shoes', 'accessories', 'hair']
        : ['full', 'accessories', 'hair'];
    return categories.map(category => {
        const item = findWardrobeItem(settings, assignment[category]);
        return `
            <div class="bbcf-wardrobe-slot ${item ? 'filled' : ''}">
                <div class="bbcf-wardrobe-slot-img">
                    ${item?.path ? `<img src="${escapeHtml(item.path)}" alt="">` : `<i class="fa-solid ${getWardrobeCategoryIcon(category)}"></i>`}
                </div>
                <div class="bbcf-wardrobe-slot-info">
                    <span>${escapeHtml(WARDROBE_CATEGORIES[category])}</span>
                    <strong>${escapeHtml(item?.name || 'пусто')}</strong>
                </div>
                <button type="button" title="Снять" data-bbcf-wardrobe-clear="${escapeHtml(category)}" ${item ? '' : 'disabled'}><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }).join('');
}

function buildWardrobeItemCardHtml(settings, ownerId, item) {
    const assignment = settings.wardrobeAssignments[ownerId] || normalizeWardrobeAssignment();
    const active = assignment[item.category] === item.id;
    return `
        <article class="bbcf-wardrobe-item ${active ? 'active' : ''}" data-bbcf-wardrobe-item="${escapeHtml(item.id)}">
            <div class="bbcf-wardrobe-item-image">
                ${item.path ? `<img src="${escapeHtml(item.path)}" alt="${escapeHtml(item.name)}" loading="lazy">` : `<i class="fa-solid ${getWardrobeCategoryIcon(item.category)}"></i>`}
                <span>${escapeHtml(WARDROBE_CATEGORIES[item.category] || 'Вещь')}</span>
            </div>
            <div class="bbcf-wardrobe-item-body">
                <strong>${escapeHtml(item.name)}</strong>
                <p>${escapeHtml(item.description || 'Описание можно добавить позже.')}</p>
                ${item.tags?.length ? `<div class="bbcf-wardrobe-card-tags">${item.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                <div class="bbcf-wardrobe-card-actions">
                    <button type="button" class="menu_button bbcf-wardrobe-equip" data-bbcf-wardrobe-equip="${escapeHtml(item.id)}"><i class="fa-solid ${active ? 'fa-check' : 'fa-person-dress'}"></i><span>${active ? 'Надето' : 'Надеть'}</span></button>
                    <button type="button" class="menu_button bbcf-icon-button" title="Редактировать" data-bbcf-wardrobe-edit="${escapeHtml(item.id)}"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="menu_button bbcf-icon-button" title="Удалить" data-bbcf-wardrobe-delete="${escapeHtml(item.id)}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </article>
    `;
}

function buildWardrobeEditorHtml(settings, ownerId, selectedCategory, editingId, tempPath) {
    const isNew = editingId === 'new';
    const item = isNew ? null : findWardrobeItem(settings, editingId);
    const path = item?.path || tempPath || '';
    const assignment = settings.wardrobeAssignments[ownerId] || normalizeWardrobeAssignment();
    const allowedCategories = getAllowedWardrobeCategories(assignment.mode);
    const category = item?.category || (allowedCategories.includes(selectedCategory) ? selectedCategory : allowedCategories[0] || 'full');
    const target = item?.target || getTargetForOwner(ownerId);
    return `
        <form class="bbcf-wardrobe-editor" id="bbcf-wardrobe-editor">
            <div class="bbcf-wardrobe-editor-preview ${path ? 'has-image' : ''}">
                ${path ? `<img src="${escapeHtml(path)}" alt="">` : '<i class="fa-solid fa-camera"></i>'}
                <div class="bbcf-wardrobe-editor-image-actions">
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-upload"><i class="fa-solid fa-upload"></i><span>Картинка</span></button>
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-paste" title="Вставить изображение из буфера"><i class="fa-solid fa-paste"></i><span>Вставить</span></button>
                </div>
                <input type="file" accept="image/*" id="bbcf-wardrobe-editor-file" hidden>
                <input type="hidden" id="bbcf-wardrobe-editor-path" value="${escapeHtml(path)}">
            </div>
            <div class="bbcf-wardrobe-editor-fields">
                <input class="text_pole" id="bbcf-wardrobe-editor-name" type="text" value="${escapeHtml(item?.name || '')}" placeholder="Название: летний сет, школьная форма, ленты">
                <div class="bbcf-grid-2">
                    <select class="text_pole" id="bbcf-wardrobe-editor-category">
                        ${allowedCategories.map(key => option(key, category, WARDROBE_CATEGORIES[key])).join('')}
                    </select>
                    <select class="text_pole" id="bbcf-wardrobe-editor-target">
                        ${Object.entries(WARDROBE_TARGETS).map(([key, label]) => option(key, target, label)).join('')}
                    </select>
                </div>
                <textarea class="text_pole" id="bbcf-wardrobe-editor-description" rows="3" placeholder="Коротко опиши одежду, ткань, цвет, аксессуары и состояние образа.">${escapeHtml(item?.description || '')}</textarea>
                <input class="text_pole" id="bbcf-wardrobe-editor-tags" type="text" value="${escapeHtml((item?.tags || []).join(', '))}" placeholder="Теги для поиска: вечер, дом, бой">
                <div class="bbcf-wardrobe-editor-actions">
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-describe" ${path ? '' : 'disabled'}><i class="fa-solid fa-pen-nib"></i><span>Описать</span></button>
                    <button class="menu_button bbcf-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить</span></button>
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-cancel"><i class="fa-solid fa-xmark"></i><span>Отмена</span></button>
                </div>
            </div>
        </form>
    `;
}

export function buildReferenceSettingsHtml(settings) {
    return settings.references.map(ref => `
        <div class="bbcf-ref-card" data-bbcf-ref="${escapeHtml(ref.id)}" tabindex="0">
            <div class="bbcf-ref-thumb ${ref.path ? 'has-image' : ''}">
                ${ref.path ? `<img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.label)}" data-bbcf-ref-image>` : '<i class="fa-solid fa-user"></i>'}
            </div>
            <div class="bbcf-ref-main">
                <label class="checkbox_label">
                    <input type="checkbox" class="bbcf-ref-enabled" ${ref.enabled ? 'checked' : ''}>
                    <span>${escapeHtml(ref.label)}</span>
                </label>
                <input class="text_pole bbcf-ref-name" type="text" value="${escapeHtml(ref.name)}" placeholder="Имя для промпта">
                <textarea class="text_pole bbcf-ref-description" rows="2" placeholder="Краткое описание внешности, если рефы недоступны">${escapeHtml(ref.description)}</textarea>
                <div class="bbcf-ref-actions">
                    <button class="menu_button bbcf-ref-upload" type="button"><i class="fa-solid fa-upload"></i><span>Загрузить</span></button>
                    <button class="menu_button bbcf-ref-paste" type="button" title="Вставить изображение из буфера"><i class="fa-solid fa-paste"></i><span>Вставить</span></button>
                    <button class="menu_button bbcf-ref-clear" type="button" ${ref.path ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i></button>
                    <input class="bbcf-ref-file" type="file" accept="image/*" hidden>
                </div>
            </div>
        </div>
    `).join('');
}

export function buildWardrobeSummaryHtml(settings) {
    if (!settings.wardrobeItems.length) {
        return '<div class="bbcf-wardrobe-empty"><i class="fa-solid fa-shirt"></i><span>Гардероб пока пуст</span></div>';
    }
    return REFERENCE_SLOTS.map(owner => {
        const active = getWardrobeActiveItems(settings, owner.id);
        const preview = active.slice(0, 3).map(item => `
            <span class="bbcf-wardrobe-mini-thumb" title="${escapeHtml(item.name)}">
                ${item.path ? `<img src="${escapeHtml(item.path)}" alt="">` : '<i class="fa-solid fa-shirt"></i>'}
            </span>
        `).join('');
        return `
            <div class="bbcf-wardrobe-owner-mini ${active.length ? 'has-outfit' : ''}">
                <strong>${escapeHtml(owner.label)}</strong>
                <div>${preview || '<span class="bbcf-muted">нет образа</span>'}</div>
            </div>
        `;
    }).join('');
}
