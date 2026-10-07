// Parser + scheduler tests. Run: node tests/run.js. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

require('../js/parsers.js');
require('../js/scheduler.js');
const { parsers, scheduler } = globalThis.RL;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const sample = (f) => parsers.parseFile(f, fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));

console.log('parsers');
t('every sample loads with no warnings', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'samples'))) {
    const r = sample(f);
    assert.ok(r.cards.length > 0, f + ' has no cards');
    assert.deepStrictEqual(r.warnings, [], f + ' has warnings');
  }
});
t('start-here: 16 cards, features and method tags', () => {
  const r = sample('start-here.yaml');
  assert.strictEqual(r.name, 'Recall Lens: Start Here');
  assert.strictEqual(r.cards.length, 16);
  assert.strictEqual(r.cards.filter((c) => c.tags.includes('features')).length, 10);
  assert.strictEqual(r.cards.filter((c) => c.tags.includes('method')).length, 6);
});
t('yaml deck: name, count, deck+card tags, block scalar, q/a alias', () => {
  const r = sample('format-yaml.yaml');
  assert.strictEqual(r.format, 'yaml');
  assert.strictEqual(r.name, 'Chemical Elements');
  assert.strictEqual(r.cards.length, 5);
  assert.deepStrictEqual(r.cards[0].tags, ['chemistry', 'nonmetal']);
  assert.ok(r.cards.find((x) => x.front === 'Fe').back.includes('\n'), 'block scalar keeps newline');
  assert.strictEqual(r.cards[4].back, 'Nitrogen, about 78 percent');
});
t('json deck: name, q/a alias, deck tags', () => {
  const r = sample('format-json.json');
  assert.strictEqual(r.format, 'json');
  assert.strictEqual(r.name, 'Colors of Light');
  assert.strictEqual(r.cards[1].back, 'Red, around 700 nanometres');
  assert.deepStrictEqual(r.cards[1].tags, ['physics']);
});
t('csv with header + quoted commas', () => {
  const r = sample('format-csv.csv');
  assert.strictEqual(r.format, 'csv');
  assert.strictEqual(r.cards.length, 7);
  assert.strictEqual(r.cards[0].back, 'Length, symbol m');
  assert.deepStrictEqual(r.cards[0].tags, ['si', 'length']);
});
t('csv without header uses col0/col1', () => {
  const r = parsers.parseFile('x.csv', 'a,b\nc,d\n');
  assert.strictEqual(r.cards.length, 2);
  assert.strictEqual(r.cards[1].back, 'd');
});
t('anki export: headers, deck name, html stripped, tags column, cloze', () => {
  const r = sample('format-anki-export.txt');
  assert.strictEqual(r.format, 'anki');
  assert.strictEqual(r.name, 'World Capitals');
  assert.strictEqual(r.cards.length, 5);
  assert.strictEqual(r.cards[3].back, 'Ottawa\nNot Toronto, the largest city');
  assert.deepStrictEqual(r.cards[3].tags, ['geography', 'americas']);
  const cz = r.cards[4];
  assert.ok(cz.front.includes('[city]'), 'cloze hidden on front: ' + cz.front);
  assert.ok(cz.back.startsWith('The capital of Australia is Canberra'));
});
t('text blocks: first-line and Q:/A: modes, tags line, comments ignored', () => {
  const r = sample('format-text-blocks.txt');
  assert.strictEqual(r.format, 'text');
  assert.strictEqual(r.cards.length, 4);
  assert.strictEqual(r.cards[0].front, 'Mercury');
  assert.strictEqual(r.cards[0].back, 'Closest planet to the Sun.\nA year there lasts 88 Earth days.');
  assert.strictEqual(r.cards[3].front, 'Which planet is tilted on its side?');
  assert.deepStrictEqual(r.cards[3].tags, ['planets', 'outer']);
});
t('text lines: front :: back :: tags', () => {
  const r = sample('format-text-lines.txt');
  assert.strictEqual(r.cards.length, 4);
  assert.strictEqual(r.cards[2].back, 'pi');
  assert.deepStrictEqual(r.cards[2].tags, ['greek', 'math']);
});
t('markdown outline: leaf headings -> cards, parents -> tags, refs/fences stripped', () => {
  const r = sample('format-markdown-outline.md');
  assert.strictEqual(r.format, 'markdown');
  assert.strictEqual(r.name, 'Basic Shell Commands');
  assert.deepStrictEqual(r.cards.map((c) => c.front),
    ['List a directory', 'Copy a file', 'Show the current directory', 'Change directory']);
  const ls = r.cards[0];
  assert.deepStrictEqual(ls.tags, ['files']);
  assert.ok(ls.back.includes('`ls -la`'), 'code line wrapped as inline code');
  assert.ok(ls.back.includes('# a comment inside a code block'), 'heading-like line inside fence stays in body');
  assert.ok(!/Refs|```|---/.test(ls.back), 'refs, fences, rules stripped');
});
t('markdown: leaf heading with no body is skipped with a warning', () => {
  const r = parsers.parseFile('w.md', '# T\n\n## A\n\nbody\n\n## Empty\n\n## B\n\nbody b\n');
  assert.deepStrictEqual(r.cards.map((c) => c.front), ['A', 'B']);
  assert.strictEqual(r.warnings.length, 1);
});
t('markdown: .md without headings still uses plain-text rules', () => {
  const r = parsers.parseFile('n.md', 'a :: b\nc :: d\n');
  assert.strictEqual(r.format, 'text');
  assert.strictEqual(r.cards.length, 2);
});
t('ids stable across re-import, duplicates merged', () => {
  const a = parsers.parseFile('a.txt', 'x :: y\nx :: y\n');
  const b = parsers.parseFile('b.csv', 'x,y\n');
  assert.strictEqual(a.cards.length, 1);
  assert.strictEqual(a.cards[0].id, b.cards[0].id);
});

console.log('scheduler');
function fakeStore() {
  const p = {};
  return {
    progress: (id) => p[id] || { retired: false, seen: 0, again: 0, good: 0, last: null },
    setProgress: (id, v) => { p[id] = v; },
    isRetired: (id) => !!(p[id] && p[id].retired),
  };
}
const cards = 'abcdef'.split('').map((x) => ({ id: x, front: x, back: x, tags: [] }));
t('again re-inserts N later; good/known clear; known retires', () => {
  const st = fakeStore();
  const s = new scheduler.Session(cards, { againGap: 2 }, st);
  s.answer('again');                       // a -> pos 2
  assert.deepStrictEqual(s.queue.map((c) => c.id), ['b', 'c', 'a', 'd', 'e', 'f']);
  s.answer('good'); s.answer('known');     // b good, c retired
  assert.strictEqual(s.current().id, 'a');
  assert.ok(st.isRetired('c'));
  assert.strictEqual(st.progress('a').again, 1);
});
t('undo restores queue and progress', () => {
  const st = fakeStore();
  const s = new scheduler.Session(cards, { againGap: 3 }, st);
  s.answer('known');
  assert.ok(st.isRetired('a'));
  s.undo();
  assert.ok(!st.isRetired('a'));
  assert.strictEqual(s.current().id, 'a');
});
t('buildQueue excludes retired, filters tag, limits', () => {
  const st = fakeStore();
  st.setProgress('a', { retired: true, seen: 1, again: 0, good: 0 });
  const tagged = cards.map((c, i) => ({ ...c, tags: i % 2 ? ['odd'] : [] }));
  assert.strictEqual(scheduler.buildQueue(cards, {}, st.isRetired).length, 5);
  assert.deepStrictEqual(scheduler.buildQueue(tagged, { tag: 'odd' }, st.isRetired).map((c) => c.id), ['b', 'd', 'f']);
  assert.strictEqual(scheduler.buildQueue(cards, { limit: 2 }, st.isRetired).length, 2);
});
t('first-try rate counts only cards never missed this session', () => {
  const s = new scheduler.Session(cards.slice(0, 2), { againGap: 1 }, fakeStore());
  s.answer('again'); s.answer('good'); s.answer('good'); // a missed then good, b good
  assert.strictEqual(s.firstTryRate(), 50);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
