// Keep disclosure state explicit so nested sections animate independently
// without measuring or mutating their surrounding layout.
let disclosureIdCounter = 0;

export function isDisclosureExpanded(disclosure) {
    return disclosure?.dataset?.bbcfExpanded === 'true';
}

export function setDisclosureExpanded(disclosure, expanded, { emit = true } = {}) {
    const button = disclosure?.querySelector(':scope > .bbcf-disclosure-toggle');
    const panel = disclosure?.querySelector(':scope > .bbcf-disclosure-panel');
    if (!button || !panel) return;
    const shouldExpand = Boolean(expanded);
    const changed = isDisclosureExpanded(disclosure) !== shouldExpand;
    disclosure.dataset.bbcfExpanded = String(shouldExpand);
    button.setAttribute('aria-expanded', String(shouldExpand));
    panel.setAttribute('aria-hidden', String(!shouldExpand));
    if (shouldExpand) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    if (changed && emit) {
        disclosure.dispatchEvent(new CustomEvent('bbcf:toggle', {
            bubbles: true,
            detail: { expanded: shouldExpand },
        }));
    }
}

export function upgradeDisclosures(root) {
    const detailsNodes = Array.from(root?.querySelectorAll('details') || []);
    for (const details of detailsNodes) {
        const summary = details.querySelector(':scope > summary');
        if (!summary) continue;
        const disclosure = document.createElement('section');
        for (const attribute of Array.from(details.attributes)) {
            if (attribute.name !== 'open') disclosure.setAttribute(attribute.name, attribute.value);
        }
        disclosure.classList.add('bbcf-disclosure');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${summary.className} bbcf-disclosure-toggle`.trim();
        button.innerHTML = summary.innerHTML;

        const panel = document.createElement('div');
        panel.className = 'bbcf-disclosure-panel';
        panel.id = `${details.id || `bbcf-disclosure-${++disclosureIdCounter}`}-panel`;
        const panelInner = document.createElement('div');
        panelInner.className = 'bbcf-disclosure-panel-inner';
        Array.from(details.childNodes).forEach(node => {
            if (node !== summary) panelInner.appendChild(node);
        });
        panel.appendChild(panelInner);
        button.setAttribute('aria-controls', panel.id);
        disclosure.append(button, panel);
        details.replaceWith(disclosure);
        setDisclosureExpanded(disclosure, details.open, { emit: false });
        button.addEventListener('click', () => setDisclosureExpanded(disclosure, !isDisclosureExpanded(disclosure)));
    }
}
