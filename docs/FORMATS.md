# Deck formats

Every format is converted into one canonical card:

```
{ id, front, back, tags[] }
```

`id` is a hash of `front + back`. Same text in = same id = same progress record.

Format is chosen by file extension. A `.txt` file is sniffed: Anki headers or mostly-tab lines → Anki, a `cards:` key → YAML, anything else → plain text. A `.md` file with 3 or more headings → Markdown outline; otherwise plain text.

Each format has a sample in `samples/`, named `format-<type>`.

Any format can be loaded from a file on your device or from a GitHub link; see *Load from a link* in the README. The format is detected from the file name at the end of the link.

---

## 0. Markdown outline (`.md`) — existing notes, loaded as-is

Sample: `samples/format-markdown-outline.md`. Point Recall Lens at an existing note; nothing to convert.

| Element | Becomes |
|---|---|
| `# H1` | Deck name |
| Leaf heading with body text, meaning no sub-headings under it | One card. Heading → front, body → back |
| Parent headings `##`, `###` … below the H1 | Tags on every card beneath them, slugged: `## Week 2 Review` → `week-2-review` |
| Frontmatter, `---` rules, `_Refs: …_` lines, ```` ``` ```` fence markers, link URLs | Stripped. Code inside fences is kept and shown in monospace |
| Headings named References / Appendix / Sources / Contents | Skipped |
| Leaf heading with no body | Skipped, listed as a warning |

Write notes this way to make them card-ready: **one testable question per leaf heading, answer directly under it.**

---

## 1. Native deck — YAML (`.yaml`, `.yml`) — recommended for authoring

Samples: `samples/format-yaml.yaml`, `samples/start-here.yaml`.

```yaml
deck: Chemical Elements          # display name; defaults to the file name
tags: [chemistry]                # applied to every card
cards:
  - front: H
    back: Hydrogen
    tags: [nonmetal]             # added to the deck tags
  - front: Fe
    back: |                      # block scalar keeps line breaks
      Iron.
      Latin name ferrum, which gives the symbol.
  - q: Most abundant gas in Earth's atmosphere    # q/a and question/answer are aliases
    a: Nitrogen, about 78 percent
```

The supported subset is intentionally small: top-level scalars, a `cards:` list of maps, inline lists `[a, b]`, quoted strings, `|` and `>` block scalars, `#` comments. Anchors, nested maps and multi-doc are not supported — if you need them, use JSON.

Why YAML is the native format: readable diffs in git, multi-line answers without escaping, and room to add per-card fields later such as `hint:` or `source:` without breaking older decks — unknown keys are ignored.

## 2. JSON (`.json`)

Sample: `samples/format-json.json`. Same shape as YAML:

```json
{ "deck": "Colors of Light", "tags": ["physics"], "cards": [ { "front": "Mixing red and green light", "back": "Yellow", "tags": ["color"] } ] }
```

A bare array `[ {front, back, tags}, ... ]` also works.

## 3. CSV / TSV (`.csv`, `.tsv`)

Sample: `samples/format-csv.csv`.

```
front,back,tags
metre,"Length, symbol m",si length
```

- Header is optional. Recognized header names: front/question/q/term/prompt, back/answer/a/definition/response, tags/tag/category/topic.
- No header → column 1 = front, 2 = back, 3 = tags.
- RFC 4180 quoting: commas, quotes (`""`) and newlines inside quoted fields.
- Tags split on spaces, commas or semicolons.

## 4. Anki plain-text export (`.txt`)

Sample: `samples/format-anki-export.txt`.

In Anki: **File → Export → Notes in Plain Text**, tick *Include tags*. Tick *Include HTML* too if you want line breaks kept; HTML is converted to plain text.

Header lines honored: `#separator:`, `#html:`, `#tags column:`, `#deck:`; `#deck column`, `#notetype column`, `#guid column` are skipped.

- Field 1 = front; all remaining non-empty fields joined = back.
- Cloze `{{c1::answer::hint}}` → front shows `[hint]`, or `[...]` without a hint; back shows the full sentence.
- Images and audio are not imported.

`.apkg` files are not supported because they are zipped SQLite databases. Export as plain text instead.

## 5. Plain text (`.txt`, `.md`)

**Line mode** — used when most non-empty lines contain ` :: `. Sample: `samples/format-text-lines.txt`.

```
π :: pi :: greek math
```

**Block mode** — otherwise. Cards separated by a blank line. Sample: `samples/format-text-blocks.txt`.

```
Mercury
Closest planet to the Sun.
A year there lasts 88 Earth days.
tags: planets inner

Q: Which planet is tilted on its side?
A: Uranus, with an axial tilt of about 98 degrees.
```

- First line = front, remaining lines = back; or `Q:` / `A:` prefixes.
- Optional `tags:` line anywhere in the block.
- Lines starting with `#` are comments.

## Rendering

Card text is escaped and shown as plain text with line breaks preserved. `` `inline code` `` renders as code. No HTML or markdown beyond that — by design, so imported content can never inject script.
