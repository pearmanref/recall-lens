# Architecture

## The model: four layers, one direction

```
 files ──▶ L1 parsers ──▶ canonical card ──▶ L2 store ◀──▶ L3 scheduler
                                                  ▲               ▲
                                                  └──── L4 app ───┘  (DOM)
```

| Layer | File | Owns | Must not |
|---|---|---|---|
| L1 ingest | `js/parsers.js` | Turning bytes into `{id, front, back, tags}` | Touch storage or DOM |
| L2 state | `js/store.js` | Decks, progress, settings; persistence | Decide card order |
| L3 logic | `js/scheduler.js` | Which card is next; what an answer does to progress | Touch DOM or storage directly |
| L4 view | `js/app.js` | Rendering, input, wiring | Contain parsing or scheduling rules |

The rule that makes this durable: **each layer has one reason to change.** A new file format changes only L1. Moving from localStorage to IndexedDB changes only L2. Real spaced repetition changes only L3. A redesign changes only L4 + CSS.

The canonical card works like a normalized schema. Once everything is in that shape, nothing downstream cares where it came from.

## Key decisions

**Content vs. knowledge are stored separately.**
Decks are disposable; the source file is the truth. Progress is the asset. Keeping them apart means you can delete, re-import, or edit a deck without losing what you know, and the progress export is small and portable.

**Card identity = content hash.**
No manual IDs to maintain in source files. Trade-off: fixing a typo in a card creates a "new" card with fresh progress. Acceptable for v0.1; if it becomes annoying, add an optional `id:` field to the YAML format and prefer it over the hash in `makeCard()`.

**Classic scripts, not ES modules.**
ES modules are blocked by browsers over `file://`. Plain `<script>` tags sharing one `window.RL` namespace keep "double-click `index.html`" working offline. The same files load in Node through `globalThis.RL`, so tests need no bundler.

**No dependencies, no build.**
Nothing to audit, nothing to break, works air-gapped. Revisit only if a feature truly needs a library.

**Text-only rendering.**
Imported files are untrusted input. Everything is HTML-escaped; only backtick code is formatted.

## Extension points

| Want | Where | How |
|---|---|---|
| New input format | `parsers.js` | Add `parseX(text) → {cards, warnings, name?}`, register in `PARSERS` and `detect()`. Add a sample + test. |
| Spaced repetition: SM-2 or FSRS | `scheduler.js` | Add `due`, `interval`, `ease` to the progress record; filter `buildQueue` by `due <= now`. Keep the `Session` interface — `current`, `answer`, `undo`, `remaining` — so `app.js` is untouched. |
| Bigger storage / per-deck files | `store.js` | Re-implement `load()/save()`; bump `SCHEMA` and add a step in `migrate()`. |
| Typed answers, images, hints | YAML schema → `makeCard()` → `render()` | Extend the canonical card with optional fields; older decks keep working because missing fields are ignored. |

## Restructure path

1. Move to ES modules + a dev server **only** if you drop the `file://` requirement and only serve it from a web host.
2. Split `app.js` by view into `study.js` and `browse.js` once it passes ~500 lines.
3. Replace the store with IndexedDB when decks exceed a few thousand cards; localStorage caps around 5 MB.
4. Version the deck schema in the YAML with `schema: 2` at the first breaking field change.

Each step is local to one layer, which is the point of the layering.
