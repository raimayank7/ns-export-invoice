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
    day: 'calendar', inbox: 'save', mkimp: 'data', mig: 'data', msg: 'wa', pd: 'doc', env: 'doc', tools: 'layers', repeat: 'repeat', reports: 'chart', b2jv: 'journal', b2fa: 'asset', b2gd: 'box', b2make: 'factory', b2profit: 'trend', b2sman: 'badge', b2year: 'calendar', grp: 'layers', fin: 'scale', fam: 'factory', capl: 'coins', b2job: 'wrench', ledger: 'book', move: 'trend', st: 'list', stf: 'badge', acx: 'tax', tdsr: 'tax', gststk: 'tax', gtds: 'tax', isd: 'tax', charts: 'chart', pdffill: 'doc', ftools: 'wrench', features: 'toggle', bimp: 'bimport', itx: 'itax', msme: 'coins', limits: 'scale', trust: 'coins', warr: 'wrench', fees: 'cap', packs: 'pack', cadb: 'dash', cadoc: 'folder', cagst: 'tax', cacom: 'chat', saved: 'save',
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
    ok.classList.toggle('danger', !!o.danger); ok.toggleAttribute('data-noic', !!o.danger); var oi = ok.querySelector('svg'); if (oi && o.danger) oi.remove();
    return new Promise(function (res) {
      var done = false;
      function fin(v) { if (done) return; done = true; ok.onclick = no.onclick = null; askDlg.onclose = null; if (askDlg.open) askDlg.close(); res(v); }
      ok.onclick = function () { fin(true); }; no.onclick = function () { fin(false); };
      askDlg.onclose = function () { fin(false); };
      askDlg.showModal(); (o.danger ? no : ok).focus();
    });
  };

  /* ---------- NS.okSync(message): for code that asked the browser's confirm() and goes on at once (F6-2, F7-13, F3-7).
     The first call shows the App's own box and answers "no"; on "yes" the same button is pressed (or form sent) again and
     this time the call answers "yes". So every old question looks like the software and works where confirm() is blocked. ---------- */
  var lastAct = null, okPass = {};
  document.addEventListener('click', function (e) { lastAct = { el: e.target }; }, true);
  document.addEventListener('submit', function (e) { lastAct = { form: e.target, sub: e.submitter || null }; }, true);
  NS.okSync = function (msg, o) {
    if (okPass[msg]) { delete okPass[msg]; return true; }
    var act = lastAct;
    if (!act) return window.confirm(msg);
    NS.ask(msg, o).then(function (yes) {
      if (!yes) return;
      okPass[msg] = 1; NS.okRetry = true;   /* the double-save guards let this second press through */
      try {
        if (act.form && act.form.isConnected) { if (act.form.requestSubmit) act.form.requestSubmit(act.sub && act.sub.isConnected ? act.sub : undefined); else act.form.submit(); }
        else if (act.el && act.el.isConnected) act.el.click();
      } finally { NS.okRetry = false; setTimeout(function () { delete okPass[msg]; }, 0); }
    });
    return false;
  };

  /* ---------- side menu ---------- */
  function standalone() { var t; try { t = sessionStorage.getItem('ns-fr-installed') === '1'; } catch (e) {} return t || matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches || navigator.standalone === true; }   /* ?installed=1 (firstrun.js) = test flag */
  var side, sbar, deferredInstall = null;
  var VSZ = 60;   /* entry screens open without locking the page; the newest sits on top */
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
      var m = SECKEY[a.getAttribute('data-sec')], fk = m && fName(a.getAttribute('data-sec'));
      if (m) { var hk = fk || (m[1] ? 'Alt+' + m[1] : 'Alt+G ' + m[0]); a.setAttribute('data-kh', hk); a.title = hk + (m[1] || fk ? '  ·  Alt+G ' + m[0] : ''); }
    });
    if (!own) {
      own = NS.el('div', { class: 'side-g side-own', 'data-g': 'own' });
      own.innerHTML = '<h2 class="side-h"><span data-i18n="nav.app">' + esc(NS.t('nav.app')) + '</span></h2>';
      var first = $('.side-g', side); side.insertBefore(own, first);
    }
    var h = $('.side-h', own); own.insertBefore(hub, h.nextSibling);
    var home = $('a[data-ic=home]', own); if (home && hub.contains(home) === false) home.remove();   /* the screen list has its own Dashboard */
    groupHub(hub); foldOthers();
    root.classList.add('has-hub');
    /* phones: the first four screens also sit in a tab bar at the bottom, the rest are under More (the side menu) */
    if (!$('.tabbar')) {
      var TABSHORT = { home: 'Dashboard', sales: 'Sales', money: 'Receipts', dues: 'Dues', parties: 'Parties', day: 'My day', buy: 'Purchases', books: 'Day Book' };
      var tb = NS.el('nav', { class: 'tabbar', 'aria-label': T('menu') });
      document.body.appendChild(tb);
      var fillTab = function () {
        var PREF = ['home', 'sales', 'money', 'dues', 'parties', 'day'], all = $$('a[data-sec]', hub).filter(function (x) { return x.getAttribute('data-sec') !== 'features' && !(NS.featHidden && NS.featHidden(x)); }), pick = [];
        PREF.forEach(function (k) { var a = all.filter(function (x) { return x.getAttribute('data-sec') === k; })[0]; if (a && pick.length < 4) pick.push(a); });
        all.forEach(function (a) { if (pick.length < 4 && pick.indexOf(a) < 0) pick.push(a); });   /* F1-19 */
        var sig = pick.map(function (a) { return a.getAttribute('data-sec'); }).join();
        if (tb.getAttribute('data-sig') === sig) return;
        tb.setAttribute('data-sig', sig);
        tb.innerHTML = pick.map(function (a) { return a.outerHTML.replace(/\s(aria-keyshortcuts|title|id|aria-current)="[^"]*"/g, ''); }).join('') +
          '<button type="button" data-side-btn data-ic="more" aria-expanded="false"><span data-i18n="desk.more">' + esc(T('more')) + '</span></button>';
        $$('a', tb).forEach(function (a) { a.addEventListener('click', function () { a.blur(); }); });
        /* the bottom bar is narrow: the App's long accounting names (Outstandings (Receivable and Payable)) get one short word there (19 Nov 2026) */
        if (window.NSApp && NSApp.data) $$('a[data-sec]', tb).forEach(function (a) { var v = TABSHORT[a.getAttribute('data-sec')], s = $('span', a); if (v && s) { s.removeAttribute('data-i18n'); s.setAttribute('data-erp', '1'); s.textContent = v; } });
      };
      fillTab();
      /* the App adds Sales, Money and Dues to its screen list a moment later (they were missing from the bar): fill it again when the list changes */
      var tabT = 0; new MutationObserver(function () { clearTimeout(tabT); tabT = setTimeout(fillTab, 80); }).observe(hub, { childList: true, subtree: true });
    }
  }
  /* ---------- the umbrella (owner 2026-11-18, after showing Tally, Busy, ZEEFA and Evershine): the App's menu by accounting job,
     Masters / Transactions / Reports / GST and tax / Utilities, like an accounting program's gateway. Each group holds screens
     (data-sec, moved here from the App's own list), voucher entries ({f: form}), master pages in My data ({my: part}),
     final account views ({fin: view}) and GST tools ({site: name}). Dashboard and My day stay on top without a heading.
     Click a heading to open or fold it; the group of the screen in use opens; what is folded is remembered (ns-sg).
     A screen this list does not know goes under More. No new keys: every item shows the key it already had. ---------- */
  var SG = [
    ['top', ['home', 'day', { h: 'coa', t: 'v_coa', ic: 'layers' }]],   /* Chart of Accounts sits on top with Dashboard and My day (owner 19 Nov) */
    ['masters', [{ h: 'masters', t: 'v_masters', ic: 'layers' },
      '§acc', { h: 'masters/led', t: 'v_ledgers', ic: 'book' }, { h: 'masters/grp', t: 'v_groups', ic: 'layers' }, { h: 'masters/bank', t: 'v_banks', ic: 'bank' }, { h: 'masters/vt', t: 'v_vtypes', ic: 'list' }, { f: 'ob', t: 'v_ob', ic: 'scale' },
      '§inv', { h: 'masters/item', t: 'v_items', ic: 'box' }, { h: 'masters/igrp', t: 'v_sgroups', ic: 'layers' }, { h: 'masters/unit', t: 'v_units', ic: 'box' }, 'b2gd',
      '§pay', { h: 'stf/emp', t: 'v_emp', ic: 'people' }, { h: 'stf/heads', t: 'v_payheads', ic: 'list' }, 'b2sman',
      '§dsp', { h: 'masters/trn', t: 'v_trn', ic: 'truck' }, { h: 'masters/veh', t: 'v_veh', ic: 'truck' },
      '§co', { h: 'masters/biz', t: 'v_biz', ic: 'shop' }]],
    ['trans', ['§vch', { f: 'sale', t: 'v_sale', ic: 'doc' }, { f: 'pbill', t: 'v_pbill', ic: 'cart' }, { f: 'min', t: 'v_min', ic: 'money' }, { f: 'mout', t: 'v_mout', ic: 'money' }, { f: 'contra', t: 'v_contra', ic: 'bank' }, 'b2jv', { f: 'genr', t: 'v_genr', ic: 'money' }, { f: 'genp', t: 'v_genp', ic: 'money' }, { f: 'exp', t: 'v_exp', ic: 'cart' }, { f: 'pret', t: 'v_pret', ic: 'repeat' }, 'repeat',
      '§ivch', { h: 'ord', t: 'v_ord', ic: 'list' }, { or: 'grn', t: 'v_grn', ic: 'cart' }, { or: 'rejin', t: 'v_rejin', ic: 'repeat' }, { or: 'rejout', t: 'v_rejout', ic: 'repeat' }, { or: 'lc', t: 'v_lc', ic: 'truck' }, 'b2make', 'b2job',
      '§payv', { h: 'stf/run', t: 'v_payrun', ic: 'money' }, { h: 'stf/att', t: 'v_att', ic: 'clock' }, { h: 'stf/leave', t: 'v_leave', ic: 'clock' }, { h: 'stf/adv', t: 'v_adv', ic: 'money' }, { h: 'stf/loan', t: 'v_sloan', ic: 'money' },
      '§lists', 'sales', 'buy', 'money', 'chq', 'khata', 'preg',
      '§assets', 'capl', 'b2fa',
      '§trade', 'trust', 'fees', 'warr']],
    ['reports', ['§final', { fin: 'bs', t: 'v_bs', ic: 'scale' }, { fin: 'pl', t: 'v_pl', ic: 'chart' }, { fin: 'tb', t: 'v_tb', ic: 'list' }, 'fin',
      '§books', 'books', { h: 'ssum', t: 'v_ssum', ic: 'chart' }, { h: 'psum', t: 'v_psum', ic: 'chart' }, { h: 'vreg', t: 'v_vreg', ic: 'list' }, { h: 'cbsum', t: 'v_cbsum', ic: 'bank' }, 'grp',
      '§os', { h: 'os', t: 'v_os', ic: 'clock' }, 'dues', { h: 'dlist', t: 'v_dlist', ic: 'people' }, { h: 'clist', t: 'v_clist', ic: 'people' }, 'parties', { h: 'int', t: 'v_int', ic: 'clock' }, 'msme',
      '§irep', { site: 'stock' }, 'b2profit',
      '§payr', 'stf', { h: 'stf/year', t: 'v_bonus', ic: 'list' },
      '§xrep', 'charts', { h: 'exc', t: 'v_exc', ic: 'flag' }, 'reports', 'cadb', 'ebook']],
    ['tax', ['§gst', { site: 'gstr1' }, { site: 'gstr3b' }, { site: 'gstr2b' }, { site: 'cmp08' }, 'gststk', 'gtds', 'isd', 'cagst',
      '§itax', 'tdsr', 'acx', 'itx', 'limits',
      '§payst', { h: 'stf/pf', t: 'v_pf', ic: 'doc' }, { h: 'stf/esi', t: 'v_esi', ic: 'doc' }, { h: 'stf/tax', t: 'v_saltds', ic: 'doc' },
      '§audit', 'cacom', 'cadoc']],
    ['util', ['§data', { my: 'backup', t: 'v_backup', ic: 'data' }, 'bimp', 'mig', 'mkimp', 'msg', 'pd', 'env', { h: 'mprint', t: 'v_mprint', ic: 'doc' }, 'b2year',
      '§setup', { h: 'config', t: 'v_config', ic: 'set' }, { h: 'bw', t: 'v_bw', ic: 'list' }, 'features', 'packs',   /* one Configuration (owner 19 Nov): it opens the My data settings itself */
      '§tools', { site: 'tds' }, { site: 'declaration' }, 'pdffill', 'ftools', 'tools']]];   /* TDS and TCS calculator and Declarations under Utilities (owner 20 Nov) */
  /* the sub-headings inside a group (accounting names; the App is English only) */
  var SUBN = { acc: 'Accounting Masters', inv: 'Inventory Masters', pay: 'Payroll Masters', dsp: 'Dispatch Masters', co: 'Company',
    vch: 'Accounting Vouchers', ivch: 'Inventory Vouchers', payv: 'Payroll Vouchers', payr: 'Payroll Reports', payst: 'Payroll Statutory', lists: 'Lists and Registers', assets: 'Assets and Loans', trade: 'Trade Registers',
    final: 'Final Accounts', books: 'Books and Registers', os: 'Outstandings', irep: 'Inventory Reports', xrep: 'Exceptions and Export',
    gst: 'GST', itax: 'TDS and Income Tax', audit: 'Audit', data: 'Data', setup: 'Configuration', tools: 'Tools' };
  var SGOF = {}; SG.forEach(function (g) { g[1].forEach(function (s) { if (typeof s === 'string') SGOF[s] = g[0]; }); });
  SGOF.st = 'masters';
  function sgName(g) { var v = window.NSApp && NSApp.data && ERPG[g === 'docs' ? 'x-docs' : g]; if (v) return v; return g === 'docs' ? NS.t('desk.sg_new') : NS.t('desk.um_' + g); }   /* the App's menu bar uses the accounting names too */
  function myUrl(part) { var ap = A(); if (ap && ap.myUrl) return ap.myUrl('#' + part);   /* the App's own data home address (a Configuration link also has the set icon) */
    var a = $('#ns-side a[data-ic=set]'); return (a ? a.href.split('#')[0] : 'https://my.niveshsahayak.in/') + '#' + part; }
  function formKey(f) { var r = FORMKEY.filter(function (x) { return x[0] === f; })[0]; return r ? r[2] || 'Alt+G ' + r[1] : ''; }
  function secKey(s) { if (CALBL[s]) return CALBL[s]; var m = SECKEY[s], fk = m && fName(s); return fk || (m && m[1] ? 'Alt+' + m[1] : m ? 'Alt+G ' + m[0] : ''); }
  /* an item of the list that is not one of the App's screens: drawn like a side link */
  function vItem(x) {
    var a = NS.el('a', { 'class': 'side-v', 'data-ic': x.ic || 'dot' }), key = '';
    if (x.f) { a.href = '#'; a.setAttribute('data-dform', x.f); key = formKey(x.f); if (offForm(x.f)) a.hidden = true; }
    else if (x.or) { a.href = '#'; a.setAttribute('data-oract', x.or); if (ORKEY[x.or]) key = 'Alt+G ' + ORKEY[x.or]; }   /* an Inventory Vouchers entry of the Orders screen (orders.js) */
    else if (x.my) { a.href = myUrl(x.my); a.setAttribute('data-my', x.my); if (MYKEY[x.my]) key = 'Alt+G ' + MYKEY[x.my]; }
    else if (x.fin) { a.href = '#fin/' + x.fin; a.setAttribute('data-hsec', 'fin/' + x.fin); key = secKey('fin/' + x.fin); }
    else if (x.h) { a.href = '#' + x.h; a.setAttribute('data-hsec', x.h); key = secKey(x.h); }
    else if (x.site) { var o = $('#ns-side .side-g a[data-ic="t-' + x.site + '"]'); if (!o) return null; a.href = o.href; a.setAttribute('data-ic', 't-' + x.site); if (o.getAttribute('data-port')) a.setAttribute('data-port', o.getAttribute('data-port')); a.innerHTML = o.innerHTML; a.title = (o.textContent || '').trim(); o.hidden = true; return a; }   /* listed here, not twice */
    a.innerHTML = '<span data-i18n="desk.' + x.t + '">' + esc(NS.t('desk.' + x.t)) + '</span>';
    if (key) { a.setAttribute('data-kh', key); a.title = NS.t('desk.' + x.t) + '  ·  ' + key; } else a.title = NS.t('desk.' + x.t);
    return a;
  }
  document.addEventListener('click', function (e) {
    var qn = e.target.closest && e.target.closest('[data-qnew]');   /* New party / New item open the quick add box right here, not My data */
    if (qn) { e.preventDefault(); closeDrops(); NS.quickAddNew(qn.getAttribute('data-qnew')); return; }
    var oa = e.target.closest && e.target.closest('[data-oract]');
    if (oa) { e.preventDefault(); closeDrops(); var ap = A(); if (ap && ap.orAct) (ap.whenReady || function (g) { g(); })(function () { if (ap.biz() && !$('dialog[open]')) ap.orAct(oa.getAttribute('data-oract')); }); return; }
    var a = e.target.closest && e.target.closest('[data-dform]'); if (!a) return;
    e.preventDefault(); closeDrops(); runForm(a.getAttribute('data-dform'));
  });
  NS.crumbs = function (cur) {   /* called by the App when it draws a screen: the Dashboard gets the shortcut panel */
    var on = cur === 'home' && root.classList.contains('has-hub');
    root.classList.toggle('sc-on', on);
    return on ? scPanel() + '<div class="dash-logo" aria-hidden="true"><span class="brand"><img class="mk mk-l" src="/icons/mark-light-270.webp" alt=""><img class="mk mk-d" src="/icons/mark-dark-270.webp" alt=""><b class="nsb"><span class="nsb-b">Biz</span></b></span></div>' : '';
  };
  /* ---- 4. the Dashboard's shortcut panel (like Busy and Evershine): the usual entries and reports with their keys ---- */
  var VIC = { sale: 'shop', pbill: 'cart', min: 'money', mout: 'send', contra: 'bank', b2jv: 'journal', exp: 'coins', challan: 'truck', credit: 'repeat', debit: 'repeat', note: 'repeat' };
  function scDefs() {   /* the standard items: [{ id, t, html }] */
    var L = [['v_newparty', 'q:party', 'people', CALBL['q:party']], ['v_newitem', 'q:item', 'box', CALBL['q:item']]].concat(
      [['sale', 'v_sale'], ['pbill', 'v_pbill'], ['min', 'v_min'], ['mout', 'v_mout'], ['contra', 'v_contra'], ['b2jv', 'v_jv'], ['exp', 'v_exp']].map(function (x) { return [x[1], x[0] === 'b2jv' ? '#b2jv' : 'f:' + x[0], VIC[x[0]] || 'doc', x[0] === 'b2jv' ? secKey('b2jv') : formKey(x[0])]; }),
      [['v_tb', '#fin/tb', 'list', CALBL['fin/tb']], ['v_bs', '#fin/bs', 'scale', CALBL['fin/bs']], ['v_pl', '#fin/pl', 'chart', CALBL['fin/pl']], ['v_ledger', '#parties', 'people', secKey('parties')], ['v_dlist', '#dlist', 'people', secKey('dlist')], ['v_clist', '#clist', 'people', secKey('clist')], ['v_dues', '#dues', 'clock', secKey('dues')], ['v_stock', '#stock', 'box', secKey('stock')], ['v_books', '#books', 'book', secKey('books')]]);
    return L.filter(function (x) {
      var h = x[1]; if (/^q:/.test(h)) return !!NS.quickAddNew; if (/^f:/.test(h)) return !offForm(h.slice(2)); if (/^#/.test(h)) { var s = h.slice(1).split('/')[0]; return s === 'fin' || /^(dlist|clist|ssum|psum|vreg|cbsum|coa)$/.test(s) || ($('#ns-side a[data-sec="' + s + '"]') && !isOff(s)); } return true;
    }).map(function (x) {
      var f = /^f:/.test(x[1]), q = /^q:/.test(x[1]);
      return { id: x[1], t: NS.t('desk.' + x[0]), html: '<a class="sc-i" href="' + (f || q ? '#' : esc(x[1])) + '"' + (f ? ' data-dform="' + x[1].slice(2) + '"' : '') + (q ? ' data-qnew="' + x[1].slice(2) + '"' : '') + ' data-ic="' + x[2] + '"><span>' + esc(NS.t('desk.' + x[0])) + '</span>' + (x[3] ? '<kbd>' + esc(x[3]) + '</kbd>' : '') + '</a>' };
    });
  }

  /* the user's own list (Customize): ids of the standard items and 'c:XX' = any screen, entry or document by its Go to code */
  var SCP = 'ns-scp';
  /* at most ten (owner 26 Nov: they get the numbers Z1-Z9, Z0 in the Alt keys); the standard ten */
  var SCMAX = 10, SCSTD = ['q:party', 'q:item', 'f:sale', 'f:pbill', 'f:min', 'f:mout', 'f:exp', '#fin/tb', '#parties', '#dues'];
  function scSaved() { try { var v = JSON.parse(localStorage.getItem(SCP) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function scSave(v) { try { if (v) localStorage.setItem(SCP, JSON.stringify(v)); else localStorage.removeItem(SCP); } catch (e) {} }
  function scItems() {
    var defs = scDefs(), byId = {}; defs.forEach(function (x) { byId[x.id] = x; });
    var list = scSaved(); if (!list) { var std = SCSTD.map(function (id) { return byId[id]; }).filter(Boolean); return (std.length ? std : defs).slice(0, SCMAX); }
    var reg = {}; registry().forEach(function (x) { if (x.c && !x.off) reg[x.c] = x; });
    return list.map(function (id) {
      if (byId[id]) return byId[id];
      var x = /^c:/.test(id) && reg[id.slice(2)]; if (!x) return null;
      var k = x.k || 'Alt+G ' + x.c;
      var lk = x.h && ($('#ns-side a[href="#' + x.h + '"]') || $('#ns-side a[data-hsec="' + x.h + '"]')), ic = lk && lk.getAttribute('data-ic') || (x.k && /^F|Alt\+[A-Z]$/.test(x.k) ? 'doc' : 'list');
      return { id: id, t: x.t, html: '<a class="sc-i" href="#" data-sccode="' + esc(x.c) + '" data-ic="' + esc(ic === 'dot' ? 'list' : ic) + '"><span>' + esc(x.t) + '</span><kbd>' + esc(k) + '</kbd></a>' };
    }).filter(Boolean).slice(0, SCMAX);
  }
  function scPanel() {
    return '<aside class="sc-panel" aria-label="' + esc(NS.t('desk.sc_t')) + '"><h3><span>' + esc(NS.t('desk.sc_t')) + '</span><button type="button" class="sc-cust" data-sc-cust title="Customize the shortcuts" aria-label="Customize the shortcuts">Customize</button></h3>' +
      scItems().map(function (x) { return x.html; }).join('') + '</aside>';
  }
  function scRedraw() { var o = $('.sc-panel'); if (!o) return; var t = document.createElement('div'); t.innerHTML = scPanel(); o.replaceWith(t.firstChild); }
  var scDlg = null;
  function scCustomize() {
    if (!scDlg) { scDlg = NS.el('dialog', { 'class': 'sc-dlg', 'aria-labelledby': 'sc-dlg-h' }); document.body.appendChild(scDlg); }
    var defs = scDefs(), reg = registry().filter(function (x) { return x.c && !x.off; }), name = {}, all = [];
    defs.forEach(function (x) { name[x.id] = x.t; all.push({ id: x.id, t: x.t, g: 'Common' }); });
    reg.filter(function (x) { return !defs.some(function (d) { return d.t === x.t; }); }).sort(function (a, b) { return a.t.localeCompare(b.t); })
      .forEach(function (x) { name['c:' + x.c] = x.t; all.push({ id: 'c:' + x.c, t: x.t, g: 'All screens, entries and documents' }); });
    var ids = scItems().map(function (x) { return x.id; });
    scDlg.innerHTML = '<div class="dlg-hd"><h2 id="sc-dlg-h">Customize the shortcuts</h2><button type="button" class="btn sm" data-sc-reset>Reset to the standard list</button><button type="button" class="btn sm primary" data-sc-close>Done</button></div>' +
      '<p class="soft sc-help">Tick up to ten shortcuts for the right of the Dashboard (they get the Alt keys Z1 to Z9 and Z0). Drag the list on the right into your order (or Alt+Up / Alt+Down). Saved at once in this browser.</p>' +
      '<div class="sc-cols"><section class="sc-all" aria-label="Every screen"><input type="search" class="sc-q" placeholder="Search every screen…" aria-label="Search every screen"><div class="sc-opts" data-sc-opts></div></section>' +
      '<section class="sc-mine" aria-label="Your shortcuts"><h3>Your shortcuts <span class="soft" data-sc-n></span></h3><ol class="sc-list" data-sc-list></ol></section></div>';
    var opts = $('[data-sc-opts]', scDlg), list = $('[data-sc-list]', scDlg), q = $('.sc-q', scDlg);
    function save() { scSave(ids.slice()); scRedraw(); $('[data-sc-n]', scDlg).textContent = '(' + ids.length + ' of ' + SCMAX + ')'; }
    function drawList(focusId) {
      list.innerHTML = ids.map(function (id, i) {
        return '<li draggable="true" tabindex="0" data-id="' + esc(id) + '"><span class="sc-grip" aria-hidden="true">⠿</span><span class="sc-t">' + esc(name[id] || id) + '</span>' +
          '<button type="button" class="btn sm" data-sc-top' + (i ? '' : ' disabled') + ' title="Move to the top">Top</button><button type="button" class="btn sm sc-x" data-sc-rm title="Remove" aria-label="Remove ' + esc(name[id] || id) + '">×</button></li>';
      }).join('');
      $('[data-sc-n]', scDlg).textContent = '(' + ids.length + ' of ' + SCMAX + ')';
      if (focusId) { var f = $('li[data-id="' + focusId.replace(/"/g, '') + '"]', list); if (f) f.focus(); }
    }
    function drawOpts() {
      var w = q.value.trim().toLowerCase(), g0 = '';
      opts.innerHTML = all.filter(function (x) { return !w || x.t.toLowerCase().indexOf(w) >= 0; }).map(function (x) {
        var h = x.g !== g0 ? '<p class="sc-g">' + esc(x.g) + '</p>' : ''; g0 = x.g;
        return h + '<label class="chk sc-o"><input type="checkbox" data-sc-pick="' + esc(x.id) + '"' + (ids.indexOf(x.id) >= 0 ? ' checked' : '') + '> ' + esc(x.t) + '</label>';
      }).join('') || '<p class="soft">Nothing found.</p>';
    }
    function tick(id, on) { var k = $('[data-sc-pick="' + id.replace(/"/g, '') + '"]', opts); if (k) k.checked = on; }
    function move(from, to, focusId) { if (to < 0 || to >= ids.length || from === to) return; ids.splice(to, 0, ids.splice(from, 1)[0]); save(); drawList(focusId); }
    drawList(); drawOpts();
    q.addEventListener('input', drawOpts);
    opts.addEventListener('change', function (e) {
      var k = e.target.closest('[data-sc-pick]'); if (!k) return; var id = k.getAttribute('data-sc-pick'), at = ids.indexOf(id);
      if (k.checked && at < 0 && ids.length >= SCMAX) { k.checked = false; NS.toast('Only ' + SCMAX + ' shortcuts fit. Remove one first.'); return; }
      if (k.checked && at < 0) ids.push(id); else if (!k.checked && at >= 0) ids.splice(at, 1);
      save(); drawList();
    });
    scDlg.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-sc-close')) { scDlg.close(); return; }
      if (b.hasAttribute('data-sc-reset')) { scSave(null); scRedraw(); ids = scItems().map(function (x) { return x.id; }); drawList(); drawOpts(); return; }
      var li = b.closest('li'); if (!li) return; var id = li.getAttribute('data-id'), i = ids.indexOf(id);
      if (b.hasAttribute('data-sc-top')) move(i, 0, id);
      else if (b.hasAttribute('data-sc-rm')) { ids.splice(i, 1); save(); drawList(); tick(id, false); }
    };
    /* drag and drop: the row shows where it will land */
    var dragId = null;
    list.ondragstart = function (e) { var li = e.target.closest('li'); if (!li) return; dragId = li.getAttribute('data-id'); li.classList.add('sc-drag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch (er) {} };
    list.ondragover = function (e) {
      if (!dragId) return; e.preventDefault(); var li = e.target.closest('li'); $$('.sc-over-a,.sc-over-b', list).forEach(function (x) { x.classList.remove('sc-over-a', 'sc-over-b'); });
      if (li && li.getAttribute('data-id') !== dragId) { var r = li.getBoundingClientRect(); li.classList.add(e.clientY < r.top + r.height / 2 ? 'sc-over-a' : 'sc-over-b'); }
    };
    list.ondrop = function (e) {
      e.preventDefault(); var li = e.target.closest('li'); if (!dragId || !li) return;
      var from = ids.indexOf(dragId), r = li.getBoundingClientRect(), to = ids.indexOf(li.getAttribute('data-id')) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      if (from < to) to--; var id = dragId; dragId = null; move(from, to, id); drawList(id);
    };
    list.ondragend = function () { dragId = null; $$('.sc-drag,.sc-over-a,.sc-over-b', list).forEach(function (x) { x.classList.remove('sc-drag', 'sc-over-a', 'sc-over-b'); }); };
    list.onkeydown = function (e) {
      var li = e.target.closest('li'); if (!li || e.target !== li) return; var id = li.getAttribute('data-id'), i = ids.indexOf(id);
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1, id); }
      else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1, id); }
      else if (e.key === 'ArrowUp' && li.previousElementSibling) { e.preventDefault(); li.previousElementSibling.focus(); }
      else if (e.key === 'ArrowDown' && li.nextElementSibling) { e.preventDefault(); li.nextElementSibling.focus(); }
      else if (e.key === 'Delete') { e.preventDefault(); ids.splice(i, 1); save(); drawList(ids[i] || ids[i - 1]); tick(id, false); }
    };
    if (!scDlg.open) scDlg.showModal();
    q.focus();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-sc-cust], [data-sccode]'); if (!c) return;
    e.preventDefault();
    if (c.hasAttribute('data-sc-cust')) { scCustomize(); return; }
    var x = registry().filter(function (r) { return r.c === c.getAttribute('data-sccode'); })[0]; if (x) x.run();
  });
  /* ---- 2 + 3. the menu bar (Masters ▾ Transactions ▾ ...) and the voucher toolbar, App only, on computers ---- */
  var mbar = null;
  function closeDrops() { $$('.mb-drop').forEach(function (d) { d.remove(); }); $$('.mb-m[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); }
  function menuBar() {
    if (mbar || !$('#app .hub-nav, #app [data-pane]')) return;
    var main = $('#main'); if (!main) return;
    mbar = NS.el('div', { 'class': 'mbar', role: 'menubar' });
    var menus = SG.filter(function (g) { return g[0] !== 'top'; }).map(function (g) { return g[0]; });
    menus.splice(2, 0, 'docs');
    mbar.innerHTML = '<div class="mb-menus">' + menus.map(function (k) { return '<button type="button" class="mb-m" role="menuitem" aria-haspopup="true" aria-expanded="false" data-mb="' + k + '"><span data-i18n="' + (k === 'docs' ? 'desk.sg_new' : 'desk.um_' + k) + '">' + esc(sgName(k)) + '</span> ▾</button>'; }).join('') + '</div>' +
      '<div class="mb-tools" role="toolbar" aria-label="' + esc(NS.t('desk.tb_t')) + '">' + [['sale', 'tb_sale'], ['pbill', 'tb_pur'], ['min', 'tb_rec'], ['mout', 'tb_pay'], ['contra', 'tb_contra'], ['#b2jv', 'tb_jv'], ['exp', 'tb_exp'], ['@challan', 'tb_challan'], ['@credit-note', 'tb_cn'], ['@debit-note', 'tb_dn']].map(function (t) {
        var w = t[0], key = w.charAt(0) === '#' ? secKey(w.slice(1)) : w.charAt(0) === '@' ? fName(w.slice(1)) || (DOCKEY[w.slice(1)] ? (DOCKEY[w.slice(1)][1] ? 'Alt+' + DOCKEY[w.slice(1)][1] : 'Alt+G ' + DOCKEY[w.slice(1)][0]) : '') : formKey(w);
        if (w.charAt(0) === '@' ? isOff(w.slice(1)) : w.charAt(0) === '#' ? isOff(w.slice(1)) : offForm(w)) return '';
        return '<button type="button" class="mb-t" data-mbt="' + esc(w) + '" data-ic="' + (VIC[w.replace(/^[#@]/, '').replace(/-note$/, '')] || (/note/.test(w) ? 'repeat' : 'doc')) + '" title="' + esc(NS.t('desk.' + t[1]) + (key ? '  ·  ' + key : '')) + '"><span data-i18n="desk.' + t[1] + '">' + esc(NS.t('desk.' + t[1])) + '</span>' + (key ? '<kbd>' + esc(key.replace('Alt+G ', '')) + '</kbd>' : '') + '</button>';
      }).join('') + '</div>';
    var ap0 = $('#app', main); while (ap0 && ap0.parentNode !== main) ap0 = ap0.parentNode; main.insertBefore(mbar, ap0 || main.firstChild);   /* the App screen may sit deeper on a tool page (cheque, fees) */ root.classList.add('mb-on');
    var setH = function () { root.style.setProperty('--mb-h', (mbar.offsetHeight || 0) + 'px'); }; setH(); window.addEventListener('resize', setH);
    mbar.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mbt]');
      if (t) { var w = t.getAttribute('data-mbt'); closeDrops(); if (w.charAt(0) === '#') goSec(w.slice(1)); else if (w.charAt(0) === '@') newDoc(w.slice(1)); else runForm(w); return; }
      var b = e.target.closest('[data-mb]'); if (!b) return;
      var was = b.getAttribute('aria-expanded') === 'true'; closeDrops(); if (was) return;
      var k = b.getAttribute('data-mb'), src = k === 'docs' ? $('.side-g[data-g="docs"] .sg-b', side) : $('.sg[data-sg="' + k + '"] .sg-b', side);
      var d = NS.el('div', { 'class': 'mb-drop', role: 'menu' });
      if (src) $$(':scope > a:not([hidden])', src).forEach(function (a) { var sb = a.getAttribute('data-sub'); if (sb && d.lastSub !== sb) { d.lastSub = sb; var hh = $(':scope > .sg-sub[data-sub="' + sb + '"]', src); if (hh) d.appendChild(NS.el('div', { 'class': 'mb-sub', role: 'presentation' }, esc(hh.textContent))); } var c = a.cloneNode(true); c.removeAttribute('id'); c.removeAttribute('aria-current'); c.setAttribute('role', 'menuitem'); c.classList.remove('on'); var kh = a.getAttribute('data-kh'); if (kh) c.insertAdjacentHTML('beforeend', '<kbd>' + esc(kh) + '</kbd>'); d.appendChild(c); });
      if (!d.children.length) return;
      var pk = pinned().map(function (x) { return x.k; });
      if (src) $$(':scope > a:not([hidden])', src).forEach(function (a, i) { var k = linkKey(a), c = $$('a', d)[i]; if (!k || !c) return;   /* pin it to the left (owner 19 Nov 2026) */
        c.insertAdjacentHTML('beforeend', '<button type="button" class="mb-pin' + (pk.indexOf(k) >= 0 ? ' on' : '') + '" data-pin="' + esc(k) + '" title="Pin to the left" aria-label="Pin ' + esc((a.textContent || '').trim()) + ' to the left"></button>'); });
      /* Busy: Add / Modify / List under each voucher. The item is Add; Modify and List are small buttons on its line */
      var VLIST = { sale: 'sales', pbill: 'buy', pret: 'buy', exp: 'buy', min: 'money', mout: 'money', contra: 'books' };
      $$('a[data-dform]', d).forEach(function (c) { var f = c.getAttribute('data-dform'); if (!VLIST[f]) return;
        c.insertAdjacentHTML('beforeend', '<span class="mb-aml"><button type="button" data-vmod="' + f + '" title="Modify: open the last saved one">Modify</button><button type="button" data-vlist="' + VLIST[f] + '" title="List of saved ones">List</button></span>'); });
      d.addEventListener('click', function (ev) { var ml = ev.target.closest('[data-vmod],[data-vlist]'); if (!ml) return; ev.preventDefault(); ev.stopPropagation(); closeDrops();
        var ap = A(); if (ml.hasAttribute('data-vlist')) { location.hash = ml.getAttribute('data-vlist'); return; }
        if (ap && ap.vtModify) (ap.whenReady || function (g) { g(); })(function () { ap.vtModify(ml.getAttribute('data-vmod')); }); }, true);
      d.addEventListener('click', function (ev) { var pb = ev.target.closest('.mb-pin'); if (!pb) return; ev.preventDefault(); ev.stopPropagation();
        var a0 = pb.closest('a'), t0 = a0 ? ((a0.querySelector('span') || a0).textContent || '').trim() : ''; togglePin(pb.getAttribute('data-pin'), t0); pb.classList.toggle('on'); }, true);
      b.setAttribute('aria-expanded', 'true'); b.parentNode.appendChild(d);
      d.style.insetInlineStart = (b.offsetLeft) + 'px';
      var first = $('a', d); if (first) first.focus();
    });
    mbar.addEventListener('keydown', function (e) {
      var d = $('.mb-drop', mbar); if (!d) return;
      var items = $$('a', d), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var b = $('.mb-m[aria-expanded="true"]', mbar); closeDrops(); if (b) b.focus(); }
    });
    mbar.addEventListener('click', function (e) { if (e.target.closest('.mb-drop a')) setTimeout(closeDrops, 0); }, true);
    document.addEventListener('click', function (e) { if (!e.target.closest('.mbar')) closeDrops(); });
    window.addEventListener('hashchange', closeDrops);
  }
  function sgFolded() { try { return JSON.parse(localStorage.getItem('ns-sg') || '{}') || {}; } catch (e) { return {}; } }
  /* Inside the App the side menu's other parts (document makers, more tools, Your software, pages) fold the same way and start
     folded, sit below the App's own groups, and leave out every tool that is already an App screen (Cash book = Cash and bank,
     Cheques, Khata...), so nothing shows twice. The makers' heading reads "Make a new document" (Billing makes an invoice; Sales lists them). */
  /* the document makers and the more tools in A to Z order of the names on screen (owner 2026-11-18) */
  var abcCol = {};
  function abcSort(box) {
    var L = (NS.lang && NS.lang()) || 'en', col = abcCol[L] || (abcCol[L] = new Intl.Collator(L, { sensitivity: 'base' })), cmp = function (x, y) { return col.compare((x.textContent || '').trim(), (y.textContent || '').trim()); };   /* one collator per language: localeCompare with options built a new one for every comparison */
    var links = $$(':scope > a', box), subs = $$(':scope > .sg-sub', box), put = function (x) { box.appendChild(x); };
    if (!subs.length) { links.sort(cmp).forEach(put); return; }
    links.filter(function (a) { return !a.getAttribute('data-sub'); }).sort(cmp).forEach(put);   /* the group's own first line (All Masters) stays on top */
    subs.forEach(function (h) {
      var mine = links.filter(function (a) { return a.getAttribute('data-sub') === h.getAttribute('data-sub'); }).sort(cmp);
      box.appendChild(h); mine.forEach(put);
      h.hidden = !mine.some(function (a) { return !a.hidden && getComputedStyle(a).display !== 'none'; });
    });
  }
  function foldOthers() {
    var map = (window.NS_CFG && NS_CFG.inapp) || {}, door = {};
    Object.keys(map).forEach(function (k) { var v = map[k] || []; if (/^#/.test(String(v[2] || ''))) { door[k] = 1; if (v[1]) door[':' + v[1]] = 1; } });
    var fold = sgFolded(), order = ['docs', 'more', 'app'];
    $$('.side-g:not(.side-own)', side).forEach(function (g) {
      var id = g.getAttribute('data-g') || 'x', h = $('.side-h', g); if (!h || g.hasAttribute('data-sgx')) return;
      g.setAttribute('data-sgx', '');
      $$('a', g).forEach(function (a) {
        var host = '', port = a.getAttribute('data-port');
        try { host = new URL(a.href, location.href).hostname.split('.')[0]; } catch (e) {}
        if (door[host] || (port && door[':' + port])) a.hidden = true;
      });
      if (id === 'docs') { var sp = $('span', h); if (sp && !sp.hasAttribute('data-erp')) { sp.setAttribute('data-i18n', 'desk.sg_new'); sp.textContent = NS.t('desk.sg_new'); } }
      var b = NS.el('button', { type: 'button', 'class': 'sg-h', 'aria-expanded': 'true' }); b.innerHTML = h.innerHTML; h.replaceWith(b);
      var box = NS.el('div', { 'class': 'sg-b' }); while (b.nextSibling) box.appendChild(b.nextSibling); g.appendChild(box);
      g.classList.add('sg'); g.setAttribute('data-sg', 'x-' + id);
      var shut = fold['x-' + id] !== false; g.classList.toggle('shut', shut); b.setAttribute('aria-expanded', String(!shut));
      b.addEventListener('click', function () { var f = sgFolded(), sh = !g.classList.contains('shut'); g.classList.toggle('shut', sh); b.setAttribute('aria-expanded', String(!sh)); f['x-' + id] = sh; try { localStorage.setItem('ns-sg', JSON.stringify(f)); } catch (e) {} });
      if (!$$('.sg-b a:not([hidden])', g).length) g.hidden = true;
      if (id === 'docs' || id === 'more') { abcSort(box); document.addEventListener('ns-lang', function () { setTimeout(function () { abcSort(box); }, 50); }); }
    });
    /* order below the App: makers, more tools, then Your software, then any other part */
    var parts = $$('.side-g[data-sgx]', side).sort(function (x, y) { var a = order.indexOf(x.getAttribute('data-g')), c = order.indexOf(y.getAttribute('data-g')); return (a < 0 ? 9 : a) - (c < 0 ? 9 : c); });
    parts.forEach(function (g) { side.appendChild(g); });
    var tr = $('.sg[data-sg="trans"]', side), dg = $('.side-g[data-g="docs"]', side); if (tr && dg) tr.parentNode.insertBefore(dg, tr.nextSibling);
    menuBar();
  }

  /* ---------- accounting names in the App's menus (owner 2026-11-19: "rename them to fit a real ERP accounting software"). The App is English
     only, so the menu words are set here by what each link opens (section, form, maker), not through the language packs; the standalone
     sites keep their own names. Keys and Alt+G codes do not change. ---------- */
  var ERPN = {
    'h:masters': 'All Masters', 'h:masters/led': 'Ledgers', 'h:masters/bank': 'Bank Accounts', 'h:masters/biz': 'Companies', 'h:masters/grp': 'Account Groups',
    'h:masters/item': 'Stock Items', 'h:masters/igrp': 'Stock Groups', 'h:masters/unit': 'Units of Measure', 'h:masters/trn': 'Transporters', 'h:masters/veh': 'Vehicles',
    'h:masters/vt': 'Voucher Types', 'h:coa': 'Chart of Accounts', 's:parties': 'Party Accounts', 's:b2gd': 'Godowns and Stock Transfer', 's:stf': 'Employees and Payroll',
    's:b2sman': 'Salesmen and Agents', 's:stf': 'Salary Register', 'f:ob': 'Opening Balances', 's:trust': 'Donors and Members', 's:fees': 'Students and Fees', 's:warr': 'Warranty and Service Register',
    'f:sale': 'Sales Voucher', 'f:pbill': 'Purchase Voucher', 'f:min': 'Receipt Voucher', 'f:mout': 'Payment Voucher', 'f:contra': 'Contra Voucher', 'f:exp': 'Expense Voucher',
    'f:pret': 'Purchase Return', 's:b2jv': 'Journal Vouchers', 's:capl': 'Capital and Loans', 's:chq': 'Cheque Register', 's:b2fa': 'Fixed Asset Register',
    's:b2job': 'Job Work (In and Out)', 's:b2make': 'Manufacturing Journal', 's:money': 'Receipts and Payments List', 's:buy': 'Purchases and Expenses List',
    's:sales': 'Sales List', 's:repeat': 'Recurring Vouchers', 's:khata': 'Khata (Party Book)', 's:preg': 'Purchase Book',
    'k:nav.billing': 'Tax Invoice', 'k:nav.cashmemo': 'Cash Memo', 'k:nav.challan': 'Delivery Challan', 'k:nav.note': 'Credit Note', 'k:nav.dnote': 'Debit Note',
    'k:nav.petty': 'Petty Cash Book', 'k:nav.proforma': 'Proforma Invoice', 'k:nav.po': 'Purchase Order', 'k:nav.quote': 'Quotation and Estimate',
    'k:nav.receipt': 'Money Receipt (print)', 'k:nav.rent': 'Rent Receipt', 'k:nav.salary': 'Salary Slip', 'k:nav.so': 'Sales Order', 'k:nav.self': 'Self Invoice (RCM)',
    'k:nav.voucher': 'Payment Voucher (print)',
    'k:desk.v_bs': 'Balance Sheet', 'k:desk.v_pl': 'Profit and Loss A/c', 'k:desk.v_tb': 'Trial Balance', 'h:os': 'Bills Outstanding', 's:books': 'Day Book, Cash and Bank Books',
    'h:cbsum': 'Cash and Bank Summary', 'h:clist': 'Sundry Creditors', 'h:dlist': 'Sundry Debtors', 's:dues': 'Outstandings (Receivable and Payable)', 's:fin': 'Final Accounts',
    's:grp': 'Group Summary', 's:msme': 'MSME Payables (45 days)', 's:b2profit': 'Bill-wise Gross Profit', 's:reports': 'Export Reports to Excel', 'h:ssum': 'Sales Register',
    'h:psum': 'Purchase Register', 'h:exc': 'Exception Reports', 'h:vreg': 'Voucher Registers',
    's:cacom': 'Auditor Comments', 'k:nav.cmp08': 'CMP-08 Statement', 'k:nav.gstr1': 'GSTR-1 Return', 'k:nav.gstr2b': 'GSTR-2B Reconciliation', 'k:nav.gstr3b': 'GSTR-3B Return',
    's:itx': 'Income Tax Computation', 's:limits': 'Statutory Limits', 's:acx': 'Other Income and Tax Payments', 'k:nav.tds': 'TDS and TCS Calculator',
    's:features': 'Feature Settings', 's:tools': 'All Tools', 'k:desk.v_backup': 'Backup and Restore', 's:bimp': 'Bank Statement Import', 's:mig': 'Bring Data from Other Software', 's:mkimp': 'Marketplace and Payment Reports', 's:msg': 'Messages (SMS and WhatsApp)', 's:pd': 'Print Designs', 's:env': 'Envelope Printing', 'h:mprint': 'Print Many Vouchers',
    'k:desk.v_settings': 'Company Settings', 's:packs': 'Trade Packs', 's:b2year': 'Year-End Closing'
  };
  var ERPG = { trans: 'Transactions (Vouchers)', reports: 'Display and Reports', tax: 'Statutory (GST and Tax)', 'x-docs': 'Other Documents' };
  function erpKey(a) { var s = a.querySelector('span'), k = s && s.getAttribute('data-i18n'); return a.getAttribute('data-hsec') ? 'h:' + a.getAttribute('data-hsec') : a.getAttribute('data-dform') ? 'f:' + a.getAttribute('data-dform') : a.getAttribute('data-sec') ? 's:' + a.getAttribute('data-sec') : k ? 'k:' + k : ''; }
  function erpNames(box) {
    if (!(window.NSApp && NSApp.data)) return;   /* the App only */
    $$('.sg-b > a, .side-g a', box).forEach(function (a) {
      var v = ERPN[erpKey(a)], s = a.querySelector('span'); if (!v || !s || s.textContent === v) return;
      s.removeAttribute('data-i18n'); s.setAttribute('data-erp', '1'); s.textContent = v; var kh = a.getAttribute('data-kh'); a.title = v + (kh ? '  ·  ' + kh : '');
    });
    $$('.sg[data-sg]', box).forEach(function (g) { var v = ERPG[g.getAttribute('data-sg')], h = $('.sg-h span', g); if (v && h && h.textContent !== v) { h.removeAttribute('data-i18n'); h.setAttribute('data-erp', '1'); h.textContent = v; } });
  }

  /* screen and voucher headings use the same accounting names as the menus (owner 2026-11-19: "rename the screen headings too").
     The old words are swapped at the start of each heading of the App's screens and entry boxes, so the screens' own code stays as it is. */
  var ERPH = [['Other income and taxes', 'Other Income and Tax Payments'], ['Fixed assets', 'Fixed Asset Register'], ['Godowns and stock transfer', 'Godowns and Stock Transfer'],
    ['Job work', 'Job Work (In and Out)'], ['Journal entries', 'Journal Vouchers'], ['Production', 'Manufacturing Journal'], ['Profit report', 'Bill-wise Gross Profit'],
    ['Salesmen', 'Salesmen and Agents'], ['Year end', 'Year-End Closing'], ['Bank statement import', 'Bank Statement Import'], ['Cash and bank books', 'Day Book, Cash and Bank Books'],
    ['Purchases and expenses', 'Purchases and Expenses List'], ['CA comments', 'Auditor Comments'], ['Cash and bank summary', 'Cash and Bank Summary'], ['Cheques', 'Cheque Register'],
    ['Creditors list', 'Sundry Creditors'], ['Debtors list', 'Sundry Debtors'], ['Dues', 'Outstandings (Receivable and Payable)'], ['Things to check', 'Exception Reports'],
    ['Cash and bank transfer', 'Contra Voucher'], ['Expense', 'Expense Voucher'], ['Money received', 'Receipt Voucher'], ['Money paid', 'Payment Voucher'], ['Opening balance', 'Opening Balance'],
    ['Purchase bill', 'Purchase Voucher'], ['Purchase return', 'Purchase Return'], ['Sale bill', 'Sales Voucher'], ['Additional features', 'Feature Settings'], ['Student fees', 'Students and Fees'],
    ['Balance sheet', 'Balance Sheet'], ['Profit and loss', 'Profit and Loss A/c'], ['Trial balance', 'Trial Balance'], ['Group reports', 'Group Summary'], ['Income tax planner', 'Income Tax Computation'],
    ['Limits helper', 'Statutory Limits'], ['Money in and out', 'Receipts and Payments List'], ['Print many vouchers', 'Print Many Vouchers'], ['MSME payables', 'MSME Payables (45 days)'],
    ['Parties', 'Party Accounts'], ['Purchase summary', 'Purchase Register'], ['Sales summary', 'Sales Register'], ['Repeating bills', 'Recurring Vouchers'], ['Reports to Excel', 'Export Reports to Excel'],
    ['Sales', 'Sales List'], ['Employee salary and loans', 'Employees and Payroll'], ['Staff, salary and loans', 'Employees and Payroll'], ['All tools by job', 'All Tools'], ['Donations and members', 'Donors and Members'], ['Voucher registers', 'Voucher Registers'],
    ['Warranty and service due', 'Warranty and Service Register'], ['Bill-wise outstanding', 'Bills Outstanding'], ['Capital and loans', 'Capital and Loans'], ['Journal entry', 'Journal Voucher'],
    ['Delivery challan', 'Delivery Challan'], ['Credit note', 'Credit Note'], ['Debit note', 'Debit Note'], ['Cash memo', 'Cash Memo'], ['Sales order', 'Sales Order'], ['Purchase order', 'Purchase Order'],
    ['Proforma invoice', 'Proforma Invoice'], ['Self invoice', 'Self Invoice (RCM)'], ['Export invoice', 'Export Invoice']]
    .sort(function (a, b) { return b[0].length - a[0].length; });   /* longest first: "Sales summary" before "Sales" */
  function erpHead(h) {
    var n = h.firstChild; while (n && !(n.nodeType === 3 && n.nodeValue.trim()) && !(n.nodeType === 1 && n.tagName === 'SPAN' && n.textContent.trim())) n = n.nextSibling;
    if (!n) return; var t = n.nodeType === 3 ? n.nodeValue : n.textContent, lead = t.match(/^\s*/)[0], tt = t.slice(lead.length);
    if (ERPH.some(function (x) { return tt.indexOf(x[1]) === 0 && (tt.length === x[1].length || /^[\s·:(\d?]/.test(tt.slice(x[1].length))); })) return;   /* already an accounting name ("Sales Voucher" is not "Sales" + Voucher) */
    for (var i = 0; i < ERPH.length; i++) { var o = ERPH[i][0]; if (tt === o || tt.indexOf(o) === 0 && /^[\s·:(\d]/.test(tt.slice(o.length))) { if (tt.indexOf(ERPH[i][1]) === 0) return; var v = lead + ERPH[i][1] + tt.slice(o.length); if (n.nodeType === 3) n.nodeValue = v; else n.textContent = v; return; } }
  }
  var erpQ = false;
  function erpHeads() { erpQ = false; $$('[data-pane] h2, dialog[open] .dlg-hd h2, dialog[open] .dlg-h h2, dialog[open] > h2, #app-form h2').forEach(erpHead); }
  if (window.NSApp && NSApp.data) new MutationObserver(function () { if (!erpQ) { erpQ = true; setTimeout(erpHeads, 20); } }).observe(document.body, { childList: true, subtree: true });


  /* ---------- the Gateway on the left (owner 19 Nov 2026): company, Dashboard / My day / Chart of Accounts, Recently opened, Pinned ---------- */
  var PINK = 'ns-pins', RECK = 'ns-recent', KEYATTR = ['data-sec', 'data-hsec', 'data-dform', 'data-oract', 'data-my', 'data-qnew'];
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function linkKey(a) {
    for (var i = 0; i < KEYATTR.length; i++) if (a.hasAttribute(KEYATTR[i])) return KEYATTR[i] + '=' + a.getAttribute(KEYATTR[i]);
    var ic = a.getAttribute('data-ic'); return /^[td]-/.test(ic || '') ? 'data-ic=' + ic : '';
  }
  function linkByKey(k) { var p = k.split('='); return p[1] ? $('#ns-side a[' + p[0] + '="' + p.slice(1).join('=') + '"]:not(.gw-row)') : null; }
  function recIc(h) { var s = String(h || '').split('/')[0]; return { st: 'people', acl: 'book', do: 'doc', gsum: 'layers', fin: 'scale', masters: 'set', stf: 'people', os: 'clock' }[s] || 'list'; }
  function gwClone(a, extra) {
    var c = a.cloneNode(true); c.removeAttribute('id'); c.removeAttribute('aria-current'); c.classList.remove('on'); c.classList.add('gw-row'); c.hidden = false;
    if (extra) c.insertAdjacentHTML('beforeend', extra); return c;
  }
  function gwBig() { return !!(window.matchMedia && matchMedia('(min-width: 901px)').matches) && root.classList.contains('mb-on'); }
  function pinned() { return lsGet(PINK); }
  function togglePin(k, t) {
    var L = pinned(), at = L.map(function (x) { return x.k; }).indexOf(k);
    if (at >= 0) L.splice(at, 1); else L.push({ k: k, t: t });
    lsSet(PINK, L.slice(0, 12)); gateway();
    NS.toast(at >= 0 ? 'Unpinned: ' + t : 'Pinned: ' + t);
  }
  /* screens used: kept per hash change (the Dashboard, My day and Chart of Accounts are on top anyway) */
  function noteScreen() {
    var h = location.hash.replace(/^#/, ''); if (!h || /^(home|day|coa)$/.test(h) || /^do\/(my|page|web)\b/.test(h)) return;
    setTimeout(function () {
      var a = $('#ns-side a[href="#' + h + '"]:not(.gw-row)') || $('#ns-side a[data-hsec="' + h + '"]:not(.gw-row)') || $('#ns-side a[data-sec="' + h.split('/')[0] + '"]:not(.gw-row)');
      var ph = (($('[data-pane]:not([hidden]) h2') || {}).textContent || '').replace(/\?$/, '').trim();
      var t = /^ftools\/./.test(h) && ph ? ph : a ? (a.textContent || '').trim() : ph;   /* a free tool or branch is listed by its own name (25 Nov) */
      if (!t) return;
      var L = lsGet(RECK).filter(function (x) { return x.h !== h && x.t !== t.slice(0, 60); });   /* one line per name, never three the same */ L.unshift({ h: h, t: t.slice(0, 60) }); lsSet(RECK, L.slice(0, 8)); gateway();
    }, 700);
  }
  function gateway() {
    var app = A(), hub = $('#ns-side .sg-top'); if (!app || !app.biz || !hub) return;
    var box = $('#gw-box'); if (!box) { box = NS.el('div', { id: 'gw-box', 'class': 'gw' }); hub.parentNode.insertBefore(box, hub); var after = NS.el('div', { id: 'gw-after', 'class': 'gw' }); hub.parentNode.insertBefore(after, hub.nextSibling); }
    if (!app.biz()) return;   /* data not read yet: keep what is there; app.js calls this again after every load */
    var after2 = $('#gw-after'), b = app.biz() || {}, D = app.mine ? app.mine() : [], p = NS.period ? NS.period() : null;
    if (!gwBig()) { box.innerHTML = ''; after2.innerHTML = ''; return; }
    var last = D.reduce(function (m, d) { return d && d.date && !d.cancelled && d.date > m ? d.date : m; }, '');
    var fy = p && p.from ? NS.fy(p.from) : NS.fy(NS.today());
    /* drawn again only when something in it changed: redrawing the same left panel after every screen change made it flicker (owner 19 Nov) */
    var boxH = '<div class="gw-co"><b>' + esc(b.name || '') + '</b>' + (b.gstin ? '<small>GSTIN ' + esc(b.gstin) + '</small>' : '') +
      '<p><span>Financial year</span><b>' + esc(fy) + '</b></p>' +
      '<p><span>Period</span><button type="button" class="linkish" data-gw-per>' + esc(p ? NS.fmtDate(p.from) + ' – ' + NS.fmtDate(p.to) : fy) + '</button></p>' +
      (last ? '<p><span>Last entry</span><b>' + esc(NS.fmtDate(last)) + '</b></p>' : '') + '</div>';
    /* Recently opened: the last screens used, then the entries saved last (newest first), six in all */
    var rec = lsGet(RECK).slice(0, 4), rows = [];
    rec.forEach(function (x) { var a = $('#ns-side a[href="#' + x.h + '"]:not(.gw-row)') || $('#ns-side a[data-hsec="' + x.h + '"]:not(.gw-row)'); var c = a ? gwClone(a) : NS.el('a', { href: '#' + x.h, 'class': 'side-v gw-row', 'data-ic': recIc(x.h) }, '<span>' + esc(x.t) + '</span>'); if (!a) c.title = x.t; rows.push(c); });
    D.filter(function (d) { return d && d.no && d.id && !d.cancelled && d.type !== 'ob'; }).sort(function (x, y) { return (y.updated || y.created || 0) - (x.updated || x.created || 0); }).slice(0, 6 - rows.length).forEach(function (d) {
      var party = d.buyer && d.buyer.name || d.party || '', amt = app.amountOf ? app.amountOf(d) : d.total;
      var c = NS.el('a', { href: '#', 'class': 'side-v gw-row gw-doc', 'data-ic': 'doc', 'data-gwdoc': d.id, title: (app.docName ? app.docName(d) : d.type) + ' ' + d.no },
        '<span>' + esc((app.docName ? app.docName(d) : d.type) + ' ' + d.no) + (party || amt ? '<small>' + esc(party) + (party && amt ? ' · ' : '') + (amt ? esc(NS.money ? NS.money(amt) : String(amt)) : '') + '</small>' : '') + '</span>');
      rows.push(c);
    });
    if (box._h !== boxH) { box.innerHTML = boxH; box._h = boxH; }
    var A2 = after2; after2 = document.createElement('div');
    after2.innerHTML = rows.length ? '<div class="gw-h">Recently opened</div>' : '';
    rows.forEach(function (c) { after2.appendChild(c); });
    var pins = pinned().map(function (x) { var a = linkByKey(x.k); return a ? gwClone(a, '<button type="button" class="gw-unpin" data-gw-unpin="' + esc(x.k) + '" title="Unpin" aria-label="Unpin ' + esc(x.t) + '"></button>') : null; }).filter(Boolean);
    if (pins.length) { after2.insertAdjacentHTML('beforeend', '<div class="gw-h">Pinned</div>'); pins.forEach(function (c) { after2.appendChild(c); }); }
    else after2.insertAdjacentHTML('beforeend', '<div class="gw-h">Pinned</div><p class="gw-hint">Point at any item in the top menu and press its pin to keep it here.</p>');
    if (A2.innerHTML !== after2.innerHTML) A2.replaceChildren.apply(A2, [].slice.call(after2.childNodes));
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-gw-unpin],[data-gw-per],[data-gwdoc]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.hasAttribute('data-gw-unpin')) { var k = t.getAttribute('data-gw-unpin'); togglePin(k, (pinned().filter(function (x) { return x.k === k; })[0] || {}).t || ''); }
    else if (t.hasAttribute('data-gw-per')) { if (NS.periodBox) NS.periodBox(); }
    else { var ap = A(); if (ap && ap.viewDoc) ap.viewDoc(t.getAttribute('data-gwdoc')); }
  }, true);
  window.addEventListener('hashchange', noteScreen);
  var gwT = 0, gwSoon = function () { clearTimeout(gwT); gwT = setTimeout(gateway, 250); };
  document.addEventListener('ns-saved', gwSoon); document.addEventListener('ns-data', gwSoon); window.addEventListener('resize', gwSoon);
  NS.gateway = gateway;

  /* ---------- where you are, in the status bar (Busy: 'Transactions -> Sales') ---------- */
  function sbPath() {
    var sb = $('[data-sbar] .s-l'); if (!sb || !A() || !A().biz) return;
    var el = $('[data-s-path]', sb); if (!el) { el = NS.el('span', { 'class': 's-path', 'data-s-path': '' }); var fy = $('[data-s-fy]', sb); if (fy && fy.parentNode) fy.parentNode.insertBefore(el, fy.nextSibling); else sb.appendChild(el); }
    var f = $('#app-form[open]'), out = [];
    var h = location.hash.replace(/^#/, ''), a = h ? ($('#ns-side a[href="#' + h + '"]:not(.gw-row)') || $('#ns-side a[data-hsec="' + h + '"]:not(.gw-row)') || $('#ns-side a[data-sec="' + h.split('/')[0] + '"]:not(.gw-row)')) : null;
    if (f) { var t = (($('h2', f) || {}).textContent || '').split(' · ')[0].trim(); var fa = $('#ns-side a[data-dform="' + f.getAttribute('data-kind') + '"]:not(.gw-row)'); out = [fa ? grpOf(fa) : 'Transactions (Vouchers)', subOf(fa), t]; }
    else if (!h || h === 'home' || $('#ns-side a[data-sec="home"][aria-current="page"]')) out = ['Gateway'];
    else if (a) out = [grpOf(a), subOf(a), (a.textContent || '').trim().split('\n')[0]];
    else { var h2 = $('[data-pane]:not([hidden]) h2'), t2 = h2 ? [].slice.call(h2.childNodes).filter(function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join(' ').replace(/\?$/, '').trim() : ''; out = t2 ? [t2] : []; }   /* the heading's own words, not its buttons */
    el.textContent = out.filter(Boolean).join(' › ');
  }
  function grpOf(a) { var g = a && a.closest('.sg'); if (!g) return ''; var k = g.getAttribute('data-sg'); return k === 'top' ? '' : sgName(k); }
  function subOf(a) { var k = a && a.getAttribute('data-sub'); return k && SUBN[k] || ''; }
  window.addEventListener('hashchange', function () { setTimeout(sbPath, 300); });
  new MutationObserver(function (m) { if (m.some(function (x) { return x.target && x.target.id === 'app-form'; })) setTimeout(sbPath, 60); })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
  /* ---------- calculator (Ctrl+Alt+C): type a sum, Enter works it out; Use puts the answer in the box you were in ---------- */
  var calcDlg = null, calcFrom = null, calcHist = [];
  function calcVal(x) {
    var e = String(x || '').replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!/^[\d\s.+\-*/()]+$/.test(e) || !/\d/.test(e)) return null;
    try { var v = Function('"use strict";return (' + e + ')')(); return typeof v === 'number' && isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; } catch (er) { return null; }
  }
  function calc() {
    calcFrom = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) ? document.activeElement : null;
    if (!calcDlg) {
      calcDlg = NS.el('dialog', { 'class': 'calc-dlg', 'aria-labelledby': 'calc-h' });
      calcDlg.innerHTML = '<div class="dlg-hd"><h2 id="calc-h">Calculator</h2><button type="button" class="btn sm" data-calc-x>Close</button></div><div class="calc-b">' +
        '<input id="calc-in" type="text" inputmode="decimal" autocomplete="off" aria-label="Sum to work out" placeholder="For example 1250*18% or (450+120)*3">' +
        '<p class="calc-r" aria-live="polite">= <b data-calc-r>0</b></p><div class="calc-a"><button type="button" class="btn sm" data-calc-copy>Copy</button><button type="button" class="btn sm primary" data-calc-use>Use in the box</button></div>' +
        '<ol class="calc-h" data-calc-hist></ol><p class="soft">+ − × ÷ and %: 18% of 1250 is 1250*18%. Enter keeps the line below.</p></div>';
      document.body.appendChild(calcDlg);
      var inp = $('#calc-in', calcDlg), out = $('[data-calc-r]', calcDlg), hist = $('[data-calc-hist]', calcDlg);
      var show = function () { var v = calcVal(inp.value); out.textContent = v === null ? (inp.value.trim() ? '…' : '0') : NS.money ? String(v) : v; return v; };
      inp.addEventListener('input', show);
      inp.addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; e.preventDefault(); var v = show(); if (v === null) return; calcHist.unshift(inp.value + ' = ' + v); calcHist = calcHist.slice(0, 6); hist.innerHTML = calcHist.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); inp.value = String(v); });
      calcDlg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var v = calcVal(inp.value);
        if (b.hasAttribute('data-calc-x')) calcDlg.close();
        else if (b.hasAttribute('data-calc-copy') && v !== null) { try { navigator.clipboard.writeText(String(v)); NS.toast('Copied ' + v); } catch (er) {} }
        else if (b.hasAttribute('data-calc-use') && v !== null) { calcDlg.close(); if (calcFrom && calcFrom.isConnected) { calcFrom.value = String(v); calcFrom.dispatchEvent(new Event('input', { bubbles: true })); calcFrom.dispatchEvent(new Event('change', { bubbles: true })); calcFrom.focus(); } }
      });
    }
    calcDlg.showModal(); var i0 = $('#calc-in', calcDlg); i0.focus(); i0.select();
  }
  NS.calc = calc;
  function groupHub(hub) {
    var made = {}, fold = sgFolded(), done = {};
    function box(k) {
      if (made[k]) return made[k];
      var g = $('.sg[data-sg="' + k + '"]', hub);
      if (!g) {
        g = NS.el('div', { 'class': 'sg' + (k === 'top' ? ' sg-top' : ''), 'data-sg': k });
        g.innerHTML = (k === 'top' ? '' : '<button type="button" class="sg-h" aria-expanded="true"><span data-i18n="desk.um_' + k + '">' + esc(NS.t('desk.um_' + k)) + '</span></button>') + '<div class="sg-b"></div>';
        var order = SG.map(function (x) { return x[0]; }).concat(['more']), at = order.indexOf(k), next = null;
        $$('.sg', hub).forEach(function (o) { if (!next && order.indexOf(o.getAttribute('data-sg')) > at) next = o; });
        hub.insertBefore(g, next);
        var h = $('.sg-h', g);
        if (h) h.addEventListener('click', function () { var f = sgFolded(), shut = !g.classList.contains('shut'); g.classList.toggle('shut', shut); this.setAttribute('aria-expanded', String(!shut)); f['u-' + k] = shut; try { localStorage.setItem('ns-sg', JSON.stringify(f)); } catch (e) {} });
        var big = window.matchMedia && matchMedia('(min-width: 901px)').matches;   /* a computer: the top menu bar has every group, so the left side starts folded (owner 19 Nov 2026) */
        if (h && (('u-' + k) in fold ? fold['u-' + k] : big)) { g.classList.add('shut'); h.setAttribute('aria-expanded', 'false'); }
      }
      return (made[k] = $('.sg-b', g));
    }
    /* a sub-heading whose entries are all switched off for this business is hidden too (R-007: Inventory Reports, Trade Registers and Audit stood empty) */
    function tidySubs() {
      $$('.sg-b', side || document).forEach(function (b) {
        var kids = Array.prototype.slice.call(b.children), i, j, any;
        for (i = 0; i < kids.length; i++) {
          if (!kids[i].classList.contains('sg-sub')) continue;
          any = false;
          for (j = i + 1; j < kids.length && !kids[j].classList.contains('sg-sub'); j++) if (!kids[j].hidden && getComputedStyle(kids[j]).display !== 'none') { any = true; break; }
          kids[i].hidden = !any;
        }
      });
    }
    NS.sideTidy = tidySubs;
    function sort() {
      SG.forEach(function (g) {
        var b = box(g[0]), sub = '';
        g[1].forEach(function (x) {
          if (typeof x === 'string' && x.charAt(0) === '§') {   /* a sub-heading: what follows sits under it */
            sub = x.slice(1); if (!$(':scope > .sg-sub[data-sub="' + sub + '"]', b) && SUBN[sub]) b.appendChild(NS.el('div', { 'class': 'sg-sub', 'data-sub': sub }, esc(SUBN[sub])));
            return;
          }
          if (typeof x === 'string') { var a = $(':scope > a[data-sec="' + x + '"]', hub) || $('.sg-b > a[data-sec="' + x + '"]', hub); if (a) { b.appendChild(a); if (sub) a.setAttribute('data-sub', sub); else a.removeAttribute('data-sub'); } return; }
          var id = JSON.stringify(x); if (!done[id]) { var v = vItem(x); done[id] = v || 1; } if (done[id] && done[id] !== 1) { b.appendChild(done[id]); if (sub) done[id].setAttribute('data-sub', sub); }
        });
      });
      $$(':scope > a[data-sec]', hub).forEach(function (a) { box('more').appendChild(a); });
      /* every group (Masters, Transactions, Reports, GST and tax, Utilities...) in A to Z order of the names on screen (owner 19 Nov); Dashboard and My day stay on top */
      erpNames(side || document);   /* accounting names first, so the A to Z order uses them */
      $$('.sg[data-sg="x-docs"] .sg-b, .sg[data-sg="x-more"] .sg-b', side || document).forEach(abcSort);
      $$('#ns-side a[data-ic^="t-"], #ns-side a[data-ic^="d-"]').forEach(function (a) {
        var id = a.getAttribute('data-ic').replace(/^[td]-/, ''), m = DOCKEY[id], c = SITEKEY[id] || (SECKEY[id] && SECKEY[id][0]), k = m ? (m[1] ? 'Alt+' + m[1] : 'Alt+G ' + m[0]) : c ? 'Alt+G ' + c : '';
        if (k && !a.getAttribute('data-kh')) { a.setAttribute('data-kh', k); a.title = (a.textContent || '').trim() + '  ·  ' + k; }
      });
      var stfOn = window.NSApp && NSApp.stfTabs ? NSApp.stfTabs() : null;   /* payroll parts that are switched off stay out of the menu */
      if (stfOn) $$('a[data-hsec^="stf/"]', side || document).forEach(function (a) { a.hidden = stfOn.indexOf(a.getAttribute('data-hsec').slice(4)) < 0; });
      $$('a[data-oract]', side || document).forEach(function (a) { a.hidden = !(window.NSApp && NSApp.orAct); });
      Object.keys(made).forEach(function (k) { if (k !== 'top') abcSort(made[k]); });
      tidySubs();
      gwSoon(); setTimeout(sbPath, 50);
      var cur = $('a[aria-current="page"]', hub); if (cur) { var g = cur.closest('.sg'); if (g && g.classList.contains('shut')) { g.classList.remove('shut'); var h = $('.sg-h', g); if (h) h.setAttribute('aria-expanded', 'true'); } }
    }
    var lastSig = '';
    function sideSig() { return [$$('a', side || document).length, (NS.lang && NS.lang()) || '', window.NSApp && NSApp.stfTabs ? String(NSApp.stfTabs()) : '', !!(window.NSApp && NSApp.orAct)].join('|'); }
    var sort0 = sort; sort = function () { sort0(); lastSig = sideSig(); };
    sort();
    document.addEventListener('ns-lang', function () { setTimeout(sort, 60); });   /* another language: another A to Z */
    new MutationObserver(function () { if ($(':scope > a[data-sec]', hub)) sort(); }).observe(hub, { childList: true });
    /* Speed (27 Nov 2026): a screen change does not rebuild and re-sort the whole menu when nothing in it changed (it did, with a layout read for every link) */
    window.addEventListener('hashchange', function () { setTimeout(function () { if (sideSig() !== lastSig) sort(); else { gwSoon(); sbPath(); var cur2 = $('a[aria-current="page"]', hub); if (cur2) { var g2 = cur2.closest('.sg'); if (g2 && g2.classList.contains('shut')) { g2.classList.remove('shut'); var h2 = $('.sg-h', g2); if (h2) h2.setAttribute('aria-expanded', 'true'); } } } }, 50); });
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
    var pp = A() && A().biz && NS.period && NS.period();
    $('[data-s-fy]', sbar).textContent = pp ? NS.fmtDate(pp.from) + ' – ' + NS.fmtDate(pp.to) : T('fy', { y: NS.fy(NS.today()) });
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
  /* owner 21 Nov: "make the web version like the Windows software": on the App the Install button is always there (not installed,
     not the Windows program) and opens a box that says what installing gives and, where the browser has no install prompt, the
     exact steps for that browser; plus one gentle note on the 3rd day of use, again at most once a month. App screens are English. */
  var ISAPP = !!(window.NS_CFG && NS_CFG.inapp) && window.top === window;
  function winProg() { return !!window.NSDesktopXL || /Electron\//.test(navigator.userAgent); }
  function browserIs() {
    var u = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'ios';
    var mob = /Android/.test(u);
    if (/SamsungBrowser/.test(u)) return 'samsung';
    if (/Firefox\//.test(u)) return mob ? 'ffandroid' : 'firefox';
    if (/Edg\//.test(u)) return mob ? 'android' : 'edge';
    if (/OPR\//.test(u)) return mob ? 'android' : 'opera';
    if (/Chrome\//.test(u)) return mob ? 'android' : 'chrome';
    if (/Safari\//.test(u)) return 'safari';
    return 'other';
  }
  var STEPS = {
    chrome: ['Click the <b>install</b> icon at the right end of the address bar,', 'or open the menu <b>&#8942;</b> › <b>Cast, save and share</b> › <b>Install page as app</b>.', 'Press <b>Install</b>.'],
    edge: ['Click the <b>App available</b> icon at the right end of the address bar,', 'or open the menu <b>…</b> › <b>Apps</b> › <b>Install this site as an app</b>.', 'Press <b>Install</b>.'],
    opera: ['Open the menu, choose <b>Install NSBiz</b> (or look for the install icon in the address bar).'],
    android: ['Tap the menu <b>&#8942;</b> at the top right.', 'Tap <b>Add to home screen</b> (or <b>Install app</b>).', 'Tap <b>Install</b>. NSBiz now has its own icon on your home screen.'],
    samsung: ['Tap the menu <b>&#9776;</b> at the bottom.', 'Tap <b>Add page to</b> › <b>Home screen</b>.'],
    ffandroid: ['Tap the menu <b>&#8942;</b>.', 'Tap <b>Install</b> (or <b>Add to Home screen</b>).'],
    ios: ['Tap the <b>Share</b> button (the square with an arrow).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. NSBiz now has its own icon on your home screen.'],
    safari: ['In Safari on a Mac: open the <b>File</b> menu › <b>Add to Dock</b>.'],
    firefox: ['Firefox on a computer cannot install web apps.', 'Open <b>app.niveshsahayak.in</b> in <b>Chrome</b> or <b>Edge</b> and install it there, or download <b>NSBiz for Windows</b> below.'],
    other: ['Open your browser menu and look for <b>Install app</b> or <b>Add to home screen</b>.', 'If there is none, use Chrome or Edge, or download NSBiz for Windows below.']
  };
  function installBox() {
    var old = $('#ns-inst'); if (old) old.remove();
    var b = browserIs(), win = /Windows/.test(navigator.userAgent);
    var d = NS.el('dialog', { id: 'ns-inst', class: 'inst-dlg', 'aria-labelledby': 'ns-inst-h' });
    d.innerHTML = '<h2 id="ns-inst-h">Install NSBiz on this device</h2>' +
      '<ul class="inst-why"><li><b>Its own window and icon</b>, like any other program: no address bar, no tabs.</li>' +
      '<li><b>Opens without the internet</b> and starts faster.</li><li><b>Same data as now.</b> Nothing moves and nothing is sent to us.</li></ul>' +
      (deferredInstall ? '<p><button type="button" class="btn primary" data-inst-go>Install now</button></p>' :
        '<p class="inst-how">How to install in this browser:</p><ol class="inst-steps">' + STEPS[b].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>') +
      (win ? '<p class="soft inst-win">Prefer a normal Windows program with automatic daily copies of your data and the office network? <a href="/desktop/">Download NSBiz for Windows</a> (free).</p>' : '') +
      '<div class="inst-b"><button type="button" class="btn" data-inst-x>Close</button></div>';
    document.body.appendChild(d);
    var go = $('[data-inst-go]', d);
    if (go) go.onclick = function () {
      var p = deferredInstall; if (!p) return;
      p.prompt(); p.userChoice.finally(function () { deferredInstall = null; d.close(); });
    };
    $('[data-inst-x]', d).onclick = function () { d.close(); };
    d.addEventListener('close', function () { d.remove(); });
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  }
  /* the note: from the 3rd day the App was used on this device; "Not now" waits 30 days */
  function installNote() {
    if (!ISAPP || standalone() || winProg() || $('#ns-wncard') || $('#ns-instnote')) return;
    var now = Date.now(), days = [], later = 0;
    try { days = JSON.parse(localStorage.getItem('ns-inst-days') || '[]'); later = +localStorage.getItem('ns-inst-later') || 0; } catch (e) {}
    var today = new Date().toISOString().slice(0, 10);
    if (days.indexOf(today) < 0) { days.push(today); days = days.slice(-5); try { localStorage.setItem('ns-inst-days', JSON.stringify(days)); } catch (e) {} }
    if (days.length < 3 || now < later) return;
    if (document.querySelector('dialog[open]')) { setTimeout(installNote, 5000); return; }
    var bar = NS.el('div', { id: 'ns-instnote', class: 'remind', role: 'status' });
    bar.innerHTML = '<div class="wrap"><span><b>Install NSBiz on this device:</b> its own window and icon, and it opens without the internet.</span>' +
      '<button type="button" class="btn primary" data-inst-open>Install</button><button type="button" class="btn" data-inst-later>Not now</button></div>';
    $('[data-inst-open]', bar).onclick = function () { bar.remove(); installBox(); };
    $('[data-inst-later]', bar).onclick = function () { try { localStorage.setItem('ns-inst-later', String(now + 30 * 864e5)); } catch (e) {} bar.remove(); };
    document.body.appendChild(bar);
  }
  if (ISAPP && !standalone() && !winProg()) {
    var showBtn = function () {
      var b = $('[data-desk-install]'); if (b) b.hidden = false;
      /* phones: the title bar has no room for the button, so the side menu gets it too */
      var sd = $('#ns-side'), g = sd && $('.side-g', sd);
      if (g && !$('.side-inst', sd)) { var x = NS.el('button', { type: 'button', class: 'side-a side-inst', 'data-desk-install': '' }); x.textContent = 'Install NSBiz on this device'; g.parentNode.insertBefore(x, g); }   /* above the groups: never folded away */
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBtn); else showBtn();
    window.addEventListener('load', function () { setTimeout(installNote, 8000); });
  }
  window.addEventListener('appinstalled', function () { var n = $('#ns-instnote'); if (n) n.remove(); });
  function install() {
    if (ISAPP) { installBox(); return; }
    if (!deferredInstall) { NS.toast(T('installhow')); return; }
    deferredInstall.prompt(); deferredInstall.userChoice.finally(function () { deferredInstall = null; var b = $('[data-desk-install]'); if (b) b.hidden = true; });
  }


  /* ---------- shortcuts for every tool (owner 2026-11-18: "like normal Windows software") ----------
     Tally-style F keys for new entries, Alt+letter for the main screens, and Alt+G + a 2-letter code ("Go to", as in
     TallyPrime) for EVERY screen and document maker. Fixed letters, so a key never moves when the business type hides tools. */
  var SECKEY = { inbox: ['FW'], home: ['DB'],   /* FW = From the add-on (things sent From the Web, NSBiz Helper) */
    sales: ['SL'], money: ['MN'], acx: ['OI'], stf: ['SF'], itx: ['IT'], bimp: ['BI'], mig: ['SW'], mkimp: ['MQ'], msg: ['MG'], pd: ['PD'], env: ['EO'], dues: ['DU'],
    msme: ['MS'], limits: ['LH'], buy: ['PE'], parties: ['PA'], grp: ['GR'], chq: ['CQ'], books: ['CB'], cash: ['CK'], repeat: ['RB'],
    reports: ['RE'], day: ['MD'], tools: ['AT'], fin: ['FA'], capl: ['CL'], b2jv: ['JE'], b2fa: ['FX'], b2gd: ['GD'], b2make: ['PR'],
    b2job: ['JW'], b2profit: ['PF'], b2sman: ['SM'], b2year: ['YE'], features: ['AF'], packs: ['TP'], trust: ['DM'], warr: ['WS'], cacom: ['CC'],
    fees: ['FE'], stock: ['SK'], fam: ['MA'], cadb: ['CD'], cadoc: ['CA'], cagst: ['CG'], ebook: ['EB'], khata: ['KH'], preg: ['PG'], dlist: ['DR'], clist: ['CR'], ssum: ['SY'], psum: ['PY'], vreg: ['VR'], cbsum: ['CS'], mprint: ['MV'], coa: ['AC'], acl: ['LA'], masters: ['MT'], tdsr: ['TQ'], gststk: ['GF'], gtds: ['GW'], isd: ['GJ'], charts: ['CH'], pdffill: ['FQ'], ftools: ['FT'], config: ['CF'],
    gsum: ['GS'], gvch: ['GV'], os: ['OS'], exc: ['TC'], int: ['IR'], bw: ['BW'], ord: ['OU'],
    /* menu entries that had no key (owner 19 Nov 2026): masters, payroll parts and the final account views */
    'masters/led': ['LD'], 'masters/grp': ['AG'], 'masters/bank': ['BK'], 'masters/vt': ['VT'], 'masters/item': ['IM'], 'masters/igrp': ['IG'], 'masters/unit': ['UM'],
    'masters/trn': ['TN'], 'masters/veh': ['VH'], 'masters/biz': ['CY'], 'stf/emp': ['EP'], 'stf/heads': ['HD'], 'stf/run': ['RS'], 'stf/att': ['AD'], 'stf/leave': ['LV'],
    'stf/adv': ['AV'], 'stf/loan': ['LN'], 'stf/year': ['BG'], 'stf/pf': ['EF'], 'stf/esi': ['EI'], 'stf/tax': ['SD'], 'fin/bs': ['BS'], 'fin/pl': ['PL'], 'fin/tb': ['TB'] };
  /* other menu entries with fixed codes: the Inventory Vouchers entries of the Orders screen, the GST and TDS sites, My data parts */
  var ORKEY = { grn: 'GN', rejin: 'GI', rejout: 'GO', lc: 'LC' };
  var SITEKEY = { gstr1: 'GA', gstr3b: 'GB', gstr2b: 'GC', cmp08: 'CP', tds: 'TD',
    /* the free tools under More free tools (owner 19 Nov 2026); Stock keeps the code SK of its screen */
    ca: 'AW', amc: 'AM', 'bank-reco': 'BR', barcode: 'BC', calc: 'CU', declaration: 'DF', distance: 'DS', 'e-invoice': 'EV', 'eway-bill': 'EW', 'export-invoice': 'XI',
    garage: 'GG', 'gst-calendar': 'DD', gstin: 'GK', hsn: 'HS', ifsc: 'IF', learn: 'LG', marketplace: 'MK', compare: 'NC', pincode: 'PN', 'price-list': 'LP',
    'profit-loss': 'PK', share: 'SH', tally: 'TL', file: 'WF' };
  var MYKEY = { backup: 'BU' };
  var QAKEY = { party: 'NP', item: 'NI' };   /* Go to codes of New party / New item (quick add) */
  /* Ctrl+Alt + a letter (owner 19 Nov 2026): the Shortcuts panel's items that had no simple key. A letter -> what it opens. */
  var CAKEY = { q: 'quick', p: 'q:party', i: 'q:item', t: 'fin/tb', b: 'fin/bs', l: 'fin/pl', d: 'dlist', r: 'clist', s: 'stock', c: 'calc' };
  var CALBL = {}; Object.keys(CAKEY).forEach(function (l) { CALBL[CAKEY[l]] = 'Ctrl+Alt+' + l.toUpperCase(); });
  function simpleKey(s) { return CALBL[s] || fName(s); }
  function caRun(job) {
    if (/^q:/.test(job)) { if (NS.quickAddNew) NS.quickAddNew(job.slice(2)); return; }
    if (job === 'calc') { calc(); return; }
    if (job === 'quick') { var ap = A(); if (ap && ap.quickEntry) ap.quickEntry(); return; }
    if (job === 'stock') { var st = $('#ns-side a[data-sec="stock"]'); if (st) st.click(); else location.hash = 'do/stock/'; return; }
    location.hash = job;
  }   /* ord: orders.js (ERP round 2) */   /* billwise.js (ERP Round 2): interest report, bill-wise settings */   /* reports.js (ERP review round 1): group summary, group vouchers, bill-wise outstanding, things to check */
  var DOCKEY = { billing: ['IN'], quotation: ['QT'], proforma: ['PI'], 'sales-order': ['SO'], challan: ['DC'], 'purchase-order': ['PO'],
    'credit-note': ['CN'], 'debit-note': ['DN'], 'cash-memo': ['CM'], receipt: ['RC'], voucher: ['VC'], 'self-invoice': ['SI'], 'rent-receipt': ['RR'],
    'salary-slip': ['SS'], 'petty-cash': ['PC'], pos: ['PS'], pharmacy: ['PH'], restaurant: ['RT'], bilty: ['LR'], 'job-card': ['JC'], hotel: ['HT'],
    rent: ['RN'], 'contractor-bill': ['CT'], 'fee-receipt': ['FR'], clinic: ['CV'], salon: ['SN'], jewellery: ['JL'], garment: ['GM'], mandi: ['MI'],
    petrol: ['PP'], dairy: ['DY'], subscribers: ['SU'], tripsheet: ['TS'] };
  /* new entries: [form, 2-letter code, F key] (the App's own forms) */
  var FORMKEY = [['sale', 'SB', 'F8'], ['min', 'MR', 'F6'], ['mout', 'MP', 'F5'], ['pbill', 'PB', 'F9'], ['exp', 'EX', 'F10'], ['contra', 'CO', 'F4'], ['pret', 'PT', ''], ['ob', 'OB', ''], ['genr', 'RV', ''], ['genp', 'PM', '']];   /* A-10: Receipt / Payment with any ledgers */
  var FKEY = { F3: 'biz', F4: 'contra', F5: 'mout', F6: 'min', F7: 'b2jv', F8: 'sale', F9: 'pbill', F10: 'exp', 'Ctrl+F8': 'credit-note', 'Ctrl+F9': 'debit-note' };
  var ALTKEY = {};   /* letter -> what it opens (filled from SECKEY / DOCKEY) */
  Object.keys(SECKEY).forEach(function (s) { if (SECKEY[s][1]) ALTKEY[SECKEY[s][1].toLowerCase()] = { sec: s }; });
  Object.keys(DOCKEY).forEach(function (s) { if (DOCKEY[s][1]) ALTKEY[DOCKEY[s][1].toLowerCase()] = { site: s }; });
  function secName(s) { var a = $('#ns-side a[data-sec="' + s + '"]'); return a ? (a.textContent || '').trim() : ''; }
  function goSec(s) { var a = $('#ns-side a[data-sec="' + s + '"]'); if (a) { a.click(); a.focus(); } else location.hash = s; }
  function newDoc(site) { var app = A(); if (app && app.newDoc) app.newDoc(site); else goUrl(siteUrl(site)); }
  function runForm(f) {
    var app = A(); if (!app || !app.openForm) return;
    (app.whenReady || function (g) { g(); })(function () { if (app.biz() && !$('dialog[open]')) app.openForm(f); });
  }
  function fRun(what) {
    var app = A();
    if (isOff(what)) { NS.toast(NS.t('desk.offkey')); return; }
    if (what === 'biz') { if (app && app.switchBiz) (app.whenReady || function (g) { g(); })(app.switchBiz); return; }
    if (SECKEY[what]) { goSec(what); return; }
    if (DOCKEY[what]) { newDoc(what); return; }
    runForm(what);
  }
  function fName(k) { var r = []; Object.keys(FKEY).forEach(function (x) { if (FKEY[x] === k) r.push(x); }); return r[0] || ''; }
  /* every tool with its keys: [group, name, direct key, code, run] (the sheet, the Go to box and the Ctrl K box use it) */
  function registry() {
    var app = A(), out = [];
    if (!app || !app.biz) return out;
    FORMKEY.forEach(function (f) { out.push({ g: 'rec', off: offForm(f[0]), t: app.T(f[0] === 'sale' ? 'qe_sale' : f[0]), k: f[2], c: f[1], run: function () { runForm(f[0]); } }); });
    out.push({ g: 'rec', t: NS.t('app.qe_title'), k: 'Ctrl+Alt+Q', c: 'QE', run: function () { if (app.quickEntry) app.quickEntry(); } });
    $$('#ns-side a[data-sec]').forEach(function (a) {
      var s = a.getAttribute('data-sec'), m = SECKEY[s] || [];
      out.push({ g: 'go', off: offSec(s), t: (a.textContent || '').trim(), k: simpleKey(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { goSec(s); } });
    });
    /* report screens that sit in the side menu as plain links (Debtors list, Chart of Accounts...): Alt+G codes and Ctrl K find them too (P2-10) */
    $$('#ns-side a[data-hsec]').forEach(function (a) {
      var s = a.getAttribute('data-hsec'), m = SECKEY[s] || [];
      if (out.some(function (x) { return x.sec === s; })) return;
      out.push({ g: 'go', sec: s, off: false, t: (a.textContent || '').trim(), k: simpleKey(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { location.hash = s; } });
    });
    /* F1-6: every screen that has a Go to code on the Keyboard shortcuts page works, also when the side menu does not list it
       (cash and bank books, stock, CA hand-over, e-books...). The account ledger code opens the Chart of Accounts to pick the account. */
    var have = {}; out.forEach(function (x) { if (x.c) have[x.c] = 1; });
    Object.keys(SECKEY).forEach(function (s) {
      var m = SECKEY[s]; if (!m[0] || have[m[0]] || offSec(s)) return;
      var a = $('#ns-side a[data-sec="' + s + '"]'), lk = 'app.' + s, lbl = a ? (a.textContent || '').trim() : NS.t(lk) !== lk ? NS.t(lk) : s;
      /* screens that live on another site of ours (F1-6 re-check: they fell back to the Dashboard): open that site inside the App */
      var OTHER = { stock: 'do/stock/', cadb: 'do/ca/#cadb', cadoc: 'do/ca/#cadoc', cagst: 'do/ca/#cagst' };
      var to = s === 'acl' ? 'coa' : OTHER[s] || s;
      have[m[0]] = 1;
      out.push({ g: 'go', sec: s, off: false, t: s === 'acl' ? NS.t('desk.v_coa') : lbl, k: simpleKey(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0], run: function () { if (a && !OTHER[s]) goSec(s); else location.hash = to; } });
    });
    (app.newDocs ? app.newDocs() : []).forEach(function (n) {
      var m = DOCKEY[n[0]] || [];
      out.push({ g: 'new', off: offSite(n[0]), t: n[1], k: fName(n[0]) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { newDoc(n[0]); } });
    });
    var byLink = function (sel, code) { var a = $(sel); if (!a || a.hidden) return; out.push({ g: 'go', off: false, t: (a.textContent || '').trim(), k: '', c: code, run: function () { a.click(); } }); };
    Object.keys(ORKEY).forEach(function (k) { byLink('#ns-side a[data-oract="' + k + '"]', ORKEY[k]); });
    Object.keys(SITEKEY).forEach(function (k) { byLink('#ns-side .sg a[data-ic="t-' + k + '"]', SITEKEY[k]); });
    Object.keys(MYKEY).forEach(function (k) { byLink('#ns-side a[data-my="' + k + '"]', MYKEY[k]); });
    if (NS.quickAddNew) Object.keys(QAKEY).forEach(function (k) { out.push({ g: 'rec', off: false, t: NS.t('desk.v_new' + k), k: CALBL['q:' + k], c: QAKEY[k], run: function () { NS.quickAddNew(k); } }); });
    /* a screen or maker this table does not know yet still gets a code: its first free pair of letters */
    var used = {}; out.forEach(function (x) { if (x.c) used[x.c] = 1; });
    out.forEach(function (x) {
      if (x.c) return;
      var L = (x.t || '').toUpperCase().replace(/[^A-Z]/g, '');
      for (var i = 1; i < L.length && !x.c; i++) { var c = L[0] + L[i]; if (!used[c]) { x.c = c; used[c] = 1; } }
    });
    return out;
  }
  /* switched off for this type of business (firstrun.js)? A screen, a form or a site (maker / feature site) */
  function offSec(s) { var a = $('#ns-side a[data-sec="' + s + '"]'); return !!(a && NS.featHidden && NS.featHidden(a)); }
  function offSite(s) { if (!NS.featHidden) return false; var a = document.createElement('a'); a.setAttribute('data-ic', 'd-' + s); return NS.featHidden(a); }
  function offForm(f) { return !!(NS.featHidden && NS.featHidden(f)); }
  function isOff(what) { return SECKEY[what] ? offSec(what) : DOCKEY[what] ? offSite(what) : what === 'biz' ? false : offForm(what); }
  NS.deskKeys = function () { return registry().filter(function (x) { return !x.off; }); };

  /* ---------- command box (Ctrl+K) ---------- */
  var cmd, list, items = [], shown = [], at = 0;
  var FORMS = [['min', 'F6'], ['mout', 'F5'], ['pbill', 'F9'], ['exp', 'F10'], ['pret', ''], ['ob', '']];
  var OWNSITE = { invoice: 'billing', quote: 'quotation', proforma: 'proforma', so: 'sales-order', challan: 'challan', po: 'purchase-order', self: 'self-invoice', note: 'credit-note', cashmemo: 'cash-memo', receipt: 'receipt', voucher: 'voucher', rent: 'rent-receipt', salary: 'salary-slip', petty: 'petty-cash' };
  var DOCWORD = { invoice: 'Doc.invoice', quote: 'Doc.quote', proforma: 'Doc.proforma', so: 'Doc.so', challan: 'Doc.challan', po: 'Doc.po', self: 'Doc.self', note: 'Doc.note', cashmemo: 'Doc.cashmemo', receipt: 'Doc.receipt', voucher: 'Doc.voucher', rent: 'Doc.rent', salary: 'Doc.salary', petty: 'Doc.petty' };
  function formOf(d) { return d.type === 'jv' ? 'jv' : (d.type || 'invoice') === 'invoice' ? 'sale' : d.type === 'contra' ? 'contra' : d.type === 'exp' ? 'exp' : d.type === 'ob' ? 'ob' : d.type === 'pbill' ? (d.kind === 'return' ? 'pret' : 'pbill') : d.type === 'receipt' ? 'min' : 'mout'; }
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
        var off = !!(NS.featHidden && NS.featHidden(a));   /* a feature switched off (firstrun.js): still found when typed, never in the first list */
        var sec = a.getAttribute('data-sec'), i = sec ? $$('#ns-side a[data-sec]').indexOf(a) : -1;
        var tx = (a.textContent || '').trim();
        out.push({ off: off, s: off ? NS.t('fr.offnote') : '', g: g.getAttribute('data-g') === 'docs' || g.getAttribute('data-g') === 'more' ? 'new' : gk, t: tx, e: NS.meaning(tx) + ' ' + (SYN[sec] || ''),
          k: a.getAttribute('data-ic') === 'd-billing' ? 'Alt+G IN' : DOCKEY[(a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')] ? (function (m, s) { return fName(s) || (m[1] ? 'Alt+' + m[1] : 'Alt+G ' + m[0]); })(DOCKEY[(a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')], (a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')) : sec && SECKEY[sec] ? (fName(sec) || (SECKEY[sec][1] ? 'Alt+' + SECKEY[sec][1] : 'Alt+G ' + SECKEY[sec][0])) : i >= 0 && i < 9 ? 'Alt+' + (i + 1) : '', run: function () { a.click(); } });
      });
    });
    var app = A();
    if (app && app.biz && app.biz()) FORMS.forEach(function (f) { var off = !!(NS.featHidden && NS.featHidden(f[0])); out.push({ off: off, s: off ? NS.t('fr.offnote') : '', g: 'rec', t: app.T(f[0]), e: NS.meaning(app.T(f[0])), k: f[1], run: function () { app.openForm(f[0]); } }); });
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
    var getI = app && app.data && app.data().item ? Promise.resolve(app.data().item) : window.NSStore ? NSStore.list('item').catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([getP, getI]).then(function (R) {
      var C = R[0], out = [], seen = {}, seenI = {};
      (R[1] || []).forEach(function (it) {   /* items (F1-16) */
        var k = key(it.desc || it.name); if (!k || seenI[k] || it.sample) return; seenI[k] = 1;
        out.push({ g: 'item', e: NS.cfText ? NS.cfText(it) : '', t: it.desc || it.name, s: [it.hsn ? 'HSN ' + it.hsn : '', it.rate ? NS.money(it.rate) : '', it.gst !== '' && it.gst != null ? it.gst + '%' : ''].filter(Boolean).join(' · '), run: function () { if (app && app.biz) location.hash = 'do/my/#item'; else location.href = myUrl('item'); } });
      });
      C.party.forEach(function (p) {
        var k = key(p.name); if (!k || seen[k]) return; seen[k] = 1;
        out.push({ g: 'party', e: NS.cfText ? NS.cfText(p) : '', t: p.name, s: [p.gstin, p.phone, p.city].filter(Boolean).join(' · '), run: function () { if (app && app.biz) location.hash = 'st/' + encodeURIComponent(k); else location.href = appUrl('st/' + encodeURIComponent(k)); } });
      });
      C.doc.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).slice(0, 400).forEach(function (d) {
        var site = (d.type === 'note' && d.kind === 'debit' ? 'debit-note' : OWNSITE[d.type]), appRec = d.app || /^(pbill|exp|ob|contra)$/.test(d.type);
        if (!site && !appRec) return;
        var who = (d.buyer && d.buyer.name) || '', name = app && app.docName ? app.docName(d) : NS.t(d.type === 'note' && (d.kind === 'credit' || d.kind === 'debit') ? 'k.' + d.kind : DOCWORD[d.type] || '') || d.type;
        out.push({ g: 'doc', e: NS.cfText ? NS.cfText(d) : '', t: name + (d.no ? ' ' + d.no : '') + (who ? ' · ' + who : ''), s: (d.date ? NS.fmtDate(d.date) : '') + (d.total ? ' · ' + NS.money(d.total) : ''),
          run: function () {
            if (appRec) { if (app && app.openForm) app.openForm(formOf(d), { rec: d }); else location.href = appUrl(''); return; }
            goUrl(app && app.docUrl && app.docUrl(d) || siteUrl(site) + '?open=' + encodeURIComponent(d.id));
          } });
      });
      return out;
    }).catch(function () { return []; });
  }
  /* the App: every other business is one search away ("Business: <name>") */
  function bizActs() {
    var app = A();
    if (!app || !app.setBiz || !app.biz || !app.biz()) return [];
    return app.data().biz.filter(function (b) { return b.id !== app.biz().id; }).map(function (b) { return { g: 'act', t: NS.t('app.biz') + ': ' + b.name, k: 'F3', run: function () { app.setBiz(b.id); } }; });
  }
  function actions() {
    return [
      { g: 'act', t: T('a_theme'), run: function () { click('[data-theme-btn]'); } },
      { g: 'act', t: 'Look and feel: colour pack, spacing, text size', run: function () { if (window.NSTheme) NSTheme.open(); } },
      { g: 'act', t: NS.t('mydata'), run: function () { click('[data-act="my-data"]'); } },
      { g: 'act', t: NS.t('md.save'), run: function () { var b = NS.el('button', { 'data-act': 'backup', hidden: '' }); document.body.appendChild(b); b.click(); b.remove(); } },
      { g: 'act', t: T('mini'), k: 'Ctrl+B', run: toggleMenu },
      { g: 'act', t: T('keys'), k: 'Ctrl /', run: keysSheet },
    ].concat(bizActs()).concat([
      { g: 'act', t: T('lang'), run: function () { var s = $('[data-lang-pick]'); if (s && !s.offsetParent && A() && root.classList.contains('installed')) { location.hash = '#features'; return; } if (s) { s.focus(); if (s.showPicker) try { s.showPicker(); } catch (e) {} } } }
    ]).concat(deferredInstall ? [{ g: 'act', t: T('install'), run: install }] : []);
  }
  var back = null, picked = false, goMode = false;
  function palette(from, mode) {
    if (!window.MiniSearch) NS.loadJs(MSLIB).catch(function () {});   /* ready by the time the first letters are typed */
    goMode = mode === 'go';
    if (!cmd) {
      cmd = NS.el('dialog', { id: 'desk-cmd', class: 'desk-cmd' });
      cmd.innerHTML = '<div class="cmd-in">' + ic(SEARCH) + '<input type="search" role="combobox" aria-label="' + esc(T('find')) + '" aria-expanded="true" aria-controls="desk-cmd-l" aria-autocomplete="list" autocomplete="off" spellcheck="false" dir="auto"><kbd>Esc</kbd></div>' +
        '<ul id="desk-cmd-l" role="listbox"></ul><p class="cmd-ft"></p>';
      document.body.appendChild(cmd);
      list = $('ul', cmd);
      var inpt = $('input', cmd);
      inpt.addEventListener('input', function () {
        at = 0;
        /* Go to: the 2 letters of a code open it at once (Alt+G, I, N = new invoice) */
        var v = inpt.value.trim().toUpperCase();
        if (goMode && /^[A-Z]{2}$/.test(v)) { var hitc = items.filter(function (x) { return x.code === v; })[0]; if (hitc) { picked = true; cmd.close(); setTimeout(hitc.run, 0); return; } }
        draw(inpt.value);
      });
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
    inp.placeholder = T(goMode ? 'go_ph' : 'ph'); inp.setAttribute('aria-label', T(goMode ? 'go_ph' : 'ph')); $('.cmd-ft', cmd).textContent = T(goMode ? 'go_ft' : 'cmdft');
    cmd.classList.toggle('cmd-go', goMode);
    items = goMode ? NS.deskKeys().map(function (x) { return { g: x.g, t: x.t, s: x.k, e: x.c, k: x.c, code: x.c, run: x.run }; }) : collect(); inp.value = ''; at = 0; draw('');
    back = from || (document.activeElement !== document.body ? document.activeElement : null);
    cmd.showModal(); inp.focus(); setTimeout(function () { if (cmd.open && document.activeElement !== inp) inp.focus(); }, 30);
    if (!goMode) dataItems().then(function (more) { items = items.concat(more); if (cmd.open && inp.value) draw(inp.value); });
    /* other files add their own results (helppanel.js: help articles), each a function giving items or a promise of them */
    if (!goMode) (NS.cmdMore || []).forEach(function (f) { Promise.resolve().then(f).then(function (more) { items = items.concat(more || []); if (cmd.open && inp.value) draw(inp.value); }).catch(function () {}); });
  }
  var GROUPS = ['go', 'rec', 'new', 'party', 'item', 'doc', 'help', 'act'];
  var MSLIB = '/assets/vendor/minisearch-7.2.0.js', msIx = null, msFor = null, msLen = -1;
  function fuzzyIx() {
    if (!window.MiniSearch) { NS.loadJs(MSLIB).catch(function () {}); return null; }
    if (msIx && msFor === items && msLen === items.length) return msIx;
    msIx = new window.MiniSearch({ fields: ['t', 's', 'e'], idField: 'id', searchOptions: { boost: { t: 3 } } });
    msIx.addAll(items.map(function (x, i) { return { id: i, t: String(x.t || ''), s: String(x.s || ''), e: String(x.e || '') }; }));
    msFor = items; msLen = items.length; return msIx;
  }
  function draw(qs) {
    var words = qs.toLowerCase().split(/\s+/).filter(Boolean);
    var one = goMode && /^[a-z]$/i.test(qs.trim()) ? qs.trim().toUpperCase() : '';
    var hit = one ? items.filter(function (x) { return x.code && x.code.charAt(0) === one; }) :
      items.filter(function (x) { var h = (x.t + ' ' + (x.s || '') + ' ' + (x.e || '')).toLowerCase(); return words.every(function (w) { return h.indexOf(w) >= 0; }); });
    /* close matches (MiniSearch 7.2.0, MIT, kept in /assets/vendor/): a typing mistake or half a word still finds the party, item
       or screen ("sharma tradrs" finds Sharma Traders). Exact matches stay first; close ones follow, best first. */
    if (!one && words.length && qs.trim().length >= 3 && hit.length < 6) {
      var ms = fuzzyIx(); if (ms) { var seen = new Set(hit); ms.search(qs, { fuzzy: 0.25, prefix: true, combineWith: 'AND' }).slice(0, 12).forEach(function (r) { var x = items[r.id]; if (x && !seen.has(x)) { seen.add(x); hit.push(x); } }); }
    }
    if (!words.length && !goMode) hit = hit.filter(function (x) { return !x.off && x.g !== 'doc' && x.g !== 'party' && x.g !== 'item' && x.g !== 'new' && x.g !== 'help'; });
    else hit = hit.filter(function (x) { return !x.off; });   /* strict (owner 2026-11-18): a tool switched off for this type of business is not offered */   /* what is switched off comes last, so it never pushes the business's own tools down */
    shown = []; var html = '';
    GROUPS.forEach(function (g) {
      var part = hit.filter(function (x) { return x.g === g; }).slice(0, goMode ? 99 : words.length ? 8 : 12);
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

  /* ---------- the voucher screen (moved here from app.js so every site and tool has it): every entry form (#app-form) is a full screen beside the side menu, not a box over the page
     (owner 2026-11-18). Title bar with Back, the form, a Save bar that stays at the bottom. Leaving with unsaved typing asks first
     (Esc, Back, Cancel, an F key for another entry). Small questions stay small boxes. ---------- */
  function voucherScreen(d) {
    if (!d) {
      /* every site and tool (owner 2026-11-18): the App's entry form, the b2 boxes, and any box with an entry form */
      var af = $('#app-form'); if (af) voucherScreen(af);   /* never call with no box: that would start this again, for ever */
      $$('dialog.b2-dlg').forEach(function (x) { voucherScreen(x); });
      new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && n.matches('dialog.b2-dlg')) voucherScreen(n); }); }); }).observe(document.body, { childList: true });
      /* any other box with an entry form (a Save button and a title bar) becomes a voucher screen when it opens; questions, search,
         help, the setup and other small boxes stay small. Some boxes draw their whole inside again at every opening: dressed each time */
      var SMALL = '#desk-ask,#ns-wncard,#ns-inst,#desk-cmd,#desk-keys,#ns-help,.nsf-dlg,.pk-dlg,.bz-dlg,#ns-mydata,.cap-dlg,#ns-tell,#ns-series,.sf-gate,.help-pnl,.qe-cus,.vt-cpd,.vt-ask';
      var open0 = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        try { if (this.classList.contains('vs')) vsDress(this); else if (!this.matches(SMALL) && $('.dlg-hd,.dlg-h', this) && $('input:not([type=hidden]),select,textarea,table,button[type=submit]', this)) voucherScreen(this);   /* any titled box with fields or a list (a tool's rooms, diary, stock...) */ } catch (e) {}
        this._at = Date.now();
        /* an entry screen opens WITHOUT locking the page (multitasking): the title bar (bell, search, Help), the side menu and the
           status bar stay usable; a newer screen sits above an older one. Small boxes and questions still lock the page. */
        if (this.classList.contains('vs')) {
          VSZ += 1; this.style.zIndex = String(VSZ); vsHist(this);
          var r0 = HTMLDialogElement.prototype.show.apply(this, arguments);
          frVs(); this.addEventListener('close', frVs, { once: true });
          return r0;
        }
        return open0.apply(this, arguments);
      };
      return;
    }
    if (d.classList.contains('vs')) return;
    d.classList.add('vs', 'hub-dlg');
    /* Back asks first when something is typed (before the box's own close listener runs) */
    d.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.vs-back')) { e.preventDefault(); e.stopPropagation(); NS.vsLeave(null, d); } }, true);
    d.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('form')) d.setAttribute('data-dirty', '1'); });
    d.addEventListener('change', function (e) { if (e.target.closest && e.target.closest('form')) d.setAttribute('data-dirty', '1'); });
    /* the other parts' boxes get the same keys as the App's own entry form: Ctrl+S saves, Enter goes to the next box */
    if (d.id !== 'app-form') d.addEventListener('keydown', function (e) {
      if (e.defaultPrevented) return;   /* a box's own keys handled it (quick add: P4-17, saved twice) */
      var k = (e.key || '').toLowerCase(), t = e.target, sb = $('button[type=submit]', d), f = sb && sb.closest('form');
      if (!f) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 's') { e.preventDefault(); if (f.requestSubmit) f.requestSubmit(sb); else sb.click(); return; }
      if (k !== 'enter' || e.shiftKey || e.ctrlKey || !t || !/^(INPUT|SELECT)$/.test(t.tagName) || /^(checkbox|radio|file|submit|button)$/.test(t.type)) return;
      var all = $$('input,select', f).filter(function (x) { return !x.disabled && x.type !== 'hidden' && x.type !== 'file' && x.type !== 'checkbox' && x.offsetParent !== null && !x.closest('details:not([open])'); });
      var i = all.indexOf(t); if (i >= 0 && i < all.length - 1) { e.preventDefault(); NS.focusSel(all[i + 1]); }   /* the text is selected: typing 3 replaces a default 1 (F4-13) */
    });
    d.addEventListener('cancel', function (e) { if (d.getAttribute('data-dirty')) { e.preventDefault(); NS.vsLeave(null, d); } });
    d.addEventListener('close', function () { if (!d._parking) d.removeAttribute('data-dirty'); });
    /* a form drawn again inside the box (the App's entry form, the b2 boxes) is dressed again */
    new MutationObserver(function () { vsDress(d); }).observe(d, { childList: true, subtree: false });
    $$('form', d).forEach(function (f) { new MutationObserver(function () { vsDress(d); }).observe(f, { childList: true }); });
    vsDress(d);
  }
  /* the title bar's close button becomes Back; the Save bar gets the keys to remember; a new form starts clean at the top */
  function vsDress(d) {
    var back = $('.vs-back', d) || $('.dlg-hd .icon-btn', d) || $('.dlg-hd [data-x]', d) || $('.dlg-h form[method=dialog] button', d) || $('.dlg-h > button:last-child', d);
    if (!back) {   /* phone test 21 Nov: a title bar with no close button (Additional cost) left only Cancel at the very bottom */
      var hd0 = $('.dlg-hd,.dlg-h', d);
      if (hd0) { back = NS.el('button', { type: 'button' }); hd0.insertBefore(back, hd0.firstChild); }
    }
    if (back && !back.classList.contains('vs-back')) {
      back.removeAttribute('onclick'); back.type = 'button'; back.className = 'btn sm vs-back'; back.setAttribute('aria-keyshortcuts', 'Escape');
      back.innerHTML = '<span data-i18n="app.back">' + esc(NS.t('app.back')) + '</span>';
    }
    var sb = $('button[type=submit]', d), ft = sb && (sb.closest('.dlg-foot,.btns,.dlg-f') || sb.parentNode);
    if (ft) ft.classList.add('vs-foot');
    if (ft && !$('.vs-keys', ft)) ft.insertAdjacentHTML('beforeend', '<span class="vs-keys" aria-hidden="true">' + esc(NS.t('app.vs_keys')) + '</span>');
    if (d._resuming || Date.now() - (d._resumeAt || 0) < 1500) { d._resuming = false; return; }   /* a parked entry comes back as it was */
    d.removeAttribute('data-dirty'); d.scrollTop = 0;
  }
  /* phone test 21 Nov 2026: the phone's Back button (and the browser's Back) closes the open entry screen instead of leaving
     the App and losing the entry. Each entry screen is one step in the browser history (same address); Back takes that step
     away: the screen closes, asking first when something is typed (Stay puts the step back). Closing it any other way takes
     the step away too, without moving the page. */
  var popSkip = 0;
  /* phone test 21 Nov: inside the App's frame an entry screen showed the App's Back row AND its own Back: while one is open, the
     App's row steps aside (same site, so the frame can tell the App directly) */
  function frVs() {
    if (!document.documentElement.classList.contains('embed')) return;
    try {
      var pd = window.parent.document.documentElement, on = !!document.querySelector('dialog.vs[open]');
      if (pd.classList.contains('fr-vs') !== on) { pd.classList.toggle('fr-vs', on); window.parent.dispatchEvent(new Event('resize')); }
    } catch (e) {}
  }
  /* Chrome on Android skips history steps a page adds, so its Back key never reached them (tested on Android 16): where the browser
     has close watchers (Chrome 120+), the phone's Back closes the entry screen through one; elsewhere the history step is used */
  function vsLeaveAsk(d, stay) {
    if (!d.getAttribute('data-dirty')) { d.close(); return; }
    NS.ask(NS.t('app.vs_leave'), { ok: NS.t('app.vs_discard'), no: NS.t('app.vs_stay'), danger: 1 }).then(function (y) {
      if (y) { d.removeAttribute('data-dirty'); d.close(); return; }
      stay();
      var x = $('input,select', d); if (x) x.focus();
    });
  }
  /* the watcher is made just after the screen shows and made again at each tap inside it: Chrome only gives the Back key to a
     close watcher that is new enough (one made while the screen was opening never got it on Android 16) */
  function vsUnwatch(d) { if (d._cw) { var w = d._cw; d._cw = null; w.onclose = null; try { w.destroy(); } catch (e) {} } }
  function vsWatchNow(d) {
    if (!d.open) return;
    vsUnwatch(d);
    try { d._cw = new CloseWatcher(); } catch (e) { d._cw = null; return; }
    d._cw.onclose = function () { d._cw = null; if (d.open) vsLeaveAsk(d, function () { vsWatchNow(d); }); };
  }
  function vsWatch(d) {
    setTimeout(function () { vsWatchNow(d); }, 0);
    if (d._cwWired) return;
    d._cwWired = 1;
    /* after the tap or key press has counted as the user's action (a touch counts when the finger lifts, so not pointerdown) */
    var re = function () { if (d.open) vsWatchNow(d); };
    d.addEventListener('click', re, true);
    d.addEventListener('input', re, true);
    d.addEventListener('close', function () { vsUnwatch(d); });
  }
  function vsHist(d) {
    if (typeof CloseWatcher === 'function') { vsWatch(d); return; }
    if (d._hist) return;
    d._hist = 1;
    try { history.pushState({ nsvs: Date.now() }, ''); } catch (e) { d._hist = 0; return; }
    if (d._histWired) return;
    d._histWired = 1;
    d.addEventListener('close', function () {
      if (!d._hist) return;
      d._hist = 0;
      if (history.state && history.state.nsvs) { popSkip += 1; history.back(); }
    });
  }
  window.addEventListener('popstate', function () {
    if (popSkip) { popSkip -= 1; return; }
    var open = $$('dialog.vs[open]').filter(function (x) { return x._hist; }).sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); })[0];
    if (!open) return;
    open._hist = 0;   /* the step is already gone */
    vsLeaveAsk(open, function () { vsHist(open); });   /* staying: the step comes back, so the next Back asks again */
  });
  /* leave the voucher screen; with typing in it, ask first. then = what to open next (an F key) */
  /* Esc on an entry screen (it is not a locked box, so the browser does not do it): the top one goes back, asking first when typed */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || $('dialog:modal')) return;
    var open = $$('dialog.vs[open]'); if (!open.length) return;
    var d = open.sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); })[0];
    e.preventDefault(); var ev = new Event('cancel', { cancelable: true }); if (d.dispatchEvent(ev)) d.close();
  });
  /* Esc on any other App screen goes one level up, like Tally: the screen's own Back, else the Dashboard.
     In a box being typed in, the first Esc only leaves the box. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || $('dialog[open]') || !A() || root.classList.contains('side-open')) return;
    if ($('.mb-drop')) return;
    var t = e.target; if (NS.typingIn(t)) { t.blur(); return; }
    var h = location.hash.replace(/^#/, ''); if (!h || h === 'home') return;
    var tr = A().trail && A().trail();   /* ERP review R-1: one level up = the screen the user came from (reports.js puts the row back) */
    if (tr && tr.length > 1 && !/^do\//.test(h)) { e.preventDefault(); history.back(); return; }
    var vis = function (n) { return n && n.offsetParent !== null; };
    var bk = $$('[data-fback]').filter(vis)[0] || $$('#main a.link[href^="#"]').filter(function (a) { return vis(a) && /^\s*‹|back/i.test(a.textContent); })[0];
    e.preventDefault();
    if (bk) bk.click(); else location.hash = 'home';
  });
  NS.vsLeave = function (then, d) {
    d = d || $('dialog.vs[open]');
    var go = function () { if (d) { d.removeAttribute('data-dirty'); if (d.open) d.close(); } if (then) setTimeout(then, 0); };
    if (!d || !d.open || !d.getAttribute('data-dirty')) { go(); return; }
    NS.ask(NS.t('app.vs_leave'), { ok: NS.t('app.vs_discard'), no: NS.t('app.vs_stay'), danger: 1 }).then(function (y) { if (y) go(); else { var x = $('input,select', d); if (x) x.focus(); } });
  };
  voucherScreen();
  /* going to another screen (Ctrl K, an Alt or F key, a link) while an entry screen is open: the entry screen closes, asking first
     when something is typed (owner 2026-11-18: the party ledger did not show until Esc) */
  /* ---------- multitasking: an entry with typing in it is PARKED when another screen opens (a link, Ctrl K, an Alt key):
     it goes to the status bar as a button with its name, and that button brings it back exactly as it was (owner 2026-11-18).
     An entry with nothing typed simply closes. Parked boxes are closed without counting as closed (_parking), so a bill
     number kept for them is not let go. ---------- */
  var parked = [];   /* [{ list: [dialogs, bottom first], name }] */
  function taskName(list) {
    var top = list[list.length - 1], base = list[0];
    var t = (($('.dlg-hd h2,.dlg-h h2,h2', base) || {}).textContent || '').replace(/\s+/g, ' ').trim();
    var p = $('input[list="dl-party"],#b-name,#f-party', base), pv = p && p.value.trim();
    return (t || NS.t('desk.task')) + (pv ? ' · ' + pv : '') + (top !== base ? ' + ' + ((($('h2', top) || {}).textContent) || '').trim() : '');
  }
  function drawTray() {
    var tray = $('#ns-tasks');
    if (!tray && sbar) { tray = NS.el('div', { id: 'ns-tasks', 'class': 'task-tray', role: 'group' }); tray.setAttribute('aria-label', NS.t('desk.tasks')); sbar.insertBefore(tray, sbar.firstChild); }
    if (!tray) return;
    tray.hidden = !parked.length;
    tray.innerHTML = parked.length ? '<span class="tt-l">' + esc(NS.t('desk.tasks')) + '</span>' + parked.map(function (k, i) {
      return '<button type="button" class="tt-b" data-task="' + i + '" title="' + esc(NS.t('desk.resume')) + '">' + NS.icSvg('edit') + '<span>' + esc(k.name) + '</span></button>';
    }).join('') : '';
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-task]'); if (b) NS.vsResume(+b.getAttribute('data-task')); });
  /* the status bar never cuts a word in half (owner 25 Nov: "He…", "Last backup: tod"): when everything does not fit, whole
     items step aside, least needed first, and come back when there is room again */
  var SBFIT = ['[data-s-path]', '.s-copy', '[data-s-keys]', '.task-tray .tt-l', '[data-s-fy]', '[data-s-store]', '[data-s-backup]', '[data-s-net]'], sbT = 0, sbBusy = false;
  function sbFit() {
    var bar = $('[data-sbar]'); if (!bar || sbBusy || !bar.getClientRects().length) return;   /* a fixed bar has no offsetParent */
    sbBusy = true;
    $$('.sb-off', bar).forEach(function (x) { x.classList.remove('sb-off'); });
    var over = function () { var l = $('.s-l', bar); return bar.scrollWidth > bar.clientWidth + 1 || (l && l.scrollWidth > l.clientWidth + 1); };
    for (var i = 0; i < SBFIT.length && over(); i++) $$(SBFIT[i], bar).forEach(function (x) { x.classList.add('sb-off'); });
    sbBusy = false;
  }
  NS.sbFit = function () { clearTimeout(sbT); sbT = setTimeout(sbFit, 60); };
  window.addEventListener('resize', NS.sbFit);
  (function watch() {
    var bar = $('[data-sbar]'); if (!bar) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); return; }
    new MutationObserver(function () { if (!sbBusy) NS.sbFit(); }).observe(bar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    NS.sbFit();
  })();
  NS.vsPark = function (then) {
    var open = $$('dialog.vs[open]');
    if (!open.length) { if (then) then(); return; }
    if (!open.some(function (d) { return d.getAttribute('data-dirty'); })) { open.forEach(function (d) { d.close(); }); if (then) then(); return; }
    var task = { list: open, name: taskName(open) };
    for (var i = open.length - 1; i >= 0; i--) { var d = open[i]; d._parking = true; d._parked = task; d._scroll = d.scrollTop; d.addEventListener('close', function () { var x = this; setTimeout(function () { x._parking = false; }, 0); }, { once: true }); d.close(); }   /* the close event comes a moment later: the mark stays until it has run */
    parked.push(task); drawTray();
    NS.toast(NS.t('desk.parked', { n: task.name }));
    if (then) setTimeout(then, 0);
  };
  NS.vsResume = function (i) {
    var task = typeof i === 'number' ? parked[i] : parked.filter(function (k) { return k.list.indexOf(i) >= 0; })[0];
    if (!task) return;
    var go = function () {
      parked.splice(parked.indexOf(task), 1); drawTray();
      task.list.forEach(function (d) { if (!document.contains(d)) return; var dirty = d.getAttribute('data-dirty'); d._resuming = true; d._resumeAt = Date.now(); d.showModal(); d._parked = null; if (dirty) d.setAttribute('data-dirty', dirty); d.scrollTop = d._scroll || 0; });
      var top = task.list[task.list.length - 1], f = top && $('input:not([type=hidden]),select,textarea', top); if (f) f.focus();
    };
    if ($$('dialog.vs[open]').length) NS.vsPark(go); else go();
  };
  NS.vsDrop = function (d) { var task = parked.filter(function (k) { return k.list.indexOf(d) >= 0; })[0]; if (!task) return; parked.splice(parked.indexOf(task), 1); task.list.forEach(function (x) { x._parked = null; x.removeAttribute('data-dirty'); }); drawTray(); };
  NS.vsParked = function (d) { return !!(d && d._parked); };
  window.addEventListener('hashchange', function () {
    if ($$('dialog.vs[open]').some(function (d) { return Date.now() - (d._at || 0) > 400; })) NS.vsPark();
  });

  /* ---------- the folded side menu shows only icons: pointing at one (or moving onto it with Tab) shows its name and key
     beside it (owner 2026-11-18: "taking the cursor to the sidebar should say what this is") ---------- */
  (function sideTip() {
    var tip = null;
    function hide() { if (tip) tip.hidden = true; }
    function show(a) {
      if (!root.classList.contains('side-mini') || !a) return;
      var name = ($('span', a) || a).textContent.trim() || a.getAttribute('aria-label') || '';
      if (!name) return;
      if (!tip) { tip = NS.el('div', { 'class': 'side-tip', role: 'tooltip', id: 'side-tip' }); document.body.appendChild(tip); }
      var k = a.getAttribute('data-kh') || a.getAttribute('aria-keyshortcuts') || '';
      tip.innerHTML = esc(name) + (k ? ' <kbd>' + esc(k.replace(/\+/g, '+')) + '</kbd>' : '');
      tip.hidden = false;
      var r = a.getBoundingClientRect(), rtl = document.documentElement.dir === 'rtl';
      tip.style.top = Math.max(4, r.top + r.height / 2 - tip.offsetHeight / 2) + 'px';
      if (rtl) { tip.style.left = ''; tip.style.right = (innerWidth - r.left + 8) + 'px'; } else { tip.style.right = ''; tip.style.left = (r.right + 8) + 'px'; }
      a.setAttribute('aria-describedby', 'side-tip');
    }
    document.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('#ns-side a, #ns-side button.side-fold'); if (a) show(a); else hide(); });
    document.addEventListener('focusin', function (e) { var a = e.target.closest && e.target.closest('#ns-side a'); if (a) show(a); else hide(); });
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  })();

  /* ---------- keyboard ---------- */
  var KEYS = [['Alt G', 'k_go'], ['Ctrl K', 'k_cmd'], ['Ctrl B', 'k_menu'], ['Alt 1 … 9', 'k_secs'], ['F3 / Alt S', '=app.biz'],
    ['Ctrl Shift F', 'k_find'], ['F1', 'k_hlp'], ['Ctrl /', 'k_help'], ['Ctrl S', 'k_save'], ['F2', 'k_qadd'], ['Ctrl P', 'k_print'], ['Esc', 'k_esc']];
  var keysDlg;
  function keysSheet() {
    if (!keysDlg) { keysDlg = NS.el('dialog', { id: 'desk-keys', class: 'desk-keys', 'aria-labelledby': 'desk-keys-h' }); document.body.appendChild(keysDlg); }
    keysDlg.innerHTML = '<div class="dk-hd"><h2 id="desk-keys-h">' + esc(T('keys')) + '</h2><span><a class="btn sm" href="' + (A() ? '/keyboard-shortcuts/' : appUrl('').replace(/#$/, '') + 'keyboard-shortcuts/') + '" data-dk-full>' + esc(T('k_full')) + '</a> ' + (registry().length ? '<button type="button" class="btn sm" data-dk-print>' + esc(NS.t('b.print')) + '</button> ' : '') + '<button type="button" class="icon-btn" aria-label="' + esc(NS.t('close')) + '" data-close>✕</button></span></div>' +
      '<h3 class="dk-g">' + esc(T('kg_gen')) + '</h3><table class="dk-t"><tbody>' + KEYS.filter(function (k) { return k[1].charAt(0) !== '=' || A() && A().switchBiz && A().data().biz.length > 1; }).map(function (k) { return '<tr><th scope="row"><kbd>' + esc(k[0]) + '</kbd></th><td>' + esc(k[1].charAt(0) === '=' ? NS.t(k[1].slice(1)) : T(k[1])) + '</td></tr>'; }).join('') + '</tbody></table>' + toolTables() + '<p class="dk-note">' + esc(T('k_note')) + '</p>';
    $('[data-close]', keysDlg).onclick = function () { keysDlg.close(); };
    $('[data-dk-full]', keysDlg).addEventListener('click', function () { keysDlg.close(); });
    var pb = $('[data-dk-print]', keysDlg);
    /* print: the sheet is copied into a plain block (a modal window does not print well), everything else is hidden */
    if (pb) pb.onclick = function () {
      var box = NS.el('div', { id: 'dk-printarea' }), biz = A() && A().biz && A().biz();
      box.innerHTML = '<h1>NSBiz: ' + esc(T('keys')) + '</h1>' + (biz ? '<p>' + esc(biz.name) + '</p>' : '') + $$('.dk-g, .dk-t', keysDlg).map(function (n) { return n.outerHTML; }).join('');
      document.body.appendChild(box); keysDlg.close(); root.classList.add('dk-print');
      var done = function () { root.classList.remove('dk-print'); box.remove(); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done); setTimeout(function () { window.print(); }, 60);
    };
    keysDlg.showModal();
  }
  /* every tool: its key and its Go to code (Alt+G, then the 2 letters) */
  function toolTables() {
    var reg = NS.deskKeys(); if (!reg.length) return '';
    return [['rec', 'kg_rec'], ['go', 'kg_go'], ['new', 'kg_new']].map(function (g) {
      var rows = reg.filter(function (x) { return x.g === g[0]; });
      return rows.length ? '<h3 class="dk-g">' + esc(T(g[1])) + '</h3><table class="dk-t dk-3"><thead><tr><th scope="col">' + esc(T('k_what')) + '</th><th scope="col">' + esc(T('k_key')) + '</th><th scope="col">Alt G +</th></tr></thead><tbody>' +
        rows.map(function (x) { return '<tr><td>' + esc(x.t) + '</td><td>' + (x.k ? '<kbd>' + esc(x.k) + '</kbd>' : '') + '</td><td><kbd>' + esc(x.c) + '</kbd></td></tr>'; }).join('') + '</tbody></table>' : '';
    }).join('');
  }
  NS.deskKeysSheet = function () { keysSheet(); };
  function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 'k') { e.preventDefault(); if (cmd && cmd.open) cmd.close(); else palette(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'b' && !typing(e)) { e.preventDefault(); toggleMenu(); return; }
    if (e.key === 'Escape' && root.classList.contains('side-open')) { drawer(false); var b = $('[data-side-btn]'); if (b) b.focus(); return; }
    var vs = $('dialog.vs[open]');
    if ($('dialog[open]') && !(vs && $$('dialog[open]').length === 1)) return;
    var app = A();
    if (app && app.biz && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
      var cj = CAKEY[(e.code || '').replace('Key', '').toLowerCase()];
      /* AltGr (some Indian layouts) is Ctrl+Alt: while typing in a box, an AltGr letter stays a letter */
      if (cj && !(typing(e) && e.getModifierState && e.getModifierState('AltGraph'))) {
        e.preventDefault(); if (e.repeat) return;
        if (isOff(cj)) { NS.toast(NS.t('desk.offkey')); return; }
        if (vs) NS.vsPark(function () { caRun(cj); }); else caRun(cj);
        return;
      }
    }
    if (vs) {   /* on a voucher screen: F keys switch to another entry, Alt+G and the Alt letters leave it (asking first) */
      var fk2 = /^F([3-9]|10)$/.test(e.key) && !e.altKey && !e.shiftKey && !e.metaKey ? FKEY[(e.ctrlKey ? 'Ctrl+' : '') + e.key] : null;
      var al = e.altKey && !e.ctrlKey && !e.metaKey ? (e.code || '').replace('Key', '').toLowerCase() : '';
      if (fk2) { e.preventDefault(); if (!e.repeat) NS.vsLeave(function () { fRun(fk2); }); return; }
      if (al === 'g') { e.preventDefault(); if (!e.repeat) NS.vsPark(function () { palette(null, 'go'); }); return; }
      return;
    }
    /* F keys, Tally style (F8 sale, F9 purchase, F6 receipt, F5 payment, F4 contra, F7 journal, F10 expense, F3 business,
       Ctrl+F8 credit note, Ctrl+F9 debit note): only inside the App, where they never type a letter, so they work in any box */
    if (app && app.biz && /^F([3-9]|10)$/.test(e.key) && !e.altKey && !e.shiftKey && !e.metaKey) {
      var fk = FKEY[(e.ctrlKey ? 'Ctrl+' : '') + e.key];
      if (fk) { e.preventDefault(); if (!e.repeat) fRun(fk); }
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      var n = /^Digit([1-9])$/.exec(e.code || '');
      if (n) { var a = $$('#ns-side a[data-sec]').filter(function (x) { return !(NS.featHidden && NS.featHidden(x)); })[+n[1] - 1]; if (a) { e.preventDefault(); a.click(); a.focus(); } return; }
      var c = (e.code || '').replace('Key', '').toLowerCase();
      if (c === 'g' && app && app.biz) { e.preventDefault(); if (!e.repeat) palette(null, 'go'); return; }
      /* Alt + a letter: the letter of something on this screen (altkeys.js, 25 Nov 2026). The old App-wide letters
         (Alt+N, R, P, B, X, S, Q, H, L ...) are gone: F keys, Alt+G codes and Ctrl+Alt letters open the same things. */
      return;
    }
    /* combinations only, never a bare key (owner 19 Nov 2026): Ctrl+Shift+F searches the list on the screen, Ctrl+/ shows the keys */
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && (e.code === 'KeyF' || (e.key || '').toLowerCase() === 'f')) { var q = $('[data-q], main input[type=search]'); if (q) { e.preventDefault(); q.focus(); q.select(); } return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) { e.preventDefault(); keysSheet(); return; }
  });

  window.addEventListener('online', net); window.addEventListener('offline', net);
  document.addEventListener('ns-lang', status);
  window.addEventListener('focus', status);
  document.addEventListener('ns-data', status);
  function init() { build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* What's new (App only, NS_CFG.wn = newest day + its first headline): a dot on the side menu link when the App changed since
   this person last opened What's new, and one slim note after an update. First visit: remembered quietly, no note. */
(function () {
  var W = window.NS_CFG && NS_CFG.wn;
  if (!W || window.top !== window || !window.NS) return;
  var SEEN = 'ns-wn-seen', NOTE = 'ns-wn-note', get = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return null; } };
  var put = function (k) { try { localStorage.setItem(k, W.d); } catch (e) {} };
  var seen = get(SEEN);
  if (seen === null) return;
  if (/\/whats-new\/$/.test(location.pathname)) [].forEach.call(document.querySelectorAll('#ns-side a[href$="whats-new/"]'), function (a) { a.setAttribute('aria-current', 'page'); });
  if (/\/whats-new\/$/.test(location.pathname) || !seen) { put(SEEN); put(NOTE); return; }
  if (seen >= W.d) return;
  function dot() { [].forEach.call(document.querySelectorAll('#ns-side a[href$="whats-new/"]'), function (a) { a.classList.add('wn-new'); }); }
  dot(); setTimeout(dot, 1500);
  if (get(NOTE) >= W.d) return;
  /* owner 21 Nov ("will anyone see what we did?"): after an update the App shows ONE card with the newest update's top lines,
     a link to everything and Got it; never again for that update. It waits until no entry screen or box is open. */
  function card() {
    if (!W.h || !W.h.length || document.getElementById('ns-wncard')) return note();
    if (document.querySelector('dialog[open]')) { setTimeout(card, 4000); return; }
    var link = document.querySelector('#ns-side a[href$="whats-new/"]'), href = link ? link.getAttribute('href') : '/whats-new/';
    var KW = { new: 'New', better: 'Better', fix: 'Fixed' };
    var d = NS.el('dialog', { id: 'ns-wncard', class: 'wn-card', 'aria-labelledby': 'ns-wncard-h' });
    d.innerHTML = '<p class="wn-card-k">' + NS.esc(NS.t('wn.card_k')) + '</p><h2 id="ns-wncard-h"></h2><ul class="wn-card-l"></ul>' +
      '<p class="wn-card-more soft"></p><div class="wn-card-b"><a class="btn" data-ic="new"></a><button type="button" class="btn primary" data-wn-ok data-noic></button></div>';
    NS.$('h2', d).textContent = W.n || NS.t('wn.title');
    NS.$('ul', d).innerHTML = W.h.map(function (x) {
      return '<li class="t-' + NS.esc(x[0]) + '"><span class="wn-tag">' + NS.esc(KW[x[0]] || '') + '</span><b>' + NS.esc(x[1]) + '</b><span>' + NS.esc(x[2] || '') + '</span></li>';
    }).join('');
    var more = (W.c || 0) - W.h.length;
    NS.$('.wn-card-more', d).textContent = more > 1 ? NS.t('wn.card_more', { n: more }) : more === 1 ? NS.t('wn.card_more1') : '';
    var a = NS.$('a', d); a.href = href; a.textContent = NS.t('wn.see');
    var ok = NS.$('[data-wn-ok]', d); ok.textContent = NS.t('wn.ok');
    var done = function () { put(NOTE); try { d.close(); } catch (e) {} d.remove(); };
    ok.onclick = done; a.addEventListener('click', function () { put(NOTE); put(SEEN); d.remove(); });
    d.addEventListener('cancel', function () { put(NOTE); });
    d.addEventListener('close', function () { put(NOTE); if (d.isConnected) d.remove(); });
    document.body.appendChild(d);
    try { d.showModal(); ok.focus(); } catch (e) { d.setAttribute('open', ''); }
  }
  function note() {
    if (document.getElementById('ns-wnnote')) return;
    var L = NS.lang ? NS.lang() : 'en', link = document.querySelector('#ns-side a[href$="whats-new/"]');
    var bar = NS.el('div', { id: 'ns-wnnote', class: 'remind', role: 'status' });
    bar.innerHTML = '<div class="wrap"><span></span><a class="btn primary" data-ic="new"></a><button type="button" class="btn" data-wn-ok></button></div>';
    NS.$('span', bar).textContent = NS.t('wn.note') + ' ' + ((W.t && (W.t[L] || W.t.en)) || '');
    var a = NS.$('a', bar); a.href = link ? link.getAttribute('href') : '/whats-new/'; a.textContent = NS.t('wn.see');
    var ok = NS.$('[data-wn-ok]', bar); ok.textContent = NS.t('wn.ok');
    ok.onclick = function () { put(NOTE); bar.remove(); };
    a.addEventListener('click', function () { put(NOTE); });
    document.body.appendChild(bar);   /* owner 20 Nov: at the bottom, above the status bar (desk.css #ns-wnnote), not above the screen */
    document.addEventListener('ns-lang', function () {
      var l2 = NS.lang(); NS.$('span', bar).textContent = NS.t('wn.note') + ' ' + ((W.t && (W.t[l2] || W.t.en)) || '');
      a.textContent = NS.t('wn.see'); ok.textContent = NS.t('wn.ok');
    });
  }
  if (document.readyState === 'complete') setTimeout(card, 2500); else window.addEventListener('load', function () { setTimeout(card, 2500); });
  /* opened from the App (it shows inside the App's frame, #do/page/whats-new/): seen (F1-14) */
  function seenNow() { put(SEEN); put(NOTE); [].forEach.call(document.querySelectorAll('#ns-side a.wn-new'), function (a) { a.classList.remove('wn-new'); }); var nb = document.getElementById('ns-wnnote'); if (nb) nb.remove(); }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href*="whats-new"]'); if (a) seenNow(); }, true);
  window.addEventListener('hashchange', function () { if (/whats-new/.test(location.hash)) seenNow(); });
})();
