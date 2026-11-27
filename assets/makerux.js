/* makers-better (owner 27 Nov 2026: "all of them are good, work on all of them"): the small things that make a single-document
   maker smooth for someone who just came from Google. Loaded on every maker site (docs.js, slip.js, kit.js) after its engine;
   it works on the form those engines draw (business = #s-name / #k-seller-name, party = #b-name / #k-buyer-name) and on the hooks
   they give NS.docNav (NS.mkNav: check, copy, example, mine, open). Nothing here changes a figure on a document.
   1. NS.mkFresh: nothing saved yet on this device (no business, party, item or document) -> name boxes are plain boxes (core.js)
   2. a new device: the business part shows only name, state and GSTIN; the rest folds under "More business details"
   3. Enter moves to the next box; on a computer the cursor starts in the first empty box
   4. "Fill an example" (made-up details, marked, one tap to remove) and "Same as last" + recent names as one-tap chips
   5. a slim "Ready to print" / "N things to fix" line once something is typed (the maker's own checks)
   6. after the 3rd saved document a quiet line that they are all in NSBiz (hidden for good with one tap)
   7. a browser in another language on the English page: one line to the page in that language
   Words: NS.t('mk.*'). */
(function () {
  'use strict';
  var de = document.documentElement;
  if (!window.NS || !de.hasAttribute('data-maker') || de.classList.contains('embed')) return;
  var root = document.getElementById('tool');
  if (!root || !window.NSStore) return;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function t(k, v) { return NS.t(k, v); }
  function esc(s) { return NS.esc(s); }
  function vis(e) { return !!(e && e.offsetParent !== null && !e.closest('details:not([open])')); }
  function bizBox() { return $('#s-name', root) || $('#k-seller-name', root); }
  function partyBox() { return $('#b-name', root) || $('#k-buyer-name', root); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function fire(inp) { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }

  /* ---------- 4a. the example (called by the engines through NS.mkNav.example) ---------- */
  function gstin(st, pan) {   /* a made-up GSTIN with the right check letter, so the example passes the checks */
    var C = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', b = st + pan + '1Z', s = 0;
    for (var i = 0; i < 14; i++) { var v = C.indexOf(b[i]) * (i % 2 ? 2 : 1); s += Math.floor(v / 36) + v % 36; }
    return b + C[(36 - s % 36) % 36];
  }
  /* trade samples (owner 27 Nov: "both" a plain example and trade samples). Made-up names; GST rates as they stand after
     22 Sep 2025 (sugar, tea, biscuits, medicines 5%; hardware, works contract and professional services 18%); no 12% or 28% lines,
     so the example never sets off a rate question */
  var TRADES = {
    hardware: { me: 'Sharma Hardware', you: 'Ravi Traders', pan: 'ABCPS1234F', items: [['Steel nails 1 kg', '7317', 5, 'Kg', 120, 18], ['PVC pipe 1 inch', '3917', 10, 'Nos', 240, 18]] },
    kirana: { me: 'Gupta Kirana Store', you: 'Meena Devi', pan: 'ABCPG1234K', items: [['Sugar 1 kg', '1701', 5, 'Kg', 44, 5], ['Tea 250 g', '0902', 2, 'Nos', 140, 5], ['Biscuits family pack', '1905', 3, 'Nos', 60, 5]] },
    medical: { me: 'Jain Medical Store', you: 'Suresh Kumar', pan: 'ABCPJ1234M', items: [['Paracetamol 500 mg (10 tablets)', '3004', 2, 'Strip', 25, 5], ['Cough syrup 100 ml', '3004', 1, 'Bottle', 95, 5]] },
    contract: { me: 'Singh Builders', you: 'Mehta Housing Society', pan: 'ABCPS5678B', items: [['Plaster work, 2nd floor', '995411', 450, 'Sq ft', 28, 18], ['Waterproofing of roof', '995411', 1, 'Job', 15000, 18]] },
    service: { me: 'Kapoor and Associates', you: 'Bright Exports', pan: 'ABCPK1234C', items: [['Accounts writing for October', '998222', 1, 'Month', 6000, 18], ['GST return filing', '998222', 1, 'Nos', 1500, 18]] }
  };
  NS.mkTrades = TRADES;
  NS.mkExample = function (d, type) {
    var ex = ' (' + t('mk.exmark') + ')', tr = TRADES[NS.mkTrade] || TRADES.hardware;
    var me = { name: tr.me + ex, addr: '12 Main Bazaar', city: 'Ludhiana', pin: '141008', state: '03', gstin: gstin('03', tr.pan), phone: '9800000001' };
    var you = { name: tr.you + ex, addr: '45 Ring Road', city: 'Ludhiana', pin: '141001', state: '03', gstin: '', phone: '9800000002' };
    d.seller = d.seller || {};
    if (!String(d.seller.name || '').trim()) Object.keys(me).forEach(function (k) { if (k in d.seller || k === 'name') d.seller[k] = me[k]; });
    if (d.buyer) Object.keys(you).forEach(function (k) { if (k in d.buyer || k === 'name') d.buyer[k] = you[k]; });
    if (type === 'salary' && d.buyer) d.buyer.name = 'Raju Kumar' + ex;
    if (type === 'rent' && d.buyer) d.buyer.name = 'Anil Mehta' + ex;
    if (Array.isArray(d.items) && d.items[0]) {
      var tpl = d.items[0], rows = tr.items;
      d.items = rows.map(function (r) {
        var it = JSON.parse(JSON.stringify(tpl));
        if ('desc' in it) it.desc = r[0]; else if ('name' in it) it.name = r[0]; else if ('item' in it) it.item = r[0];
        if ('hsn' in it) it.hsn = r[1];
        if ('qty' in it) it.qty = r[2];
        if ('unit' in it) it.unit = r[3];
        if ('rate' in it) it.rate = r[4]; else if ('mrp' in it) it.mrp = r[4];
        if ('price' in it) it.price = r[4];   /* restaurant menu lines */
        if ('gst' in it) it.gst = r[5];
        return it;
      });
    }
    var today = d.date || new Date().toISOString().slice(0, 10);
    if (type === 'self') d.recv = today;   /* self invoice: date the goods or services were received */
    if (type === 'note') d.orig = { no: 'INV/26-27/001', date: today };   /* the invoice the note is against */
    if ('table' in d && !d.table) d.table = '5';   /* restaurant */
    if (d.cnee && Array.isArray(d.pkgs)) {   /* bilty: consignee, route and one package line */
      d.cnee.name = 'Mehta Steel (' + t('mk.exmark') + ')'; d.cnee.addr = 'GT Road, Jalandhar';
      d.from = d.from || 'Ludhiana'; d.to = 'Jalandhar';
      d.pkgs = [Object.assign(d.pkgs[0] || {}, { n: '40', pack: 'Bags', desc: 'Cement', wt: '2000' })];
      if ('frate' in d && !d.frate) d.frate = '3500';
    }
    /* the trade makers: each one's own boxes (found by the fields its blank document has) */
    var mark = ' (' + t('mk.exmark') + ')';
    if (Array.isArray(d.lines) && 'paid' in d && 'mFrom' in d) {   /* fee receipt */
      d.buyer.name = 'Aarav Sharma' + mark; d.cls = '8'; d.sec = 'B'; d.guardian = 'Rakesh Sharma';
      d.lines = [{ desc: 'Tuition fee', amt: '2500' }, { desc: 'Computer fee', amt: '300' }]; d.paid = '2800';
    }
    if ('reg' in d && 'odo' in d) {   /* garage job card */
      d.reg = 'PB10AB1234'; d.make = 'Maruti Suzuki'; d.model = 'Swift'; d.odo = '42000'; d.complaint = 'General service, brake noise';
    } else if ('make' in d && 'serial' in d && 'complaint' in d) {   /* repair job card */
      d.make = 'Samsung'; d.model = 'Galaxy A15'; d.complaint = 'Screen broken, needs a new display'; d.est = '3500';
    }
    if (Array.isArray(d.boqs)) {   /* contractor running bill */
      d.work = 'Boundary wall at plot 12'; d.site = 'Focal Point, Ludhiana';
      d.boqs = [{ item: '1', desc: 'Brick work in cement mortar 1:6', unit: 'Cum', rate: '5200', boq: '40', prev: '', qty: '12' },
        { item: '2', desc: 'Cement plaster 12 mm', unit: 'Sqm', rate: '260', boq: '300', prev: '', qty: '90' }];
    }
    if (Array.isArray(d.items) && d.rates && !d.items.length) {   /* jewellery: one 22 carat chain with a made-up HUID */
      d.items = [{ desc: 'Gold chain 22K', metal: 'g', purity: '916', huid: 'AB12CD', gross: '10.5', stoneWt: '', wast: '', mrate: '7000', mkt: 'pg', mk: '450', stoneVal: '', ld: '', pcs: 1, gst: 3, hsn: '7113' }];
    }
    if (Array.isArray(d.rooms)) {   /* hotel */
      d.buyer.name = 'Neha Verma' + mark; d.rooms = [{ rno: '101', rtype: 'Deluxe', rate: '2200', gst: '' }];
    }
    if (Array.isArray(d.lots)) {   /* mandi */
      d.buyer.name = 'Gurpreet Singh' + mark; d.lots = [{ crop: 'Wheat', n: '50', gross: '2500', tare: '25', tpb: '', cut: '', rate: '2450', per: 'qtl' }];
    }
    if (Array.isArray(d.noz)) {   /* petrol pump shift */
      d.shift = 'Morning'; d.staff = 'Ramesh';
      d.noz = [{ noz: '1', fuel: 'Petrol', open: '125000', close: '126200', test: '5', price: '96.50' }, { noz: '2', fuel: 'Diesel', open: '98000', close: '99500', test: '5', price: '89.60' }];
    }
    if (type === 'receipt') { d.amount = '5000'; d.purpose = 'Part payment for bill INV/26-27/001'; }
    if (type === 'voucher' && d.lines) d.lines = [{ desc: 'Shop rent for this month', head: 'Rent', amt: '8000' }];
    if (type === 'rent') { d.rent = '15000'; d.prop = '22 Model Town, Ludhiana'; if ('acct' in d) d.acct = false; }   /* the example landlord is no saved business: kept out of the accounts */
    if (type === 'salary' && d.earn) { d.earn.forEach(function (l, i) { l.amt = i === 0 ? '15000' : i === 1 ? '6000' : ''; }); d.days = '30'; d.paid = '30'; }
    if (type === 'petty' && d.lines) { d.opening = '2000'; d.lines = [{ date: d.lines[0].date, vno: '1', desc: 'Tea and snacks', head: 'Staff welfare', recd: '', paid: '150' }]; }
    return d;   /* never marked sample:1: the App's "Remove sample data" would later delete a document the visitor made their own */
  };

  /* ---------- 1. has anything been saved on this device? ---------- */
  var COUNTS = { doc: 0, party: 0, item: 0, biz: 0 };
  function count() {
    var kinds = ['doc', 'party', 'item', 'biz'];
    return Promise.all(kinds.map(function (k) { return NSStore.list(k).then(function (a) { return (a || []).length; }, function () { return 0; }); })).then(function (n) {
      kinds.forEach(function (k, i) { COUNTS[k] = n[i]; });
      NS.mkFresh = !(n[0] + n[1] + n[2] + n[3]);
      return COUNTS;
    });
  }

  /* ---------- 2. short business part on a new device ---------- */
  var KEEP = { 's-name': 1, 's-state': 1, 's-gstin': 1, 'k-seller-name': 1, 'k-seller-state': 1, 'k-seller-gstin': 1 };
  function fieldOf(inp) { var f = inp.closest('.f, .fld, label'); return f && f.parentElement && f !== inp ? f : null; }
  function foldBiz() {
    if (COUNTS.biz || !NS.mkFresh) return;
    var b = bizBox(); if (!b || $('.mk-more:not(.mk-more2)', root)) return;
    var box = b.closest('fieldset, .card'); if (!box) return;
    var outs = $$('input, select, textarea', box).filter(function (x) { return x.id && /^(s|k-seller)-/.test(x.id) && !KEEP[x.id] && x.type !== 'hidden'; });
    var parts = [];
    outs.forEach(function (x) { var f = fieldOf(x); if (f && parts.indexOf(f) < 0 && !f.contains(b)) parts.push(f); });
    $$('details', box).forEach(function (dd) { if (parts.indexOf(dd) < 0 && !dd.contains(b) && !dd.closest('.mk-more')) parts.push(dd); });   /* logo, signature and bank details */
    parts = parts.filter(function (p) { return !parts.some(function (q) { return q !== p && q.contains(p); }); });
    if (parts.length < 2) return;
    var det = document.createElement('details'); det.className = 'mk-more';
    det.innerHTML = '<summary>' + esc(t('mk.morebiz')) + '</summary><div class="mk-more-in"></div>';
    var host = parts[0].parentNode; host.appendChild(det);   /* after name, state and GSTIN */
    var inner = det.lastChild;
    parts.forEach(function (p) { inner.appendChild(p); });
    det.addEventListener('toggle', function () { if (det.open) store('ns-mk-bizopen', '1'); });
    if (store('ns-mk-bizopen') === '1' || outs.some(function (x) { return x.value && x.tagName !== 'SELECT' && !x.readOnly; })) det.open = true;
  }
  /* the rarely needed boxes of the document part (due date, order number, reverse charge) fold too while nothing is saved */
  var DOCFOLD = ['d-due', 'd-ref', 'd-rc'];
  function foldDoc() {
    if (!NS.mkFresh || $('.mk-more2', root)) return;
    var parts = [];
    DOCFOLD.forEach(function (id) { var x = document.getElementById(id); if (!x || !root.contains(x) || x.value && x.type !== 'checkbox' || x.checked) return; var f = x.type === 'checkbox' ? x.closest('.f') : fieldOf(x); if (f && parts.indexOf(f) < 0) parts.push(f); });
    if (parts.length < 2) return;
    var host = parts[0].parentNode; if (parts.some(function (p) { return p.parentNode !== host; })) return;
    var det = document.createElement('details'); det.className = 'mk-more mk-more2';
    det.innerHTML = '<summary>' + esc(t('mk.moredoc')) + '</summary><div class="mk-more-in"></div>';
    host.appendChild(det);
    parts.forEach(function (p) { det.lastChild.appendChild(p); });
  }

  /* ---------- 3. Enter moves on; the cursor starts in the first empty box on a computer ---------- */
  root.addEventListener('keydown', function (e) {
    var x = e.target;
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!x || !/^(INPUT|SELECT)$/.test(x.tagName) || /^(checkbox|radio|file|submit|button|search|date)$/.test(x.type) || x.hasAttribute('data-pkro') || x.closest('#items, .items, .pk-box, .dn-nav, dialog')) return;
    var all = $$('input, select, textarea', root).filter(function (y) { return vis(y) && !y.disabled && y.type !== 'hidden' && y.type !== 'checkbox' && y.type !== 'radio' && !y.closest('.dn-nav, .tabs'); });
    var i = all.indexOf(x); if (i < 0 || !all[i + 1]) return;
    e.preventDefault(); all[i + 1].focus();
  });
  function focusFirst() {
    if (!matchMedia('(pointer:fine) and (min-width:900px)').matches || location.hash || window.scrollY > 40) return;
    var a = document.activeElement; if (a && a !== document.body) return;
    var b = bizBox(), p = partyBox(), f = b && !b.value.trim() ? b : p && !p.value.trim() ? p : null;
    if (f && vis(f)) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
  }

  /* ---------- 4b. one-tap bar: Fill an example, Same as last, recent names ---------- */
  var undoEx = null;
  NS.mkTrade = store('ns-mk-trade') || 'hardware';
  function bar() {
    var b = $('#mk-bar', root);
    if (!b) {
      b = document.createElement('div'); b.id = 'mk-bar'; b.className = 'mk-bar';
      var nav = $('#dn-nav', root), top = $('.tool-top', root), at = nav || top;
      if (at && at.parentNode) at.parentNode.insertBefore(b, at.nextSibling); else root.insertBefore(b, root.firstChild);
      b.addEventListener('click', onBar);
      b.addEventListener('change', function (e) { if (e.target.matches('[data-mk-trade]')) { NS.mkTrade = e.target.value; store('ns-mk-trade', NS.mkTrade); } });
    }
    return b;
  }
  function mineDocs() {
    var o = NS.mkNav; if (!o || !o.mine) return Promise.resolve([]);
    return NSStore.list('doc').then(function (a) { return (a || []).filter(function (d) { return d && d.id && !d.sample && o.mine(d); }).sort(function (x, y) { return (y.created || y.upd || 0) - (x.created || x.upd || 0); }); }, function () { return []; });
  }
  function drawBar() {
    var o = NS.mkNav, b = bar();
    if (!o) { b.hidden = true; return; }
    mineDocs().then(function (L) {
      var h = '';
      if (undoEx) h += '<span class="mk-note">' + esc(t('mk.exon')) + '</span><button type="button" class="btn sm" data-mk="unex">' + esc(t('mk.exoff')) + '</button>';
      else if (!L.length && o.example) h += '<button type="button" class="btn sm" data-mk="ex">' + esc(t('mk.example')) + '</button>' +
        '<label class="mk-trade"><span>' + esc(t('mk.trade')) + '</span> <select data-mk-trade>' + Object.keys(TRADES).map(function (k) { return '<option value="' + k + '"' + (k === (NS.mkTrade || 'hardware') ? ' selected' : '') + '>' + esc(t('mk.t_' + k)) + '</option>'; }).join('') + '</select></label>' +
        '<span class="mk-note">' + esc(t('mk.exwhy')) + '</span>';
      if (!undoEx && L.length && o.copy) h += '<button type="button" class="btn sm" data-mk="last">' + esc(t('mk.last')) + '</button>';
      var p = partyBox(), seen = {}, names = [];
      L.forEach(function (d) { var n = d.buyer && String(d.buyer.name || '').trim(); if (n && n.indexOf('(' + t('mk.exmark') + ')') < 0 && !seen[n.toLowerCase()] && names.length < 5) { seen[n.toLowerCase()] = 1; names.push(n); } });
      if (!undoEx && p && names.length && !p.value.trim()) h += '<span class="mk-chips" role="group" aria-label="' + esc(t('mk.recent')) + '"><span class="mk-note">' + esc(t('mk.recent')) + ':</span>' +
        names.map(function (n) { return '<button type="button" class="mk-chip" data-mk="name" data-v="' + esc(n) + '">' + esc(n.length > 28 ? n.slice(0, 27) + '…' : n) + '</button>'; }).join('') + '</span>';
      b.innerHTML = h; b.hidden = !h;
    });
  }
  function onBar(e) {
    var x = e.target.closest('[data-mk]'); if (!x) return;
    var k = x.getAttribute('data-mk'), o = NS.mkNav || {};
    if (k === 'ex' && o.example) { undoEx = o.example(); drawBar(); setTimeout(ready, 50); }
    else if (k === 'unex' && undoEx) { var u = undoEx; undoEx = null; u(); drawBar(); setTimeout(ready, 50); }
    else if (k === 'last') mineDocs().then(function (L) { if (L[0]) { o.copy(L[0]); NS.toast(t('mk.copied', { no: L[0].no || '' })); } });
    else if (k === 'name') { var p = partyBox(); if (!p) return; p.value = x.getAttribute('data-v'); fire(p); x.closest('.mk-chips').remove(); }
  }

  /* ---------- 5. ready to print? ---------- */
  var touched = false, rT = 0;
  function ready() {
    var o = NS.mkNav, line = $('#mk-ready', root);
    if (!line) {
      line = document.createElement('p'); line.id = 'mk-ready'; line.className = 'mk-ready'; line.setAttribute('aria-live', 'polite'); line.hidden = true;
      var top = $('.tool-top', root); (top || root).appendChild(line);
      line.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mkgo]'); if (!b) return;
        var f = document.getElementById(b.getAttribute('data-mkgo')); if (!f) return;
        var dd = f.closest('details'); while (dd) { dd.open = true; dd = dd.parentElement && dd.parentElement.closest('details'); }
        var ed = $('[data-tab-btn="edit"]', root); if (ed && root.getAttribute('data-tab') !== 'edit') ed.click();
        f.scrollIntoView({ block: 'center' }); f.focus();
      });
    }
    if (!o || !o.check || !(touched || undoEx)) { line.hidden = true; return; }
    var p = [];
    try { p = o.check() || []; } catch (e) { line.hidden = true; return; }
    line.hidden = false;
    line.classList.toggle('ok', !p.length);
    line.innerHTML = p.length ? '<span>' + esc(t('mk.fix', { n: p.length })) + '</span> <button type="button" class="mk-go" data-mkgo="' + esc(p[0][0]) + '">' + esc(p[0][1]) + ' ›</button>'
      : '<span>✓ ' + esc(t('mk.ready')) + '</span>';
  }
  root.addEventListener('input', function () { touched = true; clearTimeout(rT); rT = setTimeout(ready, 500); });
  root.addEventListener('change', function () { touched = true; clearTimeout(rT); rT = setTimeout(ready, 500); });

  /* ---------- 6. after a few saved documents: they are all in NSBiz ---------- */
  function nsbizLine() {
    if (store('ns-mk-nsbiz') === 'off' || COUNTS.doc < 3 || $('#mk-nsbiz')) return;
    var p = document.createElement('p'); p.id = 'mk-nsbiz'; p.className = 'mk-nsbiz';
    p.innerHTML = '<span>' + esc(t('mk.nsbiz', { n: COUNTS.doc })) + '</span> <a href="https://app.niveshsahayak.in/">' + esc(t('mk.open')) + '</a> <button type="button" class="mk-x" aria-label="' + esc(t('mk.hide')) + '" title="' + esc(t('mk.hide')) + '">×</button>';
    p.querySelector('.mk-x').addEventListener('click', function () { store('ns-mk-nsbiz', 'off'); p.remove(); });
    root.parentNode.insertBefore(p, root.nextSibling);
  }

  /* ---------- 7. the browser speaks another language than this page ---------- */
  function readIn() {
    var A = window.NS_ALT || {}, pl = de.getAttribute('data-page-lang') || 'en';
    if (pl !== 'en' || store('ns-mk-readin') === 'off') return;
    var want = (navigator.languages || [navigator.language || '']).map(function (l) { return String(l).toLowerCase().split('-')[0]; }).filter(function (l) { return l && l !== 'en'; })[0];
    if (!want || !A[want] || $('#mk-readin')) return;
    var info = (NS.LANGS || []).filter(function (l) { return l[0] === want; })[0], name = info ? info[1] : want;
    var p = document.createElement('p'); p.id = 'mk-readin'; p.className = 'mk-readin'; p.lang = want;
    p.innerHTML = '<a href="' + esc(A[want]) + '">' + esc(t('mk.readin', { l: name })) + '</a> <button type="button" class="mk-x" aria-label="' + esc(t('mk.hide')) + '">×</button>';
    p.querySelector('.mk-x').addEventListener('click', function () { store('ns-mk-readin', 'off'); p.remove(); });
    var h1 = $('h1'); if (h1 && h1.parentNode) h1.parentNode.insertBefore(p, h1); else root.parentNode.insertBefore(p, root);
  }

  /* ---------- start: after the engine has drawn the form (and again when it draws it anew) ---------- */
  var started = false;
  function go() {
    if (started) return; started = true;
    count().then(function () {
      foldBiz(); foldDoc(); drawBar(); focusFirst(); setTimeout(focusFirst, 700); nsbizLine(); readIn();
      if (window.MutationObserver) new MutationObserver(function () { if (NS.mkFresh) { if (!$('.mk-more:not(.mk-more2)', root)) foldBiz(); foldDoc(); } }).observe(root, { childList: true, subtree: true });
    });
  }
  document.addEventListener('ns-mknav', function (e) {
    if (e.detail && e.detail.n && NS.mkFresh) NS.mkFresh = false;
    if (undoEx) { var pb = partyBox(), bb = bizBox(), mark = '(' + t('mk.exmark') + ')';   /* a new or other document on screen: the example is gone */
      var bx = pb || bb; if (!bx || bx.value.indexOf(mark) < 0) undoEx = null; }
    if (started) { drawBar(); count().then(nsbizLine); } else go();
  });
  document.addEventListener('ns-lang', function () { if (started) { drawBar(); ready(); var s = $('.mk-more:not(.mk-more2) > summary', root); if (s) s.textContent = t('mk.morebiz'); var s2 = $('.mk-more2 > summary', root); if (s2) s2.textContent = t('mk.moredoc'); } });
  setTimeout(function () { if (bizBox()) go(); }, 2500);
})();
