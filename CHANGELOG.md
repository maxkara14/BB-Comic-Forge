# История изменений / Changelog

[Русский](#русский) · [English](#english) · [README RU](README.md) · [README EN](README.en.md)

## Русский

### Реплики рядом с планом панели — 2026-10-11 (без изменения версии)

- В запросе цельной страницы реплики, вставки и SFX теперь расположены внутри блока соответствующей панели. Последовательные реплики одного говорящего сгруппированы с сохранением текста, порядка и позиций.
- В обоих режимах уточнено согласование расстановки персонажей с пузырями. Стандартный промпт черновика просит задавать положение говорящих и размещать последовательные реплики рядом с ними.
- Добавлены проверки привязки к панели, групп говорящих, чередования реплик, закадровых персонажей и старых строк без имени говорящего.

### Диагностика отправки референсов — 2026-10-11 (без изменения версии)

- Для Gemini, OpenAI Chat, OpenAI Images, Grok и Naistera добавлены журналы запроса и ответа с количеством и порядком референсов персонажей, рисовки, гардероба и предыдущих страниц.
- Отдельно отмечаются ошибки загрузки референсов, ошибки запросов, повтор Grok с форматом прокси и переход OpenAI Images на запрос без картинок.
- Диагностика не выводит ключи, тела запросов, изображения, описания или пути файлов. Добавлены проверки всех подключений, повторов и состава журналов.

### Явное удаление пресета и связанных элементов — 2026-10-11 (без изменения версии)

- Окно удаления показывает связанные стиль и макет, их использование в других пресетах, текущих настройках и сохранённых черновиках.
- Доступны удаление только пресета, удаление вместе со связанными элементами и отмена. Совместное удаление переводит затронутые ссылки на стандартные значения, сохраняя сцены, реплики и референсы.
- Добавлены проверки выбора действий, обновления ссылок, сохранения одноимённых элементов с другими ID и защиты от изменения пресета во время подтверждения.

### Инструкции изображения следуют черновику — 2026-10-11 (без изменения версии)

- Убраны служебные ограничения чиби комичными реакциями и принудительный русский язык реплик/SFX. Текст передаётся в заданном языке без перевода.
- В обоих режимах изображения передаются позиции пузырей и усилена привязка реплик к говорящему: несколько реплик одного героя нельзя распределять между другими персонажами или чиби-вставками.
- Рамки, освещение вставок, детализация фонов и изменения состояния между панелями задаются черновиком и выбранными настройками.
- Обновление старых промптов больше не заменяет пользовательские правила количества вставок на обязательные две вставки с одной чиби.
- Добавлены проверки пути JSON → редактор → отдельные панели/цельная страница, языков, вставок и сохранения правил пользовательского промпта.

### Отмена сборки и защита черновика — 2026-10-11 (без изменения версии)

- Во время сборки «Черновик из чата» меняется на «Отменить». Отмена сохраняет прежний черновик и блокирует позднее применение ответа; после неё можно сразу запустить новый запрос.
- «Черновик из чата» теперь проверяет полноту ответа до изменения полей. Оборванные ответы и JSON без панелей, реплик, вставок или SFX не смешиваются с сохранённым черновиком; прежние данные сохраняются.
- Добавлены проверки неполных ответов через все текстовые подключения, применения полного ответа с пустыми массивами, отмены кнопкой и закрытием кузницы, повторного запуска и защиты от позднего ответа.

### Референсы рисовки — 2026-10-11 (без изменения версии)

- Добавлены три общих референса рисовки в общем разделе «Референсы» → «Рисовка»: загрузка, вставка, отключение, название и описание. Они хранятся отдельно от референсов персонажей и не экспортируются с пресетами.
- Уточнены роли всех референсов: внешность и гардероб не задают стиль рисовки; примеры рисовки не задают персонажей и одежду. Предыдущие страницы сохраняют непрерывность в текущем стиле.
- Изображения рисовки передаются через существующие подключения с отдельной ролью: линии, цвет, тени и фактура; внешность, одежда, сюжет и макет не копируются из примера. Описания включаются в prompt даже без изображения.
- Объединены персонажи, рисовка и гардероб в разделе «Референсы». Примеры рисовки сворачиваются отдельно; исправлены отступы иконок после преобразования раскрывающихся разделов.
- Добавлены проверки нормализации, ролей и порядка изображений, запроса Gemini, сохранения, загрузки и вставки, синхронизации интерфейса и ошибок.

### Корректировка и очистка черновика — 2026-10-10 (без изменения версии)

- Добавлена корректировка текущего черновика по запросу: модель получает контекст и текущее содержимое, а генерация изображения запускается отдельно.
- Ошибки и неполные корректировки сохраняют прежние поля и запрос пользователя. Отмена прекращает ожидание; поздние ответы после отмены, смены чата, закрытия окна или ручных правок не применяются.
- Добавлена очистка сцены, описания персонажей, панелей, реплик, вставок и SFX с отменой последней очистки. Настройки страницы, название и референсы сохраняются; пустые поля не заменяются стандартным содержимым при повторном открытии.
- Исправлено сохранение старых вставок, когда ИИ возвращает пустой массив `inserts`.
- На телефонах кнопки пресетов и включения расширения расположены в двух равных колонках под статусом; шапка на компьютере сохраняет прежний вид.
- Добавлены проверки корректировки через все текстовые подключения, очистки с отменой, ошибок и защиты от поздних результатов; интерфейс проверен на широкой и мобильной панели.

### Параметры изображений и выбор модели — 2026-10-10 (без изменения версии)

- Добавлены отдельные режимы OpenAI-compatible, GPT Image 1 / 1.5 / Mini, GPT Image 2, GPT Image 2.5 и Grok Imagine Image 2.0. Параметры сохраняются в профилях подключения.
- Для GPT Image 2 / 2.5 добавлены разрешение, пропорции и необязательный точный размер; для 2.5 — качество `xhigh` и `max`. Grok получает разрешение 1K / 2K, пропорции и своё качество, без отправки этих полей в другие режимы.
- Референсы Grok передаются через JSON `/images/edits`; при точной ошибке `images[].image_url is required` выполняется один повтор в формате прокси с сохранением всех изображений и параметров. Другие ошибки не вызывают этот повтор; референсы не отбрасываются.
- Поиск, список и ручной ввод объединены в одном поле модели: выбор или Enter применяет модель, Escape или уход из поля отменяет поиск. Убрано ограничение первых 120 подсказок; поздний ответ подключения не перезаписывает другое подключение или ручной выбор.
- Добавлены регрессионные проверки параметров, референсов, профилей и выбора модели. Поддержка параметров конкретным прокси зависит от сервиса.

### 2.0.1 — 2026-09-24

- Разделены действия профилей подключений для изображений и AI-черновика: «Обновить выбранный», «Сохранить как новый…», «Удалить профиль…».
- Создание нового профиля запрашивает имя и не перезаписывает выбранный. Отмена диалога не меняет сохранённые профили.
- Обновление и удаление недоступны без выбранного профиля. Удаление требует подтверждения и сохраняет действующие параметры подключения, включая профиль SillyTavern для черновика.
- Обновлена раскладка кнопок профилей; добавлены четыре регрессионных теста.
- Добавлены английский README, переключение языка документации и этот changelog. Язык интерфейса расширения не менялся.
- Исправлено обновление названий стиля и макета после применения набора черновика.
- При удалении набора черновика можно отдельно удалить связанные сохранённые стиль и макет, если они больше не используются.
- Перед удалением стиля или макета теперь показываются пресеты, которые на них ссылаются; после подтверждения такие ссылки заменяются стандартными значениями.
- Удаление набора больше не предлагает удалить стиль или макет, если они используются в текущих настройках или сохранённых черновиках.
- Подтверждение прямого удаления стиля или макета теперь показывает все затронутые настройки и черновики.

### 2026-09-02 — обслуживание провайдеров

- Упорядочены модели провайдеров и удалён OnlySQ (`1220f8f`).

### 2.0.0 — 2026-08-28

- Версия в manifest установлена в 2.0.0 (`834fdfe`).

История начата с этого файла. Ранние изменения не реконструируются полностью; даты и ссылки на коммиты выше взяты из Git.

## English

### Dialogue alongside panel directions — 2026-10-11 (no version change)

- Single-page requests now place dialogue, inserts and SFX inside their respective panel blocks. Consecutive lines from one speaker are grouped while preserving text, order and positions.
- Both render modes now coordinate character staging with balloon placement. The default draft prompt requests speaker positions and nearby placement of consecutive lines.
- Added checks for panel attribution, speaker groups, alternating dialogue, off-panel speakers and legacy lines without speaker names.

### Reference request diagnostics — 2026-10-11 (no version change)

- Gemini, OpenAI Chat, OpenAI Images, Grok and Naistera now log requests and responses with counts and ordered roles for character, style, wardrobe and previous-page images.
- Failed reference loads, failed requests, Grok proxy format retries and OpenAI Images text-only fallback are logged separately.
- Diagnostics omit keys, request bodies, images, descriptions and file paths. Added checks for every provider, retries and log contents.

### Explicit preset and linked item deletion — 2026-10-11 (no version change)

- The deletion dialog lists linked styles and layouts and their use in other presets, current settings and saved drafts.
- Choose preset-only deletion, combined deletion or cancel. Combined deletion resets affected references to defaults while preserving scenes, dialogue and references.
- Added checks for explicit choices, reference updates, preservation of same-name items with different IDs and preset changes while confirmation is pending.

### Image instructions follow the draft — 2026-10-11 (no version change)

- Both image modes now pass bubble positions and reinforce speaker attribution: multiple lines from one speaker must not be distributed among other characters or chibi inserts.

- Removed wrapper restrictions limiting chibi to comic reactions and forcing Russian dialogue/SFX. Supplied text retains its language without translation.
- Insert borders and lighting, background detail and changes across panels follow the draft and selected settings.
- Legacy prompt migration no longer replaces user insert-count rules with mandatory two-insert quotas and exactly one chibi.
- Added JSON → editor → panel/full-page coverage for languages, inserts and preservation of custom prompt rules.

### Draft cancellation and protection — 2026-10-11 (no version change)

- During assembly, Draft from chat becomes Cancel. Cancellation preserves the previous draft and rejects late replies; another request can be started immediately.
- Draft from chat now checks response completeness before changing editor fields. Truncated responses and JSON missing panels, bubbles, inserts or SFX preserve the saved draft instead of mixing new and old fields.
- Added coverage for partial responses across all text connections, complete responses with empty arrays, button and window-close cancellation, retry and protection from late replies.

### Rendering references — 2026-10-11 (no version change)

- Added three shared rendering references to References → Rendering settings: upload, clipboard paste, enable, name and description. They are separate from character references and excluded from portable presets.
- Unified characters, rendering and wardrobe under References. Rendering examples collapse individually; fixed icon spacing after disclosure conversion.
- Character and wardrobe references explicitly exclude rendering style; rendering references exclude character identity and outfits. Previous pages preserve continuity in the current style.
- Style images use existing image connections with a separate rendering-only role; descriptions enter the prompt even without an image. Identity, clothing, story and layout are not copied from style examples.
- Added checks for normalization, image roles and order, Gemini requests, persistence, upload and clipboard paste, UI synchronization and errors.

### Draft revision and clearing — 2026-10-10 (no version change)

- Added revision requests using the current draft and chat context; image generation remains a separate action.
- Errors and incomplete revisions preserve previous fields and the user's request. Cancellation stops waiting; late replies after cancellation, chat changes, closing the window or manual edits are ignored.
- Added clear and undo for scene, character descriptions, panel notes, dialogue, inserts and SFX. Page settings, title and references remain intact; cleared fields do not regain default content when reopened.
- Fixed stale inserts when the model returns an empty `inserts` array.
- On phones, preset and enable controls occupy two equal columns below the status; the desktop header retains its existing layout.
- Added coverage for all text connections, clear/undo, errors and late replies; checked the interface at desktop and mobile widths.

### Image parameters and model picker — 2026-10-10 (no version change)

- Added explicit OpenAI-compatible, GPT Image 1 / 1.5 / Mini, GPT Image 2, GPT Image 2.5 and Grok Imagine Image 2.0 modes, persisted in connection profiles.
- GPT Image 2 / 2.5 offer resolution, aspect ratio and optional exact size; the 2.5 mode also offers `xhigh` and `max` quality. Grok sends its own 1K / 2K resolution, ratio and quality fields without leaking them into other modes.
- Grok references use JSON `/images/edits`. Only the explicit `images[].image_url is required` rejection triggers one proxy-format retry preserving every reference and parameter. Other errors do not trigger this retry; references are never discarded.
- Search, suggestions and manual entry share one model field: select or Enter applies the model, Escape or blur cancels search. Removed the 120-suggestion limit; late discovery cannot overwrite another connection or manual choice.
- Added regression coverage for parameters, references, profiles and model selection. Actual parameter support depends on the proxy.

### 2.0.1 — 2026-09-24

- Separated image and AI-draft connection profile actions: **Update selected**, **Save as new…**, and **Delete profile…**.
- Creating a profile asks for a name and keeps the selected profile intact. Cancelling the dialog leaves saved profiles unchanged.
- Update and delete are disabled without a selected profile. Deletion requires confirmation and preserves the active connection settings, including the draft's SillyTavern profile.
- Updated profile button layout and added four regression tests.
- Added an English README, documentation language links, and this changelog. The extension's interface language is unchanged.
- Fixed stale style and layout names after applying a draft preset, including the settings dashboard summary.
- Deleting a draft preset now offers to remove its linked saved style and layout when nothing else uses them.
- Deleting a saved style or layout now lists the draft presets that use it and replaces those links with the default value after confirmation.
- Deleting a draft preset no longer offers to remove a style or layout used by current settings or saved drafts.
- Direct style and layout deletion now shows every affected setting and saved draft in the confirmation.

### 2026-09-02 — provider maintenance

- Cleaned up provider models and removed OnlySQ (`1220f8f`).

### 2.0.0 — 2026-08-28

- Set the manifest version to 2.0.0 (`834fdfe`).

This file starts the maintained changelog. Earlier history is not reconstructed in full; the dates and commit references above come from Git.
