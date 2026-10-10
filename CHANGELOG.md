# История изменений / Changelog

[Русский](#русский) · [English](#english) · [README RU](README.md) · [README EN](README.en.md)

## Русский

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
