/* Batch 2 on every document maker (docs.js through NS.docExt; slip.js only uses NS.closedMsg):
     salesman      d.sman on sales documents (suggestions from Settings > Salesmen and earlier bills; never filled by itself)
     godown        d.gd on documents that move stock, when Settings has godowns
     custom fields d.cf = { <field id>: value } for the fields Settings defines for this document type; printed only when
                   the field is marked "print" (label as typed, value as typed)
     batch lines   it.batch, it.exp (YYYY-MM), it.serial on items marked "batch and expiry" / "serial or IMEI" in My data
     closed year   saving (and deleting) is refused for a date inside a financial year closed in the App's Year end
     ERP round 1   on lines going out, the Batch box lists the batches in hand (earliest expiry first, expired ones marked) and
                   takes the earliest one by itself; a line asking for more than its batch holds offers to split into the next
                   batch; the Serial box lists the serials in hand (stockguard.js NS.batchPick / NS.serialsIn); a transfer
                   challan names the godown the goods go to (d.toGd), so the stock register moves them there
   Settings come from the data home (meta 'settings': salesmen, godowns, cfields, closed). Printed words stay English. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, t = NS.t;
  var SALES = { invoice: 1, cashmemo: 1, quote: 1, proforma: 1, so: 1, challan: 1, note: 1 };
  var STOCK = { invoice: 1, cashmemo: 1, self: 1, note: 1, challan: 1 };
  var CFG = {}, ITEMS = [], SMEN = [], api = null, box = null;
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function fyOf(iso) { var y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7); if (m < 4) y--; return y + '-' + String(y + 1).slice(2); }
  NS.closedMsg = function (bizName, iso) {   /* by name, by business id ('#<id>') and by a name the business had before (ERP Round 1, C-1) */
    var k = key(bizName), b = (NS.bizCache || []).filter(function (x) { return x && (key(x.name) === k || (x.oldNames || []).some(function (n) { return key(n) === k; })); })[0], keys = [k];
    if (b) { keys.push('#' + b.id, key(b.name)); (b.oldNames || []).forEach(function (n) { keys.push(key(n)); }); }
    var f = iso && fyOf(iso), hit = f && keys.some(function (x) { var l = CFG.closed && CFG.closed[x]; return !!(l && l.indexOf(f) >= 0); });
    return hit ? t('b2.closedmsg', { fy: f }) : '';
  };
  function load() {
    return Promise.all([NSStore.meta('settings'), NSStore.list('item'), NSStore.list('doc')]).then(function (r) {
      CFG = r[0] || {}; ITEMS = r[1] || [];
      var o = {}, lists = [CFG.salesmen || []].concat(Object.keys(CFG.byBiz || {}).map(function (k) { return CFG.byBiz[k].salesmen || []; }));   /* salesmen of every business (suggestions only) */
      lists.forEach(function (l) { l.forEach(function (s) { if (s && s.name) o[key(s.name)] = s.name; }); });
      (r[2] || []).forEach(function (d) { if (d.sman) o[key(d.sman)] = o[key(d.sman)] || d.sman; });
      SMEN = Object.keys(o).map(function (k) { return o[k]; }).sort();
      if (box && api) { draw(); if (api.type) api.changed(); }
    }, function () {});
  }
  if (window.NSStore) (NSStore.ready ? NSStore.ready() : Promise.resolve()).then(load);
  window.addEventListener('focus', function () { if (window.NSStore) load(); });

  function type() { return api ? api.type() : ''; }
  function fields() { if (window.NSCF) return [];   /* cfields.js draws and prints them (ERP Round 2) */ var ty = type(); return (CFG.cfields || []).filter(function (f) { return f && f.label && (!f.types || !f.types.length || f.types.indexOf(ty) >= 0); }); }
  function godowns() { var c = NS.cfgFor ? NS.cfgFor(CFG, api && api.doc() && api.doc().seller) : CFG; return (c.godowns || []).filter(Boolean); }   /* godowns are kept per business (settings.byBiz) */
  function inner() {
    var ty = type(), d = api.doc(), h = '';
    if (SALES[ty]) h += '<div class="f"><label for="dm-sman">' + esc(t('b2.smanf')) + '</label><input id="dm-sman" list="dm-smen" dir="auto" autocomplete="off" value="' + esc(d.sman || '') + '">' +
      '<datalist id="dm-smen">' + SMEN.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>';
    if (STOCK[ty] && godowns().length && NS.bizModeOf(d.seller, CFG).godown) h +=   /* ERP C-9: the godown switch */ '<div class="f"><label for="dm-gd">' + esc(t('b2.gd1')) + '</label><select id="dm-gd"><option value="">' + esc(t('b2.main')) + '</option>' +
      godowns().map(function (g) { return '<option' + (g === d.gd ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>';
    if (ty === 'challan' && godowns().length) h += '<div class="f"><label for="dm-togd">' + esc(t('sg.togd')) + '</label><select id="dm-togd"><option value="">' + esc(t('sg.togd0')) + '</option>' +
      [''].concat(godowns()).map(function (g) { return g === (d.gd || '') ? '' : '<option value="' + esc(g || 'Main') + '"' + ((g || 'Main') === d.toGd ? ' selected' : '') + '>' + esc(g || t('b2.main')) + '</option>'; }).join('') + '</select></div>';
    fields().forEach(function (f) {
      var v = d.cf && d.cf[f.id] || '';
      h += '<div class="f"><label for="dm-cf-' + esc(f.id) + '">' + esc(f.label) + (f.print ? '' : ' <small class="soft">(' + esc(t('b2.noprint')) + ')</small>') + '</label><input id="dm-cf-' + esc(f.id) + '" data-cf="' + esc(f.id) + '" dir="auto" autocomplete="off" value="' + esc(v) + '"></div>';
    });
    return h;
  }
  function draw() {
    if (!box) return;
    var h = inner();
    box.hidden = !h;
    $('.fg', box).innerHTML = h;
  }
  function editor(_, A) {
    api = A;
    return '<fieldset class="card" id="dm-box" hidden><legend>' + esc(t('b2.moredet')) + '</legend><div class="fg"></div></fieldset>';
  }
  function wire(ed) {
    box = $('#dm-box', ed); if (!box) return;
    draw();
    function on(e) {
      var el = e.target, d = api.doc();
      if (el.id === 'dm-sman') d.sman = el.value.trim();
      else if (el.id === 'dm-gd') d.gd = el.value;
      else if (el.id === 'dm-togd') { if (el.value) d.toGd = el.value; else delete d.toGd; }
      else if (el.hasAttribute('data-cf')) { d.cf = d.cf || {}; d.cf[el.getAttribute('data-cf')] = el.value; }
      else return;
      e.stopPropagation(); api.changed();
    }
    box.addEventListener('input', on, true); box.addEventListener('change', on, true);
  }
  function fill() {
    if (!box) return;
    var d = api.doc();
    var s = $('#dm-sman', box); if (s) s.value = d.sman || '';
    var g = $('#dm-gd', box); if (g) g.value = d.gd || '';
    var tg = $('#dm-togd', box); if (tg) tg.value = d.toGd || '';
    $$('[data-cf]', box).forEach(function (i) { i.value = d.cf && d.cf[i.getAttribute('data-cf')] || ''; });
  }
  /* printed: custom fields marked print, two per row like the box under the heading */
  function sheet(d) {
    var rows = fields().filter(function (f) { return f.print && d.cf && String(d.cf[f.id] || '').trim(); }).map(function (f) { return [esc(f.label), esc(d.cf[f.id])]; });
    if (!rows.length) return '';
    var h = '';
    for (var i = 0; i < rows.length; i += 2) h += '<tr><th>' + rows[i][0] + '</th><td' + (rows[i + 1] ? '' : ' colspan="3"') + '>' + rows[i][1] + '</td>' + (rows[i + 1] ? '<th>' + rows[i + 1][0] + '</th><td>' + rows[i + 1][1] + '</td>' : '') + '</tr>';
    return '<table class="meta cf-meta">' + h + '</table>';
  }
  function trackOf(desc) { var m = ITEMS.filter(function (x) { return key(x.desc) === key(desc); })[0]; return m && m.track || ''; }
  /* goods leave on this document (invoice, cash memo, challan, a debit note sending goods back to the supplier) */
  function goingOut() { var ty = type(), d = api.doc(); return ty === 'invoice' || ty === 'cashmemo' || ty === 'challan' || ty === 'note' && d.side === 'purchase' && d.kind === 'debit'; }
  function itemOf(desc) { return ITEMS.filter(function (x) { return key(x.desc) === key(desc); })[0]; }
  function fac(desc, unit) { return window.NSMfg && NSMfg.factor ? NSMfg.factor(itemOf(desc), unit) : 1; }
  function expTxt(e) { return /^\d{4}-\d{2}$/.test(e || '') ? e.slice(5, 7) + '/' + e.slice(0, 4) : ''; }
  /* ERP I-10: pick list of the batch box and what the line's batch can give */
  function batchBits(it, i) {
    if (!goingOut() || !NS.batchPick || !it.desc) return { list: '', hint: '' };
    var d = api.doc(), L = NS.batchPick(it.desc, d, api.id && api.id()); if (!L.length) return { list: '', hint: '' };
    if (!it.batch) { var first = L.filter(function (b) { return !b.expired; })[0]; if (first) { it.batch = first.batch; it.exp = first.exp; } }
    var list = '<datalist id="dm-bl-' + i + '">' + L.map(function (b) { return '<option value="' + esc(b.batch) + '" label="' + esc((b.exp ? t('sg.exp', { e: expTxt(b.exp) }) + ' · ' : '') + t('sg.left', { n: NS.qty ? NS.qty(b.qty) : b.qty }) + (b.expired ? ' · ' + t('sg.expd') : '')) + '">'; }).join('') + '</datalist>';
    var hit = L.filter(function (b) { return key(b.batch) === key(it.batch); })[0], hint = '', q = (it.qty === '' || it.qty == null ? 1 : parseFloat(it.qty) || 0) * fac(it.desc, it.unit);
    if (hit && hit.expired) hint = t('sg.bexpired', { b: hit.batch });
    else if (hit && q > hit.qty + 0.0005 && L.some(function (b) { return b !== hit && !b.expired; })) hint = t('sg.bshort', { b: hit.batch, n: NS.qty ? NS.qty(hit.qty) : hit.qty }) + ' <button type="button" class="link" data-bsplit="' + i + '">' + esc(t('sg.split')) + '</button>';
    else if (it.batch && !hit) hint = t('sg.bnone', { b: it.batch });
    return { list: list, hint: hint ? '<p class="sw-hint dm-bh">' + (hint.indexOf('<button') < 0 ? esc(hint) : esc(hint.slice(0, hint.indexOf(' <button'))) + hint.slice(hint.indexOf(' <button'))) + '</p>' : '' };
  }
  function serialList(it, i) {
    if (!goingOut() || !NS.serialsIn || !it.desc) return '';
    var L = NS.serialsIn(it.desc, api.doc(), api.id && api.id()); if (!L.length) return '';
    return '<datalist id="dm-sl-' + i + '">' + L.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }
  /* split a line whose batch holds less than asked: the batch's quantity stays, the rest moves to a new line with the next batch */
  function split(i) {
    var d = api.doc(), it = d.items[i]; if (!it) return;
    var L = NS.batchPick(it.desc, d, api.id && api.id()), hit = L.filter(function (b) { return key(b.batch) === key(it.batch); })[0]; if (!hit) return;
    var f = fac(it.desc, it.unit) || 1, has = Math.floor(hit.qty / f * 1000 + 1e-6) / 1000, want = it.qty === '' || it.qty == null ? 1 : parseFloat(it.qty) || 0;
    if (!(has > 0) || want <= has) return;
    var next = L.filter(function (b) { return b !== hit && !b.expired && b.qty > 0; })[0], o = Object.assign({}, it, { qty: Math.round((want - has) * 1000) / 1000, batch: next ? next.batch : '', exp: next ? next.exp : '' });
    it.qty = has; d.items.splice(i + 1, 0, o);
    if (api.lines) api.lines(); else api.changed();
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-bsplit]'); if (b && api) { e.preventDefault(); split(+b.getAttribute('data-bsplit')); } });
  /* a batch chosen from the list brings its expiry; the line's notes are drawn again once the box is left */
  document.addEventListener('change', function (e) {
    var el = e.target, k = el && el.getAttribute && el.getAttribute('data-k'), row = el && el.closest && el.closest('.it[data-i]');
    if (!api || !row || (k !== 'batch' && k !== 'qty' && k !== 'unit') || !row.querySelector('[data-k="batch"]') || !NS.batchPick) return;
    var d = api.doc(), i = +row.getAttribute('data-i'), it = d.items[i]; if (!it) return;
    if (k === 'batch') { it.batch = el.value.trim(); var hit = NS.batchPick(it.desc, d, api.id && api.id()).filter(function (b) { return key(b.batch) === key(it.batch); })[0]; if (hit && hit.exp) it.exp = hit.exp; }
    var was = document.activeElement && document.activeElement.id;
    setTimeout(function () { if (api.lines) api.lines(); var back = was && document.getElementById(was); if (back) back.focus(); }, 0);
  });
  function line(o) {
    if (!STOCK[type()]) return '';
    var it = o.it, i = o.i, tr = trackOf(it.desc) || (it.batch || it.exp ? 'batch' : it.serial ? 'serial' : '');
    if (!NS.bizModeOf(api.doc().seller, CFG).batch) tr = '';   /* ERP C-9: the batch switch (a warranty line stays) */
    if (!tr && !it.warr) return '';
    function f(k, lbl, extra) { return '<div class="f it-x"><label for="it-' + k + '-' + i + '">' + esc(lbl) + '</label><input id="it-' + k + '-' + i + '" data-k="' + k + '" value="' + esc(it[k] || '') + '"' + (extra || '') + '></div>'; }
    var bb = tr === 'batch' || tr === 'both' ? batchBits(it, i) : { list: '', hint: '' }, sl = tr === 'serial' || tr === 'both' ? serialList(it, i) : '';
    return (tr === 'batch' || tr === 'both' ? f('batch', t('b2.batch'), ' dir="ltr" autocomplete="off"' + (bb.list ? ' list="dm-bl-' + i + '"' : '')) + bb.list + f('exp', t('b2.expm2'), ' type="month" dir="ltr"') + bb.hint : '') +
      (tr === 'serial' || tr === 'both' ? f('serial', t('b2.serials'), ' dir="ltr" autocomplete="off"' + (sl ? ' list="dm-sl-' + i + '"' : '')) + sl : '') +
      /* optional warranty on a serial / IMEI line: months and "service every N months" (the Warranty screen of the App reads them; warrcore.js) */
      (tr === 'serial' || tr === 'both' || it.warr ? f('warr', t('wr.f_warr'), ' type="number" min="0" max="240" step="1" inputmode="numeric" dir="ltr"') + f('svcm', t('wr.f_svc'), ' type="number" min="0" max="120" step="1" inputmode="numeric" dir="ltr"') : '');
  }
  function lineNote(it) {
    var p = [];
    if (it.batch) p.push('Batch: ' + esc(it.batch));
    if (/^\d{4}-\d{2}$/.test(it.exp || '')) p.push('Exp: ' + it.exp.slice(5, 7) + '/' + it.exp.slice(2, 4));
    if (it.serial) p.push('S/N: ' + esc(it.serial));
    var wm = Math.floor(parseFloat(it.warr) || 0), sm = Math.floor(parseFloat(it.svcm) || 0);
    if (wm > 0) p.push('Warranty: ' + wm + ' month' + (wm === 1 ? '' : 's') + (sm > 0 ? ' · service every ' + sm + ' months' : ''));
    return p.length ? '<br><small class="ln-x">' + p.join(' · ') + '</small>' : '';
  }
  function block(d) { return NS.closedMsg(d.seller && d.seller.name, d.date); }
  (NS.docExt = NS.docExt || []).push({ editor: editor, wire: wire, fill: fill, sheet: sheet, line: line, lineNote: lineNote, block: block });
})();
