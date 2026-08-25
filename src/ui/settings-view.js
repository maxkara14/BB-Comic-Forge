import { MAX_CONCURRENCY, MAX_PANELS, MAX_PREVIOUS_CONTEXT_IMAGES } from '../core/constants.js';
import { buildDraftPromptPresetOptionsHtml, getActiveDraftPromptPreset } from '../draft/view.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from '../presets/view.js';
import {
    buildDraftConnectionProfileOptionsHtml,
    buildDraftModelOptionsHtml,
    buildImageConnectionProfileOptionsHtml,
    buildModelOptionsHtml,
    getActiveDraftConnectionProfile,
    getActiveImageConnectionProfile,
    getDraftEndpointPlaceholder,
    getDraftModelPlaceholder,
    getEndpointPlaceholder,
} from '../providers/view.js';
import { buildReferenceSettingsHtml, buildWardrobeSummaryHtml } from '../wardrobe/view.js';
import { escapeHtml, option } from './html.js';

export function renderSettingsHtml(settings, { draftTavernProfileOptionsHtml = '' } = {}) {
    const activeImageConnectionProfile = getActiveImageConnectionProfile(settings);
    const activeDraftConnectionProfile = getActiveDraftConnectionProfile(settings);
    const activeDraftPromptPreset = getActiveDraftPromptPreset(settings);
    return `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b><i class="fa-solid fa-book-open"></i> BB Comic Forge</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="bbcf-settings-body">
                <section class="bbcf-section bbcf-dashboard">
                    <div class="bbcf-dashboard-heading">
                        <div>
                            <span class="bbcf-eyebrow">Быстрый запуск</span>
                            <h4 class="bbcf-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i><span data-bbcf-dashboard-heading>Готово к работе</span></h4>
                        </div>
                        <label class="bbcf-toggle-pill"><input type="checkbox" id="bbcf-enabled" ${settings.enabled ? 'checked' : ''}><span data-bbcf-enabled-label>${settings.enabled ? 'Включено' : 'Выключено'}</span></label>
                    </div>
                    <div class="bbcf-dashboard-grid">
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="images" data-bbcf-open-settings="bbcf-image-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-image"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Генерация изображений</strong><small data-bbcf-dashboard-meta></small></span>
                            <span data-bbcf-dashboard-status></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="draft" data-bbcf-open-settings="bbcf-draft-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-scroll"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>AI-черновик</strong><small data-bbcf-dashboard-meta></small></span>
                            <span data-bbcf-dashboard-status></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="recipe" data-bbcf-open-settings="bbcf-page-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-palette"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Настройки страницы</strong><small data-bbcf-dashboard-meta></small></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="references" data-bbcf-open-settings="bbcf-reference-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-user-group"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Персонажи и гардероб</strong><small data-bbcf-dashboard-meta></small></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                    </div>
                    <button class="menu_button bbcf-primary bbcf-dashboard-open" type="button" id="bbcf-open-modal"><i class="fa-solid fa-book-open"></i><span>Открыть кузницу</span></button>
                    <details class="bbcf-dashboard-preferences">
                        <summary><i class="fa-solid fa-sliders"></i><span>Поведение расширения</span></summary>
                        <div class="bbcf-dashboard-preferences-body">
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-show-fab" ${settings.showFab ? 'checked' : ''}> <span>Показывать плавающую кнопку</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-auto-mode" ${settings.autoMode ? 'checked' : ''}> <span>Автоматически после ответа бота</span></label>
                        </div>
                    </details>
                </section>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-image-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-plug"></i><span>Генерация изображений</span><small id="bbcf-image-settings-meta"></small></summary>
                    <p class="bbcf-hint bbcf-provider-note" id="bbcf-provider-note"></p>
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-image-connection-profile">Профиль подключения</label>
                            <select id="bbcf-image-connection-profile" class="text_pole">
                                ${buildImageConnectionProfileOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-image-connection-profile-name">Название профиля</label>
                            <input id="bbcf-image-connection-profile-name" class="text_pole" type="text" value="${escapeHtml(activeImageConnectionProfile?.label || '')}" placeholder="Например: Nano Banana refs">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-image-connection-profile"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-image-connection-profile" ${activeImageConnectionProfile ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-api-type">Тип API</label>
                        <select id="bbcf-api-type" class="text_pole">
                            <option value="onlysq-imagen" ${settings.apiType === 'onlysq-imagen' ? 'selected' : ''}>OnlySQ ImaGen</option>
                            <option value="gemini" ${settings.apiType === 'gemini' ? 'selected' : ''}>Gemini / Nano Banana</option>
                            <option value="openai-chat" ${settings.apiType === 'openai-chat' ? 'selected' : ''}>OpenAI chat.completions image</option>
                            <option value="openai-images" ${settings.apiType === 'openai-images' ? 'selected' : ''}>OpenAI images/generations</option>
                            <option value="naistera" ${settings.apiType === 'naistera' ? 'selected' : ''}>Naistera</option>
                        </select>
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-endpoint">Endpoint</label>
                        <input id="bbcf-endpoint" class="text_pole" type="text" value="${escapeHtml(settings.endpoint)}" placeholder="${escapeHtml(getEndpointPlaceholder(settings.apiType))}">
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-api-key">API key</label>
                        <input id="bbcf-api-key" class="text_pole" type="password" value="${escapeHtml(settings.apiKey)}">
                    </div>
                    <div class="bbcf-row bbcf-model-row">
                        <label for="bbcf-model">Модель</label>
                        <div class="bbcf-model-picker">
                            <input id="bbcf-model" class="text_pole" type="text" list="bbcf-model-options" value="${escapeHtml(settings.model)}" placeholder="flux">
                            <button class="menu_button" type="button" id="bbcf-load-models"><i class="fa-solid fa-plug-circle-bolt"></i><span>Подключить</span></button>
                        </div>
                        <datalist id="bbcf-model-options">${buildModelOptionsHtml(settings)}</datalist>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row bbcf-openai-row">
                            <label for="bbcf-openai-size">OpenAI size</label>
                            <select id="bbcf-openai-size" class="text_pole">
                                ${option('1024x1024', settings.openaiSize)}
                                ${option('1536x1024', settings.openaiSize)}
                                ${option('1024x1536', settings.openaiSize)}
                                ${option('1792x1024', settings.openaiSize)}
                                ${option('1024x1792', settings.openaiSize)}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-openai-row">
                            <label for="bbcf-openai-quality">Quality</label>
                            <select id="bbcf-openai-quality" class="text_pole">
                                ${option('standard', settings.openaiQuality)}
                                ${option('hd', settings.openaiQuality)}
                                ${option('high', settings.openaiQuality)}
                                ${option('medium', settings.openaiQuality)}
                                ${option('low', settings.openaiQuality)}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row bbcf-image-size-row">
                            <label for="bbcf-image-size">Размер картинки</label>
                            <select id="bbcf-image-size" class="text_pole">
                                ${option('1K', settings.imageSize)}
                                ${option('2K', settings.imageSize)}
                                ${option('4K', settings.imageSize)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-timeout">Таймаут, сек</label>
                            <input id="bbcf-timeout" class="text_pole" type="number" min="30" max="600" value="${Math.round(settings.timeoutMs / 1000)}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2 bbcf-naistera-row">
                        <div class="bbcf-row">
                            <label for="bbcf-naistera-model">Модель Naistera</label>
                            <select id="bbcf-naistera-model" class="text_pole">
                                ${option('grok', settings.naisteraModel)}
                                ${option('grok-pro', settings.naisteraModel)}
                                ${option('nano banana', settings.naisteraModel)}
                                ${option('novelai', settings.naisteraModel)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-naistera-preset">Пресет Naistera</label>
                            <input id="bbcf-naistera-preset" class="text_pole" type="text" value="${escapeHtml(settings.naisteraPreset)}">
                        </div>
                    </div>
                    <div class="bbcf-actions">
                        <button class="menu_button" type="button" id="bbcf-test-api"><i class="fa-solid fa-wifi"></i><span>Проверить</span></button>
                    </div>
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-draft-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-scroll"></i><span>AI-черновик</span><small id="bbcf-draft-settings-meta"></small></summary>
                    <p class="bbcf-hint bbcf-draft-connection-note" id="bbcf-draft-connection-note"></p>
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-profile">Профиль подключения</label>
                            <select id="bbcf-draft-connection-profile" class="text_pole">
                                ${buildDraftConnectionProfileOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-profile-name">Название профиля</label>
                            <input id="bbcf-draft-connection-profile-name" class="text_pole" type="text" value="${escapeHtml(activeDraftConnectionProfile?.label || '')}" placeholder="Например: OnlySQ draft proxy">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-draft-connection-profile"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-draft-connection-profile" ${activeDraftConnectionProfile ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-mode">Кто пишет черновик</label>
                            <select id="bbcf-draft-connection-mode" class="text_pole">
                                ${option('sillytavern', settings.draftConnectionMode, 'Текущая модель SillyTavern')}
                                ${option('openai-chat', settings.draftConnectionMode, 'Отдельный OpenAI-compatible chat')}
                                ${option('gemini', settings.draftConnectionMode, 'Отдельный Gemini-compatible')}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-draft-tavern-profile-row">
                            <label for="bbcf-draft-tavern-profile">Профиль SillyTavern</label>
                            <select id="bbcf-draft-tavern-profile" class="text_pole">
                                ${draftTavernProfileOptionsHtml}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-draft-connection-row">
                            <label for="bbcf-draft-model">Модель</label>
                            <input id="bbcf-draft-model" class="text_pole" type="text" list="bbcf-draft-model-options" value="${escapeHtml(settings.draftModel)}" placeholder="${escapeHtml(getDraftModelPlaceholder(settings.draftConnectionMode))}">
                            <datalist id="bbcf-draft-model-options">${buildDraftModelOptionsHtml(settings)}</datalist>
                        </div>
                    </div>
                    <div class="bbcf-grid-2 bbcf-draft-connection-row">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-endpoint">Endpoint</label>
                            <input id="bbcf-draft-endpoint" class="text_pole" type="text" value="${escapeHtml(settings.draftEndpoint)}" placeholder="${escapeHtml(getDraftEndpointPlaceholder(settings.draftConnectionMode))}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-api-key">API key</label>
                            <input id="bbcf-draft-api-key" class="text_pole" type="password" value="${escapeHtml(settings.draftApiKey)}" placeholder="Можно оставить пустым, если совпадает с API картинок">
                        </div>
                    </div>
                    <div class="bbcf-row bbcf-draft-connection-row">
                        <label for="bbcf-draft-temperature">Температура</label>
                        <input id="bbcf-draft-temperature" class="text_pole" type="number" min="0" max="2" step="0.05" value="${settings.draftTemperature}">
                    </div>
                    <div class="bbcf-actions">
                        <button class="menu_button bbcf-draft-connection-row" type="button" id="bbcf-load-draft-models"><i class="fa-solid fa-plug-circle-bolt"></i><span>Подключить</span></button>
                        <button class="menu_button" type="button" id="bbcf-test-draft-api"><i class="fa-solid fa-wifi"></i><span>Проверить черновик</span></button>
                    </div>
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-reference-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-user-group"></i><span>Персонажи и гардероб</span><small id="bbcf-reference-settings-meta"></small></summary>
                    <div class="bbcf-ref-grid">
                        ${buildReferenceSettingsHtml(settings)}
                    </div>
                    <div class="bbcf-wardrobe-panel">
                        <div class="bbcf-wardrobe-head">
                            <div>
                                <h5><i class="fa-solid fa-shirt"></i> Гардероб</h5>
                            </div>
                            <div class="bbcf-wardrobe-head-actions">
                                <button class="menu_button" type="button" data-bbcf-wardrobe-recover title="Найти гардеробные картинки без записи в библиотеке"><i class="fa-solid fa-rotate-left"></i><span>Восстановить</span></button>
                                <button class="menu_button bbcf-primary" type="button" id="bbcf-open-wardrobe"><i class="fa-solid fa-door-open"></i><span>Открыть</span></button>
                            </div>
                        </div>
                        <div class="bbcf-wardrobe-options">
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-enabled" ${settings.wardrobeEnabled ? 'checked' : ''}> <span>Использовать встроенный гардероб</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-desc" ${settings.wardrobeSendDescription ? 'checked' : ''}> <span>Учитывать описания образов</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-images" ${settings.wardrobeSendImages ? 'checked' : ''}> <span>Прикладывать картинки образов</span></label>
                        </div>
                        <div class="bbcf-wardrobe-summary">
                            ${buildWardrobeSummaryHtml(settings)}
                        </div>
                    </div>
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-page-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-table-cells-large"></i><span>Страница и тонкая настройка</span><small id="bbcf-page-settings-meta"></small></summary>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-generation-mode">Режим</label>
                            <select id="bbcf-generation-mode" class="text_pole">
                                ${option('panels', settings.generationMode, 'Качественно: каждая панель отдельно')}
                                ${option('single', settings.generationMode, 'Экономно: весь комикс одним запросом')}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-panel-count">Панелей</label>
                            <input id="bbcf-panel-count" class="text_pole" type="number" min="1" max="${MAX_PANELS}" value="${settings.panelCount}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-insert-mode">Отправка в чат</label>
                            <select id="bbcf-insert-mode" class="text_pole">
                                ${option('new', settings.insertMode, 'Новым сообщением')}
                                ${option('append_last', settings.insertMode, 'В последнее сообщение')}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-cooldown">Пауза между запросами, сек</label>
                            <input id="bbcf-cooldown" class="text_pole" type="number" min="0" max="600" value="${Math.round(settings.requestCooldownMs / 1000)}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-concurrency">Паралельность генераций</label>
                            <input id="bbcf-concurrency" class="text_pole" type="number" min="1" max="${MAX_CONCURRENCY}" value="${settings.concurrency}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-context-messages">Контекст сообщений из чата</label>
                            <input id="bbcf-context-messages" class="text_pole" type="number" min="0" max="20" value="${settings.contextMessages}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-previous-image-count">Контекст изображений из чата</label>
                            <input id="bbcf-previous-image-count" class="text_pole" type="number" min="0" max="${MAX_PREVIOUS_CONTEXT_IMAGES}" value="${settings.previousImageCount}">
                        </div>
                    </div>
                    <label class="checkbox_label bbcf-settings-checkbox">
                        <input type="checkbox" id="bbcf-inject-chat-context-image" ${settings.injectChatContextToImagePrompt ? 'checked' : ''}>
                        <span>Добавлять контекст сообщений в prompt изображения</span>
                    </label>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-layout">Макет</label>
                            <select id="bbcf-layout" class="text_pole">
                                ${buildLayoutOptionsHtml(settings, settings.layout)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-style-preset">Стиль</label>
                            <select id="bbcf-style-preset" class="text_pole">
                                ${buildStyleOptionsHtml(settings, settings.stylePreset)}
                            </select>
                        </div>
                    </div>
                    <details class="bbcf-preset-help">
                        <summary><i class="fa-solid fa-palette"></i><span>Примеры и сохранение</span></summary>
                        <div class="bbcf-preset-examples" data-bbcf-preset-list>
                            ${buildStyleExamplesHtml(settings)}
                            ${buildLayoutExamplesHtml(settings)}
                        </div>
                        <div class="bbcf-grid-2">
                            <div class="bbcf-field">
                                <label for="bbcf-save-style-name">Название стиля</label>
                                <input id="bbcf-save-style-name" class="text_pole" type="text" placeholder="Например: нежная акварель">
                            </div>
                            <div class="bbcf-field">
                                <label for="bbcf-save-style-prompt">Описание стиля</label>
                                <textarea id="bbcf-save-style-prompt" class="text_pole" rows="3" placeholder="Линия, цвет, свет, детализация, настроение."></textarea>
                            </div>
                        </div>
                        <button class="menu_button" type="button" id="bbcf-save-style"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить стиль</span></button>
                        <div class="bbcf-grid-2">
                            <div class="bbcf-field">
                                <label for="bbcf-save-layout-name">Название макета</label>
                                <input id="bbcf-save-layout-name" class="text_pole" type="text" placeholder="Например: крупный финал">
                            </div>
                            <div class="bbcf-field">
                                <label for="bbcf-save-layout-pattern">Панели</label>
                                <input id="bbcf-save-layout-pattern" class="text_pole" type="text" placeholder="9:16, 1:1, 16:9, 3:4">
                            </div>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-save-layout-intent">Описание макета</label>
                            <input id="bbcf-save-layout-intent" class="text_pole" type="text" placeholder="Вертикальный ритм с крупной эмоциональной финальной панелью">
                        </div>
                        <button class="menu_button" type="button" id="bbcf-save-layout"><i class="fa-solid fa-table-cells-large"></i><span>Сохранить макет</span></button>
                    </details>
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-prompt-preset">Набор черновика</label>
                            <select id="bbcf-draft-prompt-preset" class="text_pole">
                                ${buildDraftPromptPresetOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-prompt-preset-name">Название набора</label>
                            <input id="bbcf-draft-prompt-preset-name" class="text_pole" type="text" value="${escapeHtml(activeDraftPromptPreset?.label || '')}" placeholder="Например: динамичный вебтун">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-draft-prompt-preset"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-draft-prompt-preset" ${activeDraftPromptPreset ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-custom-style">Дополнительные инструкции к генерации</label>
                        <textarea id="bbcf-custom-style" class="text_pole" rows="3" placeholder="Разовые правки поверх выбранного стиля: свет, ракурс, темп, материалы.">${escapeHtml(settings.customPrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-character-lock">Описание персонажей</label>
                        <textarea id="bbcf-character-lock" class="text_pole" rows="4" placeholder="Описание персонажей, одежды, особенностей и текущего состояния.">${escapeHtml(settings.characterLock)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-panel-notes">План панелей по умолчанию</label>
                        <textarea id="bbcf-default-panel-notes" class="text_pole" rows="4" placeholder="1. Общий план&#10;2. Реакция героя&#10;3. Деталь или вставка">${escapeHtml(settings.defaultPanelNotes)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-bubbles">Реплики по умолчанию: panel | type | position | speaker | text</label>
                        <textarea id="bbcf-default-bubbles" class="text_pole" rows="3" placeholder="1|speech|top-left|Dr. Miyamoto|Ты правда это сказала?">${escapeHtml(settings.defaultBubbles)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-inserts">Вставки по умолчанию: panel | type | position | text</label>
                        <textarea id="bbcf-default-inserts" class="text_pole" rows="3" placeholder="3|detail|bottom-left|крупный план руки">${escapeHtml(settings.defaultInserts)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-sfx">SFX по умолчанию: panel | text</label>
                        <textarea id="bbcf-default-sfx" class="text_pole" rows="2" placeholder="3|БАХ">${escapeHtml(settings.defaultSfx)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-negative">Negative Prompt</label>
                        <textarea id="bbcf-negative" class="text_pole" rows="3">${escapeHtml(settings.negativePrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-prompt">Промпт AI-черновика</label>
                        <textarea id="bbcf-draft-prompt" class="text_pole" rows="6">${escapeHtml(settings.draftPrompt)}</textarea>
                    </div>
                    <div class="bbcf-toolbar">
                        <button class="menu_button" type="button" id="bbcf-reset-page-defaults"><i class="fa-solid fa-rotate-left"></i><span>Вернуть настройки по умолчанию</span></button>
                    </div>
                </details>
            </div>
        </div>
    `;
}
