/*
 * Orders cards within a session.
 * Again: the card returns after againGap cards. Good: the card leaves the session.
 * Known: the card is retired. Reviews are not scheduled across days.
 */
(function (root) {
  'use strict';
  const RL = (root.RL = root.RL || {});

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Removes retired cards, then applies the tag filter, order and limit.
  function buildQueue(cards, opts, isRetired) {
    let q = cards.filter((c) => !isRetired(c.id));
    if (opts.tag) q = q.filter((c) => c.tags.includes(opts.tag));
    if (opts.weakFirst && opts.progress) {
      // Most-missed cards first; ties in random order.
      shuffle(q);
      q.sort((a, b) => opts.progress(b.id).again - opts.progress(a.id).again);
    } else if (opts.shuffle) shuffle(q);
    if (opts.limit > 0) q = q.slice(0, opts.limit);
    return q;
  }

  class Session {
    constructor(queue, opts, store) {
      this.queue = queue.slice();
      this.total = queue.length;
      this.gap = Math.max(1, opts.againGap || 3);
      this.store = store;
      this.history = [];
      this.stats = { again: 0, good: 0, known: 0 };
      this.cleared = new Set();
      this.missed = new Set(); // Cards answered Again in this session.
    }
    current() { return this.queue[0] || null; }
    done() { return this.queue.length === 0; }
    remaining() { return this.queue.length; }
    firstTryRate() {
      const c = [...this.cleared];
      return c.length ? Math.round(100 * c.filter((id) => !this.missed.has(id)).length / c.length) : 0;
    }

    answer(kind) {
      const card = this.queue.shift();
      if (!card) return;
      const before = this.store.progress(card.id);
      this.history.push({ queue: [card, ...this.queue], prog: before, stats: { ...this.stats }, cleared: new Set(this.cleared), missed: new Set(this.missed), id: card.id });

      const p = { ...before, seen: before.seen + 1, last: new Date().toISOString() };
      if (kind === 'again') {
        p.again++;
        this.missed.add(card.id);
        this.queue.splice(Math.min(this.gap, this.queue.length), 0, card);
      } else if (kind === 'good') {
        p.good++;
        this.cleared.add(card.id);
      } else if (kind === 'known') {
        p.retired = true;
        this.cleared.add(card.id);
      }
      this.stats[kind]++;
      this.store.setProgress(card.id, p);
    }

    undo() {
      const h = this.history.pop();
      if (!h) return false;
      this.queue = h.queue;
      this.stats = h.stats;
      this.cleared = h.cleared;
      this.missed = h.missed;
      this.store.setProgress(h.id, h.prog);
      return true;
    }
  }

  RL.scheduler = { buildQueue, Session, shuffle };
})(typeof window !== 'undefined' ? window : globalThis);
