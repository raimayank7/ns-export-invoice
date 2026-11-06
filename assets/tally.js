/* NS Tally: saved documents (or an Excel register) become TallyPrime import files: ledgers (All Masters) and vouchers.
   The entries come from NSBooks.postings (books.js), the same double entry the Nivesh Sahayak App shows, so Tally gets
   exactly our books. Only tags shown in TallyPrime's own help are used (help.tallysolutions.com: "Sample XML" and
   "XML Integration", read 5 Nov 2026): ENVELOPE / HEADER / TALLYREQUEST Import Data / IMPORTDATA / REQUESTDESC / REPORTNAME
   (All Masters | Vouchers) / REQUESTDATA / TALLYMESSAGE; LEDGER NAME, PARENT, MAILINGNAME.LIST, ADDRESS.LIST, PINCODE,
   COUNTRYNAME, LEDSTATENAME, EMAIL, LEDGERPHONE; VOUCHER VCHTYPE ACTION OBJVIEW, DATE yyyymmdd, VOUCHERTYPENAME, VOUCHERNUMBER,
   PERSISTEDVIEW, ISINVOICE, NARRATION, ALLLEDGERENTRIES.LIST (LEDGERNAME, ISDEEMEDPOSITIVE, ISPARTYLEDGER, AMOUNT,
   BILLALLOCATIONS.LIST NAME / BILLTYPE / AMOUNT). Debit = ISDEEMEDPOSITIVE Yes with a minus amount, credit = No and plus.
   GST registration tags of a ledger are not in that help page, so GSTINs are not sent: the guide says how to add them.
   Groups (my.niveshsahayak.in › Groups): a party's own group becomes a Tally GROUP (PARENT Sundry Debtors / Sundry Creditors, or
   its top group for a sub-group) and the party ledger goes under it; items become STOCKITEM masters (BASEUNITS, a UNIT master per
   unit) under STOCKGROUP masters made from the item groups (empty PARENT = Primary). These master tags follow TallyPrime's
   usual XML masters but have not been tried in a real TallyPrime yet. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t, B = window.NSBooks;
  var LED = [['sales', 'Sales'], ['purchases', 'Purchase'], ['gst-out-cgst', 'Output CGST'], ['gst-out-sgst', 'Output SGST'], ['gst-out-utgst', 'Output UTGST'], ['gst-out-igst', 'Output IGST'],
    ['gst-in-cgst', 'Input CGST'], ['gst-in-sgst', 'Input SGST'], ['gst-in-igst', 'Input IGST'], ['gst-rcm-payable', 'GST Payable on Reverse Charge'], ['gst-adv', 'GST Paid on Advances'], ['round-off', 'Round Off'],
    ['cash', 'Cash'], ['bank', 'Bank'], ['tds-receivable', 'TDS Receivable'], ['tds-payable', 'TDS Payable']];
  /* Tally's own groups for the ledgers we may create */
  var GROUP = { sales: 'Sales Accounts', purchases: 'Purchase Accounts', 'round-off': 'Indirect Expenses', cash: 'Cash-in-Hand', bank: 'Bank Accounts', 'tds-receivable': 'Loans & Advances (Asset)' };
  var VT = { sale: 'Sales', sret: 'Credit Note', sdeb: 'Debit Note', buy: 'Purchase', pret: 'Debit Note', 'in': 'Receipt', refund: 'Payment', out: 'Payment', outexp: 'Payment' };
  var DEBTOR = { sale: 1, sret: 1, sdeb: 1, 'in': 1, refund: 1 };
  /* accounts of journal entries, capital and loan forms and the fixed assets register (cap:ramesh, od:hdfc loan, fa:machine...):
     Tally's own group and a clean ledger name (the name as typed, from typedNames). Drawings sit under Capital Account, as Tally users keep them. */
  var PFX = { 'cap:': 'Capital Account', 'drw:': 'Capital Account', 'loan:': 'Loans (Liability)', 'od:': 'Loans (Liability)', 'given:': 'Loans & Advances (Asset)',
    'fa:': 'Fixed Assets', 'inc:': 'Indirect Incomes', 'exp:': 'Indirect Expenses', 'ocl:': 'Provisions', 'oca:': 'Loans & Advances (Asset)' };
  var OTHER = { 'tcs-payable': ['TCS Payable', 'Duties & Taxes'], 'tcs-receivable': ['TCS Receivable', 'Loans & Advances (Asset)'], 'chq-in': ['Cheques in Hand', 'Current Assets'],
    'chq-out': ['Cheques Issued, Not Cleared', 'Current Liabilities'], 'gst-out-utgst': ['Output UTGST', 'Duties & Taxes'],
    pdd: ['Provision for Doubtful Debts', 'Sundry Debtors'],   /* WP-3: nets with the debtors */
    'gstcash-igst': ['GST Cash Ledger IGST', 'Current Assets'], 'gstcash-cgst': ['GST Cash Ledger CGST', 'Current Assets'], 'gstcash-sgst': ['GST Cash Ledger SGST', 'Current Assets'], 'gstcash-cess': ['GST Cash Ledger Cess', 'Current Assets'] };
  var box, names = {}, src = 'saved', sheetRows = null, parties = {}, M = { party: [], item: [], groups: null }, typed = {}, DX = null;
  /* expense heads marked Direct (My data › Settings › Final accounts, settings.tf.dx of the business; else tfcore.js defaults)
     go to Tally's own group Direct Expenses, which TallyPrime shows in the Trading Account; the rest stay Indirect Expenses */
  function direct(a) {
    var T = window.NSTF; if (!T || !T.defaultDirect) return false;
    if (DX && DX[a] != null) return !!DX[a];
    if (/^exp:(depreciation|interest|bank charges|loss on sale)/.test(a)) return false;
    return T.defaultDirect(a, typed[a] || a.slice(4));
  }

  function x(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function amt(v) { return (v < 0 ? '-' : '') + Math.abs(v).toFixed(2); }
  function ymd(iso) { return String(iso || '').replace(/-/g, '').slice(0, 8); }
  function title(s) { return String(s || '').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function fyStart() { var d = new Date(), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return y + '-04-01'; }
  function loadNames() { try { names = JSON.parse(localStorage.getItem('ns-tally-led') || '{}') || {}; } catch (e) { names = {}; } }
  function pfx(a) { return Object.keys(PFX).filter(function (x) { return String(a).indexOf(x) === 0; })[0]; }
  function ledName(a) {
    if (/^p:/.test(a)) return parties[a] ? parties[a].name : a.slice(2);
    var px = pfx(a);
    if (px) {
      var nm = String(typed[a] || title(a.slice(px.length))).trim().replace(/^./, function (c) { return c.toUpperCase(); });
      if (px === 'cap:') return /^capital$/i.test(nm) ? 'Capital Account' : nm + ' Capital A/c';
      if (px === 'drw:') return /^drawings?$/i.test(nm) ? 'Drawings' : nm + ' Drawings A/c';
      if (px === 'given:') return 'Loan to ' + nm;
      return nm;
    }
    if (OTHER[a] && !names[a]) return OTHER[a][0];
    var d = LED.filter(function (l) { return l[0] === a; })[0];
    return (names[a] || (d ? d[1] : a)).trim();
  }
  /* names as typed on journal lines, capital and loan forms, fixed assets and expenses, for accounts stored by key */
  function typedNames(docs) {
    var o = {};
    function put(k, v) { v = String(v || '').trim(); if (v && !o[k]) o[k] = v; }
    (docs || []).forEach(function (d) {
      if (d.type === 'jv') (d.lines || []).forEach(function (l) { if (l && l.a && l.a !== 'party') put(l.a, l.nm); });
      if (d.type === 'fa' && d.name) put('fa:' + B.key(d.name), d.name);
      if (d.type === 'exp' && d.cat) { var eh = typeof NSHeads !== 'undefined' && NSHeads.find(d.cat); put('exp:' + B.key(d.cat), eh && !eh.custom ? eh.en : d.cat); }   /* English ledger name, never a code or another language */
      if (d.type === 'voucher') (d.lines || []).forEach(function (l) { if (l && l.head) put('exp:' + B.key(l.head), l.head); });
      if (d.type === 'oinc' && d.head) put('inc:' + B.key(d.head), d.head);   /* other income received (Accounts coverage WP-2) */
      if (d.type === 'pdd') put('exp:provision for doubtful debts', 'Provision for Doubtful Debts (P&L)');   /* WP-3: Tally names are not case-sensitive, so the charge needs its own name next to the provision ledger */
      if (d.type === 'wo' || d.type === 'pdd' || d.disc) { put('exp:discount allowed', 'Discount Allowed'); put('inc:discount received', 'Discount Received'); put('exp:bad debts', 'Bad Debts'); put('inc:balances written back', 'Balances Written Back'); }
      if (d.type === 'taxpay' || d.type === 'gstset') { put('exp:interest on late payment of tax', 'Interest on late payment of tax'); put('exp:late fee and penalty', 'Late fee and penalty'); put('oca:advance income tax', 'Advance income tax'); }   /* WP-4 */
    });
    return o;
  }
  /* the party's own group, when it has one (else the debtor/creditor side the documents show) */
  function partyRec(a) { return M.party.filter(function (q) { return 'p:' + B.key(q.name) === a; })[0]; }
  function ownGroup(a) { var q = partyRec(a), g = q && NS.partyGroup && NS.partyGroup(q, M.groups); return g && !/^(debtors|creditors)$/.test(g.id) ? g : null; }
  function tallyTop(id) { return id === 'creditors' ? 'Sundry Creditors' : 'Sundry Debtors'; }
  function ledGroup(a) {
    if (/^p:/.test(a)) { var og = ownGroup(a); return og ? og.name : parties[a] && parties[a].debtor ? 'Sundry Debtors' : 'Sundry Creditors'; }
    var px = pfx(a);
    if (px === 'exp:' && direct(a)) return 'Direct Expenses';
    if (px === 'inc:' && window.NSHeads) { var hh = NSHeads.find(typed[a] || a); if (hh && hh.t === 'dinc') return 'Direct Incomes'; }   /* heads list (heads.js) */
    if (px === 'od:' && /\b(od|o\/d|overdraft|cc|cash credit)\b/i.test(typed[a] || a.slice(3))) return 'Bank OD A/c';
    if (px) return PFX[px];
    if (OTHER[a]) return OTHER[a][1];
    if (/^gst-|tds-payable/.test(a)) return 'Duties & Taxes';
    if (a === 'sales-return') return 'Sales Accounts';
    if (a === 'purchase-return') return 'Purchase Accounts';
    return GROUP[a] || 'Suspense A/c';
  }
  /* Tally refuses Cash and Bank ledgers in a Journal by default: an entry that moves money is a Receipt or a Payment, money only = Contra */
  function moneyType(lines) {
    var m = lines.filter(function (l) { return l.a === 'cash' || l.a === 'bank'; });
    if (!m.length) return 'Journal';
    if (m.length === lines.length) return 'Contra';
    return m.reduce(function (s, l) { return s + l.v; }, 0) > 0 ? 'Receipt' : 'Payment';
  }

  /* ---------- vouchers from saved documents ---------- */
  function fromDocs(docs, biz, from, to, want) {
    var out = [], skipped = 0;
    typed = typedNames(docs);
    B.inBooks(docs, biz).forEach(function (d) {
      var R = B.role(d);
      if (!(d.date >= from && d.date <= to)) return;
      if (R === 'ob' || R === 'exp' && !want.buy) { if (R === 'ob') skipped++; return; }
      var g = /^(sale|sret|sdeb)$/.test(R) ? 'sale' : /^(buy|pret|exp)$/.test(R) ? 'buy' : 'money';
      if (!want[g]) return;
      var nm = B.partyName(d), pk = 'p:' + B.key(nm);
      var lines = B.postings(d).map(function (l) {
        var a = l.a === 'sales-return' ? 'sales' : l.a === 'purchase-return' ? 'purchases' : l.a;
        if (a === 'p:cash-customer') a = 'p:cash customer';
        if (a === 'p:unknown') a = 'p:unknown payee';
        return { a: a, v: r2(l.dr - l.cr) };
      });
      if (nm) parties[pk] = Object.assign(parties[pk] || {}, { name: nm.trim(), debtor: !!DEBTOR[R], from: d.buyer });
      if (lines.some(function (l) { return l.a === 'p:cash customer'; })) parties['p:cash customer'] = { name: 'Cash Customer', debtor: true };
      if (lines.some(function (l) { return l.a === 'p:unknown payee'; })) parties['p:unknown payee'] = { name: 'Unknown Payee', debtor: false };
      var nl = net(lines);
      var type = d.type === 'note' ? (d.kind === 'debit' ? 'Debit Note' : 'Credit Note') : VT[R] || moneyType(nl);
      /* a fixed asset's number is the SUPPLIER's bill no.: it goes in the narration, Tally numbers the payment itself (round C) */
      var isFa = d.type === 'fa' && d.kind !== 'sale';
      out.push({ type: type, no: isFa ? '' : d.no || '', date: d.date, party: nm || '', lines: nl, bill: billInfo(d, R), narr: isFa && d.no ? (narration(d, R) + '; supplier bill ' + d.no).slice(0, 500) : narration(d, R) });
    });
    var r = { vouchers: out, skipped: skipped };
    if (want.stk) {   /* in date order with the other vouchers (production on a day before the sale of what it made) */
      var sj = stockJournals(docs, biz, from, to); r.nostk = sj.none;
      r.vouchers = out.concat(sj.vouchers).map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0].date.localeCompare(b[0].date) || a[1] - b[1]; }).map(function (p) { return p[0]; });
    }
    return r;
  }

  /* ---------- production, job work and godown transfers: Stock Journal (TallyPrime's own voucher type; a Manufacturing Journal is
     one the user makes in Tally). Source items = INVENTORYENTRIESOUT.LIST, destination = INVENTORYENTRIESIN.LIST, each with its godown
     (Main Location = our main godown); goods at a job worker sit in godown "JW <worker>". Made goods carry the production entry's
     cost, goods used or moved our average cost on that day. Needs stockcore.js (+ mfgcore.js) on the page, else nothing is made. ---------- */
  var MAINGD = 'Main Location';
  function gdName(g) { g = String(g || '').trim(); return !g || /^main$/i.test(g) ? MAINGD : g; }
  function stockJournals(docs, biz, from, to) {
    var S = window.NSStock, X = window.NSMfg, out = [];
    if (!S || !S.moves) return { vouchers: [], none: true };
    var b = B.key(biz), items = M.item || [], IM = {};
    items.forEach(function (m) { if (m && m.desc) IM[B.key(m.desc)] = m; });
    var mine = (docs || []).filter(function (d) { return d && (!b || B.key(d.seller && d.seller.name) === b); });
    /* average cost of each item on a day, from every movement with a cost (purchases, opening stock, production) */
    var costs = {};
    S.moves(mine, items, biz).forEach(function (x) { if (x.rate != null && x.qty > 0) (costs[x.k] = costs[x.k] || []).push(x); });
    function avg(k, date) { var q = 0, v = 0; (costs[k] || []).forEach(function (x) { if (x.date <= date) { q += x.qty; v += x.qty * x.rate; } }); return q > 0 ? r2(v / q) : 0; }
    var stk = mine.filter(function (d) { return d.type === 'stk' && /^(make|jobout|jobin|move)$/.test(d.kind) && d.date >= from && d.date <= to; });
    var flat = X && X.expand ? X.expand(stk, items) : stk, by = {}, order = [];
    flat.forEach(function (r) { var id = r.id || r.no + r.date; if (!by[id]) { by[id] = { d: r, recs: [] }; order.push(id); } by[id].recs.push(r); });
    order.forEach(function (id) {
      var g = by[id], d = g.d, inv = [];
      function add(dir, l, gd, rate) {
        var nm = String(l.desc || '').trim(), q = Math.abs(num(l.qty)), k = B.key(nm), m = IM[k];
        if (!nm || !q || m && m.kind === 'service') return;
        var rt = rate != null && rate !== '' && num(rate) ? num(rate) : avg(k, d.date);
        inv.push({ dir: dir, item: m ? String(m.desc).trim() : nm, unit: String(m && m.unit || l.unit || 'Nos').trim() || 'Nos', qty: q, rate: rt, amt: r2(q * rt), gd: gdName(gd) });
      }
      g.recs.forEach(function (r) {
        if (r.kind === 'make') { (r.lines || []).forEach(function (l) { add('out', l, r.gd); }); if (r.out && r.out.desc) add('in', r.out, r.gd, r.out.rate); }
        else if (r.kind === 'move') (r.lines || []).forEach(function (l) { add('out', l, r.from); add('in', l, r.to); });
        else if (r.kind === 'adj' && r._job) (r.lines || []).forEach(function (l) { add('out', l, r.gd); });   /* lost at the job worker */
      });
      if (!inv.length) return;
      var w = d.worker && d.worker.name ? String(d.worker.name).trim() : '';
      var nar = d.kind === 'make' ? 'Production' : d.kind === 'jobout' ? 'Sent for job work' + (w ? ' to ' + w : '') + (d.dc ? ', challan ' + d.dc : '')
        : d.kind === 'jobin' ? 'Received back from job work' + (w ? ' (' + w + ')' : '') + (d.wdc ? ', challan ' + d.wdc : '') : 'Stock transfer';
      /* the extra cost typed on a production entry is inside the made goods' value: the narration says so, so the difference
         Tally shows between goods used and goods made is explained (round C) */
      var ext = d.kind === 'make' && num(d.extra) ? 'additional cost Rs ' + r2(num(d.extra)) + ' (labour, power and other costs typed on the production entry) included in the value of goods made' : '';
      out.push({ type: 'Stock Journal', no: d.no || '', date: d.date, party: '', lines: [], inv: inv, narr: [nar, ext, d.narr || d.note || ''].filter(Boolean).join('; ').slice(0, 500) });
    });
    return { vouchers: out, none: false };
  }
  function net(lines) {
    var m = {}, order = [];
    lines.forEach(function (l) { if (!(l.a in m)) { m[l.a] = 0; order.push(l.a); } m[l.a] = r2(m[l.a] + l.v); });
    return order.filter(function (a) { return m[a]; }).map(function (a) { return { a: a, v: m[a] }; });
  }
  function billInfo(d, R) {
    if (/^(sale|sdeb|buy)$/.test(R) && d.type !== 'note' || R === 'sdeb') return [{ type: 'New Ref', name: d.no }];
    if (d.type === 'note' && R === 'buy') return [{ type: (d.orig && d.orig.no) ? 'Agst Ref' : 'On Account', name: (d.orig && d.orig.no) || '' }];
    if (/^(sret|pret)$/.test(R)) return [{ type: (d.orig && d.orig.no) ? 'Agst Ref' : 'On Account', name: (d.orig && d.orig.no) || '' }];
    if (R === 'wo') return (d.alloc || []).map(function (a) { return { type: 'Agst Ref', name: a.no, amt: num(a.amt) }; });   /* write-off of a bill (WP-3) */
    if (R === 'in' || R === 'out') return (d.alloc && d.alloc.length ? d.alloc.map(function (a) { return { type: 'Agst Ref', name: a.no, amt: num(a.amt) }; }) : []).concat([{ type: 'On Account', name: '', rest: true }]);
    return null;
  }
  function narration(d, R) {
    var bits = [];
    if (d.ref) bits.push(d.ref);
    if (/^(in|out|refund)$/.test(R) && d.mode) bits.push('By ' + d.mode.toUpperCase() + (d.refNo ? ' ' + d.refNo : ''));
    if (d.orig && d.orig.no) bits.push('Against invoice ' + d.orig.no);
    if (d.irn && d.irn.irn) bits.push('IRN ' + d.irn.irn);
    if (d.narr) bits.push(d.narr);
    if (d.gstAdv && d.type === 'receipt' && d.kind === 'adv') bits.push('Advance with GST ' + num(d.rate) + '% (receipt voucher)');
    if (d.type === 'fa') bits.push((d.kind === 'sale' ? 'Fixed asset sold: ' : 'Fixed asset bought: ') + (d.name || ''));
    if (R === 'exp' || R === 'outexp') bits.push((d.lines || []).map(function (l) { return l.head || l.desc; }).filter(Boolean).join(', ') || d.cat || '');
    return bits.filter(Boolean).join('; ').slice(0, 500);
  }

  /* ---------- vouchers from an Excel register (our template: one row per voucher) ---------- */
  var COLS = [['date', 'Date', '05/11/2026'], ['type', 'Voucher Type', 'Sales'], ['no', 'Voucher No', 'INV/26-27/101'], ['party', 'Party', 'Shree Traders'], ['state', 'Party State', 'Maharashtra'],
    ['taxable', 'Taxable Value', '37400'], ['cgst', 'CGST', '0'], ['sgst', 'SGST', '0'], ['igst', 'IGST', '1870'], ['round', 'Round Off', '0'], ['total', 'Total', '39270'],
    ['mode', 'Cash or Bank', ''], ['against', 'Against Bill No', ''], ['narr', 'Narration', '']];
  function fromSheet(rows) {
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var at = rows.findIndex(function (r) { return r.some(function (c) { return norm(c) === 'vouchertype'; }); });
    if (at < 0) return { err: t('ty.nohead') };
    var map = {}; rows[at].forEach(function (h, i) { COLS.forEach(function (c) { if (norm(h) === norm(c[1])) map[c[0]] = i; }); });
    var g = function (r, k) { return map[k] == null ? '' : String(r[map[k]] || '').trim(); };
    var out = [], bad = [];
    rows.slice(at + 1).forEach(function (r, i) {
      var line = at + i + 2, ty = g(r, 'type').toLowerCase().replace(/\s+/g, ' '), party = g(r, 'party');
      if (!ty) return;
      var date = isoDate(g(r, 'date'));
      if (!date) { bad.push(t('bk.date', { r: line })); return; }
      var tx = num(g(r, 'taxable')), c = num(g(r, 'cgst')), s = num(g(r, 'sgst')), ig = num(g(r, 'igst')), ro = num(g(r, 'round'));
      var total = g(r, 'total') === '' ? r2(tx + c + s + ig + ro) : num(g(r, 'total')), bank = /bank|upi|cheque|neft|rtgs|imps|card/i.test(g(r, 'mode')) ? 'bank' : 'cash';
      var pk = 'p:' + B.key(party || 'cash customer'), L = [], V = { sales: 'Sales', purchase: 'Purchase', 'credit note': 'Credit Note', 'debit note': 'Debit Note', receipt: 'Receipt', payment: 'Payment' }[ty];
      if (!V) { bad.push(t('ty.type', { r: line, v: g(r, 'type') })); return; }
      if (V === 'Receipt' || V === 'Payment') {
        var a = num(g(r, 'total')) || tx, k = V === 'Receipt' ? -1 : 1;
        L = [{ a: bank, v: r2(-k * a) }, { a: pk, v: r2(k * a) }];
        parties[pk] = parties[pk] || { name: party || 'Cash Customer', debtor: V === 'Receipt' };
      } else {
        /* a sale: party Dr total, sales and output tax Cr; a purchase the other way; a credit note (or a debit note on a purchase) reverses it */
        var buy = V === 'Purchase' || V === 'Debit Note' && /purchase/i.test(g(r, 'narr')), rev = V === 'Credit Note' || V === 'Debit Note' && buy;
        var k2 = (buy ? -1 : 1) * (rev ? -1 : 1), p = buy ? 'gst-in-' : 'gst-out-';
        L = [{ a: pk, v: r2(k2 * total) }, { a: buy ? 'purchases' : 'sales', v: r2(-k2 * tx) }, { a: p + 'cgst', v: r2(-k2 * c) }, { a: p + 'sgst', v: r2(-k2 * s) }, { a: p + 'igst', v: r2(-k2 * ig) }, { a: 'round-off', v: r2(-k2 * ro) }];
        parties[pk] = parties[pk] || { name: party || 'Cash Customer', debtor: !buy };
      }
      var sum = r2(L.reduce(function (s0, l) { return s0 + l.v; }, 0));
      if (Math.abs(sum) > 0.01) { bad.push(t('ty.unbal', { r: line, v: NS.money(Math.abs(sum)) })); return; }
      var ag = g(r, 'against');
      out.push({ type: V, no: g(r, 'no'), date: date, party: party, lines: net(L), narr: g(r, 'narr'),
        bill: /Sales|Purchase/.test(V) ? [{ type: 'New Ref', name: g(r, 'no') }] : ag ? [{ type: 'Agst Ref', name: ag }] : [{ type: 'On Account', name: '' }] });
    });
    return { vouchers: out, bad: bad };
  }
  function isoDate(v) {
    var m; v = String(v || '').trim();
    if (/^\d{5}(\.\d+)?$/.test(v)) return NS.xlsx.serialDate(v);
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    if ((m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return '';
  }

  /* ---------- the XML ---------- */
  function envelope(report, body) {
    return '<ENVELOPE>\n<HEADER>\n <TALLYREQUEST>Import Data</TALLYREQUEST>\n</HEADER>\n<BODY>\n<IMPORTDATA>\n <REQUESTDESC>\n  <REPORTNAME>' + report + '</REPORTNAME>\n </REQUESTDESC>\n <REQUESTDATA>\n  <TALLYMESSAGE xmlns:UDF="TallyUDF">\n' +
      body + '  </TALLYMESSAGE>\n </REQUESTDATA>\n</IMPORTDATA>\n</BODY>\n</ENVELOPE>\n';
  }
  /* GROUP masters for the party groups used, parents first */
  function groupsXml(order) {
    if (!NS.groupsOf) return '';
    var all = NS.groupsOf(M.groups, 'party'), seen = {}, out = [];
    var byId = function (id) { return all.filter(function (g) { return g.id === id; })[0]; };
    function add(g) {
      if (!g || g.builtin || seen[g.id]) return; seen[g.id] = 1;
      var up = byId(g.under);
      if (up && !up.builtin) add(up);
      out.push('   <GROUP NAME="' + x(g.name) + '" ACTION="Create">\n    <NAME>' + x(g.name) + '</NAME>\n    <PARENT>' + x(up && !up.builtin ? up.name : tallyTop(NS.partyGroup({ group: g.id }, M.groups).top)) + '</PARENT>\n   </GROUP>\n');
    }
    order.forEach(function (a) { if (/^p:/.test(a)) { var og = ownGroup(a); if (og) add(byId(og.id)); } });
    return out.join('');
  }
  /* stock groups, units and stock items (every saved item) */
  function stockXml() {
    if (!M.item.length || !NS.itemGroup) return '';
    var all = NS.groupsOf(M.groups, 'item'), seen = {}, units = {}, out = [];
    var byId = function (id) { return all.filter(function (g) { return g.id === id; })[0]; };
    function grp(id) {
      var g = byId(id); if (!g || seen[g.id]) return; seen[g.id] = 1;
      var up = g.under && byId(g.under); if (up) grp(up.id);
      out.push('   <STOCKGROUP NAME="' + x(g.name) + '" ACTION="Create">\n    <NAME>' + x(g.name) + '</NAME>\n    <PARENT>' + (up ? x(up.name) : '') + '</PARENT>\n   </STOCKGROUP>\n');
    }
    var unit = function (it) { return String(it.unit || 'Nos').trim() || 'Nos'; };
    M.item.forEach(function (it) { var g = NS.itemGroup(it, M.groups); if (g.id) grp(g.id); units[unit(it)] = 1; });
    Object.keys(units).forEach(function (u) { out.push('   <UNIT NAME="' + x(u) + '" ACTION="Create">\n    <NAME>' + x(u) + '</NAME>\n    <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>\n   </UNIT>\n'); });
    M.item.forEach(function (it) {
      var nm = String(it.desc || '').trim(), g = NS.itemGroup(it, M.groups); if (!nm) return;
      out.push('   <STOCKITEM NAME="' + x(nm) + '" ACTION="Create">\n    <NAME>' + x(nm) + '</NAME>\n    <PARENT>' + x(g.name) + '</PARENT>\n    <BASEUNITS>' + x(unit(it)) + '</BASEUNITS>\n   </STOCKITEM>\n');
    });
    return out.join('');
  }
  function mastersXml(vs) {
    var used = {}, order = [];
    vs.forEach(function (v) { v.lines.forEach(function (l) { if (!used[l.a]) { used[l.a] = 1; order.push(l.a); } }); });
    var skipOwn = $('#ty-own', box) && $('#ty-own', box).checked, stock = $('#ty-stock', box) ? $('#ty-stock', box).checked : true;
    var gds = {}; vs.forEach(function (v) { (v.inv || []).forEach(function (e) { if (e.gd !== MAINGD) gds[e.gd] = 1; }); });
    var gdXml = Object.keys(gds).map(function (g) { return '   <GODOWN NAME="' + x(g) + '" ACTION="Create">\n    <NAME>' + x(g) + '</NAME>\n    <PARENT></PARENT>\n   </GODOWN>\n'; }).join('');
    return envelope('All Masters', groupsXml(order) + (stock || gdXml ? stockXml() : '') + gdXml + order.filter(function (a) { return !(skipOwn && (a === 'cash' || a === 'bank' && String(names.bank || '').trim() && String(names.bank).trim() !== 'Bank')); })   /* a new Tally company has Cash but no Bank: Bank is made unless it is mapped to the user's own bank ledger (round C) */.map(function (a) {
      var p = parties[a], f = p && p.from || {}, addr = String(f.addr || '').split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (f.city && addr.join(' ').toLowerCase().indexOf(String(f.city).toLowerCase()) < 0) addr.push(f.city);
      return '   <LEDGER NAME="' + x(ledName(a)) + '" ACTION="Create">\n    <NAME>' + x(ledName(a)) + '</NAME>\n    <PARENT>' + x(ledGroup(a)) + '</PARENT>\n' +
        (p && p.from ? '    <MAILINGNAME.LIST TYPE="String">\n     <MAILINGNAME>' + x(ledName(a)) + '</MAILINGNAME>\n    </MAILINGNAME.LIST>\n' +
          (addr.length ? '    <ADDRESS.LIST TYPE="String">\n' + addr.slice(0, 5).map(function (s) { return '     <ADDRESS>' + x(s) + '</ADDRESS>\n'; }).join('') + '    </ADDRESS.LIST>\n' : '') +
          (f.pin ? '    <PINCODE>' + x(f.pin) + '</PINCODE>\n' : '') + '    <COUNTRYNAME>' + (f.state === '96' ? '' : 'India') + '</COUNTRYNAME>\n' +
          (f.state && f.state !== '96' ? '    <LEDSTATENAME>' + x(NS.stateName(f.state)) + '</LEDSTATENAME>\n' : '') +
          (f.phone ? '    <LEDGERPHONE>' + x(f.phone) + '</LEDGERPHONE>\n' : '') : '') +
        '   </LEDGER>\n';
    }).join(''));
  }
  function vouchersXml(vs) {
    var bills = $('#ty-bills', box) ? $('#ty-bills', box).checked : true;   /* outside the Tally page (acct.js): bill-wise on, as the page's default */
    return envelope('Vouchers', vs.map(function (v) {
      var party = 'p:' + B.key(v.party || 'cash customer');
      if (v.inv) return stockVoucher(v);
      return '   <VOUCHER VCHTYPE="' + x(v.type) + '" ACTION="Create" OBJVIEW="Accounting Voucher View">\n    <DATE>' + ymd(v.date) + '</DATE>\n    <VOUCHERTYPENAME>' + x(v.type) + '</VOUCHERTYPENAME>\n' +
        (v.no ? '    <VOUCHERNUMBER>' + x(v.no) + '</VOUCHERNUMBER>\n' : '') + '    <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n    <ISINVOICE>No</ISINVOICE>\n' +
        (v.narr ? '    <NARRATION>' + x(v.narr) + '</NARRATION>\n' : '') +
        v.lines.map(function (l) {
          var dr = l.v > 0, isParty = /^p:/.test(l.a), b = '';
          if (bills && isParty && v.bill && l.a === party) {
            var left = Math.abs(l.v);
            b = v.bill.map(function (bi) {
              var a = bi.rest ? left : bi.amt != null ? Math.min(bi.amt, left) : left;
              left = r2(left - a);
              return a > 0 ? '     <BILLALLOCATIONS.LIST>\n      <NAME>' + x(bi.name) + '</NAME>\n      <BILLTYPE>' + bi.type + '</BILLTYPE>\n      <AMOUNT>' + amt(dr ? -a : a) + '</AMOUNT>\n     </BILLALLOCATIONS.LIST>\n' : '';
            }).join('');
          }
          return '    <ALLLEDGERENTRIES.LIST>\n     <LEDGERNAME>' + x(ledName(l.a)) + '</LEDGERNAME>\n     <ISDEEMEDPOSITIVE>' + (dr ? 'Yes' : 'No') + '</ISDEEMEDPOSITIVE>\n' +
            (isParty ? '     <ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n' : '') + '     <AMOUNT>' + amt(-l.v) + '</AMOUNT>\n' + b + '    </ALLLEDGERENTRIES.LIST>\n';
        }).join('') + '   </VOUCHER>\n';
    }).join(''));
  }

  function invXml(e) {
    var tag = e.dir === 'in' ? 'INVENTORYENTRIESIN.LIST' : 'INVENTORYENTRIESOUT.LIST', a = amt(e.dir === 'in' ? -e.amt : e.amt), q = ' ' + String(+e.qty.toFixed(3)) + ' ' + x(e.unit);
    return '    <' + tag + '>\n     <STOCKITEMNAME>' + x(e.item) + '</STOCKITEMNAME>\n     <ISDEEMEDPOSITIVE>' + (e.dir === 'in' ? 'Yes' : 'No') + '</ISDEEMEDPOSITIVE>\n' +
      (e.rate ? '     <RATE>' + e.rate.toFixed(2) + '/' + x(e.unit) + '</RATE>\n     <AMOUNT>' + a + '</AMOUNT>\n' : '') + '     <ACTUALQTY>' + q + '</ACTUALQTY>\n     <BILLEDQTY>' + q + '</BILLEDQTY>\n' +
      '     <BATCHALLOCATIONS.LIST>\n      <GODOWNNAME>' + x(e.gd) + '</GODOWNNAME>\n      <BATCHNAME>Primary Batch</BATCHNAME>\n' + (e.rate ? '      <AMOUNT>' + a + '</AMOUNT>\n' : '') +
      '      <ACTUALQTY>' + q + '</ACTUALQTY>\n      <BILLEDQTY>' + q + '</BILLEDQTY>\n     </BATCHALLOCATIONS.LIST>\n    </' + tag + '>\n';
  }
  function stockVoucher(v) {
    return '   <VOUCHER VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Consumption Voucher View">\n    <DATE>' + ymd(v.date) + '</DATE>\n    <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>\n' +
      (v.no ? '    <VOUCHERNUMBER>' + x(v.no) + '</VOUCHERNUMBER>\n' : '') + '    <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>\n' + (v.narr ? '    <NARRATION>' + x(v.narr) + '</NARRATION>\n' : '') +
      v.inv.filter(function (e) { return e.dir === 'in'; }).map(invXml).join('') + v.inv.filter(function (e) { return e.dir === 'out'; }).map(invXml).join('') + '   </VOUCHER>\n';
  }

  /* ---------- screen ---------- */
  function opt(v, l, cur) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }
  function render() {
    loadNames();
    box.innerHTML =
      '<div class="bk-steps">' +
      '<div class="card"><h3>1. ' + esc(t('ty.s1')) + '</h3><div class="fg">' +
        '<div class="f wide choice" role="radiogroup" aria-label="' + esc(t('ty.s1')) + '"><label class="chk"><input type="radio" name="ty-src" value="saved"' + (src === 'saved' ? ' checked' : '') + '> ' + esc(t('ty.src1')) + '</label>' +
        '<label class="chk"><input type="radio" name="ty-src" value="sheet"' + (src === 'sheet' ? ' checked' : '') + '> ' + esc(t('ty.src2')) + '</label></div>' +
        '<div class="f wide" data-src="saved"><label for="ty-biz">' + esc(t('bk.biz')) + '</label><select id="ty-biz"><option value="">' + esc(t('bk.loading')) + '</option></select></div>' +
        '<div class="f" data-src="saved"><label for="ty-from">' + esc(t('ty.from')) + '</label><input id="ty-from" type="date" value="' + fyStart() + '"></div>' +
        '<div class="f" data-src="saved"><label for="ty-to">' + esc(t('ty.to')) + '</label><input id="ty-to" type="date" value="' + NS.today() + '"></div>' +
        '<div class="f wide" data-src="saved"><label class="chk"><input id="ty-w-sale" type="checkbox" checked> ' + esc(t('ty.w.sale')) + '</label><label class="chk"><input id="ty-w-buy" type="checkbox" checked> ' + esc(t('ty.w.buy')) + '</label><label class="chk"><input id="ty-w-money" type="checkbox" checked> ' + esc(t('ty.w.money')) + '</label><label class="chk"><input id="ty-w-stk" type="checkbox" checked> ' + esc(t('fx.ty_stk')) + '</label></div>' +
        '<div class="f wide" data-src="sheet"><p class="hint">' + esc(t('ty.h.sheet')) + '</p><div class="row"><button type="button" class="btn" id="ty-tpl">' + esc(t('bk.tpl')) + '</button><label class="btn" for="ty-file">' + esc(t('bk.choose')) + '</label><input id="ty-file" type="file" accept=".xlsx,.csv,.txt" hidden></div></div>' +
      '</div></div>' +
      '<div class="card"><h3>2. ' + esc(t('ty.s2')) + '</h3><p class="hint">' + esc(t('ty.h.s2')) + '</p><details class="more"><summary>' + esc(t('ty.names')) + '</summary><div class="fg">' +
        LED.map(function (l) { return '<div class="f"><label for="ty-l-' + l[0] + '">' + esc(t('ty.l.' + l[0])) + '</label><input id="ty-l-' + l[0] + '" data-led="' + l[0] + '" dir="auto" placeholder="' + esc(l[1]) + '" value="' + esc(names[l[0]] || '') + '"></div>'; }).join('') +
      '</div></details>' +
      '<p><label class="chk"><input id="ty-bills" type="checkbox" checked> ' + esc(t('ty.bills')) + '</label></p>' +
      '<p><label class="chk"><input id="ty-own" type="checkbox" checked> ' + esc(t('ty.own')) + '</label></p>' +
      '<p><label class="chk"><input id="ty-stock" type="checkbox" checked> ' + esc(t('grp.ty_stock')) + '</label></p></div>' +
      '<div class="card"><h3>3. ' + esc(t('ty.s3')) + '</h3><p class="row"><button type="button" class="btn primary" id="ty-go">' + esc(t('ty.go')) + '</button></p><div class="bk-out" id="ty-out" aria-live="polite"></div></div>' +
      '</div>';
    $$('[name="ty-src"]', box).forEach(function (r) { r.addEventListener('change', function () { src = r.value; showSrc(); }); });
    $$('[data-led]', box).forEach(function (i) { i.addEventListener('input', function () { names[i.getAttribute('data-led')] = i.value; try { localStorage.setItem('ns-tally-led', JSON.stringify(names)); } catch (e) {} }); });
    $('#ty-tpl', box).addEventListener('click', template);
    $('#ty-file', box).addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = ''; if (!f) return;
      NS.xlsx.read(f).then(function (rows) { sheetRows = rows; $('#ty-out', box).innerHTML = '<p>' + esc(t('ty.loaded', { file: f.name, n: Math.max(0, rows.length - 1) })) + '</p>'; })
        .catch(function (err) { $('#ty-out', box).innerHTML = '<p class="warn">' + esc(t(err.message === 'xls' ? 'bk.xls' : 'bk.badfile')) + '</p>'; });
    });
    $('#ty-go', box).addEventListener('click', go);
    showSrc(); fillBiz();
  }
  function showSrc() { $$('[data-src]', box).forEach(function (f) { f.hidden = f.getAttribute('data-src') !== src; }); }
  function fillBiz() {
    NSStore.ready().then(function () { return NSStore.list('doc'); }).then(function (docs) {
      var seen = {}, list = [];
      docs.forEach(function (d) { var n = d.seller && d.seller.name && d.seller.name.trim(); if (n && B.role(d) && !seen[B.key(n)]) { seen[B.key(n)] = 1; list.push(n); } });
      list.sort();
      $('#ty-biz', box).innerHTML = list.length ? list.map(function (n) { return opt(n, n, ''); }).join('') : '<option value="">' + esc(t('ty.nodocs')) + '</option>';
    }).catch(function () {});
  }
  function template() {
    var blob = NS.xlsx.write([['Vouchers', [COLS.map(function (c) { return c[1]; }), COLS.map(function (c) { return c[2]; }),
      ['06/11/2026', 'Receipt', 'RC/26-27/014', 'Shree Traders', '', '', '', '', '', '', '20000', 'Bank', 'INV/26-27/101', 'Part payment by NEFT']]],
      ['How to fill', [['Column', 'What to type'], ['Date', 'DD/MM/YYYY'], ['Voucher Type', 'Sales, Purchase, Credit Note, Debit Note, Receipt or Payment'], ['Voucher No', 'Bill, note or receipt number'],
        ['Party', 'Customer or supplier name as you want it in Tally'], ['Taxable Value, CGST, SGST, IGST, Round Off', 'For Sales, Purchase and notes. Round Off can be minus.'],
        ['Total', 'Bill total; for Receipt and Payment the amount. Empty = worked out from the columns before it.'], ['Cash or Bank', 'For Receipt and Payment: Cash or Bank'],
        ['Against Bill No', 'For Receipt and Payment: the bill it settles (bill-wise).'], ['Narration', 'Any note. For a Debit Note on a purchase, write the word purchase here.'],
        ['One row', 'Each row is one voucher. Delete the example rows.']], [28, 100], 'wrap']]);
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tally-register-template.xlsx';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  var last = [];
  function go() {
    var out = $('#ty-out', box); parties = {};
    var p = src === 'sheet' ? (sheetRows ? Promise.resolve(fromSheet(sheetRows)) : Promise.resolve({ err: t('ty.nofile') }))
      : NSStore.list('doc').then(function (docs) {
        var w = { sale: $('#ty-w-sale', box).checked, buy: $('#ty-w-buy', box).checked, money: $('#ty-w-money', box).checked, stk: $('#ty-w-stk', box).checked };
        var from = $('#ty-from', box).value || '0000', to = $('#ty-to', box).value || '9999';
        return Promise.all([NSStore.list('party'), NSStore.list('item'), NSStore.meta('groups'), NS.loadCfg ? NS.loadCfg().catch(function () {}) : null]).then(function (L) {
          var ps = L[0]; useMasters(ps, L[1], L[2]);
          DX = L[3] && NS.cfgFor ? (NS.cfgFor(L[3], { name: $('#ty-biz', box).value }).tf || {}).dx || null : null;   /* this business's Direct / Indirect choice */
          var r = fromDocs(docs, $('#ty-biz', box).value, from, to, w);
          ps.forEach(function (q) { var k = 'p:' + B.key(q.name); if (parties[k]) parties[k].from = Object.assign({}, parties[k].from || {}, q); });
          return r;
        });
      });
    p.then(function (r) {
      if (r.err) { out.innerHTML = '<p class="warn">' + esc(r.err) + '</p>'; return; }
      last = r.vouchers;
      if (!last.length) { out.innerHTML = '<p class="warn">' + esc(t('ty.none')) + '</p>' + badList(r.bad); return; }
      var count = {}; last.forEach(function (v) { count[v.type] = (count[v.type] || 0) + 1; });
      out.innerHTML = '<p><b>' + esc(t('ty.found', { n: last.length })) + '</b> ' + esc(Object.keys(count).map(function (k) { return k + ' ' + count[k]; }).join(' · ')) + '</p>' +
        (r.skipped ? '<p class="hint">' + esc(t('ty.ob', { n: r.skipped })) + '</p>' : '') + (count['Stock Journal'] ? '<p class="hint">' + esc(t('fx.ty_sj')) + '</p>' : '') + badList(r.bad) +
        '<div class="tbl"><table class="bk-t"><thead><tr><th>' + esc(t('l.date')) + '</th><th>' + esc(t('ty.c.type')) + '</th><th>' + esc(t('bk.c.no')) + '</th><th>' + esc(t('ty.c.party')) + '</th><th class="n">' + esc(t('bk.c.val')) + '</th></tr></thead><tbody>' +
        last.slice(0, 200).map(function (v) {
          var big = v.inv ? v.inv.reduce(function (a, e) { return a + (e.dir === 'in' ? e.amt : 0); }, 0) : v.lines.reduce(function (a, l) { return a + (l.v > 0 ? l.v : 0); }, 0);
          return '<tr><td>' + NS.fmtDate(v.date) + '</td><td>' + esc(v.type) + '</td><td class="mono">' + esc(v.no) + '</td><td>' + esc(v.party || '—') + '</td><td class="n">' + NS.money(big) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (last.length > 200 ? '<p class="hint">' + esc(t('ty.more', { n: last.length - 200 })) + '</p>' : '') +
        '<p class="row"><button type="button" class="btn" id="ty-m">' + esc(t('ty.b.m')) + '</button><button type="button" class="btn primary" id="ty-v">' + esc(t('ty.b.v')) + '</button></p><p class="hint">' + esc(t('ty.h.order')) + '</p>';
      $('#ty-m', box).addEventListener('click', function () { save('tally-masters-' + NS.today() + '.xml', mastersXml(last)); });
      $('#ty-v', box).addEventListener('click', function () { save('tally-vouchers-' + NS.today() + '.xml', vouchersXml(last)); });
    }).catch(function (e) { out.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }
  function badList(bad) { return bad && bad.length ? '<details open><summary>' + esc(t('bk.fixn', { n: bad.length })) + '</summary><ul class="warn">' + bad.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></details>' : ''; }
  function save(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/xml' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    NS.toast(t('ty.saved', { file: name }));
  }

  /* saved parties, items and groups for the masters file (the Tally page loads them; acct.js passes its own) */
  function useMasters(ps, items, groups) { M = { party: ps || [], item: items || [], groups: groups || null }; }
  function init() {
    box = $('[data-tally]');
    if (!box || !B || !NS.xlsx) return;
    render();
    document.addEventListener('ns-lang', render);
  }
  NS.tally = { useMasters: useMasters, useDx: function (d) { DX = d || null; }, fromDocs: fromDocs, fromSheet: fromSheet, mastersXml: function (v) { return mastersXml(v); }, vouchersXml: function (v) { return vouchersXml(v); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
