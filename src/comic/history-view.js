import { escapeHtml } from '../ui/html.js';
import { formatComicDate, getComicHistorySourceLabel, getComicHistoryThumbnail } from './history.js';

export function renderComicHistoryHtml(history) {
    if (!history.length) return '<p class="bbcf-hint">История пуста.</p>';
    return `
        <div class="bbcf-history-header">
            <b>Созданные комиксы</b>
            <button class="menu_button" type="button" data-bbcf-history-clear><i class="fa-solid fa-trash-can"></i><span>Очистить</span></button>
        </div>
        ${history.map(record => {
            const thumbnail = getComicHistoryThumbnail(record);
            const sourceLabel = getComicHistorySourceLabel(record);
            return `
        <div class="bbcf-history-card" data-bbcf-history-id="${escapeHtml(record.id)}">
            <div class="bbcf-history-thumb">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="">` : '<i class="fa-solid fa-image"></i>'}</div>
            <div class="bbcf-history-main">
                <b>${escapeHtml(record.title || 'Comic page')}</b>
                <span>${escapeHtml(formatComicDate(record.createdAt))} · ${escapeHtml(record.mode === 'single' ? 'одним запросом' : 'по панелям')} · ${escapeHtml(sourceLabel)}</span>
                <div class="bbcf-history-actions">
                    <button class="menu_button" type="button" data-bbcf-history-preview><i class="fa-solid fa-eye"></i><span>Показать</span></button>
                    <button class="menu_button" type="button" data-bbcf-history-delete><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </div>
    `;
        }).join('')}`;
}
