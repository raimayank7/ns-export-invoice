/* NS extras (Batch 1): shared pieces for the document sites, the data home (my.) and the Nivesh Sahayak App.
     NS.showLog(filter)     edit history in a dialog (store 'log' of the data home, written by store.js; read only)
     NS.pin                 PIN screen lock on my. and app.: a lock on this screen, NOT encryption (the data itself stays readable to anyone with the browser or a backup)
     NS.sample              sample records (made by sample.js, sample: 1): is any there, the strip, one tap removes them all
     NS.nextInvNo           next invoice number of a business (same rule as docs.js: PREFIX/YY-YY/001 per business and financial year)
     NS.xlsx / NS.reports   registers and reports as Excel files (SheetJS 0.18.5 from cdnjs, loaded only when asked); headers in English like every printout
   Screen words: NS.t('b1.<key>'). */
(function () {
  'use strict';
  var NS = window.NS, $ = NS.$, $$ = NS.$$, esc = NS.esc;
  function tt(k, v) { return NS.t('b1.' + k, v); }
  function num(v) { return NS.num(v); }
  function r2(n) { return NS.r2(n); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function when(ms) { var d = new Date(ms); return NS.fmtDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  NS.when = when;

  /* ---------- one dialog for the extras ---------- */
  function box(id, title) {
    var d = document.getElementById(id);
    if (!d) {
      d = NS.el('dialog', { id: id, 'class': 'b1-dlg', 'aria-labelledby': id + '-h' });
      d.innerHTML = '<div class="dlg-h"><h2 id="' + id + '-h"></h2><form method="dialog"><button class="btn sm">' + esc(NS.t('close')) + '</button></form></div><div class="dlg-b"></div>';
      document.body.appendChild(d);
    }
    $('h2', d).textContent = title;
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    return $('.dlg-b', d);
  }
  NS.b1box = box;

  /* ---------- edit history ---------- */
  var ACT = { add: 'a_add', edit: 'a_edit', del: 'a_del', restore: 'a_restore', 'import': 'a_import' };
  function field(f) { return String(f).replace(/^items\.(\d+)\./, function (m, i) { return tt('itemn', { n: +i + 1 }) + ' · '; }).replace(/^charges\.(\d+)\./, function (m, i) { return tt('chargen', { n: +i + 1 }) + ' · '; }); }
  NS.logHtml = function (rows, withRecord) {
    if (!rows.length) return '<p class="soft">' + esc(tt('nolog')) + '</p>';
    return '<ul class="b1-log">' + rows.map(function (e) {
      return '<li><div class="b1-lh"><b>' + esc(tt(ACT[e.act] || 'a_edit')) + '</b>' + (withRecord && (e.no || e.name) ? ' · ' + esc([e.no, e.name].filter(Boolean).join(' · ')) : '') +
        (e.act === 'import' ? ' · ' + esc(tt('nrec', { n: e.n || 0 })) : '') +
        '<span class="soft">' + esc(when(e.at)) + ' · ' + esc(e.who || tt('thisdev')) + ' · ' + esc(e.site || '') + '</span></div>' +
        (e.ch && e.ch.length ? '<ul class="b1-ch">' + e.ch.slice(0, 30).map(function (c) {
          return '<li><span>' + esc(field(c[0])) + '</span> <s>' + esc(c[1] || '—') + '</s> → <b>' + esc(c[2] || '—') + '</b></li>'; }).join('') + (e.ch.length > 30 ? '<li>…</li>' : '') + '</ul>' : '') + '</li>';
    }).join('') + '</ul>';
  };
  /* filter: a record id (one document's history) or nothing (everything) */
  NS.showLog = function (rid, title) {
    var b = box('ns-log', title || tt('hist'));
    b.innerHTML = '<p class="soft">' + esc(NS.t('md.loading')) + '</p>';
    return NSStore.list('log').then(function (rows) {
      rows = rows.filter(function (e) { return !rid || e.rid === rid; }).sort(function (a, c) { return c.at - a.at; });
      b.innerHTML = '<p class="soft">' + esc(tt('logp')) + '</p>' + NS.logHtml(rows.slice(0, 300), !rid);
    });
  };

  /* ---------- PIN lock ---------- */
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function hashPin(pin, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, k, 256);
    }).then(b64);
  }
  var SKEY = 'ns-unlocked', HINT = 'ns-pin-on';
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  NS.pin = {
    get: function () { return NSStore.meta('pin'); },
    set: function (pin, mins) {
      var salt = crypto.getRandomValues(new Uint8Array(16));
      return hashPin(pin, salt).then(function (h) { ls(HINT, '1'); ss(SKEY, String(Date.now())); return NSStore.meta('pin', { salt: b64(salt), hash: h, mins: +mins || 15, on: Date.now() }); });
    },
    mins: function (mins) { return NSStore.meta('pin').then(function (p) { if (p) { p.mins = +mins || 15; return NSStore.meta('pin', p); } }); },
    check: function (pin) { return NSStore.meta('pin').then(function (p) { if (!p) return true; return hashPin(pin, unb64(p.salt)).then(function (h) { return h === p.hash; }); }); },
    remove: function () { ls(HINT, null); return NSStore.meta('pin', null); },
    lock: function () { ss(SKEY, null); return gate(); }
  };
  var lockMins = 15, lastAct = Date.now(), wrong = 0, waitUntil = 0;
  function lockScreen() {
    var o = $('#ns-lock');
    if (o) return o;
    o = NS.el('div', { id: 'ns-lock', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ns-lock-h' });
    o.innerHTML = '<form class="lk" novalidate><h2 id="ns-lock-h">' + esc(tt('pin_enter')) + '</h2><p class="soft">' + esc(tt('pin_why')) + '</p>' +
      '<label for="ns-lock-in" class="sr">' + esc(tt('pin')) + '</label><input id="ns-lock-in" type="password" inputmode="numeric" autocomplete="off" maxlength="8" dir="ltr">' +
      '<p class="lk-msg" aria-live="assertive"></p><button type="submit" class="btn primary">' + esc(tt('unlock')) + '</button>' +
      '<button type="button" class="link" data-forgot>' + esc(tt('forgot')) + '</button><div class="lk-forgot" hidden><p>' + esc(tt('forgotp')) + '</p>' +
      '<button type="button" class="btn danger" data-erase>' + esc(tt('erase')) + '</button>' +
      '<label class="btn" data-rest hidden>' + esc(NS.t('md.restore')) + '<input type="file" accept=".json,application/json" hidden></label></div></form>';
    document.body.appendChild(o);
    var f = $('form', o), inp = $('input', o), msg = $('.lk-msg', o);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (Date.now() < waitUntil) { msg.textContent = tt('pin_wait', { n: Math.ceil((waitUntil - Date.now()) / 1000) }); return; }
      NS.pin.check(inp.value).then(function (ok) {
        if (ok) { wrong = 0; ss(SKEY, String(Date.now())); lastAct = Date.now(); o.remove(); document.documentElement.classList.remove('pin-wait'); return; }
        wrong++; inp.value = ''; msg.textContent = tt('pin_wrong');
        if (wrong >= 5) { waitUntil = Date.now() + 30000; wrong = 0; msg.textContent = tt('pin_wait', { n: 30 }); }
      });
    });
    $('[data-forgot]', o).addEventListener('click', function () { $('.lk-forgot', o).hidden = false; });
    $('[data-erase]', o).addEventListener('click', function () {
      if (!confirm(tt('erase_c1'))) return;
      if (prompt(NS.t('my.wipe.c2')) !== 'DELETE') return;
      NSStore.importAll({}, true).then(function () {
        ls(HINT, null); ss(SKEY, String(Date.now()));
        $('[data-erase]', o).hidden = true; $('[data-rest]', o).hidden = false;
        msg.textContent = tt('erased');
      });
    });
    $('[data-rest] input', o).addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      /* a backup can carry the forgotten PIN: whoever restores their own backup here gets in without it */
      NS.restoreFromFile(file).then(function () { return NS.pin.remove(); }).then(function () { location.reload(); }, function () {});
    });
    setTimeout(function () { inp.focus(); }, 30);
    return o;
  }
  function gate() {
    return NSStore.meta('pin').then(function (p) {
      var root = document.documentElement;
      if (!p) { ls(HINT, null); root.classList.remove('pin-wait'); return false; }
      ls(HINT, '1'); lockMins = +p.mins || 15;
      var at = +ss(SKEY) || 0;
      if (at && Date.now() - Math.max(at, lastAct) < lockMins * 6e4) { root.classList.remove('pin-wait'); return false; }
      ss(SKEY, null); lockScreen(); root.classList.remove('pin-wait');
      return true;
    }).catch(function () { document.documentElement.classList.remove('pin-wait'); });
  }
  function bump() { lastAct = Date.now(); if (ss(SKEY)) ss(SKEY, String(lastAct)); }
  function gatedPage() { return (document.getElementById('my-app') || document.getElementById('app')) && !document.documentElement.classList.contains('embed'); }
  if (gatedPage() && ls(HINT) === '1' && !ss(SKEY)) document.documentElement.classList.add('pin-wait');   /* hide the data until the PIN check is done */
  function startGate() {
    if (!gatedPage()) { document.documentElement.classList.remove('pin-wait'); return; }
    NSStore.ready().then(gate);
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, bump, { passive: true }); });
    setInterval(function () { if (ss(SKEY) && Date.now() - lastAct > lockMins * 6e4) gate(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !$('#ns-lock')) gate(); });
  }

  /* ---------- sample data (getting-started wizard) ---------- */
  /* sample records come from sample.js (the App's sample business, sample: 1); here: is any there, the strip, and one-tap removal */
  NS.sample = {
    has: function (C) { return ['biz', 'party', 'item', 'doc'].some(function (s) { return (C[s] || []).some(function (r) { return r.sample || / \(sample\)$/.test(r.name || r.desc || ''); }); }); },
    remove: function () {
      var n = 0, names = {};
      /* bills the user made under the sample business go too, but to the recycle bin (they were typed by hand) */
      return NSStore.list('biz').then(function (biz) {
        biz.forEach(function (b) { if (b.sample || / \(sample\)$/.test(b.name || '')) names[key(b.name)] = 1; });
        return NSStore.list('doc');
      }).then(function (docs) {
        return Promise.all(docs.filter(function (d) { return !d.sample && names[key(d.seller && d.seller.name)]; }).map(function (d) { n++; return NSStore.del('doc', d.id).catch(function () {}); }));
      }).then(function () {
        return Promise.all(['doc', 'party', 'item', 'biz'].map(function (s) {
          return NSStore.list(s).then(function (rows) { return Promise.all(rows.filter(function (r) { return r.sample || / \(sample\)$/.test(r.name || r.desc || ''); }).map(function (r) { n++; return NSStore.del(s, r.id, { hard: true }); })); });
        }));
      }).then(function () { return NSStore.list('biz'); }).then(function (biz) {
        return NSStore.meta('settings').then(function (s) {
          if (s && s.defBiz && !biz.some(function (b) { return b.id === s.defBiz; })) { s.defBiz = biz[0] ? biz[0].id : ''; return NSStore.meta('settings', s); }
        });
      }).then(function () { return n; });
    },
    /* the strip shown while sample records exist */
    note: function () { return '<div class="b1-sample" role="note"><span>' + esc(tt('samp_on')) + '</span><button type="button" class="btn sm" data-sample-rm>' + esc(tt('samp_rm')) + '</button></div>'; }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sample-rm]');
    if (!b || !confirm(tt('samp_rmc'))) return;
    NS.sample.remove().then(function (n) { NS.toast(tt('samp_gone', { n: n })); document.dispatchEvent(new CustomEvent('ns-data')); });
  });

  /* ---------- next invoice number (docs.js rule) ---------- */
  NS.nextInvNo = function (all, sellerName, date, CFG) {
    var c = (CFG || {}).invoice || {}, fy = NS.fy(date), short = fy.slice(2, 4) + '-' + fy.slice(5);
    var pre = String(c.prefix != null ? c.prefix : 'INV').trim().replace(/[^A-Za-z0-9\/\-]/g, ''), digits = Math.min(6, Math.max(1, +c.digits || 3));
    var prefix = (pre ? pre + '/' : '') + (c.fy === false ? '' : short + '/'), max = 0, k = key(sellerName);
    all.forEach(function (d) {
      if ((d.type || 'invoice') !== 'invoice' || d.counter || NS.fy(d.date) !== fy || key(d.seller && d.seller.name) !== k) return;
      var m = String(d.no || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, +m[1]);
    });
    return prefix + String(max + 1).padStart(digits, '0');
  };

  /* ---------- recurring bills: which copies are due (nothing is made without a tap) ---------- */
  function addMonths(isoD, n) {
    var p = isoD.split('-'), y = +p[0], m = +p[1] - 1 + n, day = +p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(y, m + 1, 0).getDate();
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
  }
  NS.addMonths = addMonths;
  /* [{ tpl, date, period }] for every repeating bill: periods up to today not made yet (at most 3 per bill) */
  NS.recurringDue = function (docs, today) {
    var out = [];
    docs.forEach(function (tpl) {
      var r = tpl.rec; if (!r || !r.every || r.stop || !tpl.date) return;
      var step = r.every === 'quarter' ? 3 : 1, made = {}, list = [];
      docs.forEach(function (d) { if (d.recOf === tpl.id) made[d.recFor] = 1; });
      for (var i = 1; i < 200; i++) {
        var dt = addMonths(tpl.date, i * step);
        if (dt > today || r.until && dt > r.until) break;
        var per = dt.slice(0, 7);
        if (!made[per]) list.push({ tpl: tpl, date: dt, period: per });
      }
      out = out.concat(list.slice(-3));
    });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  };
  NS.recurringMake = function (item, all, CFG) {
    var tpl = item.tpl, d = JSON.parse(JSON.stringify(tpl)), gap = tpl.due ? NSBooks.daysBetween(tpl.date, tpl.due) : 0;
    ['id', 'created', 'updated', 'rec', 'irn', 'einv', 'paidBy', 'invNo', 'nextNo', 'nextType', 'fromId'].forEach(function (k) { delete d[k]; });
    d.date = item.date; d.due = tpl.due ? NSBooks.addDays(item.date, gap) : ''; d.status = 'unpaid'; d.recOf = tpl.id; d.recFor = item.period;
    d.no = NS.nextInvNo(all, tpl.seller && tpl.seller.name, item.date, CFG);
    return NSStore.put('doc', d);
  };

  /* ---------- Excel ---------- */
  var XL = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'];
  function sheetName(s, used) {
    var n = String(s).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 28) || 'Sheet', base = n, i = 2;
    while (used[n.toLowerCase()]) n = base.slice(0, 25) + ' ' + (i++);
    used[n.toLowerCase()] = 1; return n;
  }
  /* sheets: [{ name, rows: [[...]] }] ; first row = headers */
  NS.xlsx = function (file, sheets) {
    NS.toast(tt('xl_making'));
    return NS.loadJs(XL[0], XL[1]).then(function () {
      var X = window.XLSX, wb = X.utils.book_new(), used = {};
      sheets.forEach(function (s) {
        var ws = X.utils.aoa_to_sheet(s.rows.length ? s.rows : [[tt('xl_none')]]);
        ws['!cols'] = (s.rows[0] || []).map(function (h, i) { return { wch: Math.min(48, Math.max(8, s.rows.reduce(function (a, r) { return Math.max(a, String(r[i] == null ? '' : r[i]).length); }, 0) + 2)) }; });
        X.utils.book_append_sheet(wb, ws, sheetName(s.name, used));
      });
      wb.Props = { Title: file.replace(/\.xlsx$/, ''), Author: 'Nivesh Sahayak', Company: 'Nivesh Sahayak' };
      X.writeFile(wb, file);
      NS.toast(tt('xl_saved', { file: file }));
    }).catch(function () { NS.toast(tt('xl_fail'), 'bad'); });
  };

  /* ---------- registers and reports (English, like every printout) ---------- */
  var EN = { invoice: 'Invoice', cashmemo: 'Cash memo', credit: 'Credit note', debit: 'Debit note', receipt: 'Receipt', adv: 'Advance received', ref: 'Refund paid', voucher: 'Payment',
    pbill: 'Purchase bill', pret: 'Purchase return', exp: 'Expense', ob: 'Opening balance', self: 'Self invoice', pharma: 'Pharmacy bill', resto: 'Restaurant bill', lr: 'Lorry receipt', fee: 'Fee receipt', job: 'Service bill', rabill: 'RA bill', contra: 'Contra' };
  function enName(d) { var ty = d.type || 'invoice'; return EN[ty === 'note' ? d.kind : ty === 'receipt' && d.kind !== 'pay' ? d.kind : ty === 'pbill' && d.kind === 'return' ? 'pret' : ty] || ty; }
  function inRange(d, from, to) { return (!from || d.date >= from) && (!to || d.date <= to); }
  function sumRow(rows, from, label) {
    if (rows.length < 2) return rows;
    var tot = rows[0].map(function (h, i) {
      var nums = rows.slice(1).filter(function (r) { return typeof r[i] === 'number'; });
      return i < from || !nums.length ? '' : nums.reduce(function (a, r) { return r2(a + r[i]); }, 0);
    });
    tot[0] = label || 'Total';
    return rows.concat([tot]);
  }
  var R = NS.reports = {
    sales: function (D, from, to) {
      var B = NSBooks, rows = [['Date', 'Document', 'Number', 'Party', 'GSTIN', 'State', 'Taxable value', 'CGST', 'SGST/UTGST', 'IGST', 'TCS', 'Round off', 'Total', 'Due date', 'Status']];
      D.filter(function (d) { return /^(sale|sret|sdeb)$/.test(B.role(d)) && inRange(d, from, to); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).forEach(function (d) {
        var t = B.itemTotals(d), k = B.role(d) === 'sret' ? -1 : 1;
        rows.push([NS.fmtDate(d.date), enName(d), d.no || '', B.partyName(d), d.buyer && d.buyer.gstin || '', NS.stateName(d.pos || d.buyer && d.buyer.state || '') || '',
          k * t.taxable, k * t.cgst, k * t.sgst, k * t.igst, k * (t.tcs || 0), k * t.round, k * t.total, NS.fmtDate(d.due || ''), d.status === 'paid' ? 'Paid' : B.role(d) === 'sale' ? 'Not paid' : '']);
      });
      return { name: 'Sales register', rows: sumRow(rows, 6) };
    },
    purchases: function (D, from, to) {
      var B = NSBooks, rows = [['Date', 'Document', 'Bill number', 'Supplier / payee', 'GSTIN', 'Taxable value', 'CGST', 'SGST', 'IGST', 'TCS', 'Total', 'Paid']];
      D.filter(function (d) { return /^(buy|pret|exp)$/.test(B.role(d)) && inRange(d, from, to); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).forEach(function (d) {
        if (d.type === 'exp') {
          var a = num(d.amount), g = num(d.gst), itc = d.itc && g ? r2(a * g / (100 + g)) : 0, ig = d.inter ? itc : 0, cg = d.inter ? 0 : r2(itc / 2);
          rows.push([NS.fmtDate(d.date), 'Expense: ' + (d.cat || ''), d.no || d.billNo || '', B.partyName(d), d.gstin || '', r2(a - itc), cg, d.inter ? 0 : r2(itc - cg), ig, 0, a, d.mode === 'credit' ? 'No' : 'Yes']);
          return;
        }
        var t = B.itemTotals(d), k = B.role(d) === 'pret' ? -1 : 1;
        rows.push([NS.fmtDate(d.date), enName(d), d.no || '', B.partyName(d), d.buyer && d.buyer.gstin || '', k * t.taxable, k * t.cgst, k * t.sgst, k * t.igst, k * (t.tcs || 0), k * t.total, '']);
      });
      return { name: 'Purchase register', rows: sumRow(rows, 5) };
    },
    dues: function (D, biz, parties, today, side) {
      var B = NSBooks, Rb = B.bills(D, biz), by = {}, pm = {};
      (parties || []).forEach(function (p) { pm[key(p.name)] = p; });
      Rb.bills.filter(function (b) { return b.side === side; }).forEach(function (b) { var k = key(b.party); (by[k] = by[k] || { name: b.party, list: [] }).list.push(b); });
      var rows = [[side === 'recv' ? 'Customer' : 'Supplier', 'Phone', 'Credit limit', 'Credit days', '0-30 days', '31-60 days', '61-90 days', 'Over 90 days', 'Total due', 'Past due date', 'Over credit limit']];
      Object.keys(by).sort(function (a, b) { return by[a].name.localeCompare(by[b].name); }).forEach(function (k) {
        var p = pm[k] || {}, list = by[k].list.map(function (b) { return b.due || !p.cdays ? b : Object.assign({}, b, { due: B.addDays(b.date, p.cdays) }); });
        var a = B.ageing(list, today, true), tot = r2(a[0] + a[1] + a[2] + a[3]);
        rows.push([by[k].name, p.phone || '', num(p.climit) || '', num(p.cdays) || '', a[0], a[1], a[2], a[3], tot, B.overdue(list, today), num(p.climit) && tot > num(p.climit) ? 'Yes' : '']);
      });
      return { name: side === 'recv' ? 'Dues to receive' : 'Dues to pay', rows: sumRow(rows, 4) };
    },
    stock: function (D, items, biz, from, to) {
      var rows = [['Item', 'Category', 'Unit', 'Opening', 'In', 'Out', 'Adjusted', 'Closing', 'Average cost', 'Value']];
      if (!window.NSStock) return { name: 'Stock summary', rows: rows };
      var cat = {}; (items || []).forEach(function (i) { cat[key(i.desc)] = i.cat || ''; });
      NSStock.summary(D, items || [], biz, from, to).items.forEach(function (s) { rows.push([s.name, cat[s.k] || '', s.unit || '', s.open, s.inq, s.outq, s.adj, s.close, s.cost, s.value]); });
      return { name: 'Stock summary', rows: sumRow(rows, 9) };
    },
    statement: function (D, biz, k, name, from, to) {
      var S = NSBooks.statement(D, biz, k, from, to), bal = function (v) { return v; };
      var rows = [['Date', 'Document', 'Number', 'Debit', 'Credit', 'Balance (+ they owe you)']];
      rows.push([NS.fmtDate(from), 'Opening balance', '', '', '', bal(S.open)]);
      S.rows.forEach(function (r) { rows.push([NS.fmtDate(r.date), enName(r.d), r.d.no || '', r.dr || '', r.cr || '', r.bal]); });
      rows.push(['', 'Closing balance', '', S.dr, S.cr, S.close]);
      return { name: name, rows: rows };
    },
    items: function (items) {
      var rows = [['Item', 'Category', 'Item code', 'HSN/SAC', 'Unit', 'MRP', 'Retail rate', 'Wholesale rate', 'Purchase price', 'GST %']];
      (items || []).slice().sort(function (a, b) { return String(a.cat || '').localeCompare(String(b.cat || '')) || String(a.desc).localeCompare(String(b.desc)); }).forEach(function (i) {
        rows.push([i.desc, i.cat || '', i.code || '', i.hsn || '', i.unit || '', num(i.mrp) || '', num(i.rate) || '', num(i.wrate) || '', num(i.prate) || '', i.gst === '' || i.gst == null ? '' : num(i.gst)]);
      });
      return { name: 'Items and prices', rows: rows };
    },
    log: function (L) {
      var rows = [['When', 'Who', 'Site', 'Action', 'Record', 'Number', 'Name', 'Changes']];
      L.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (e) {
        rows.push([when(e.at), e.who || 'This device', e.site || '', { add: 'Added', edit: 'Changed', del: 'Deleted', restore: 'Restored', 'import': 'Backup restored' }[e.act] || e.act, e.type || e.store || '', e.no || '', e.name || '',
          (e.ch || []).map(function (c) { return c[0] + ': ' + (c[1] || '-') + ' -> ' + (c[2] || '-'); }).join('; ') || (e.act === 'import' ? e.n + ' records' : '')]);
      });
      return { name: 'Edit history', rows: rows };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGate); else startGate();
})();
