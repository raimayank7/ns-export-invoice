/* NS acct (Batch 3): "Send to accountant". One .zip file for a chosen business and period:
     registers-<from>-<to>.xlsx   Sales register, Purchase register, Money in and out, HSN summary of sales, Party balances
     tally-masters.xml, tally-vouchers.xml   TallyPrime import files from tally.js (same entries as the App's books)
     data-for-nivesh-sahayak.json  the period's documents + masters as a normal backup file (optionally locked with a password),
                                   so the accountant can open them in their own browser with "Restore"
     READ-ME.txt                   what each file is
   Loaded only when the button is pressed (safe.js NS.openAccountant), after books.js, xlsx.js and tally.js. Files are English
   like every printed document. Nothing is sent anywhere: the phone's share sheet or a download hands the file on. */
(function () {
  'use strict';
  var NS = window.NS, B = window.NSBooks, $ = NS.$, esc = NS.esc, r2 = NS.r2, num = NS.num;
  function T(k, v) { return NS.t(k, v); }
  var TYPE = { invoice: 'Tax invoice', cashmemo: 'Cash memo', pharma: 'Pharmacy bill', resto: 'Restaurant bill', lr: 'Bilty (LR)', fee: 'Fee receipt', job: 'Job card bill', rabill: 'RA bill',
    note: 'Credit note', receipt: 'Receipt', voucher: 'Payment voucher', self: 'Self invoice', pbill: 'Purchase bill', exp: 'Expense', contra: 'Contra' };
  function tname(d) { var R = B.role(d); return d.type === 'note' ? (d.kind === 'debit' ? 'Debit note' : 'Credit note') : R === 'sdeb' ? 'Debit note' : R === 'pret' ? 'Purchase return' : R === 'refund' ? 'Refund voucher' : TYPE[d.type || 'invoice'] || d.type; }
  function n2(v) { return v ? r2(v).toFixed(2) : '0.00'; }

  /* ---------- zip (stored, no compression), text or bytes ---------- */
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0, d = new Date();
    var dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    function h(n, v) { var a = []; for (var i = 0; i < n; i++) a.push((v >>> (8 * i)) & 255); return a; }
    files.forEach(function (f) {
      var nm = enc.encode(f[0]), data = typeof f[1] === 'string' ? enc.encode(f[1]) : f[1], crc = crc32(data);
      var head = [].concat(h(4, 0x04034b50), h(2, 20), h(2, 0x0800), h(2, 0), h(2, dt), h(2, dd), h(4, crc), h(4, data.length), h(4, data.length), h(2, nm.length), h(2, 0));
      parts.push(new Uint8Array(head), nm, data);
      central.push(new Uint8Array([].concat(h(4, 0x02014b50), h(2, 20), h(2, 20), h(2, 0x0800), h(2, 0), h(2, dt), h(2, dd), h(4, crc), h(4, data.length), h(4, data.length),
        h(2, nm.length), h(2, 0), h(2, 0), h(2, 0), h(2, 0), h(4, 0), h(4, off))), nm);
      off += head.length + nm.length + data.length;
    });
    var size = central.reduce(function (a, x) { return a + x.length; }, 0);
    return new Blob(parts.concat(central, [new Uint8Array([].concat(h(4, 0x06054b50), h(2, 0), h(2, 0), h(2, files.length), h(2, files.length), h(4, size), h(4, off), h(2, 0)))]), { type: 'application/zip' });
  }

  /* ---------- registers ---------- */
  function registers(docs, biz, from, to) {
    var inP = B.inBooks(docs, biz).filter(function (d) { return d.date >= from && d.date <= to; });
    var sales = [['Date', 'Type', 'Number', 'Customer', 'Customer GSTIN', 'Place of supply', 'Taxable value', 'CGST', 'SGST/UTGST', 'IGST', 'Round off', 'Total', 'Paid']];
    var buys = [['Date', 'Type', 'Bill number', 'Supplier', 'Supplier GSTIN', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total', 'Reverse charge', 'Note']];
    var money = [['Date', 'Type', 'Number', 'Party', 'Mode', 'Amount', 'TDS', 'Against bills']];
    var hsn = {}, tot = { s: [0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0] };
    inP.forEach(function (d) {
      var R = B.role(d), b = d.buyer || {}, t, sg;
      if (R === 'sale' || R === 'sret' || R === 'sdeb') {
        t = B.itemTotals(d); sg = R === 'sret' ? -1 : 1;
        sales.push([NS.fmtDate(d.date), tname(d), d.no || '', b.name || 'Cash customer', b.gstin || '', d.pos || b.state || '', n2(sg * t.taxable), n2(sg * t.cgst), n2(sg * t.sgst), n2(sg * t.igst), n2(sg * t.round), n2(sg * t.total), d.status === 'paid' ? 'Yes' : '']);
        [t.taxable, t.cgst, t.sgst, t.igst, t.total].forEach(function (v, i) { tot.s[i] += sg * v; });
        if (d.kind !== 'supply' && d.kind !== 'plain' && d.withGst !== false) (d.items || []).forEach(function (it) {
          var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), tx = r2(q * num(it.rate) * (1 - num(it.disc) / 100));
          if (!it.desc && !tx) return;
          var k = (it.hsn || '-') + '|' + num(it.gst) + '|' + (it.unit || ''), h = hsn[k] || (hsn[k] = { hsn: it.hsn || '', desc: it.desc || '', unit: it.unit || '', rate: num(it.gst), qty: 0, val: 0 });
          h.qty += sg * q; h.val += sg * tx;
        });
      } else if (R === 'buy' || R === 'pret') {
        t = B.itemTotals(d); sg = R === 'pret' ? -1 : 1;
        buys.push([NS.fmtDate(d.date), tname(d), d.billNo || d.no || '', b.name || '', b.gstin || '', n2(sg * t.taxable), n2(sg * t.cgst), n2(sg * t.sgst), n2(sg * t.igst), n2(sg * (d.type === 'self' ? t.taxable + t.cgst + t.sgst + t.igst : t.total)), d.type === 'self' || d.rc ? 'Yes' : '', '']);
        [t.taxable, t.cgst, t.sgst, t.igst, t.total].forEach(function (v, i) { tot.p[i] += sg * v; });
      } else if (R === 'exp') {
        var a = num(d.amount), g = num(d.gst), itc = d.itc && g ? r2(a * g / (100 + g)) : 0;
        buys.push([NS.fmtDate(d.date), 'Expense: ' + (d.cat || 'Miscellaneous'), d.billNo || d.no || '', b.name || '', b.gstin || '', n2(a - itc), d.inter ? '0.00' : n2(itc / 2), d.inter ? '0.00' : n2(itc - r2(itc / 2)), d.inter ? n2(itc) : '0.00', n2(a), '', d.mode === 'credit' ? 'Not paid yet' : '']);
      } else if (R === 'in' || R === 'refund' || R === 'out' || R === 'outexp' || R === 'contra') {
        var amt = R === 'out' || R === 'outexp' ? (d.lines || []).reduce(function (s, l) { return s + num(l.amt); }, 0) : num(d.amount);
        money.push([NS.fmtDate(d.date), R === 'contra' ? (d.to === 'bank' ? 'Cash deposited in bank' : 'Cash withdrawn from bank') : R === 'in' ? 'Money in' : R === 'refund' ? 'Refund paid' : R === 'out' ? 'Paid to supplier' : 'Expense paid',
          d.no || '', b.name || '', d.mode || '', n2(amt), n2(R === 'in' ? num(d.tds) : r2(amt * num(d.tdsRate) / 100)), (d.alloc || []).map(function (x) { return x.no || ''; }).filter(Boolean).join(', ')]);
      }
    });
    sales.push(['', '', '', 'Total', '', '', n2(tot.s[0]), n2(tot.s[1]), n2(tot.s[2]), n2(tot.s[3]), '', n2(tot.s[4]), '']);
    buys.push(['', '', '', 'Total (bills)', '', n2(tot.p[0]), n2(tot.p[1]), n2(tot.p[2]), n2(tot.p[3]), n2(tot.p[4]), '', '']);
    var hs = [['HSN/SAC', 'Description', 'Unit', 'GST %', 'Quantity', 'Taxable value', 'Tax']];
    Object.keys(hsn).sort().forEach(function (k) { var h = hsn[k]; hs.push([h.hsn, h.desc, h.unit, String(h.rate), NS.qty(h.qty), n2(h.val), n2(h.val * h.rate / 100)]); });
    var upto = docs.filter(function (d) { return d.date <= to; }), ps = B.parties(upto, biz);
    var bal = [['Party', 'Phone', 'They owe us', 'We owe them', 'Last entry']];
    Object.keys(ps).sort().forEach(function (k) { var p = ps[k]; if (Math.abs(p.bal) < 0.005) return; bal.push([p.name, p.phone || '', p.bal > 0 ? n2(p.bal) : '', p.bal < 0 ? n2(-p.bal) : '', NS.fmtDate(p.last)]); });
    return { sheets: [['Sales register', sales, [12, 16, 16, 28, 18, 10, 14, 12, 12, 12, 10, 14, 6]], ['Purchase register', buys, [12, 22, 16, 28, 18, 14, 12, 12, 12, 14, 10, 14]],
      ['Money in and out', money, [12, 24, 16, 28, 10, 14, 10, 24]], ['HSN summary of sales', hs, [10, 30, 8, 8, 10, 14, 12]], ['Party balances on ' + NS.fmtDate(to), bal, [30, 14, 14, 14, 12]]],
      n: { sales: sales.length - 2, buys: buys.length - 2, money: money.length - 1 }, docs: inP };
  }

  function readMe(biz, from, to, has) {
    return ['Accounts from Nivesh Sahayak', '', 'Business: ' + biz, 'Period: ' + NS.fmtDate(from) + ' to ' + NS.fmtDate(to), 'Made on: ' + NS.fmtDate(NS.today()), '',
      has.x ? 'registers-' + from + '-' + to + '.xlsx  Sales register, Purchase register, Money in and out, HSN summary of sales, Party balances. Credit notes and purchase returns are shown with a minus sign.' : '',
      has.t ? 'tally-masters.xml  TallyPrime: Import > Masters first (party and account ledgers).' : '',
      has.t ? 'tally-vouchers.xml  then Import > Transactions (sales, purchases, notes, receipts, payments). Try it on a backup company first.' : '',
      has.d ? 'data-for-nivesh-sahayak.json  The same documents and the business, party and item lists as a Nivesh Sahayak backup file. Open https://my.niveshsahayak.in/ , press "Restore from a backup file" and pick it to see every bill.' + (has.lock ? ' It is locked with a password: ask your client for it.' : '') : '',
      '', 'All amounts in rupees. Figures are worked out from the saved documents; please check them before filing any return.', 'Made free at https://my.niveshsahayak.in/'].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\r\n');
  }

  /* ---------- the box ---------- */
  function fy(d) { var y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return y; }
  function iso(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
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
  function open() {
    var d = $('#ns-acct');
    if (!d) {
      d = NS.el('dialog', { id: 'ns-acct', 'aria-labelledby': 'ns-acct-h' });
      document.body.appendChild(d);
    }
    var lm = period('lm');
    d.innerHTML = '<div class="dlg-h"><h2 id="ns-acct-h">' + esc(T('b3.ac.t')) + '</h2><form method="dialog"><button class="btn sm">' + esc(T('close')) + '</button></form></div><div class="dlg-b ac-b">' +
      '<p class="soft">' + esc(T('b3.ac.intro')) + '</p>' +
      '<label for="ac-biz">' + esc(T('b3.ac.biz')) + '</label><select id="ac-biz"><option value="">' + esc(T('md.loading')) + '</option></select>' +
      '<label for="ac-per">' + esc(T('b3.ac.per')) + '</label><select id="ac-per">' + ['lm', 'tm', 'lq', 'tq', 'ly', 'ty', 'own'].map(function (p) { return '<option value="' + p + '">' + esc(T('b3.ac.p.' + p)) + '</option>'; }).join('') + '</select>' +
      '<div class="ac-dates"><span><label for="ac-from">' + esc(T('b3.ac.from')) + '</label><input id="ac-from" type="date" value="' + lm[0] + '"></span><span><label for="ac-to">' + esc(T('b3.ac.to')) + '</label><input id="ac-to" type="date" value="' + lm[1] + '"></span></div>' +
      '<fieldset class="ac-w"><legend>' + esc(T('b3.ac.what')) + '</legend>' +
      '<label class="chk"><input type="checkbox" id="ac-x" checked> ' + esc(T('b3.ac.x')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="ac-t" checked> ' + esc(T('b3.ac.tally')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="ac-d" checked> ' + esc(T('b3.ac.data')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="ac-l"> ' + esc(T('b3.ac.lock')) + '</label></fieldset>' +
      '<div class="btns"><button type="button" class="btn primary" id="ac-go">' + esc(T('b3.ac.go')) + '</button></div><div id="ac-out" aria-live="polite"></div></div>';
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    var per = $('#ac-per', d);
    per.addEventListener('change', function () { if (per.value === 'own') return; var p = period(per.value); $('#ac-from', d).value = p[0]; $('#ac-to', d).value = p[1]; });
    ['#ac-from', '#ac-to'].forEach(function (s) { $(s, d).addEventListener('input', function () { per.value = 'own'; }); });
    Promise.all([NSStore.list('biz'), NSStore.list('doc'), NSStore.meta('settings')]).then(function (r) {
      var seen = {}, list = [];
      r[0].concat(r[1].map(function (x) { return x.seller || {}; })).forEach(function (b) { var n = b && b.name && b.name.trim(); if (n && !seen[B.key(n)]) { seen[B.key(n)] = 1; list.push(n); } });
      var def = r[2] && r[2].defBiz && r[0].filter(function (b) { return b.id === r[2].defBiz; })[0];
      $('#ac-biz', d).innerHTML = list.length ? list.map(function (n) { return '<option' + (def && def.name === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') : '<option value="">' + esc(T('b3.ac.nobiz')) + '</option>';
    });
    $('#ac-go', d).addEventListener('click', function () { make(d); });
  }

  function make(d) {
    var out = $('#ac-out', d), biz = $('#ac-biz', d).value, from = $('#ac-from', d).value, to = $('#ac-to', d).value;
    var has = { x: $('#ac-x', d).checked, t: $('#ac-t', d).checked, d: $('#ac-d', d).checked, lock: $('#ac-l', d).checked };
    if (!biz) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.nobiz')) + '</p>'; return; }
    if (!from || !to || from > to) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.baddate')) + '</p>'; return; }
    if (!has.x && !has.t && !has.d) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.none')) + '</p>'; return; }
    out.innerHTML = '<p class="soft">' + esc(T('b3.ac.making')) + '</p>';
    var pw = has.d && has.lock ? NS.askPassword('set') : Promise.resolve('');
    pw.then(function (pass) {
      if (pass === null) { out.innerHTML = ''; return; }
      return Promise.all(['doc', 'biz', 'party', 'item'].map(function (s) { return NSStore.list(s); }).concat([NSStore.meta('groups')])).then(function (r) {
        var docs = r[0], R = registers(docs, biz, from, to), files = [], jobs = [];
        if (!R.docs.length) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.empty')) + '</p>'; return; }
        files.push(['READ-ME.txt', readMe(biz, from, to, has)]);
        if (has.x) jobs.push(NS.xlsx.write(R.sheets).arrayBuffer().then(function (b) { files.push(['registers-' + from + '-' + to + '.xlsx', new Uint8Array(b)]); }));
        if (has.t) {
          if (NS.tally.useMasters) NS.tally.useMasters(r[2], r[3], r[4]);   /* party groups and stock items in the masters file */
          var tv = NS.tally.fromDocs(docs, biz, from, to, { sale: true, buy: true, money: true });
          if (tv.vouchers && tv.vouchers.length) { files.push(['tally-masters.xml', NS.tally.mastersXml(tv.vouchers)]); files.push(['tally-vouchers.xml', NS.tally.vouchersXml(tv.vouchers)]); }
        }
        if (has.d) {
          var k = B.key(biz), bk = { app: 'Nivesh Sahayak', kind: 'backup', version: 1, saved: new Date().toISOString(), part: { biz: biz, from: from, to: to },
            data: { biz: r[1].filter(function (b) { return B.key(b.name) === k; }), party: r[2], item: r[3], doc: docs.filter(function (x) { return B.key(x.seller && x.seller.name) === k && x.date >= from && x.date <= to; }), meta: [] } };
          jobs.push((pass ? NS.lockData(bk, pass) : Promise.resolve(bk)).then(function (f) { files.push(['data-for-nivesh-sahayak.json', JSON.stringify(f, null, pass ? 0 : 1)]); }));
        }
        return Promise.all(jobs).then(function () {
          var name = ('accounts-' + biz + '-' + from + '-to-' + to).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 90) + '.zip';
          var file = new File([zip(files)], name, { type: 'application/zip' });
          out.innerHTML = '<p class="note ok-note">' + esc(T('b3.ac.ready', { s: R.n.sales, p: R.n.buys, m: R.n.money })) + '</p>' +
            '<div class="btns">' + (navigator.canShare && navigator.canShare({ files: [file] }) ? '<button type="button" class="btn primary" data-ac-share>' + esc(T('b3.ac.share')) + '</button>' : '') +
            '<button type="button" class="btn" data-ac-save>' + esc(T('b3.ac.save')) + '</button></div><p class="soft">' + esc(T('b3.ac.how')) + '</p>';
          var sh = $('[data-ac-share]', out);
          if (sh) sh.addEventListener('click', function () { navigator.share({ files: [file], title: name, text: T('b3.ac.msg', { biz: biz, from: NS.fmtDate(from), to: NS.fmtDate(to) }) }).catch(function () {}); });
          $('[data-ac-save]', out).addEventListener('click', function () { NS.saveFile(file, name); NS.toast(T('pdf.saved', { file: name })); });
        });
      });
    }).catch(function (e) { out.innerHTML = '<p class="note bad">' + esc(T('b3.ac.fail')) + ' ' + esc(e && e.message || '') + '</p>'; });
  }

  NS.acct = { open: open, registers: registers, zip: zip, period: period };
})();
