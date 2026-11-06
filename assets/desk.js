/* The software window, on every Nivesh Sahayak site (build.py adds this file and desk.css to every site, so new sites get it too).
   build.py draws the parts in the HTML: slim title bar with a menu button and the command box button, the side menu (this site's
   screens and guides, the App and saved data, every document maker, every feature site, the Nivesh Sahayak pages) and the status bar.
   This file makes them work: side menu folds to icons (Ctrl+B) or slides in on phones, the App's own screens move into the side menu,
   status bar (business, financial year, where the data is kept, online or offline, last backup), command box (Ctrl+K: every screen,
   every tool, every party and saved document, every entry form, settings), keyboard shortcuts, the Install button, and in-app confirm
   boxes (NS.ask) instead of the browser's pop-ups. Inside the App's frame (html.embed) the page shows no window parts of its own.
   It reads the App only through window.NSApp. Screen words: NS.t('desk.<key>') (English in i18n.js, other languages in engine/lang). */
(function () {
  'use strict';
  if (!window.NS || !NS.$) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, root = document.documentElement;
  function T(k, v) { return NS.t('desk.' + k, v); }
  function A() { return window.NSApp; }
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4';
  function ic(d) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>'; }
  /* icons for the App's own screens (the other side-menu icons are CSS masks in desk.css, by data-ic) */
  var SECIC = { home: 'home', sales: 'doc', money: 'money', dues: 'clock', buy: 'cart', parties: 'people', cash: 'bank', chq: 'cheque', books: 'book', khata: 'book', preg: 'cart', ebook: 'cart',
    repeat: 'repeat', reports: 'chart', b2jv: 'journal', b2fa: 'asset', b2gd: 'box', b2make: 'factory', b2profit: 'trend', b2sman: 'badge', b2year: 'calendar', grp: 'layers', fin: 'scale', fam: 'factory', capl: 'coins', b2job: 'wrench', ledger: 'book', move: 'trend', st: 'list',
    entries: 'list', low: 'alert', biz: 'shop', party: 'people', pgroups: 'list', item: 'box', igroups: 'list', doc: 'doc', settings: 'set', backup: 'data', bin: 'trash', log: 'clock' };
  /* screen lists that stay inside the page (my., the stock site...) get the same icons */
  function secIcons() { $$('.hub-nav a[data-sec]:not([data-ic])').forEach(function (a) { var k = SECIC[a.getAttribute('data-sec')]; if (k) a.setAttribute('data-ic', k); }); }

  /* ---------- in-app confirm box: NS.ask(message, {ok, no, danger}) -> Promise<boolean> ---------- */
  var askDlg;
  NS.ask = function (msg, o) {
    o = o || {};
    if (!askDlg) {
      askDlg = NS.el('dialog', { id: 'desk-ask', class: 'desk-ask', 'aria-labelledby': 'desk-ask-m' });
      askDlg.innerHTML = '<p id="desk-ask-m"></p><div class="btns"><button type="button" class="btn primary" data-ok></button><button type="button" class="btn" data-no></button></div>';
      document.body.appendChild(askDlg);
    }
    $('#desk-ask-m', askDlg).textContent = msg;
    var ok = $('[data-ok]', askDlg), no = $('[data-no]', askDlg);
    ok.textContent = o.ok || T('ok'); no.textContent = o.no || T('cancel');
    ok.classList.toggle('danger', !!o.danger);
    return new Promise(function (res) {
      var done = false;
      function fin(v) { if (done) return; done = true; ok.onclick = no.onclick = null; askDlg.onclose = null; if (askDlg.open) askDlg.close(); res(v); }
      ok.onclick = function () { fin(true); }; no.onclick = function () { fin(false); };
      askDlg.onclose = function () { fin(false); };
      askDlg.showModal(); (o.danger ? no : ok).focus();
    });
  };

  /* ---------- side menu ---------- */
  function standalone() { return matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches || navigator.standalone === true; }
  var side, sbar, deferredInstall = null;
  function wide() { return matchMedia('(min-width: 861px)').matches; }
  function mini(force) {
    var on = typeof force === 'boolean' ? force : !root.classList.contains('side-mini');
    root.classList.toggle('side-mini', on); if (typeof force !== 'boolean') LS.set('ns-side-mini', on ? '1' : '0');
    var b = $('[data-side-mini]'); if (b) b.setAttribute('aria-pressed', String(on));
  }
  function drawer(open) {
    root.classList.toggle('side-open', open);
    var b = $('[data-side-btn]'); if (b) b.setAttribute('aria-expanded', String(open));
    var sh = $('[data-side-shade]'); if (sh) sh.hidden = !open;
    if (open) { var f = $('a[aria-current=page], a', side); if (f) f.focus(); }
  }
  function toggleMenu() { if (wide()) mini(); else drawer(!root.classList.contains('side-open')); }
  /* the App (and the money door sites) keep their own screen list: it moves to the top of the side menu */
  function adoptHub() {
    secIcons();
    var hub = $('#app .hub-nav'), own = $('.side-own', side) || null;
    if (!hub || hub.hasAttribute('data-desk')) return;
    hub.setAttribute('data-desk', '');
    $$('a[data-sec]', hub).forEach(function (a, i) {
      a.setAttribute('data-ic', SECIC[a.getAttribute('data-sec')] || 'dot');
      if (i < 9) a.setAttribute('aria-keyshortcuts', 'Alt+' + (i + 1));
    });
    if (!own) {
      own = NS.el('div', { class: 'side-g side-own', 'data-g': 'own' });
      own.innerHTML = '<h2 class="side-h"><span data-i18n="nav.app">' + esc(NS.t('nav.app')) + '</span></h2>';
      var first = $('.side-g', side); side.insertBefore(own, first);
    }
    var h = $('.side-h', own); own.insertBefore(hub, h.nextSibling);
    var home = $('a[data-ic=home]', own); if (home && hub.contains(home) === false) home.remove();   /* the screen list has its own Dashboard */
    root.classList.add('has-hub');
    /* phones: the first four screens also sit in a tab bar at the bottom, the rest are under More (the side menu) */
    if (!$('.tabbar')) {
      var tb = NS.el('nav', { class: 'tabbar', 'aria-label': T('menu') });
      tb.innerHTML = $$('a[data-sec]', hub).slice(0, 4).map(function (a) { return a.outerHTML.replace(/\s(aria-keyshortcuts|title|id)="[^"]*"/g, ''); }).join('') +
        '<button type="button" data-side-btn data-ic="more" aria-expanded="false"><span data-i18n="desk.more">' + esc(T('more')) + '</span></button>';
      document.body.appendChild(tb);
      $$('a', tb).forEach(function (a) { a.addEventListener('click', function () { var o = $('#ns-side a[data-sec="' + a.getAttribute('data-sec') + '"]'); if (o) { a.blur(); } }); });
    }
  }
  function build() {
    side = $('#ns-side'); sbar = $('[data-sbar]');
    if (!side) return;
    /* the backup reminder sits inside the page, under the title bar, so the title bar is always at the top */
    var rem = $('#ns-remind'), main = $('#main'); if (rem && main) main.insertBefore(rem, main.firstChild);
    $$('a', side).forEach(function (a) { if (!a.title) a.title = (a.textContent || '').trim(); });
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $$('.desk-cmdbtn kbd').forEach(function (k) { k.textContent = '⌘ K'; });
    if (LOCAL) $$('a[data-port]', side).forEach(function (a) { a.href = 'http://localhost:' + a.getAttribute('data-port') + '/'; });
    adoptHub();
    side.addEventListener('click', function (e) {
      if (e.target.closest('[data-side-mini]')) { mini(); return; }
      if (e.target.closest('a') && !wide()) drawer(false);
      /* another screen opens at its top, not half-way down where the last one was scrolled (round C) */
      if (e.target.closest('a[data-sec]')) setTimeout(function () { window.scrollTo(0, 0); }, 0);
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-side-btn]')) toggleMenu();
      else if (e.target.closest('[data-side-shade]')) drawer(false);
      else if (e.target.closest('[data-desk-cmd]')) palette();
      else if (e.target.closest('[data-desk-install]')) install();
      else if (e.target.closest('[data-s-keys]')) keysSheet();
      else if (e.target.closest('[data-s-backup]')) click('[data-act="my-data"]');
    });
    if (LS.get('ns-side-mini') === '1') mini(true);
    /* a small laptop window (or 150% zoom): the menu starts folded to icons unless the user opened it on purpose (round C) */
    else if (wide() && innerWidth < 1100 && LS.get('ns-side-mini') !== '0') mini(true);
    var cur = $('a[aria-current=page]', side); if (cur && cur.scrollIntoView && wide()) cur.scrollIntoView({ block: 'nearest' });
    status();
    var pane = $('[data-pane]');
    if (pane) new MutationObserver(function () { adoptHub(); status(); }).observe(pane, { childList: true });
    if (standalone()) root.classList.add('installed');
    window.addEventListener('hashchange', here); here();
  }
  /* inside the App a document maker opens in its frame (#do/<site>/...): that tool lights up in the side menu */
  function here() {
    if (!A() || !side) return;
    var m = /^#do\/([a-z0-9-]+)/.exec(location.hash), on = null;
    $$('.side-g:not(.side-own) a', side).forEach(function (a) {
      var hit = m && (a.href.indexOf('//' + m[1] + '.niveshsahayak.in') > 0 || a.getAttribute('data-port') && (A().toolUrl(m[1]) === a.href || m[1] === 'my' && a.getAttribute('data-ic') === 'set'));
      if (hit) { a.setAttribute('aria-current', 'page'); on = a; } else a.removeAttribute('aria-current');
    });
    $$('a[data-sec]', side).forEach(function (a) { if (m) a.setAttribute('aria-current', 'false'); });
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- status bar ---------- */
  function ago(ts) {
    if (!ts) return T('nobackup');
    var d = Math.floor((Date.now() - ts) / 864e5);
    return T('backup', { d: d < 1 ? T('today') : T('days', { n: d }) });
  }
  var sbizP = null;
  function bizName() {
    if (A() && A().biz) { var b = A().biz(); return Promise.resolve(b ? b.name : ''); }
    if (!window.NSStore) return Promise.resolve('');
    return Promise.all([NSStore.list('biz'), NSStore.meta('settings')]).then(function (r) {
      var cfg = r[1] || {}, want = NS.curBiz() || cfg.defBiz;
      var b = r[0].filter(function (x) { return x.id === want; })[0] || r[0][0]; return b ? b.name : '';
    }).catch(function () { return ''; });
  }
  function status() {
    if (!sbar) return;
    $('[data-s-fy]', sbar).textContent = T('fy', { y: NS.fy(NS.today()) });
    net();
    if (!window.NSStore) return;
    clearTimeout(sbizP); sbizP = setTimeout(function () {
      NSStore.ready().then(function () {
        $('[data-s-store]', sbar).textContent = NSStore.mode() === 'vault' ? T('shared') : T('local');
        bizName().then(function (n) { var e = $('[data-s-biz]', sbar); e.textContent = n; e.hidden = !n; });
        NSStore.meta('lastBackup').then(function (ts) {
          var e = $('[data-s-backup]', sbar); e.textContent = ago(ts);
          e.classList.toggle('warn', !ts || Date.now() - ts > 7 * 864e5);
        });
      }).catch(function () {});
    }, 60);
  }
  function net() {
    if (!sbar) return;
    var e = $('[data-s-net]', sbar), on = navigator.onLine !== false;
    e.textContent = on ? T('online') : T('offline'); e.className = on ? 'on' : 'off';
  }
  function click(sel) { var e = $(sel); if (e) e.click(); }

  /* ---------- Install (the browser's own install prompt; hidden once installed) ---------- */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var b = $('[data-desk-install]'); if (b && !standalone()) b.hidden = false; });
  window.addEventListener('appinstalled', function () { deferredInstall = null; var b = $('[data-desk-install]'); if (b) b.hidden = true; NS.toast(T('installed')); });
  function install() {
    if (!deferredInstall) { NS.toast(T('installhow')); return; }
    deferredInstall.prompt(); deferredInstall.userChoice.finally(function () { deferredInstall = null; var b = $('[data-desk-install]'); if (b) b.hidden = true; });
  }

  /* ---------- command box (Ctrl+K) ---------- */
  var cmd, list, items = [], shown = [], at = 0;
  var FORMS = [['min', 'Alt+R'], ['mout', 'Alt+P'], ['pbill', 'Alt+B'], ['exp', 'Alt+X'], ['pret', ''], ['ob', '']];
  var OWNSITE = { invoice: 'billing', quote: 'quotation', proforma: 'proforma', so: 'sales-order', challan: 'challan', po: 'purchase-order', self: 'self-invoice', note: 'credit-note', cashmemo: 'cash-memo', receipt: 'receipt', voucher: 'voucher', rent: 'rent-receipt', salary: 'salary-slip', petty: 'petty-cash' };
  var DOCWORD = { invoice: 'Doc.invoice', quote: 'Doc.quote', proforma: 'Doc.proforma', so: 'Doc.so', challan: 'Doc.challan', po: 'Doc.po', self: 'Doc.self', note: 'Doc.note', cashmemo: 'Doc.cashmemo', receipt: 'Doc.receipt', voucher: 'Doc.voucher', rent: 'Doc.rent', salary: 'Doc.salary', petty: 'Doc.petty' };
  function formOf(d) { return d.type === 'contra' ? 'contra' : d.type === 'exp' ? 'exp' : d.type === 'ob' ? 'ob' : d.type === 'pbill' ? (d.kind === 'return' ? 'pret' : 'pbill') : d.type === 'receipt' ? 'min' : 'mout'; }
  function siteUrl(site) {
    var a = $('#ns-side a[href*="//' + site + '.niveshsahayak.in"], #ns-side a[data-port][href*="localhost"]');
    var tools = (window.NS_CFG && NS_CFG.tools) || [], x = tools.filter(function (t) { return t[0] === site; })[0];
    if (x) return LOCAL ? 'http://localhost:' + x[4] + '/' : 'https://' + x[1] + '/';
    return a ? a.href : 'https://' + site + '.niveshsahayak.in/';
  }
  function appUrl(hash) { var a = $('#ns-side a[data-ic=app]'); return (a ? a.href : 'https://app.niveshsahayak.in/') + (hash ? '#' + hash : ''); }
  function goUrl(u) { if (A() && A().openUrl && A().openUrl(u)) return; location.href = u; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function collect() {
    var out = [];
    $$('#ns-side .side-g').forEach(function (g) {
      var gk = g.getAttribute('data-g') === 'about' ? 'act' : 'go';
      $$('a', g).forEach(function (a) {
        if (NS.featHidden && NS.featHidden(a)) return;   /* a feature switched off in the installed App (firstrun.js) */
        var sec = a.getAttribute('data-sec'), i = sec ? $$('#ns-side a[data-sec]').indexOf(a) : -1;
        var tx = (a.textContent || '').trim();
        out.push({ g: g.getAttribute('data-g') === 'docs' || g.getAttribute('data-g') === 'more' ? 'new' : gk, t: tx, e: NS.meaning(tx) + ' ' + (SYN[sec] || ''),
          k: a.getAttribute('data-ic') === 'd-billing' ? 'Alt+N' : i >= 0 && i < 9 ? 'Alt+' + (i + 1) : '', run: function () { a.click(); } });
      });
    });
    var app = A();
    if (app && app.biz && app.biz()) FORMS.forEach(function (f) { if (NS.featHidden && NS.featHidden(f[0])) return; out.push({ g: 'rec', t: app.T(f[0]), e: NS.meaning(app.T(f[0])), k: f[1], run: function () { app.openForm(f[0]); } }); });
    /* screens inside a section (final accounts) are found by their own names too */
    if (app && $('#ns-side a[data-sec="fin"]')) SUB.forEach(function (x) { out.push({ g: 'go', t: NS.t(x[1]), e: x[2], run: function () { location.hash = x[0]; } }); });
    return out.concat(actions());
  }
  /* parties and saved documents are read when the box opens (from the App if it is here, else from the data home) */
  /* English words an accountant may type whatever the screen language (round C: 'trial', 'depreciation', 'bank book') */
  var SYN = { fin: 'final accounts trial balance profit loss balance sheet', cash: 'cash book bank book', b2fa: 'fixed assets depreciation register', b2jv: 'journal entries',
    dues: 'outstanding receivable payable ageing', capl: 'capital loans drawings', books: 'day book cash book bank book', st: 'ledger statement', fam: 'manufacturing account partners',
    b2year: 'year end closing', reports: 'excel reports registers', acx: 'other income tax payment' };
  var SUB = [['fin/tb', 'pl.t_tb', 'trial balance tb'], ['fin/pl', 'pl.t_pl', 'profit and loss p&l income statement'], ['fin/bs', 'pl.t_bs', 'balance sheet bs']];
  function dataItems() {
    var app = A();
    var getP = app && app.data ? Promise.resolve({ party: app.data().party, doc: app.mine ? app.mine() : app.data().doc }) :
      window.NSStore ? Promise.all([NSStore.list('party'), NSStore.list('doc')]).then(function (r) { return { party: r[0], doc: r[1] }; }) : Promise.resolve({ party: [], doc: [] });
    return getP.then(function (C) {
      var out = [], seen = {};
      C.party.forEach(function (p) {
        var k = key(p.name); if (!k || seen[k]) return; seen[k] = 1;
        out.push({ g: 'party', t: p.name, s: [p.gstin, p.phone, p.city].filter(Boolean).join(' · '), run: function () { if (app && app.biz) location.hash = 'st/' + encodeURIComponent(k); else location.href = appUrl('st/' + encodeURIComponent(k)); } });
      });
      C.doc.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).slice(0, 400).forEach(function (d) {
        var site = (d.type === 'note' && d.kind === 'debit' ? 'debit-note' : OWNSITE[d.type]), appRec = d.app || /^(pbill|exp|ob|contra)$/.test(d.type);
        if (!site && !appRec) return;
        var who = (d.buyer && d.buyer.name) || '', name = app && app.docName ? app.docName(d) : NS.t(d.type === 'note' && (d.kind === 'credit' || d.kind === 'debit') ? 'k.' + d.kind : DOCWORD[d.type] || '') || d.type;
        out.push({ g: 'doc', t: name + (d.no ? ' ' + d.no : '') + (who ? ' · ' + who : ''), s: (d.date ? NS.fmtDate(d.date) : '') + (d.total ? ' · ' + NS.money(d.total) : ''),
          run: function () {
            if (appRec) { if (app && app.openForm) app.openForm(formOf(d), { rec: d }); else location.href = appUrl(''); return; }
            goUrl(app && app.docUrl && app.docUrl(d) || siteUrl(site) + '?open=' + encodeURIComponent(d.id));
          } });
      });
      return out;
    }).catch(function () { return []; });
  }
  function actions() {
    return [
      { g: 'act', t: T('a_theme'), run: function () { click('[data-theme-btn]'); } },
      { g: 'act', t: NS.t('mydata'), run: function () { click('[data-act="my-data"]'); } },
      { g: 'act', t: NS.t('md.save'), run: function () { var b = NS.el('button', { 'data-act': 'backup', hidden: '' }); document.body.appendChild(b); b.click(); b.remove(); } },
      { g: 'act', t: T('mini'), k: 'Ctrl+B', run: toggleMenu },
      { g: 'act', t: T('keys'), k: '?', run: keysSheet },
      { g: 'act', t: T('lang'), run: function () { var s = $('[data-lang-pick]'); if (s) { s.focus(); if (s.showPicker) try { s.showPicker(); } catch (e) {} } } }
    ].concat(deferredInstall ? [{ g: 'act', t: T('install'), run: install }] : []);
  }
  var back = null, picked = false;
  function palette(from) {
    if (!cmd) {
      cmd = NS.el('dialog', { id: 'desk-cmd', class: 'desk-cmd' });
      cmd.innerHTML = '<div class="cmd-in">' + ic(SEARCH) + '<input type="search" role="combobox" aria-label="' + esc(T('find')) + '" aria-expanded="true" aria-controls="desk-cmd-l" aria-autocomplete="list" autocomplete="off" spellcheck="false" dir="auto"><kbd>Esc</kbd></div>' +
        '<ul id="desk-cmd-l" role="listbox"></ul><p class="cmd-ft"></p>';
      document.body.appendChild(cmd);
      list = $('ul', cmd);
      var inpt = $('input', cmd);
      inpt.addEventListener('input', function () { at = 0; draw(inpt.value); });
      inpt.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { at = (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); } }
        else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
        else if (e.key === 'Escape') { e.preventDefault(); cmd.close(); }
      });
      list.addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) pick(+li.getAttribute('data-i')); });
      list.addEventListener('mousemove', function (e) { var li = e.target.closest('li[data-i]'); if (li && +li.getAttribute('data-i') !== at) { at = +li.getAttribute('data-i'); mark(true); } });
      cmd.addEventListener('click', function (e) { if (e.target === cmd) cmd.close(); });
      cmd.addEventListener('close', function () {
        var b = back; back = null;
        /* after the dialog's own focus return: a field inside the App's document frame needs its window focused first */
        if (b && b.isConnected && !picked) setTimeout(function () { try { var w = b.ownerDocument.defaultView; if (w && w !== window) w.focus(); b.focus(); } catch (er) {} }, 0);
        picked = false;
      });
    }
    var inp = $('input', cmd);
    cmd.setAttribute('aria-label', T('find'));
    inp.placeholder = T('ph'); inp.setAttribute('aria-label', T('ph')); $('.cmd-ft', cmd).textContent = T('cmdft');
    items = collect(); inp.value = ''; at = 0; draw('');
    back = from || (document.activeElement !== document.body ? document.activeElement : null);
    cmd.showModal(); inp.focus(); setTimeout(function () { if (cmd.open && document.activeElement !== inp) inp.focus(); }, 30);
    dataItems().then(function (more) { items = items.concat(more); if (cmd.open && inp.value) draw(inp.value); });
  }
  var GROUPS = ['go', 'rec', 'new', 'party', 'doc', 'act'];
  function draw(qs) {
    var words = qs.toLowerCase().split(/\s+/).filter(Boolean);
    var hit = items.filter(function (x) { var h = (x.t + ' ' + (x.s || '') + ' ' + (x.e || '')).toLowerCase(); return words.every(function (w) { return h.indexOf(w) >= 0; }); });
    if (!words.length) hit = hit.filter(function (x) { return x.g !== 'doc' && x.g !== 'party' && x.g !== 'new'; });
    shown = []; var html = '';
    GROUPS.forEach(function (g) {
      var part = hit.filter(function (x) { return x.g === g; }).slice(0, words.length ? 8 : 12);
      if (!part.length) return;
      html += '<li class="cmd-g" role="presentation">' + esc(T('g_' + g)) + '</li>';
      part.forEach(function (x) {
        var i = shown.length; shown.push(x);
        html += '<li role="option" id="cmd-o' + i + '" data-i="' + i + '"><span class="ct">' + esc(x.t) + (x.s ? '<small>' + esc(x.s) + '</small>' : '') + '</span>' + (x.k ? '<kbd>' + esc(x.k) + '</kbd>' : '') + '</li>';
      });
    });
    list.innerHTML = html || '<li class="cmd-none" role="presentation">' + esc(T('none')) + '</li>';
    mark();
  }
  function mark(noScroll) {
    $$('li[role=option]', list).forEach(function (li) { li.setAttribute('aria-selected', String(+li.getAttribute('data-i') === at)); });
    var cur = $('#cmd-o' + at, list), inp = $('input', cmd);
    if (cur) { inp.setAttribute('aria-activedescendant', cur.id); if (!noScroll) cur.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant');
  }
  function pick(i) { var x = shown[i]; if (!x) return; picked = true; cmd.close(); setTimeout(x.run, 0); }
  /* a document inside the App's frame sends its Ctrl K here (inapp.js): the box opens, takes the cursor, and Esc gives it back to that field */
  NS.deskPalette = function (from) { if (cmd && cmd.open) cmd.close(); else palette(from); };

  /* ---------- keyboard ---------- */
  var KEYS = [['Ctrl K', 'k_cmd'], ['Ctrl B', 'k_menu'], ['Alt 1 … 9', 'k_secs'], ['Alt N', 'k_inv'], ['Alt R', 'k_min'], ['Alt P', 'k_mout'], ['Alt B', 'k_pbill'], ['Alt X', 'k_exp'],
    ['/', 'k_find'], ['?', 'k_help'], ['Ctrl S', 'k_save'], ['Ctrl P', 'k_print'], ['Esc', 'k_esc']];
  var keysDlg;
  function keysSheet() {
    if (!keysDlg) { keysDlg = NS.el('dialog', { id: 'desk-keys', class: 'desk-keys', 'aria-labelledby': 'desk-keys-h' }); document.body.appendChild(keysDlg); }
    keysDlg.innerHTML = '<div class="dk-hd"><h2 id="desk-keys-h">' + esc(T('keys')) + '</h2><button type="button" class="icon-btn" aria-label="' + esc(NS.t('close')) + '" data-close>✕</button></div>' +
      '<table class="dk-t"><tbody>' + KEYS.map(function (k) { return '<tr><th scope="row"><kbd>' + esc(k[0]) + '</kbd></th><td>' + esc(T(k[1])) + '</td></tr>'; }).join('') + '</tbody></table><p class="dk-note">' + esc(T('k_note')) + '</p>';
    $('[data-close]', keysDlg).onclick = function () { keysDlg.close(); };
    keysDlg.showModal();
  }
  function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 'k') { e.preventDefault(); if (cmd && cmd.open) cmd.close(); else palette(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'b' && !typing(e)) { e.preventDefault(); toggleMenu(); return; }
    if (e.key === 'Escape' && root.classList.contains('side-open')) { drawer(false); var b = $('[data-side-btn]'); if (b) b.focus(); return; }
    if ($('dialog[open]')) return;
    var app = A();
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      var n = /^Digit([1-9])$/.exec(e.code || '');
      if (n) { var a = $$('#ns-side a[data-sec]')[+n[1] - 1]; if (a) { e.preventDefault(); a.click(); a.focus(); } return; }
      var c = (e.code || '').replace('Key', '').toLowerCase();
      if (c === 'n') { e.preventDefault(); goUrl(siteUrl('billing')); return; }
      if (app && app.biz && app.biz()) {
        var job = { r: 'min', p: 'mout', b: 'pbill', x: 'exp' }[c];
        if (job) { e.preventDefault(); app.openForm(job); }
      }
      return;
    }
    if (typing(e) || e.ctrlKey || e.metaKey) return;
    if (e.key === '/') { var q = $('[data-q], main input[type=search]'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
    else if (e.key === '?') { e.preventDefault(); keysSheet(); }
  });

  window.addEventListener('online', net); window.addEventListener('offline', net);
  document.addEventListener('ns-lang', status);
  window.addEventListener('focus', status);
  document.addEventListener('ns-data', status);
  function init() { build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
