# История изменений / Changelog

[Русский](#русский) · [English](#english) · [README RU](README.md) · [README EN](README.en.md)

## Русский

### Unreleased

- Разделены действия профилей подключений для изображений и AI-черновика: «Обновить выбранный», «Сохранить как новый…», «Удалить профиль…».
- Создание нового профиля запрашивает имя и не перезаписывает выбранный. Отмена диалога не меняет сохранённые профили.
- Обновление и удаление недоступны без выбранного профиля. Удаление требует подтверждения и сохраняет действующие параметры подключения, включая профиль SillyTavern для черновика.
- Обновлена раскладка кнопок профилей; добавлены четыре регрессионных теста.
- Добавлены английский README, переключение языка документации и этот changelog. Язык интерфейса расширения не менялся.

### 2026-09-02 — обслуживание провайдеров

- Упорядочены модели провайдеров и удалён OnlySQ (`1220f8f`).

### 2.0.0 — 2026-08-28

- Версия в manifest установлена в 2.0.0 (`834fdfe`).

История начата с этого файла. Ранние изменения не реконструируются полностью; даты и ссылки на коммиты выше взяты из Git. Раздел Unreleased не означает публикацию новой версии или тега.

## English

### Unreleased

- Separated image and AI-draft connection profile actions: **Update selected**, **Save as new…**, and **Delete profile…**.
- Creating a profile asks for a name and keeps the selected profile intact. Cancelling the dialog leaves saved profiles unchanged.
- Update and delete are disabled without a selected profile. Deletion requires confirmation and preserves the active connection settings, including the draft's SillyTavern profile.
- Updated profile button layout and added four regression tests.
- Added an English README, documentation language links, and this changelog. The extension's interface language is unchanged.

### 2026-09-02 — provider maintenance

- Cleaned up provider models and removed OnlySQ (`1220f8f`).

### 2.0.0 — 2026-08-28

- Set the manifest version to 2.0.0 (`834fdfe`).

This file starts the maintained changelog. Earlier history is not reconstructed in full; the dates and commit references above come from Git. Unreleased does not imply a new version or tag has been published.
