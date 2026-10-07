/*
 * Recall Lens — parsers.js
 * Layer 1: every input format is converted into ONE canonical card shape.
 * The store, scheduler and UI never know what format a card came from.
 *
 * Canonical card:
 *   { id, front, back, tags: string[] }
 *   id = stable hash of front+back, so progress survives re-imports of the same file.
 *
 * Adding a format = add a parseX(text) function and register it in detect() and PARSERS.
 */
(function (root) {
  'use strict';
  const RL = (root.RL = root.RL || {});

  // ---------- helpers ----------
  function hash(str) {
    // FNV-1a 32-bit -> base36. Not crypto; just a stable content key.
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return 'c' + (h >>> 0).toString(36);
  }

  const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  function stripHtml(s) {
    return String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normTags(t) {
    if (!t) return [];
    const arr = Array.isArray(t) ? t : String(t).split(/[\s,;]+/);
    return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
  }

  // Anki cloze {{c1::answer::hint}} -> front shows [hint|...], back shows answer.
  const CLOZE = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g;
  function expandCloze(front, back) {
    if (!CLOZE.test(front)) return [front, back];
    CLOZE.lastIndex = 0;
    const f = front.replace(CLOZE, (_, a, hint) => '[' + (hint || '...') + ']');
    const full = front.replace(CLOZE, (_, a) => a);
    return [f, back ? full + '\n\n' + back : full];
  }

  function makeCard(front, back, tags) {
    let f = String(front == null ? '' : front).trim();
    let b = String(back == null ? '' : back).trim();
    [f, b] = expandCloze(f, b);
    if (!f) return null;
    return { id: hash(f + '\u241f' + b), front: f, back: b, tags: normTags(tags) };
  }

  // RFC 4180-style delimited parser. Handles quotes, escaped quotes and embedded newlines.
  function parseDelimited(text, delim) {
    const rows = [];
    let row = [], field = '', q = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { q = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ''));
  }

  // ---------- CSV / TSV ----------
  const HEAD = {
    front: ['front', 'question', 'q', 'term', 'prompt'],
    back: ['back', 'answer', 'a', 'definition', 'response'],
    tags: ['tags', 'tag', 'category', 'topic'],
  };
  function parseTable(text, delim) {
    const rows = parseDelimited(text, delim);
    const warnings = [];
    if (!rows.length) return { cards: [], warnings: ['No rows found'] };
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (k) => head.findIndex((h) => HEAD[k].includes(h));
    let fi = col('front'), bi = col('back'), ti = col('tags'), body = rows;
    if (fi >= 0 && bi >= 0) body = rows.slice(1);
    else { fi = 0; bi = 1; ti = rows[0].length > 2 ? 2 : -1; }
    const cards = [];
    body.forEach((r, n) => {
      const c = makeCard(r[fi], r[bi], ti >= 0 ? r[ti] : '');
      if (c) cards.push(c); else warnings.push('Row ' + (n + 1) + ': empty front, skipped');
    });
    return { cards, warnings };
  }

  // ---------- Anki plain-text export ----------
  const SEP = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ', colon: ':' };
  function parseAnki(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const meta = { sep: '\t', html: true, tags: null, deck: null, skip: [] };
    let i = 0;
    for (; i < lines.length && lines[i].startsWith('#'); i++) {
      const m = lines[i].match(/^#([^:]+):(.*)$/);
      if (!m) continue;
      const k = m[1].trim().toLowerCase(), v = m[2].trim();
      if (k === 'separator') meta.sep = SEP[v.toLowerCase()] || v;
      else if (k === 'html') meta.html = v.toLowerCase() === 'true';
      else if (k === 'tags column') meta.tags = +v - 1;
      else if (k === 'deck') meta.deck = v;
      else if (/^(deck|notetype|guid) column$/.test(k)) meta.skip.push(+v - 1);
    }
    const rows = parseDelimited(lines.slice(i).join('\n'), meta.sep);
    const skip = new Set(meta.skip.concat(meta.tags == null ? [] : [meta.tags]));
    const cards = [], warnings = [];
    rows.forEach((r, n) => {
      const fields = r.filter((_, idx) => !skip.has(idx));
      let f = fields[0], b = fields.slice(1).filter((x) => x && x.trim()).join('\n');
      if (meta.html) { f = stripHtml(f); b = stripHtml(b); }
      const c = makeCard(f, b, meta.tags == null ? '' : r[meta.tags]);
      if (c) cards.push(c); else warnings.push('Note ' + (n + 1) + ': empty front, skipped');
    });
    return { cards, warnings, name: meta.deck ? meta.deck.split('::').pop() : null };
  }

  // ---------- Plain text ----------
  // Mode A: one card per line  "front :: back"
  // Mode B: blocks separated by blank lines; "Q:/A:" prefixes or first line = front, rest = back.
  //         Optional "tags: a b" line inside a block.
  function parseText(text) {
    const cards = [], warnings = [];
    const lines = text.split(/\r?\n/);
    if (lines.filter((l) => l.includes(' :: ')).length >= Math.max(1, lines.filter((l) => l.trim()).length / 2)) {
      lines.forEach((l, n) => {
        if (!l.trim() || l.trim().startsWith('#')) return;
        const [f, ...rest] = l.split(' :: ');
        const parts = rest.join(' :: ').split(' :: ');
        const c = makeCard(f, parts[0], parts[1]);
        if (c) cards.push(c); else warnings.push('Line ' + (n + 1) + ' skipped');
      });
      return { cards, warnings };
    }
    text.split(/\r?\n\s*\r?\n/).forEach((block, n) => {
      let bl = block.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
      if (!bl.some((l) => l.trim())) return;
      let tags = '';
      bl = bl.filter((l) => { const m = l.match(/^\s*tags:\s*(.*)$/i); if (m) { tags = m[1]; return false; } return true; });
      const qi = bl.findIndex((l) => /^\s*Q:/i.test(l)), ai = bl.findIndex((l) => /^\s*A:/i.test(l));
      let f, b;
      if (qi >= 0 && ai > qi) {
        f = bl.slice(qi, ai).join('\n').replace(/^\s*Q:\s*/i, '');
        b = bl.slice(ai).join('\n').replace(/^\s*A:\s*/i, '');
      } else { f = bl[0]; b = bl.slice(1).join('\n'); }
      const c = makeCard(f, b, tags);
      if (c) cards.push(c); else warnings.push('Block ' + (n + 1) + ' skipped');
    });
    return { cards, warnings };
  }

  // ---------- Markdown outline ----------
  // Every leaf heading with no child headings and some body text becomes a card:
  //   heading text -> front, body -> back, ancestor headings below the H1 -> tags.
  // The H1 becomes the deck name. Frontmatter, horizontal rules, "Refs:" lines and code-fence
  // markers are stripped; code inside fences is kept. Headings inside code fences are ignored.
  const SKIP_HEADINGS = /^(references?|reference appendix|appendix|sources|bibliography|(table of )?contents)$/i;
  function inlineMd(s) {
    return s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\\([\[\]_*#`|])/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1$2');
  }
  function slug(s) {
    const full = s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
    if (full.length <= 40) return full;
    const cut = full.slice(0, 40);
    return cut.slice(0, cut.lastIndexOf('-') > 0 ? cut.lastIndexOf('-') : 40);
  }
  function cleanMdBody(lines) {
    let fence = false;
    const out = [];
    for (const l of lines) {
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
      if (fence) { // code: keep verbatim, wrap as inline code so it renders monospace
        if (l.trim()) out.push(l.includes('`') ? l : '`' + l + '`');
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*_?refs?:/i.test(l)) continue;
      out.push(inlineMd(l).replace(/^(\s*)[-*+]\s+/, '$1• '));
    }
    return out.join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function parseMarkdown(text) {
    const lines = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/);
    const nodes = [], stack = [];
    let cur = null, inFence = false, title = null;
    for (const l of lines) {
      if (/^\s*(```|~~~)/.test(l)) inFence = !inFence;
      const m = !inFence && l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) {
        const level = m[1].length;
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        if (stack.length) stack[stack.length - 1].hasChild = true;
        const t = inlineMd(m[2]).trim();
        if (level === 1 && title == null) title = t;
        cur = { level, title: t, body: [], ancestors: stack.map((n) => n.title), hasChild: false };
        nodes.push(cur);
        stack.push(cur);
        continue;
      }
      if (cur) cur.body.push(l);
    }
    const cards = [], warnings = [];
    nodes.forEach((n) => {
      if (n.hasChild || n.level === 1 || SKIP_HEADINGS.test(n.title)) return;
      const back = cleanMdBody(n.body);
      if (!back) { warnings.push('Heading "' + n.title.slice(0, 50) + '" has no body, skipped'); return; }
      const tags = n.ancestors.filter((a) => a !== title).map(slug);
      const c = makeCard(n.title, back, tags);
      if (c) cards.push(c);
    });
    return { cards, warnings, name: title };
  }

  // ---------- Native deck format: YAML subset ----------
  // Supports exactly what the deck schema needs: top-level scalars, a `cards:` list of maps,
  // inline lists [a, b], quoted strings, and | / > block scalars. Not a general YAML parser.
  function unquote(v) {
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      const inner = v.slice(1, -1);
      return v[0] === '"' ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"') : inner.replace(/''/g, "'");
    }
    if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((x) => unquote(x)).filter((x) => x !== '');
    return v.replace(/\s+#.*$/, '');
  }
  function parseYamlDeck(text) {
    const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
    const doc = { cards: [] };
    let cur = null, target = doc, i = 0;
    const indent = (l) => l.match(/^ */)[0].length;
    function readBlock(start, baseIndent, style) {
      const out = [];
      let j = start, blockIndent = null;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) { out.push(''); continue; }
        const ind = indent(l);
        if (ind <= baseIndent) break;
        if (blockIndent == null) blockIndent = ind;
        out.push(l.slice(blockIndent));
      }
      while (out.length && out[out.length - 1] === '') out.pop();
      const val = style === '>' ? out.join('\n').replace(/([^\n])\n(?!\n)/g, '$1 ') : out.join('\n');
      return [val, j];
    }
    while (i < lines.length) {
      const raw = lines[i];
      if (!raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
      const ind = indent(raw);
      let line = raw.trim();
      if (line.startsWith('- ')) {
        cur = {}; doc.cards.push(cur); target = cur;
        line = line.slice(2);
      } else if (ind === 0) target = doc;
      const m = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1].toLowerCase(), val = m[2];
      if (val === '|' || val === '>' || val === '|-' || val === '>-') {
        const keyIndent = raw.startsWith(' '.repeat(ind) + '- ') ? ind + 2 : ind;
        const [v, next] = readBlock(i + 1, keyIndent, val[0]);
        target[key] = v; i = next; continue;
      }
      if (key === 'cards' && val.trim() === '') { i++; continue; }
      target[key] = unquote(val);
      i++;
    }
    return doc;
  }
  function fromDoc(doc) {
    const deckTags = normTags(doc.tags);
    const list = Array.isArray(doc) ? doc : doc.cards || [];
    const cards = [], warnings = [];
    list.forEach((c, n) => {
      const card = makeCard(c.front ?? c.q ?? c.question, c.back ?? c.a ?? c.answer, deckTags.concat(normTags(c.tags)));
      if (card) cards.push(card); else warnings.push('Card ' + (n + 1) + ': no front, skipped');
    });
    return { cards, warnings, name: Array.isArray(doc) ? null : doc.deck || doc.name || null };
  }

  // ---------- dispatch ----------
  function detect(filename, text) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'yaml' || ext === 'yml') return 'yaml';
    if (ext === 'json') return 'json';
    if (ext === 'csv') return 'csv';
    if (ext === 'tsv') return 'tsv';
    if ((ext === 'md' || ext === 'markdown') &&
        (text.match(/^#{1,6}\s+\S/gm) || []).length >= 3) return 'markdown';
    const head = text.slice(0, 400);
    if (/^\uFEFF?#(separator|html|tags column|deck|notetype):/im.test(head)) return 'anki';
    if (/^\s*cards:\s*$/m.test(text)) return 'yaml';
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length && lines.filter((l) => l.includes('\t')).length / lines.length > 0.8) return 'anki';
    return 'text';
  }

  const PARSERS = {
    csv: (t) => parseTable(t, ','),
    tsv: (t) => parseTable(t, '\t'),
    anki: parseAnki,
    text: parseText,
    markdown: parseMarkdown,
    yaml: (t) => fromDoc(parseYamlDeck(t)),
    json: (t) => fromDoc(JSON.parse(t)),
  };

  function parseFile(filename, text) {
    const format = detect(filename, text);
    const res = PARSERS[format](text.replace(/^\uFEFF/, ''));
    // de-duplicate within a deck by id
    const seen = new Set();
    const cards = res.cards.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
    const dupes = res.cards.length - cards.length;
    const warnings = res.warnings || [];
    if (dupes) warnings.push(dupes + (dupes === 1 ? ' duplicate card' : ' duplicate cards') + ' merged');
    const base = filename.replace(/\.[^.]+$/, '');
    return { format, name: res.name || base, cards, warnings };
  }

  RL.parsers = { parseFile, detect, hash, _internal: { parseDelimited, parseYamlDeck, stripHtml } };
})(typeof window !== 'undefined' ? window : globalThis);
