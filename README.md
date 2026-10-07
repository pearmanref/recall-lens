# Recall Lens

Local, offline flashcards in the browser. Load CSV, Anki text exports, plain text, Markdown notes, YAML or JSON from your device or from a GitHub link; study with an in-session reinforcement queue; retire cards you already know.

**Try it:** [open the Start Here deck](https://pearmanref.github.io/recall-lens/?deck=samples/start-here.yaml), or download the repo and open `index.html` offline.

## Use

1. Open the [hosted page](https://pearmanref.github.io/recall-lens/), or double-click `index.html`. No install needed.
2. Drop deck files on the left panel, click **Import**, or paste a GitHub file link into the box under the drop zone.
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

## Load from a link

Paste a link to a single deck file on GitHub and press **Load**. The page also accepts the address-bar link of a file page and converts it.

| You paste | Recall Lens downloads |
|---|---|
| `https://github.com/<owner>/<repo>/blob/<branch>/<path>` | `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` |
| `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` | the same link |
| `https://gist.githubusercontent.com/<user>/<id>/raw/<file>` | the same link |

**Share a deck as a link.** Add `?deck=` to the page address. Repeat it to load several decks:

```
https://pearmanref.github.io/recall-lens/?deck=https://github.com/<owner>/<repo>/blob/main/deck.csv
https://pearmanref.github.io/recall-lens/?deck=samples/start-here.yaml&deck=samples/format-csv.csv
```

Paths such as `samples/start-here.yaml` load from the site serving Recall Lens, so they only work on the hosted page.

Decks loaded from a link show a ↻ button. It downloads the deck again and keeps your progress on cards that did not change. A link to a branch such as `main` always gets the latest version, up to 5 minutes behind GitHub's cache; a link to a commit never changes.

Limits: public GitHub files only, https only, 2 MB per file, 10 decks per `?deck=` link.

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

Everything you study stays in the browser's `localStorage`. Nothing is uploaded.

- **Decks** are content — re-import the file or press ↻ any time to update.
- **Progress** is keyed by a hash of each card's front+back, so it survives re-imports and is shared if the same card appears in two decks. Editing a card's text makes it a new card.
- **Export progress** downloads a JSON backup; **Load progress** merges one back. Use it to move between machines or browsers. The hosted page and a local copy keep separate progress.

## Project layout

```
index.html        shell + markup
css/app.css       theme tokens + components
js/sources.js     L0 sources  — which links may load, download limits
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
