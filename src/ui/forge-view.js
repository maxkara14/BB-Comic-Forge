import { MAX_PANELS } from '../core/constants.js';
import { buildDraftPromptPresetOptionsHtml, getActiveDraftPromptPreset } from '../draft/view.js';
import { getStylePresetById } from '../presets/resolvers.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from '../presets/view.js';
import { escapeHtml, option } from './html.js';

export function renderForgeHtml(settings, savedDraft) {
    const activeDraftPromptPreset = getActiveDraftPromptPreset(settings);
    return `
        <div class="bbcf-modal-backdrop" data-bbcf-close></div>
        <div class="bbcf-modal" role="dialog" aria-modal="true">
            <header class="bbcf-modal-header">
                <h3 class="bbcf-modal-title"><i class="fa-solid fa-book-open"></i> BB Comic Forge <span class="bbcf-muted">standalone</span></h3>
                <div class="bbcf-modal-header-actions">
                    <button class="bbcf-modal-action bbcf-modal-minimize" type="button" title="Свернуть кузницу, генерация продолжится" aria-label="Свернуть кузницу" id="bbcf-modal-minimize"><i class="fa-solid fa-window-minimize"></i><span>Свернуть</span></button>
                    <button class="bbcf-modal-action bbcf-modal-dismiss" type="button" title="Закрыть окно кузницы" aria-label="Закрыть кузницу" data-bbcf-close><i class="fa-solid fa-xmark"></i><span>Закрыть</span></button>
                </div>
            </header>
            <div class="bbcf-mobile-view-tabs" role="tablist" aria-label="Раздел кузницы">
                <button type="button" class="is-active" role="tab" aria-selected="true" aria-controls="bbcf-draft-form" data-bbcf-mobile-view="editor"><i class="fa-solid fa-pen-to-square"></i><span>Редактор</span></button>
                <button type="button" role="tab" aria-selected="false" aria-controls="bbcf-preview-panel" data-bbcf-mobile-view="preview"><i class="fa-solid fa-image"></i><span>Превью</span></button>
            </div>
            <div class="bbcf-modal-body">
                <form class="bbcf-form" id="bbcf-draft-form">
                    <div class="bbcf-form-content">
                    <section class="bbcf-recipe-bar">
                        <div class="bbcf-recipe-icon"><i class="fa-solid fa-palette"></i></div>
                        <div class="bbcf-recipe-copy">
                            <span class="bbcf-eyebrow">Текущий рецепт</span>
                            <strong id="bbcf-forge-recipe-title">${escapeHtml(activeDraftPromptPreset?.label || getStylePresetById(savedDraft.stylePreset, settings)?.label || 'Текущие настройки')}</strong>
                            <small id="bbcf-forge-recipe-meta"></small>
                        </div>
                        <span class="bbcf-status-chip is-ready"><i class="fa-solid fa-check"></i><span>Готово</span></span>
                    </section>
                    <details class="bbcf-workflow-card bbcf-workflow-page" open>
                        <summary>
                            <span class="bbcf-workflow-number">1</span>
                            <span class="bbcf-workflow-heading"><strong>Страница</strong><small id="bbcf-forge-page-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-mode">Режим генерации</label>
                            <select id="bbcf-draft-mode" class="text_pole">
                                ${option('panels', savedDraft.generationMode, 'Качественно: каждая панель отдельно')}
                                ${option('single', savedDraft.generationMode, 'Экономно: весь комикс одним запросом')}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-title">Название страницы</label>
                            <input id="bbcf-draft-title" class="text_pole" type="text" value="${escapeHtml(savedDraft.title)}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-count">Панелей</label>
                            <input id="bbcf-draft-count" class="text_pole" type="number" min="1" max="${MAX_PANELS}" value="${savedDraft.panelCount}">
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-layout">Макет</label>
                            <select id="bbcf-draft-layout" class="text_pole">
                                ${buildLayoutOptionsHtml(settings, savedDraft.layout)}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-style">Стиль</label>
                            <select id="bbcf-draft-style" class="text_pole">
                                ${buildStyleOptionsHtml(settings, savedDraft.stylePreset)}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-insert-mode">Отправка</label>
                            <select id="bbcf-draft-insert-mode" class="text_pole">
                                ${option('new', savedDraft.insertMode, 'Новым сообщением')}
                                ${option('append_last', savedDraft.insertMode, 'В последнее сообщение')}
                            </select>
                        </div>
                    </div>
                    <details class="bbcf-advanced">
                        <summary><i class="fa-solid fa-palette"></i><span>Заготовки стилей и макетов</span></summary>
                        <div class="bbcf-advanced-body bbcf-preset-examples">
                            <div class="bbcf-preset-list" data-bbcf-preset-list>
                                ${buildStyleExamplesHtml(settings)}
                                ${buildLayoutExamplesHtml(settings)}
                            </div>
                            <div class="bbcf-preset-save-grid">
                                <div class="bbcf-preset-save-card">
                                    <b>Сохранить стиль</b>
                                    <input id="bbcf-draft-save-style-name" class="text_pole" type="text" placeholder="Название стиля">
                                    <textarea id="bbcf-draft-save-style-prompt" class="text_pole" rows="4" placeholder="Линия, цвет, свет, детализация, настроение."></textarea>
                                    <button class="menu_button" type="button" id="bbcf-draft-save-style"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить стиль</span></button>
                                </div>
                                <div class="bbcf-preset-save-card">
                                    <b>Сохранить макет</b>
                                    <input id="bbcf-draft-save-layout-name" class="text_pole" type="text" placeholder="Название макета">
                                    <input id="bbcf-draft-save-layout-pattern" class="text_pole" type="text" placeholder="9:16, 1:1, 16:9, 3:4">
                                    <input id="bbcf-draft-save-layout-intent" class="text_pole" type="text" placeholder="Коротко: какой ритм у страницы">
                                    <button class="menu_button" type="button" id="bbcf-draft-save-layout"><i class="fa-solid fa-table-cells-large"></i><span>Сохранить макет</span></button>
                                </div>
                            </div>
                        </div>
                    </details>
                        </div>
                    </details>
                    <details class="bbcf-workflow-card bbcf-workflow-scene" open>
                        <summary>
                            <span class="bbcf-workflow-number">2</span>
                            <span class="bbcf-workflow-heading"><strong>Сцена</strong><small>Опиши вручную или собери из текущего чата</small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field bbcf-scene-field">
                        <label for="bbcf-draft-scene">Что происходит на странице</label>
                        <textarea id="bbcf-draft-scene" class="text_pole" rows="5" placeholder="Что должно произойти на странице. Можно писать по-русски.">${escapeHtml(savedDraft.scene)}</textarea>
                    </div>
                            <button class="menu_button bbcf-ai-draft-action" type="button" id="bbcf-ai-draft"><i class="fa-solid fa-scroll"></i><span>Черновик из чата</span></button>
                        </div>
                    </details>
                    <div class="bbcf-workflow-stack">
                    <details class="bbcf-workflow-card">
                        <summary>
                            <span class="bbcf-workflow-number">3</span>
                            <span class="bbcf-workflow-heading"><strong>Персонажи</strong><small id="bbcf-forge-character-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field">
                        <label for="bbcf-draft-lock">Описание персонажей</label>
                        <textarea id="bbcf-draft-lock" class="text_pole" rows="4">${escapeHtml(savedDraft.characterLock)}</textarea>
                    </div>
                        </div>
                    </details>
                    <details class="bbcf-workflow-card" open>
                        <summary>
                            <span class="bbcf-workflow-number">4</span>
                            <span class="bbcf-workflow-heading"><strong>Панели и текст</strong><small id="bbcf-forge-panel-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field">
                        <label for="bbcf-draft-notes">План панелей, по одной строке</label>
                        <textarea id="bbcf-draft-notes" class="text_pole" rows="5" placeholder="1. Общий план коридора&#10;2. Крупный план лица&#10;3. Комедийный insert">${escapeHtml(savedDraft.panelNotes)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-bubbles">Реплики для модели: panel | type | position | speaker | text</label>
                        <textarea id="bbcf-draft-bubbles" class="text_pole" rows="4" placeholder="1|speech|top-left|Dr. Miyamoto|Ты правда это сказала?&#10;2|thought|bottom-right|Akiko|Сердце сбилось с ритма">${escapeHtml(savedDraft.bubbles)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-inserts">Вставки: panel | type | position | text</label>
                        <textarea id="bbcf-draft-inserts" class="text_pole" rows="3" placeholder="3|detail|bottom-left|крупный план руки на плече&#10;4|chibi|bottom-right|маленькая сердитая чиби-реакция с табличкой">${escapeHtml(savedDraft.inserts)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-sfx">SFX: panel | text</label>
                        <textarea id="bbcf-draft-sfx" class="text_pole" rows="2" placeholder="3|БАХ">${escapeHtml(savedDraft.sfx)}</textarea>
                    </div>
                        </div>
                    </details>
                    <details class="bbcf-workflow-card">
                        <summary>
                            <span class="bbcf-workflow-number"><i class="fa-solid fa-sliders"></i></span>
                            <span class="bbcf-workflow-heading"><strong>Тонкая настройка</strong><small id="bbcf-forge-tuning-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-field">
                            <label for="bbcf-forge-draft-prompt-preset">Набор черновика</label>
                            <select id="bbcf-forge-draft-prompt-preset" class="text_pole">
                                ${buildDraftPromptPresetOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-forge-draft-prompt-preset-name">Название набора</label>
                            <input id="bbcf-forge-draft-prompt-preset-name" class="text_pole" type="text" value="${escapeHtml(activeDraftPromptPreset?.label || '')}" placeholder="Например: нежная акварель">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-forge-save-draft-prompt-preset"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-forge-delete-draft-prompt-preset" ${activeDraftPromptPreset ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-custom-style">Дополнительные инструкции к генерации</label>
                        <textarea id="bbcf-draft-custom-style" class="text_pole" rows="3" placeholder="Разовые правки поверх выбранного стиля: свет, ракурс, темп, материалы.">${escapeHtml(savedDraft.customPrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-negative">Negative Prompt</label>
                        <textarea id="bbcf-draft-negative" class="text_pole" rows="3">${escapeHtml(savedDraft.negativePrompt)}</textarea>
                    </div>
                        </div>
                    </details>
                    </div>
                    </div>
                    <div class="bbcf-toolbar bbcf-generate-toolbar">
                        <span class="bbcf-generate-ready"><i class="fa-solid fa-circle-check"></i><span>Черновик сохраняется автоматически</span></span>
                        <button class="menu_button bbcf-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Сгенерировать страницу</span></button>
                    </div>
                </form>
                <div class="bbcf-preview" id="bbcf-preview-panel">
                    <div class="bbcf-preview-actions">
                        <button class="menu_button bbcf-primary bbcf-hidden" type="button" id="bbcf-send-to-chat" title="Отправить текущий комикс в чат"><i class="fa-solid fa-paper-plane"></i><span>Отправить в чат</span></button>
                        <button class="menu_button" type="button" id="bbcf-save-page-image" title="Сохранить весь оформленный комикс одним PNG"><i class="fa-solid fa-file-image"></i><span>Сохранить PNG</span></button>
                        <button class="menu_button" type="button" id="bbcf-show-history" title="Показать последние созданные комиксы"><i class="fa-solid fa-images"></i><span>История</span></button>
                        <button class="menu_button bbcf-hidden" type="button" id="bbcf-close-history-preview"><i class="fa-solid fa-arrow-left"></i><span>К текущему превью</span></button>
                        <button class="menu_button" type="button" id="bbcf-clear-preview" title="Очистить текущее превью"><i class="fa-solid fa-eraser"></i><span>Очистить превью</span></button>
                    </div>
                    <details class="bbcf-final-prompt" id="bbcf-final-prompt-details">
                        <summary><i class="fa-solid fa-terminal"></i><span>Prompt изображения</span></summary>
                        <div class="bbcf-final-prompt-body">
                            <div class="bbcf-final-prompt-actions">
                                <button class="menu_button" type="button" id="bbcf-refresh-final-prompt"><i class="fa-solid fa-rotate"></i><span>Обновить</span></button>
                                <button class="menu_button" type="button" id="bbcf-copy-final-prompt"><i class="fa-solid fa-copy"></i><span>Копировать всё</span></button>
                            </div>
                            <div class="bbcf-final-prompt-note">Показывает текстовый prompt image-запроса. Референс-картинки прикладываются отдельно, если провайдер их поддерживает.</div>
                            <div id="bbcf-final-prompt-list" class="bbcf-final-prompt-list">
                                <pre class="bbcf-final-prompt-placeholder">Открой блок, чтобы собрать prompt изображения из текущего черновика.</pre>
                            </div>
                        </div>
                    </details>
                    <div id="bbcf-history-panel" class="bbcf-history bbcf-hidden"></div>
                    <div id="bbcf-progress" class="bbcf-progress"></div>
                    <div id="bbcf-preview-content">
                        <p class="bbcf-hint">Готовая страница появится здесь.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}
