/*
 * Page rendering and user input.
 */
(function () {
  'use strict';
  const { parsers, store, scheduler, sources } = window.RL;
  const $ = (id) => document.getElementById(id);

  let session = null;
  let revealed = false;
  let reverse = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // All text is escaped; only `inline code` is formatted.
  function render(s) { return esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>'); }

  // Adds one log entry. Newest entries appear first.
  function logBlock(lines) {
    const block = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    lines.forEach(([msg, cls], i) => {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = (i === 0 ? time + '  ' : ' '.repeat(time.length + 2)) + msg;
      block.appendChild(d);
    });
    $('log').prepend(block);
  }
  function log(msg, cls) { logBlock([[msg, cls]]); }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFiles(files) {
    for (const f of files) {
      try {
        const text = await f.text();
        const parsed = parsers.parseFile(f.name, text);
        if (!parsed.cards.length) { log(f.name + ': no cards found', 'e'); continue; }
        const r = store.addDeck(parsed, f.name);
        const lines = [[`${f.name}: ${parsed.cards.length} cards [${parsed.format}]${r.replaced ? ' \u00b7 replaced existing deck' : ''}`]];
        parsed.warnings.slice(0, 5).forEach((w) => lines.push(['  ' + w, 'w']));
        if (parsed.warnings.length > 5) lines.push([`  +${parsed.warnings.length - 5} more warnings`, 'w']);
        logBlock(lines);
      } catch (e) {
        log(f.name + ': ' + e.message, 'e');
      }
    }
    refresh();
  }

  // Uses the same parsing and storage as a dropped file.
  async function importLink(input, opts) {
    const o = opts || {};
    let src;
    try {
      src = sources.normalizeUrl(input, location.href);
    } catch (e) {
      logBlock([[`${String(input).trim() || 'Link'}: ${e.message}`, 'e']]);
      return false;
    }
    try {
      const text = await sources.fetchText(src, { refresh: o.refresh });
      const parsed = parsers.parseFile(src.name, text);
      if (!parsed.cards.length) { log(`${src.name}: no cards found`, 'e'); return false; }
      const r = store.addDeck(parsed, src.name, src.url);
      const from = src.kind === 'github' ? 'from GitHub' : 'from this site';
      const verb = o.refresh ? 'refreshed' : r.replaced ? 'replaced existing deck' : '';
      const lines = [[`${src.name}: ${parsed.cards.length} cards [${parsed.format}] \u00b7 ${from}${verb ? ' \u00b7 ' + verb : ''}`]];
      parsed.warnings.slice(0, 5).forEach((w) => lines.push(['  ' + w, 'w']));
      if (parsed.warnings.length > 5) lines.push([`  +${parsed.warnings.length - 5} more warnings`, 'w']);
      logBlock(lines);
      return true;
    } catch (e) {
      logBlock([[`${src.name}: ${e.message}`, 'e']]);
      return false;
    } finally {
      if (!o.batch) refresh();
    }
  }

  async function importDeckLinksFromAddress() {
    const { links, dropped, cleanHref } = sources.deckLinksFrom(location.href);
    if (!links.length) return;
    // Removes ?deck= from the address so a reload does not import the decks again.
    history.replaceState(null, '', cleanHref);
    for (const l of links) await importLink(l, { batch: true });
    if (dropped) log(`${dropped} more deck links ignored; the limit is ${sources.MAX_LINK_DECKS} per link`, 'w');
    refresh();
  }

  function renderDecks() {
    const ul = $('decks');
    const ds = store.decks();
    ul.innerHTML = '';
    $('deckCount').textContent = ds.length ? ds.length : '';
    if (!ds.length) {
      ul.innerHTML = '<li class="muted" style="font-size:12px">No decks yet. Drop a file above, or try the files in <code>samples/</code>.</li>';
    }
    ds.forEach((d) => {
      const retired = d.cards.filter((c) => store.isRetired(c.id)).length;
      const li = document.createElement('li');
      li.className = 'deck';
      li.innerHTML = `<input type="checkbox" ${d.selected ? 'checked' : ''} title="Include in session">
        <span class="name" title="${esc(d.url || d.source)}">${esc(d.name)}</span>
        ${d.url ? '<button class="rf" title="Download again from its link. Progress is kept.">&#8635;</button>' : '<span></span>'}
        <button class="x" title="Remove deck. Progress is kept.">&times;</button>
        <span class="sub">${d.cards.length - retired} active &middot; ${retired} retired &middot; ${d.format}${d.url ? ' &middot; link' : ''}</span>`;
      li.querySelector('input').onchange = (e) => { store.setSelected(d.id, e.target.checked); refresh(); };
      const rf = li.querySelector('.rf');
      if (rf) rf.onclick = async () => { rf.disabled = true; await importLink(d.url, { refresh: true }); };
      li.querySelector('.x').onclick = () => {
        if (confirm(`Remove deck "${d.name}"? Card progress is kept and returns if you re-import.`)) { store.removeDeck(d.id); refresh(); }
      };
      ul.appendChild(li);
    });
  }

  function renderPills() {
    const cards = store.selectedCards();
    const retired = cards.filter((c) => store.isRetired(c.id)).length;
    const missed = cards.filter((c) => store.progress(c.id).again > 0 && !store.isRetired(c.id)).length;
    $('pills').innerHTML =
      `<span class="pill">cards <b>${cards.length}</b></span>` +
      `<span class="pill">active <b>${cards.length - retired}</b></span>` +
      `<span class="pill">retired <b>${retired}</b></span>` +
      `<span class="pill">missed before <b>${missed}</b></span>`;
  }

  function renderSetup() {
    const s = store.settings();
    const cards = store.selectedCards();
    const tags = [...new Set(cards.flatMap((c) => c.tags))].sort();
    const sel = $('optTag'), prev = sel.value;
    sel.innerHTML = '<option value="">All tags</option>' + tags.map((t) => `<option ${t === prev ? 'selected' : ''}>${esc(t)}</option>`).join('');
    $('optGap').value = s.againGap;
    $('optLimit').value = s.limit;
    $('optShuffle').checked = s.shuffle;
    $('optReverse').checked = s.reverse;
    $('optWeak').checked = !!s.weakFirst;
    const pool = scheduler.buildQueue(cards, { tag: sel.value, shuffle: false, limit: 0 }, store.isRetired).length;
    $('pool').textContent = `${pool} ${pool === 1 ? 'card' : 'cards'} available for this session`;
    $('btnStart').disabled = pool === 0;
  }

  function refresh() {
    renderDecks();
    renderPills();
    if (!session) renderSetup();
    if (!$('view-browse').classList.contains('hidden')) renderBrowse();
  }

  function startSession() {
    const s = store.settings();
    const opts = {
      tag: $('optTag').value,
      limit: Math.max(0, +$('optLimit').value || 0),
      againGap: Math.max(1, +$('optGap').value || 3),
      shuffle: $('optShuffle').checked,
      weakFirst: $('optWeak').checked,
      progress: store.progress,
    };
    reverse = $('optReverse').checked;
    Object.assign(s, { againGap: opts.againGap, limit: opts.limit, shuffle: opts.shuffle, reverse, weakFirst: opts.weakFirst });
    store.save();
    const q = scheduler.buildQueue(store.selectedCards(), opts, store.isRetired);
    if (!q.length) return;
    session = new scheduler.Session(q, opts, store);
    $('setup').classList.add('hidden');
    $('summary').classList.add('hidden');
    $('stage').classList.remove('hidden');
    showCard();
  }

  function showCard() {
    const c = session.current();
    if (!c) return endSession();
    revealed = false;
    const [f, b] = reverse ? [c.back || '(blank)', c.front] : [c.front, c.back || '(blank)'];
    $('front').innerHTML = render(f);
    $('back').innerHTML = render(b);
    $('back').classList.add('hidden');
    $('divider').classList.add('hidden');
    $('hint').classList.remove('hidden');
    $('sideLabel').textContent = reverse ? 'BACK → recall front' : 'FRONT';
    $('metaDeck').textContent = c.deck || '';
    $('metaTags').textContent = c.tags.length ? '#' + c.tags.join(' #') : '';
    const p = store.progress(c.id);
    const cleared = session.cleared.size;
    $('metaCount').textContent = `${cleared}/${session.total} cleared · ${session.remaining()} in queue` + (p.again ? ` · missed ${p.again}x before` : '');
    $('bar').style.width = (100 * cleared / session.total) + '%';
    document.querySelectorAll('#answer [data-a]').forEach((b) => (b.disabled = true));
    $('btnUndo').disabled = !session.history.length;
    renderTally();
    $('card').focus();
  }

  function reveal() {
    if (!session || revealed) return;
    revealed = true;
    $('back').classList.remove('hidden');
    $('divider').classList.remove('hidden');
    $('hint').classList.add('hidden');
    document.querySelectorAll('#answer [data-a]').forEach((b) => (b.disabled = false));
  }

  function answer(kind) {
    if (!session || !revealed) return;
    session.answer(kind);
    renderPills();
    showCard();
  }

  function undo() {
    if (session && session.undo()) { renderPills(); showCard(); }
  }

  function renderTally() {
    const s = session.stats;
    $('tally').innerHTML = `<span class="a">again ${s.again}</span> · <span class="g">good ${s.good}</span> · <span class="k">retired ${s.known}</span>`;
  }

  function endSession() {
    if (!session) return;
    const s = session.stats, total = session.total, cleared = session.cleared.size;
    const firstTry = session.firstTryRate();
    $('stage').classList.add('hidden');
    $('summary').classList.remove('hidden');
    $('summary').innerHTML = `<h3>Session complete</h3>
      <div class="muted">${cleared} of ${total} cards cleared${session.remaining() ? ` · ended with ${session.remaining()} still queued` : ''}</div>
      <div class="grid3">
        <div><b style="color:var(--again)">${s.again}</b>again</div>
        <div><b style="color:var(--good)">${s.good}</b>good</div>
        <div><b style="color:var(--known)">${s.known}</b>retired</div>
      </div>
      <div class="muted">First-try recall: ${firstTry}%</div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="btnAgain">New session</button></div>`;
    $('btnAgain').onclick = () => { $('summary').classList.add('hidden'); $('setup').classList.remove('hidden'); renderSetup(); };
    session = null;
    refresh();
  }

  function renderBrowse() {
    const q = $('q').value.trim().toLowerCase();
    const onlyRetired = $('onlyRetired').checked;
    const cards = store.selectedCards().filter((c) => {
      if (onlyRetired && !store.isRetired(c.id)) return false;
      if (!q) return true;
      return (c.front + '\n' + c.back + '\n' + c.tags.join(' ')).toLowerCase().includes(q);
    });
    const shown = cards.slice(0, 1000);
    $('browseCount').textContent = `${cards.length} cards` + (cards.length > 1000 ? ' \u00b7 showing first 1000' : '');
    $('rows').innerHTML = shown.map((c) => {
      const p = store.progress(c.id);
      return `<tr class="${p.retired ? 'retired' : ''}">
        <td>${render(c.front)}</td><td>${render(c.back)}</td>
        <td class="tags">${esc(c.tags.join(' '))}</td><td class="tags">${esc(c.deck)}</td>
        <td class="num">${p.seen}/${p.again}</td>
        <td><input type="checkbox" data-id="${c.id}" ${p.retired ? 'checked' : ''}></td></tr>`;
    }).join('');
  }

  function switchView(v) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('hidden', s.id !== 'view-' + v));
    if (v === 'browse') renderBrowse();
  }

  function wire() {
    document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => switchView(t.dataset.view)));
    $('btnImport').onclick = () => $('fileDeck').click();
    $('drop').onclick = () => $('fileDeck').click();
    $('fileDeck').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
    $('urlForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('urlLoad');
      btn.disabled = true;
      const ok = await importLink($('urlInput').value);
      btn.disabled = false;
      if (ok) $('urlInput').value = '';
    };
    $('btnExport').onclick = () => download(`recall-lens-progress-${new Date().toISOString().slice(0, 10)}.json`, store.exportProgress());
    $('btnImportProg').onclick = () => $('fileProg').click();
    $('fileProg').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { log(`Progress loaded: ${store.importProgress(await f.text())} card records`); refresh(); }
      catch (err) { log(err.message, 'e'); }
    };

    const drop = $('drop');
    // Counts enter and leave events so the highlight clears when a drag ends or leaves the window.
    let dragDepth = 0;
    const setOver = (on) => drop.classList.toggle('over', on);
    document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; setOver(true); });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || !e.relatedTarget) { dragDepth = 0; setOver(false); }
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      setOver(false);
      if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
    });

    $('optTag').onchange = renderSetup;
    $('btnStart').onclick = startSession;
    $('card').onclick = reveal;
    document.querySelectorAll('#answer [data-a]').forEach((b) => (b.onclick = () => answer(b.dataset.a)));
    $('btnUndo').onclick = undo;
    $('btnEnd').onclick = endSession;

    $('q').oninput = renderBrowse;
    $('onlyRetired').onchange = renderBrowse;
    $('rows').onchange = (e) => {
      const id = e.target.dataset.id;
      if (id) { store.setRetired(id, e.target.checked); renderBrowse(); renderDecks(); renderPills(); }
    };

    document.addEventListener('keydown', (e) => {
      if (!session || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') { e.preventDefault(); reveal(); }
      else if (k === '1') answer('again');
      else if (k === '2') answer('good');
      else if (k === '3') answer('known');
      else if (k === 'z') undo();
      else if (k === 'escape') endSession();
    });
  }

  store.load();
  wire();
  refresh();
  importDeckLinksFromAddress();
})();
