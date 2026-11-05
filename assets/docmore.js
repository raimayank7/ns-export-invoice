/* Batch 2 on every document maker (docs.js through NS.docExt; slip.js only uses NS.closedMsg):
     salesman      d.sman on sales documents (suggestions from Settings > Salesmen and earlier bills; never filled by itself)
     godown        d.gd on documents that move stock, when Settings has godowns
     custom fields d.cf = { <field id>: value } for the fields Settings defines for this document type; printed only when
                   the field is marked "print" (label as typed, value as typed)
     batch lines   it.batch, it.exp (YYYY-MM), it.serial on items marked "batch and expiry" / "serial or IMEI" in My data
     closed year   saving (and deleting) is refused for a date inside a financial year closed in the App's Year end
   Settings come from the data home (meta 'settings': salesmen, godowns, cfields, closed). Printed words stay English. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, t = NS.t;
  var SALES = { invoice: 1, cashmemo: 1, quote: 1, proforma: 1, so: 1, challan: 1, note: 1 };
  var STOCK = { invoice: 1, cashmemo: 1, self: 1, note: 1, challan: 1 };
  var CFG = {}, ITEMS = [], SMEN = [], api = null, box = null;
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function fyOf(iso) { var y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7); if (m < 4) y--; return y + '-' + String(y + 1).slice(2); }
  NS.closedMsg = function (bizName, iso) {
    var l = CFG.closed && CFG.closed[key(bizName)];
    return l && iso && l.indexOf(fyOf(iso)) >= 0 ? t('b2.closedmsg', { fy: fyOf(iso) }) : '';
  };
  function load() {
    return Promise.all([NSStore.meta('settings'), NSStore.list('item'), NSStore.list('doc')]).then(function (r) {
      CFG = r[0] || {}; ITEMS = r[1] || [];
      var o = {}; (CFG.salesmen || []).forEach(function (s) { if (s && s.name) o[key(s.name)] = s.name; });
      (r[2] || []).forEach(function (d) { if (d.sman) o[key(d.sman)] = o[key(d.sman)] || d.sman; });
      SMEN = Object.keys(o).map(function (k) { return o[k]; }).sort();
      if (box && api) { draw(); if (api.type) api.changed(); }
    }, function () {});
  }
  if (window.NSStore) (NSStore.ready ? NSStore.ready() : Promise.resolve()).then(load);
  window.addEventListener('focus', function () { if (window.NSStore) load(); });

  function type() { return api ? api.type() : ''; }
  function fields() { var ty = type(); return (CFG.cfields || []).filter(function (f) { return f && f.label && (!f.types || !f.types.length || f.types.indexOf(ty) >= 0); }); }
  function godowns() { return (CFG.godowns || []).filter(Boolean); }
  function inner() {
    var ty = type(), d = api.doc(), h = '';
    if (SALES[ty]) h += '<div class="f"><label for="dm-sman">' + esc(t('b2.smanf')) + '</label><input id="dm-sman" list="dm-smen" dir="auto" autocomplete="off" value="' + esc(d.sman || '') + '">' +
      '<datalist id="dm-smen">' + SMEN.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>';
    if (STOCK[ty] && godowns().length) h += '<div class="f"><label for="dm-gd">' + esc(t('b2.gd1')) + '</label><select id="dm-gd"><option value="">' + esc(t('b2.main')) + '</option>' +
      godowns().map(function (g) { return '<option' + (g === d.gd ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>';
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
  function line(o) {
    if (!STOCK[type()]) return '';
    var it = o.it, i = o.i, tr = trackOf(it.desc) || (it.batch || it.exp ? 'batch' : it.serial ? 'serial' : '');
    if (!tr) return '';
    function f(k, lbl, extra) { return '<div class="f it-x"><label for="it-' + k + '-' + i + '">' + esc(lbl) + '</label><input id="it-' + k + '-' + i + '" data-k="' + k + '" value="' + esc(it[k] || '') + '"' + (extra || '') + '></div>'; }
    return (tr === 'batch' || tr === 'both' ? f('batch', t('b2.batch'), ' dir="ltr" autocomplete="off"') + f('exp', t('b2.expm2'), ' type="month" dir="ltr"') : '') +
      (tr === 'serial' || tr === 'both' ? f('serial', t('b2.serials'), ' dir="ltr" autocomplete="off"') : '');
  }
  function lineNote(it) {
    var p = [];
    if (it.batch) p.push('Batch: ' + esc(it.batch));
    if (/^\d{4}-\d{2}$/.test(it.exp || '')) p.push('Exp: ' + it.exp.slice(5, 7) + '/' + it.exp.slice(2, 4));
    if (it.serial) p.push('S/N: ' + esc(it.serial));
    return p.length ? '<br><small class="ln-x">' + p.join(' · ') + '</small>' : '';
  }
  function block(d) { return NS.closedMsg(d.seller && d.seller.name, d.date); }
  (NS.docExt = NS.docExt || []).push({ editor: editor, wire: wire, fill: fill, sheet: sheet, line: line, lineNote: lineNote, block: block });
})();
