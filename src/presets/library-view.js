// The library keeps preset discovery separate from the generation form so the primary workflow stays compact.
import { getActiveDraftPromptPreset } from '../draft/view.js';
import { escapeHtml } from '../ui/html.js';
import { getLayoutPresetById, getStylePresetById } from './resolvers.js';

export function buildActiveComicPresetHtml(settings) {
    const preset = getActiveDraftPromptPreset(settings);
    const style = preset ? getStylePresetById(preset.stylePreset, settings) : getStylePresetById(settings.stylePreset, settings);
    const layout = preset ? getLayoutPresetById(preset.layout, settings) : getLayoutPresetById(settings.layout, settings);
    const title = preset?.label || 'Текущие настройки';
    const status = preset
        ? `${preset.importedAt ? 'Импортированный' : 'Мой пресет'} · ${modeLabel(preset.generationMode)} · ${panelLabel(preset.panelCount)}`
        : 'Пресет не выбран · используется текущая конфигурация';
    const details = [style?.label, layout?.label || layout?.id, preset?.recommendations?.model].filter(Boolean).join(' · ');
    return `
        <div class="bbcf-active-preset-card${preset ? ' is-selected' : ''}">
            <span class="bbcf-active-preset-icon"><i class="fa-solid fa-palette"></i></span>
            <span class="bbcf-active-preset-copy">
                <strong>${escapeHtml(title)}</strong>
                <small>${escapeHtml(status)}</small>
                ${details ? `<small class="bbcf-muted">${escapeHtml(details)}</small>` : ''}
            </span>
            <div class="bbcf-active-preset-actions">
                <button class="menu_button bbcf-primary" type="button" data-bbcf-open-preset-library><i class="fa-solid fa-layer-group"></i><span>Библиотека</span></button>
                <details class="bbcf-preset-action-menu">
                    <summary class="menu_button" title="Действия с пресетом" aria-label="Действия с пресетом"><i class="fa-solid fa-ellipsis"></i></summary>
                    <div class="bbcf-preset-action-popover">
                        <button type="button" data-bbcf-preset-quick-action="create"><i class="fa-solid fa-bookmark"></i><span>Сохранить текущие</span></button>
                        <button type="button" data-bbcf-preset-quick-action="export"><i class="fa-solid fa-file-export"></i><span>Экспортировать текущие</span></button>
                    </div>
                </details>
            </div>
        </div>
    `;
}

export function buildPresetLibraryHtml(settings, { filter = 'all', query = '' } = {}) {
    return `
        <div class="bbcf-preset-library">
            <header class="bbcf-preset-library-header">
                <span>
                    <strong><i class="fa-solid fa-palette"></i> Пресеты комикса</strong>
                    <small>Готовый стиль, макет и правила генерации в одном наборе</small>
                </span>
                <div class="bbcf-preset-library-header-actions">
                    <button class="menu_button" type="button" data-bbcf-library-create><i class="fa-solid fa-plus"></i><span>Создать из текущих</span></button>
                    <button class="menu_button" type="button" data-bbcf-library-import><i class="fa-solid fa-file-import"></i><span>Импортировать</span></button>
                    <input type="file" data-bbcf-library-import-file accept=".json,.bbcf-preset.json,application/json" hidden>
                </div>
            </header>
            <div class="bbcf-preset-library-toolbar">
                <div class="bbcf-preset-library-filters" role="group" aria-label="Фильтр пресетов">
                    ${filterButton('all', 'Все', filter)}
                    ${filterButton('mine', 'Мои', filter)}
                    ${filterButton('imported', 'Импортированные', filter)}
                </div>
                <label class="bbcf-preset-library-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input class="text_pole" type="search" data-bbcf-library-search value="${escapeHtml(query)}" placeholder="Поиск пресета">
                </label>
            </div>
            <div class="bbcf-preset-library-grid">
                ${buildPresetLibraryCardsHtml(settings, { filter, query })}
            </div>
        </div>
    `;
}

export function buildPresetLibraryCardsHtml(settings, { filter = 'all', query = '' } = {}) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    const presets = settings.draftPromptPresets.filter(preset => {
        const imported = Boolean(preset.importedAt);
        if (filter === 'mine' && imported) return false;
        if (filter === 'imported' && !imported) return false;
        if (!normalizedQuery) return true;
        return [preset.label, preset.description, preset.author, ...(preset.tags || []), preset.recommendations?.model]
            .some(value => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
    });
    return presets.length
        ? presets.map(preset => buildPresetCardHtml(settings, preset)).join('')
        : buildEmptyLibraryHtml(settings, filter, normalizedQuery);
}

export function buildPresetDetailsHtml(settings, preset) {
    const style = getStylePresetById(preset.stylePreset, settings);
    const layout = getLayoutPresetById(preset.layout, settings);
    const recommendation = [preset.recommendations?.apiType, preset.recommendations?.model, preset.recommendations?.size, preset.recommendations?.quality]
        .filter(Boolean).join(' · ');
    return `
        <div class="bbcf-preset-details">
            <header>
                <span class="bbcf-preset-card-icon ${preset.importedAt ? 'is-imported' : ''}"><i class="fa-solid ${preset.importedAt ? 'fa-file-arrow-down' : 'fa-palette'}"></i></span>
                <span><strong>${escapeHtml(preset.label)}</strong><small>${preset.importedAt ? 'Импортированный пресет' : 'Мой пресет'}</small></span>
            </header>
            ${preset.description ? `<p>${escapeHtml(preset.description)}</p>` : ''}
            ${preset.author ? `<p class="bbcf-muted">Автор: ${escapeHtml(preset.author)}</p>` : ''}
            <div class="bbcf-preset-details-grid">
                <span><small>Режим</small><b>${escapeHtml(modeLabel(preset.generationMode))}</b></span>
                <span><small>Панели</small><b>${escapeHtml(panelLabel(preset.panelCount))}</b></span>
                <span><small>Стиль</small><b>${escapeHtml(style?.label || 'Не найден')}</b></span>
                <span><small>Макет</small><b>${escapeHtml(layout?.label || layout?.id || 'Не найден')}</b></span>
            </div>
            ${recommendation ? `<p class="bbcf-preset-recommendation"><b>Рекомендация:</b> ${escapeHtml(recommendation)}</p>` : ''}
            ${detailsSection('AI-черновик', preset.draftPrompt)}
            ${detailsSection('Дополнительные инструкции', preset.customPrompt)}
            ${detailsSection('Negative prompt', preset.negativePrompt)}
        </div>
    `;
}

function buildPresetCardHtml(settings, preset) {
    const style = getStylePresetById(preset.stylePreset, settings);
    const layout = getLayoutPresetById(preset.layout, settings);
    const imported = Boolean(preset.importedAt);
    const active = settings.activeDraftPromptPresetId === preset.id;
    const description = preset.description || `${style?.label || 'Сохранённый стиль'} · ${layout?.label || layout?.id || 'сохранённый макет'}`;
    const tags = (preset.tags || []).slice(0, 4);
    const model = preset.recommendations?.model;
    return `
        <article class="bbcf-preset-library-card${active ? ' is-active' : ''}" data-bbcf-library-card="${escapeHtml(preset.id)}">
            <div class="bbcf-preset-library-card-head">
                <span class="bbcf-preset-card-icon ${imported ? 'is-imported' : ''}"><i class="fa-solid ${imported ? 'fa-file-arrow-down' : 'fa-palette'}"></i></span>
                <span class="bbcf-preset-library-card-title">
                    <strong>${escapeHtml(preset.label)}</strong>
                    <small>${imported ? 'Импортированный' : 'Мой пресет'}${preset.author ? ` · ${escapeHtml(preset.author)}` : ''}</small>
                </span>
                ${active ? '<span class="bbcf-preset-active-badge"><i class="fa-solid fa-check"></i> Активен</span>' : ''}
            </div>
            <p>${escapeHtml(description)}</p>
            <div class="bbcf-preset-card-tags">
                ${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}
                ${model ? `<span><i class="fa-solid fa-microchip"></i> ${escapeHtml(model)}</span>` : ''}
            </div>
            <div class="bbcf-preset-card-meta">
                <span><i class="fa-solid fa-table-cells-large"></i> ${escapeHtml(panelLabel(preset.panelCount))}</span>
                <span><i class="fa-solid fa-bolt"></i> ${escapeHtml(modeLabel(preset.generationMode))}</span>
            </div>
            <footer>
                <button class="menu_button bbcf-primary" type="button" data-bbcf-library-action="apply" data-preset-id="${escapeHtml(preset.id)}" ${active ? 'disabled' : ''}><i class="fa-solid fa-check"></i><span>${active ? 'Используется' : 'Использовать'}</span></button>
                <details class="bbcf-preset-action-menu">
                    <summary class="menu_button" title="Действия" aria-label="Действия с пресетом"><i class="fa-solid fa-ellipsis-vertical"></i></summary>
                    <div class="bbcf-preset-action-popover">
                        ${menuAction('view', preset.id, 'fa-eye', 'Посмотреть')}
                        ${menuAction('update', preset.id, 'fa-arrows-rotate', 'Обновить текущими')}
                        ${menuAction('rename', preset.id, 'fa-pen', 'Переименовать')}
                        ${menuAction('duplicate', preset.id, 'fa-copy', 'Дублировать')}
                        ${menuAction('export', preset.id, 'fa-file-export', 'Экспортировать')}
                        ${menuAction('delete', preset.id, 'fa-trash-can', 'Удалить', true)}
                    </div>
                </details>
            </footer>
        </article>
    `;
}

function filterButton(value, label, active) {
    return `<button type="button" class="${active === value ? 'is-active' : ''}" data-bbcf-library-filter="${value}" aria-pressed="${active === value}">${label}</button>`;
}

function menuAction(action, id, icon, label, danger = false) {
    return `<button type="button" class="${danger ? 'is-danger' : ''}" data-bbcf-library-action="${action}" data-preset-id="${escapeHtml(id)}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`;
}

function buildEmptyLibraryHtml(settings, filter, query) {
    if (!settings.draftPromptPresets.length) {
        return '<div class="bbcf-preset-library-empty"><i class="fa-solid fa-layer-group"></i><strong>Библиотека пока пуста</strong><span>Создай пресет из текущих настроек или импортируй готовый файл.</span></div>';
    }
    const reason = query ? 'По запросу ничего не найдено.' : filter === 'imported' ? 'Импортированных пресетов пока нет.' : 'В этой категории пока нет пресетов.';
    return `<div class="bbcf-preset-library-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>Нет результатов</strong><span>${reason}</span></div>`;
}

function detailsSection(title, value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return `<details><summary>${title}</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function modeLabel(mode) {
    return mode === 'single' ? 'Экономный режим' : 'По отдельным панелям';
}

function panelLabel(value) {
    const count = Number(value) || 1;
    return `${count} ${count === 1 ? 'панель' : count >= 2 && count <= 4 ? 'панели' : 'панелей'}`;
}
