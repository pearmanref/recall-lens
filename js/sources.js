/*
 * Recall Lens — sources.js
 * Layer 0: gets deck text from somewhere other than a dropped file.
 * Parsers stay pure; this module only answers "where does the text come from, and may we fetch it".
 *
 * Accepted:
 *   https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
 *   https://github.com/<owner>/<repo>/blob/<ref>/<path>   -> converted to raw
 *   https://github.com/<owner>/<repo>/raw/<ref>/<path>    -> converted to raw
 *   https://gist.githubusercontent.com/...                 -> as is
 *   decks/x.csv, samples/x.yaml                            -> same site as the page, hosted only
 */
(function (root) {
  'use strict';
  const RL = (root.RL = root.RL || {});

  const ALLOWED_HOSTS = ['raw.githubusercontent.com', 'gist.githubusercontent.com'];
  const MAX_BYTES = 2 * 1024 * 1024;
  const TIMEOUT_MS = 15000;
  const MAX_LINK_DECKS = 10;

  class SourceError extends Error {}

  function fileName(u) {
    const last = u.pathname.split('/').filter(Boolean).pop() || 'deck';
    try { return decodeURIComponent(last); } catch (e) { return last; }
  }

  // Returns { url, kind: 'github' | 'site', name } or throws SourceError. Makes no network request.
  function normalizeUrl(input, pageHref) {
    const s = String(input == null ? '' : input).trim();
    if (!s) throw new SourceError('Paste a link first.');

    const page = pageHref ? new URL(pageHref) : null;
    const pageIsWeb = !!page && (page.protocol === 'https:' || page.protocol === 'http:');

    // Relative path: only on a hosted page, only downward from the page's folder.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      if (!pageIsWeb) throw new SourceError('Paths like decks/x.csv only work on the hosted site. Use a full GitHub link.');
      let decoded = s;
      try { decoded = decodeURIComponent(s); } catch (e) { /* keep raw */ }
      if ([s, decoded].some((x) => x.startsWith('/') || x.startsWith('\\') || /(^|[\/\\])\.\.([\/\\]|$)/.test(x))) {
        throw new SourceError('That path points outside this site.');
      }
      if (!/^[\w.\-\/%]+$/.test(s)) throw new SourceError('That is not a valid link or file path.');
      const u = new URL(s, page);
      u.hash = '';
      return { url: u.href, kind: 'site', name: fileName(u) };
    }

    let u;
    try { u = new URL(s); } catch (e) { throw new SourceError('That is not a valid link.'); }

    // Absolute link to the page's own site counts as a site path.
    if (pageIsWeb && u.origin === page.origin) {
      u.hash = '';
      return { url: u.href, kind: 'site', name: fileName(u) };
    }

    if (u.protocol !== 'https:') throw new SourceError('Link must start with https://');
    if (u.username || u.password || u.port) throw new SourceError('That link has a login or port in it. Use a plain GitHub file link.');

    if (u.hostname === 'github.com') {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
      if (!m) throw new SourceError('Use a link to a single file on GitHub, not a repo or folder page.');
      u = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
    }

    if (!ALLOWED_HOSTS.includes(u.hostname)) {
      throw new SourceError('Only GitHub links are supported: github.com, raw.githubusercontent.com, gist.githubusercontent.com');
    }
    u.hash = '';
    return { url: u.href, kind: 'github', name: fileName(u) };
  }

  // Downloads text with the proposal's limits. Throws SourceError with a user-facing message.
  async function fetchText(src, opts) {
    const o = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const where = src.kind === 'github' ? 'GitHub' : 'the site';
    let res;
    try {
      res = await (o.fetch || root.fetch)(src.url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: o.refresh ? 'no-cache' : 'default',
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (ctrl.signal.aborted) throw new SourceError(`${where} did not answer within 15 seconds.`);
      throw new SourceError(`Couldn't download from ${where}. Check your connection; the link may also redirect.`);
    }
    try {
      if (res.status === 404) throw new SourceError('Not found, 404. Check the link, and that the repo is public.');
      if (res.status === 429) throw new SourceError('GitHub is limiting downloads right now, 429. Try again in a few minutes.');
      if (!res.ok) throw new SourceError(`Download failed with status ${res.status}.`);
      const declared = Number(res.headers.get('content-length'));
      if (declared > MAX_BYTES) throw new SourceError('File is larger than 2 MB, not loaded.');

      if (!res.body || !res.body.getReader) {
        const t = await res.text();
        if (t.length > MAX_BYTES) throw new SourceError('File is larger than 2 MB, not loaded.');
        return t;
      }
      const reader = res.body.getReader();
      const parts = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) {
          ctrl.abort();
          throw new SourceError('File is larger than 2 MB, not loaded.');
        }
        parts.push(value);
      }
      const all = new Uint8Array(total);
      let off = 0;
      parts.forEach((p) => { all.set(p, off); off += p.length; });
      return new TextDecoder('utf-8').decode(all);
    } catch (e) {
      if (e instanceof SourceError) throw e;
      if (ctrl.signal.aborted) throw new SourceError(`${where} did not answer within 15 seconds.`);
      throw new SourceError(`Download from ${where} was interrupted.`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Reads ?deck= values from a page URL; returns { links, cleanHref }.
  function deckLinksFrom(pageHref) {
    const u = new URL(pageHref);
    const links = u.searchParams.getAll('deck').filter(Boolean);
    u.searchParams.delete('deck');
    return { links: links.slice(0, MAX_LINK_DECKS), dropped: Math.max(0, links.length - MAX_LINK_DECKS), cleanHref: u.href };
  }

  RL.sources = { normalizeUrl, fetchText, deckLinksFrom, SourceError, ALLOWED_HOSTS, MAX_BYTES, MAX_LINK_DECKS };
})(typeof window !== 'undefined' ? window : globalThis);
