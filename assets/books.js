/* NSBooks: the accounts underneath the Nivesh Sahayak App (Phase 2: money in and out).
   Nothing new is stored here: every saved document in the data home is turned into double-entry lines on the fly
   (party, sales, purchases, expenses, GST, cash, bank, TDS), so the ledgers can never drift from the documents.
   Pure functions: the page passes in the documents and gets balances, statements and bill-wise dues back.

   Records it reads (store 'doc'; seller = our business on every record, buyer = the other party):
     invoice, cashmemo           sale: the customer owes the total (status 'paid' without a linked payment = paid at once)
     note credit / debit         sales return or price cut (customer owes less) / extra charge (customer owes more)
     receipt pay / adv           money in from buyer; tds = TDS the customer cut (settles that much more)
     receipt ref                 refund paid back to buyer
     voucher                     money out: with forBill (made in the app) it pays the supplier, else an expense by account head
     self                        purchase from an unregistered supplier (supplier is owed the taxable value; GST on reverse charge)
     pbill bill / return         purchase bill from a supplier (we owe it) / purchase return (we owe less)
     exp                         expense; mode 'credit' = not paid yet (we owe the payee)
     ob                          opening balance: side 'recv' (a party owes us), 'pay' (we owe a party), 'cash' or 'bank' (no party)
     contra                      cash deposited in the bank (from 'cash', to 'bank') or withdrawn (from 'bank', to 'cash')
     jv                          journal entry (Batch 2): lines [{ a, party, side, dr, cr }] typed by the user, each line goes to account a
                                 (a 'party' = the party's account; side 'recv' customer / 'pay' supplier decides how bill-wise dues read it)
     oinc                        other income received (interest, rent, commission, dividend, scrap, claims ...; Accounts coverage WP-2):
                                 head, amount received, tds (cut by the payer); Dr cash/bank + TDS receivable, Cr inc:<head>; payer kept apart
     taxpay                      tax paid to the government or a refund (WP-4), kind gst | tds | tcs | adv | gstref | itref: see taxPay()
     gstset                      GSTR-3B set-off of one tax period (WP-4): output tax settled by input credit and the cash ledger, see gstSet()
     receipt / voucher disc      cash discount at settlement (WP-3): receipt Dr discount allowed, voucher (app-made) Cr discount received; settles that much more
     wo                          write-off of a bill's balance (WP-3): side recv (reason bad -> bad debts, small / disc -> discount allowed) or
                                 side pay (disc -> discount received, small -> balances written back); alloc [{ id, no, amt }] = the bill
     pdd                         provision for doubtful debts (WP-3): change = new figure - provision before; Dr / Cr exp:provision for doubtful debts
     fa kind 'buy' / 'sale'      fixed asset bought (Dr fa:<asset>, GST credit if itc) / sold (Cr the book value bv saved on the record,
                                 the difference is profit or loss on sale); mode 'credit' = the party (buyer field) is owed / owes
   chq: { date, bank, st, on } on a receipt or voucher paid by cheque: st 'hand' (received, not deposited), 'dep' (deposited),
     'iss' (issued by us), 'ok' (cleared on date 'on'), 'bounce' (bounced: the record is left out of the books, so its bills are due again).
     Until it clears, the money sits in 'chq-in' (cheques received) or 'chq-out' (cheques issued) instead of 'bank'.
   alloc: [{ id, amt }] on a receipt or app voucher links money to bills; whatever is not linked settles the oldest bills first. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var UT = { '04': 1, '26': 1, '31': 1, '35': 1, '38': 1 };
  var BANKISH = { upi: 1, cheque: 1, bank: 1, card: 1, dd: 1, other: 1 };
  function moneyAcct(mode) { return BANKISH[mode] ? 'bank' : 'cash'; }
  function bounced(d) { return !!(d.chq && d.chq.st === 'bounce' && d.mode === 'cheque'); }
  /* where the money of a receipt / voucher went: a cheque not cleared yet is not in the bank */
  function payAcct(d, out) { return d.mode === 'cheque' && d.chq && d.chq.st && d.chq.st !== 'ok' ? (out ? 'chq-out' : 'chq-in') : moneyAcct(d.mode); }

  /* tax split of an item document (same rules as docs.js totals) */
  function itemTotals(d) {
    var noTax = d.kind === 'supply' || d.kind === 'plain' || d.withGst === false || d.type === 'pbill' && d.noGst;
    /* a purchase bill comes from the supplier (buyer field) to us (seller field) */
    var buy = d.type === 'pbill', origin = buy ? d.buyer && d.buyer.state : d.seller && d.seller.state;
    var dest = buy ? d.seller && d.seller.state : d.pos || d.buyer && d.buyer.state || origin;
    origin = origin || dest;
    var intra = !origin || !dest || origin === dest, o = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    (d.items || []).forEach(function (it) {
      var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), rate = num(it.rate);
      if (!it.desc && !rate) return;
      var taxable = r2(q * rate - q * rate * num(it.disc) / 100), tax = noTax ? 0 : r2(taxable * num(it.gst) / 100);
      o.taxable += taxable;
      if (intra) { o.cgst += tax / 2; o.sgst += tax / 2; } else o.igst += tax;
    });
    /* extra charges (freight, packing, insurance): part of the taxable value; GST at the main item's rate or their own rate */
    var main = mainRate(d);
    (d.charges || []).forEach(function (c) {
      var amt = r2(num(c.amt)); if (!amt) return;
      var tax = noTax ? 0 : r2(amt * (c.gst === '' || c.gst == null || c.gst === 'main' ? main : num(c.gst)) / 100);
      o.taxable += amt;
      if (intra) { o.cgst += tax / 2; o.sgst += tax / 2; } else o.igst += tax;
    });
    o.taxable = r2(o.taxable); o.cgst = r2(o.cgst); o.sgst = r2(o.sgst); o.igst = r2(o.igst);
    /* TCS (income-tax, collected by the seller): on the total with GST or on the taxable value, as chosen on the bill */
    o.tcs = d.tcs && d.tcs.on ? r2((d.tcs.base === 'taxable' ? o.taxable : o.taxable + o.cgst + o.sgst + o.igst) * tcsRate(d) / 100) : 0;
    var total = r2(o.taxable + o.cgst + o.sgst + o.igst + o.tcs);
    o.total = d.total != null && d.total !== '' ? num(d.total) : total;
    o.round = r2(o.total - total);
    o.ut = !buy && UT[origin] && intra;
    return o;
  }

  /* TCS rate that applies on a bill: the rate on the bill, or without a valid PAN of the buyer the higher of twice that rate or 5%, not over 20%
     (Income-tax Act 2025 s.397(2)(b)(ii)). PAN = tcs.pan, else characters 3-12 of the buyer's GSTIN. Non-residents without a PE: tcs.nopanOk. */
  function panOk(p) { return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p || '').toUpperCase()); }
  function tcsPan(d) { var c = d.tcs || {}, g = String(d.buyer && d.buyer.gstin || '').toUpperCase(); return panOk(c.pan) ? String(c.pan).toUpperCase() : panOk(g.slice(2, 12)) ? g.slice(2, 12) : ''; }
  function tcsRate(d) {
    var c = d.tcs || {}, r = num(c.rate);
    if (!c.on || !r) return 0;
    return tcsPan(d) || c.nopanOk ? r : Math.min(20, Math.max(2 * r, 5));
  }

  /* GST rate of the main supply: the item line with the largest taxable value (ancillary charges follow it, CGST Act s.8(a) and s.15(2)(c)) */
  function mainRate(d) {
    var best = -1, g = 0;
    (d.items || []).forEach(function (it) {
      var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), v = q * num(it.rate) * (1 - num(it.disc) / 100);
      if ((it.desc || num(it.rate)) && v > best) { best = v; g = num(it.gst); }
    });
    return g;
  }

  /* extra charges as item-like lines (for GSTR-1, GSTR-3B): GST and HSN of the main item unless the charge has its own */
  function chargeLines(d) {
    var best = -1, mainIt = null;
    (d.items || []).forEach(function (it) { var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), v = q * num(it.rate) * (1 - num(it.disc) / 100); if ((it.desc || num(it.rate)) && v > best) { best = v; mainIt = it; } });
    return (d.charges || []).filter(function (c) { return num(c.amt); }).map(function (c) {
      var own = !(c.gst === '' || c.gst == null || c.gst === 'main');
      return { desc: c.name || 'Charges', hsn: own ? c.hsn || '' : mainIt && mainIt.hsn || '', qty: 1, unit: mainIt && mainIt.unit || '', rate: num(c.amt), disc: '', gst: own ? num(c.gst) : mainIt ? num(mainIt.gst) : 0, charge: 1 };
    });
  }

  function partyName(d) { return String(d.buyer && d.buyer.name || '').trim(); }
  function bizOf(d) { return key(d.seller && d.seller.name); }

  /* kind of each record for the books: 'sale', 'sret' (credit note), 'sdeb' (debit note), 'in', 'refund', 'out', 'outexp', 'buy', 'pret', 'exp', 'ob', or '' (not in the books) */
  function role(d) {
    if (bounced(d)) return '';
    switch (d.type || 'invoice') {
      case 'invoice': case 'cashmemo': case 'pharma': return 'sale';   /* pharma: pharmacy.niveshsahayak.in */
      case 'resto': return d.status === 'open' ? '' : 'sale';   /* restaurant: a running table is not a sale yet */
      case 'lr': return 'sale';   /* bilty: freight earned; the payer is the customer */
      case 'fee': return 'sale';   /* fee receipt: fees received (status paid) */
      case 'job': return d.print === 'bill' ? 'sale' : '';   /* job card: a sale once it is a service bill */
      case 'rabill': return 'sale';   /* contractor RA bill: value of work in this bill (retention and TDS settle at payment) */
      case 'note': if (d.side === 'purchase') return d.kind === 'debit' ? 'pret' : 'buy';   /* against a purchase: debit note = supplier owes back (like a purchase return), credit note = we owe more */
        return d.kind === 'debit' ? 'sdeb' : 'sret';
      case 'receipt': return d.kind === 'ref' ? 'refund' : 'in';
      case 'voucher': return d.forBill ? 'out' : 'outexp';
      case 'self': return 'buy';
      case 'pbill': return d.kind === 'return' ? 'pret' : 'buy';
      case 'exp': return 'exp';
      case 'ob': return 'ob';
      case 'contra': return 'contra';
      case 'jv': return 'jv';
      case 'fa': return d.kind === 'sale' ? 'fasale' : 'fabuy';
      case 'oinc': return 'oinc';   /* other income received (Accounts coverage WP-2) */
      case 'taxpay': return 'taxpay';   /* tax paid to the government or a tax refund (WP-4) */
      case 'gstset': return 'gstset';   /* GSTR-3B set-off of a tax period (WP-4) */
      case 'wo': return 'wo';   /* balance of a bill written off (WP-3) */
      case 'pdd': return 'pdd';   /* provision for doubtful debts (WP-3) */
    }
    return '';
  }

  /* double-entry lines of one record: [{ a: account, dr, cr }]; party accounts are 'p:<name key>' */
  function postings(d) {
    var R = role(d), P = 'p:' + key(partyName(d)), L = [];
    function dr(a, v) { v = r2(v); if (v) L.push({ a: a, dr: v, cr: 0 }); }
    function cr(a, v) { v = r2(v); if (v) L.push({ a: a, dr: 0, cr: v }); }
    var t, amt;
    if (R === 'sale' || R === 'sret' || R === 'sdeb') {
      t = itemTotals(d);
      var side = R === 'sret' ? cr : dr, other = R === 'sret' ? dr : cr, sales = R === 'sret' ? 'sales-return' : 'sales';
      side(partyName(d) ? P : 'p:cash-customer', t.total);
      other(sales, t.taxable);
      other('gst-out-cgst', t.cgst); other(t.ut ? 'gst-out-utgst' : 'gst-out-sgst', t.sgst); other('gst-out-igst', t.igst);
      other('tcs-payable', t.tcs);
      if (t.round) (t.round > 0 ? other : side)('round-off', Math.abs(t.round));
      /* marked paid on the bill itself (no payment entry linked): money came in on the bill date */
      if (R === 'sale' && d.status === 'paid' && !d.paidBy) { dr(moneyAcct(d.payMode || 'cash'), t.total); cr(partyName(d) ? P : 'p:cash-customer', t.total); }
    } else if (R === 'in') {
      amt = num(d.amount); var tds = num(d.tds), dsc = num(d.disc);   /* disc: cash discount allowed when the customer paid (WP-3) */
      dr(payAcct(d), amt); dr('tds-receivable', tds); dr(DISC_A, dsc); cr(P, amt + tds + dsc);
    } else if (R === 'oinc') {   /* other income: money in + TDS the payer cut = the income */
      amt = num(d.amount); var tdsI = num(d.tds);
      dr(payAcct(d), amt); dr('tds-receivable', tdsI); cr('inc:' + key(d.head || 'Miscellaneous income'), amt + tdsI);
    } else if (R === 'taxpay') {
      var tx = taxPay(d), back = d.kind === 'gstref' || d.kind === 'itref';
      tx.lines.forEach(function (l) { (back ? cr : dr)(l[0], l[1]); });
      if (back) dr(payAcct(d), tx.total); else cr(payAcct(d, true), tx.total);
    } else if (R === 'gstset') {
      gstSet(d).forEach(function (l) { dr(l[0], l[1]); cr(l[2], l[1]); });
    } else if (R === 'wo') {   /* write-off: the customer's balance to bad debts / discount allowed, a supplier's to discount received / written back */
      amt = num(d.amount);
      if (d.side === 'pay') { dr(P, amt); cr(d.reason === 'small' ? WBACK : DISC_R, amt); } else { dr(d.reason === 'bad' ? BADD : DISC_A, amt); cr(P, amt); }
    } else if (R === 'pdd') {   /* provision for doubtful debts: only the change to the new figure is posted */
      amt = num(d.change);
      if (amt > 0) { dr(PDDX, amt); cr('pdd', amt); } else if (amt < 0) { dr('pdd', -amt); cr(PDDX, -amt); }
    } else if (R === 'refund') {
      amt = num(d.amount); dr(P, amt); cr(payAcct(d, true), amt);
    } else if (R === 'out' || R === 'outexp') {
      var gross = (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0), tdsOut = r2(gross * num(d.tdsRate) / 100);
      if (R === 'out') { dr(P, gross + num(d.disc)); cr(DISC_R, num(d.disc)); }   /* disc: cash discount received from the supplier (WP-3) */
      else (d.lines || []).forEach(function (l) { dr('exp:' + key(l.head || 'Miscellaneous'), num(l.amt)); });
      cr(payAcct(d, true), gross - tdsOut); cr('tds-payable', tdsOut);
    } else if (R === 'buy' || R === 'pret') {
      t = itemTotals(d);
      var s2 = R === 'pret' ? cr : dr, o2 = R === 'pret' ? dr : cr, buys = R === 'pret' ? 'purchase-return' : 'purchases';
      /* a self invoice for services only (every line a SAC, 99…) is an expense, not goods bought for resale (round C) */
      if (d.type === 'self' && (d.items || []).length && d.items.every(function (it) { return !String(it.desc || '').trim() || /^99/.test(String(it.hsn || '')); })) buys = 'exp:prof';
      s2(buys, t.taxable);
      if (d.type === 'self') {   /* reverse charge: input tax credit and tax payable both, supplier gets the taxable value */
        s2('gst-in-cgst', t.cgst); s2('gst-in-sgst', t.sgst); s2('gst-in-igst', t.igst);
        o2('gst-rcm-payable', t.cgst + t.sgst + t.igst); o2(P, t.taxable);
        if (d.status === 'sipaid') { dr(P, t.taxable); cr(moneyAcct(d.payMode || 'cash'), t.taxable); }
      } else {
        s2('gst-in-cgst', t.cgst); s2('gst-in-sgst', t.sgst); s2('gst-in-igst', t.igst); s2('tcs-receivable', t.tcs);
        if (t.round) (t.round > 0 ? s2 : o2)('round-off', Math.abs(t.round));
        o2(P, t.total);
      }
    } else if (R === 'exp') {
      amt = num(d.amount); var g = num(d.gst), itc = d.itc && g ? r2(amt * g / (100 + g)) : 0;
      dr('exp:' + key(d.cat || 'Miscellaneous'), amt - itc);
      if (itc) { if (d.inter) dr('gst-in-igst', itc); else { dr('gst-in-cgst', r2(itc / 2)); dr('gst-in-sgst', itc - r2(itc / 2)); } }
      if (d.mode === 'credit') cr(partyName(d) ? P : 'p:unknown', amt); else cr(moneyAcct(d.mode), amt);
    } else if (R === 'contra') {
      amt = num(d.amount); dr(d.to === 'cash' ? 'cash' : 'bank', amt); cr(d.from === 'bank' ? 'bank' : 'cash', amt);
    } else if (R === 'jv') {
      (d.lines || []).forEach(function (l) { var a = jvAcct(l); if (!a) return; dr(a, num(l.dr)); cr(a, num(l.cr)); });
    } else if (R === 'fabuy') {
      amt = num(d.amount); var fg = d.itc ? num(d.gstAmt) : 0, fk = 'fa:' + key(d.name || 'Fixed asset');
      /* an asset the business already owned when the books start: no payment, no GST now, against the opening balance (round C) */
      if (d.mode === 'own') { dr(fk, amt); cr('opening', amt); return L; }
      dr(fk, amt + (d.itc ? 0 : num(d.gstAmt)));
      if (fg) { if (d.inter) dr('gst-in-igst', fg); else { dr('gst-in-cgst', r2(fg / 2)); dr('gst-in-sgst', fg - r2(fg / 2)); } }
      if (d.mode === 'credit') cr(partyName(d) ? P : 'p:unknown', amt + num(d.gstAmt)); else cr(moneyAcct(d.mode), amt + num(d.gstAmt));
    } else if (R === 'fasale') {
      amt = num(d.amount); var bv = num(d.bv), sk = 'fa:' + key(d.name || 'Fixed asset'), sg = num(d.gstAmt);
      if (d.mode === 'credit') dr(partyName(d) ? P : 'p:unknown', amt + sg); else dr(moneyAcct(d.mode), amt + sg);
      if (sg) { if (d.inter) cr('gst-out-igst', sg); else { cr('gst-out-cgst', r2(sg / 2)); cr('gst-out-sgst', sg - r2(sg / 2)); } }
      cr(sk, bv);
      if (amt > bv) cr('inc:profit on sale of assets', amt - bv); else dr('exp:loss on sale of assets', bv - amt);
    } else if (R === 'ob') {
      amt = num(d.amount);
      if (d.side === 'cash' || d.side === 'bank') { dr(d.side, amt); cr('opening', amt); }   /* cash in hand / bank balance on the start date */
      else if (d.side === 'pay') { dr('opening', amt); cr(P, amt); } else { dr(P, amt); cr('opening', amt); }
    }
    return L;
  }

  /* ---------- discounts, write-offs, provision for doubtful debts (Accounts coverage WP-3) ---------- */
  var DISC_A = 'exp:discount allowed', DISC_R = 'inc:discount received', BADD = 'exp:bad debts', WBACK = 'inc:balances written back', PDDX = 'exp:provision for doubtful debts';
  /* the provision for doubtful debts on a day (the 'pdd' account balance, a credit), leaving out one record (the one being changed) */
  function provision(docs, biz, upto, skipId) {
    var v = 0;
    inBooks(docs, biz).forEach(function (d) { if (role(d) === 'pdd' && d.id !== skipId && (!upto || d.date <= upto)) v = r2(v + num(d.change)); });
    return v;
  }

  /* ---------- taxes (Accounts coverage WP-4) ---------- */
  var GSTH = ['igst', 'cgst', 'sgst', 'cess'], MINOR = ['tax', 'int', 'pen', 'fee', 'oth'];
  var INTX = 'exp:interest on late payment of tax', FEEX = 'exp:late fee and penalty';
  /* what a tax payment debits (refunds: credits): [[account, amount]] and the total paid (received).
     gst      challan PMT-06: the money goes into the electronic cash ledger of each major head (gst.<head>.<minor head>)
     tds/tcs  challan of TDS or TCS deducted / collected: tax clears TDS (TCS) payable, interest and late fee are expenses
     adv      advance tax or self-assessment tax: d.to 'drw' (a proprietor's own tax = drawings) or 'oca' (tax paid in advance)
     gstref   GST refund received back from the cash ledger; itref income-tax refund (back to drawings or tax paid in advance) */
  function taxPay(d) {
    var L = [];
    function add(a, v) { v = r2(num(v)); if (v) L.push([a, v]); }
    if (d.kind === 'gst' || d.kind === 'gstref') GSTH.forEach(function (h) { var g = d.gst && d.gst[h] || {}; add('gstcash-' + h, MINOR.reduce(function (s, m) { return s + num(g[m]); }, 0)); });
    else if (d.kind === 'tds' || d.kind === 'tcs') { add(d.kind + '-payable', d.tax); add(INTX, d['int']); add(FEEX, d.fee); }
    else add(d.to === 'oca' ? 'oca:advance income tax' : 'drw:drawings', d.amount);
    return { lines: L, total: r2(L.reduce(function (s, l) { return s + l[1]; }, 0)) };
  }
  /* the GSTR-3B set-off of a period as [debit account, amount, credit account] (gstr3b.js saves it after filing):
     out = output tax settled per head, use[against][from] = input credit used, cash = tax paid from the cash ledger,
     rcm = reverse charge tax paid in cash, int / fee = interest and late fee paid in cash. Cess is not in the books. */
  function gstSet(d) {
    var L = [], ut = !!d.ut;
    function outAcct(h) { return 'gst-out-' + (h === 'sgst' && ut ? 'utgst' : h); }
    function add(a, v, b) { v = r2(num(v)); if (v > 0) L.push([a, v, b]); }
    ['igst', 'cgst', 'sgst'].forEach(function (h) {
      var u = d.use && d.use[h] || {};
      Object.keys(u).forEach(function (from) { if (from !== 'cess') add(outAcct(h), u[from], 'gst-in-' + from); });
      add(outAcct(h), d.cash && d.cash[h], 'gstcash-' + h);
      add('gst-rcm-payable', d.rcm && d.rcm[h], 'gstcash-' + h);
      add(INTX, d['int'] && d['int'][h], 'gstcash-' + h);
      add(FEEX, d.fee && d.fee[h], 'gstcash-' + h);
    });
    return L;
  }

  /* account of one journal line: 'party' = the party's own account, else the account key typed in the line */
  function jvAcct(l) { if (!l) return ''; if (l.a === 'party') return l.party ? 'p:' + key(l.party) : ''; return String(l.a || '').trim(); }
  /* every party a record touches: { key: name } (a journal entry can name several) */
  function partiesOf(d) {
    var o = {};
    if (role(d) === 'jv') (d.lines || []).forEach(function (l) { if (l.a === 'party' && String(l.party || '').trim()) o[key(l.party)] = String(l.party).trim(); });
    else if (partyName(d)) o[key(partyName(d))] = partyName(d);
    return o;
  }

  /* the business's records in date order (same date: sales and bills before money, so a same-day payment settles them) */
  var ORDER = { ob: 0, sale: 1, sdeb: 1, buy: 1, exp: 1, fabuy: 1, sret: 2, pret: 2, 'in': 3, out: 3, outexp: 3, refund: 3, fasale: 3, oinc: 3, taxpay: 3, wo: 4, contra: 4, jv: 5, gstset: 6, pdd: 7 };
  function inBooks(docs, biz) {
    var b = key(biz);
    return docs.filter(function (d) { return role(d) && (!b || bizOf(d) === b); }).sort(function (x, y) {
      return (x.date || '').localeCompare(y.date || '') || ORDER[role(x)] - ORDER[role(y)] || (x.created || 0) - (y.created || 0);
    });
  }

  /* party balances: { key: { name, recv, bal, docs } }; bal > 0 = they owe us, < 0 = we owe them */
  function parties(docs, biz) {
    var out = {};
    inBooks(docs, biz).forEach(function (d) {
      var pp = partiesOf(d), L = postings(d);
      Object.keys(pp).forEach(function (k) {
        var nm = pp[k], mine = L.filter(function (l) { return l.a === 'p:' + k; });
        if (!mine.length) return;   /* e.g. a voucher paid straight as an expense */
        var p = out[k] || (out[k] = { key: k, name: nm, bal: 0, n: 0, last: '' });
        mine.forEach(function (l) { p.bal = r2(p.bal + l.dr - l.cr); });
        p.n++; p.last = d.date || p.last;
        if (d.buyer && d.buyer.phone) p.phone = d.buyer.phone;
      });
    });
    return out;
  }

  /* account balances (dr - cr) for the whole business, optionally up to a date */
  function accounts(docs, biz, upto) {
    var out = {};
    inBooks(docs, biz).forEach(function (d) {
      if (upto && d.date > upto) return;
      postings(d).forEach(function (l) { out[l.a] = r2((out[l.a] || 0) + l.dr - l.cr); });
    });
    return out;
  }

  /* bill-wise dues of one party (or every party): open bills with what is left on each.
     Receivable bills: sales, debit notes, opening 'recv'. Payable bills: purchase bills, self invoices, expenses on credit, opening 'pay'.
     Money and returns go first to the bills they name (alloc / orig no.), then to the oldest bill on the same side. */
  function bills(docs, biz, partyKey) {
    var list = inBooks(docs, biz).filter(function (d) { return !partyKey || partiesOf(d)[partyKey]; });
    var open = {}, byId = {}, credits = [];
    function pk(d) { return key(partyName(d)); }
    function bill(d, side, amt) {
      if (amt <= 0) return;
      var b = { id: d.id, no: d.no || d.billNo || '', date: d.date, due: d.due || '', side: side, total: r2(amt), left: r2(amt), type: d.type, kind: d.kind, party: partyName(d), by: [] };
      (open[pk(d)] = open[pk(d)] || []).push(b); byId[d.id] = b;
    }
    list.forEach(function (d) {
      var R = role(d), t;
      if (R === 'jv') {   /* journal lines on a party: a new bill or money-like credit, by the side the line was made for */
        (d.lines || []).forEach(function (l, i) {
          if (l.a !== 'party' || !String(l.party || '').trim()) return;
          var k = key(l.party), pay = l.side === 'pay', x = { id: d.id + '#' + i, no: d.no, date: d.date, due: '', type: 'jv', buyer: { name: String(l.party).trim() } };
          if (partyKey && k !== partyKey) return;
          if (num(l.dr)) { if (pay) credits.push({ side: 'pay', amt: num(l.dr), d: x }); else bill(x, 'recv', num(l.dr)); }
          if (num(l.cr)) { if (pay) bill(x, 'pay', num(l.cr)); else credits.push({ side: 'recv', amt: num(l.cr), d: x }); }
        });
        return;
      }
      if (!partyName(d)) return;
      if (R === 'fabuy') { if (d.mode === 'credit') bill(d, 'pay', num(d.amount) + num(d.gstAmt)); return; }
      if (R === 'fasale') { if (d.mode === 'credit') bill(d, 'recv', num(d.amount) + num(d.gstAmt)); return; }
      if (R === 'sale') { t = itemTotals(d).total; bill(d, 'recv', t); if (d.status === 'paid' && !d.paidBy) credits.push({ side: 'recv', amt: t, to: d.id, date: d.date }); }
      else if (R === 'sdeb') bill(d, 'recv', itemTotals(d).total);
      else if (R === 'buy') {
        t = itemTotals(d); bill(d, 'pay', d.type === 'self' ? t.taxable : t.total);
        if (d.type === 'self' && d.status === 'sipaid') credits.push({ side: 'pay', amt: t.taxable, to: d.id, date: d.date });
      }
      else if (R === 'exp' && d.mode === 'credit') bill(d, 'pay', num(d.amount));
      else if (R === 'ob' && d.side !== 'cash' && d.side !== 'bank') bill(d, d.side === 'pay' ? 'pay' : 'recv', num(d.amount));
      else if (R === 'in') credits.push({ side: 'recv', amt: num(d.amount) + num(d.tds) + num(d.disc), alloc: d.alloc, d: d });
      else if (R === 'wo') credits.push({ side: d.side === 'pay' ? 'pay' : 'recv', amt: num(d.amount), alloc: d.alloc, d: d });
      else if (R === 'refund') bill(d, 'recv', num(d.amount));   /* a refund paid out makes the customer "owe" it back against their advance */
      else if (R === 'sret') credits.push({ side: 'recv', amt: itemTotals(d).total, origNo: d.orig && d.orig.no, d: d });
      else if (R === 'out') credits.push({ side: 'pay', amt: (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0) + num(d.disc), alloc: d.alloc, d: d });
      else if (R === 'pret') credits.push({ side: 'pay', amt: itemTotals(d).total, origNo: d.orig && d.orig.no, d: d });
    });
    /* apply credits in date order (list was sorted, credits keep that order) */
    var adv = {}, advBy = {};
    credits.forEach(function (c) {
      var left = r2(c.amt), p = c.d ? pk(c.d) : null, src = c.d ? { id: c.d.id, no: c.d.no || '', date: c.d.date, type: c.d.type, kind: c.d.kind } : { id: c.to, no: '', date: c.date, type: 'paid' };
      function take(b, max) { var x = r2(Math.min(b.left, max == null ? left : max, left)); if (x > 0) { b.left = r2(b.left - x); left = r2(left - x); b.by.push(Object.assign({ amt: x }, src)); } }
      if (c.to && byId[c.to]) { take(byId[c.to]); return; }
      (c.alloc || []).forEach(function (a) { var b = byId[a.id]; if (b && b.side === c.side) take(b, num(a.amt)); });
      if (c.origNo) (open[p] || []).forEach(function (b) { if (b.side === c.side && key(b.no) === key(c.origNo)) take(b); });
      (open[p] || []).forEach(function (b) { if (left > 0 && b.side === c.side) take(b); });
      if (left > 0 && p) { adv[p] = adv[p] || { recv: 0, pay: 0 }; adv[p][c.side] = r2(adv[p][c.side] + left); ((advBy[p] = advBy[p] || { recv: [], pay: [] })[c.side]).push(Object.assign({ left: left }, src)); }
    });
    /* an advance on one side is used up by bills that come later on the same side */
    Object.keys(adv).forEach(function (p) {
      ['recv', 'pay'].forEach(function (s) {
        (open[p] || []).forEach(function (b) {
          if (!(adv[p][s] > 0 && b.side === s && b.left > 0)) return;
          var x = Math.min(b.left, adv[p][s]); b.left = r2(b.left - x); adv[p][s] = r2(adv[p][s] - x);
          /* name the advances that paid it, oldest first */
          (advBy[p] && advBy[p][s] || []).forEach(function (a) { var y = r2(Math.min(a.left, x)); if (y > 0) { a.left = r2(a.left - y); x = r2(x - y); b.by.push({ id: a.id, no: a.no, date: a.date, type: a.type, kind: a.kind, amt: y, adv: 1 }); } });
        });
      });
    });
    var all = [], every = [];
    Object.keys(open).forEach(function (p) { open[p].forEach(function (b) { every.push(b); if (b.left > 0.004) all.push(b); }); });
    /* every: all bills (settled ones too) with by = what paid each one: [{ id, no, date, type, kind, amt, adv }] */
    return { bills: all, advances: adv, every: every };
  }

  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5); }
  /* ageing buckets by days since the bill date: 0-30, 31-60, 61-90, 90+.
     byDue: a bill with a due date (credit days) ages from its due date instead, so a bill not due yet stays in the first bucket */
  function ageing(openBills, today, byDue) {
    var B = [0, 0, 0, 0];
    openBills.forEach(function (b) { var n = daysBetween(byDue && b.due ? b.due : b.date, today), i = n <= 30 ? 0 : n <= 60 ? 1 : n <= 90 ? 2 : 3; B[i] = r2(B[i] + b.left); });
    return B;
  }
  /* what is past its due date: bills with a due date after it, bills without one after the party's credit days (cdays) if given */
  function overdue(openBills, today, cdays) {
    return r2(openBills.reduce(function (a, b) {
      var due = b.due || (cdays ? addDays(b.date, cdays) : '');
      return due && due < today ? a + b.left : a;
    }, 0));
  }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + (+n || 0)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* statement of account of one party between two dates: opening, rows with running balance, closing */
  function statement(docs, biz, partyKey, from, to) {
    var acct = 'p:' + partyKey, open = 0, rows = [], bal;
    inBooks(docs, biz).forEach(function (d) {
      if (!partiesOf(d)[partyKey]) return;
      var dr = 0, cr = 0;
      postings(d).forEach(function (l) { if (l.a === acct) { dr += l.dr; cr += l.cr; } });
      dr = r2(dr); cr = r2(cr);
      if (!dr && !cr) return;
      if (from && d.date < from) { open = r2(open + dr - cr); return; }
      if (to && d.date > to) return;
      rows.push({ d: d, date: d.date, dr: dr, cr: cr });
    });
    bal = open;
    rows.forEach(function (r) { bal = r2(bal + r.dr - r.cr); r.bal = bal; });
    return { open: open, rows: rows, close: bal, dr: r2(rows.reduce(function (a, r) { return a + r.dr; }, 0)), cr: r2(rows.reduce(function (a, r) { return a + r.cr; }, 0)) };
  }

  /* one account's lines (cash book, bank book) between two dates; a cleared cheque reaches the bank on the day it cleared */
  function book(docs, biz, acct, from, to) {
    var open = 0, rows = [];
    inBooks(docs, biz).map(function (d) {
      return { d: d, date: acct === 'bank' && d.mode === 'cheque' && d.chq && d.chq.st === 'ok' && d.chq.on ? d.chq.on : d.date };
    }).sort(function (x, y) { return (x.date || '').localeCompare(y.date || ''); }).forEach(function (x) {
      var d = x.d, dr = 0, cr = 0;
      postings(d).forEach(function (l) { if (l.a === acct) { dr += l.dr; cr += l.cr; } });
      if (!dr && !cr) return;
      if (from && x.date < from) { open = r2(open + dr - cr); return; }
      if (to && x.date > to) return;
      rows.push({ d: d, date: x.date, dr: r2(dr), cr: r2(cr) });
    });
    var bal = open; rows.forEach(function (r) { bal = r2(bal + r.dr - r.cr); r.bal = bal; });
    return { open: open, rows: rows, close: bal };
  }

  /* ---------- party ledger and group reports (Party Ledger, Steps B and C) ---------- */
  /* voucher type of a record for the ledger filter: sales, receipts, notes (credit and debit notes), purchases, payments, journal, opening */
  function vtype(d) {
    var R = role(d);
    return ({ sale: 'sales', fasale: 'sales', sret: 'notes', sdeb: 'notes', 'in': 'receipts', refund: 'payments', out: 'payments', outexp: 'payments',
      buy: 'purchases', pret: 'purchases', exp: 'purchases', fabuy: 'purchases', jv: 'journal', ob: 'opening', contra: 'journal', oinc: 'receipts', taxpay: 'payments', gstset: 'journal', wo: 'journal', pdd: 'journal' })[R] || 'other';
  }
  /* ledger of one party between two dates: the statement with a voucher type on every row.
     types (optional): only these voucher types are listed; opening, closing and each row's balance stay the true ones,
     so a filtered ledger never shows a made-up balance. dr / cr = totals of the rows listed. */
  function ledger(docs, biz, partyKey, from, to, types) {
    var S = statement(docs, biz, partyKey, from, to), want = types && types.length ? types : null;
    S.rows.forEach(function (r) { r.vt = vtype(r.d); });
    if (want) S.rows = S.rows.filter(function (r) { return want.indexOf(r.vt) >= 0; });
    S.dr = r2(S.rows.reduce(function (a, r) { return a + r.dr; }, 0)); S.cr = r2(S.rows.reduce(function (a, r) { return a + r.cr; }, 0));
    return S;
  }
  /* bill-wise view: every bill of a party (settled ones too) dated up to 'upto', with what paid it, and the advances not used yet */
  function billwise(docs, biz, partyKey, upto) {
    var list = upto ? docs.filter(function (d) { return !d.date || d.date <= upto; }) : docs, R = bills(list, biz, partyKey);
    var ev = R.every.filter(function (b) { return key(b.party) === partyKey; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    return { bills: ev, advances: R.advances[partyKey] || { recv: 0, pay: 0 },
      due: { recv: r2(ev.reduce(function (a, b) { return b.side === 'recv' ? a + b.left : a; }, 0)), pay: r2(ev.reduce(function (a, b) { return b.side === 'pay' ? a + b.left : a; }, 0)) } };
  }

  /* party groups (data home meta 'groups' = { party: [{ id, name, under }], item: [...] }; under = 'debtors' | 'creditors' | a group id).
     The two built-in groups: debtors = Customers, creditors = Suppliers (Tally's Sundry Debtors / Sundry Creditors). */
  var BUILTIN = { debtors: 'Customers', creditors: 'Suppliers' };
  function groupsOf(meta, kind) { var g = meta && meta[kind || 'party']; return Array.isArray(g) ? g : []; }
  function findGroup(meta, id) { return groupsOf(meta, 'party').filter(function (g) { return g.id === id; })[0]; }
  /* the group and its parents up to Customers or Suppliers: [id, parent, ..., 'debtors' | 'creditors']; [] if the group is not there */
  function groupChain(id, meta) {
    var out = [], seen = {};
    while (id && !BUILTIN[id] && !seen[id]) { seen[id] = 1; var g = findGroup(meta, id); if (!g) return out.length ? out.concat(['debtors']) : []; out.push(id); id = g.under; }
    return BUILTIN[id] ? out.concat([id]) : out.concat(['debtors']);
  }
  /* group of a party record ({ name, role, group }): its own group, else Customers (customer / both) or Suppliers (supplier) */
  function partyGroup(party, meta) {
    party = party || {};
    var id = party.group, ch = id ? groupChain(id, meta) : [];
    if (!ch.length) { id = party.role === 'supplier' ? 'creditors' : 'debtors'; ch = [id]; }
    var g = findGroup(meta, id);
    return { id: id, name: g ? g.name : BUILTIN[id], top: ch[ch.length - 1] };
  }
  /* is group id inside target (the same group, or one of its parents is target)? */
  function inGroup(id, target, meta) { return !target || id === target || groupChain(id, meta).indexOf(target) >= 0; }
  /* every group in tree order: Customers, its groups and their sub-groups, then Suppliers and its groups. [{ id, name, under, depth, builtin }] */
  function groupTree(meta) {
    var G = groupsOf(meta, 'party'), out = [];
    function kids(pid, depth) {
      G.filter(function (g) { return g.under === pid; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
        .forEach(function (g) { out.push({ id: g.id, name: g.name, under: g.under, depth: depth }); if (depth < 3) kids(g.id, depth + 1); });
    }
    ['debtors', 'creditors'].forEach(function (b) { out.push({ id: b, name: BUILTIN[b], under: '', depth: 0, builtin: 1 }); kids(b, 1); });
    /* a group whose parent is missing goes under Customers, so no party is ever lost */
    G.forEach(function (g) { if (!out.some(function (o) { return o.id === g.id; })) out.push({ id: g.id, name: g.name, under: 'debtors', depth: 1 }); });
    return out;
  }

  /* every party's opening, debit, credit and closing between two dates, and what was sold to / bought from them in it.
     { key: { key, name, open, dr, cr, close, sales, buys } } (open / close > 0 = they owe us) */
  function partyMoves(docs, biz, from, to) {
    var out = {};
    inBooks(docs, biz).forEach(function (d) {
      if (to && d.date > to) return;
      var pp = partiesOf(d), L = postings(d), R = role(d), before = from && d.date < from;
      Object.keys(pp).forEach(function (k) {
        var mine = L.filter(function (l) { return l.a === 'p:' + k; });
        if (!mine.length) return;
        var p = out[k] || (out[k] = { key: k, name: pp[k], open: 0, dr: 0, cr: 0, close: 0, sales: 0, buys: 0 });
        mine.forEach(function (l) { if (before) p.open = r2(p.open + l.dr - l.cr); else { p.dr = r2(p.dr + l.dr); p.cr = r2(p.cr + l.cr); } });
        if (before) return;
        if (R === 'sale' || R === 'sdeb') p.sales = r2(p.sales + itemTotals(d).total);
        else if (R === 'sret') p.sales = r2(p.sales - itemTotals(d).total);
        else if (R === 'buy') p.buys = r2(p.buys + (d.type === 'self' ? itemTotals(d).taxable : itemTotals(d).total));
        else if (R === 'pret') p.buys = r2(p.buys - itemTotals(d).total);
        else if (R === 'exp' && d.mode === 'credit') p.buys = r2(p.buys + num(d.amount));
      });
    });
    Object.keys(out).forEach(function (k) { var p = out[k]; p.close = r2(p.open + p.dr - p.cr); });
    return out;
  }
  function placed(g, T) { return T.some(function (t) { return t.id === g; }) ? g : 'debtors'; }
  /* group summary: for every group in tree order, the parties directly in it and totals with its sub-groups.
     moves = partyMoves(); gidOf(key) = group id of a party. [{ id, name, depth, builtin, rows: [moves], sum: { open, dr, cr, close, n } }] */
  function groupSummary(moves, gidOf, meta) {
    var T = groupTree(meta), by = {};
    Object.keys(moves).forEach(function (k) { var g = placed(gidOf(k) || 'debtors', T); (by[g] = by[g] || []).push(moves[k]); });
    return T.map(function (t) {
      var rows = (by[t.id] || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }), sum = { open: 0, dr: 0, cr: 0, close: 0, n: 0 };
      Object.keys(by).forEach(function (g) {
        if (!inGroup(g, t.id, meta)) return;
        by[g].forEach(function (p) { sum.open = r2(sum.open + p.open); sum.dr = r2(sum.dr + p.dr); sum.cr = r2(sum.cr + p.cr); sum.close = r2(sum.close + p.close); sum.n++; });
      });
      return Object.assign({}, t, { rows: rows, sum: sum });
    });
  }
  /* group-wise outstanding: open bills (bills().bills) added up per group and side with ageing (0-30, 31-60, 61-90, 90+).
     Totals include sub-groups. [{ id, name, depth, builtin, recv: [4], pay: [4], rt, pt }] */
  function groupDues(openBills, gidOf, meta, today, byDue) {
    var T = groupTree(meta), by = {};
    openBills.forEach(function (b) { var g = placed(gidOf(key(b.party)) || 'debtors', T); (by[g] = by[g] || []).push(b); });
    return T.map(function (t) {
      var recv = [], pay = [];
      Object.keys(by).forEach(function (g) { if (inGroup(g, t.id, meta)) by[g].forEach(function (b) { (b.side === 'pay' ? pay : recv).push(b); }); });
      var a = ageing(recv, today, byDue), p = ageing(pay, today, byDue);
      return Object.assign({}, t, { recv: a, pay: p, rt: r2(a[0] + a[1] + a[2] + a[3]), pt: r2(p[0] + p[1] + p[2] + p[3]) });
    });
  }
  /* top parties: by 'sales' (sold less returns), 'buys' (bought less returns), 'recv' (they owe us) or 'pay' (we owe them), biggest first */
  function topParties(moves, by, n, keep) {
    var v = function (p) { return by === 'recv' ? p.close : by === 'pay' ? -p.close : p[by] || 0; };
    return Object.keys(moves).map(function (k) { return moves[k]; }).filter(function (p) { return v(p) > 0.004 && (!keep || keep(p.key)); })
      .sort(function (a, b) { return v(b) - v(a); }).slice(0, n || 10).map(function (p) { return Object.assign({ value: r2(v(p)) }, p); });
  }

  var API = { num: num, r2: r2, key: key, role: role, itemTotals: itemTotals, postings: postings, inBooks: inBooks, parties: parties, accounts: accounts,
    taxPay: taxPay, gstSet: gstSet, provision: provision, bills: bills, ageing: ageing, overdue: overdue, chargeLines: chargeLines, tcsRate: tcsRate, tcsPan: tcsPan, panOk: panOk, addDays: addDays, mainRate: mainRate, statement: statement, book: book, daysBetween: daysBetween, moneyAcct: moneyAcct, payAcct: payAcct, bounced: bounced, partyName: partyName, partiesOf: partiesOf, jvAcct: jvAcct,
    vtype: vtype, ledger: ledger, billwise: billwise, groupsOf: groupsOf, groupChain: groupChain, partyGroup: partyGroup, inGroup: inGroup, groupTree: groupTree,
    partyMoves: partyMoves, groupSummary: groupSummary, groupDues: groupDues, topParties: topParties, BUILTIN: BUILTIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSBooks = API;
})(this);
