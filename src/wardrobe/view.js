import { escapeHtml } from '../ui/html.js';
import { REFERENCE_SLOTS } from './config.js';
import { getWardrobeActiveItems } from './selectors.js';

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
