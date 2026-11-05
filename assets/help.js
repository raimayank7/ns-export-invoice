/* NS help (Batch 3): a small "?" next to the heading of each part of a screen; a tap shows a short tip in the user's language.
   It finds the headings by their text (the heading key's text in the current language), so the document makers, slips, the App,
   My data and the door sites get tips without changing their own files. HELP: heading key -> tip key (EN 'hp.*' in i18n.js). */
(function () {
  'use strict';
  var NS = window.NS;
  if (!NS) return;
  var HELP = {
    'lg.biz': 'hp.biz', 'lg.details': 'hp.details', 'lg.billto': 'hp.billto', 'lg.qto': 'hp.billto', 'lg.custto': 'hp.billto', 'lg.issuedto': 'hp.billto', 'lg.vendor': 'hp.vendor',
    'lg.supplier': 'hp.supplier', 'lg.consignee': 'hp.consignee', 'lg.items': 'hp.items', 'lg.notes': 'hp.notes', 'lg.einv': 'hp.einv', 'lg.exp': 'hp.exp',
    's.lg.from': 'hp.s.from', 's.lg.pay': 'hp.s.pay', 's.lg.to': 'hp.s.to', 's.lg.lines': 'hp.s.lines', 's.lg.tdsrcm': 'hp.s.tdsrcm', 's.lg.sign': 'hp.s.sign',
    's.lg.tenant': 'hp.s.tenant', 's.lg.landlord': 'hp.s.landlord', 's.lg.rent': 'hp.s.rent', 's.lg.emp': 'hp.s.emp', 's.lg.employer': 'hp.s.employer', 's.lg.att': 'hp.s.att',
    's.lg.earn': 'hp.s.earn', 's.lg.ded': 'hp.s.ded', 's.lg.entries': 'hp.s.entries',
    'app.home': 'hp.a.home', 'app.sales': 'hp.a.sales', 'app.buy': 'hp.a.buy', 'app.money': 'hp.a.money', 'app.dues': 'hp.a.dues', 'app.parties': 'hp.a.parties', 'app.cash': 'hp.a.cash',
    'app.khata': 'hp.a.khata', 'app.preg': 'hp.a.preg', 'app.ebook': 'hp.a.ebook', 'app.chq': 'hp.a.chq', 'app.books': 'hp.a.books',
    'my.t.biz': 'hp.m.biz', 'my.t.party': 'hp.m.party', 'my.t.item': 'hp.m.item', 'my.t.doc': 'hp.m.doc', 'my.t.settings': 'hp.m.settings', 'hub.backup': 'hp.m.backup',
    'b3.pw.t': 'hp.lock', 'b3.ac.t': 'hp.acct', 'b3.gd.t': 'hp.gdrive'
  };
  var SEL = 'main legend, main h2, main h3, dialog h2, dialog h3';
  var match = null, seq = 0;
  function rx(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{\w+\\?\}|\{\w+\}/g, '.+'); }
  /* the heading texts of the current language, as patterns ({Doc} stands for any word) */
  function build() {
    match = Object.keys(HELP).map(function (k) { var v = NS.t(k); return v && v !== k ? [new RegExp('^' + rx(v) + '$', 'i'), HELP[k]] : null; }).filter(Boolean);
  }
  function own(el) {
    var n = el.firstChild;
    var s = n && n.nodeType === 3 && n.textContent.trim() ? n.textContent : el.textContent;
    return s.replace(/\s+/g, ' ').trim();
  }
  function scan() {
    if (!match) build();
    NS.$$(SEL).forEach(function (el) {
      if (el.hasAttribute('data-hp') || el.closest('.hp-tip,.prose,.ft,.hd,.sheet,.paper')) return;
      var txt = own(el), hit = null;
      for (var i = 0; i < match.length && !hit; i++) if (match[i][0].test(txt)) hit = match[i][1];
      el.setAttribute('data-hp', hit || '');
      if (!hit) return;
      var id = 'hp-' + (++seq), b = NS.el('button', { type: 'button', 'class': 'hp-q', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': NS.t('hp.btn', { what: txt }), title: NS.t('hp.btn', { what: txt }) }, '?');
      var tip = NS.el('p', { id: id, 'class': 'hp-tip', hidden: '' });
      tip.textContent = NS.t(hit);
      el.appendChild(b);
      if (el.tagName === 'LEGEND') el.parentNode.insertBefore(tip, el.nextSibling); else el.parentNode.insertBefore(tip, el.nextSibling);
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var show = tip.hidden; tip.hidden = !show; b.setAttribute('aria-expanded', show ? 'true' : 'false');
      });
    });
  }
  var t;
  function soon() { clearTimeout(t); t = setTimeout(scan, 120); }
  function start() {
    scan();
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].addedNodes.length) { soon(); return; }
    }).observe(document.body, { childList: true, subtree: true });
    /* language changed: headings are drawn again by their own code; forget the old patterns and tips */
    document.addEventListener('ns-lang', function () {
      match = null;
      NS.$$('[data-hp]').forEach(function (el) { el.removeAttribute('data-hp'); var b = NS.$('.hp-q', el); if (b) { var tp = document.getElementById(b.getAttribute('aria-controls')); if (tp) tp.remove(); b.remove(); } });
      soon();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
