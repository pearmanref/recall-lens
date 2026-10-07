/*
 * Recall Lens — store.js
 * Layer 2: the ONLY module that touches persistence.
 *
 * Two kinds of data, deliberately separated:
 *   decks    — imported content. Replaceable: re-import the file any time.
 *   progress — what you know, keyed by card id. The valuable part; exportable.
 *
 * Because progress is keyed by content hash, not by deck, the same card in two decks
 * shares one retention record, and re-importing an edited deck keeps progress for
 * every card whose front/back did not change.
 *
 * Swap localStorage for IndexedDB or a file later by re-implementing load()/save() only.
 */
(function (root) {
  'use strict';
  const RL = (root.RL = root.RL || {});
  const KEY = 'recall-lens:v1';
  const SCHEMA = 1;

  const DEFAULT_SETTINGS = { againGap: 3, shuffle: true, reverse: false, limit: 0 };

  function blank() {
    return { schema: SCHEMA, decks: {}, progress: {}, settings: { ...DEFAULT_SETTINGS } };
  }

  let state = blank();
  const listeners = [];

  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        state = migrate(s);
      }
    } catch (e) {
      console.warn('Recall Lens: could not read saved state', e);
    }
    return state;
  }

  // Schema migrations live here. Bump SCHEMA and add a step when the shape changes.
  function migrate(s) {
    if (!s || typeof s !== 'object') return blank();
    s.decks = s.decks || {};
    s.progress = s.progress || {};
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    s.schema = SCHEMA;
    return s;
  }

  function save() {
    try {
      root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Recall Lens: save failed (storage full or blocked)', e);
    }
    listeners.forEach((fn) => fn(state));
  }

  function onChange(fn) { listeners.push(fn); }

  // ---------- decks ----------
  function deckIdFor(name) {
    return 'd' + RL.parsers.hash(name.toLowerCase()).slice(1);
  }

  function addDeck(parsed, sourceFile) {
    const id = deckIdFor(parsed.name);
    const existing = state.decks[id];
    state.decks[id] = {
      id,
      name: parsed.name,
      format: parsed.format,
      source: sourceFile,
      imported: new Date().toISOString(),
      selected: existing ? existing.selected : true,
      cards: parsed.cards,
    };
    save();
    return { id, replaced: !!existing };
  }

  function removeDeck(id) { delete state.decks[id]; save(); }
  function setSelected(id, on) { if (state.decks[id]) { state.decks[id].selected = on; save(); } }
  function decks() { return Object.values(state.decks).sort((a, b) => a.name.localeCompare(b.name)); }

  function selectedCards() {
    const seen = new Set(), out = [];
    decks().filter((d) => d.selected).forEach((d) =>
      d.cards.forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); out.push({ ...c, deck: d.name }); } })
    );
    return out;
  }

  // ---------- progress ----------
  function progress(id) {
    return state.progress[id] || { retired: false, seen: 0, again: 0, good: 0, last: null };
  }
  function setProgress(id, p, silent) {
    state.progress[id] = p;
    if (!silent) save();
  }
  function isRetired(id) { return !!(state.progress[id] && state.progress[id].retired); }
  function setRetired(id, on) {
    const p = { ...progress(id), retired: on };
    setProgress(id, p);
  }

  // ---------- settings ----------
  function settings() { return state.settings; }
  function setSetting(k, v) { state.settings[k] = v; save(); }

  // ---------- export / import of progress ----------
  function exportProgress() {
    return JSON.stringify({ app: 'recall-lens', schema: SCHEMA, exported: new Date().toISOString(), progress: state.progress, settings: state.settings }, null, 2);
  }
  function importProgress(text) {
    const s = JSON.parse(text);
    if (s.app !== 'recall-lens' || !s.progress) throw new Error('Not a Recall Lens progress file');
    state.progress = { ...state.progress, ...s.progress };
    if (s.settings) state.settings = { ...state.settings, ...s.settings };
    save();
    return Object.keys(s.progress).length;
  }

  function reset() { state = blank(); save(); }

  RL.store = {
    load, save, onChange, reset,
    addDeck, removeDeck, setSelected, decks, selectedCards,
    progress, setProgress, isRetired, setRetired,
    settings, setSetting,
    exportProgress, importProgress,
  };
})(typeof window !== 'undefined' ? window : globalThis);
