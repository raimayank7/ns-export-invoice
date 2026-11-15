/* NS caui (gap round, 2026-11-14): the OWNER's side of the accountant hand-over.
   1. "Make a file for my accountant" (My data > Send to your accountant, and the App's "CA comments" screen): packs one business and period
      into ONE read-only .nsca file (cashare.js) the owner sends by WhatsApp or email. The accountant opens it on ca.niveshsahayak.in.
      This is a FILE hand-over, not a live shared login: a live login would need a server, which Nivesh Sahayak does not have.
   2. App screen "CA comments" (#cacom): the owner loads the accountant's .nsca-comments file, sees each query beside the entry it is about,
      replies, marks it closed, and saves the file again to send back (the accountant's viewer shows the replies).
   Loaded by the App page at start and by safe.js (NS.openCAShare) on the other sites when the button is pressed. */
(function () {
  'use strict';
  var NS = window.NS, C = window.NSCAshare, B = window.NSBooks, $ = NS.$, esc = NS.esc;
  function T(k, v) { return NS.t(k, v); }
  var CFG = window.NS_CFG || {}, VIEWER = CFG.caUrl || 'https://ca.niveshsahayak.in/';

  /* ---------- period shortcuts (same choices as "Send to accountant") ---------- */
  function iso(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function fy(d) { return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }
  function period(p) {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), q = Math.floor(((m + 9) % 12) / 3), qs;
    if (p === 'tm') return [iso(new Date(y, m, 1)), iso(n)];
    if (p === 'lm') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    qs = new Date(fy(n), 3 + 3 * q, 1);
    if (p === 'tq') return [iso(qs), iso(n)];
    if (p === 'lq') return [iso(new Date(qs.getFullYear(), qs.getMonth() - 3, 1)), iso(new Date(qs.getFullYear(), qs.getMonth(), 0))];
    if (p === 'ty') return [fy(n) + '-04-01', iso(n)];
    return [(fy(n) - 1) + '-04-01', fy(n) + '-03-31'];
  }

  /* ---------- 1. the share box ---------- */
  function chk(id, key, on) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(T(key)) + '</label>'; }
  function openShare() {
    var d = $('#ns-cash');
    if (!d) { d = NS.el('dialog', { id: 'ns-cash', 'aria-labelledby': 'ns-cash-h' }); document.body.appendChild(d); }
    var ly = period('ly');
    d.innerHTML = '<div class="dlg-h"><h2 id="ns-cash-h">' + esc(T('ca.t')) + '</h2><form method="dialog"><button class="btn sm">' + esc(T('close')) + '</button></form></div><div class="dlg-b ac-b">' +
      '<p class="soft">' + esc(T('ca.intro')) + '</p><p class="note">' + esc(T('ca.notlive')) + '</p>' +
      '<label for="ca-biz">' + esc(T('b3.ac.biz')) + '</label><select id="ca-biz"><option value="">' + esc(T('md.loading')) + '</option></select>' +
      '<label for="ca-per">' + esc(T('b3.ac.per')) + '</label><select id="ca-per">' + ['ly', 'ty', 'lq', 'tq', 'lm', 'tm', 'own'].map(function (p) { return '<option value="' + p + '">' + esc(T('b3.ac.p.' + p)) + '</option>'; }).join('') + '</select>' +
      '<div class="ac-dates"><span><label for="ca-from">' + esc(T('b3.ac.from')) + '</label><input id="ca-from" type="date" value="' + ly[0] + '"></span><span><label for="ca-to">' + esc(T('b3.ac.to')) + '</label><input id="ca-to" type="date" value="' + ly[1] + '"></span></div>' +
      '<fieldset class="ac-w"><legend>' + esc(T('ca.what')) + '</legend>' + chk('ca-earlier', 'ca.earlier', true) + chk('ca-items', 'ca.items', true) + '</fieldset>' +
      '<fieldset class="ac-w"><legend>' + esc(T('ca.extra')) + '</legend><p class="soft">' + esc(T('ca.extrah')) + '</p>' + chk('ca-orders', 'ca.orders', false) + chk('ca-staff', 'ca.staff', false) + chk('ca-phones', 'ca.phones', false) + chk('ca-bank', 'ca.bank', false) + '</fieldset>' +
      '<label for="ca-note">' + esc(T('ca.note')) + '</label><textarea id="ca-note" rows="2" maxlength="600"></textarea>' +
      '<div class="btns"><button type="button" class="btn primary" id="ca-go">' + esc(T('ca.go')) + '</button></div><div id="ca-out" aria-live="polite"></div></div>';
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    var per = $('#ca-per', d);
    per.addEventListener('change', function () { if (per.value === 'own') return; var p = period(per.value); $('#ca-from', d).value = p[0]; $('#ca-to', d).value = p[1]; });
    ['#ca-from', '#ca-to'].forEach(function (s) { $(s, d).addEventListener('input', function () { per.value = 'own'; }); });
    Promise.all([NSStore.list('biz'), NSStore.list('doc'), NSStore.meta('settings')]).then(function (r) {
      var seen = {}, list = [];
      r[0].concat(r[1].map(function (x) { return x.seller || {}; })).forEach(function (b) { var n = b && b.name && b.name.trim(); if (n && !seen[B.key(n)]) { seen[B.key(n)] = 1; list.push(n); } });
      var def = r[2] && r[2].defBiz && r[0].filter(function (b) { return b.id === r[2].defBiz; })[0];
      $('#ca-biz', d).innerHTML = list.length ? list.map(function (n) { return '<option' + (def && def.name === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') : '<option value="">' + esc(T('b3.ac.nobiz')) + '</option>';
    });
    $('#ca-go', d).addEventListener('click', function () { make(d); });
  }

  function leftWords(share) { return C.leftOut(share).map(function (k) { return T('ca.no.' + k); }).join(', '); }
  function make(d) {
    var out = $('#ca-out', d), biz = $('#ca-biz', d).value, from = $('#ca-from', d).value, to = $('#ca-to', d).value;
    if (!biz) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.nobiz')) + '</p>'; return; }
    if (!from || !to || from > to) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.baddate')) + '</p>'; return; }
    out.innerHTML = '<p class="soft">' + esc(T('b3.ac.making')) + '</p>';
    Promise.all(['biz', 'party', 'item', 'doc'].map(function (s) { return NSStore.list(s); }).concat(['settings', 'groups', 'heads', 'staff'].map(function (m) { return NSStore.meta(m); }))).then(function (r) {
      var meta = { settings: r[4], groups: r[5], heads: r[6], staff: r[7] };
      var share = C.build({ biz: r[0], party: r[1], item: r[2], doc: r[3], meta: meta }, {
        biz: biz, from: from, to: to, earlier: $('#ca-earlier', d).checked, items: $('#ca-items', d).checked, orders: $('#ca-orders', d).checked, staff: $('#ca-staff', d).checked,
        phones: $('#ca-phones', d).checked, bank: $('#ca-bank', d).checked, note: $('#ca-note', d).value, by: ''
      });
      if (!share.counts.docs) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.empty')) + '</p>'; return; }
      var text = JSON.stringify(share), name = ('ca-' + biz + '-' + from + '-to-' + to).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) + '.nsca';
      var file = new File([text], name, { type: 'application/json' }), code = C.code(share.sha256);
      var msg = T('ca.msg', { biz: biz, from: NS.fmtDate(from), to: NS.fmtDate(to), code: code, url: VIEWER });
      out.innerHTML = '<p class="note ok-note">' + esc(T('ca.ready', { n: share.counts.docs, p: share.counts.parties, kb: Math.max(1, Math.round(text.length / 1024)) })) + '</p>' +
        '<p><b>' + esc(T('ca.code')) + '</b> <span class="mono ca-code">' + esc(code) + '</span></p><p class="soft">' + esc(T('ca.codeh')) + '</p>' +
        '<p class="soft">' + esc(T('ca.notin', { w: leftWords(share) || T('ca.nothing') })) + '</p>' +
        '<div class="btns">' + (navigator.canShare && navigator.canShare({ files: [file] }) ? '<button type="button" class="btn primary" data-ca-share>' + esc(T('b3.ac.share')) + '</button>' : '') +
        '<button type="button" class="btn" data-ca-save>' + esc(T('b3.ac.save')) + '</button><button type="button" class="btn" data-ca-copy>' + esc(T('ca.copymsg')) + '</button></div>' +
        '<label for="ca-msg">' + esc(T('ca.msgl')) + '</label><textarea id="ca-msg" rows="6" readonly>' + esc(msg) + '</textarea><p class="soft">' + esc(T('ca.how')) + '</p>';
      var sh = $('[data-ca-share]', out);
      if (sh) sh.addEventListener('click', function () { navigator.share({ files: [file], title: name, text: msg }).catch(function () {}); });
      $('[data-ca-save]', out).addEventListener('click', function () { NS.saveFile(file, name); NS.toast(T('pdf.saved', { file: name })); });
      $('[data-ca-copy]', out).addEventListener('click', function () { var t = $('#ca-msg', out); t.select(); try { document.execCommand('copy'); } catch (e) {} if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(function () {}); NS.toast(T('ca.copied')); });
    }).catch(function (e) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.fail')) + ' ' + esc(e && e.message || '') + '</p>'; });
  }

  /* ---------- 2. the comments screen (App section #cacom) ---------- */
  var CF = null, DOCS = [], PAT = null;
  function load() {
    return Promise.all([NSStore.meta('caComments'), NSStore.list('doc')]).then(function (r) { CF = r[0] || null; DOCS = r[1] || []; });
  }
  function save() { return CF ? NSStore.meta('caComments', CF) : Promise.resolve(); }
  function docOf(c) { return c.ref && c.ref.kind === 'doc' ? DOCS.filter(function (d) { return d.id === c.ref.id; })[0] : null; }
  function entry(c) {
    var r = c.ref || {}, d = docOf(c);
    if (r.kind === 'doc') return d ? esc(C.brief(d)) : esc(r.label || r.id) + ' <span class="soft">' + esc(T('ca.gone')) + '</span>';
    if (r.kind === 'party') return esc(T('ca.party')) + ': ' + esc(r.label || r.id);
    if (r.kind === 'screen') return esc(T('ca.screen')) + ': ' + esc(r.label || r.id);
    return esc(T('ca.general'));
  }
  function openLink(c) {
    var r = c.ref || {}, d = docOf(c);
    if (r.kind === 'doc' && d && window.NSApp && NSApp.docUrl) return '<a class="btn sm" href="' + esc(NSApp.docUrl(d)) + '">' + esc(T('ca.open')) + '</a>';
    if (r.kind === 'party') return '<a class="btn sm" href="#st/' + encodeURIComponent(r.id) + '">' + esc(T('ca.open')) + '</a>';
    return '';
  }
  function screenHtml() {
    var items = CF ? CF.items.slice().sort(function (a, b) { return (a.status === 'closed') - (b.status === 'closed') || String(b.at).localeCompare(String(a.at)); }) : [];
    return '<div class="pane-hd"><h2>' + esc(T('ca.cT')) + '</h2><div class="quick"><button type="button" class="btn primary" data-ca-load>' + esc(T('ca.load')) + '</button>' +
      '<button type="button" class="btn" data-ca-make>' + esc(T('ca.t')) + '</button>' + (items.length ? '<button type="button" class="btn" data-ca-export>' + esc(T('ca.export')) + '</button>' : '') + '</div></div>' +
      '<input type="file" id="ca-in" accept=".nsca-comments,.json,application/json" hidden>' +
      '<p class="soft">' + esc(T('ca.cIntro')) + '</p><p class="note">' + esc(T('ca.notlive')) + '</p><div id="ca-msg2" aria-live="polite"></div>' +
      (items.length ? '<p><b>' + esc(T('ca.openn', { n: C.openCount(CF) })) + '</b></p>' + items.map(function (c) {
        return '<div class="card ca-c' + (c.status === 'closed' ? ' ca-done' : '') + '" data-cid="' + esc(c.id) + '"><p class="soft">' + entry(c) + '</p><p><b>' + esc(T(c.kind === 'note' ? 'ca.knote' : 'ca.kquery')) + '</b> · ' + esc(c.by || T('ca.acct')) + ' · ' + esc(NS.fmtDate(String(c.at).slice(0, 10))) + '</p><p>' + esc(c.text).replace(/\n/g, '<br>') + '</p>' +
          (c.reply ? '<p class="note ok-note"><b>' + esc(T('ca.yourreply')) + '</b> ' + esc(c.reply).replace(/\n/g, '<br>') + '</p>' : '') +
          (c.status === 'closed' ? '<p class="soft">' + esc(T('ca.closed')) + '</p>' : '<textarea rows="2" data-reply placeholder="' + esc(T('ca.replyph')) + '">' + esc(c.reply || '') + '</textarea><div class="btns"><button type="button" class="btn sm primary" data-ca-reply>' + esc(T('ca.savereply')) + '</button><button type="button" class="btn sm" data-ca-close>' + esc(T('ca.markclosed')) + '</button>' + openLink(c) + '</div>') + '</div>';
      }).join('') : '<p>' + esc(T('ca.none')) + '</p>');
  }
  function wire(pane) {
    var msg = function (h) { $('#ca-msg2', pane).innerHTML = h; };
    $('[data-ca-load]', pane).addEventListener('click', function () { $('#ca-in', pane).click(); });
    $('[data-ca-make]', pane).addEventListener('click', openShare);
    $('#ca-in', pane).addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var inc; try { inc = JSON.parse(t); } catch (x) { inc = null; }
        var v = C.verifyComments(inc); if (!v.ok) { msg('<p class="note bad">' + esc(T('ca.badfile')) + '</p>'); return; }
        var m = C.mergeComments(CF, inc); CF = m.file;
        var sealed = inc.sha256 && C.verifyComments(inc).ok;
        return save().then(function () { return refresh(pane, true); }).then(function () { msg('<p class="note ok-note">' + esc(T('ca.loaded', { a: m.added, c: m.changed })) + (sealed ? '' : ' ' + esc(T('ca.unsealed'))) + '</p>'); });
      });
      e.target.value = '';
    });
    var ex = $('[data-ca-export]', pane);
    if (ex) ex.addEventListener('click', function () {
      var cf = C.sealComments(JSON.parse(JSON.stringify(CF))), name = 'comments-with-replies-' + NS.today() + '.nsca-comments';
      NS.saveFile(new File([JSON.stringify(cf, null, 1)], name, { type: 'application/json' }), name); NS.toast(T('pdf.saved', { file: name }));
    });
    pane.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-ca-reply],[data-ca-close]'); if (!b) return;
      var box = b.closest('[data-cid]'), c = CF.items.filter(function (x) { return x.id === box.getAttribute('data-cid'); })[0]; if (!c) return;
      var tx = $('[data-reply]', box); if (tx && tx.value.trim() !== (c.reply || '')) { c.reply = tx.value.trim(); c.repliedAt = new Date().toISOString(); }
      if (b.hasAttribute('data-ca-close')) { c.status = 'closed'; c.repliedAt = new Date().toISOString(); }
      save().then(function () { NS.toast(T('ca.saved')); refresh(pane, true); });
    });
  }
  function refresh(pane, keep) { return load().then(function () { pane.innerHTML = screenHtml(); wire(pane); }); }

  function mount() {
    if (!window.NSApp || !NSApp.addSection) return;
    NSApp.addSection('cacom', function () { return '<div class="shim" style="height:120px"></div>'; }, function (pane) { refresh(pane); });
    var nav = $('.hub-nav'); if (nav && !$('[data-sec="cacom"]', nav) && !(NSApp.door && NSApp.door())) nav.insertAdjacentHTML('beforeend', '<a href="#cacom" data-sec="cacom"><span>' + esc(T('ca.cT')) + '</span></a>');
  }
  NS.openCAShare = openShare;
  window.NSCAUI = { openShare: openShare, period: period, make: make };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
