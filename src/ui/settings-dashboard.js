export function updateSettingsDashboard(root, settings, dashboard) {
    setDashboardCardState(root, 'images', {
        ready: dashboard.imageReady,
        title: dashboard.imageTitle,
        meta: dashboard.imageMeta,
    });
    setDashboardCardState(root, 'draft', {
        ready: dashboard.draftReady,
        title: dashboard.draftTitle,
        meta: dashboard.draftMeta,
    });
    setDashboardCardState(root, 'recipe', {
        title: dashboard.recipeTitle,
        meta: dashboard.recipeMeta,
    });
    setDashboardCardState(root, 'references', {
        title: dashboard.referenceTitle,
        meta: dashboard.referenceMeta,
    });
    const pageMeta = root.querySelector('#bbcf-page-settings-meta');
    if (pageMeta) pageMeta.textContent = dashboard.recipeMeta;
    const referenceMeta = root.querySelector('#bbcf-reference-settings-meta');
    if (referenceMeta) referenceMeta.textContent = dashboard.referenceTitle;
    const imageMeta = root.querySelector('#bbcf-image-settings-meta');
    if (imageMeta) imageMeta.textContent = dashboard.imageTitle;
    const draftMeta = root.querySelector('#bbcf-draft-settings-meta');
    if (draftMeta) draftMeta.textContent = dashboard.draftTitle;
    const enabledLabel = root.querySelector('[data-bbcf-enabled-label]');
    if (enabledLabel) enabledLabel.textContent = settings.enabled ? 'Включено' : 'Выключено';
    const dashboardTitle = root.querySelector('[data-bbcf-dashboard-heading]');
    if (dashboardTitle) dashboardTitle.textContent = dashboard.imageReady && dashboard.draftReady
        ? 'Готово к работе'
        : 'Заверши настройку';
}

function setDashboardCardState(root, key, { ready = true, title = '', meta = '' } = {}) {
    const card = root?.querySelector(`[data-bbcf-dashboard-card="${key}"]`);
    if (!card) return;
    card.classList.toggle('is-ready', ready);
    card.classList.toggle('needs-attention', !ready);
    const titleNode = card.querySelector('[data-bbcf-dashboard-title]');
    const metaNode = card.querySelector('[data-bbcf-dashboard-meta]');
    const statusNode = card.querySelector('[data-bbcf-dashboard-status]');
    if (titleNode) titleNode.textContent = title;
    if (metaNode) metaNode.textContent = meta;
    if (statusNode) {
        statusNode.className = `bbcf-status-chip ${ready ? 'is-ready' : 'needs-attention'}`;
        statusNode.innerHTML = ready
            ? '<i class="fa-solid fa-check"></i><span>Готово</span>'
            : '<i class="fa-solid fa-circle-exclamation"></i><span>Настроить</span>';
    }
}
