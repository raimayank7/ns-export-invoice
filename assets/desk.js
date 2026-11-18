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
    day: 'calendar', tools: 'layers', repeat: 'repeat', reports: 'chart', b2jv: 'journal', b2fa: 'asset', b2gd: 'box', b2make: 'factory', b2profit: 'trend', b2sman: 'badge', b2year: 'calendar', grp: 'layers', fin: 'scale', fam: 'factory', capl: 'coins', b2job: 'wrench', ledger: 'book', move: 'trend', st: 'list', stf: 'badge', acx: 'tax', features: 'toggle', bimp: 'bimport', itx: 'itax', msme: 'coins', limits: 'scale', trust: 'coins', warr: 'wrench', fees: 'cap', packs: 'pack', cadb: 'dash', cadoc: 'folder', cagst: 'tax', cacom: 'chat', saved: 'save',
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
      var tb = NS.el('nav', { class: 'tabbar', 'aria-label': T('menu') });
      tb.innerHTML = $$('a[data-sec]', hub).slice(0, 4).map(function (a) { return a.outerHTML.replace(/\s(aria-keyshortcuts|title|id)="[^"]*"/g, ''); }).join('') +
        '<button type="button" data-side-btn data-ic="more" aria-expanded="false"><span data-i18n="desk.more">' + esc(T('more')) + '</span></button>';
      document.body.appendChild(tb);
      $$('a', tb).forEach(function (a) { a.addEventListener('click', function () { var o = $('#ns-side a[data-sec="' + a.getAttribute('data-sec') + '"]'); if (o) { a.blur(); } }); });
    }
  }
  /* ---------- the umbrella (owner 2026-11-18, after showing Tally, Busy, ZEEFA and Evershine): the App's menu by accounting job,
     Masters / Transactions / Reports / GST and tax / Utilities, like an accounting program's gateway. Each group holds screens
     (data-sec, moved here from the App's own list), voucher entries ({f: form}), master pages in My data ({my: part}),
     final account views ({fin: view}) and GST tools ({site: name}). Dashboard and My day stay on top without a heading.
     Click a heading to open or fold it; the group of the screen in use opens; what is folded is remembered (ns-sg).
     A screen this list does not know goes under More. No new keys: every item shows the key it already had. ---------- */
  var SG = [
    ['top', ['home', 'day']],
    ['masters', [{ h: 'coa', t: 'v_coa', ic: 'layers' }, 'parties', { my: 'item', t: 'v_items', ic: 'box' }, { my: 'pgroups', t: 'v_groups', ic: 'layers' }, { my: 'biz', t: 'v_biz', ic: 'shop' }, 'b2gd', 'stf', 'b2sman', { f: 'ob', t: 'v_ob', ic: 'scale' }, 'trust', 'fees', 'warr']],
    ['trans', [{ f: 'sale', t: 'v_sale', ic: 'doc' }, { f: 'pbill', t: 'v_pbill', ic: 'cart' }, { f: 'min', t: 'v_min', ic: 'money' }, { f: 'mout', t: 'v_mout', ic: 'money' }, { f: 'contra', t: 'v_contra', ic: 'bank' }, 'b2jv', { f: 'exp', t: 'v_exp', ic: 'cart' }, { f: 'pret', t: 'v_pret', ic: 'repeat' },
      'sales', 'buy', 'money', 'chq', 'capl', 'b2fa', 'b2make', 'b2job', 'repeat', 'khata', 'preg']],
    ['reports', [{ fin: 'bs', t: 'v_bs', ic: 'scale' }, { fin: 'pl', t: 'v_pl', ic: 'chart' }, { fin: 'tb', t: 'v_tb', ic: 'list' }, { h: 'dlist', t: 'v_dlist', ic: 'people' }, { h: 'clist', t: 'v_clist', ic: 'people' }, { h: 'ssum', t: 'v_ssum', ic: 'chart' }, { h: 'psum', t: 'v_psum', ic: 'chart' }, { h: 'vreg', t: 'v_vreg', ic: 'list' }, { h: 'cbsum', t: 'v_cbsum', ic: 'bank' }, 'fin', 'books', 'dues', 'grp', 'msme', 'stock', 'b2profit', 'reports', 'cadb', 'ebook']],
    ['tax', ['acx', { site: 'gstr1' }, { site: 'gstr3b' }, { site: 'gstr2b' }, { site: 'cmp08' }, { site: 'tds' }, 'cagst', 'itx', 'limits', 'cacom', 'cadoc']],
    ['util', [{ h: 'mprint', t: 'v_mprint', ic: 'doc' }, 'bimp', 'b2year', { my: 'backup', t: 'v_backup', ic: 'data' }, { my: 'settings', t: 'v_settings', ic: 'set' }, 'features', 'packs', 'tools']]];
  var SGOF = {}; SG.forEach(function (g) { g[1].forEach(function (s) { if (typeof s === 'string') SGOF[s] = g[0]; }); });
  SGOF.st = 'masters';
  function sgName(g) { return g === 'docs' ? NS.t('desk.sg_new') : NS.t('desk.um_' + g); }
  function myUrl(part) { var a = $('#ns-side a[data-ic=set]'); return (a ? a.href.split('#')[0] : 'https://my.niveshsahayak.in/') + '#' + part; }
  function formKey(f) { var r = FORMKEY.filter(function (x) { return x[0] === f; })[0]; return r ? r[2] || 'Alt+G ' + r[1] : ''; }
  function secKey(s) { var m = SECKEY[s], fk = m && fName(s); return fk || (m && m[1] ? 'Alt+' + m[1] : m ? 'Alt+G ' + m[0] : ''); }
  /* an item of the list that is not one of the App's screens: drawn like a side link */
  function vItem(x) {
    var a = NS.el('a', { 'class': 'side-v', 'data-ic': x.ic || 'dot' }), key = '';
    if (x.f) { a.href = '#'; a.setAttribute('data-dform', x.f); key = formKey(x.f); if (offForm(x.f)) a.hidden = true; }
    else if (x.my) a.href = myUrl(x.my);
    else if (x.fin) a.href = '#fin/' + x.fin;
    else if (x.h) { a.href = '#' + x.h; a.setAttribute('data-hsec', x.h); key = secKey(x.h); }
    else if (x.site) { var o = $('#ns-side .side-g a[data-ic="t-' + x.site + '"]'); if (!o) return null; a.href = o.href; a.setAttribute('data-ic', 't-' + x.site); if (o.getAttribute('data-port')) a.setAttribute('data-port', o.getAttribute('data-port')); a.innerHTML = o.innerHTML; a.title = (o.textContent || '').trim(); o.hidden = true; return a; }   /* listed here, not twice */
    a.innerHTML = '<span data-i18n="desk.' + x.t + '">' + esc(NS.t('desk.' + x.t)) + '</span>';
    if (key) { a.setAttribute('data-kh', key); a.title = NS.t('desk.' + x.t) + '  ·  ' + key; } else a.title = NS.t('desk.' + x.t);
    return a;
  }
  document.addEventListener('click', function (e) {
    var qn = e.target.closest && e.target.closest('[data-qnew]');   /* New party / New item open the quick add box right here, not My data */
    if (qn) { e.preventDefault(); closeDrops(); NS.quickAddNew(qn.getAttribute('data-qnew')); return; }
    var a = e.target.closest && e.target.closest('[data-dform]'); if (!a) return;
    e.preventDefault(); closeDrops(); runForm(a.getAttribute('data-dform'));
  });
  NS.crumbs = function (cur) {   /* called by the App when it draws a screen: the Dashboard gets the shortcut panel */
    var on = cur === 'home' && root.classList.contains('has-hub');
    root.classList.toggle('sc-on', on);
    return on ? scPanel() + '<div class="dash-logo" aria-hidden="true"><span class="brand"><img class="mk mk-l" src="/icons/mark-light-270.webp" alt=""><img class="mk mk-d" src="/icons/mark-dark-270.webp" alt=""><b class="nsb"><span class="nsb-b">Biz</span></b></span></div>' : '';
  };
  /* ---- 4. the Dashboard's shortcut panel (like Busy and Evershine): the usual entries and reports with their keys ---- */
  function scPanel() {
    var L = [['v_newparty', 'q:party', 'people', ''], ['v_newitem', 'q:item', 'box', '']].concat(
      [['sale', 'v_sale'], ['pbill', 'v_pbill'], ['min', 'v_min'], ['mout', 'v_mout'], ['contra', 'v_contra'], ['b2jv', 'v_jv'], ['exp', 'v_exp']].map(function (x) { return [x[1], x[0] === 'b2jv' ? '#b2jv' : 'f:' + x[0], 'doc', x[0] === 'b2jv' ? secKey('b2jv') : formKey(x[0])]; }),
      [['v_tb', '#fin/tb', 'list', ''], ['v_bs', '#fin/bs', 'scale', ''], ['v_pl', '#fin/pl', 'chart', ''], ['v_ledger', '#parties', 'people', secKey('parties')], ['v_dlist', '#dlist', 'people', secKey('dlist')], ['v_clist', '#clist', 'people', secKey('clist')], ['v_dues', '#dues', 'clock', secKey('dues')], ['v_stock', '#stock', 'box', secKey('stock')], ['v_books', '#books', 'book', secKey('books')]]);
    return '<aside class="sc-panel" aria-label="' + esc(NS.t('desk.sc_t')) + '"><h3>' + esc(NS.t('desk.sc_t')) + '</h3>' + L.filter(function (x) {
      var h = x[1]; if (/^q:/.test(h)) return !!NS.quickAddNew; if (/^f:/.test(h)) return !offForm(h.slice(2)); if (/^#/.test(h)) { var s = h.slice(1).split('/')[0]; return s === 'fin' || /^(dlist|clist|ssum|psum|vreg|cbsum|coa)$/.test(s) || ($('#ns-side a[data-sec="' + s + '"]') && !isOff(s)); } return true;
    }).map(function (x) {
      var f = /^f:/.test(x[1]), q = /^q:/.test(x[1]);
      return '<a class="sc-i" href="' + (f || q ? '#' : esc(x[1])) + '"' + (f ? ' data-dform="' + x[1].slice(2) + '"' : '') + (q ? ' data-qnew="' + x[1].slice(2) + '"' : '') + ' data-ic="' + x[2] + '"><span>' + esc(NS.t('desk.' + x[0])) + '</span>' + (x[3] ? '<kbd>' + esc(x[3]) + '</kbd>' : '') + '</a>';
    }).join('') + '</aside>';
  }
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
        var w = t[0], key = w.charAt(0) === '#' ? secKey(w.slice(1)) : w.charAt(0) === '@' ? (DOCKEY[w.slice(1)] ? (DOCKEY[w.slice(1)][1] ? 'Alt+' + DOCKEY[w.slice(1)][1] : 'Alt+G ' + DOCKEY[w.slice(1)][0]) : '') : formKey(w);
        if (w.charAt(0) === '@' ? isOff(w.slice(1)) : w.charAt(0) === '#' ? isOff(w.slice(1)) : offForm(w)) return '';
        return '<button type="button" class="mb-t" data-mbt="' + esc(w) + '" title="' + esc(NS.t('desk.' + t[1]) + (key ? '  ·  ' + key : '')) + '"><span data-i18n="desk.' + t[1] + '">' + esc(NS.t('desk.' + t[1])) + '</span>' + (key ? '<kbd>' + esc(key.replace('Alt+G ', '')) + '</kbd>' : '') + '</button>';
      }).join('') + '</div>';
    main.insertBefore(mbar, $('#app', main) || main.firstChild); root.classList.add('mb-on');
    var setH = function () { root.style.setProperty('--mb-h', (mbar.offsetHeight || 0) + 'px'); }; setH(); window.addEventListener('resize', setH);
    mbar.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mbt]');
      if (t) { var w = t.getAttribute('data-mbt'); closeDrops(); if (w.charAt(0) === '#') goSec(w.slice(1)); else if (w.charAt(0) === '@') newDoc(w.slice(1)); else runForm(w); return; }
      var b = e.target.closest('[data-mb]'); if (!b) return;
      var was = b.getAttribute('aria-expanded') === 'true'; closeDrops(); if (was) return;
      var k = b.getAttribute('data-mb'), src = k === 'docs' ? $('.side-g[data-g="docs"] .sg-b', side) : $('.sg[data-sg="' + k + '"] .sg-b', side);
      var d = NS.el('div', { 'class': 'mb-drop', role: 'menu' });
      if (src) $$(':scope > a:not([hidden])', src).forEach(function (a) { var c = a.cloneNode(true); c.removeAttribute('id'); c.removeAttribute('aria-current'); c.setAttribute('role', 'menuitem'); c.classList.remove('on'); var kh = a.getAttribute('data-kh'); if (kh) c.insertAdjacentHTML('beforeend', '<kbd>' + esc(kh) + '</kbd>'); d.appendChild(c); });
      if (!d.children.length) return;
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
  function abcSort(box) { var L = (NS.lang && NS.lang()) || 'en'; $$(':scope > a', box).sort(function (x, y) { return (x.textContent || '').trim().localeCompare((y.textContent || '').trim(), L, { sensitivity: 'base' }); }).forEach(function (x) { box.appendChild(x); }); }
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
      if (id === 'docs') { var sp = $('span', h); if (sp) { sp.setAttribute('data-i18n', 'desk.sg_new'); sp.textContent = NS.t('desk.sg_new'); } }
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
        if (h && fold['u-' + k]) { g.classList.add('shut'); h.setAttribute('aria-expanded', 'false'); }
      }
      return (made[k] = $('.sg-b', g));
    }
    function sort() {
      SG.forEach(function (g) {
        var b = box(g[0]);
        g[1].forEach(function (x) {
          if (typeof x === 'string') { var a = $(':scope > a[data-sec="' + x + '"]', hub) || $('.sg-b > a[data-sec="' + x + '"]', hub); if (a) b.appendChild(a); return; }
          var id = JSON.stringify(x); if (!done[id]) { var v = vItem(x); done[id] = v || 1; } if (done[id] && done[id] !== 1) b.appendChild(done[id]);
        });
      });
      $$(':scope > a[data-sec]', hub).forEach(function (a) { box('more').appendChild(a); });
      var cur = $('a[aria-current="page"]', hub); if (cur) { var g = cur.closest('.sg'); if (g && g.classList.contains('shut')) { g.classList.remove('shut'); var h = $('.sg-h', g); if (h) h.setAttribute('aria-expanded', 'true'); } }
    }
    sort();
    new MutationObserver(function () { if ($(':scope > a[data-sec]', hub)) sort(); }).observe(hub, { childList: true });
    window.addEventListener('hashchange', function () { setTimeout(sort, 50); });
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


  /* ---------- shortcuts for every tool (owner 2026-11-18: "like normal Windows software") ----------
     Tally-style F keys for new entries, Alt+letter for the main screens, and Alt+G + a 2-letter code ("Go to", as in
     TallyPrime) for EVERY screen and document maker. Fixed letters, so a key never moves when the business type hides tools. */
  var SECKEY = { home: ['DB', 'H'], sales: ['SL', 'L'], money: ['MN', 'M'], acx: ['OI'], stf: ['SF'], itx: ['IT'], bimp: ['BI'], dues: ['DU', 'U'],
    msme: ['MS'], limits: ['LH'], buy: ['PE', 'W'], parties: ['PA', 'Y'], grp: ['GR'], chq: ['CQ'], books: ['CB', 'K'], cash: ['CK'], repeat: ['RB'],
    reports: ['RE'], day: ['MD'], tools: ['AT', 'T'], fin: ['FA', 'A'], capl: ['CL'], b2jv: ['JE', 'J'], b2fa: ['FX'], b2gd: ['GD'], b2make: ['PR'],
    b2job: ['JW'], b2profit: ['PF'], b2sman: ['SM'], b2year: ['YE'], features: ['AF'], packs: ['TP'], trust: ['DM'], warr: ['WS'], cacom: ['CC'],
    fees: ['FE'], stock: ['SK'], fam: ['MA'], cadb: ['CD'], cadoc: ['CA'], cagst: ['CG'], ebook: ['EB'], khata: ['KH'], preg: ['PG'], dlist: ['DR'], clist: ['CR'], ssum: ['SY'], psum: ['PY'], vreg: ['VR'], cbsum: ['CS'], mprint: ['MV'], coa: ['AC'], acl: ['LA'] };
  var DOCKEY = { billing: ['IN', 'N'], quotation: ['QT', 'O'], proforma: ['PI'], 'sales-order': ['SO'], challan: ['DC', 'C'], 'purchase-order': ['PO'],
    'credit-note': ['CN'], 'debit-note': ['DN'], 'cash-memo': ['CM'], receipt: ['RC'], voucher: ['VC'], 'self-invoice': ['SI'], 'rent-receipt': ['RR'],
    'salary-slip': ['SS'], 'petty-cash': ['PC'], pos: ['PS'], pharmacy: ['PH'], restaurant: ['RT'], bilty: ['LR'], 'job-card': ['JC'], hotel: ['HT'],
    rent: ['RN'], 'contractor-bill': ['CT'], 'fee-receipt': ['FR'], clinic: ['CV'], salon: ['SN'], jewellery: ['JL'], garment: ['GM'], mandi: ['MI'],
    petrol: ['PP'], dairy: ['DY'], subscribers: ['SU'], tripsheet: ['TS'] };
  /* new entries: [form, 2-letter code, F key] (the App's own forms) */
  var FORMKEY = [['sale', 'SB', 'F8'], ['min', 'MR', 'F6'], ['mout', 'MP', 'F5'], ['pbill', 'PB', 'F9'], ['exp', 'EX', 'F10'], ['contra', 'CO', 'F4'], ['pret', 'PT', ''], ['ob', 'OB', '']];
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
    out.push({ g: 'rec', t: NS.t('app.qe_title'), k: 'Alt+Q', c: 'QE', run: function () { if (app.quickEntry) app.quickEntry(); } });
    $$('#ns-side a[data-sec]').forEach(function (a) {
      var s = a.getAttribute('data-sec'), m = SECKEY[s] || [];
      out.push({ g: 'go', off: offSec(s), t: (a.textContent || '').trim(), k: fName(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { goSec(s); } });
    });
    /* report screens that sit in the side menu as plain links (Debtors list, Chart of Accounts...): Alt+G codes and Ctrl K find them too (P2-10) */
    $$('#ns-side a[data-hsec]').forEach(function (a) {
      var s = a.getAttribute('data-hsec'), m = SECKEY[s] || [];
      if (out.some(function (x) { return x.sec === s; })) return;
      out.push({ g: 'go', sec: s, off: false, t: (a.textContent || '').trim(), k: fName(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { location.hash = s; } });
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
      out.push({ g: 'go', sec: s, off: false, t: s === 'acl' ? NS.t('desk.v_coa') : lbl, k: fName(s) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0], run: function () { if (a && !OTHER[s]) goSec(s); else location.hash = to; } });
    });
    (app.newDocs ? app.newDocs() : []).forEach(function (n) {
      var m = DOCKEY[n[0]] || [];
      out.push({ g: 'new', off: offSite(n[0]), t: n[1], k: fName(n[0]) || (m[1] ? 'Alt+' + m[1] : ''), c: m[0] || '', run: function () { newDoc(n[0]); } });
    });
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
          k: a.getAttribute('data-ic') === 'd-billing' ? 'Alt+N' : DOCKEY[(a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')] ? (function (m, s) { return fName(s) || (m[1] ? 'Alt+' + m[1] : 'Alt+G ' + m[0]); })(DOCKEY[(a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')], (a.getAttribute('data-ic') || '').replace(/^[dt]-/, '')) : sec && SECKEY[sec] ? (fName(sec) || (SECKEY[sec][1] ? 'Alt+' + SECKEY[sec][1] : 'Alt+G ' + SECKEY[sec][0])) : i >= 0 && i < 9 ? 'Alt+' + (i + 1) : '', run: function () { a.click(); } });
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
  /* the App: every other business is one search away ("Business: <name>") */
  function bizActs() {
    var app = A();
    if (!app || !app.setBiz || !app.biz || !app.biz()) return [];
    return app.data().biz.filter(function (b) { return b.id !== app.biz().id; }).map(function (b) { return { g: 'act', t: NS.t('app.biz') + ': ' + b.name, k: 'Alt+S', run: function () { app.setBiz(b.id); } }; });
  }
  function actions() {
    return [
      { g: 'act', t: T('a_theme'), run: function () { click('[data-theme-btn]'); } },
      { g: 'act', t: NS.t('mydata'), run: function () { click('[data-act="my-data"]'); } },
      { g: 'act', t: NS.t('md.save'), run: function () { var b = NS.el('button', { 'data-act': 'backup', hidden: '' }); document.body.appendChild(b); b.click(); b.remove(); } },
      { g: 'act', t: T('mini'), k: 'Ctrl+B', run: toggleMenu },
      { g: 'act', t: T('keys'), k: '?', run: keysSheet },
    ].concat(bizActs()).concat([
      { g: 'act', t: T('lang'), run: function () { var s = $('[data-lang-pick]'); if (s && !s.offsetParent && A() && root.classList.contains('installed')) { location.hash = '#features'; return; } if (s) { s.focus(); if (s.showPicker) try { s.showPicker(); } catch (e) {} } } }
    ]).concat(deferredInstall ? [{ g: 'act', t: T('install'), run: install }] : []);
  }
  var back = null, picked = false, goMode = false;
  function palette(from, mode) {
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
  var GROUPS = ['go', 'rec', 'new', 'party', 'doc', 'help', 'act'];
  function draw(qs) {
    var words = qs.toLowerCase().split(/\s+/).filter(Boolean);
    var one = goMode && /^[a-z]$/i.test(qs.trim()) ? qs.trim().toUpperCase() : '';
    var hit = one ? items.filter(function (x) { return x.code && x.code.charAt(0) === one; }) :
      items.filter(function (x) { var h = (x.t + ' ' + (x.s || '') + ' ' + (x.e || '')).toLowerCase(); return words.every(function (w) { return h.indexOf(w) >= 0; }); });
    if (!words.length && !goMode) hit = hit.filter(function (x) { return !x.off && x.g !== 'doc' && x.g !== 'party' && x.g !== 'new' && x.g !== 'help'; });
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
      var SMALL = '#desk-ask,#desk-cmd,#desk-keys,#ns-help,.nsf-dlg,.pk-dlg,.bz-dlg,#ns-mydata,.cap-dlg,#ns-tell,#ns-series,.sf-gate,.help-pnl,.qe-cus';
      var open0 = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        try { if (this.classList.contains('vs')) vsDress(this); else if (!this.matches(SMALL) && $('.dlg-hd,.dlg-h', this) && $('input:not([type=hidden]),select,textarea,table,button[type=submit]', this)) voucherScreen(this);   /* any titled box with fields or a list (a tool's rooms, diary, stock...) */ } catch (e) {}
        this._at = Date.now();
        /* an entry screen opens WITHOUT locking the page (multitasking): the title bar (bell, search, Help), the side menu and the
           status bar stay usable; a newer screen sits above an older one. Small boxes and questions still lock the page. */
        if (this.classList.contains('vs')) { VSZ += 1; this.style.zIndex = String(VSZ); return HTMLDialogElement.prototype.show.apply(this, arguments); }
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
      var i = all.indexOf(t); if (i >= 0 && i < all.length - 1) { e.preventDefault(); all[i + 1].focus(); }
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
    var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { t.blur(); return; }
    var h = location.hash.replace(/^#/, ''); if (!h || h === 'home') return;
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
    ['/', 'k_find'], ['F1', 'k_hlp'], ['?', 'k_help'], ['Ctrl S', 'k_save'], ['F2', 'k_qadd'], ['Ctrl P', 'k_print'], ['Esc', 'k_esc']];
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
    if (vs) {   /* on a voucher screen: F keys switch to another entry, Alt+G and the Alt letters leave it (asking first) */
      var fk2 = /^F([3-9]|10)$/.test(e.key) && !e.altKey && !e.shiftKey && !e.metaKey ? FKEY[(e.ctrlKey ? 'Ctrl+' : '') + e.key] : null;
      var al = e.altKey && !e.ctrlKey && !e.metaKey ? (e.code || '').replace('Key', '').toLowerCase() : '';
      if (fk2) { e.preventDefault(); if (!e.repeat) NS.vsLeave(function () { fRun(fk2); }); return; }
      if (al === 'g' || ALTKEY[al] && !/^[nrpbxsq]$/.test(al)) { e.preventDefault(); if (!e.repeat) NS.vsPark(function () { if (al === 'g') palette(null, 'go'); else { var to = ALTKEY[al]; if (isOff(to.sec || to.site)) NS.toast(NS.t('desk.offkey')); else if (to.sec) goSec(to.sec); else newDoc(to.site); } }); return; }
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
      if (app && app.biz && ALTKEY[c] && !/^[nrpbxsq]$/.test(c)) { e.preventDefault(); if (e.repeat) return; var to = ALTKEY[c]; (app.whenReady || function (f) { f(); })(function () { if (isOff(to.sec || to.site)) NS.toast(NS.t('desk.offkey')); else if (to.sec) goSec(to.sec); else newDoc(to.site); }); return; }
      if (c === 'n') { e.preventDefault(); if (app && app.newDoc) app.newDoc('billing'); else goUrl(siteUrl('billing')); return; }
      if (c === 'q' && app && app.quickEntry) { e.preventDefault(); if (!e.repeat) app.quickEntry(); return; }   /* quick entry (app.js) */
      /* a key pressed while the App is still fetching its data is kept and runs the moment the data is in (it used to be dropped) */
      var job = { r: 'min', p: 'mout', b: 'pbill', x: 'exp' }[c];
      if (app && app.openForm && job) { e.preventDefault(); if (e.repeat) return; (app.whenReady || function (f) { f(); })(function () { if (app.biz() && !$('dialog[open]')) app.openForm(job); }); }
      else if (app && app.switchBiz && c === 's') { e.preventDefault(); if (!e.repeat) (app.whenReady || function (f) { f(); })(app.switchBiz); }
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
    var at = document.getElementById('main') || document.body; at.insertBefore(bar, at.firstChild);
    document.addEventListener('ns-lang', function () {
      var l2 = NS.lang(); NS.$('span', bar).textContent = NS.t('wn.note') + ' ' + ((W.t && (W.t[l2] || W.t.en)) || '');
      a.textContent = NS.t('wn.see'); ok.textContent = NS.t('wn.ok');
    });
  }
  if (document.readyState === 'complete') setTimeout(note, 2500); else window.addEventListener('load', function () { setTimeout(note, 2500); });
})();
