/* Help panel: the "how to use" articles one tap away on every Nivesh Sahayak site (owner, 2026-11-06: "to use a software,
   knowledge about it is a must"). Each site keeps its own articles under /help/ (scripts/make_help.py); build.py writes
   /help/index.json on every site and /help/all.json (every site's articles) on the App.
     Help button in the title bar (data-help-open) or F1: a side panel (a bottom sheet on phones) lists the articles for the
     screen you are on first (App: by section, see SEC; a maker or tool site: its own articles), then this site's articles by
     topic; the search box looks through this site's articles (the App: every site's). An article opens inside the panel
     (its .help-art part, fetched; GitHub Pages lets other *.niveshsahayak.in sites read it), with a link to the full page.
     The command box (Ctrl K, desk.js) finds help articles too (NS.cmdMore).
   Articles are English for now: other screen languages see a one-line note (hp.en). Screen words: NS.t('hp.*'). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc;
  function T(k, v) { return NS.t('hp.' + k, v); }
  var IN_APP = window.NS_CFG && NS_CFG.inApp;   /* a maker's copy inside the App (app.niveshsahayak.in/do/<site>/) */
  /* App sections and the articles that explain them, most useful first */
  var SEC = {
    home: ['dashboard', 'getting-started', 'search-and-shortcuts'], sales: ['sales-screen', 'new-document-inside-the-app', 'repeating-bills'],
    money: ['money-received', 'money-paid', 'opening-balances'], dues: ['dues-and-reminders', 'party-ledger'], parties: ['party-ledger', 'group-reports'],
    st: ['party-ledger'], grp: ['group-reports'], buy: ['purchase-bill', 'expenses'], exp: ['expenses'], cash: ['cash-and-bank-books', 'cheques'], books: ['cash-and-bank-books'],
    chq: ['cheques'], stock: ['stock-in-the-app'], b2make: ['production'], b2job: ['job-work'], b2jv: ['journal-entries'], capl: ['capital-and-loans'],
    b2fa: ['fixed-assets'], fin: ['final-accounts', 'trial-balance'], fam: ['manufacturing-account', 'partnership-accounts', 'trust-income-expenditure'],
    b2year: ['year-end'], reports: ['reports-to-excel', 'gst-from-the-app'], acx: ['gst-from-the-app'], stf: ['staff-salary-loans', 'capital-and-loans'], settings: ['additional-features', 'where-data-is-kept']
  };
  var IDX = null, loading = null;
  function base() { return location.origin; }
  function mySite() { return IN_APP || (IDX && IDX.site) || ''; }
  /* this site's articles (and on the App every site's, for the search); inside the App's document copy, that maker's articles */
  function load() {
    if (IDX) return Promise.resolve(IDX);
    if (loading) return loading;
    var url = '/help/' + (IN_APP || isApp() ? 'all.json' : 'index.json');
    loading = fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      var all = (j.articles || []).map(function (a) { return Object.assign({ site: j.site, siteName: j.name }, a); });
      IDX = { site: IN_APP || j.site || (isApp() ? 'app' : ''), name: j.name || '', topics: j.topics || [], all: all };
      if (isApp() && !IN_APP) IDX.site = 'app';
      return IDX;
    }).catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function isApp() { return !!(window.NSApp && $('#app')); }
  function mine() { return IDX ? IDX.all.filter(function (a) { return !a.site || a.site === mySite(); }) : []; }
  /* the screen you are on: App section (or the maker open inside it), else every article of this site */
  function forScreen() {
    if (!IDX) return [];
    if (isApp() && !IN_APP) {
      var h = (location.hash || '#home').slice(1), sec = h.split('/')[0] || 'home';
      if (sec === 'do') { var s = h.split('/')[1]; return IDX.all.filter(function (a) { return a.site === s; }).slice(0, 5); }
      var by = {}; IDX.all.forEach(function (a) { if (a.site === 'app') by[a.slug] = a; });
      return (SEC[sec] || SEC.home).map(function (k) { return by[k]; }).filter(Boolean);
    }
    return mine().slice(0, 5);
  }
  function words(s) { return String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length > 1; }); }
  function search(q) {
    var ws = words(q); if (!ws.length || !IDX) return [];
    return IDX.all.map(function (a) {
      var title = (a.title + ' ' + (a.card || '')).toLowerCase(), rest = ((a.summary || '') + ' ' + (a.keywords || []).join(' ') + ' ' + (a.topicName || '') + ' ' + (a.siteName || '')).toLowerCase(), sc = 0;
      for (var i = 0; i < ws.length; i++) { var w = ws[i]; if (title.indexOf(w) >= 0) sc += 3; else if (rest.indexOf(w) >= 0) sc += 1; else return null; }
      if (a.site === mySite()) sc += 1;
      return { a: a, sc: sc };
    }).filter(Boolean).sort(function (x, y) { return y.sc - x.sc; }).slice(0, 30).map(function (x) { return x.a; });
  }
  /* where an article is read from: this site's own address, else the full address of the site that keeps it */
  function urlOf(a) { return a.site && a.site !== (IDX && IDX.site) && a.url ? a.url : (IN_APP && a.url ? a.url : a.path); }

  /* ---------- the panel ---------- */
  var dlg, body, inp, view = 'list';
  function build() {
    dlg = NS.el('dialog', { id: 'ns-help', 'class': 'help-pnl', 'aria-labelledby': 'ns-help-t' });
    dlg.innerHTML = '<div class="hp-hd"><button type="button" class="icon-btn hp-back" data-hp-back hidden></button><h2 id="ns-help-t"></h2><button type="button" class="icon-btn" data-hp-x></button></div>' +
      '<div class="hp-find"><input type="search" dir="auto" autocomplete="off" spellcheck="false"></div><p class="hp-note" data-hp-note hidden></p><div class="hp-body" aria-live="polite"></div>' +
      '<p class="hp-ft"><a data-hp-all target="_blank" rel="noopener"></a></p>';
    document.body.appendChild(dlg);
    body = $('.hp-body', dlg); inp = $('input', dlg);
    $('[data-hp-x]', dlg).addEventListener('click', function () { dlg.close(); });
    $('[data-hp-back]', dlg).addEventListener('click', function () { list(); inp.focus(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    inp.addEventListener('input', function () { list(); });
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hp-a]');
      if (b) { e.preventDefault(); openArt(IDX.all[+b.getAttribute('data-hp-a')]); return; }
      var a = e.target.closest('a[href]');
      if (a && view === 'art' && /\/help\/[^#?]+/.test(a.pathname) && /niveshsahayak\.in$|^localhost$|^127\.0\.0\.1$/.test(a.hostname)) {
        var hit = IDX && IDX.all.filter(function (x) { return a.pathname === x.path && (a.host === location.host || (x.url && x.url.indexOf('//' + a.host + '/') > 0)); })[0];
        if (hit) { e.preventDefault(); openArt(hit); }
      }
    });
  }
  function words2() { $('#ns-help-t', dlg).textContent = T('title'); $('[data-hp-x]', dlg).setAttribute('aria-label', NS.t('close')); $('[data-hp-x]', dlg).textContent = '✕';
    var bk = $('[data-hp-back]', dlg); bk.setAttribute('aria-label', T('back')); bk.textContent = document.documentElement.dir === 'rtl' ? '→' : '←';
    inp.placeholder = T('find'); inp.setAttribute('aria-label', T('find'));
    var n = $('[data-hp-note]', dlg), l = NS.lang ? NS.lang() : 'en'; n.hidden = l === 'en'; n.textContent = T('en');
    var all = $('[data-hp-all]', dlg); all.textContent = T('all') + ' ›'; all.href = IN_APP && IDX ? (mine()[0] || {}).url ? String((mine()[0] || {}).url).replace(/\/help\/.*$/, '/help/') : '/help/' : '/help/';
  }
  /* q: search words to start with; art: an article to show straight away (from the command box) */
  function open(q, art) {
    if (!dlg) build();
    words2(); inp.value = q || ''; view = 'list';
    body.innerHTML = '<p class="soft">' + esc(T('loading')) + '</p>';
    if (!dlg.open) dlg.showModal();
    inp.focus();
    load().then(function () { words2(); if (art) openArt(art); else list(); }, function () { body.innerHTML = '<p class="soft">' + esc(T('offline')) + '</p>'; });
  }
  function item(a) {
    var i = IDX.all.indexOf(a);
    return '<li><button type="button" class="hp-it" data-hp-a="' + i + '"><b>' + esc(a.card || a.title) + '</b><span>' + esc(cut(a.summary, 110)) + '</span>' +
      (a.site && a.site !== IDX.site ? '<small>' + esc(a.siteName || a.site) + '</small>' : '') + '</button></li>';
  }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function list() {
    view = 'list'; $('[data-hp-back]', dlg).hidden = true;
    if (!IDX) return;
    var q = inp.value.trim(), h = '';
    if (q) {
      var r = search(q);
      h = r.length ? '<h3>' + esc(T('found', { n: r.length })) + '</h3><ul class="hp-l">' + r.map(item).join('') + '</ul>' : '<p class="soft">' + esc(T('none')) + '</p>';
    } else {
      var s = forScreen(), seen = {}; s.forEach(function (a) { seen[a.path + a.site] = 1; });
      if (s.length) h += '<h3>' + esc(T('screen')) + '</h3><ul class="hp-l">' + s.map(item).join('') + '</ul>';
      var rest = mine().filter(function (a) { return !seen[a.path + a.site]; }), by = {}, order = [];
      rest.forEach(function (a) { var k = a.topicName || ''; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(a); });
      order.forEach(function (k) { h += '<details class="hp-topic"><summary>' + esc(k || T('more')) + ' <span class="soft">(' + by[k].length + ')</span></summary><ul class="hp-l">' + by[k].map(item).join('') + '</ul></details>'; });
      if (!h) h = '<p class="soft">' + esc(T('none')) + '</p>';
    }
    body.innerHTML = h; body.scrollTop = 0;
  }
  var CACHE = {};
  function openArt(a) {
    if (!a) return;
    view = 'art'; $('[data-hp-back]', dlg).hidden = false;
    var u = urlOf(a), full = new URL(u, base()).href;
    body.innerHTML = '<p class="soft">' + esc(T('loading')) + '</p>';
    (CACHE[full] ? Promise.resolve(CACHE[full]) : fetch(full).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })).then(function (html) {
      CACHE[full] = html;
      if (view !== 'art') return;
      var doc = new DOMParser().parseFromString(html, 'text/html'), art = doc.querySelector('.help-art') || doc.querySelector('main');
      if (!art) throw new Error('no article');
      $$('.crumbs, .cta-box, script, .sponsor-slot, [data-sponsor]', art).forEach(function (x) { x.remove(); });
      $$('a[href]', art).forEach(function (x) { x.setAttribute('href', new URL(x.getAttribute('href'), full).href); if (!/\/help\//.test(x.getAttribute('href'))) { x.target = '_blank'; x.rel = 'noopener'; } });
      $$('img[src]', art).forEach(function (x) { x.setAttribute('src', new URL(x.getAttribute('src'), full).href); x.loading = 'lazy'; });
      var h1 = $('h1', art); if (h1) { var h = document.createElement('h3'); h.className = 'hp-h1'; h.innerHTML = h1.innerHTML; h1.replaceWith(h); }
      body.innerHTML = '<article class="hp-art" lang="en" dir="ltr">' + art.innerHTML + '</article><p class="hp-full"><a href="' + esc(full) + '" target="_blank" rel="noopener">' + esc(T('page')) + ' ↗</a></p>';
      body.scrollTop = 0;
      var t = $('.hp-h1', body); if (t) { t.tabIndex = -1; t.focus(); }
    }).catch(function () {
      body.innerHTML = '<p class="soft">' + esc(T('offline')) + '</p><p><a href="' + esc(full) + '" target="_blank" rel="noopener">' + esc(T('page')) + ' ↗</a></p>';
    });
  }
  NS.helpOpen = open;

  /* ---------- the button, F1 and the command box ---------- */
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-help-open]'); if (b) { e.preventDefault(); open(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (dlg && dlg.open) dlg.close(); else open(); } });
  (NS.cmdMore = NS.cmdMore || []).push(function () {
    return load().then(function () {
      return IDX.all.map(function (a) { return { g: 'help', t: a.card || a.title, s: a.site && a.site !== IDX.site ? a.siteName : cut(a.summary, 70), e: (a.title + ' ' + (a.keywords || []).join(' ')), run: function () { open('', a); } }; });
    }).catch(function () { return []; });
  });
  /* a site without help articles has no Help button (build.py adds it only where /help/ exists) */
})();
