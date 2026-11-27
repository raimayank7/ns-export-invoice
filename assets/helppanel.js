/* Help panel: the "how to use" articles one tap away on every Nivesh Sahayak site (owner, 2026-11-06: "to use a software,
   knowledge about it is a must"). Each site keeps its own articles under /help/ (scripts/make_help.py); build.py writes
   /help/index.json on every site and /help/all.json (every site's articles) on the App.
     Help button in the title bar (data-help-open) or F1: a side panel (a bottom sheet on phones) lists the articles for the
     screen you are on first (App: by section, see SEC; a maker or tool site: its own articles), then this site's articles by
     topic; the search box looks through this site's articles (the App: every site's). An article opens inside the panel
     (its .help-art part, fetched; GitHub Pages lets other *.niveshsahayak.in sites read it), with a link to the full page.
     The command box (Ctrl K, desk.js) finds help articles too (NS.cmdMore).
   Translated help (scripts/help_tr.py): /help/index.<lang>.json (App: all.<lang>.json, English for sites not translated yet);
   a screen language without it gets the English list and a one-line note (hp.en). Screen words: NS.t('hp.*'). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc;
  function T(k, v) { return NS.t('hp.' + k, v); }
  var IN_APP = window.NS_CFG && NS_CFG.inApp;   /* a maker's copy inside the App (app.niveshsahayak.in/do/<site>/) */
  /* App sections and the articles that explain them, most useful first */
  var SEC = {
    home: ['dashboard', 'quick-entry', 'getting-started', 'search-and-shortcuts'], sales: ['sales-screen', 'new-document-inside-the-app', 'repeating-bills'],
    money: ['money-received', 'money-paid', 'opening-balances'], dues: ['dues-and-reminders', 'party-ledger', 'interest-and-credit-limits'], parties: ['party-ledger', 'group-reports'],
    st: ['party-ledger', 'bill-wise-and-adjust', 'interest-and-credit-limits'], grp: ['group-reports'], buy: ['purchase-bill', 'expenses'], exp: ['expenses'], cash: ['cash-and-bank-books', 'cheques'], books: ['cash-and-bank-books'],
    chq: ['cheques'], stock: ['stock-in-the-app'], b2make: ['production'], b2job: ['job-work'], b2jv: ['journal-entries', 'receipt-payment-any-ledgers'], capl: ['capital-and-loans'],
    b2fa: ['fixed-assets'], fin: ['final-accounts', 'trial-balance'], fam: ['manufacturing-account', 'partnership-accounts', 'trust-income-expenditure'],
    b2year: ['year-end'], reports: ['reports-to-excel', 'gst-from-the-app'], acx: ['gst-from-the-app'], stf: ['process-salary', 'staff-salary-loans', 'attendance-pf-esi'], tdsr: ['tds-on-bills-returns'], itx: ['income-tax-planner'], bimp: ['bank-statement-import'], mkimp: ['marketplace-payment-reports', 'bank-statement-import'],
    day: ['my-day', 'dues-and-reminders'], tools: ['all-tools-by-job', 'new-document-inside-the-app'], packs: ['trade-packs', 'additional-features'], features: ['additional-features'], settings: ['additional-features', 'where-data-is-kept'],
    coa: ['final-accounts', 'trial-balance'], acl: ['final-accounts', 'party-ledger'], dlist: ['dues-and-reminders', 'party-ledger'], clist: ['party-ledger', 'purchase-bill'], ssum: ['sales-screen', 'reports-to-excel'],
    psum: ['purchase-bill', 'reports-to-excel'], vreg: ['money-received', 'money-paid'], cbsum: ['cash-and-bank-books'], mprint: ['sales-screen'], b2gd: ['stock-in-the-app'],
    ord: ['orders-and-pending-goods', 'receipt-notes-and-returns'],   /* ERP round 2 (orders.js) */
    int: ['interest-and-credit-limits', 'bill-wise-and-adjust'], bw: ['bill-wise-and-adjust', 'interest-and-credit-limits', 'sales-and-purchase-ledgers', 'receipt-payment-any-ledgers']   /* ERP Round 2 (r2-billwise) */
  };
  SEC.masters = (SEC.masters || []).concat(['custom-fields']);   /* Masters › Custom fields and Remembered entries (ERP Round 2) */
  /* the help written with the pictures (19 Nov 2026) on the screens it explains; existing lists keep their order, these come after */
  [['masters', ['masters', 'bank-accounts', 'transporters-and-vehicles']], ['config', ['voucher-screens', 'custom-fields']], ['sales', ['voucher-screens', 'cancel-voucher']],
   ['buy', ['voucher-screens', 'cancel-voucher']], ['money', ['voucher-screens', 'cancel-voucher']], ['fin', ['accounting-reports', 'working-period-and-drill-down']],
   ['coa', ['accounting-reports']], ['os', ['bill-wise-and-adjust', 'dues-and-reminders']], ['exc', ['accounting-reports']], ['grp', ['accounting-reports']], ['vreg', ['accounting-reports']]]
    .forEach(function (x) { var l = SEC[x[0]] || (SEC[x[0]] = []); x[1].forEach(function (s) { if (l.indexOf(s) < 0) l.push(s); }); });
  /* screens added 25-27 Nov 2026: Messages, Bring data from other software, Print designs, Envelopes, From the add-on */
  [['msg', ['messages-sms-whatsapp', 'dues-and-reminders']], ['mig', ['bring-data-from-other-software', 'opening-balances']], ['pd', ['look-print-designs-envelopes']],
   ['env', ['look-print-designs-envelopes']], ['inbox', ['nsbiz-helper-add-on']], ['home', ['look-print-designs-envelopes']], ['dues', ['messages-sms-whatsapp']], ['settings', ['nsbiz-helper-add-on']]]
    .forEach(function (x) { var l = SEC[x[0]] || (SEC[x[0]] = []); x[1].forEach(function (s) { if (l.indexOf(s) < 0) l.push(s); }); });
  SEC.masters.sort(function (a, b) { return (b === 'masters') - (a === 'masters'); });   /* the Masters article first on its own screen */
  var DO = { ifsc: ['ifsc-code-checker', 'pin-code-finder'], pincode: ['pin-code-finder', 'distance-calculator'], distance: ['distance-calculator', 'pin-code-finder'] };
  var IDX = null, loading = null;
  var ALLHELP = false;   /* the App's help home: search every site's articles */
  function base() { return location.origin; }
  function mySite() { return IN_APP || (IDX && IDX.site) || ''; }
  /* this site's articles (and on the App every site's, for the search); inside the App's document copy, that maker's articles */
  function load() {
    var L = NS.lang ? NS.lang() : 'en';
    if (IDX && IDX.want === L) return Promise.resolve(IDX);
    if (loading && loading.want === L) return loading;
    /* the screen language's list when the help has been translated (help_tr.py), else English */
    var name = '/help/' + (IN_APP || isApp() || ALLHELP ? 'all' : 'index'), get = function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    loading = (L === 'en' ? get(name + '.json') : get(name + '.' + L + '.json').then(function (j) {
      /* an article written after the translation was made is still offered, in English */
      return get(name + '.json').then(function (e) {
        var have = {}; (j.articles || []).forEach(function (a) { have[(a.site || j.site) + '|' + a.slug] = 1; });
        (e.articles || []).forEach(function (a) { if (!have[(a.site || e.site) + '|' + a.slug]) j.articles.push(Object.assign({ site: e.site, siteName: e.name, lang: 'en' }, a)); });
        return j;
      }).catch(function () { return j; });
    }).catch(function () { return get(name + '.json'); })).catch(function (e) { if (/all$/.test(name)) return get('/help/index.json'); throw e; }).then(function (j) {   /* F6-11 */
      var all = (j.articles || []).map(function (a) { return Object.assign({ site: j.site, siteName: j.name }, a); });
      all.forEach(function (a) { a.lang = a.lang || j.lang || 'en'; });
      IDX = { site: IN_APP || j.site || (isApp() ? 'app' : ''), name: j.name || '', topics: j.topics || [], all: all, lang: j.lang || 'en', want: L };
      if (isApp() && !IN_APP) IDX.site = 'app';
      return IDX;
    }).catch(function (e) { loading = null; throw e; });
    loading.want = L;
    return loading;
  }
  function isApp() { return !!(window.NSApp && $('#app')); }
  function mine() { return IDX ? IDX.all.filter(function (a) { return !a.site || a.site === mySite(); }) : []; }
  /* the screen you are on: App section (or the maker open inside it), else every article of this site */
  function forScreen() {
    if (!IDX) return [];
    if (isApp() && !IN_APP) {
      var h = (location.hash || '#home').slice(1), sec = h.split('/')[0] || 'home';
      if (sec === 'do') {
        var s = h.split('/')[1], own = IDX.all.filter(function (a) { return a.site === s; }).slice(0, 5);
        /* the look-up screens (ifsc, pincode, distance) are other sites shown in a frame: their help is kept with the App's own articles */
        return own.length || !DO[s] ? own : IDX.all.filter(function (a) { return a.site === 'app' && DO[s].indexOf(a.slug) >= 0; }).sort(function (x, y) { return DO[s].indexOf(x.slug) - DO[s].indexOf(y.slug); });
      }
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
  /* ---------- the search box on the help home (owner 22 Nov): articles and their common questions, as you type; nothing found = ask us ---------- */
  function findBox() {
    var box = $('[data-help-find]'); if (!box || box._on) return; box._on = 1;
    if (box.getAttribute('data-help-find') === 'all') ALLHELP = true;   /* the App's help: every site's articles */
    var inp = $('input', box), out = $('.hf-out', box), t0;
    function low(s) { return String(s || '').toLowerCase(); }
    /* a typed question ("how do I add a second godown?"): small words are left out, and an answer needs at least half of the rest */
    var STOP = ' how what why when where which who can could do does did is are was the a an to of in on for and or my i me we our it this that with from by be at as if any not no will should would kaise kya kyon kab kahan kaun hai hain ka ki ke ko se me mein par aur ya kare karen karna karte hota hoti nu da di de vich te ate kiven ki hai ne ';
    function keyWords(q) { var w = words(q).filter(function (x) { return STOP.indexOf(' ' + x + ' ') < 0; }); return w.length ? w : words(q); }
    function stem(w) { return w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '') : w; }
    function score(ws, hi, lo) {
      var sc = 0, n = 0;
      ws.forEach(function (w) { var x = stem(w); if (hi.indexOf(x) >= 0) { sc += 3; n++; } else if (lo.indexOf(x) >= 0) { sc += 1; n++; } });
      return n && n >= Math.ceil(ws.length / 2) ? sc + n * 2 : 0;
    }
    function qaHits(ws) {
      var hits = [];
      IDX.all.forEach(function (a) { (a.faq || []).forEach(function (f) { var sc = score(ws, low(f[0]), low(f[1])); if (sc) hits.push({ a: a, f: f, sc: sc }); }); });
      return hits.sort(function (x, y) { return y.sc - x.sc; }).slice(0, 5);
    }
    function artHits(ws) {
      return IDX.all.map(function (a) {
        var sc = score(ws, low(a.title + ' ' + (a.card || '')), low((a.summary || '') + ' ' + (a.keywords || []).join(' ') + ' ' + (a.topicName || '') + ' ' + (a.faq || []).map(function (f) { return f[0]; }).join(' ')));
        return sc ? { a: a, sc: sc + (a.site === mySite() ? 1 : 0) } : null;
      }).filter(Boolean).sort(function (x, y) { return y.sc - x.sc; }).slice(0, 8).map(function (x) { return x.a; });
    }
    function draw() {
      var q = inp.value.trim();
      if (!q) { out.innerHTML = ''; return; }
      load().then(function () {
        if (inp.value.trim() !== q) return;
        var ws = keyWords(q), arts = artHits(ws), qs = qaHits(ws), h = '';
        if (qs.length) h += '<h3 class="hf-h">' + esc(T('fq')) + '</h3>' + qs.map(function (x) {
          return '<details class="faq"><summary>' + esc(x.f[0]) + ' <small class="hf-src">' + esc(x.a.card || x.a.title) + '</small></summary><p>' + esc(x.f[1]) + '</p><p class="hf-more"><a href="' + esc(urlOf(x.a)) + '">' + esc(x.a.card || x.a.title) + ' ›</a></p></details>'; }).join('');
        if (arts.length) h += '<h3 class="hf-h">' + esc(T('fa')) + '</h3><ul class="hf-list">' + arts.map(function (a) {
          return '<li><a href="' + esc(urlOf(a)) + '"><b>' + esc(a.card || a.title) + '</b><span>' + esc(cut(a.summary, 120)) + '</span>' + (a.site && a.site !== IDX.site ? '<small>' + esc(a.siteName || a.site) + '</small>' : '') + '</a></li>'; }).join('') + '</ul>';
        h += '<p class="hf-none">' + esc(arts.length || qs.length ? T('fnot') : T('fnone')) + ' <button type="button" class="btn sm" data-hf-ask>' + esc(T('fask')) + '</button></p>';
        out.innerHTML = h;
      }, function () { out.innerHTML = '<p class="soft">' + esc(T('offline')) + '</p>'; });
    }
    inp.addEventListener('input', function () { clearTimeout(t0); t0 = setTimeout(draw, 150); });
    out.addEventListener('click', function (e) {
      if (!e.target.closest('[data-hf-ask]')) return;
      var ask = $('#ask'), ta = $('.help-ask textarea');
      if (ta && !ta.value.trim()) ta.value = inp.value.trim();
      if (ask) ask.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (ta) setTimeout(function () { ta.focus(); }, 400);
    });
    if (/^#?q=/.test(location.hash)) { inp.value = decodeURIComponent(location.hash.replace(/^#?q=/, '')); draw(); }
  }
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
    var n = $('[data-hp-note]', dlg), l = NS.lang ? NS.lang() : 'en'; n.hidden = l === 'en' || !!(IDX && IDX.lang === l); n.textContent = T('en');
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
      var al = a.lang || 'en', rtl = /^(ur|ks|sd)$/.test(al);
      body.innerHTML = (al === 'en' && NS.lang && NS.lang() !== 'en' ? '<p class="hp-note">' + esc(T('en')) + '</p>' : '') + '<article class="hp-art" lang="' + esc(al) + '" dir="' + (rtl ? 'rtl' : 'ltr') + '">' + art.innerHTML + '</article><p class="hp-full"><a href="' + esc(full) + '" target="_blank" rel="noopener">' + esc(T('page')) + ' ↗</a></p>';
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', findBox); else findBox();
  /* a site without help articles has no Help button (build.py adds it only where /help/ exists) */
})();
