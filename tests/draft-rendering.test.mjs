import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

async function harness() {
    const context = createContext({ console, structuredClone, Event: class {}, window: {} });
    const cache = new Map();
    const moduleFor = url => {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
        return cache.get(url.href);
    };
    async function load(file) {
        const module = moduleFor(new URL('../src/' + file, import.meta.url));
        if (module.status === 'unlinked') await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
        if (module.status === 'linked') await module.evaluate();
        return module.namespace;
    }
    return { ai: await load('draft/ai.js'), planner: await load('comic/planner.js'), syntax: await load('comic/syntax.js'), prompts: await load('draft/prompts.js') };
}

const settings = { panelCount: 2, layout: 'custom', imageSize: '2K', draftConnectionMode: 'openai-chat', draftEndpoint: 'https://example.invalid/v1', draftApiKey: 'test', draftModel: 'test' };
const planningContext = { settings, recentContext: '', referenceLock: 'Appearance notes', wardrobeLock: 'Outfit notes', resolveStylePreset: () => ({ prompt: 'Detailed ink drawing.' }), resolveLayoutPreset: () => ({ pattern: ['1:1', '3:4'], singleAspect: '3:4' }), resolveLayoutIntent: () => 'Borderless panels with readable composition' };

test('AI JSON reaches editor and both render modes with neutral chibi inserts and supplied languages', async () => {
    const { ai, planner } = await harness();
    for (const dialogue of ['Да, конечно.', 'Yes, certainly.', 'Oui, bien sûr.']) {
        const result = { title: 'Garden', scene: 'A quiet garden with a detailed architectural backdrop.', character_lock: 'Alex has dark hair and normal manga proportions.', panel_notes: ['Alex listens with normal proportions.', 'Alex puts on a coat while the light changes.'], bubbles: [{ panel: 1, type: 'speech', position: 'top-left', speaker: 'Alex', text: dialogue }], sfx: [{ panel: 2, text: 'RUSTLE' }], inserts: [{ panel: 1, type: 'chibi', position: 'bottom-right', text: 'A borderless small chibi sticker of Alex with a neutral expression and flat colors; normal anatomy in the main panel.' }, { panel: 2, type: 'chibi', position: 'bottom-left', text: 'Small chibi sticker of Alex listening thoughtfully, without a joke.' }] };
        const controls = new Map();
        const root = { isConnected: true, querySelector(selector) { if (!controls.has(selector)) controls.set(selector, { value: selector === '#bbcf-draft-count' ? '2' : '', dispatchEvent() {} }); return controls.get(selector); } };
        const chat = [], errors = [];
        const controller = ai.createAiDraftController({ getSettings: () => settings, getContext: () => ({ chat }), getSavedDraftProfileKey: () => 'chat', readDraftFromModal: () => ({ scene: root.querySelector('#bbcf-draft-scene').value }), collectRecentChat: () => 'Alex talks and puts on a coat.', substituteParams: () => '', fetchJson: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }), saveDraftFromModal() {}, refreshForgeWorkflowSummary() {}, notifySuccess() {}, notifyError: message => errors.push(message) });
        assert.equal(await controller.fillDraftFromAi(root), true, errors.join());
        const value = key => root.querySelector('#bbcf-draft-' + key).value;
        const draft = { title: value('title'), scene: value('scene'), characterLock: value('lock'), panelCount: 2, panelNotes: value('notes'), bubbles: value('bubbles'), inserts: value('inserts'), sfx: value('sfx'), stylePreset: 'custom', layout: 'custom', customPrompt: 'Keep the requested palette.', negativePrompt: 'No blur.' };
        const panels = planner.createPanelPlans(draft, planningContext);
        const single = planner.createSinglePagePanel(draft, panels, planningContext);
        assert.equal(panels.length, 2);
        assert.match(panels[0].prompt, /chibi insert at bottom-right: A borderless/);
        assert.match(panels[1].prompt, /chibi insert at bottom-left: Small chibi/);
        assert.match(single.prompt, /Panel 1 chibi insert at bottom-right/);
        assert.match(single.prompt, /Panel 2 chibi insert at bottom-left/);
        for (const rendered of [panels[0], single]) {
            assert.ok(rendered.prompt.includes('speaker Alex: ' + dialogue));
            assert.ok(!/Russian|only for comic or exaggerated reactions|matching the panel's style, lighting|small bordered overlay/.test(rendered.prompt));
            assert.ok(!/controlled background detail|same character identities, clothing state|marks, mood, lighting/.test(rendered.prompt));
            assert.match(rendered.prompt, /changes in clothing, expression, condition, lighting and environment explicitly requested/);
            assert.ok(rendered.stylePrompt.includes('Detailed ink drawing.') && rendered.stylePrompt.includes('Keep the requested palette.'));
            assert.equal(rendered.negativePrompt, 'No blur.');
            assert.match(rendered.prompt, /Appearance notes/);
            assert.match(rendered.prompt, /Outfit notes/);
        }
        assert.match(panels[1].prompt, /RUSTLE/);
        assert.match(single.prompt, /Panel 2 SFX: RUSTLE/);
    }
});

test('empty inserts remain empty and explicit visual treatment is passed through', async () => {
    const { syntax } = await harness();
    assert.equal(syntax.buildPanelInsertPrompt([]), '');
    const parsed = syntax.parseInserts('1|detail|top-left|Borderless close-up of a hand with its own spotlight.');
    const prompt = syntax.buildPanelInsertPrompt(parsed.get(1));
    assert.match(prompt, /detail insert at top-left: Borderless close-up of a hand with its own spotlight/);
    assert.match(prompt, /Do not impose a border, lighting treatment or expression/);
});

test('both render modes retain positions and repeated ownership instead of alternating speakers', async () => {
    const { planner } = await harness();
    const draft = {
        panelCount: 2, layout: 'custom', scene: 'Kagami and Shinobu talk at a table.',
        characterLock: 'Kagami has pale hair; Shinobu has dark hair.',
        panelNotes: 'Kagami speaks while Shinobu listens.\nShinobu replies while Kagami listens.',
        bubbles: [
            '1|speech|top-left|Kagami Shiranui|Я не собираюсь себя изводить.',
            '1|speech|top-right|Kagami Shiranui|Я буду соблюдать все медицинские показания.',
            '2|speech|top-left|Shinobu Kocho|Поразительно.',
            '2|thought|top-right|Shinobu Kocho|Только трезвый расчёт пользы.',
        ].join('\n'),
        inserts: '2|chibi|bottom-left|A sticker of both characters reacting to this moment.', sfx: '2|Хи-хи',
    };
    const panels = planner.createPanelPlans(draft, planningContext);
    const single = planner.createSinglePagePanel(draft, panels, planningContext);
    const firstPanel = single.prompt.slice(single.prompt.indexOf('Panel 1:'), single.prompt.indexOf('Panel 2:'));
    const secondPanel = single.prompt.slice(single.prompt.indexOf('Panel 2:'));
    assert.ok(firstPanel.includes('Я не собираюсь себя изводить.') && firstPanel.includes('Я буду соблюдать'));
    assert.ok(!firstPanel.includes('Поразительно.') && !firstPanel.includes('chibi insert') && !firstPanel.includes('SFX:'));
    assert.ok(secondPanel.includes('Поразительно.') && secondPanel.includes('chibi insert') && secondPanel.includes('SFX: Хи-хи'));
    assert.equal((firstPanel.match(/Dialogue owner: Kagami Shiranui/g) || []).length, 1);
    assert.equal((secondPanel.match(/Dialogue owner: Shinobu Kocho/g) || []).length, 2); // Speech and thought remain separate groups.
    const lines = draft.bubbles.split('\n').map(line => line.split('|'));
    for (const [panel, type, position, speaker, text] of lines) {
        const instruction = `${type} at ${position}, speaker ${speaker}: ${text}`;
        assert.ok(panels[Number(panel) - 1].prompt.includes(instruction));
        assert.ok(single.prompt.includes(`Panel ${panel} ${instruction}`));
    }
    for (const rendered of [...panels, single]) {
        assert.match(rendered.prompt, /Multiple bubbles assigned to the same speaker must all remain with that speaker/);
        assert.match(rendered.prompt, /positions guide placement, never speaker identity/);
        assert.match(rendered.prompt, /attach every speech tail to the named character/);
        assert.match(rendered.prompt, /thought bubbles with their named thinker/);
        assert.match(rendered.prompt, /main-panel characters rather than chibi stickers/);
        assert.match(rendered.prompt, /never render them as labels or visible text/);
        assert.match(rendered.prompt, /Coordinate character staging and balloon placement/);
    }
});

test('dialogue groups preserve alternating speakers, off-panel notes and unnamed legacy lines', async () => {
    const { planner } = await harness();
    const draft = { panelCount: 1, scene: 'A talks with off-panel B.', panelNotes: 'A stands on the left; B answers from off-panel.',
        bubbles: '1|speech|top-left|A|First.\n1|speech|top-right|B|Second.\n1|speech|bottom-left|A|Third.\n1|speech|bottom-right|Unattributed.', inserts: '', sfx: '' };
    const panels = planner.createPanelPlans(draft, planningContext);
    const single = planner.createSinglePagePanel(draft, panels, planningContext);
    for (const rendered of [panels[0], single]) {
        const positions = ['First.', 'Second.', 'Third.', 'Unattributed.'].map(text => rendered.prompt.indexOf(text));
        assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])));
        assert.equal((rendered.prompt.match(/Dialogue owner: A /g) || []).length, 2);
        assert.equal((rendered.prompt.match(/End of dialogue group\./g) || []).length, 3);
        assert.match(rendered.prompt, /speech at bottom-right: Unattributed\./);
        assert.match(rendered.prompt, /B answers from off-panel/);
    }
});

test('legacy bubbles keep their text without an invented speaker and empty dialogue stays empty', async () => {
    const { planner } = await harness();
    const draft = { panelCount: 1, layout: 'custom', scene: 'A quiet room.', panelNotes: 'Alex waits.', bubbles: '1|speech|bottom-left|Hello.', inserts: '', sfx: '' };
    const panels = planner.createPanelPlans(draft, planningContext);
    const single = planner.createSinglePagePanel(draft, panels, planningContext);
    for (const rendered of [panels[0], single]) {
        assert.match(rendered.prompt, /speech at bottom-left: Hello\./);
        assert.ok(!rendered.prompt.includes('speaker Alex'));
    }
    const emptyDraft = { ...draft, bubbles: '' };
    const emptyPanels = planner.createPanelPlans(emptyDraft, planningContext);
    const emptySingle = planner.createSinglePagePanel(emptyDraft, emptyPanels, planningContext);
    for (const rendered of [emptyPanels[0], emptySingle]) assert.ok(!rendered.prompt.includes('Each named speaker owns'));
});


test('prompt migration preserves user insert quotas and converts legacy fields without mandatory chibi', async () => {
    const { prompts } = await harness();
    const custom = [
        '- Add 0 to 2 overlay inserts only when they clearly improve the page.',
        '- Use detail inserts for important hands, lips, eyes, weapons, objects, symbols, or action emphasis.',
        '- Use chibi inserts only for comic, embarrassed, jealous, startled, or exaggerated reactions.',
        '- Do not add inserts to calm/simple pages or already crowded panels.',
    ].join('\n');
    assert.equal(prompts.migrateDraftPrompt(custom), custom);
    const modern = 'Return JSON with English descriptions and neutral chibi stickers. "bubbles": [{"speaker":"Alex"}] "inserts": []';
    assert.equal(prompts.migrateDraftPrompt(modern), modern);
    const migrated = prompts.migrateDraftPrompt('- Do not write explicit sexual content. Fanservice, if useful, must stay tasteful and non-explicit. "fanservice_panel": 0');
    assert.match(migrated, /"inserts"/);
    assert.ok(!migrated.includes('"fanservice_panel"'));
    assert.ok(!/Add at least 2|Include exactly 1 chibi|Include at least 1 detail/.test(migrated));
});
