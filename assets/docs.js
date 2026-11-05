/* NS documents: the editor, live A4 preview, saving and history for every document site.
   A site picks its document type with <section id="tool" data-doc="invoice">.
   Screen text comes from NS.t (the user's language); the printed document is always in English. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;

  /* every item-based document. Keys used below:
     kinds (first = default; data-kind on #tool can pick another), prefix/prefixes (number series), title (fixed printed title, else P[kind]),
     noLbl/party/note (P keys, one for all or per kind), refLbl, due/valid/deliv (dates), orig (against invoice no. + date), purpose + transport (challan),
     gstFlag (GST shown or not; gstOff = off by default), copy (copy-label set), pay (paid/not paid) or status list, toInvoice, qr (UPI QR), paper (default paper) */
  var TYPES = {
    invoice: { prefix: 'INV', kinds: ['tax', 'supply', 'plain'], due: true, copy: 'inv', rc: true, qr: true, pay: true },
    /* quotation site: two kinds with their own number series, GST shown or not, a validity date, and "Make invoice" */
    quote: { prefix: 'QT', prefixes: { quote: 'QT', estimate: 'EST' }, kinds: ['quote', 'estimate'], valid: true, gstFlag: true, status: ['open', 'acc', 'dec', 'inv'], toInvoice: true,
      noLbl: { quote: 'qno', estimate: 'eno' }, party: { quote: 'qfor', estimate: 'efor' }, note: { quote: 'qnote', estimate: 'enote' }, refLbl: 'qref', priceCol: true, qterms: true },
    proforma: { prefix: 'PI', kinds: ['proforma'], valid: true, gstFlag: true, qr: true, status: ['open', 'acc', 'dec', 'inv'], toInvoice: true, noLbl: 'pno', party: 'billto', note: 'pnote', refLbl: 'qref' },
    so: { prefix: 'SO', kinds: ['so'], deliv: true, gstFlag: true, status: ['sopen', 'spart', 'sdone', 'inv', 'scan'], toInvoice: true, noLbl: 'sono', party: 'billto', refLbl: 'poref' },
    challan: { prefix: 'DC', kinds: ['job', 'approval', 'sale', 'transfer', 'other'], title: 'challan', purpose: true, transport: true, gstFlag: true, gstOff: true, copy: 'dc',
      status: ['dsent', 'dret', 'inv'], toInvoice: true, noLbl: 'dcno', party: 'consignee', note: { job: 'dcjob', approval: 'dcnote', sale: 'dcnote', transfer: 'dcnote', other: 'dcnote' }, refLbl: 'ref' },
    po: { prefix: 'PO', kinds: ['po'], deliv: true, gstFlag: true, status: ['popen', 'prec', 'scan'], noLbl: 'pono', party: 'vendor', shipLbl: 'deliverto', refLbl: 'vqref', buying: true },
    note: { prefix: 'CN', prefixes: { credit: 'CN', debit: 'DN' }, kinds: ['credit', 'debit'], orig: true, gstFlag: true, copy: 'note', status: ['nissued', 'nadj', 'nref'],
      noLbl: { credit: 'cnno', debit: 'dnno' }, party: 'issuedto', note: { credit: 'cnnote', debit: 'dnnote' }, refLbl: 'ref' },
    /* self invoice: a registered buyer bills itself for a purchase from an unregistered supplier under reverse charge (always GST, RC = Yes) */
    self: { prefix: 'SI', kinds: ['self'], alwaysTax: true, rc: true, rcFixed: true, recv: true, buying: true, status: ['siopen', 'sipaid'], noLbl: 'sino', party: 'supplier', note: 'sinote', refLbl: 'ref' },
    /* export and SEZ invoice (export-invoice site, extra fields in export.js): always a tax invoice, always IGST; under LUT/bond the GST rate is 0 */
    exp: { prefix: 'EXP', kinds: ['expwp', 'expwop', 'sezwp', 'sezwop'], title: 'tax', alwaysTax: true, igst: true, copy: 'inv', due: true, pay: true, noLbl: 'no', party: 'billto' },
    cashmemo: { prefix: 'CM', kinds: ['cashmemo'], gstFlag: true, gstOff: true, qr: true, pay: true, paidFirst: true, noLbl: 'cmno', party: 'custto', paper: 'th80' }
  };
  var COPIES = { inv: ['orig', 'dup', 'trip'], invs: ['orig', 'dupsup'], dc: ['dcorig', 'dcdup', 'dctrip'], note: ['orig', 'dupsup'] };
  var REASONS = ['ret', 'price', 'disc', 'short', 'tax', 'other'];
  var PAPERS = ['a4', 'a5', 'th80', 'th58'], DESIGNS = ['classic', 'modern', 'compact'];
  /* Batch 1: extra charges on every item document; TCS (collected by the seller under the Income-tax Act) on sale bills; repeat on invoices */
  var TCS_TYPES = { invoice: 1, cashmemo: 1, proforma: 1, exp: 1 }, CHG_NAMES = ['Freight', 'Packing', 'Insurance', 'Loading', 'Delivery', 'Courier', 'Installation'];
  /* TCS rates: Income-tax Act 2025, section 394(1) Table, as amended by the Finance Act 2026 (official text, incometaxindia.gov.in, read 5 Nov 2026).
     [label, rate %, Sl. No.]; Sl. 6 only when the sale consideration is over Rs 10 lakh. Sl. 1-5: no TCS if the buyer gives the s.394(2) declaration
     (goods used for manufacturing, processing, producing or power, not trading). There is no TCS on sale of other goods (old 206C(1H) is not in the 2025 Act). */
  var TCS_NATURE = [['394(1) Sl.1: Alcoholic liquor for human consumption', 2, 1], ['394(1) Sl.2: Tendu leaves', 2, 2], ['394(1) Sl.3: Timber or other forest produce', 2, 3],
    ['394(1) Sl.4: Scrap', 2, 4], ['394(1) Sl.5: Coal, lignite or iron ore', 2, 5], ['394(1) Sl.6(a): Motor vehicle over Rs 10 lakh', 1, 6],
    /* Sl.6(b) goods: CBDT Notification 36/2025 (S.O. 1825(E), 22 Apr 2025, under old s.206C(1F)), still in force through s.536(2)(j) of the 2025 Act */
    ['394(1) Sl.6(b): Wrist watch over Rs 10 lakh', 1, 6], ['394(1) Sl.6(b): Art piece (antique, painting, sculpture) over Rs 10 lakh', 1, 6],
    ['394(1) Sl.6(b): Collectible (coin, stamp) over Rs 10 lakh', 1, 6], ['394(1) Sl.6(b): Yacht, rowing boat, canoe or helicopter over Rs 10 lakh', 1, 6],
    ['394(1) Sl.6(b): Sunglasses over Rs 10 lakh', 1, 6], ['394(1) Sl.6(b): Bag (handbag, purse) over Rs 10 lakh', 1, 6], ['394(1) Sl.6(b): Shoes over Rs 10 lakh', 1, 6],
    ['394(1) Sl.6(b): Sportswear or equipment (golf kit, ski-wear) over Rs 10 lakh', 1, 6], ['394(1) Sl.6(b): Home theatre system over Rs 10 lakh', 1, 6],
    ['394(1) Sl.6(b): Horse for racing in race clubs or for polo over Rs 10 lakh', 1, 6],
    ['394(1) Sl.8: Overseas tour programme package', 2, 8], ['394(1) Sl.9: Parking lot, toll plaza, mine or quarry (licence or lease)', 2, 9]];
  /* without the buyer's PAN the higher TCS rate applies (s.397(2)): say so next to the fields */
  function panNote() {
    var n = $('#tcs-pannote', root); if (!n) return;
    var c = doc.tcs || {}, show = c.on && num(c.rate) > 0 && !NSBooks.tcsPan(doc) && !c.nopanOk;
    n.hidden = !show; n.textContent = show ? t('b1.tcsnopan', { r: NSBooks.tcsRate(doc) }) : '';
  }
  /* credit note against a bill that had TCS: the TCS is not cut (CBDT Circular 17/2020 para 4.6.1: no adjustment for sales returns) */
  var cnSeen = '';
  function cnTcs() {
    var n = $('#cn-tcs', root); if (!n) return;
    var no = String((doc.orig || {}).no || '').trim(), sg = doc.seller.gstin || '', want = doc.kind === 'credit' && no, seen = no + '|' + sg;
    if (!want) { n.hidden = true; cnSeen = ''; return; }
    if (cnSeen === seen) return; cnSeen = seen;
    NSStore.list('doc').then(function (all) {
      if (cnSeen !== seen) return;
      var o = all.filter(function (d) { return TCS_TYPES[d.type] && String(d.no) === no && d.tcs && d.tcs.on && (!sg || !(d.seller || {}).gstin || d.seller.gstin === sg); })[0];
      var v = o && NSBooks.itemTotals(o).tcs;
      n.hidden = !v; n.textContent = v ? t('b1.cntcs', { no: no, v: NS.money(v) }) : '';
    });
  }
  function tcsNature(sec) { return TCS_NATURE.filter(function (n) { return n[0] === String(sec || '').trim(); })[0]; }
  function pk(v, kind) { return v && typeof v === 'object' ? v[kind] : v; }
  var BILLING = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8861/' : 'https://billing.niveshsahayak.in/';

  /* words printed on the document (English only, readable by every buyer, bank and tax officer) */
  var P = { tax: 'TAX INVOICE', supply: 'BILL OF SUPPLY', plain: 'INVOICE', no: 'Invoice No.', date: 'Date', due: 'Due date', pos: 'Place of supply', rc: 'Reverse charge', ref: 'Order ref.', billto: 'Bill to', shipto: 'Ship to', gstin: 'GSTIN', ph: 'Phone', item: 'Item / service', hsn: 'HSN/SAC', qty: 'Qty', rate: 'Rate', disc: 'Disc.', taxable: 'Taxable value', gst: 'GST', amount: 'Amount', subtotal: 'Taxable value', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', round: 'Round off', total: 'Total', words: 'Amount in words', summary: 'Tax summary', bank: 'Bank details', acc: 'A/c no.', ifsc: 'IFSC', branch: 'Branch', upi: 'Scan to pay by UPI', notes: 'Notes', terms: 'Terms and conditions', for: 'For', sign: 'Authorised signatory', yes: 'Yes', no2: 'No', supplynote: 'Composition taxable person, not eligible to collect tax on supplies.', quote: 'QUOTATION', estimate: 'ESTIMATE', qno: 'Quotation No.', eno: 'Estimate No.', valid: 'Valid until', qref: 'Enquiry ref.', qfor: 'Quotation for', efor: 'Estimate for', price: 'Amount', qnote: 'This is a quotation, not a tax invoice.', enote: 'This is an estimate. The final bill may differ.', paid: 'PAID', orig: 'Original for recipient', dup: 'Duplicate for transporter', trip: 'Triplicate for supplier',
    proforma: 'PROFORMA INVOICE', pno: 'Proforma No.', pnote: 'Not a tax invoice. No input tax credit can be claimed on it. A tax invoice will be issued on supply.',
    so: 'SALES ORDER', sono: 'Order No.', poref: 'Customer PO ref.', deliv: 'Delivery by',
    challan: 'DELIVERY CHALLAN', dcno: 'Challan No.', consignee: 'Consignee (deliver to)', purpose: 'Purpose', job: 'Job work', approval: 'Supply on approval', sale: 'Sale (invoice to follow)', transfer: 'Branch / stock transfer', other: 'Other',
    dcnote: 'Goods sent under this delivery challan. Not a tax invoice.', dcjob: 'Goods sent for job work under this delivery challan. Not a tax invoice. Moving them to another state needs an e-way bill at any value.',
    cnnote: 'Credit note under section 34 of the CGST Act. The recipient must reverse the matching input tax credit.', dnnote: 'Debit note under section 34 of the CGST Act.', dcorig: 'Original for consignee', dcdup: 'Duplicate for transporter', dctrip: 'Triplicate for consignor',
    veh: 'Vehicle No.', tname: 'Transporter', lr: 'LR / docket No.', value: 'Value',
    po: 'PURCHASE ORDER', pono: 'PO No.', vendor: 'Vendor (order to)', deliverto: 'Deliver to', vqref: 'Vendor quotation ref.', buyer: 'Buyer',
    credit: 'CREDIT NOTE', debit: 'DEBIT NOTE', cnno: 'Credit Note No.', dnno: 'Debit Note No.', issuedto: 'Issued to', against: 'Against invoice', invdate: 'Invoice date', reason: 'Reason',
    ret: 'Goods returned', price: 'Price changed', disc2: 'Discount after sale', short: 'Short or damaged supply', taxfix: 'Tax corrected',
    dupsup: 'Duplicate for supplier', cashmemo: 'CASH MEMO', cmno: 'Memo No.', self: 'SELF INVOICE', sino: 'Self Invoice No.', supplier: 'Supplier (unregistered)', recv: 'Goods / services received on',
    sinote: 'Self invoice issued by the recipient under section 31(3)(f) of the CGST Act for a supply received from an unregistered supplier. Tax is payable by the recipient on reverse charge.', custto: 'Customer', cash: 'Cash', thanks: 'Thank you, visit again', recd: 'Goods received in good condition', recdsign: 'Receiver’s sign, name and date', items: 'Items', page: 'Page', tcs: 'TCS', tcsu: 'TCS u/s' };
  /* reason codes print through RP (P.tax is the invoice title, so the "tax corrected" reason has its own word) */
  var RP = { ret: 'ret', price: 'price', disc: 'disc2', 'short': 'short', tax: 'taxfix', other: 'other' };
  var UNITS = ['Nos', 'Pcs', 'Kg', 'Gm', 'Ltr', 'Ml', 'Mtr', 'Sq ft', 'Box', 'Pack', 'Set', 'Pair', 'Dozen', 'Bag', 'Ton', 'Hrs', 'Days', 'Month', 'Job'];
  /* GST rates offered for the document date (Tax research area 1): 5/18/40 slabs from 22 Sep 2025 (Notif. 9/2025-CT(Rate)),
     28% omitted from 1 Feb 2026 (19/2025-CT(Rate)); 12% still for bricks/tiles; 1.5% cut diamonds; 0.1% merchant exporters.
     Any other rate can still be typed. */
  var RATE_SETS = [['2026-02-01', [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 40]], ['2025-09-22', [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40]], ['', [0, 0.1, 0.25, 3, 5, 12, 18, 28]]];
  function ratesFor(date) { return RATE_SETS.filter(function (r) { return String(date || '') >= r[0]; })[0][1]; }
  function rateOpts(date) { return ratesFor(date).map(function (u) { return '<option value="' + u + '">'; }).join(''); }
  var ACCENTS = ['#0B3B5B', '#1D4ED8', '#047857', '#B45309', '#9D174D', '#334155'];
  var UT = { '04': 1, '26': 1, '31': 1, '35': 1, '38': 1 }; /* Union Territories without a legislature charge UTGST */

  var root, T, type, doc, editingId = null, sheet;
  /* settings made in the Configuration Hub (my.niveshsahayak.in), shared through the data home */
  var CFG = {}, lastAuto = '';
  function dset() {
    if (type === 'invoice') return CFG.invoice || {};
    /* the invoice defaults (GST rate, unit, colour, round off) also serve the other documents */
    var inv = CFG.invoice || {}, base = { gst: inv.gst, unit: inv.unit, round: inv.round, accent: inv.accent, digits: inv.digits, fy: inv.fy };
    return Object.assign(base, CFG[type] || {});
  }
  function taxOn(d) { return T.alwaysTax || (T.gstFlag ? d.withGst !== false : d.kind === 'tax'); }
  function W() { return { doc: t('doc.' + type), docs: t('docs.' + type), Doc: t('Doc.' + type) }; }
  function tw(k, v) { return t(k, Object.assign(W(), v || {})); }

  function blank() {
    var c = dset();
    return {
      type: type, kind: T.kind0 || (T.kinds.indexOf(c.kind) >= 0 ? c.kind : T.kinds[0]), no: '', deliv: '', orig: { no: '', date: '' }, reason: 'ret', tr: { veh: '', tname: '', lr: '' },
      paper: c.paper || T.paper || 'a4', design: c.design || 'classic', copies: 1, date: NS.today(), due: '', pos: '', rc: !!T.rcFixed, recv: '', ref: '',
      seller: { name: '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '', email: '', logo: '', sign: '', bankName: '', bankAcc: '', bankIfsc: '', bankBranch: '', upi: '' },
      buyer: { name: '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '' }, ship: null, einv: null, irn: null,
      items: [{ desc: '', hsn: '', qty: 1, unit: c.unit || 'Nos', rate: '', disc: '', gst: c.gst != null && c.gst !== '' ? +c.gst : 18 }],
      round: c.round !== false, comp: true, notes: c.notes || '', terms: c.terms || '', accent: c.accent || ACCENTS[0],
      status: T.status ? T.status[0] : T.paidFirst ? 'paid' : 'unpaid', copyLabel: T.copy ? COPIES[T.copy][0] : '', withGst: T.gstFlag ? !T.gstOff : undefined, valid: '',
      charges: [], tcs: { on: false, rate: '', base: 'total', sec: '' }, rec: null
    };
  }

  /* ---------- totals ---------- */
  function totals(d) {
    var noTax = !taxOn(d);
    var origin = d.seller.state, dest = d.pos || d.buyer.state || origin;
    var intra = !T.igst && (!origin || !dest || origin === dest);   /* exports and SEZ supplies are inter-state (IGST Act s.7(5)) */
    var tt = { rows: [], taxable: 0, cgst: 0, sgst: 0, igst: 0, intra: intra, noTax: noTax, sum: {} };
    d.items.forEach(function (it) {
      var q = num(it.qty), rate = num(it.rate);
      if (!it.desc && !rate) return;
      var gross = q * rate, disc = gross * num(it.disc) / 100, taxable = r2(gross - disc);
      var g = noTax ? 0 : num(it.gst), tax = r2(taxable * g / 100);
      tt.rows.push({ it: it, taxable: taxable, g: g, tax: tax, amount: r2(taxable + tax) });
      tt.taxable += taxable;
      if (!noTax) {
        if (intra) { tt.cgst += tax / 2; tt.sgst += tax / 2; } else tt.igst += tax;
        var k = (it.hsn || '—') + '|' + g;
        var s = tt.sum[k] || (tt.sum[k] = { hsn: it.hsn || '—', g: g, taxable: 0, tax: 0 });
        s.taxable += taxable; s.tax += tax;
      }
    });
    /* extra charges: in the taxable value; GST at the main item's rate (the line with the largest taxable value) or their own rate */
    var main = tt.rows.slice().sort(function (a, b) { return b.taxable - a.taxable; })[0];
    tt.charges = [];
    (d.charges || []).forEach(function (c) {
      var amt = r2(num(c.amt)); if (!amt) return;
      var own = !(c.gst === '' || c.gst == null || c.gst === 'main'), g = noTax ? 0 : own ? num(c.gst) : main ? main.g : 0, tax = r2(amt * g / 100);
      tt.charges.push({ c: c, amt: amt, g: g, tax: tax, amount: r2(amt + tax) });
      tt.taxable += amt;
      if (!noTax) {
        if (intra) { tt.cgst += tax / 2; tt.sgst += tax / 2; } else tt.igst += tax;
        var hs = own || !main ? (c.hsn || '—') : (main.it.hsn || '—'), k2 = hs + '|' + g;
        var s2 = tt.sum[k2] || (tt.sum[k2] = { hsn: hs, g: g, taxable: 0, tax: 0 });
        s2.taxable += amt; s2.tax += tax;
      }
    });
    tt.taxable = r2(tt.taxable); tt.cgst = r2(tt.cgst); tt.sgst = r2(tt.sgst); tt.igst = r2(tt.igst);
    tt.tcs = TCS_TYPES[type] && d.tcs && d.tcs.on ? r2((d.tcs.base === 'taxable' ? tt.taxable : tt.taxable + tt.cgst + tt.sgst + tt.igst) * NSBooks.tcsRate(d) / 100) : 0;
    var total = r2(tt.taxable + tt.cgst + tt.sgst + tt.igst + tt.tcs);
    tt.roundOff = d.round ? r2(Math.round(total) - total) : 0;
    tt.grand = r2(total + tt.roundOff);
    return tt;
  }
  function sgstName(d) { return UT[d.seller.state] && totals(d).intra ? 'UTGST' : 'SGST'; }

  /* ---------- extensions (e-invoice and e-way bill files): NS.docExt.push({ editor, wire, fill, sheet, drawn }) ---------- */
  var API = {
    doc: function () { return doc; }, totals: function () { return totals(doc); }, type: function () { return type; },
    changed: function () { draw(); saveDraft(); }, field: function (id, label, o) { return field(id, label, o); }, showTab: function (w) { showTab(w); }
  };
  function ext(hook, arg) {
    return (NS.docExt || []).map(function (x) { try { return x[hook] ? x[hook](arg, API) || '' : ''; } catch (e) { console.error(e); return ''; } });
  }

  /* ---------- editor ---------- */
  function stateOptions(first) {
    return '<option value="">' + esc(first) + '</option>' + NS.STATES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + ' (' + s[0] + ')</option>'; }).join('');
  }
  function field(id, label, o) {
    o = o || {};
    var type_ = o.type || 'text', hint = o.hint ? '<small class="hint">' + esc(o.hint) + '</small>' : '';
    var input = type_ === 'textarea' ? '<textarea id="' + id + '" rows="' + (o.rows || 2) + '" dir="auto" placeholder="' + esc(o.ph || '') + '"></textarea>'
      : type_ === 'state' ? '<select id="' + id + '"></select>'
      : '<input id="' + id + '" type="' + type_ + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' placeholder="' + esc(o.ph || '') + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + '>';
    return '<div class="f' + (o.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + input + hint + '<small class="err" id="' + id + '-err" hidden></small></div>';
  }
  function buildEditor() {
    var ed = $('#ed', root);
    var hub = (window.NS_CFG && NS_CFG.vault ? new URL(NS_CFG.vault, location.href).origin : 'https://my.niveshsahayak.in') + '/';
    ed.innerHTML =
      '<p class="hub-link"><a href="' + hub + '" target="_blank" rel="noopener">' + esc(t('hub.link')) + ' ›</a></p>' +
      '<fieldset class="card"><legend>' + esc(t('lg.biz')) + '</legend><div class="fg">' +
        field('s-name', t('l.bname'), { ph: t('ph.bname'), wide: true, hint: t('h.bname') }) +
        field('s-addr', t('l.addr'), { type: 'textarea', wide: true, ph: t('ph.addr') }) +
        field('s-city', t('l.city'), {}) + field('s-pin', t('l.pin'), { mode: 'numeric', max: 6, ltr: 1, hint: type === 'invoice' ? t('h.pin') : '' }) +
        field('s-state', t('l.state'), { type: 'state' }) +
        field('s-gstin', t('l.gstin'), { ph: t('ph.gstin'), max: 15, ltr: 1 }) +
        field('s-phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
        field('s-email', t('l.email'), { type: 'email', ltr: 1 }) +
      '</div><details class="more"><summary>' + esc(t('more')) + '</summary><div class="fg">' +
        '<div class="f"><label for="s-logo">' + esc(t('l.logo')) + '</label><input id="s-logo" type="file" accept="image/*"><button type="button" class="link" data-clear="logo" hidden>' + esc(t('rm.logo')) + '</button></div>' +
        '<div class="f"><label for="s-sign">' + esc(t('l.sign')) + '</label><input id="s-sign" type="file" accept="image/*"><button type="button" class="link" data-clear="sign" hidden>' + esc(t('rm.sign')) + '</button></div>' +
        field('s-bankName', t('l.bank')) + field('s-bankAcc', t('l.acc'), { mode: 'numeric', ltr: 1 }) +
        field('s-bankIfsc', t('l.ifsc'), { max: 11, ltr: 1 }) + field('s-bankBranch', t('l.branch')) +
        field('s-upi', t('l.upi'), { ph: 'name@bank', wide: true, ltr: 1 }) +
      '</div></details></fieldset>' +

      '<fieldset class="card"><legend>' + esc(tw('lg.details')) + '</legend><div class="fg">' +
        '<div class="f wide"' + (T.kinds.length < 2 ? ' hidden' : '') + '><label for="d-kind">' + esc(t(T.purpose ? 'l.purpose' : 'l.type')) + '</label><select id="d-kind">' + T.kinds.map(function (k) { return '<option value="' + k + '">' + esc(t('k.' + k)) + '</option>'; }).join('') + '</select><small class="hint" id="kind-hint"></small></div>' +
        (T.gstFlag ? '<div class="f wide"><label class="chk"><input id="d-gst" type="checkbox"> ' + esc(t('l.withgst')) + '</label><small class="hint">' + esc(t('h.withgst')) + '</small></div>' : '') +
        '<div class="f wide" id="comp-box" hidden><label class="chk"><input id="d-comp" type="checkbox"> ' + esc(t('comp')) + '</label></div>' +
        field('d-no', tw('l.no'), { max: 16, hint: type === 'quote' ? t('h.qno') : type === 'invoice' ? t('h.no') : T.prefixes ? t('h.no3') : t('h.no2'), ltr: 1 }) +
        field('d-date', t('l.date'), { type: 'date' }) +
        (T.due ? field('d-due', t('l.due'), { type: 'date' }) : '') +
        (T.valid ? field('d-valid', t('l.valid'), { type: 'date', hint: t('h.valid') }) : '') +
        (T.deliv ? field('d-deliv', t('l.deliv'), { type: 'date' }) : '') +
        (T.recv ? field('d-recv', t('l.recv'), { type: 'date', hint: t('h.recv') }) : '') +
        (T.orig ? field('d-ono', t('l.ono'), { max: 16, ltr: 1, hint: t('h.ono') }) + field('d-odate', t('l.odate'), { type: 'date' }) + '<p class="hint wide b1-warn" id="cn-tcs" hidden></p>' +
          '<div class="f wide"><label for="d-reason">' + esc(t('l.reason')) + '</label><select id="d-reason">' + REASONS.map(function (k) { return '<option value="' + k + '">' + esc(t('rs.' + k)) + '</option>'; }).join('') + '</select></div>' : '') +
        field('d-pos', t('l.pos'), { type: 'state', hint: t(T.buying ? 'h.pos2' : 'h.pos') }) +
        field('d-ref', t('l.' + (T.refLbl || 'ref')), {}) +
        (T.rc && !T.rcFixed ? '<div class="f"><label class="chk"><input id="d-rc" type="checkbox"> ' + esc(t('l.rc')) + '</label></div>' : '') +
        (T.transport ? field('tr-veh', t('l.veh'), { ltr: 1, ph: 'PB10AB1234' }) + field('tr-tname', t('l.tname')) + field('tr-lr', t('l.lr'), { ltr: 1 }) : '') +
      '</div></fieldset>' +

      '<fieldset class="card"><legend>' + esc(t(type === 'quote' ? 'lg.qto' : 'lg.' + (pk(T.party, T.kinds[0]) || 'billto'))) + '</legend><div class="fg">' +
        field('b-name', t(T.buying ? 'l.vname' : 'l.cname'), { ph: t(T.buying ? 'ph.vname' : 'ph.cname'), wide: true, hint: t(T.buying ? 'h.vname' : 'h.cname') }) +
        field('b-addr', t('l.addr'), { type: 'textarea', wide: true }) +
        field('b-city', t('l.city'), {}) + field('b-pin', t('l.pin'), { mode: 'numeric', max: 6, ltr: 1, hint: type === 'invoice' ? t('h.pin') : '' }) +
        field('b-state', t('l.state'), { type: 'state' }) +
        field('b-gstin', t('l.cgstin'), { max: 15, ltr: 1 }) +
        field('b-phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
        '<div class="f"><label class="chk"><input id="b-ship" type="checkbox"> ' + esc(t('l.ship')) + '</label></div>' +
      '</div><div class="fg" id="ship-box" hidden>' +
        field('sh-name', t('l.shname'), { wide: true }) + field('sh-addr', t('l.shaddr'), { type: 'textarea', wide: true }) + field('sh-city', t('l.shcity'), {}) + field('sh-pin', t('l.shpin'), { mode: 'numeric', max: 6, ltr: 1 }) + field('sh-state', t('l.shstate'), { type: 'state' }) +
      '</div></fieldset>' +

      '<fieldset class="card"><legend>' + esc(t('lg.items')) + '</legend><div id="items" class="items"></div>' +
        '<button type="button" class="btn" id="add-item">' + esc(t('add.item')) + '</button>' +
        '<datalist id="dl-units">' + UNITS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>' +
        '<datalist id="dl-rates">' + rateOpts(doc.date) + '</datalist>' +
        '<h3 class="chg-h">' + esc(t('b1.charges')) + '</h3><div id="chg-list"></div><button type="button" class="btn sm" id="add-chg">+ ' + esc(t('b1.addchg')) + '</button>' +
        '<p class="hint">' + esc(t('b1.chgh')) + '</p><datalist id="dl-chg">' + CHG_NAMES.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>' +
        (TCS_TYPES[type] ? '<details class="more" id="tcs-box"><summary>' + esc(t('b1.tcs')) + '</summary><div class="fg">' +
          '<div class="f wide"><label class="chk"><input id="tcs-on" type="checkbox"> ' + esc(t('b1.tcson')) + '</label><small class="hint">' + esc(t('b1.tcsh')) + '</small></div>' +
          '<div class="f wide"><label for="tcs-sec">' + esc(t('b1.tcssec')) + '</label><input id="tcs-sec" list="dl-tcs" dir="ltr"><datalist id="dl-tcs">' + TCS_NATURE.map(function (u) { return '<option value="' + esc(u[0]) + '">' + u[1] + '%</option>'; }).join('') + '</datalist></div>' +
          field('tcs-rate', t('b1.tcsrate'), { mode: 'decimal', ltr: 1, hint: t('b1.tcsrh') }) +
          field('tcs-pan', t('b1.tcspan'), { max: 10, ltr: 1, ph: 'ABCDE1234F', hint: t('b1.tcspanh') }) +
          '<div class="f wide"><label class="chk"><input id="tcs-nopanok" type="checkbox"> ' + esc(t('b1.tcsnr')) + '</label></div><p class="hint wide b1-warn" id="tcs-pannote" hidden></p>' +
          '<div class="f"><label for="tcs-base">' + esc(t('b1.tcsbase')) + '</label><select id="tcs-base"><option value="total">' + esc(t('b1.tcs_tot')) + '</option><option value="taxable">' + esc(t('b1.tcs_tax')) + '</option></select><small class="hint">' + esc(t('b1.tcsbh')) + '</small></div>' +
        '</div></details>' : '') +
        '<div class="sums" id="ed-sums" aria-live="polite"></div>' +
      '</fieldset>' +

      '<fieldset class="card"><legend>' + esc(t('lg.notes')) + '</legend><div class="fg">' +
        field('d-notes', t('l.notes'), { type: 'textarea', wide: true, ph: t('ph.notes') }) +
        field('d-terms', t('l.terms'), { type: 'textarea', wide: true, ph: t(T.valid ? 'ph.qterms' : T.buying ? 'ph.poterms' : T.purpose ? 'ph.dcterms' : 'ph.terms') }) +
        (T.copy ? '<div class="f"><label for="d-copy">' + esc(t('l.copy')) + '</label><select id="d-copy">' + COPIES[copyKey()].map(function (k) { return '<option value="' + k + '">' + esc(t('cp.' + k)) + '</option>'; }).join('') + '<option value="">' + esc(t('cp.none')) + '</option></select></div>' +
          '<div class="f"><label for="d-copies">' + esc(t('l.copies')) + '</label><select id="d-copies">' + COPIES[copyKey()].map(function (k, i) { return '<option value="' + (i + 1) + '">' + esc(t(i ? 'cps.n' : 'cps.1', { n: i + 1 })) + '</option>'; }).join('') + '</select><small class="hint">' + esc(t('h.copies')) + '</small></div>' : '') +
        '<div class="f"><label for="d-paper">' + esc(t('l.paper')) + '</label><select id="d-paper">' + PAPERS.map(function (k) { return '<option value="' + k + '">' + esc(t('pp.' + k)) + '</option>'; }).join('') + '</select></div>' +
        '<div class="f"><label for="d-design">' + esc(t('l.design')) + '</label><select id="d-design">' + DESIGNS.map(function (k, i) { return '<option value="' + k + '">' + esc(t('ds.' + k)) + '</option>'; }).join('') + '</select><small class="hint">' + esc(t('h.design2')) + '</small></div>' +
        (T.pay ? '<div class="f"><label for="d-status">' + esc(t('l.pay')) + '</label><select id="d-status"><option value="unpaid">' + esc(t('pay.unpaid')) + '</option><option value="paid">' + esc(t('pay.paid')) + '</option></select></div>'
          : '<div class="f"><label for="d-status">' + esc(t('l.qstat')) + '</label><select id="d-status">' + T.status.map(function (k) { return '<option value="' + k + '">' + esc(t('qs.' + k)) + '</option>'; }).join('') + '</select></div>') +
        '<div class="f"><span class="lbl" id="acc-lbl">' + esc(t('l.colour')) + '</span><div class="swatches" role="radiogroup" aria-labelledby="acc-lbl">' + ACCENTS.map(function (c, i) { return '<button type="button" role="radio" class="sw" data-accent="' + c + '" style="--c:' + c + '" aria-label="' + esc(t('colour.n', { n: i + 1 })) + '"></button>'; }).join('') + '</div></div>' +
        '<div class="f"><label class="chk"><input id="d-round" type="checkbox"> ' + esc(t('l.round')) + '</label></div>' +
        (type === 'invoice' ? '<div class="f"><label for="d-rec">' + esc(t('b1.repeat')) + '</label><select id="d-rec"><option value="">' + esc(t('b1.rep_no')) + '</option><option value="month">' + esc(t('b1.rep_m')) + '</option><option value="quarter">' + esc(t('b1.rep_q')) + '</option></select><small class="hint">' + esc(t('b1.reph')) + '</small></div>' +
          '<div class="f" id="rec-until-f">' + '<label for="d-recuntil">' + esc(t('b1.repuntil')) + '</label><input id="d-recuntil" type="date"><small class="hint">' + esc(t('b1.repuh')) + '</small></div>' : '') +
        '<p class="hint wide print-note">' + esc(tw('print.en')) + '</p>' +
      '</div></fieldset>' +
      ext('editor').join('');

    $$('select[id$="state"]', ed).forEach(function (s) { s.innerHTML = stateOptions(t('choose.state')); });
    $('#d-pos', ed).innerHTML = stateOptions(t('same.buyer'));
    $('#add-item', ed).addEventListener('click', function () { doc.items.push({ desc: '', hsn: '', qty: 1, unit: dset().unit || 'Nos', rate: '', disc: '', gst: doc.items.length ? doc.items[doc.items.length - 1].gst : 18 }); renderItems(); var d = $$('#items .it-desc', ed); d[d.length - 1].focus(); });
    $('#add-chg', ed).addEventListener('click', function () { doc.charges = doc.charges || []; doc.charges.push({ name: '', amt: '', gst: 'main' }); renderCharges(); var n = $$('#chg-list [data-ck=name]', ed); n[n.length - 1].focus(); });
    $$('[data-accent]', ed).forEach(function (b) { b.addEventListener('click', function () { doc.accent = b.getAttribute('data-accent'); fillForm(true); draw(); saveDraft(); }); });
    ['logo', 'sign'].forEach(function (k) {
      $('#s-' + k, ed).addEventListener('change', function (e) { var f = e.target.files[0]; if (f) shrink(f, k === 'logo' ? 360 : 420).then(function (u) { doc.seller[k] = u; fillForm(true); draw(); saveDraft(); }); });
      $('[data-clear="' + k + '"]', ed).addEventListener('click', function () { doc.seller[k] = ''; $('#s-' + k, ed).value = ''; fillForm(true); draw(); saveDraft(); });
    });
    NS.suggest($('#s-name', ed), function () { return NSStore.list('biz'); }, function (x) { return x.name; }, function (b) {
      doc.seller = Object.assign(blank().seller, b); delete doc.seller.id; delete doc.seller.created; delete doc.seller.updated;
      regKind();
      fillForm(); suggestNumber(true); draw(); saveDraft();
    });
    NS.suggest($('#b-name', ed), function () { return NSStore.list('party'); }, function (x) { return x.name; }, function (p) {
      doc.buyer = { name: p.name, addr: p.addr || '', city: p.city || '', pin: p.pin || '', state: p.state || '', gstin: p.gstin || '', phone: p.phone || '', legal: p.gst && p.gst.legal || '' };
      if (p.ship && p.ship.addr) doc.ship = { name: p.ship.name || p.name, addr: p.ship.addr, city: p.ship.city || '', pin: p.ship.pin || '', state: p.ship.state || p.state || '' };
      buyerType = p.ptype || '';
      /* credit days of the party give the due date (only when the bill has none yet, or still has the one set this way) */
      if (T.due && num(p.cdays) > 0 && (!doc.due || doc.due === autoDue)) { doc.cdays = num(p.cdays); doc.due = autoDue = NSBooks.addDays(doc.date, doc.cdays); }
      fillForm(); draw(); saveDraft();
    });
    if (NS.gstFetchButton) NS.gstFetchButton($('#b-gstin', ed), function (d) {
      var b = doc.buyer;
      doc.buyer = { name: d.name, addr: d.addr || b.addr || '', city: d.city || b.city || '', pin: d.pin || b.pin || '', state: d.state || b.state || '', gstin: d.gstin, phone: b.phone || '', legal: d.legal || '' };
      fillForm(); draw(); saveDraft();
      NSStore.list('party').then(function (all) {
        var hit = all.filter(function (x) { return x.gstin === d.gstin; })[0] || all.filter(function (x) { return key(x.name) === key(d.name); })[0], want = T.buying ? 'supplier' : 'customer';
        var role = !hit || !hit.role ? want : hit.role === want || hit.role === 'both' ? hit.role : 'both';
        return NSStore.put('party', Object.assign(hit || {}, { name: d.name, addr: doc.buyer.addr, city: doc.buyer.city, pin: doc.buyer.pin, state: doc.buyer.state, gstin: d.gstin, role: role, reg: d.reg || '',
          gst: { legal: d.legal || '', trade: d.trade || '', status: d.status || '', type: d.type || '', since: d.since || '', checked: d.checked } }, hit && hit.phone ? {} : { phone: doc.buyer.phone }));
      }).then(function () { NS.toast(t('gf.saved', { n: d.name })); }, function (err) { NS.toast(t('nosave', { e: err.message }), 'bad'); });
    });
    ext('wire', ed);
  }

  function renderCharges() {
    var box = $('#chg-list', root); if (!box) return;
    var rates = ratesFor(doc.date), tax = taxOn(doc);
    box.innerHTML = (doc.charges || []).map(function (c, i) {
      var id = function (k) { return 'chg-' + k + '-' + i; }, g = c.gst == null || c.gst === '' ? 'main' : String(c.gst);
      return '<div class="chg" data-ci="' + i + '"><div class="f"><label for="' + id('name') + '">' + esc(t('b1.chgname')) + '</label><input id="' + id('name') + '" data-ck="name" list="dl-chg" dir="auto" value="' + esc(c.name) + '"></div>' +
        '<div class="f"><label for="' + id('amt') + '">' + esc(t('b1.chgamt')) + '</label><input id="' + id('amt') + '" data-ck="amt" inputmode="decimal" dir="ltr" value="' + esc(c.amt) + '"></div>' +
        '<div class="f"' + (tax ? '' : ' hidden') + '><label for="' + id('gst') + '">' + esc(t('l.gst')) + '</label><select id="' + id('gst') + '" data-ck="gst"><option value="main">' + esc(t('b1.chgmain')) + '</option>' +
          rates.map(function (r) { return '<option value="' + r + '"' + (String(r) === g ? ' selected' : '') + '>' + r + '%</option>'; }).join('') + '</select></div>' +
        '<button type="button" class="link" data-chgdel="' + i + '">' + esc(t('it.rm')) + '</button></div>';
    }).join('');
    $$('[data-chgdel]', box).forEach(function (b) { b.addEventListener('click', function () { doc.charges.splice(+b.getAttribute('data-chgdel'), 1); renderCharges(); draw(); saveDraft(); }); });
  }
  /* rate of a saved item for this document: purchase price on buying documents, wholesale rate for a wholesale party, else the sale rate */
  var buyerType = '', autoDue = '';
  function syncBuyer() {
    var nm = key(doc.buyer.name); if (!nm) { buyerType = ''; return; }
    NSStore.list('party').then(function (all) { var p = all.filter(function (x) { return key(x.name) === nm; })[0]; buyerType = p && p.ptype || ''; }).catch(function () {});
  }
  function rateFor(m) {
    if (T.buying && m.prate !== '' && m.prate != null) return m.prate;
    if (!T.buying && buyerType === 'wholesale' && m.wrate !== '' && m.wrate != null) return m.wrate;
    return m.rate;
  }
  function renderItems() {
    var box = $('#items', root);
    box.innerHTML = doc.items.map(function (it, i) {
      var id = function (k) { return 'it-' + k + '-' + i; };
      var f = function (k, lbl, extra) { return '<div class="f' + (k === 'gst' ? ' it-gst' : '') + '"><label for="' + id(k) + '">' + esc(lbl) + '</label><input id="' + id(k) + '" data-k="' + k + '" value="' + esc(it[k]) + '"' + (extra || '') + '></div>'; };
      return '<div class="it" data-i="' + i + '"><div class="it-head"><span>' + esc(t('it.n', { n: i + 1 })) + '</span>' + (doc.items.length > 1 ? '<button type="button" class="link" data-del="' + i + '">' + esc(t('it.rm')) + '</button>' : '') + '</div>' +
        '<div class="it-grid">' +
        '<div class="f it-d"><label for="' + id('desc') + '">' + esc(t('l.desc')) + '</label><input id="' + id('desc') + '" class="it-desc" data-k="desc" dir="auto" value="' + esc(it.desc) + '" placeholder="' + esc(t('ph.desc')) + '"></div>' +
        f('hsn', t('l.hsn'), ' inputmode="numeric" maxlength="8" dir="ltr"') + f('qty', t('l.qty'), ' inputmode="decimal" dir="ltr"') + f('unit', t('l.unit'), ' list="dl-units" dir="ltr"') +
        f('rate', t('l.rate'), ' inputmode="decimal" dir="ltr"') + f('disc', t('l.disc'), ' inputmode="decimal" dir="ltr"') + f('gst', t('l.gst'), ' inputmode="decimal" list="dl-rates" dir="ltr"') +
        ext('line', { it: it, i: i }).join('') +   /* extra line fields (batch, expiry, serial: docmore.js), inputs with data-k */
        '</div></div>';
    }).join('');
    $$('[data-del]', box).forEach(function (b) { b.addEventListener('click', function () { doc.items.splice(+b.getAttribute('data-del'), 1); renderItems(); draw(); saveDraft(); }); });
    $$('.it-desc', box).forEach(function (inp) {
      var i = +inp.closest('.it').getAttribute('data-i');
      NS.suggest(inp, function () { return NSStore.list('item'); }, function (x) { return x.desc; }, function (m) {
        var it = doc.items[i];
        it.desc = m.desc; it.hsn = m.hsn || ''; it.unit = m.unit || it.unit; var rt = rateFor(m); if (rt != null && rt !== '') it.rate = rt; if (m.gst != null && m.gst !== '') it.gst = m.gst;
        renderItems(); draw(); saveDraft();
      });
    });
    $$('.it-gst', box).forEach(function (f) { f.hidden = !taxOn(doc); });
  }

  var SMAP = { 's-name': 'name', 's-addr': 'addr', 's-city': 'city', 's-pin': 'pin', 's-state': 'state', 's-gstin': 'gstin', 's-phone': 'phone', 's-email': 'email', 's-bankName': 'bankName', 's-bankAcc': 'bankAcc', 's-bankIfsc': 'bankIfsc', 's-bankBranch': 'bankBranch', 's-upi': 'upi' };
  var BMAP = { 'b-name': 'name', 'b-addr': 'addr', 'b-city': 'city', 'b-pin': 'pin', 'b-state': 'state', 'b-gstin': 'gstin', 'b-phone': 'phone' };
  var SHMAP = { 'sh-name': 'name', 'sh-addr': 'addr', 'sh-city': 'city', 'sh-pin': 'pin', 'sh-state': 'state' };
  var DMAP = { 'd-kind': 'kind', 'd-no': 'no', 'd-date': 'date', 'd-due': 'due', 'd-valid': 'valid', 'd-deliv': 'deliv', 'd-recv': 'recv', 'd-pos': 'pos', 'd-ref': 'ref', 'd-notes': 'notes', 'd-terms': 'terms', 'd-status': 'status', 'd-copy': 'copyLabel',
    'd-reason': 'reason', 'd-paper': 'paper', 'd-design': 'design', 'd-copies': 'copies' };
  var OMAP = { 'd-ono': 'no', 'd-odate': 'date' }, TRMAP = { 'tr-veh': 'veh', 'tr-tname': 'tname', 'tr-lr': 'lr' };

  function fillForm(onlyLook) {
    var ed = $('#ed', root);
    if (!onlyLook) {
      Object.keys(SMAP).forEach(function (id) { var e = $('#' + id, ed); if (e) e.value = doc.seller[SMAP[id]] || ''; });
      Object.keys(BMAP).forEach(function (id) { $('#' + id, ed).value = doc.buyer[BMAP[id]] || ''; });
      Object.keys(DMAP).forEach(function (id) { var e = $('#' + id, ed); if (e) e.value = doc[DMAP[id]] == null ? '' : doc[DMAP[id]]; });
      Object.keys(OMAP).forEach(function (id) { var e = $('#' + id, ed); if (e) e.value = (doc.orig || {})[OMAP[id]] || ''; });
      Object.keys(TRMAP).forEach(function (id) { var e = $('#' + id, ed); if (e) e.value = (doc.tr || {})[TRMAP[id]] || ''; });
      if ($('#d-rc', ed)) $('#d-rc', ed).checked = !!doc.rc;
      if ($('#d-gst', ed)) $('#d-gst', ed).checked = doc.withGst !== false;
      $('#d-round', ed).checked = !!doc.round; $('#d-comp', ed).checked = doc.comp !== false;
      $('#b-ship', ed).checked = !!doc.ship; $('#ship-box', ed).hidden = !doc.ship;
      if (doc.ship) Object.keys(SHMAP).forEach(function (id) { $('#' + id, ed).value = doc.ship[SHMAP[id]] || ''; });
      renderItems(); renderCharges(); syncBuyer();
      var tc = doc.tcs || {};
      if ($('#tcs-on', ed)) { $('#tcs-on', ed).checked = !!tc.on; $('#tcs-sec', ed).value = tc.sec || ''; $('#tcs-rate', ed).value = tc.rate == null ? '' : tc.rate; $('#tcs-base', ed).value = tc.base || 'total'; $('#tcs-pan', ed).value = tc.pan || ''; $('#tcs-nopanok', ed).checked = !!tc.nopanOk; panNote(); if (tc.on) $('#tcs-box', ed).open = true; }
      if ($('#d-rec', ed)) { $('#d-rec', ed).value = doc.rec && doc.rec.every || ''; $('#d-recuntil', ed).value = doc.rec && doc.rec.until || ''; }
      ['s-gstin', 'b-gstin'].forEach(checkGstin);
      $$('[data-gf]', ed).forEach(function (i) { i.dispatchEvent(new Event('gf-sync')); });
      ext('fill', ed);
    }
    $$('[data-accent]', ed).forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-accent') === doc.accent)); });
    $('[data-clear="logo"]', ed).hidden = !doc.seller.logo; $('[data-clear="sign"]', ed).hidden = !doc.seller.sign;
    $('#kind-hint', ed).textContent = T.kinds.length > 1 ? t('kh.' + doc.kind) : '';
    $$('.it-gst', ed).forEach(function (f) { f.hidden = !taxOn(doc); });
    $('#comp-box', ed).hidden = doc.kind !== 'supply';
    if ($('#rec-until-f', ed)) $('#rec-until-f', ed).hidden = !(doc.rec && doc.rec.every);
    $$('#chg-list .chg .f:nth-child(3)', ed).forEach(function (f) { f.hidden = !taxOn(doc); });
  }

  function checkGstin(id) {
    var inp = $('#' + id, root), err = $('#' + id + '-err', root), r = NS.gstinCheck(inp.value);
    err.hidden = r.ok; err.textContent = r.ok ? '' : r.msg;
    inp.setAttribute('aria-invalid', String(!r.ok));
    return r;
  }

  function onInput(e) {
    var el = e.target, id = el.id;
    if (SMAP[id]) doc.seller[SMAP[id]] = el.value;
    else if (BMAP[id]) doc.buyer[BMAP[id]] = el.value;
    else if (SHMAP[id]) { doc.ship = doc.ship || {}; doc.ship[SHMAP[id]] = el.value; }
    else if (DMAP[id]) doc[DMAP[id]] = id === 'd-copies' ? +el.value : el.value;
    else if (OMAP[id]) { doc.orig = doc.orig || {}; doc.orig[OMAP[id]] = el.value; }
    else if (TRMAP[id]) { doc.tr = doc.tr || {}; doc.tr[TRMAP[id]] = id === 'tr-veh' ? el.value.toUpperCase().replace(/\s+/g, '') : el.value; }
    else if (id === 'd-rc') doc.rc = el.checked;
    else if (id === 'd-gst') { doc.withGst = el.checked; fillForm(true); }
    else if (id === 'd-round') doc.round = el.checked;
    else if (id === 'd-comp') doc.comp = el.checked;
    else if (id === 'b-ship') { doc.ship = el.checked ? (doc.ship || { name: '', addr: '', city: '', pin: '', state: '' }) : null; $('#ship-box', root).hidden = !el.checked; }
    else if (el.getAttribute('data-k')) { var i = +el.closest('.it').getAttribute('data-i'); doc.items[i][el.getAttribute('data-k')] = el.value; }
    else if (el.getAttribute('data-ck')) { var ci = +el.closest('.chg').getAttribute('data-ci'); doc.charges[ci][el.getAttribute('data-ck')] = el.value; }
    else if (/^tcs-/.test(id)) {
      doc.tcs = doc.tcs || {};
      if (id === 'tcs-on') doc.tcs.on = el.checked; else if (id === 'tcs-nopanok') doc.tcs.nopanOk = el.checked;
      else doc.tcs[id.slice(4)] = id === 'tcs-pan' ? (el.value = el.value.toUpperCase().replace(/\s/g, '')) : el.value;
      panNote();
      /* picking a nature from the list fills its rate from the Act (only when the rate is empty or was filled this way) */
      var nat = id === 'tcs-sec' && tcsNature(el.value), rf = $('#tcs-rate', root);
      if (nat && (!doc.tcs.rate || doc.tcs.rate === doc.tcs.auto)) { doc.tcs.rate = doc.tcs.auto = String(nat[1]); if (rf) rf.value = doc.tcs.rate; }
    }
    else if (id === 'd-rec' || id === 'd-recuntil') { doc.rec = $('#d-rec', root).value ? { every: $('#d-rec', root).value, until: $('#d-recuntil', root).value } : null; fillForm(true); }
    else return;
    if (id === 's-gstin' || id === 'b-gstin') {
      el.value = el.value.toUpperCase();
      var who = id[0] === 's' ? doc.seller : doc.buyer; who.gstin = el.value;
      var r = checkGstin(id);
      if (r.ok && r.state && !who.state && e.type === 'change') { who.state = r.state; $('#' + id[0] + '-state', root).value = r.state; }
    }
    if (id === 'd-kind') { fillForm(true); if (T.prefixes && !editingId) suggestNumber(false); }
    if (id === 'd-date' && e.type === 'change') suggestNumber(false);
    if (id === 'd-date' && doc.cdays && doc.due === autoDue && doc.date) { doc.due = autoDue = NSBooks.addDays(doc.date, doc.cdays); var du = $('#d-due', root); if (du) du.value = doc.due; }
    if (id === 'd-date') { var dl = $('#dl-rates', root); if (dl) dl.innerHTML = rateOpts(doc.date); }
    if (el.getAttribute('data-k') === 'hsn' && T.copy === 'inv') syncCopies();
    draw(); saveDraft();
  }

  /* ---------- numbering: prefix/FY/serial, one series per business and financial year ---------- */
  function suggestNumber(force) {
    if (editingId && !force) return Promise.resolve();
    var c = dset(), fy = NS.fy(doc.date), short = fy.slice(2, 4) + '-' + fy.slice(5);
    var pre = String(T.prefixes ? (c.prefixes || {})[doc.kind] || T.prefixes[doc.kind] : c.prefix != null ? c.prefix : T.prefix).trim().replace(/[^A-Za-z0-9\/\-]/g, '');
    var prefix = (pre ? pre + '/' : '') + (c.fy === false ? '' : short + '/'), digits = Math.min(6, Math.max(1, +c.digits || 3));
    return NSStore.list('doc').then(function (all) {
      var key = (doc.seller.name || '').trim().toLowerCase(), max = 0;
      all.forEach(function (d) {
        if (d.type !== doc.type || d.id === editingId || NS.fy(d.date) !== fy) return;
        if (d.counter) return;   /* bills of the pos counter have their own POS/ series */
        if (T.prefixes && (d.kind || T.kinds[0]) !== doc.kind) return;
        if ((d.seller && d.seller.name || '').trim().toLowerCase() !== key) return;
        var m = String(d.no || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, +m[1]);
      });
      if (force || !doc.no || doc.no === lastAuto || /^[A-Z]+\/\d\d-\d\d\/\d+$/.test(doc.no)) {
        doc.no = lastAuto = prefix + String(max + 1).padStart(digits, '0');
        var n = $('#d-no', root); if (n) n.value = doc.no;
        draw();
      }
    });
  }

  /* ---------- preview (English, like the printout) ---------- */
  function party(p, title) {
    if (!p || !(p.name || p.addr)) return '<div class="pt"><h4>' + title + '</h4><p class="ph">Customer name and address</p></div>';
    return '<div class="pt"><h4>' + title + '</h4><b>' + esc(p.name) + '</b>' + (p.addr ? '<p>' + esc(p.addr).replace(/\n/g, '<br>') + '</p>' : '') +
      (p.state ? '<p>' + esc(NS.stateName(p.state)) + ' (' + p.state + ')</p>' : '') +
      (p.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(p.gstin) + '</b></p>' : '') +
      (p.phone ? '<p>' + P.ph + ': ' + esc(p.phone) + '</p>' : '') + '</div>';
  }
  function title(d) { return P[T.title || d.kind]; }
  /* label/value pairs of the box under the heading, laid out two per row */
  function metaPairs(d, tax) {
    var posCode = d.pos || d.buyer.state, o = d.orig || {}, tr = d.tr || {}, x = [];
    x.push([P[pk(T.noLbl, d.kind) || 'no'], '<span class="mono">' + esc(d.no) + '</span>'], [P.date, NS.fmtDate(d.date)]);
    if (T.due) x.push([P.due, NS.fmtDate(d.due)]);
    if (T.valid) x.push([P.valid, NS.fmtDate(d.valid)]);
    if (T.deliv && d.deliv) x.push([P.deliv, NS.fmtDate(d.deliv)]);
    if (T.recv && d.recv) x.push([P.recv, NS.fmtDate(d.recv)]);
    if (T.purpose) x.push([P.purpose, P[d.kind]]);
    if (T.orig) { x.push([P.against, '<span class="mono">' + esc(o.no) + '</span>'], [P.invdate, NS.fmtDate(o.date)]); x.push([P.reason, P[RP[d.reason] || 'other']]); }
    x.push([P.pos, posCode ? esc(NS.stateName(posCode)) + ' (' + posCode + ')' : '']);
    if (T.rc && tax) x.push([P.rc, d.rc ? P.yes : P.no2]);
    if (d.ref || (type === 'invoice' && tax)) x.push([P[T.refLbl || 'ref'], esc(d.ref)]);
    if (T.transport) { if (tr.veh) x.push([P.veh, '<span class="mono">' + esc(tr.veh) + '</span>']); if (tr.tname) x.push([P.tname, esc(tr.tname)]); if (tr.lr) x.push([P.lr, esc(tr.lr)]); }
    return x;
  }
  function metaTable(x) {
    var h = '';
    for (var i = 0; i < x.length; i += 2) h += '<tr><th>' + x[i][0] + '</th><td' + (x[i + 1] ? '' : ' colspan="3"') + '>' + x[i][1] + '</td>' + (x[i + 1] ? '<th>' + x[i + 1][0] + '</th><td>' + x[i + 1][1] + '</td>' : '') + '</tr>';
    return '<table class="meta">' + h + '</table>';
  }
  function colLbl(tax) { return tax || type === 'invoice' ? P.taxable : T.priceCol ? P.price : T.purpose ? P.value : P.amount; }
  function made() { return '<p class="made">Made free at ' + esc(/^(localhost|127\.)/.test(location.hostname) ? (window.NS_CFG && NS_CFG.host || 'billing.niveshsahayak.in') : location.hostname.replace(/^www\./, '')) + '</p>'; }
  function bankHtml(s) {
    return '<div class="bank"><h4>' + P.bank + '</h4><p>' + esc(s.bankName) + (s.bankAcc ? '<br>' + P.acc + ' <b class="mono">' + esc(s.bankAcc) + '</b>' : '') + (s.bankIfsc ? '<br>' + P.ifsc + ' <b class="mono">' + esc(s.bankIfsc) + '</b>' : '') + (s.bankBranch ? '<br>' + P.branch + ': ' + esc(s.bankBranch) : '') + '</p></div>';
  }
  function sheetHtml(d, copyLabel) {
    var s = d.seller, tt = totals(d), tax = taxOn(d), SG = sgstName(d), note = pk(T.note, d.kind);
    if (/^th/.test(d.paper)) return thermalHtml(d, tt, tax, SG, copyLabel);
    var cols = tax ? 9 : 7, pty = pk(T.party, d.kind) || 'billto';
    return '<div class="sh d-' + esc(d.design || 'classic') + (d.paper === 'a5' ? ' a5' : '') + '" style="--ac:' + esc(d.accent) + '" lang="en-IN" dir="ltr">' +
      (T.pay && d.status === 'paid' ? '<div class="stamp">' + P.paid + '</div>' : '') +
      '<header class="sh-top"><div class="sh-from">' + (s.logo ? '<img class="logo" src="' + s.logo + '" alt="">' : '') +
        '<div>' + (T.buying ? '<p class="role">' + P.buyer + '</p>' : '') + '<h2>' + (s.name ? esc(s.name) : '<span class="ph">Your business name</span>') + '</h2>' +
        (s.addr ? '<p>' + esc(s.addr).replace(/\n/g, '<br>') + '</p>' : '<p class="ph">Address</p>') +
        (s.state ? '<p>' + esc(NS.stateName(s.state)) + ' (' + s.state + ')</p>' : '') +
        (s.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(s.gstin) + '</b></p>' : '') +
        ((s.phone || s.email) ? '<p>' + [s.phone ? P.ph + ': ' + esc(s.phone) : '', esc(s.email)].filter(Boolean).join(' · ') + '</p>' : '') +
      '</div></div><div class="sh-title"><p class="dt">' + title(d) + '</p>' + (T.copy && copyLabel ? '<p class="copy">' + P[copyLabel] + '</p>' : '') + '</div></header>' +
      ext('sheet', d).join('') +
      metaTable(metaPairs(d, tax)) +
      '<div class="parties">' + party(d.buyer, P[pty]) + (d.ship ? party(d.ship, P[T.shipLbl || 'shipto']) : '') + '</div>' +
      '<table class="lines"><thead><tr><th>#</th><th class="l">' + P.item + '</th><th>' + P.hsn + '</th><th class="n">' + P.qty + '</th><th class="n">' + P.rate + '</th><th class="n">' + P.disc + '</th><th class="n">' + colLbl(tax) + '</th>' + (tax ? '<th class="n">' + P.gst + '</th><th class="n">' + P.amount + '</th>' : '') + '</tr></thead><tbody>' +
      (tt.rows.length ? tt.rows.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(r.it.desc) + ext('lineNote', r.it).join('') + '</td><td class="mono">' + esc(r.it.hsn) + '</td><td class="n">' + NS.qty(num(r.it.qty)) + ' ' + esc(r.it.unit) + '</td><td class="n">' + (num(r.it.rate) ? NS.money(num(r.it.rate), false) : '') + '</td><td class="n">' + (num(r.it.disc) ? num(r.it.disc) + '%' : '') + '</td><td class="n">' + (r.taxable ? NS.money(r.taxable, false) : '') + '</td>' +
          (tax ? '<td class="n">' + r.g + '%</td><td class="n">' + NS.money(r.amount, false) + '</td>' : '') + '</tr>';
      }).join('') : '<tr><td colspan="' + cols + '" class="ph">Items you add appear here</td></tr>') +
      tt.charges.map(function (c) {
        return '<tr class="chg-row"><td></td><td class="l">' + esc(c.c.name || 'Charges') + '</td><td class="mono">' + esc(c.c.hsn || '') + '</td><td></td><td></td><td></td><td class="n">' + NS.money(c.amt, false) + '</td>' +
          (tax ? '<td class="n">' + c.g + '%</td><td class="n">' + NS.money(c.amount, false) + '</td>' : '') + '</tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="foot"><div class="foot-l">' +
        (tt.grand ? '<p class="words"><span>' + P.words + ':</span> <b>' + NS.inWords(tt.grand) + '</b></p>' : '') +
        (tax && Object.keys(tt.sum).length ? summaryTable(tt, SG) : '') +
        (d.kind === 'supply' && d.comp !== false ? '<p class="small">' + P.supplynote + '</p>' : '') +
        (note ? '<p class="small">' + P[note] + '</p>' : '') +
        (!T.buying && (s.bankAcc || s.bankName) ? bankHtml(s) : '') +
      '</div><div class="foot-r">' + (tt.grand || !T.purpose ? '<table class="tot"><tr><th>' + colLbl(tax) + '</th><td>' + NS.money(tt.taxable) + '</td></tr>' +
        (tax ? (tt.intra ? '<tr><th>' + P.cgst + '</th><td>' + NS.money(tt.cgst) + '</td></tr><tr><th>' + SG + '</th><td>' + NS.money(tt.sgst) + '</td></tr>' : '<tr><th>' + P.igst + '</th><td>' + NS.money(tt.igst) + '</td></tr>') : '') +
        (tt.tcs ? '<tr><th>' + tcsLbl(d) + '</th><td>' + NS.money(tt.tcs) + '</td></tr>' : '') +
        (tt.roundOff ? '<tr><th>' + P.round + '</th><td>' + (tt.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(tt.roundOff)) + '</td></tr>' : '') +
        '<tr class="grand"><th>' + P.total + '</th><td>' + NS.money(tt.grand) + '</td></tr></table>' : '') +
        (T.qr && s.upi && tt.grand > 0 && d.status !== 'paid' ? '<div class="qr"><div class="qr-img" data-qr></div><small>' + P.upi + '<br><b class="mono">' + esc(s.upi) + '</b></small></div>' : '') +
      '</div></div>' +
      (d.notes || d.terms ? '<div class="nt">' + (d.notes ? '<div><h4>' + P.notes + '</h4><p>' + esc(d.notes).replace(/\n/g, '<br>') + '</p></div>' : '') + (d.terms ? '<div><h4>' + P.terms + '</h4><p>' + esc(d.terms).replace(/\n/g, '<br>') + '</p></div>' : '') + '</div>' : '') +
      (T.purpose ? '<div class="signs"><div class="signbox"><p>' + P.recd + '</p><div class="sp"></div><p>' + P.recdsign + '</p></div>' : '') +
      '<div class="signbox"><p>' + P['for'] + ' <b>' + esc(s.name || '') + '</b></p>' + (s.sign ? '<img src="' + s.sign + '" alt="">' : '<div class="sp"></div>') + '<p>' + P.sign + '</p></div>' + (T.purpose ? '</div>' : '') +
      made() + '</div>';
  }
  /* printed: section, the rate that applied, and the buyer's PAN (s.397(2)(h): the PAN is shown on bills) */
  function tcsLbl(d) {
    var c = d.tcs || {}, sec = String(c.sec || '').split(':')[0].trim(), pan = NSBooks.tcsPan(d), r = NSBooks.tcsRate(d);
    return (sec ? P.tcsu + ' ' + esc(sec) : P.tcs) + ' @ ' + esc(r) + '%' + (pan ? ' (buyer PAN ' + esc(pan) + ')' : c.nopanOk ? '' : ' (no PAN, s.397(2))');
  }
  /* thermal roll (58 or 80 mm): one narrow column, every line on its own row */
  function thermalHtml(d, tt, tax, SG, copyLabel) {
    var s = d.seller, b = d.buyer, line = function (l, r, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + l + '</th><td>' + r + '</td></tr>'; };
    return '<div class="sh th ' + esc(d.paper) + '" lang="en-IN" dir="ltr">' +
      (s.logo ? '<img class="logo" src="' + s.logo + '" alt="">' : '') +
      '<h2>' + (s.name ? esc(s.name) : '<span class="ph">Your business name</span>') + '</h2>' +
      (s.addr ? '<p>' + esc(s.addr).replace(/\n/g, '<br>') + '</p>' : '') +
      (s.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(s.gstin) + '</b></p>' : '') + (s.phone ? '<p>' + P.ph + ': ' + esc(s.phone) + '</p>' : '') +
      '<p class="dt">' + title(d) + '</p>' + (T.copy && copyLabel ? '<p class="copy">' + P[copyLabel] + '</p>' : '') +
      '<table class="kv">' + metaPairs(d, tax).filter(function (p) { return p[1] && p[1] !== '<span class="mono"></span>'; }).map(function (p) { return line(p[0], p[1]); }).join('') +
        (b.name ? line(P[pk(T.party, d.kind) || 'billto'], esc(b.name)) : '') + (b.gstin ? line(P.gstin, '<span class="mono">' + esc(b.gstin) + '</span>') : '') + '</table>' +
      '<table class="tl"><thead><tr><th class="l">' + P.item + '</th><th class="n">' + P.amount + '</th></tr></thead><tbody>' +
      (tt.rows.length ? tt.rows.map(function (r) {
        return '<tr><td colspan="2" class="l">' + esc(r.it.desc) + (r.it.hsn ? ' <small class="mono">' + esc(r.it.hsn) + '</small>' : '') + '</td></tr>' +
          '<tr class="q"><td class="l">' + NS.qty(num(r.it.qty)) + ' ' + esc(r.it.unit) + (num(r.it.rate) ? ' × ' + NS.money(num(r.it.rate), false) : '') + (num(r.it.disc) ? ' −' + num(r.it.disc) + '%' : '') + (tax ? ' +' + r.g + '%' : '') + '</td><td class="n">' + (r.amount ? NS.money(r.amount, false) : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="2" class="ph">Items you add appear here</td></tr>') +
      tt.charges.map(function (c) { return '<tr class="q"><td class="l">' + esc(c.c.name || 'Charges') + (tax ? ' +' + c.g + '%' : '') + '</td><td class="n">' + NS.money(c.amount, false) + '</td></tr>'; }).join('') + '</tbody></table>' +
      (tt.grand ? '<table class="kv tot">' + line(colLbl(tax), NS.money(tt.taxable)) +
        (tax ? (tt.intra ? line(P.cgst, NS.money(tt.cgst)) + line(SG, NS.money(tt.sgst)) : line(P.igst, NS.money(tt.igst))) : '') +
        (tt.tcs ? line(tcsLbl(d), NS.money(tt.tcs)) : '') + (tt.roundOff ? line(P.round, (tt.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(tt.roundOff))) : '') + line(P.total, NS.money(tt.grand), 'grand') + '</table>' +
        '<p class="words">' + NS.inWords(tt.grand) + '</p>' : '') +
      (T.pay && d.status === 'paid' ? '<p class="paidline">' + P.paid + '</p>' : '') +
      (T.qr && s.upi && tt.grand > 0 && d.status !== 'paid' ? '<div class="qr"><div class="qr-img" data-qr></div><small>' + P.upi + '<br><b class="mono">' + esc(s.upi) + '</b></small></div>' : '') +
      (d.notes ? '<p class="nt1">' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '') +
      (type === 'cashmemo' ? '<p class="thanks">' + P.thanks + '</p>' : '') + made() + '</div>';
  }
  /* an invoice of services only (every HSN/SAC starts with 99) is made in duplicate: Original for recipient, Duplicate for supplier (Rule 48) */
  function copyKey() {
    if (T.copy !== 'inv' || !doc) return T.copy;
    var h = doc.items.map(function (it) { return String(it.hsn || '').replace(/\D/g, ''); }).filter(Boolean);
    return h.length && h.every(function (x) { return /^99/.test(x); }) ? 'invs' : 'inv';
  }
  function syncCopies() {
    var sel = $('#d-copy', root), set = COPIES[copyKey()];
    if (!sel || !set) return;
    if (doc.copyLabel && set.indexOf(doc.copyLabel) < 0) doc.copyLabel = set[set.indexOf('dupsup') >= 0 && doc.copyLabel !== 'orig' ? 1 : 0];
    sel.innerHTML = set.map(function (k) { return '<option value="' + k + '">' + esc(t('cp.' + k)) + '</option>'; }).join('') + '<option value="">' + esc(t('cp.none')) + '</option>';
    sel.value = doc.copyLabel || '';
    var n = $('#d-copies', root);
    if (n) { var v = Math.min(+doc.copies || 1, set.length); n.innerHTML = set.map(function (k, i) { return '<option value="' + (i + 1) + '">' + esc(t(i ? 'cps.n' : 'cps.1', { n: i + 1 })) + '</option>'; }).join(''); n.value = String(v); doc.copies = v; }
  }
  /* print copies: 1 = the chosen label; 2 or 3 = Original, Duplicate (and Triplicate) one after another */
  function labelsFor(d, all) {
    var n = +d.copies || 1;
    return T.copy && d.copyLabel && all && n > 1 ? COPIES[copyKey()].slice(0, n) : [d.copyLabel];
  }
  function draw(all) {
    if (!sheet) return;
    var d = doc, s = d.seller, tt = totals(d), tax = taxOn(d), SG = sgstName(d);
    sheet.innerHTML = labelsFor(d, all === true).map(function (l) { return sheetHtml(d, l); }).join('');
    pageStyle(d.paper);
    $$('[data-qr]', sheet).forEach(function (q) { drawQr(q, s, d, tt.grand); });
    ext('drawn', sheet);
    panNote(); cnTcs();
    var es = $('#ed-sums', root);
    if (es) es.innerHTML = '<span>' + esc(t('sum.items', { n: tt.rows.length })) + '</span><span>' + esc(t('sum.taxable', { v: NS.money(tt.taxable) })) + '</span>' +
      (tax ? '<span>' + esc(t('sum.gst', { v: NS.money(tt.cgst + tt.sgst + tt.igst) })) + (tt.intra ? ' (CGST + ' + SG + ')' : ' (IGST)') + '</span>' : '') + (tt.tcs ? '<span>' + esc(t('b1.sumtcs', { v: NS.money(tt.tcs) })) + '</span>' : '') + '<b>' + esc(t('sum.total', { v: NS.money(tt.grand) })) + '</b>';
    fit();
  }
  /* the printer's paper follows the chosen size */
  function pageStyle(paper) {
    var st = $('#ns-page') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ns-page' }));
    st.textContent = '@media print{@page{' + ({ a5: 'size:A5;margin:0', th80: 'size:80mm 297mm;margin:0', th58: 'size:58mm 297mm;margin:0' }[paper] || 'size:A4;margin:0') + '}}';
  }
  function summaryTable(tt, SG) {
    var rows = Object.keys(tt.sum).map(function (k) { return tt.sum[k]; });
    return '<table class="sum"><caption>' + P.summary + '</caption><thead><tr><th>' + P.hsn + '</th><th class="n">' + P.taxable + '</th><th class="n">' + P.gst + '</th>' +
      (tt.intra ? '<th class="n">' + P.cgst + '</th><th class="n">' + SG + '</th>' : '<th class="n">' + P.igst + '</th>') + '</tr></thead><tbody>' +
      rows.map(function (s) { return '<tr><td class="mono">' + esc(s.hsn) + '</td><td class="n">' + NS.money(s.taxable, false) + '</td><td class="n">' + s.g + '%</td>' + (tt.intra ? '<td class="n">' + NS.money(s.tax / 2, false) + '</td><td class="n">' + NS.money(s.tax / 2, false) + '</td>' : '<td class="n">' + NS.money(s.tax, false) + '</td>') + '</tr>'; }).join('') +
      '</tbody></table>';
  }
  function drawQr(box, s, d, amount) {
    if (!window.qrcode) return;
    var link = 'upi://pay?pa=' + encodeURIComponent(s.upi.trim()) + '&pn=' + encodeURIComponent((s.name || '').slice(0, 40)) + '&am=' + amount.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent((docName() + ' ' + d.no).slice(0, 40));
    try { var qr = qrcode(0, 'M'); qr.addData(link); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { box.hidden = true; }
  }
  function fit() {
    var wrap = $('.pv', root), sc = $('.pv-scale', root);
    if (!wrap || !sc || !wrap.clientWidth) return;
    var first = sheet.firstElementChild, k = Math.min(1, wrap.clientWidth / (first && first.offsetWidth || 794));
    sc.style.transform = 'scale(' + k + ')';
    wrap.style.height = (sheet.offsetHeight * k) + 'px';
  }

  /* ---------- images: shrink before storing ---------- */
  function shrink(file, max) {
    return new Promise(function (res) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/png'));
      };
      img.onerror = function () { NS.toast(t('img.bad'), 'bad'); res(''); };
      img.src = url;
    });
  }

  /* ---------- draft (so a reload never loses typing) ---------- */
  var dkey;
  function saveDraft() { try { localStorage.setItem(dkey, JSON.stringify({ doc: doc, id: editingId })); } catch (e) {} }
  function loadDraft() { try { var j = JSON.parse(localStorage.getItem(dkey) || 'null'); return j && j.doc ? j : null; } catch (e) { return null; } }

  /* ---------- save, masters ---------- */
  function key(s) { return String(s || '').trim().toLowerCase(); }
  function upsert(store, match, obj) {
    return NSStore.list(store).then(function (all) {
      var hit = all.filter(match)[0];
      return NSStore.put(store, Object.assign(hit || {}, obj));
    });
  }
  function regKind() {
    if (T.kinds.indexOf('supply') < 0) return;
    if (doc.seller.reg === 'comp') { doc.kind = 'supply'; doc.comp = true; }
    else if (doc.seller.reg === 'unreg') doc.kind = 'plain';
  }
  function validate() {
    var tt = totals(doc), probs = [];
    /* Rule 46(e): an unregistered buyer's name, address and state when the taxable value is Rs 50,000 or more */
    if ((type === 'invoice' || type === 'cashmemo') && !String(doc.buyer.gstin || '').trim() && tt.taxable >= 50000) {
      if (!String(doc.buyer.name || '').trim()) probs.push(['b-name', t('v.b2c')]);
      else if (!String(doc.buyer.addr || '').trim()) probs.push(['b-addr', t('v.b2c')]);
      else if (!doc.buyer.state) probs.push(['b-state', t('v.b2c')]);
    }
    if (type === 'note') {
      if (!String((doc.orig || {}).no || '').trim() || !(doc.orig || {}).date) probs.push(['d-ono', t('v.orig')]);
      if (!String(doc.buyer.gstin || '').trim() && (!String(doc.buyer.addr || '').trim() || !doc.buyer.state)) probs.push([doc.buyer.addr ? 'b-state' : 'b-addr', t('v.naddr')]);
    }
    if (type === 'self' && !doc.seller.gstin) probs.push(['s-gstin', t('v.sigst')]);
    if (T.igst && /wop$/.test(doc.kind) && tt.rows.some(function (r) { return r.g; })) probs.push(['it-gst-0', t('v.lut0')]);
    if (T.igst && !doc.seller.gstin) probs.push(['s-gstin', t('v.tax')]);
    if (type === 'self' && !doc.recv) probs.push(['d-recv', t('v.recv')]);
    if (!doc.seller.name.trim()) probs.push(['s-name', t('v.bname')]);
    if (!tt.rows.length) probs.push(['it-desc-0', t('v.item')]);
    (doc.charges || []).forEach(function (c, i) { if (num(c.amt) && !String(c.name || '').trim()) probs.push(['chg-name-' + i, t('b1.v_chg')]); });
    if (TCS_TYPES[type] && doc.tcs && doc.tcs.on && !(num(doc.tcs.rate) > 0)) probs.push(['tcs-rate', t('b1.v_tcs')]);
    var tn = TCS_TYPES[type] && doc.tcs && doc.tcs.on && tcsNature(doc.tcs.sec);
    /* Sl.6: value of a single item over Rs 10 lakh (CBDT FAQ on Notification 36/2025, Q3); with GST counted, as in Circular 17/2020 */
    if (tn && tn[2] === 6 && !(maxUnit(tt, 1) > 1000000)) probs.push(['tcs-on', t('b1.v_tcs10')]);
    if (!String(doc.no).trim()) probs.push(['d-no', tw('v.no')]);
    if (String(doc.no).length > 16) probs.push(['d-no', t('v.len')]);
    if (/[^A-Za-z0-9\/\-]/.test(doc.no)) probs.push(['d-no', t('v.chars')]);
    if (!NS.gstinCheck(doc.seller.gstin).ok) probs.push(['s-gstin', t('v.sg')]);
    if (!NS.gstinCheck(doc.buyer.gstin).ok) probs.push(['b-gstin', t('v.bg')]);
    if (doc.kind === 'tax' && !doc.seller.gstin) probs.push(['s-gstin', t('v.tax')]);
    if (T.gstFlag && !T.buying && taxOn(doc) && !doc.seller.gstin) probs.push(['s-gstin', t('v.qtax')]);
    return probs;
  }
  /* credit limit of the party (Configuration Hub): warn before saving an unpaid bill that takes what they owe over it */
  function creditCheck(tt0) {
    if (T.buying || !T.pay || doc.status === 'paid' || !String(doc.buyer.name || '').trim()) return Promise.resolve();
    return Promise.all([NSStore.list('party'), NSStore.list('doc')]).then(function (r) {
      var p = r[0].filter(function (x) { return key(x.name) === key(doc.buyer.name); })[0], lim = p ? num(p.climit) : 0;
      if (!lim) return;
      var others = r[1].filter(function (d) { return d.id !== editingId; }), bal = (NSBooks.parties(others, doc.seller.name)[NSBooks.key(doc.buyer.name)] || { bal: 0 }).bal;
      var after = r2(bal + tt0.grand);
      if (after > lim && !confirm(t('b1.over', { name: p.name, limit: NS.money(lim), now: NS.money(Math.max(0, bal)), after: NS.money(after) }))) throw new Error('cancel');
    });
  }
  function maxUnit(tt, withGst) { return Math.max.apply(null, [0].concat(tt.rows.map(function (r) { return (withGst ? r.amount : r.taxable) / (num(r.it.qty) || 1); }))); }
  function save() {
    var probs = validate();
    var tt0 = totals(doc);
    var tn0 = TCS_TYPES[type] && doc.tcs && doc.tcs.on && tcsNature(doc.tcs.sec);
    if (!probs.length && tn0 && tn0[2] === 6 && !(maxUnit(tt0, 0) > 1000000) && !confirm(t('b1.c_tcs10g'))) return Promise.reject(new Error('cancel'));
    if (!probs.length && taxOn(doc) && doc.date >= '2026-02-01' && type !== 'note' && tt0.rows.some(function (r) { return r.g === 28; }) && !confirm(t('c.r28'))) return Promise.reject(new Error('cancel'));
    if (!probs.length && type === 'cashmemo' && tt0.grand >= 200000 && !confirm(t('c.cash2l'))) return Promise.reject(new Error('cancel'));
    if (!probs.length && type === 'self' && doc.recv && (new Date(doc.date) - new Date(doc.recv)) / 864e5 > 30 && !confirm(t('c.si30'))) return Promise.reject(new Error('cancel'));
    if (!probs.length && type === 'note' && doc.kind === 'credit' && doc.orig && doc.orig.date && doc.date > (+NS.fy(doc.orig.date).slice(0, 4) + 1) + '-11-30' && !confirm(t('c.cn30'))) return Promise.reject(new Error('cancel'));
    var blk = ext('block', doc).filter(Boolean)[0];   /* e.g. a closed financial year (docmore.js) */
    if (!probs.length && blk) { NS.toast(blk, 'bad'); return Promise.reject(new Error(blk)); }
    if (probs.length) {
      var p = probs[0], f = $('#' + p[0], root);
      NS.toast(p[1], 'bad');
      if (f) { var det = f.closest('details'); if (det) det.open = true; showTab('edit'); f.focus(); }
      return Promise.reject(new Error(p[1]));
    }
    return creditCheck(tt0).then(function () { return NSStore.list('doc'); }).then(function (all) {
      var dup = all.filter(function (d) { return d.id !== editingId && d.type === doc.type && key(d.no) === key(doc.no) && NS.fy(d.date) === NS.fy(doc.date) && key(d.seller && d.seller.name) === key(doc.seller.name); })[0];
      if (dup && !confirm(tw(T.valid ? 'c.qdup' : 'c.dup', { no: doc.no }))) throw new Error('cancel');
    }).then(function () {
      var s = doc.seller, b = doc.buyer, jobs = [];
      jobs.push(upsert('biz', function (x) { return key(x.name) === key(s.name); }, JSON.parse(JSON.stringify(s))));
      if (b.name.trim()) jobs.push(NSStore.list('party').then(function (all) {
        /* a vendor on a purchase order is saved as a supplier; someone already saved as the other side becomes both */
        var hit = all.filter(function (x) { return key(x.name) === key(b.name); })[0], want = T.buying ? 'supplier' : 'customer';
        var role = !hit || !hit.role ? want : hit.role === want || hit.role === 'both' ? hit.role : 'both';
        return NSStore.put('party', Object.assign(hit || {}, { name: b.name.trim(), addr: b.addr, city: b.city, pin: b.pin, state: b.state, gstin: b.gstin, phone: b.phone, role: role }));
      }));
      doc.items.forEach(function (it) {
        if (!String(it.desc).trim()) return;
        /* the saved price list stays as it is: a buying document notes the purchase price, a wholesale rate on a bill doesn't replace the sale rate */
        jobs.push(NSStore.list('item').then(function (all) {
          var hit = all.filter(function (x) { return key(x.desc) === key(it.desc); })[0], o = { desc: String(it.desc).trim(), hsn: it.hsn, unit: it.unit, gst: it.gst };
          if (T.buying) { o.prate = it.rate; if (!hit) o.rate = ''; }
          else if (!hit || (num(it.rate) !== num(hit.wrate) && num(it.rate) !== num(hit.prate))) o.rate = it.rate;
          return NSStore.put('item', Object.assign(hit || {}, o));
        }));
      });
      return Promise.all(jobs);
    }).then(function () {
      var rec = JSON.parse(JSON.stringify(doc));
      rec.total = totals(doc).grand;
      if (editingId) rec.id = editingId;
      return NSStore.put('doc', rec);
    }).then(function (rec) {
      editingId = rec.id; saveDraft();
      /* an invoice made from a quotation marks that quotation "Invoice made" */
      if (doc.fromId) NSStore.get('doc', doc.fromId).then(function (q) {
        /* an invoice marks it "Invoice made"; a sales order or challan made from it is noted on it (status unchanged) */
        if (!q) return;
        if (type === 'invoice') { if (q.status === 'inv') return; q.status = 'inv'; q.invNo = doc.no; } else { if (q.nextNo === doc.no) return; q.nextNo = doc.no; q.nextType = type; }
        return NSStore.put('doc', q);
      }).catch(function () {});
      NS.toast(tw('saved', { no: doc.no }));
      NS.folderWrite(false);
      NS.checkReminder();
      setStatus();
      return rec;
    }).catch(function (e) { if (e.message !== 'cancel') NS.toast(t('nosave', { e: e.message }), 'bad'); throw e; });
  }
  function setStatus() {
    var st = $('#tool-status', root);
    if (st) st.textContent = editingId ? tw('st.edit', { no: doc.no }) : tw('st.new');
  }

  function startNew() {
    var seller = doc.seller;
    doc = blank(); editingId = null;
    doc.seller = seller;
    fillForm(); suggestNumber(true); draw(); saveDraft(); setStatus();
  }
  function openDoc(rec, asCopy) {
    doc = Object.assign(blank(), JSON.parse(JSON.stringify(rec)));
    delete doc.id; delete doc.created; delete doc.updated; delete doc.total;
    editingId = asCopy ? null : rec.id;
    if (asCopy) { doc.date = NS.today(); doc.due = ''; doc.valid = ''; doc.status = blank().status; doc.irn = null; doc.rec = null; delete doc.fromId; delete doc.invNo; delete doc.recOf; delete doc.recFor; delete doc.sample; }
    fillForm(); if (asCopy) suggestNumber(true); draw(); saveDraft(); setStatus(); showTab('edit');
    window.scrollTo({ top: root.offsetTop - 10, behavior: 'smooth' });
  }

  /* ---------- history ---------- */
  var histOpen = false;
  function renderHistory() {
    var dlg = $('#ns-history'); if (!dlg) return;
    var list = $('[data-hist-list]', dlg), q = $('[data-hist-q]', dlg);
    NSStore.list('doc').then(function (all) {
      var v = key(q.value);
      var rows = all.filter(function (d) { return d.type === doc.type; }).filter(function (d) {
        return !v || [d.no, d.buyer && d.buyer.name, d.seller && d.seller.name].join(' ').toLowerCase().indexOf(v) >= 0;
      }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); });
      list.innerHTML = rows.length ? rows.map(function (d) {
        var st = T.pay ? '<span class="pill ' + (d.status === 'paid' ? 'ok' : '') + '">' + esc(t(d.status === 'paid' ? 'h.paidp' : 'h.unpaidp')) + '</span>'
          : '<span class="pill ' + (d.status === 'acc' || d.status === 'inv' ? 'ok' : '') + '">' + esc(t('qs.' + (d.status || 'open'))) + (d.invNo ? ' ' + esc(d.invNo) : '') + '</span>';
        if (d.sample) st += ' <span class="b1-pill">' + esc(t('b1.sample')) + '</span>';
        if (d.rec && d.rec.every) st += ' <span class="pill">' + esc(t(d.rec.every === 'quarter' ? 'b1.rep_q' : 'b1.rep_m')) + '</span>';
        return '<li><div><b class="mono">' + esc(d.no) + '</b> · ' + NS.fmtDate(d.date) + '<br><span>' + esc(d.buyer && d.buyer.name || t('h.nocust')) + '</span> · <b>' + NS.money(d.total || 0) + '</b> ' + st + '</div>' +
          '<div class="row"><button type="button" class="btn sm" data-h="open" data-id="' + d.id + '">' + esc(t('h.open')) + '</button><button type="button" class="btn sm" data-h="copy" data-id="' + d.id + '">' + esc(t('h.copy')) + '</button>' +
          (T.pay ? '<button type="button" class="btn sm" data-h="paid" data-id="' + d.id + '">' + esc(t(d.status === 'paid' ? 'h.unpaid' : 'h.paid')) + '</button>' : '') +
          (T.toInvoice ? '<button type="button" class="btn sm" data-h="inv" data-id="' + d.id + '">' + esc(t('b.toinv')) + '</button>' : '') +
          '<button type="button" class="btn sm" data-h="log" data-id="' + d.id + '">' + esc(t('b1.changes')) + '</button>' +
          '<button type="button" class="btn sm danger" data-h="del" data-id="' + d.id + '">' + esc(t('h.del')) + '</button></div></li>';
      }).join('') : '<li class="empty">' + esc(t(v ? 'h.nomatch' : 'h.none')) + '</li>';
    });
  }
  function openHistory() {
    var dlg = $('#ns-history'); if (!dlg) return;
    if (!dlg._wired) {
      dlg._wired = true;
      $('[data-hist-q]', dlg).addEventListener('input', renderHistory);
      dlg.addEventListener('close', function () { histOpen = false; });
      $('[data-hist-list]', dlg).addEventListener('click', function (e) {
        var b = e.target.closest('[data-h]'); if (!b) return;
        var id = b.getAttribute('data-id'), act = b.getAttribute('data-h');
        NSStore.get('doc', id).then(function (rec) {
          if (!rec) return;
          if (act === 'open' || act === 'copy') { dlg.close(); openDoc(rec, act === 'copy'); }
          else if (act === 'inv') { location.href = BILLING + '?from=' + encodeURIComponent(id); }
          else if (act === 'paid') { rec.status = rec.status === 'paid' ? 'unpaid' : 'paid'; return NSStore.put('doc', rec).then(function () { if (editingId === id) { doc.status = rec.status; fillForm(); draw(); } renderHistory(); }); }
          else if (act === 'log') NS.showLog(id, t('b1.changesof', { no: rec.no }));
          else if (act === 'del' && NS.closedMsg && NS.closedMsg(rec.seller && rec.seller.name, rec.date)) NS.toast(NS.closedMsg(rec.seller && rec.seller.name, rec.date), 'bad');   /* closed year (docmore.js) */
          else if (act === 'del' && confirm(t('b1.cdel', { x: rec.no }))) {
            return NSStore.del('doc', id).then(function () { if (editingId === id) { editingId = null; setStatus(); } renderHistory(); NS.toast(t('b1.binned')); }, function (err) { NS.toast(err.message, 'bad'); });
          }
        });
      });
    }
    histOpen = true;
    renderHistory();
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }

  /* ---------- print, share ---------- */
  function printDoc() {
    var old = document.title;
    document.title = fileName();
    showTab('preview', true);
    draw(true);
    fit();
    setTimeout(function () { window.print(); document.title = old; draw(); }, 60);
  }
  /* the English name used in file names and shared messages */
  var NAMES = { tax: 'Invoice', supply: 'Bill of Supply', plain: 'Invoice', quote: 'Quotation', estimate: 'Estimate', proforma: 'Proforma Invoice', so: 'Sales Order', challan: 'Delivery Challan',
    po: 'Purchase Order', credit: 'Credit Note', debit: 'Debit Note', cashmemo: 'Cash Memo', self: 'Self Invoice' };
  function docName() { return NAMES[T.title || doc.kind] || 'Invoice'; }
  function fileName() { return docName() + ' ' + (doc.no || '') + (doc.buyer.name ? ' - ' + doc.buyer.name : ''); }
  function shareText() {
    var tt = totals(doc);
    return docName() + ' ' + doc.no + ' from ' + (doc.seller.name || '') + '\nDate: ' + NS.fmtDate(doc.date) + (doc.due ? '\nDue: ' + NS.fmtDate(doc.due) : '') + (doc.valid ? '\nValid until: ' + NS.fmtDate(doc.valid) : '') +
      (doc.deliv ? '\nDelivery by: ' + NS.fmtDate(doc.deliv) : '') + (tt.grand ? '\nAmount: ' + NS.money(tt.grand) : '') +
      (!T.buying && doc.seller.upi && T.qr ? '\nPay by UPI: ' + doc.seller.upi : '') + (!T.buying && doc.seller.bankAcc && (T.qr || T.pay) ? '\nBank: ' + doc.seller.bankName + ' A/c ' + doc.seller.bankAcc + ' IFSC ' + doc.seller.bankIfsc : '');
  }
  /* Share = a PDF through the phone's share sheet (WhatsApp, email…); where files can't be shared it downloads the PDF */
  function shareDoc() {
    showTab('preview', true); fit();
    NS.sharePdf($$('.sh', sheet), fileName(), doc.paper, docName() + ' ' + doc.no, shareText());
  }
  /* ---------- quotation, proforma, sales order or challan -> invoice: saved first, then the billing site opens it by id from the shared data home ---------- */
  function toInvoice() {
    save().then(function (rec) { location.href = BILLING + '?from=' + encodeURIComponent(rec.id); }).catch(function () {});
  }
  function fromQuote(id) {
    return NSStore.get('doc', id).then(function (q) {
      if (!q || q.type === type) { NS.toast(t('conv.none'), 'bad'); return false; }
      var inv = blank(), qd = JSON.parse(JSON.stringify(q)), src = TYPES[qd.type] || {};
      inv.seller = Object.assign(inv.seller, qd.seller); delete inv.seller.id; delete inv.seller.created; delete inv.seller.updated;
      inv.buyer = qd.buyer; inv.ship = qd.ship || null; inv.pos = qd.pos || ''; inv.items = qd.items; inv.notes = qd.notes || inv.notes;
      inv.round = qd.round !== false; inv.accent = qd.accent || inv.accent;
      if (type === 'invoice') inv.kind = !inv.seller.gstin ? 'plain' : qd.withGst === false && !src.gstOff ? 'supply' : 'tax';
      else if (T.gstFlag) inv.withGst = qd.withGst !== false;
      inv.ref = (NAMES[src.title || qd.kind] ? NAMES[src.title || qd.kind] + ' ' : '') + qd.no;
      inv.fromId = q.id;
      doc = inv; editingId = null;
      NS.toast(t('conv.done', { doc: t('doc.' + (qd.kind === 'estimate' ? 'estimate' : qd.type)), no: qd.no }));
      return true;
    }).catch(function () { NS.toast(t('conv.none'), 'bad'); return false; });
  }
  /* ---------- phone tabs ---------- */
  function showTab(which, quiet) {
    root.setAttribute('data-tab', which);
    $$('[data-tab-btn]', root).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab-btn') === which)); });
    if (!quiet && which === 'preview') fit();
  }

  /* ---------- labels of the fixed buttons ---------- */
  function labelButtons() {
    var L = { 'new': tw('b.new'), history: tw('b.hist'), save: t('b.save'), print: t('b.print'), share: t('b.share'), toinv: t('b.toinv') };
    $$('[data-do]').forEach(function (b) { var k = b.getAttribute('data-do'); if (L[k]) b.textContent = L[k]; });
    $$('[data-tab-btn]', root).forEach(function (b) { b.textContent = t('tab.' + b.getAttribute('data-tab-btn')); });
    var pv = $('.pv', root); if (pv) pv.setAttribute('aria-label', t('tab.preview'));
    var dlg = $('#ns-history');
    if (dlg) { $('h2', dlg).textContent = t('h.title'); $('label', dlg).textContent = t('h.search'); }
  }

  /* ---------- start ---------- */
  function init() {
    root = $('#tool');
    if (!root) return;
    type = root.getAttribute('data-doc') || 'invoice';
    T = Object.assign({}, TYPES[type] || TYPES.invoice);
    /* one engine type can serve two sites: the estimate site opens the quotation type on its Estimate kind */
    var k0 = root.getAttribute('data-kind'); if (k0 && T.kinds.indexOf(k0) >= 0) T.kind0 = k0;
    sheet = $('#sheet', root);
    dkey = 'ns-draft-' + type;
    var ed = $('#ed', root);
    ed.addEventListener('input', onInput);
    ed.addEventListener('change', onInput);
    doc = blank();
    var dr = loadDraft();
    if (dr) { doc = Object.assign(blank(), dr.doc); delete doc.lang; editingId = dr.id || null; }
    function render() { buildEditor(); fillForm(); draw(); setStatus(); labelButtons(); if (histOpen) renderHistory(); series(); }
    /* "Change number series" under the number box: the prefix of this document (each kind for quotation and note) */
    function series() { NS.seriesLink($('#d-no', root), { type: type, kind: function () { return T.prefixes ? doc.kind : ''; }, def: function () { return T.prefixes ? T.prefixes[doc.kind] : T.prefix; },
      name: function () { return T.prefixes ? t('k.' + doc.kind) : t('Doc.' + type); }, apply: function (c) { CFG = c || {}; if (!editingId) suggestNumber(true); } }); }
    render();
    document.addEventListener('ns-lang', render);
    var typed = false;
    ed.addEventListener('input', function () { typed = true; });
    /* the form shows at once (it used to wait for the data home, up to 6 s on a first visit, while the preview already showed);
           saved defaults arrive later and never overwrite what the visitor has started typing */
    if (!/[?&](open|from)=/.test(location.search)) root.classList.add('live');
    NSStore.ready().then(function () {
      return NSStore.meta('settings').then(function (c) { CFG = c || {}; }, function () {});
    }).then(function () {
      var qs = new URLSearchParams(location.search), from = qs.get('from'), open = qs.get('open');
      if (NS.leaving) return;   /* this page is moving to the visitor's language page, which reads ?from= itself */
      /* ?open=<id>: the Nivesh Sahayak App opens a saved document here to edit, print or share */
      if (open) {
        history.replaceState(null, '', location.pathname + location.hash);
        return NSStore.get('doc', open).then(function (rec) { if (rec && (rec.type || 'invoice') === type) { openDoc(rec, false); render(); } else NS.toast(t('conv.none'), 'bad'); }).catch(function () {});
      }
      if (from) {
        history.replaceState(null, '', location.pathname + location.hash);
        return fromQuote(from).then(function (ok) { if (ok) { render(); saveDraft(); return suggestNumber(true); } });
      }
      /* an unfinished draft keeps everything, but still gets the next number when its number box is empty or still automatic */
      if (dr) return suggestNumber(false);
      if (typed) return suggestNumber(false);
      /* a fresh start: the hub's defaults and the default business */
      var seller = doc.seller;
      doc = blank(); doc.seller = seller;
      return (CFG.defBiz ? NSStore.get('biz', CFG.defBiz).catch(function () {}) : Promise.resolve()).then(function (b) {
        if (b && !doc.seller.name) { doc.seller = Object.assign(blank().seller, b); delete doc.seller.id; delete doc.seller.created; delete doc.seller.updated; }
        render();
        return suggestNumber(true);
      });
    }).then(function () {
      NS.checkReminder();
      NSStore.persist().catch(function () {});
      root.classList.add('live');
    });
    $$('[data-tab-btn]', root).forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab-btn')); }); });
    $$('[data-do]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-do');
        if (a === 'save') save().catch(function () {});
        else if (a === 'print') printDoc();
        else if (a === 'share') shareDoc();
        else if (a === 'new') { if (!editingId && totals(doc).rows.length && !confirm(tw('c.new'))) return; startNew(); }
        else if (a === 'history') openHistory();
        else if (a === 'toinv') toInvoice();
      });
    });
    NS.onRestore = function () { if (!editingId) suggestNumber(true); };
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe($('.pv', root));
    window.addEventListener('beforeprint', fit);
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save().catch(function () {}); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printDoc(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
