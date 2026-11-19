/* NSBiz Orders on the document makers (ERP round 2, I-12): billing, cash memo, delivery challan and sales order makers (also their
   copies inside the App) say when the customer has open quotations, sales orders or challans and let you pick the open lines,
   part quantities too. A picked line keeps it.src = { id, lid } (ordercore.js), so the order shows it as delivered / billed.
   Joins docs.js through NS.docExt (no change to docs.js). Screen words: NS.t('or.*'), in every language pack. */
(function () {
  'use strict';
  if (!window.NS || !window.NSStore || !window.NSOrders) return;
  var O = NSOrders, $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num;
  function t(k, v) { return NS.t('or.' + k, v); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function qty(v) { return String(Math.round(num(v) * 1000) / 1000); }
  function today() { return NS.today ? NS.today() : new Date().toISOString().slice(0, 10); }
  function docWord(d) { var k = d.type === 'quote' ? 'k.' + (d.kind || 'quote') : 'Doc.' + d.type, w = NS.t(k); return w !== k ? w : d.type; }
  var API = null, timer = 0, ED = null;

  function intoOf() {
    if (!API) return '';
    var ty = API.type(), d = API.doc() || {};
    if (ty === 'invoice' || ty === 'cashmemo') return 'sale';
    if (ty === 'challan') return !d.kind || d.kind === 'sale' || d.kind === 'approval' ? 'dn' : '';
    if (ty === 'so') return 'so';
    return '';
  }
  function list() {
    var d = API.doc() || {}, party = ($('#b-name', ED) || {}).value || (d.buyer && d.buyer.name) || '', into = intoOf();
    if (!into || !key(party)) return Promise.resolve([]);
    return NSStore.list('doc').then(function (docs) { return O.pickable(docs, d.seller && d.seller.name, party, into, { skip: API.id(), today: today() }); }, function () { return []; });
  }
  function hint() {
    timer = 0;
    var box = $('[data-orhint]', ED); if (!box) return;
    list().then(function (L) {
      var used = {}; ((API.doc() || {}).items || []).forEach(function (it) { if (it.src) used[it.src.id + '|' + it.src.lid] = 1; });   /* lines already on this document */
      L = L.filter(function (e) { return e.lines.some(function (x) { return x.pending > 0 && !used[e.id + '|' + x.lid]; }); });
      if (!L.length) { box.hidden = true; return; }
      var names = L.map(function (e) { return docWord(e.d) + ' ' + (e.d.no || ''); });
      box.innerHTML = '<span>' + esc(t('hint', { n: L.length, lines: L.reduce(function (s, e) { return s + e.lines.filter(function (x) { return x.pending > 0; }).length; }, 0), docs: names.slice(0, 3).join(', ') + (names.length > 3 ? ' …' : '') })) + '</span> <button type="button" class="btn sm" data-orpick>' + esc(t('pick')) + '</button>';
      box.hidden = false;
    });
  }
  function soon() { if (!timer) timer = setTimeout(hint, 300); }
  function pickDlg(L, done) {
    var dlg = document.createElement('dialog'); dlg.className = 'or-pick';
    dlg.innerHTML = '<form method="dialog"><h3>' + esc(t('pick_t')) + '</h3><p class="hint">' + esc(t('pick_h')) + '</p>' + L.map(function (e) {
      return '<section class="or-src"><h4>' + esc(docWord(e.d) + ' ' + (e.d.no || '')) + ' <span class="hint">· ' + esc(NS.fmtDate ? NS.fmtDate(e.d.date) : e.d.date) + (e.due ? ' · ' + esc(t('due', { d: NS.fmtDate ? NS.fmtDate(e.due) : e.due })) : '') + '</span> <button type="button" class="btn sm" data-orall>' + esc(t('tickall')) + '</button></h4>' +
        '<table class="or-tbl"><thead><tr><th></th><th>' + esc(t('c_item')) + '</th><th class="n">' + esc(t('c_ord')) + '</th><th class="n">' + esc(t('c_pend')) + '</th><th class="n">' + esc(t('c_take')) + '</th></tr></thead><tbody>' +
        e.lines.filter(function (x) { return x.pending > 0; }).map(function (x) {
          var id = e.id + '|' + x.lid;
          return '<tr><td><input type="checkbox" data-ork="' + esc(id) + '" aria-label="' + esc(x.name) + '"></td><td>' + esc(x.name) + (x.late ? ' <b class="or-late">' + esc(t('late')) + '</b>' : '') + '</td><td class="n">' + qty(x.qty) + ' ' + esc(x.unit) + '</td><td class="n">' + qty(x.pending) + '</td>' +
            '<td class="n"><input data-orq="' + esc(id) + '" value="' + qty(x.pending) + '" inputmode="decimal" dir="ltr" size="6" autocomplete="off"></td></tr>';
        }).join('') + '</tbody></table></section>';
    }).join('') + '<div class="actions"><button type="submit" class="btn primary">' + esc(t('addsel')) + '</button> <button type="button" class="btn" data-orx>' + esc(NS.t('b.cancel') !== 'b.cancel' ? NS.t('b.cancel') : 'Cancel') + '</button></div></form>';
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); dlg.remove(); };
    dlg.addEventListener('input', function (ev) { var q = ev.target.getAttribute('data-orq'); if (q) { var c = dlg.querySelector('[data-ork="' + q + '"]'); if (c) c.checked = num(ev.target.value) > 0; } });
    dlg.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-orx]')) close();
      var a = ev.target.closest('[data-orall]'); if (a) { var b = $$('[data-ork]', a.closest('.or-src')), on = !b.every(function (c) { return c.checked; }); b.forEach(function (c) { c.checked = on; }); }
    });
    $('form', dlg).addEventListener('submit', function (ev) {
      ev.preventDefault();
      var out = [];
      L.forEach(function (e) { e.lines.forEach(function (x) { var id = e.id + '|' + x.lid, c = dlg.querySelector('[data-ork="' + id + '"]'), q = dlg.querySelector('[data-orq="' + id + '"]'); if (c && c.checked && q && num(q.value) > 0) out.push(O.lineFrom(e, x, Math.min(num(q.value), x.pending))); }); });
      close(); if (out.length) done(out);
    });
    dlg.showModal();
  }
  function pick() {
    list().then(function (L) {
      if (!L.length) return;
      pickDlg(L, function (lines) {
        var d = API.doc(), used = {};
        (d.items || []).forEach(function (it) { if (it.src) used[it.src.id + '|' + it.src.lid] = 1; });
        d.items = (d.items || []).filter(function (it) { return String(it.desc || '').trim() || num(it.rate); });
        var n = 0; lines.forEach(function (it) { if (!used[it.src.id + '|' + it.src.lid]) { d.items.push(it); n++; } });
        if (!d.items.length) d.items.push({ desc: '', hsn: '', qty: 1, unit: 'Nos', rate: '', disc: '', gst: 18 });
        API.lines(); NS.toast(t('added', { n: n })); soon();
      });
    });
  }
  function editor() { return '<p class="note or-hint" data-orhint hidden role="status"></p>'; }
  function wire(ed, api) {
    API = api; ED = ed;
    var box = $('[data-orhint]', ed), it = $('#items', ed), fs = it && it.closest('fieldset');
    if (box && fs && fs.parentNode) fs.parentNode.insertBefore(box, fs);   /* just above the item lines */
    if (ed._orw) { soon(); return; }   /* the maker draws its editor again: listeners stay from the first time */
    ed._orw = 1;
    ed.addEventListener('input', function (e) { if (e.target && (e.target.id === 'b-name' || e.target.id === 'd-kind')) soon(); });
    ed.addEventListener('change', function (e) { if (e.target && (e.target.id === 'b-name' || e.target.id === 'd-kind')) soon(); });
    ed.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-orpick]')) { e.preventDefault(); pick(); } });
    soon();
  }
  function fill() { soon(); }   /* a saved document opened, or the form filled again */
  (NS.docExt = NS.docExt || []).push({ editor: editor, wire: wire, fill: fill });
})();
