/* NSBooks: the accounts underneath NSBiz (Phase 2: money in and out).
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
     receipt adv + gstAdv        advance for services with GST inside (s.13 CGST Act: tax due when it is received): Dr 'gst-adv'
                                 (GST paid on advances), Cr output GST; the customer still holds the whole amount as an advance
     advadj (made here)          not stored: when a later bill or a refund uses a GST advance, inBooks() adds an 'advadj' record
                                 (Dr output GST, Cr 'gst-adv' for the tax inside the part used), so the tax is not paid twice; see advAdjust()
     pdd                         provision for doubtful debts (WP-3): change = new figure - provision before; Dr / Cr exp:provision for doubtful debts
     salary (acct)               salary slip ticked "Add to my accounts" (WP-5): Dr salary + employer PF/ESI, Cr PF / ESI / professional tax /
                                 TDS payable, the staff advance recovered, other deductions, net pay to 'sal-payable'; see salSplit().
                                 pay { date, mode } (or payDate / payMode, as the slip maker saves it) = net pay paid: inBooks0() adds a 'salpay' record (Dr sal-payable, Cr cash/bank)
     rent (acct)                 rent receipt we issued as landlord: Dr cash/bank, Cr inc:rent received (rent x months)
     petty (acct)                petty cash book: every line with an amount paid becomes a 'pettyl' record dated that line (Dr the head,
                                 Cr cash); money received into the petty cash is cash moving inside the business and is not posted
     sadv                        advance to an employee (kind 'give') or paid back in cash (kind 'back'): account 'sadv:<employee>'
     loan (recv)                 loan master: lender, amount, rate, months, emi, first (first EMI date), lt 'loan' | 'od'; with recv the money
                                 received is posted (Dr cash/bank, Cr loan:<lender>), else the loan is already in the books (capital and loans form)
     emi                         loan instalment paid: Dr loan:<lender> principal + exp:interest on loan, Cr cash/bank; schedule() suggests the split
     fa kind 'buy' / 'sale'      fixed asset bought (Dr fa:<asset>, GST credit if itc) / sold (Cr the book value bv saved on the record,
                                 the difference is profit or loss on sale); mode 'credit' = the party (buyer field) is owed / owes
   chq: { date, bank, st, on } on a receipt or voucher paid by cheque: st 'hand' (received, not deposited), 'dep' (deposited),
     'iss' (issued by us), 'ok' (cleared on date 'on'), 'bounce' (bounced: the record is left out of the books, so its bills are due again).
     Until it clears, the money sits in 'chq-in' (cheques received) or 'chq-out' (cheques issued) instead of 'bank'.
   alloc: [{ id, amt }] on a receipt or app voucher links money to bills; whatever is not linked settles the oldest bills first.
   Several bank accounts (ERP masters step 3, 2026-11-19): the bank on the business record (bankName, bankAcc ...) is the default bank,
     account 'bank', so no old record changes meaning. Extra banks of a business are kept in data home meta 'banks' =
     { <business id>: [{ id, name, acc, ifsc, branch }] } and post to 'bank:' + key(name). A record names its bank with d.bacct
     (the account key: 'bank' or 'bank:<name>'; d.bank is taken: the receipt slip prints it as the payer's bank); no d.bacct = the default bank. Contra: from / to are 'cash', 'bank' (= d.bacct, or the
     default) or a bank key (bank to bank transfer). Opening bank balance: ob side 'bank' + d.bacct. A cleared cheque goes to d.bacct. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var UT = { '04': 1, '26': 1, '31': 1, '35': 1, '38': 1 };
  var BANKISH = { upi: 1, cheque: 1, bank: 1, card: 1, dd: 1, other: 1 };
  function isBank(a) { return a === 'bank' || String(a || '').indexOf('bank:') === 0; }
  function bankKey(name) { var k = key(name); return k ? 'bank:' + k : 'bank'; }
  function bankOf(d) { return d && isBank(d.bacct) ? d.bacct : 'bank'; }
  function moneyAcct(mode, bank) { return BANKISH[mode] ? (isBank(bank) ? bank : 'bank') : 'cash'; }
  /* names of the bank accounts for reports: setBanks([{ k, name }]) by the page (the business's banks); unknown 'bank:x' = 'Bank: X' */
  var BANKNM = {};
  function setBanks(list) { BANKNM = {}; (list || []).forEach(function (b) { if (b && isBank(b.k) && String(b.name || '').trim()) BANKNM[b.k] = String(b.name).trim(); }); }
  function bankName(a) {
    if (BANKNM[a] && (a !== 'bank' || Object.keys(BANKNM).length > 1)) return BANKNM[a];
    if (a === 'bank') return 'Bank';
    return 'Bank: ' + String(a).slice(5).replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }
  /* the bank accounts of a business: the default bank (its own bank details) first, then the extra ones of meta 'banks'.
     [{ k, name, acc, ifsc, branch, def, id }]; label = the name for a default bank with no name ('Bank') */
  function bankList(biz, meta, label) {
    if (!biz) return [];
    var out = [{ k: 'bank', def: 1, name: String(biz.bankName || '').trim() || label || 'Bank', acc: biz.bankAcc || '', ifsc: biz.bankIfsc || '', branch: biz.bankBranch || '' }];
    ((biz.id && meta && meta[biz.id]) || []).forEach(function (x) { if (x && String(x.name || '').trim() && bankKey(x.name) !== 'bank' && !out.some(function (o) { return o.k === bankKey(x.name); })) out.push(Object.assign({}, x, { k: bankKey(x.name) })); });
    return out;
  }
  /* contra direction: 'dep' cash to bank, 'wd' bank to cash, 'xfer' bank to bank */
  function contraSide(d, x, def) { if (x === 'cash') return 'cash'; if (isBank(x)) return x === 'bank' ? bankOf(d) : x; return def === 'cash' ? 'cash' : bankOf(d); }
  function contraKind(d) { var f = contraSide(d, d.from, 'cash'), t = contraSide(d, d.to, 'bank'); return f === 'cash' ? 'dep' : t === 'cash' ? 'wd' : 'xfer'; }
  function bounced(d) { return !!(d.chq && d.chq.st === 'bounce' && d.mode === 'cheque'); }
  /* where the money of a receipt / voucher went: a cheque not cleared yet is not in the bank */
  function payAcct(d, out) { return d.mode === 'cheque' && d.chq && d.chq.st && d.chq.st !== 'ok' ? (out ? 'chq-out' : 'chq-in') : moneyAcct(d.mode, d.bacct); }

  /* tax split of an item document (same rules as docs.js totals) */
  function isExpInv(d) { return !!d && (d.type === 'expinv' || d.type === 'exp' && Array.isArray(d.items) && !!d.seller && !d.app); }
  var EXPSUP = { expwp: 'EXPWP', expwop: 'EXPWOP', sezwp: 'SEZWP', sezwop: 'SEZWOP' };
  /* an export / SEZ invoice read as a tax invoice with its supply type (GSTR-1 6A / SEZ, GSTR-3B 3.1(b)) */
  function asInvoice(d) {
    if (!isExpInv(d)) return d;
    var c = Object.assign({}, d, { type: 'invoice', kind: 'tax', expKind: d.kind });
    c.einv = Object.assign({}, d.einv || {}, { sup: (d.einv && d.einv.sup && d.einv.sup !== 'B2B') ? d.einv.sup : EXPSUP[d.kind] || 'EXPWOP' });
    if (/^exp/.test(d.kind || 'exp') && !c.pos) c.pos = '96';
    return c;
  }
  /* money taken on a hotel stay, job card, garage job, bilty...: the advance, or the whole bill when it is marked paid (F6-9) */
  function hotelPaid(d, total) { if (!d.type || /^(invoice|cashmemo|note)$/.test(d.type) || d.status === 'paid' || d.paidBy) return 0;   /* paid by the bill's own status or a linked receipt: counted there */ return d.paid === 'paid' || d.status2 === 'paid' ? r2(total) : r2(Math.min(num(d.adv), total)); }
  function itemTotals(d) {
    var noTax = d.kind === 'supply' || d.kind === 'plain' || d.withGst === false || d.type === 'pbill' && d.noGst;
    /* a purchase bill comes from the supplier (buyer field) to us (seller field) */
    var buy = d.type === 'pbill', origin = buy ? d.buyer && d.buyer.state : d.seller && d.seller.state;
    var dest = buy ? d.seller && d.seller.state : d.pos || d.buyer && d.buyer.state || origin;
    origin = origin || dest;
    var intra = (!origin || !dest || origin === dest || d.type === 'hotel') && !isExpInv(d), o = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };   /* hotel: place of supply is the hotel (F6-7) */
    (d.items || []).forEach(function (it) {
      var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), rate = num(it.rate);
      if (!it.desc && !rate) return;
      var taxable = r2(q * rate - q * rate * num(it.disc) / 100), tax = noTax ? 0 : r2(taxable * num(it.gst) / 100);
      if (intra) tax = r2(r2(tax / 2) * 2);   /* CGST = SGST = half the line's GST to the paisa: the same rule as the bill, GSTR-1 and the e-invoice (F3-6) */
      o.taxable += taxable;
      if (intra) { o.cgst += tax / 2; o.sgst += tax / 2; } else o.igst += tax;
    });
    /* extra charges (freight, packing, insurance): part of the taxable value; GST at the main item's rate or their own rate */
    var main = mainRate(d);
    (d.charges || []).forEach(function (c) {
      var amt = r2(num(c.amt)); if (!amt) return;
      var tax = noTax ? 0 : r2(amt * (c.gst === '' || c.gst == null || c.gst === 'main' ? main : num(c.gst)) / 100);
      if (intra) tax = r2(r2(tax / 2) * 2);
      o.taxable += amt;
      if (intra) { o.cgst += tax / 2; o.sgst += tax / 2; } else o.igst += tax;
    });
    /* CGST + SGST add up to exactly the tax on the lines, split as the printed invoice splits it (docs.js totals): CGST rounded, SGST the rest (P1-21) */
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
    if (bounced(d) || d.cancelled) return '';   /* ERP Round 1, A-3: a cancelled voucher keeps its number and posts nothing */
    switch (d.type || 'invoice') {
      case 'invoice': case 'cashmemo': case 'pharma': case 'jewel': case 'garment': return 'sale';   /* jewel: jewellery.niveshsahayak.in, garment: garment.niveshsahayak.in */   /* pharma: pharmacy.niveshsahayak.in */
      case 'resto': return d.status === 'open' ? '' : 'sale';   /* restaurant: a running table is not a sale yet */
      case 'lr': return 'sale';   /* bilty: freight earned; the payer is the customer */
      case 'visit': case 'svc': return num(d.total) ? 'sale' : '';   /* clinic visit bill, salon / gym / coaching bill or membership: a sale when it has an amount */
      case 'fee': return 'sale';   /* fee receipt: fees received (status paid) */
      case 'rentb': return d.print === 'bill' ? 'sale' : '';   /* rent bill of a property tenancy: a sale once it is a bill (an agreement card is not) */
      case 'hotel': return d.print === 'bill' && d.stay !== 'cancel' ? 'sale' : '';   /* hotel stay: a sale once it is printed as a bill */
      case 'tsh': return 'sale';   /* tripsheet.: a taxi trip sheet, travel booking bill or courier statement is a sale to its customer (India plan C) */
      case 'gjob': return d.print === 'bill' ? 'sale' : '';   /* garage job card: a sale once it is a service bill */
      case 'job': return d.print === 'bill' ? 'sale' : '';   /* job card: a sale once it is a service bill */
      case 'rabill': return 'sale';   /* contractor RA bill: value of work in this bill (retention and TDS settle at payment) */
      case 'note': if (d.side === 'purchase') return d.kind === 'debit' ? 'pret' : 'buy';   /* against a purchase: debit note = supplier owes back (like a purchase return), credit note = we owe more */
        return d.kind === 'debit' ? 'sdeb' : 'sret';
      case 'receipt': return d.kind === 'ref' ? 'refund' : 'in';
      case 'voucher': return d.forBill ? 'out' : 'outexp';
      case 'self': return 'buy';
      case 'pbill': return d.kind === 'return' ? 'pret' : 'buy';
      case 'expinv': return 'sale';   /* export / SEZ invoice (F3-10) */
      case 'exp': return isExpInv(d) ? 'sale' : 'exp';
      case 'ob': return 'ob';
      case 'contra': return 'contra';
      case 'jv': return 'jv';
      case 'fa': return d.kind === 'sale' ? 'fasale' : 'fabuy';
      case 'don': return 'oinc';   /* donation or subscription received by a trust / society (trust.js): income, like other income received */
      case 'oinc': return 'oinc';   /* other income received (Accounts coverage WP-2) */
      case 'taxpay': return 'taxpay';   /* tax paid to the government or a tax refund (WP-4) */
      case 'gstset': return 'gstset';   /* GSTR-3B set-off of a tax period (WP-4) */
      case 'wo': return 'wo';   /* balance of a bill written off (WP-3) */
      case 'pdd': return 'pdd';   /* provision for doubtful debts (WP-3) */
      case 'advadj': return 'advadj';   /* GST of an advance used by a bill or refunded (made by advAdjust, never stored) */
      case 'salary': return d.acct ? 'sal' : '';   /* WP-5: only slips ticked "Add to my accounts" (older slips stay out until ticked) */
      case 'salpay': return 'salpay';   /* net salary paid (made by inBooks0 from the slip's pay date, never stored) */
      case 'rent': return d.acct ? 'rentin' : '';
      case 'pettyl': return 'pettyl';   /* one paid line of a petty cash book (made by inBooks0, never stored) */
      case 'sadv': return 'sadv';
      case 'loan': return d.recv ? 'loan' : '';
      case 'emi': return 'emi';
      case 'stk': return d.kind === 'adj' && d.val ? 'stkadj' : '';   /* ERP round 2, I-7: a stock adjustment saved with its value (stkAdj) */
    }
    return '';
  }

  /* ERP round 1 (I-1, I-2): how a saved record moves goods, one rule for the stock register (stockcore.js) and the books, so the
     two can never drift. 'sale' goods out (every goods sale: invoice, cash memo, pharmacy, jewellery, garment, export invoice,
     a closed restaurant bill, a job / garage card printed as a bill), 'sret' sales return in (credit note, reason ret),
     'buy' in (purchase bill, self invoice), 'pret' out back to the supplier (purchase return, debit note reason ret),
     'dn' goods out on a delivery challan (kind sale / approval: invoice to follow), 'dnmove' a challan moving goods to another
     godown (kind transfer, d.toGd), 'dnjob' a challan sending goods to a job worker (kind job), '' no goods move.
     Service sales (bilty, clinic, fees, hotel, trip sheet, RA bill) never move stock. */
  var STK_SALE = { invoice: 1, cashmemo: 1, pharma: 1, jewel: 1, garment: 1, expinv: 1, exp: 1, resto: 1, gjob: 1, job: 1 };
  function stockRole(d) {
    if (!d) return '';
    var ty = d.type || 'invoice';
    if (ty === 'challan') return d.kind === 'sale' || d.kind === 'approval' || !d.kind ? 'dn' : d.kind === 'transfer' ? (String(d.toGd || '').trim() ? 'dnmove' : '') : d.kind === 'job' ? 'dnjob' : '';
    var r = role(d);
    if (r === 'sale') return STK_SALE[ty] ? 'sale' : '';
    if (ty === 'pbill') return d.kind === 'return' ? 'pret' : 'buy';
    if (ty === 'self') return 'buy';
    if (ty === 'note' && d.reason === 'ret') return r === 'pret' ? 'pret' : r === 'sret' ? 'sret' : '';
    return '';
  }

  /* ERP round 2 (orders), I-7: a stock adjustment saved with its value (stock site: d.val, it.value, it.itcRev) as
     [debit account, amount, credit account]. Goods leave the purchases at cost (periodic method: closing stock is already lower,
     so this only names the loss): Dr the loss head, Cr purchases; own use goes to drawings. The GST input credit taken on them
     is reversed (s.17(5)(g)/(h) CGST Act): Dr the same head, Cr input GST; GSTR-3B shows it in 4(B)(1) (gstr3b.js). */
  var ADJH = { damage: 'exp:loss by damage', expired: 'exp:loss by damage', lost: 'exp:loss by theft', short: 'exp:stock shortage', own: 'drw:drawings',
    sample: 'exp:free samples', gift: 'exp:gifts and free goods' };
  function stkAdj(d) {
    var L = [];
    (d && d.lines || []).forEach(function (it) {
      var h = ADJH[it.reason]; if (!h) return;
      var v = r2(num(it.value)); if (v > 0) L.push([h, v, 'purchases']);
      var t = it.itcRev || {}; ['igst', 'cgst', 'sgst'].forEach(function (g) { var x = r2(num(t[g])); if (x > 0) L.push([h, x, 'gst-in-' + g]); });
    });
    return L;
  }
  function adjItc(d) { var o = { igst: 0, cgst: 0, sgst: 0 }; if (role(d) === 'stkadj') (d.lines || []).forEach(function (it) { if (ADJH[it.reason]) ['igst', 'cgst', 'sgst'].forEach(function (g) { o[g] = r2(o[g] + num(it.itcRev && it.itcRev[g])); }); }); return o; }

  /* double-entry lines of one record: [{ a: account, dr, cr }]; party accounts are 'p:<name key>' */
  function postings(d) {
    var R = role(d), P = 'p:' + key(partyName(d)), L = [];
    function dr(a, v) { v = r2(v); if (v) L.push({ a: a, dr: v, cr: 0 }); }
    function cr(a, v) { v = r2(v); if (v) L.push({ a: a, dr: 0, cr: v }); }
    var t, amt;
    if (d.gen && (R === 'in' || R === 'out' || R === 'outexp')) { genPost(d, dr, cr); return L; }   /* A-10: Receipt / Payment with any ledgers and several lines */
    if (R === 'sale' || R === 'sret' || R === 'sdeb') {
      t = itemTotals(d);
      var side = R === 'sret' ? cr : dr, other = R === 'sret' ? dr : cr, sales = R === 'sret' ? 'sales-return' : 'sales';
      side(partyName(d) ? P : 'p:cash-customer', t.total);
      ledSplit(d, t.taxable, 'sl', sales).forEach(function (x) { other(x[0], x[1]); });   /* A-9: several sales ledgers */
      other('gst-out-cgst', t.cgst); other(t.ut ? 'gst-out-utgst' : 'gst-out-sgst', t.sgst); other('gst-out-igst', t.igst);
      other('tcs-payable', t.tcs);
      if (t.round) (t.round > 0 ? other : side)('round-off', Math.abs(t.round));
      /* marked paid on the bill itself (no payment entry linked): money came in on the bill date */
      /* old gold taken in exchange (jewellery): bought from the customer at its value and set off against the bill, so the customer owes that much less */
      var ex = R === 'sale' ? Math.min(num(d.exch), t.total) : 0;
      if (ex > 0) { dr('purchases', ex); cr(partyName(d) ? P : 'p:cash-customer', ex); }
      if (R === 'sale' && d.status === 'paid' && !d.paidBy) { dr(moneyAcct(d.payMode || 'cash', d.bacct), r2(t.total - ex)); cr(partyName(d) ? P : 'p:cash-customer', r2(t.total - ex)); }
      if (R === 'sale') { var ha = hotelPaid(d, t.total); if (ha > 0) { dr(moneyAcct(d.payMode || 'cash', d.bacct), ha); cr(partyName(d) ? P : 'p:cash-customer', ha); } }   /* hotel: advance at booking / paid at check-out (F6-9) */
    } else if (R === 'in') {
      amt = num(d.amount); var tds = num(d.tds), dsc = num(d.disc);   /* disc: cash discount allowed when the customer paid (WP-3) */
      dr(payAcct(d), amt); dr('tds-receivable', tds); dr(DISC_A, dsc); cr(P, amt + tds + dsc);
      var at = advTax(d);   /* advance for services with GST inside: the tax is due now (output GST), held in 'gst-adv' until a bill uses it */
      if (at) { dr(GADV, at.tax); cr('gst-out-cgst', at.cgst); cr(at.ut ? 'gst-out-utgst' : 'gst-out-sgst', at.sgst); cr('gst-out-igst', at.igst); }
    } else if (R === 'advadj') {   /* the tax of the part of an advance a bill (or a refund) used: no longer due a second time */
      dr('gst-out-cgst', d.cgst); dr(d.ut ? 'gst-out-utgst' : 'gst-out-sgst', d.sgst); dr('gst-out-igst', d.igst); cr(GADV, r2(num(d.cgst) + num(d.sgst) + num(d.igst)));
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
      else (d.lines || []).forEach(function (l) { dr(expAcct(l.head), num(l.amt)); });
      cr(payAcct(d, true), gross - tdsOut); cr('tds-payable', tdsOut);
      var rc = rcmTax(d);   /* S-8: reverse charge on the voucher: tax payable by us and (when eligible) input credit, IGST when inter-state */
      if (rc) { if (rc.itc === 'ok') { dr('gst-in-igst', rc.igst); dr('gst-in-cgst', rc.cgst); dr('gst-in-sgst', rc.sgst); } else dr(R === 'out' ? 'purchases' : expAcct((d.lines || [])[0] && d.lines[0].head), rc.tax); cr('gst-rcm-payable', rc.tax); }
    } else if (R === 'buy' || R === 'pret') {
      t = itemTotals(d);
      var s2 = R === 'pret' ? cr : dr, o2 = R === 'pret' ? dr : cr, buys = R === 'pret' ? 'purchase-return' : 'purchases';
      /* a self invoice for services only (every line a SAC, 99…) is an expense, not goods bought for resale (round C) */
      if (d.type === 'self' && (d.items || []).length && d.items.every(function (it) { return !String(it.desc || '').trim() || /^99/.test(String(it.hsn || '')); })) buys = 'exp:prof';
      var bk = itcBlk(d);   /* S-5: GST of lines with blocked (s.17(5)) or ineligible credit is part of the cost, not input credit */
      if (buys === 'purchases' || buys === 'purchase-return') { var psl = ledSplit(d, t.taxable, 'pl', buys); psl[0][1] = r2(psl[0][1] + bk.tax); psl.forEach(function (x) { s2(x[0], x[1]); }); } else s2(buys, r2(t.taxable + bk.tax));   /* A-9: several purchase ledgers */
      t = Object.assign({}, t, { cgst: r2(t.cgst - bk.cgst), sgst: r2(t.sgst - bk.sgst), igst: r2(t.igst - bk.igst) });
      if (d.type === 'self') {   /* reverse charge: input tax credit and tax payable both, supplier gets the taxable value */
        s2('gst-in-cgst', t.cgst); s2('gst-in-sgst', t.sgst); s2('gst-in-igst', t.igst); t = Object.assign({}, t, { cgst: r2(t.cgst + bk.cgst), sgst: r2(t.sgst + bk.sgst), igst: r2(t.igst + bk.igst) });
        o2('gst-rcm-payable', t.cgst + t.sgst + t.igst); o2(P, t.taxable);
        if (d.status === 'sipaid') { dr(P, t.taxable); cr(moneyAcct(d.payMode || 'cash', d.bacct), t.taxable); }
      } else {
        s2('gst-in-cgst', t.cgst); s2('gst-in-sgst', t.sgst); s2('gst-in-igst', t.igst); s2('tcs-receivable', t.tcs);
        if (t.round) (t.round > 0 ? s2 : o2)('round-off', Math.abs(t.round));
        o2(P, t.total);
        if (R === 'buy' && tdsBk(d)) { dr(P, tdsBk(d)); cr('tds-payable', tdsBk(d)); }   /* ERP round 2 S-20: TDS cut when the bill is booked */
      }
    } else if (R === 'exp') {
      amt = num(d.amount); var g = num(d.gst), itc = d.itc && g ? r2(amt * g / (100 + g)) : 0;
      dr('exp:' + key(d.cat || 'Miscellaneous'), amt - itc);
      if (itc) { if (d.inter) dr('gst-in-igst', itc); else { dr('gst-in-cgst', r2(itc / 2)); dr('gst-in-sgst', itc - r2(itc / 2)); } }
      if (d.mode === 'credit') cr(partyName(d) ? P : 'p:unknown', amt - tdsBk(d)); else cr(moneyAcct(d.mode, d.bacct), amt - tdsBk(d));
      cr('tds-payable', tdsBk(d));   /* ERP round 2 S-20: TDS cut on the expense: less paid (or owed), TDS payable */
    } else if (R === 'contra') {
      amt = num(d.amount); dr(contraSide(d, d.to, 'bank'), amt); cr(contraSide(d, d.from, 'cash'), amt);
    } else if (R === 'jv') {
      (d.lines || []).forEach(function (l) { var a = jvAcct(l); if (!a) return; dr(a, num(l.dr)); cr(a, num(l.cr)); });
    } else if (R === 'fabuy') {
      amt = num(d.amount); var fg = d.itc ? num(d.gstAmt) : 0, fk = 'fa:' + key(d.name || 'Fixed asset');
      /* an asset the business already owned when the books start: no payment, no GST now, against the opening balance (round C) */
      if (d.mode === 'own') { dr(fk, amt); cr('opening', amt); return L; }
      dr(fk, amt + (d.itc ? 0 : num(d.gstAmt)));
      if (fg) { if (d.inter) dr('gst-in-igst', fg); else { dr('gst-in-cgst', r2(fg / 2)); dr('gst-in-sgst', fg - r2(fg / 2)); } }
      if (d.mode === 'credit') cr(partyName(d) ? P : 'p:unknown', amt + num(d.gstAmt)); else cr(moneyAcct(d.mode, d.bacct), amt + num(d.gstAmt));
    } else if (R === 'fasale') {
      amt = num(d.amount); var bv = num(d.bv), sk = 'fa:' + key(d.name || 'Fixed asset'), sg = num(d.gstAmt);
      if (d.mode === 'credit') dr(partyName(d) ? P : 'p:unknown', amt + sg); else dr(moneyAcct(d.mode, d.bacct), amt + sg);
      if (sg) { if (d.inter) cr('gst-out-igst', sg); else { cr('gst-out-cgst', r2(sg / 2)); cr('gst-out-sgst', sg - r2(sg / 2)); } }
      cr(sk, bv);
      if (amt > bv) cr('inc:profit on sale of assets', amt - bv); else dr('exp:loss on sale of assets', bv - amt);
    } else if (R === 'sal') {   /* salary slip (WP-5) */
      var s = salSplit(d);
      var pvG = r2(num(d.prov && d.prov.grat)), pvB = r2(num(d.prov && d.prov.bonus));   /* full and final: gratuity / bonus already provided for come out of the provision */
      dr(SALX, r2(s.gross - pvG - pvB)); dr('ocl:provision for gratuity', pvG); dr('ocl:bonus payable', pvB); dr(ERX, s.erPf + s.erEsi);
      cr('inc:notice pay recovered', s.notice);
      cr('pf-payable', s.pf + s.erPf); cr('esi-payable', s.esi + s.erEsi); cr('pt-payable', s.pt); cr('tds-payable', s.tds);
      if (s.lwf || s.erLwf) { dr(LWFX, s.erLwf); cr('lwf-payable', s.lwf + s.erLwf); }   /* ERP round 2: labour welfare fund, employee + employer */
      if (s.adv) cr(SADV + key(partyName(d) || 'staff'), s.adv);
      cr(ODED, s.other); cr(SALP, s.net);
    } else if (R === 'salpay') {
      dr(SALP, num(d.amount)); cr(payAcct(d, true), num(d.amount));
    } else if (R === 'rentin') {
      amt = rentTotal(d); dr(moneyAcct(d.mode, d.bacct), amt); cr('inc:rent received', amt);
    } else if (R === 'pettyl') {
      if (d.kind === 'frombank') { dr('cash', num(d.amount)); cr(bankOf(d), num(d.amount)); } else { dr(expAcct(d.head), num(d.amount)); cr('cash', num(d.amount)); }
    } else if (R === 'sadv') {
      amt = num(d.amount); var sa = SADV + key(d.emp || partyName(d) || 'staff');
      if (d.kind === 'back') { dr(payAcct(d), amt); cr(sa, amt); } else { dr(sa, amt); cr(payAcct(d, true), amt); }
    } else if (R === 'loan') {
      dr(payAcct(d), num(d.amount)); cr(loanAcct(d), num(d.amount));
    } else if (R === 'emi') {
      dr(loanAcct(d), num(d.principal)); dr(INTL, num(d.interest)); cr(payAcct(d, true), r2(num(d.principal) + num(d.interest)));
    } else if (R === 'stkadj') {   /* ERP round 2, I-7 */
      stkAdj(d).forEach(function (l) { dr(l[0], l[1]); cr(l[2], l[1]); });
    } else if (R === 'ob') {
      amt = num(d.amount);
      if (d.side === 'cash' || d.side === 'bank') { var oa = d.side === 'bank' ? bankOf(d) : 'cash'; if (amt < 0) { dr('opening', -amt); cr(oa, -amt); } else { dr(oa, amt); cr('opening', amt); } }   /* below 0: an overdrawn bank (cash credit) on the start date */   /* cash in hand / bank balance on the start date */
      else if (d.side === 'pay') { dr('opening', amt); cr(P, amt); } else { dr(P, amt); cr('opening', amt); }
    }
    return L;
  }

  /* ---------- GST input credit rules (ERP round 1, r1-gst: S-8 reverse charge on vouchers, S-5 blocked credit) ---------- */
  /* S-8: reverse charge tax on a payment voucher ticked 'rcm' (section 9(3) / 9(4) CGST Act, section 5(3) IGST Act): the base is the
     voucher total (as slip.js prints it), tax at rcmRate. Inter-state (IGST) when d.rcmInter is ticked, or when the supplier's state
     (d.rcmState, else the payee's state or GSTIN) differs from ours (section 7(1) / 8(1) IGST Act: location of supplier vs place of supply,
     which for most reverse charge services to a registered recipient is the recipient's location, section 12(2) / 12(8) IGST Act).
     d.rcmItc 'blocked' / 'ineligible' = no input credit (s.17(5)): the tax is a cost. CGST = half rounded, SGST the rest (as GSTR-3B). */
  function rcmTax(d) {
    if (!d || !d.rcm || (d.type || '') !== 'voucher' || bounced(d)) return null;
    var base = r2((d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0)), rt = num(d.rcmRate), tax = r2(base * rt / 100);
    if (!(tax > 0)) return null;
    var ours = d.seller && d.seller.state || '', g = String(d.buyer && d.buyer.gstin || '').toUpperCase();
    var sup = d.rcmState || d.buyer && d.buyer.state || (/^\d{2}[A-Z]/.test(g) ? g.slice(0, 2) : '');
    var inter = d.rcmInter === true || d.rcmInter !== false && !!(sup && ours && sup !== ours);
    var o = { base: base, rate: rt, tax: tax, inter: inter, igst: 0, cgst: 0, sgst: 0, ut: !inter && !!UT[ours], itc: /^(blocked|ineligible)$/.test(d.rcmItc || '') ? d.rcmItc : 'ok' };
    if (inter) o.igst = tax; else { o.cgst = r2(tax / 2); o.sgst = r2(tax - o.cgst); }
    return o;
  }
  /* S-5: the GST of a purchase bill (or self invoice, purchase note) on lines whose credit is blocked or ineligible:
     line.itc, else the bill's itc ('ok' | 'blocked' | 'ineligible'). { cgst, sgst, igst, tax, blk: {..}, inel: {..} } */
  function lineItcOf(it, d) { var v = it && it.itc || typeof d.itc === 'string' && d.itc || 'ok'; return /^(blocked|ineligible)$/.test(v) ? v : 'ok'; }
  function itcBlk(d) {
    var o = { cgst: 0, sgst: 0, igst: 0, tax: 0, blk: { cgst: 0, sgst: 0, igst: 0 }, inel: { cgst: 0, sgst: 0, igst: 0 } };
    if (!d || !/^(pbill|self|note)$/.test(d.type || '')) return o;
    ['blocked', 'ineligible'].forEach(function (k) {
      var L = (d.items || []).filter(function (it) { return lineItcOf(it, d) === k; }), ch = typeof d.itc === 'string' && d.itc === k ? d.charges : [];
      if (!L.length && !(ch && ch.length)) return;
      var x = itemTotals(Object.assign({}, d, { items: L, charges: ch || [], tcs: null, total: null })), w = k === 'blocked' ? o.blk : o.inel;
      ['cgst', 'sgst', 'igst'].forEach(function (h) { w[h] = x[h]; o[h] = r2(o[h] + x[h]); });
    });
    o.tax = r2(o.cgst + o.sgst + o.igst);
    return o;
  }

  /* ---------- GST on advances received for services (round C, C-16) ---------- */
  /* Rules: services: time of supply = date the advance is received (CGST Act s.13(2)), so its GST goes in GSTR-3B 3.1(a) and GSTR-1 table 11A
     of that month; when the invoice is issued (or the advance is refunded) the tax already paid is adjusted (GSTR-1 table 11B, 3.1(a) less).
     Goods: no GST on advances since Notification 66/2017-CT (15 Nov 2017), so only receipts ticked 'GST is included' (services) count. */
  var GADV = 'gst-adv';
  /* tax inside an advance receipt (same split as the printed receipt voucher in slip.js), or null */
  function advTax(d) {
    if (!d || d.type !== 'receipt' || d.kind !== 'adv' || !d.gstAdv || bounced(d) || d.cancelled) return null;
    var rt = num(d.rate), tot = r2(num(d.amount));
    if (!rt || !tot) return null;
    var p0 = (d.pos || (/^\d{2}[A-Z]/.test(String(d.buyer && d.buyer.gstin || '').toUpperCase()) ? String(d.buyer.gstin).slice(0, 2) : '')), st = d.seller && d.seller.state, pos = p0 || st, intra = !p0 || !st || p0 === st, tax = r2(tot * rt / (100 + rt));   /* payer's GSTIN when no place of supply is chosen (F4-6) */
    var o = { rate: rt, total: tot, tax: tax, taxable: r2(tot - tax), pos: pos, intra: intra, cgst: 0, sgst: 0, igst: 0 };
    if (intra) { o.cgst = r2(tax / 2); o.sgst = r2(tax - o.cgst); } else o.igst = tax;
    o.ut = !!(intra && UT[st || pos]);
    return o;
  }
  /* every use of a GST advance: which bill (or refund) took how much of it, dated the later of the two.
     Uses the same bill-wise matching as the dues (bills()), so the books, the dues and the returns always agree.
     [{ type: 'advadj', id, date, rv, rvId, rvDate, bill, billId, billType, refund, pname, pos, rate, gross, taxable, cgst, sgst, igst, ut, seller }] */
  var ADJC = { docs: null, biz: null, out: null };
  function advAdjust(docs, biz) {
    if (ADJC.docs === docs && ADJC.biz === biz) return ADJC.out;
    var rc = {}, any = false, out = [];
    inBooks0(docs, biz).forEach(function (d) { var a = advTax(d); if (a && a.tax) { rc[d.id] = { d: d, a: a, used: 0, tx: { cgst: 0, sgst: 0, igst: 0 } }; any = true; } });
    if (any) {
      var uses = {}, list = [], byIdA = {}; (docs || []).forEach(function (d) { if (d && d.id) byIdA[d.id] = d; });
      bills(docs, biz).every.forEach(function (b) {
        (b.by || []).forEach(function (x) {
          var c = rc[x.id]; if (!c || !(num(x.amt) > 0)) return;
          var bd = byIdA[b.id], L = bd && bd.items || [];
          if (b.type !== 'receipt' && L.some(function (it) { return String(it.hsn || '').trim(); }) && !L.some(function (it) { return /^99/.test(String(it.hsn || '').trim()); })) return;   /* a bill of goods (F3-13) */
          var k = x.id + '>' + b.id, u = uses[k];
          if (!u) { u = uses[k] = { c: c, b: b, amt: 0, date: (b.date || '') > (c.d.date || '') ? b.date : c.d.date }; list.push(u); }
          u.amt = r2(u.amt + num(x.amt));
        });
      });
      list.sort(function (x, y) { return (x.date || '').localeCompare(y.date || '') || String(x.b.id).localeCompare(String(y.b.id)); });
      list.forEach(function (u) {
        var c = u.c, a = c.a, amt = Math.min(u.amt, r2(a.total - c.used)); if (!(amt > 0)) return;
        c.used = r2(c.used + amt);
        var last = c.used >= a.total - 0.004;
        var part = function (h) { var v = last ? r2(a[h] - c.tx[h]) : r2(a[h] * amt / a.total); c.tx[h] = r2(c.tx[h] + v); return v; };
        var cg = part('cgst'), sg = part('sgst'), ig = part('igst'), tax = r2(cg + sg + ig), refund = u.b.type === 'receipt';
        out.push({ type: 'advadj', id: 'advadj:' + c.d.id + '>' + u.b.id, date: u.date, no: '', rv: c.d.no || '', rvId: c.d.id, rvDate: c.d.date, bill: u.b.no || '', billId: u.b.id, billType: u.b.type,
          refund: refund, pname: partyName(c.d), pos: a.pos, rate: a.rate, gross: amt, taxable: r2(amt - tax), cgst: cg, sgst: sg, igst: ig, ut: a.ut, seller: c.d.seller, created: 0,
          narr: 'GST on advance ' + (c.d.no || '') + ' adjusted ' + (refund ? 'on refund ' : 'against bill ') + (u.b.no || '') });
      });
    }
    ADJC = { docs: docs, biz: biz, out: out };
    return out;
  }

  /* ---------- salary, rent receipts, petty cash, staff advances, loans (Accounts coverage WP-5) ---------- */
  var SALX = 'exp:salary', ERX = 'exp:employer contribution to pf and esi', SALP = 'sal-payable', ODED = 'ocl:other deductions from salary',
    SADV = 'sadv:', INTL = 'exp:interest on loan', LWFX = 'exp:employer contribution to labour welfare fund';
  /* ERP round 2 S-20: TDS cut when a purchase bill or expense is booked (d.tds = { sec, rate, base, amt }) */
  function tdsBk(d) { return d && d.tds && (d.type === 'pbill' || d.type === 'exp') ? r2(num(d.tds.amt)) : 0; }
  /* a voucher or petty cash head: an advance to staff is money still owed back, not an expense */
  function expAcct(head) { var k = key(head || 'Miscellaneous'); return /^(advance to staff|staff advance|advance to employee)s?$/.test(k) ? SADV + 'staff' : 'exp:' + k; }
  function loanAcct(d) { return (d.lt === 'od' ? 'od:' : 'loan:') + key(d.lender || partyName(d) || 'loan'); }
  /* a salary slip in parts. Deduction lines are read by their name (the slip's own lines are English: PF, ESI, Professional tax, TDS);
     a line naming an advance or loan recovers the employee's staff advance; any other line is kept as 'other deductions'.
     erPf / erEsi = the employer's own PF and ESI (12% and 3.25%), costs of the business on top of the gross */
  function dedKind(desc) {
    var s = String(desc || '');
    if (/provident|\bE?PF\b/i.test(s)) return 'pf';
    if (/\bESIC?\b/i.test(s)) return 'esi';
    if (/professional|\bPT\b/i.test(s)) return 'pt';
    if (/\bTDS\b|income.?tax/i.test(s)) return 'tds';
    if (/labour welfare|\bLWF\b/i.test(s)) return 'lwf';
    if (/notice pay/i.test(s)) return 'notice';
    if (/advance|loan/i.test(s)) return 'adv';
    return 'other';
  }
  function salSplit(d) {
    var o = { gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, lwf: 0, notice: 0, adv: 0, other: 0, ded: 0, erPf: r2(num(d.erPf)), erEsi: r2(num(d.erEsi)), erLwf: r2(num(d.erLwf)) };
    (d.earn || []).forEach(function (l) { o.gross += num(l.amt); });
    (d.ded || []).forEach(function (l) { var v = num(l.amt); if (!v) return; o[dedKind(l.desc)] += v; o.ded += v; });
    ['gross', 'pf', 'esi', 'pt', 'tds', 'lwf', 'notice', 'adv', 'other', 'ded'].forEach(function (k) { o[k] = r2(o[k]); });
    o.net = r2(o.gross - o.ded); o.cost = r2(o.gross + o.erPf + o.erEsi + o.erLwf);
    return o;
  }
  function rentTotal(d) {
    var f = String(d.from || ''), t = String(d.to || '') >= f ? String(d.to) : f, n = 0;
    if (/^\d{4}-\d{2}$/.test(f)) for (var m = f; m <= t && n < 24; ) { n++; var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } m = y + '-' + String(mo).padStart(2, '0'); }
    return r2(num(d.rent) * (n || 1));
  }
  /* the records a stored one stands for in the books: a petty cash book is one record per paid line; a paid salary slip adds its payment */
  function expand(d) {
    /* mandi. and petrol. (vertical tools): the tool saves the books side of its record as ready-made records of the usual kinds in d.books (journal, cash memo, expense ...) */
    if ((d.type === 'mandi' || d.type === 'pump' || d.type === 'mpay') && d.books && d.books.length) return d.books.map(function (x, i) { return Object.assign({ no: d.no }, x, { id: d.id + '#bk' + i, src: d.id, date: x.date || d.date, seller: d.seller, created: d.created || 0 }); });
    /* dairy. (milk diary): one passbook = one journal entry made by NSDairy.books */
    if (d.type === 'dairy' && d.books && d.books.length) return d.books.map(function (x, i) { return Object.assign({ no: d.no }, x, { id: d.id + '#bk' + i, src: d.id, date: x.date || d.date, seller: d.seller, created: d.created || 0 }); });
    if (d.type === 'petty') {
      if (!d.acct) return [];
      var PL = [];
      (d.lines || []).forEach(function (l, i) {
        if (num(l.paid) > 0) PL.push({ type: 'pettyl', id: d.id + '#' + i, src: d.id, no: d.no || '', vno: l.vno || '', date: l.date || d.date, head: l.head || '', desc: l.desc || '', amount: r2(num(l.paid)), seller: d.seller, created: d.created || 0 });
        if (num(l.recd) > 0 && /bank|atm|withdr|cheque|chq/i.test((l.desc || '') + ' ' + (l.head || ''))) PL.push({ type: 'pettyl', kind: 'frombank', id: d.id + '#r' + i, src: d.id, no: d.no || '', vno: l.vno || '', date: l.date || d.date, head: '', desc: l.desc || '', amount: r2(num(l.recd)), seller: d.seller, created: d.created || 0 });   /* F6-5 */
      });
      return PL;
    }
    var pay = d.pay || (d.payDate ? { date: d.payDate, mode: d.payMode } : null);   /* the slip maker keeps payDate / payMode */
    if (d.type === 'salary' && d.acct && pay && pay.date) {
      var p = { type: 'salpay', id: d.id + '#pay', src: d.id, no: d.no || '', date: pay.date, mode: pay.mode || 'bank', bacct: pay.bacct || d.payBacct || '', chq: pay.chq, amount: salSplit(d).net, seller: d.seller, buyer: d.buyer, created: d.created || 0 };
      return p.amount > 0 ? [d, p] : [d];
    }
    return [d];
  }
  /* loan schedule (reducing balance, monthly): [{ n, date, emi, interest, principal, bal, paid (the emi record of that instalment) }].
     emi = the loan's own EMI, else worked out; the last line clears what is left. Paid instalments use their own split, so a rate
     change typed on a payment carries on to the later lines. */
  function addMonths(iso, k) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + k, day = +iso.slice(8, 10);
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
  }
  function emiOf(P, rate, n) { var r = num(rate) / 1200; P = num(P); n = Math.round(num(n)); if (!(P > 0) || !(n > 0)) return 0; return r ? r2(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)) : r2(P / n); }
  function schedule(loan, docs) {
    var P = num(loan.amount), n = Math.round(num(loan.months)), r = num(loan.rate) / 1200, emi = num(loan.emi) || emiOf(P, loan.rate, n), out = [], bal = P;
    var first = /^\d{4}-\d{2}-\d{2}$/.test(String(loan.first || '')) ? loan.first : loan.date ? addMonths(loan.date, 1) : '';
    var paid = {}; (docs || []).forEach(function (d) { if (d && d.type === 'emi' && d.loanId === loan.id) paid[num(d.n)] = d; });
    for (var k = 1; k <= Math.min(n, 600) && bal > 0.004; k++) {
      var p = paid[k], it = p ? r2(num(p.interest)) : r2(bal * r), pr = p ? r2(num(p.principal)) : k === n ? r2(bal) : r2(Math.min(bal, emi - it));
      bal = r2(bal - pr);
      out.push({ n: k, date: p ? p.date : first ? addMonths(first, k - 1) : '', emi: r2(it + pr), interest: it, principal: pr, bal: bal, paid: p || null });
    }
    return out;
  }
  /* what is still owed on a loan: amount less the principal of every EMI paid */
  function loanLeft(loan, docs) { var v = num(loan.amount); (docs || []).forEach(function (d) { if (d && d.type === 'emi' && d.loanId === loan.id) v -= num(d.principal); }); return r2(v); }

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
  var INTX = 'exp:interest on late payment of tax', FEEX = 'exp:late fee and penalty', ITCREV = 'exp:gst input credit reversed', ITCHOLD = 'gst-itc-held';
  /* what a tax payment debits (refunds: credits): [[account, amount]] and the total paid (received).
     gst      challan PMT-06: the money goes into the electronic cash ledger of each major head (gst.<head>.<minor head>)
     tds/tcs  challan of TDS or TCS deducted / collected: tax clears TDS (TCS) payable, interest and late fee are expenses
     adv      advance tax or self-assessment tax: d.to 'drw' (a proprietor's own tax = drawings) or 'oca' (tax paid in advance)
     gstref   GST refund received back from the cash ledger; itref income-tax refund (back to drawings or tax paid in advance) */
  function taxPay(d) {
    var L = [];
    function add(a, v) { v = r2(num(v)); if (v) L.push([a, v]); }
    if (d.kind === 'gst' || d.kind === 'gstref') GSTH.forEach(function (h) { var g = d.gst && d.gst[h] || {}; add('gstcash-' + h, MINOR.reduce(function (s, m) { return s + num(g[m]); }, 0)); });
    else if (/^(tds|tcs|pf|esi|pt|lwf)$/.test(d.kind)) { add(d.kind + '-payable', d.tax); add(INTX, d['int']); add(FEEX, d.fee); }   /* pf / esi / pt: from salary slips (F2-17) */
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
      /* S-7 (r1-gst): credit reversed in GSTR-3B 4(B)(1) for good (rule 42 and the like: a cost), and rule 37 credit held until the
         supplier is paid ('gst-itc-held', taken back when below 0) */
      add(ITCREV, d.rev && d.rev[h], 'gst-in-' + h);
      var hold = r2(num(d.r37 && d.r37[h])); if (hold > 0) add(ITCHOLD, hold, 'gst-in-' + h); else if (hold < 0) add('gst-in-' + h, -hold, ITCHOLD);
    });
    return L;
  }

  /* account of one journal line: 'party' = the party's own account, else the account key typed in the line */
  function jvAcct(l) { if (!l) return ''; if (l.a === 'party') return l.party ? 'p:' + key(l.party) : ''; return String(l.a || '').trim(); }
  /* every party a record touches: { key: name } (a journal entry can name several) */
  function partiesOf(d) {
    var o = {};
    if (role(d) === 'jv' || d.gen && role(d)) (d.lines || []).forEach(function (l) { if (l.a === 'party' && String(l.party || '').trim()) o[key(l.party)] = String(l.party).trim(); });
    else if (partyName(d)) o[key(partyName(d))] = partyName(d);
    return o;
  }

  /* the business's records in date order (same date: sales and bills before money, so a same-day payment settles them) */
  var ORDER = { ob: 0, sale: 1, sdeb: 1, buy: 1, exp: 1, fabuy: 1, sret: 2, pret: 2, 'in': 3, out: 3, outexp: 3, refund: 3, fasale: 3, oinc: 3, taxpay: 3, sal: 1, rentin: 3, salpay: 3, pettyl: 3, sadv: 3, loan: 3, emi: 3, advadj: 4, wo: 4, contra: 4, jv: 5, gstset: 6, pdd: 7, stkadj: 3 };
  function byOrder(x, y) { return (x.date || '').localeCompare(y.date || '') || ORDER[role(x)] - ORDER[role(y)] || (x.created || 0) - (y.created || 0); }
  /* the stored records only ('advadj' records are made by advAdjust, never read back from the documents) */
  function inBooks0(docs, biz) {
    var b = key(biz);
    var out = [];
    (docs || []).forEach(function (d) {
      if (!d || d.type === 'advadj' || d.type === 'salpay' || d.type === 'pettyl' || b && bizOf(d) !== b) return;
      expand(d).forEach(function (x) { if (role(x)) out.push(x); });
    });
    return out.sort(byOrder);
  }
  /* the records in the books: stored ones plus the GST adjustments of advances used (round C) */
  function inBooks(docs, biz) {
    var L = inBooks0(docs, biz), A = advAdjust(docs, biz);
    return A.length ? L.concat(A).sort(byOrder) : L;
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
    var list = inBooks0(docs, biz).filter(function (d) { return !partyKey || partiesOf(d)[partyKey]; });
    var open = {}, byId = {}, credits = [], strict = isStrict(biz);   /* A-12: strict bill-wise = money goes only where it is told */
    function pk(d) { return key(partyName(d)); }
    /* F4-10: a refund names the advance receipt it pays back (rv): that advance settles the refund first, not the party's other bills */
    var refundOf = {}; list.forEach(function (d) { if (role(d) === 'refund' && d.rv) refundOf[pk(d) + '|' + key(d.rv)] = d.id; });
    function bill(d, side, amt) {
      if (amt <= 0) return;
      var b = { id: d.id, no: d.no || d.billNo || '', date: d.date, due: d.due || '', side: side, total: r2(amt), left: r2(amt), type: d.type, kind: d.kind, party: partyName(d), by: [] };
      (open[pk(d)] = open[pk(d)] || []).push(b); byId[d.id] = b;
    }
    list.forEach(function (d) {
      var R = role(d), t;
      if (R === 'jv' || d.gen) {   /* journal lines on a party: a new bill or money-like credit, by the side the line was made for */
        (d.lines || []).forEach(function (l, i) {
          if (l.a !== 'party' || !String(l.party || '').trim()) return;
          var k = key(l.party), pay = l.side === 'pay', x = { id: d.id + '#' + i, no: d.no, date: d.date, due: l.due || '', type: d.gen ? d.type : 'jv', kind: d.gen ? 'gen' : '', buyer: { name: String(l.party).trim() } };
          if (partyKey && k !== partyKey) return;
          if (num(l.dr)) { if (pay) credits.push({ side: 'pay', amt: num(l.dr), d: x, alloc: l.alloc }); else bill(x, 'recv', num(l.dr)); }
          if (num(l.cr)) { if (pay) bill(x, 'pay', num(l.cr)); else credits.push({ side: 'recv', amt: num(l.cr), d: x, alloc: l.alloc }); }
        });
        return;
      }
      if (!partyName(d)) return;
      if (R === 'fabuy') { if (d.mode === 'credit') bill(d, 'pay', num(d.amount) + num(d.gstAmt)); return; }
      if (R === 'fasale') { if (d.mode === 'credit') bill(d, 'recv', num(d.amount) + num(d.gstAmt)); return; }
      if (R === 'sale') {
        t = itemTotals(d).total; bill(d, 'recv', t);
        if (d.status === 'paid' && !d.paidBy) credits.push({ side: 'recv', amt: t, to: d.id, date: d.date });
        else if (hotelPaid(d, t) > 0) credits.push({ side: 'recv', amt: hotelPaid(d, t), to: d.id, date: d.date });
        else if (num(d.exch) > 0) credits.push({ side: 'recv', amt: Math.min(num(d.exch), t), to: d.id, date: d.date });   /* old gold set off */
      }
      else if (R === 'sdeb') bill(d, 'recv', itemTotals(d).total);
      else if (R === 'buy') {
        t = itemTotals(d); bill(d, 'pay', d.type === 'self' ? t.taxable : r2(t.total - tdsBk(d)));   /* less TDS cut on booking (S-20) */
        if (d.type === 'self' && d.status === 'sipaid') credits.push({ side: 'pay', amt: t.taxable, to: d.id, date: d.date });
      }
      else if (R === 'exp' && d.mode === 'credit') bill(d, 'pay', r2(num(d.amount) - tdsBk(d)));
      else if (R === 'ob' && d.side !== 'cash' && d.side !== 'bank') obBills(d).forEach(function (x) { bill(x[0], d.side === 'pay' ? 'pay' : 'recv', x[1]); });   /* A-13: opening bills one by one */
      else if (R === 'in') credits.push({ side: 'recv', amt: num(d.amount) + num(d.tds) + num(d.disc), alloc: d.alloc, d: d, first: refundOf[pk(d) + '|' + key(d.no)] });
      else if (R === 'wo') credits.push({ side: d.side === 'pay' ? 'pay' : 'recv', amt: num(d.amount), alloc: d.alloc, d: d });
      else if (R === 'refund') bill(d, 'recv', num(d.amount));   /* a refund paid out makes the customer "owe" it back against their advance */
      else if (R === 'sret') credits.push({ side: 'recv', amt: itemTotals(d).total, origNo: d.orig && d.orig.no, d: d, alloc: d.alloc });
      else if (R === 'out') credits.push({ side: 'pay', amt: (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0) + num(d.disc), alloc: d.alloc, d: d });
      else if (R === 'pret') credits.push({ side: 'pay', amt: itemTotals(d).total, origNo: d.orig && d.orig.no, d: d, alloc: d.alloc });
    });
    /* apply credits in date order (list was sorted, credits keep that order) */
    var adv = {}, advBy = {};
    credits.forEach(function (c) {
      var left = r2(c.amt), p = c.d ? pk(c.d) : null, src = c.d ? { id: c.d.id, no: c.d.no || '', date: c.d.date, type: c.d.type, kind: c.d.kind, pname: partyName(c.d) } : { id: c.to, no: '', date: c.date, type: 'paid' };
      function take(b, max) { var x = r2(Math.min(b.left, max == null ? left : max, left)); if (x > 0) { b.left = r2(b.left - x); left = r2(left - x); b.by.push(Object.assign({ amt: x }, src)); } }
      if (c.to && byId[c.to]) { take(byId[c.to]); return; }
      if (c.first && byId[c.first]) take(byId[c.first]);
      (c.alloc || []).forEach(function (a) { var b = byId[a.id]; if (b && b.side === c.side) take(b, num(a.amt)); });
      if (c.origNo) (open[p] || []).forEach(function (b) { if (b.side === c.side && key(b.no) === key(c.origNo)) take(b); });
      if (!strict) (open[p] || []).forEach(function (b) { if (left > 0 && b.side === c.side) take(b); });
      if (left > 0 && p) { adv[p] = adv[p] || { recv: 0, pay: 0 }; adv[p][c.side] = r2(adv[p][c.side] + left); ((advBy[p] = advBy[p] || { recv: [], pay: [] })[c.side]).push(Object.assign({ left: left }, src)); }
    });
    /* an advance on one side is used up by bills that come later on the same side */
    if (!strict) Object.keys(adv).forEach(function (p) {
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
    var onacc = []; Object.keys(advBy).forEach(function (p) { ['recv', 'pay'].forEach(function (s) { advBy[p][s].forEach(function (a) { if (a.left > 0.004) onacc.push(Object.assign({ party: a.pname || p, pkey: p, side: s }, a, { left: r2(a.left) })); }); }); });
    return { bills: all, advances: adv, every: every, onacc: onacc, strict: strict };
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
      return { d: d, date: isBank(acct) && d.mode === 'cheque' && d.chq && d.chq.st === 'ok' && d.chq.on ? d.chq.on : d.date };
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
      buy: 'purchases', pret: 'purchases', exp: 'purchases', fabuy: 'purchases', jv: 'journal', ob: 'opening', contra: 'journal', oinc: 'receipts', taxpay: 'payments', gstset: 'journal', wo: 'journal', pdd: 'journal', advadj: 'journal' })[R] || 'other';
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
  var BUILTIN = { debtors: 'Sundry Debtors', creditors: 'Sundry Creditors' };
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

  /* ---------- ERP Round 2 (r2-billwise): bill-wise rules, opening bills, interest, credit check, general vouchers, sales ledgers ---------- */
  /* A-12 bill-wise strict mode, per business: setBillwise(<business name>, 'strict' | 'fifo'). Strict: money, notes and journal
     credits settle only the bills they are told to (alloc, the note's original bill, a bill paid on itself); what is left stays
     'On account' (bills().onacc) until the Adjust bills screen gives it bills; an advance is never used by later bills by itself.
     fifo (the default, as before): what is not told goes to the oldest bills, and advances pay later bills.
     alloc on any record or journal / general voucher line: [{ id, no, amt, ref }] with ref 'agst' (default) | 'new' | 'adv' | 'onacc'
     (ref only changes what the Tally export writes). */
  var BWS = {};
  function setBillwise(biz, mode) { BWS[key(biz)] = mode === 'strict'; }
  function isStrict(biz) { return !!BWS[key(biz)]; }
  /* A-13: an opening balance typed bill by bill: d.bills [{ no, date, due, amt }]; what the lines do not cover stays one lump bill.
     [[bill record, amount]] with ids '<ob id>#ob<i>' (alloc can name them) */
  function obBills(d) {
    var out = [], used = 0;
    (Array.isArray(d.bills) ? d.bills : []).forEach(function (b, i) {
      var a = r2(num(b && b.amt)); if (!(a > 0)) return; used = r2(used + a);
      out.push([{ id: d.id + '#ob' + i, no: String(b.no || '').trim() || 'Opening', date: b.date || d.date, due: b.due || '', type: 'ob', kind: d.side, buyer: d.buyer, ob: d.id }, a]);
    });
    var rest = r2(num(d.amount) - used);
    if (rest > 0.004 || !out.length) out.push([d, out.length ? rest : num(d.amount)]);
    return out;
  }
  /* A-9: taxable value split over sales (purchase) ledgers: line ledger (it.sl / it.pl, or the item master's from setItemLedgers),
     else the voucher's (d.sl / d.pl), else plain base ('sales', 'sales-return', 'purchases', 'purchase-return').
     A named ledger posts to 'sales:<name key>' / 'purchases:<name key>' (a return to the same ledger). [[account, amount]], biggest first;
     the parts always add up to the taxable value. */
  var ITEMLED = {};
  function setItemLedgers(map) { ITEMLED = {}; Object.keys(map || {}).forEach(function (k) { ITEMLED[key(k)] = map[k] || {}; }); }
  var LEDNM = {};   /* the name of a sales / purchase ledger as typed, for reports ('sales:sales - local' -> 'Sales - Local') */
  function ledAcct(name, base) { var k = key(name); if (!k) return base; var a = (/^purchase/.test(base) ? 'purchases:' : 'sales:') + k; if (!LEDNM[a]) LEDNM[a] = String(name).trim(); return a; }
  function ledName(a) { return LEDNM[a] || ''; }
  function ledSplit(d, taxable, f, base) {
    var by = {}, order = [], sum = 0;
    function add(a, v) { if (!(a in by)) { by[a] = 0; order.push(a); } by[a] = r2(by[a] + v); sum = r2(sum + v); }
    var docL = d[f] || '';
    if (!docL && !(d.items || []).some(function (it) { return it && (it[f] || ITEMLED[key(it.desc)] && ITEMLED[key(it.desc)][f]); })) return [[base, r2(taxable)]];
    (d.items || []).forEach(function (it) {
      var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), rate = num(it.rate); if (!it.desc && !rate) return;
      var m = ITEMLED[key(it.desc)] || {};
      add(ledAcct(it[f] || m[f] || docL, base), r2(q * rate - q * rate * num(it.disc) / 100));
    });
    var rest = r2(taxable - sum); if (rest) add(ledAcct(docL, base), rest);   /* charges and rounding go to the voucher's ledger */
    var out = order.map(function (a) { return [a, by[a]]; }).filter(function (x) { return x[1]; }).sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });
    return out.length ? out : [[base, r2(taxable)]];
  }
  /* is an account a sales / purchase ledger (plain or named)? the plain account it belongs under */
  function baseAcct(a) { a = String(a || ''); return a.indexOf('sales:') === 0 ? 'sales' : a.indexOf('purchases:') === 0 ? 'purchases' : a; }
  /* A-10: a general Receipt / Payment (d.gen): one cash or bank account (d.acct: 'cash' | 'bank' | 'bank:<name>') and any number of
     particulars lines shaped like journal lines { a, party, side, dr, cr, alloc, due, narr } (a 'party' = the party's account).
     The cash / bank account takes the difference: Receipt = lines mostly credit, Payment = lines mostly debit.
     A cheque not cleared yet sits in chq-in / chq-out like any receipt or payment. */
  function genAcct(d, net) {
    if (d.mode === 'cheque' && d.chq && d.chq.st && d.chq.st !== 'ok') return net >= 0 ? 'chq-in' : 'chq-out';
    if (isBank(d.acct)) return d.acct; if (d.acct === 'cash') return 'cash'; return moneyAcct(d.mode, d.bacct);
  }
  function genPost(d, dr, cr) {
    var net = 0;
    (d.lines || []).forEach(function (l) { var a = jvAcct(l); if (!a) return; dr(a, num(l.dr)); cr(a, num(l.cr)); net = r2(net + num(l.cr) - num(l.dr)); });
    var ac = genAcct(d, net);
    if (net > 0) dr(ac, net); else if (net < 0) cr(ac, -net);
  }
  function genTotal(d) { return r2(Math.abs((d.lines || []).reduce(function (s, l) { return s + num(l.cr) - num(l.dr); }, 0))); }

  /* A-14 / R-13 d: interest on late payment of the bills of one party (or every party) up to a day.
     set { rate (% a year, simple), grace (days), from: 'due' (default: the due date, else the bill date + cdays, else the bill date) | 'date',
           cdays, side: 'recv' | 'pay' | '' }.
     Each bill: interest runs from (start + grace days) on what is still unpaid, slice by slice between payments, rate / 365 a day.
     { bills: [{ id, no, date, due, start, party, side, total, left, days, interest, slices: [{ from, to, days, bal, amt }] }], total } */
  function interest(docs, biz, partyKey, upto, set) {
    set = set || {}; upto = upto || '';
    var rate = num(set.rate), list = upto ? (docs || []).filter(function (d) { return d && (!d.date || d.date <= upto); }) : docs || [];
    var R = bills(list, biz, partyKey), out = [], tot = 0;
    R.every.forEach(function (b) {
      if (partyKey && key(b.party) !== partyKey) return;
      if (set.side && b.side !== set.side) return;
      if (b.type === 'receipt' || b.type === 'voucher') return;   /* a refund bill: money paid back, not a sale on credit */
      var due = b.due || (num(set.cdays) > 0 ? addDays(b.date, num(set.cdays)) : '');
      var start = addDays(set.from === 'date' ? b.date : due || b.date, num(set.grace));
      var pays = (b.by || []).map(function (x) { return { date: x.date && x.date > b.date ? x.date : b.date, amt: num(x.amt) }; }).sort(function (x, y) { return x.date.localeCompare(y.date); });
      var bal = b.total, cur = start, slices = [], amt = 0, days = 0;
      function slice(to) {
        var n = daysBetween(cur, to); if (!(n > 0) || !(bal > 0.004)) return;
        var v = r2(bal * rate / 100 * n / 365); slices.push({ from: cur, to: to, days: n, bal: r2(bal), amt: v }); amt = r2(amt + v); days += n;
      }
      pays.forEach(function (p) { if (p.date > cur) { slice(p.date); cur = p.date; } bal = r2(bal - p.amt); });
      if (upto && upto > cur) slice(upto);
      if (!slices.length && !(b.left > 0.004)) return;
      tot = r2(tot + amt);
      out.push({ id: b.id, no: b.no, date: b.date, due: due, start: start, party: b.party, side: b.side, total: b.total, left: b.left, days: days, interest: amt, slices: slices, type: b.type });
    });
    return { bills: out, total: tot, rate: rate };
  }
  /* A-15: credit check of one party before a new credit sale of addAmt on a day.
     party = the party record { name, climit, cdays, cpolicy: 'warn' | 'block', cgrace }; excludeId = the record being changed.
     { limit, bal, after, over (limit crossed), oldest (the oldest unpaid bill past its due date), overdueDays, late, block (policy block and over or late) } */
  function creditCheck(docs, biz, party, addAmt, date, excludeId) {
    party = party || {}; date = date || '';
    var k = key(party.name), D = (docs || []).filter(function (d) { return d && d.id !== excludeId; });
    var P = parties(D, biz)[k] || { bal: 0 }, lim = num(party.climit), bal = r2(P.bal), after = r2(bal + num(addAmt));
    var cd = num(party.cdays), grace = num(party.cgrace), oldest = null, od = 0;
    if (k && date) bills(D, biz, k).bills.forEach(function (b) {
      if (b.side !== 'recv') return;
      var due = b.due || (cd > 0 ? addDays(b.date, cd) : ''); if (!due) return;
      var n = daysBetween(addDays(due, grace), date); if (n > od) { od = n; oldest = { id: b.id, no: b.no, date: b.date, due: due, left: b.left }; }
    });
    var over = lim > 0 && after > lim + 0.004, late = od > 0 && (cd > 0 || !!(oldest && oldest.due));
    var policy = party.cpolicy === 'block' ? 'block' : 'warn';
    return { limit: lim, bal: bal, after: after, over: over, oldest: oldest, overdueDays: od, late: late, policy: policy, block: policy === 'block' && (over || late), any: over || late };
  }
  /* A-13 carry forward: each party's open bills on the last day of the year as opening records written bill by bill
     (one 'ob' per party and side), money on account as a lump on the other side, and a lump for anything else so the
     balance always agrees. [{ side, name, amount, bills: [{ no, date, due, amt }] }] */
  function openBillsAt(docs, biz, upto) {
    var list = upto ? (docs || []).filter(function (d) { return d && (!d.date || d.date <= upto); }) : docs || [];
    var R = bills(list, biz), P = parties(list, biz), out = [], by = {};
    function get(p, nm) { return by[p] || (by[p] = { name: nm, recv: [], pay: [], net: 0 }); }
    R.bills.forEach(function (b) { var g = get(key(b.party), b.party); g[b.side].push({ no: b.no || '', date: b.date, due: b.due || '', amt: r2(b.left) }); g.net = r2(g.net + (b.side === 'recv' ? b.left : -b.left)); });
    R.onacc.forEach(function (c) { var g = get(c.pkey, c.party); g.onacc = r2((g.onacc || 0) + (c.side === 'recv' ? -c.left : c.left)); g.net = r2(g.net + (c.side === 'recv' ? -c.left : c.left)); });
    Object.keys(P).forEach(function (k) { var g = get(k, P[k].name); g.bal = r2(P[k].bal); });
    Object.keys(by).forEach(function (k) {
      var g = by[k], sum = function (l) { return r2(l.reduce(function (s, x) { return s + x.amt; }, 0)); };
      if (g.recv.length) out.push({ side: 'recv', name: g.name, amount: sum(g.recv), bills: g.recv });
      if (g.pay.length) out.push({ side: 'pay', name: g.name, amount: sum(g.pay), bills: g.pay });
      var rest = r2((g.bal || 0) - (g.net - (g.onacc || 0)));   /* on account money and anything not in the bill-wise view */
      if (Math.abs(rest) > 0.004) out.push({ side: rest > 0 ? 'recv' : 'pay', name: g.name, amount: Math.abs(rest), bills: [] });
    });
    return out;
  }

  var API = { num: num, r2: r2, key: key, role: role, itemTotals: itemTotals, postings: postings, inBooks: inBooks, parties: parties, accounts: accounts,
    taxPay: taxPay, gstSet: gstSet, rcmTax: rcmTax, itcBlk: itcBlk, lineItc: lineItcOf, provision: provision, salSplit: salSplit, dedKind: dedKind, tdsBk: tdsBk, rentTotal: rentTotal, expAcct: expAcct, loanAcct: loanAcct, schedule: schedule, emiOf: emiOf, loanLeft: loanLeft, addMonths: addMonths, SADV: SADV, advTax: advTax, advAdjust: advAdjust, inBooks0: inBooks0, GADV: GADV, bills: bills, ageing: ageing, overdue: overdue, chargeLines: chargeLines, tcsRate: tcsRate, tcsPan: tcsPan, panOk: panOk, addDays: addDays, mainRate: mainRate, statement: statement, book: book, isExpInv: isExpInv, asInvoice: asInvoice, daysBetween: daysBetween, moneyAcct: moneyAcct, payAcct: payAcct, isBank: isBank, bankKey: bankKey, bankOf: bankOf, setBanks: setBanks, bankName: bankName, bankList: bankList, contraKind: contraKind, contraSide: contraSide, bounced: bounced, partyName: partyName, partiesOf: partiesOf, jvAcct: jvAcct,
    vtype: vtype, ledger: ledger, billwise: billwise, groupsOf: groupsOf, groupChain: groupChain, partyGroup: partyGroup, inGroup: inGroup, groupTree: groupTree,
    partyMoves: partyMoves, groupSummary: groupSummary, groupDues: groupDues, topParties: topParties, BUILTIN: BUILTIN };
  API.setBillwise = setBillwise; API.isStrict = isStrict; API.obBills = obBills; API.ledSplit = ledSplit; API.setItemLedgers = setItemLedgers; API.ledAcct = ledAcct; API.ledName = ledName; API.baseAcct = baseAcct; API.genTotal = genTotal; API.genAcct = genAcct; API.interest = interest; API.creditCheck = creditCheck; API.openBillsAt = openBillsAt;   /* ERP Round 2, r2-billwise */
  API.stockRole = stockRole; API.STK_SALE = STK_SALE;
  API.stkAdj = stkAdj; API.adjItc = adjItc; API.ADJH = ADJH;   /* ERP round 2 (orders): I-7 */   /* ERP round 1: goods movement of a record (stockcore.js) */
  /* SQLite Stage 3 (big data): while the App draws one screen, the same dues, balances and postings are asked for by several
     panels; NSBooks.memo(true) keeps each answer for that drawing only (keyed by the very list of records and the other
     arguments), memo(false) forgets them. Off by default, so nothing else changes. memoize(name, fn) wraps any such function. */
  var MEMO = null;
  function memoize(name, fn) {
    return function (docs) {
      if (!MEMO || !docs || typeof docs !== 'object') return fn.apply(this, arguments);
      var m = MEMO.get(docs); if (!m) { m = {}; MEMO.set(docs, m); }
      var a = [].slice.call(arguments, 1), k = name;
      for (var i = 0; i < a.length; i++) { var v = a[i]; if (v && typeof v === 'object') { var ids = m.$ids || (m.$ids = []), at = ids.indexOf(v); if (at < 0) { ids.push(v); at = ids.length - 1; } k += '|#' + at; } else k += '|' + (v === undefined ? '~' : String(v)); }
      if (Object.prototype.hasOwnProperty.call(m, k)) return m[k];
      return (m[k] = fn.apply(this, arguments));
    };
  }
  API.memo = function (on) { MEMO = on ? new WeakMap() : null; };
  API.memoOn = function () { return !!MEMO; };
  API.memoize = memoize;
  ['inBooks', 'parties', 'accounts', 'bills'].forEach(function (n) { API[n] = memoize(n, API[n]); });
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSBooks = API;
})(this);
