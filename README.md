# Recall Lens

Local, offline flashcards in the browser. Load CSV, Anki text exports, plain text, Markdown notes, YAML or JSON; study with an in-session reinforcement queue; retire cards you already know.

No server, no build step, no dependencies.

## Use

1. Double-click `index.html`. No server or install needed.
2. Drop deck files on the left panel, or click **Import**. Start with `samples/start-here.yaml`.
3. Pick a tag and a limit, then **Start session**.

| Key | Action |
|---|---|
| `Space` / `Enter` | Reveal answer |
| `1` Again | Card returns after *N* cards. Set N with Again gap; default 3 |
| `2` Good | Done for this session |
| `3` Known | Retired from future sessions. Restore from **Browse** |
| `Z` | Undo last answer |
| `Esc` | End session |

**Weakest first** orders the session by how often you have missed each card. **Reverse** shows the back first.

## Formats

| Format | Extension | Shape |
|---|---|---|
| Native deck | `.yaml` / `.yml` | `deck:`, `tags:`, `cards:` list of `front/back/tags` |
| JSON | `.json` | same shape as YAML, or a bare array of cards |
| CSV / TSV | `.csv` / `.tsv` | `front,back,tags` — header optional |
| Anki export | `.txt` | *File → Export → Notes in Plain Text*; `#separator`, `#html`, `#tags column` honored, cloze supported |
| Markdown outline | `.md` with 3 or more headings | Leaf heading = front, body = back, parent headings = tags. Loads existing notes as-is |
| Plain text | `.txt` / `.md` | `front :: back :: tags` per line, or blank-line-separated blocks |

Every format has a matching `samples/format-*` file. Full spec: [`docs/FORMATS.md`](docs/FORMATS.md).

## Data

Everything stays in the browser's `localStorage`. Nothing leaves the machine.

- **Decks** are content — re-import the file any time to update.
- **Progress** is keyed by a hash of each card's front+back, so it survives re-imports and is shared if the same card appears in two decks. Editing a card's text makes it a new card.
- **Export progress** downloads a JSON backup; **Load progress** merges one back. Use it to move between machines or browsers.

## Project layout

```
index.html        shell + markup
css/app.css       theme tokens + components
js/parsers.js     L1 ingest   — any format -> canonical card
js/store.js       L2 state    — decks + progress persistence
js/scheduler.js   L3 logic    — which card next
js/app.js         L4 view     — DOM + wiring
samples/          start-here.yaml + one format-* file per input format
tests/run.js      node tests/run.js, no dependencies
docs/             FORMATS.md, ARCHITECTURE.md
```

Why it is split this way and how to extend it: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Develop

```
node tests/run.js
```

CI runs the same on every push: `.github/workflows/test.yml`.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
