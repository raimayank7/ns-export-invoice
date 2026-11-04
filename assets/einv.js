/* NS e-invoice and e-way bill files (no server, no API): the invoice becomes the government JSON format,
   the user uploads it on the portal, then loads the portal's reply so the bill prints with IRN, Ack and signed QR.
   e-invoice: FORM GST INV-01 v1.1 (notified 60/2020-CT; IRP bulk upload takes an array of invoices). v1.2 from 1 Jan 2027
   (05/2026-CT) adds SupTyp RCMDOM/RCMIMP for buyers' self-invoices, not needed for sales invoices.
   e-way bill: the portal's bulk generation JSON {version, billLists}. Its key names differ from the e-way bill API
   (transType, actualFromStateCode, actualToStateCode, OthValue, TotNonAdvolVal), as the portal's bulk tool and the
   India Compliance app use them. Rules checked 4 Nov 2026 (NiveshSahayak/Tax research). Check against the portals when they change. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;

  var EWB_VERSION = '1.0.0621';   /* copy from the portal's Help > Bulk Generation Tools sample when it changes */
  /* e-way bill limit for movement inside the state, where a state has raised it above Rs 50,000 (advice only, never blocks).
     Reported state notifications (Tax research area 4); inter-state is always Rs 50,000. Rajasthan: Rs 2 lakh within one city. */
  var EWB_LIMIT = { '03': 100000, '07': 100000, '08': 100000, '10': 100000, '20': 100000, '22': 100000, '23': 100000, '27': 100000, '33': 100000 };
  var AATO = ['', 'lt5', '5to10', '10p'];   /* turnover band: e-invoice and the 30-day rule depend on it */
  function savedAato() { try { return localStorage.getItem('ns-aato') || ''; } catch (e) { return ''; } }
  var SUP = ['B2B', 'SEZWP', 'SEZWOP', 'EXPWP', 'EXPWOP', 'DEXP'];
  var RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
  /* our units → GST unit quantity codes (UQC) */
  var UQC = { 'nos': 'NOS', 'pcs': 'PCS', 'kg': 'KGS', 'gm': 'GMS', 'ltr': 'LTR', 'ml': 'MLT', 'mtr': 'MTR', 'sq ft': 'SQF', 'box': 'BOX', 'pack': 'PAC', 'set': 'SET', 'pair': 'PRS', 'dozen': 'DOZ', 'bag': 'BAG', 'ton': 'TON' };
  var CODES = 'BAG BAL BDL BKL BOU BOX BTL BUN CAN CBM CCM CMS CTN DOZ DRM GGK GMS GRS GYD KGS KLR KME LTR MLT MTR MTS NOS OTH PAC PCS PRS QTL ROL SET SQF SQM SQY TBS TGM THD TON TUB UGS UNT YDS'.split(' ');
  /* words printed on the invoice (English, like the rest of the printout) */
  var P = { irn: 'IRN', ack: 'Ack No.', ackdt: 'Ack Date', ewb: 'E-Way Bill No.', ewbdt: 'E-Way Bill Date', till: 'Valid till', qr: 'e-Invoice QR' };

  function ex(d) { var e = d.einv || (d.einv = { sup: 'B2B', dist: '0', mode: '1', veh: '', vtype: 'R', tid: '', tname: '', tdoc: '', tdate: '', withEwb: false }); if (e.aato == null) e.aato = (d.seller && d.seller.aato) || savedAato(); if (d.type === 'exp' && d.kind) e.sup = d.kind.toUpperCase(); return e; }
  function days(from) { return Math.round((Date.parse(NS.today()) - Date.parse(from)) / 864e5); }
  function dmy(iso) { var m = String(iso || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function r3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function clip(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); }
  function lines(addr) {
    var l = String(addr || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean), a = '', b = '';
    l.forEach(function (x) { if (!b && (a + ', ' + x).length <= 100) a = a ? a + ', ' + x : x; else b = b ? b + ', ' + x : x; });
    return [clip(a, 100), clip(b, 100)];
  }
  function unit(u) { var k = String(u || '').trim().toLowerCase(); return UQC[k] || (CODES.indexOf(k.toUpperCase()) >= 0 ? k.toUpperCase() : 'OTH'); }
  function isServ(hsn) { return /^99/.test(digits(hsn)); }
  function phone(p) { var x = digits(p); if (x.length === 12 && x.slice(0, 2) === '91') x = x.slice(2); return x.length >= 6 && x.length <= 12 ? x : null; }
  function email(e) { e = String(e || '').trim(); return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(e) && e.length >= 6 && e.length <= 100 ? e : null; }
  function put(o, k, v) { if (v !== '' && v != null) o[k] = v; return o; }
  /* the e-way bill portal codes a buyer outside India as 99 ("Other Countries"); our state list uses 96 like the e-invoice */
  function ewbState(c) { return c === '96' ? 99 : +c; }
  function fileName(prefix, no) { return prefix + '-' + (String(no || 'invoice').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'invoice') + '.json'; }

  /* item lines with the portal's arithmetic: CGST = SGST per line, totals summed from lines */
  function itemRows(d, tt, export_) {
    var igst = export_ || !tt.intra;
    return tt.rows.map(function (r, i) {
      var q = num(r.it.qty), rate = num(r.it.rate), tot = r2(q * rate), disc = r2(tot - r.taxable);
      var c = igst ? 0 : r2(r.tax / 2), ig = igst ? r.tax : 0;
      return { i: i, it: r.it, qty: r3(q), price: r3(rate), tot: tot, disc: disc, ass: r.taxable, g: r.g, cgst: c, sgst: c, igst: ig, val: r2(r.taxable + 2 * c + ig) };
    });
  }

  /* ---------- checks (problems block the download, notes are only shown) ---------- */
  function check(d, tt, what) {
    var e = ex(d), bad = [], note = [], exp = /^EXP/.test(e.sup), s = d.seller, b = d.buyer;
    function need(ok, id, msg) { if (!ok) bad.push([id, msg]); }
    function place(who, pre) {
      need(lines(who.addr)[0].length >= 1, pre + '-addr', t('ev.addr'));
      need(clip(who.city, 50).length >= 3, pre + '-city', t('ev.city'));
      need(/^[1-9]\d{5}$/.test(digits(who.pin)), pre + '-pin', t('ev.pin'));
      need(!!who.state, pre + '-state', t('ev.state'));
    }
    if (what === 'einv' && d.kind !== 'tax' && d.type !== 'exp') bad.push(['d-kind', t('ev.tax')]);
    need(NS.gstinCheck(s.gstin).ok && s.gstin.length === 15, 's-gstin', t(what === 'ewb' ? 'ev.ewbseller' : 'ev.sg'));
    need(!!s.name.trim(), 's-name', t('v.bname'));
    place(s, 's');
    if (what === 'einv' && !exp) need(NS.gstinCheck(b.gstin).ok && b.gstin.length === 15, 'b-gstin', t('ev.bg'));
    if (what === 'einv' && s.gstin && s.gstin === b.gstin) bad.push(['b-gstin', t('ev.same')]);
    need(!!b.name.trim(), 'b-name', t('ev.bname'));
    if (!(what === 'einv' && exp)) place(b, 'b');
    else { need(lines(b.addr)[0].length >= 1, 'b-addr', t('ev.addr')); need(clip(b.city, 50).length >= 3, 'b-city', t('ev.city')); }
    if (d.ship) { need(clip(d.ship.city, 50).length >= 3 && /^[1-9]\d{5}$/.test(digits(d.ship.pin)), 'sh-pin', t('ev.ship')); }
    need(tt.rows.length > 0, 'it-desc-0', t('v.item'));
    var no = String(d.no || '').toUpperCase();
    need(/^[A-Z1-9][A-Z0-9\/-]{0,15}$/.test(no), 'd-no', t('ev.no'));
    if (d.date > NS.today()) bad.push(['d-date', t('ev.future')]);
    tt.rows.forEach(function (r, i) {
      var h = digits(r.it.hsn);
      if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(h)) bad.push(['it-hsn-' + i, t('ev.hsn', { n: i + 1 })]);
      else if (what === 'einv' && h.length === 4) bad.push(['it-hsn-' + i, t('ev.hsn6', { n: i + 1 })]);
      if (d.kind === 'tax' && RATES.indexOf(r.g) < 0) bad.push(['it-gst-' + i, t('ev.rate', { n: i + 1, r: r.g })]);
    });
    if (what === 'einv') {
      if (/WP$/.test(e.sup) && tt.intra) bad.push(['d-pos', t('ev.igst')]);
      if (/WOP$/.test(e.sup) && tt.rows.some(function (r) { return r.tax; })) bad.push(['it-gst-0', t('ev.wop')]);
      var age = days(d.date);
      if (age >= 30) { if (e.aato === '10p') bad.push(['d-date', t('ev.old30')]); else if (!e.aato) note.push(t('ev.old')); }
      if (e.aato === 'lt5') note.push(t('ev.lt5'));
    }
    if (what === 'ewb' || (what === 'einv' && e.withEwb)) {
      var km = String(e.dist).trim() === '' ? 0 : +e.dist;
      if (!(km >= 0 && km <= 4000 && Math.floor(km) === km)) bad.push(['ei-dist', t('ev.dist')]);
      var v = String(e.veh || '').toUpperCase().replace(/[\s-]/g, '');
      /* state series, old 3-letter, Bharat series (22BH1234AB), temporary (TR...), defence/trade/other special series */
      if (v && !/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^[A-Z]{3}\d{4}$|^\d{2}BH\d{4}[A-Z]{1,2}$|^TR[A-Z0-9]{6,13}$|^(DF|TM|BP|NP)[A-Z0-9]{5,13}$/.test(v)) bad.push(['ei-veh', t('ev.veh')]);
      if (e.tid && String(e.tid).trim().length !== 15) bad.push(['ei-tid', t('ev.tid')]);
      else if (e.tid && !NS.gstinCheck(String(e.tid).trim()).ok) note.push(t('ev.tidchk'));
      /* the portal refuses an e-way bill for a document more than 180 days old (since 1 Jan 2025) */
      if (days(d.date) > 180) bad.push(['d-date', t('ev.old180')]);
      if (what === 'ewb') {
        var dest = d.pos || b.state, inside = !dest || dest === s.state, lim = inside && EWB_LIMIT[s.state] || 50000;
        if (tt.grand <= lim) note.push(lim > 50000 ? t('ev.smallst', { st: NS.stateName(s.state), v: NS.money(lim, false).replace(/\.00$/, '') }) : t('ev.small'));
        /* since 1 Mar 2024 e-invoice businesses make the e-way bill for a B2B invoice from the IRN */
        if (d.kind === 'tax' && NS.gstinCheck(b.gstin).ok && b.gstin && e.aato !== 'lt5') note.push(t('ev.fromirn'));
      }
    }
    return { bad: bad, note: note };
  }

  /* ---------- e-invoice JSON (INV-01 v1.1) ---------- */
  function einvoice(d, tt) {
    var e = ex(d), s = d.seller, b = d.buyer, exp = /^EXP/.test(e.sup), rows = itemRows(d, tt, e.sup !== 'B2B' && e.sup !== 'DEXP');
    var sa = lines(s.addr), ba = lines(b.addr);
    var seller = { Gstin: s.gstin, LglNm: clip(s.name, 100), Addr1: sa[0], Loc: clip(s.city, 50), Pin: +digits(s.pin), Stcd: s.state };
    put(seller, 'Addr2', sa[1]); put(seller, 'Ph', phone(s.phone)); put(seller, 'Em', email(s.email));
    var buyer = { Gstin: exp ? 'URP' : b.gstin, LglNm: clip(b.name, 100), Pos: exp ? '96' : (d.pos || b.state), Addr1: ba[0], Loc: clip(b.city, 50),
      Pin: exp ? 999999 : +digits(b.pin), Stcd: exp ? '96' : b.state };
    put(buyer, 'Addr2', ba[1]); put(buyer, 'Ph', phone(b.phone));
    var out = {
      Version: '1.1',
      TranDtls: { TaxSch: 'GST', SupTyp: e.sup, RegRev: d.rc ? 'Y' : 'N', IgstOnIntra: 'N' },
      DocDtls: { Typ: 'INV', No: String(d.no).toUpperCase(), Dt: dmy(d.date) },
      SellerDtls: seller, BuyerDtls: buyer
    };
    if (d.ship && d.ship.addr) {
      var sh = lines(d.ship.addr);
      out.ShipDtls = put({ LglNm: clip(d.ship.name || b.name, 100), Addr1: sh[0], Loc: clip(d.ship.city, 50), Pin: +digits(d.ship.pin), Stcd: d.ship.state || b.state }, 'Addr2', sh[1]);
    }
    var sum = { ass: 0, c: 0, s: 0, i: 0, val: 0, disc: 0 };
    out.ItemList = rows.map(function (r) {
      var serv = isServ(r.it.hsn), it = { SlNo: String(r.i + 1), PrdDesc: clip(r.it.desc, 300), IsServc: serv ? 'Y' : 'N', HsnCd: digits(r.it.hsn), Qty: r.qty };
      if (!serv) it.Unit = unit(r.it.unit);
      Object.assign(it, { UnitPrice: r.price, TotAmt: r.tot, Discount: r.disc, AssAmt: r.ass, GstRt: r.g, IgstAmt: r.igst, CgstAmt: r.cgst, SgstAmt: r.sgst, CesRt: 0, CesAmt: 0, CesNonAdvlAmt: 0, StateCesRt: 0, StateCesAmt: 0, StateCesNonAdvlAmt: 0, OthChrg: 0, TotItemVal: r.val });
      sum.ass += r.ass; sum.c += r.cgst; sum.s += r.sgst; sum.i += r.igst; sum.val += r.val;
      return it;
    });
    var items = r2(sum.val), grand = tt.grand;
    out.ValDtls = { AssVal: r2(sum.ass), CgstVal: r2(sum.c), SgstVal: r2(sum.s), IgstVal: r2(sum.i), CesVal: 0, StCesVal: 0, Discount: 0, OthChrg: 0, RndOffAmt: r2(grand - items), TotInvVal: grand };
    if (s.bankAcc) out.PayDtls = put(put({ Nm: clip(s.name, 100), AccDet: clip(s.bankAcc, 18) }, 'FinInsBr', clip(s.bankIfsc, 11)), 'Mode', '');
    /* export details (export-invoice site, d.exp from export.js): shipping bill, port, currency, country */
    var x = d.exp;
    if (exp && x) out.ExpDtls = put(put(put(put(put({ RefClm: x.refund === 'Y' ? 'Y' : 'N' }, 'ShipBNo', clip(x.sbNo, 20)), 'ShipBDt', dmy(x.sbDate)), 'Port', clip(x.port, 10).toUpperCase()), 'ForCur', clip(x.cur, 3).toUpperCase()), 'CntCode', clip(x.country, 2).toUpperCase());
    if (e.withEwb) out.EwbDtls = ewbPart(e, true);
    return [out];
  }
  function ewbPart(e, forIrp) {
    var v = String(e.veh || '').toUpperCase().replace(/[\s-]/g, ''), o = {};
    if (forIrp) {
      o.Distance = +e.dist || 0;
      put(o, 'TransId', clip(e.tid, 15).toUpperCase()); put(o, 'TransName', clip(e.tname, 100));
      if (v || e.tdoc) { o.TransMode = String(e.mode || '1'); put(o, 'TransDocNo', clip(e.tdoc, 15)); put(o, 'TransDocDt', dmy(e.tdate)); put(o, 'VehNo', v); if (v) o.VehType = e.vtype || 'R'; }
      return o;
    }
    /* official bulk schema (NIC, Version 1.0.0621): transMode and transDistance are numbers; no Part B (vehicle or transport doc) = Part A only, no validity yet */
    var o2 = { transporterId: clip(e.tid, 15).toUpperCase(), transporterName: clip(e.tname, 100), transDocNo: clip(e.tdoc, 15), transDistance: +e.dist || 0, transDocDate: dmy(e.tdate), vehicleNo: v, vehicleType: e.vtype || 'R' };
    if (v || e.tdoc) o2.transMode = +(e.mode || 1);
    return o2;
  }

  /* ---------- e-way bill JSON (bulk generation) ---------- */
  function ewaybill(d, tt) {
    var e = ex(d), s = d.seller, b = d.buyer, rows = itemRows(d, tt, false), sa = lines(s.addr), ba = lines(b.addr), to = d.ship && d.ship.addr ? d.ship : null;
    var ta = to ? lines(to.addr) : ba, main = rows.slice().sort(function (x, y) { return y.ass - x.ass; })[0];
    var bill = {
      userGstin: s.gstin, supplyType: 'O', subSupplyType: +e.sub || (/^EXP/.test(e.sup) ? 3 : 1), subSupplyDesc: +e.sub === 8 ? clip(e.subDesc || 'Others', 20) : '', docType: e.dtype || (d.kind === 'tax' || d.type === 'exp' ? 'INV' : 'BIL'),
      docNo: String(d.no).toUpperCase(), docDate: dmy(d.date),
      fromGstin: s.gstin, fromTrdName: clip(s.name, 100), fromAddr1: sa[0], fromAddr2: sa[1], fromPlace: clip(s.city, 50), fromPincode: +digits(s.pin),
      actualFromStateCode: +s.state, fromStateCode: +s.state,
      toGstin: b.gstin && NS.gstinCheck(b.gstin).ok ? b.gstin : 'URP', toTrdName: clip(b.name, 100), toAddr1: ta[0], toAddr2: ta[1],
      toPlace: clip((to || b).city, 50), toPincode: +digits((to || b).pin), actualToStateCode: ewbState((to && to.state) || b.state), toStateCode: ewbState(d.pos || b.state),
      transType: to ? 2 : 1,
      OthValue: tt.roundOff, totalValue: r2(tt.taxable), cgstValue: r2(rows.reduce(function (a, r) { return a + r.cgst; }, 0)), sgstValue: r2(rows.reduce(function (a, r) { return a + r.sgst; }, 0)),
      igstValue: r2(rows.reduce(function (a, r) { return a + r.igst; }, 0)), cessValue: 0, TotNonAdvolVal: 0, totInvValue: tt.grand
    };
    Object.assign(bill, ewbPart(e, false));
    bill.mainHsnCode = main ? digits(main.it.hsn) : '';
    bill.itemList = rows.map(function (r) {
      var half = tt.intra ? r.g / 2 : 0;
      return { itemNo: r.i + 1, productName: clip(r.it.desc, 100), productDesc: clip(r.it.desc, 100), hsnCode: digits(r.it.hsn), quantity: r.qty, qtyUnit: unit(r.it.unit),
        taxableAmount: r.ass, sgstRate: half, cgstRate: half, igstRate: tt.intra ? 0 : r.g, cessRate: 0, cessNonAdvol: 0 };
    });
    return { version: EWB_VERSION, billLists: [bill] };
  }

  /* ---------- the portal's reply: a JSON file (any shape) or typed numbers ---------- */
  function b64json(part) {
    try {
      var s = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4));
      var bytes = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      var j = JSON.parse(new TextDecoder().decode(bytes));
      return typeof j.data === 'string' ? JSON.parse(j.data) : (j.data || j);
    } catch (e) { return null; }
  }
  function qrInfo(jwt) { var p = String(jwt || '').trim().split('.'); return p.length === 3 ? b64json(p[1]) : null; }
  function findAll(o, out) {
    if (Array.isArray(o)) { o.forEach(function (x) { findAll(x, out); }); return out; }
    if (!o || typeof o !== 'object') return out;
    var k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase().replace(/[\s_]/g, '')] = o[x]; });
    var r = { irn: k.irn, ack: k.ackno, ackDt: k.ackdt || k.ackdate, qr: k.signedqrcode, ewb: k.ewbno || k.ewaybillno, ewbDt: k.ewbdt || k.ewaybilldate || k.ewbdate,
      ewbTill: k.ewbvalidtill || k.validupto || k.validtill, no: k.docno || k.invoiceno || (k.docdtls && k.docdtls.No) };
    if (r.irn || r.ewb || r.qr) out.push(r);
    Object.keys(o).forEach(function (x) { if (o[x] && typeof o[x] === 'object') findAll(o[x], out); });
    if (typeof o.Data === 'string' || typeof o.data === 'string') { try { findAll(JSON.parse(o.Data || o.data), out); } catch (e) {} }
    return out;
  }
  /* what the IRP saw: if these change after the IRN, the printed bill no longer matches the registered one */
  function sig(d) { return [String(d.no).toUpperCase(), d.date, d.seller.gstin, d.buyer.gstin, api ? api.totals().grand : 0].join('|'); }

  function applyReply(d, found) {
    var no = String(d.no).toUpperCase();
    var hit = found.filter(function (r) { var q = r.qr && qrInfo(r.qr); return String(r.no || (q && q.DocNo) || '').toUpperCase() === no; })[0] || (found.length === 1 ? found[0] : null);
    if (!hit) return found.length ? t('ei.which') : t('ei.noreply');
    var q = hit.qr ? qrInfo(hit.qr) : null;
    var other = String(hit.no || (q && q.DocNo) || '').toUpperCase();
    if (other && other !== no) return t('ei.nomatch', { no: other });
    var irn = d.irn || {};
    ['irn', 'ack', 'ackDt', 'qr', 'ewb', 'ewbDt', 'ewbTill'].forEach(function (k) { if (hit[k] != null && hit[k] !== '') irn[k] = String(hit[k]).trim(); });
    if (q && !irn.irn) irn.irn = q.Irn;
    if (q && !irn.ackDt && q.IrnDt) irn.ackDt = q.IrnDt;
    irn.sig = sig(d);
    d.irn = irn;
    return '';
  }

  /* ---------- editor ---------- */
  var api, box;
  function opt(v, label, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function editor(_, A) {
    api = A;
    var F = A.field;
    return '<fieldset class="card ei" id="ei-box"><legend>' + esc(t('lg.einv')) + '</legend>' +
      '<p class="hint">' + esc(t('ei.intro')) + ' <a href="' + (NS.einvGuide || '/e-invoice-e-way-bill/#make-the-file') + '">' + esc(t('ei.guide')) + ' ›</a></p>' +
      '<div class="fg">' +
        '<div class="f wide"><label for="ei-sup">' + esc(t('ei.sup')) + '</label><select id="ei-sup">' + SUP.map(function (k) { return opt(k, t('ei.s.' + k)); }).join('') + '</select></div>' +
        '<div class="f wide"><label for="ei-aato">' + esc(t('ei.aato')) + '</label><select id="ei-aato">' + AATO.map(function (k) { return opt(k, t('ei.a.' + (k || 'none'))); }).join('') + '</select><small class="hint">' + esc(t('ei.h.aato')) + '</small></div>' +
      '</div>' +
      '<details class="more" id="ei-trd"><summary>' + esc(t('ei.tr')) + '</summary><div class="fg">' +
        '<div class="f"><label for="ei-sub">' + esc(t('ei.sub')) + '</label><select id="ei-sub">' + [1, 3, 9].map(function (k) { return opt(k, t('ei.sb.' + k)); }).join('') + '</select></div>' +
        F('ei-dist', t('ei.dist'), { mode: 'numeric', max: 4, ltr: 1, hint: t('ei.h.dist') }) +
        '<div class="f"><label for="ei-mode">' + esc(t('ei.mode')) + '</label><select id="ei-mode">' + [1, 2, 3, 4].map(function (k) { return opt(k, t('ei.m.' + k)); }).join('') + '</select></div>' +
        F('ei-veh', t('ei.veh'), { max: 15, ltr: 1, hint: t('ei.h.veh') }) +
        '<div class="f"><label for="ei-vtype">' + esc(t('ei.vtype')) + '</label><select id="ei-vtype">' + opt('R', t('ei.v.R')) + opt('O', t('ei.v.O')) + '</select></div>' +
        F('ei-tid', t('ei.tid'), { max: 15, ltr: 1 }) + F('ei-tname', t('ei.tname'), {}) +
        F('ei-tdoc', t('ei.tdoc'), { max: 15, ltr: 1 }) + F('ei-tdate', t('ei.tdate'), { type: 'date' }) +
        '<div class="f wide"><label class="chk"><input id="ei-with" type="checkbox"> ' + esc(t('ei.addewb')) + '</label></div>' +
      '</div></details>' +
      '<div class="ei-do"><button type="button" class="btn" id="ei-einv">' + esc(t('ei.b.einv')) + '</button><button type="button" class="btn" id="ei-ewb">' + esc(t('ei.b.ewb')) + '</button>' +
        '<label class="btn" for="ei-file">' + esc(t('ei.b.load')) + '</label><input id="ei-file" type="file" accept=".json,application/json" hidden></div>' +
      '<div class="ei-msg" id="ei-msg" aria-live="polite" hidden></div>' +
      '<div class="ei-have" id="ei-have" hidden></div>' +
      '<details class="more" id="ei-man"><summary>' + esc(t('ei.manual')) + '</summary><div class="fg">' +
        F('ei-irn', t('ei.irn'), { wide: true, max: 64, ltr: 1 }) + F('ei-ack', t('ei.ack'), { mode: 'numeric', max: 20, ltr: 1 }) + F('ei-ackdt', t('ei.ackdt'), { ltr: 1, ph: '2026-11-04 12:30:00' }) +
        F('ei-qr', t('ei.qr'), { type: 'textarea', wide: true, hint: t('ei.h.qr') }) +
        F('ei-ewbno', t('ei.ewbno'), { mode: 'numeric', max: 12, ltr: 1 }) + F('ei-ewbdt', t('ei.ewbdt'), { ltr: 1 }) + F('ei-ewbtill', t('ei.ewbtill'), { ltr: 1 }) +
        '<div class="f wide"><button type="button" class="btn sm" id="ei-use">' + esc(t('ei.b.use')) + '</button> <button type="button" class="link" id="ei-rm">' + esc(t('ei.b.rm')) + '</button></div>' +
      '</div></details>' +
    '</fieldset>';
  }
  var MAP = { 'ei-aato': 'aato', 'ei-sup': 'sup', 'ei-sub': 'sub', 'ei-dist': 'dist', 'ei-mode': 'mode', 'ei-veh': 'veh', 'ei-vtype': 'vtype', 'ei-tid': 'tid', 'ei-tname': 'tname', 'ei-tdoc': 'tdoc', 'ei-tdate': 'tdate' };
  var MAN = { 'ei-irn': 'irn', 'ei-ack': 'ack', 'ei-ackdt': 'ackDt', 'ei-qr': 'qr', 'ei-ewbno': 'ewb', 'ei-ewbdt': 'ewbDt', 'ei-ewbtill': 'ewbTill' };
  function wire(ed) {
    box = $('#ei-box', ed);
    if (!box) return;
    function onEdit(e) {
      var el = e.target, d = api.doc(), x = ex(d);
      if (MAP[el.id]) {
        x[MAP[el.id]] = el.value;
        if (el.id === 'ei-veh' && e.type === 'change') el.value = x.veh = el.value.toUpperCase().replace(/[\s-]/g, '');
        if (el.id === 'ei-aato') { try { localStorage.setItem('ns-aato', el.value); } catch (err) {} }
      }
      else if (el.id === 'ei-with') x.withEwb = el.checked;
      else return;
      e.stopPropagation(); api.changed();
    }
    box.addEventListener('input', onEdit, true);
    box.addEventListener('change', onEdit, true);
    $('#ei-einv', box).addEventListener('click', function () { make('einv'); });
    $('#ei-ewb', box).addEventListener('click', function () { make('ewb'); });
    $('#ei-file', box).addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      f.text().then(function (txt) {
        var j; try { j = JSON.parse(txt.replace(/^﻿/, '')); } catch (err) { msg([[null, t('ei.badfile')]], []); return; }
        var r = applyReply(api.doc(), findAll(j, []));
        if (r) { msg([[null, r]], []); return; }
        done();
      });
    });
    $('#ei-use', box).addEventListener('click', function () {
      var d = api.doc(), r = {};
      Object.keys(MAN).forEach(function (id) { r[MAN[id]] = $('#' + id, box).value.trim(); });
      if (r.irn && !/^[0-9a-f]{64}$/i.test(r.irn)) { msg([['ei-irn', t('ei.v.irn')]], []); return; }
      if (r.ewb && !/^\d{12}$/.test(r.ewb)) { msg([['ei-ewbno', t('ei.v.ewb')]], []); return; }
      if (r.qr && !qrInfo(r.qr)) { msg([['ei-qr', t('ei.v.qr')]], []); return; }
      if (!r.irn && !r.ewb && !r.qr) { msg([['ei-irn', t('ei.noreply')]], []); return; }
      var e = applyReply(d, [r]);
      if (e) { msg([[null, e]], []); return; }
      done();
    });
    $('#ei-rm', box).addEventListener('click', function () {
      if (!confirm(t('ei.c.rm'))) return;
      api.doc().irn = null; fill(); api.changed();
      NS.toast(t('ei.rmnote'));
    });
  }
  function done() {
    var d = api.doc();
    fill(); api.changed();
    msg([], [t(d.irn && d.irn.irn ? 'ei.loaded' : 'ei.loadedewb')]);
    NS.toast(t('ei.saveit'));
  }
  function fill() {
    if (!box) return;
    var d = api.doc(), x = ex(d), irn = d.irn || {};
    Object.keys(MAP).forEach(function (id) { var el = $('#' + id, box); if (el) { el.value = x[MAP[id]] == null ? '' : x[MAP[id]]; if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0; } });
    $('#ei-with', box).checked = !!x.withEwb;
    Object.keys(MAN).forEach(function (id) { $('#' + id, box).value = irn[MAN[id]] || ''; });
    status();
  }
  function status() {
    if (!box || !document.contains(box)) return;
    var d = api.doc(), irn = d.irn || {};
    $('#ei-einv', box).hidden = d.kind !== 'tax';
    var have = $('#ei-have', box), h = [];
    if (irn.irn) h.push(esc(t('ei.have', { irn: irn.irn.slice(0, 12) + '…', ack: irn.ack || '—' })));
    if (irn.ewb) h.push(esc(t('ei.haveewb', { no: irn.ewb })));
    if (irn.irn && !irn.qr) h.push('<span class="warn">' + esc(t('ei.noqr')) + '</span>');
    if ((irn.irn || irn.ewb) && irn.sig && irn.sig !== sig(d)) h.push('<span class="warn">' + esc(t('ei.changed')) + '</span>');
    have.innerHTML = h.map(function (x) { return '<p>' + x + '</p>'; }).join('');
    have.hidden = !h.length;
    box.classList.toggle('has', !!(irn.irn || irn.ewb));
  }
  function msg(bad, note) {
    var m = $('#ei-msg', box);
    if (!bad.length && !note.length) { m.hidden = true; return; }
    m.innerHTML = (bad.length ? '<p><b>' + esc(t('ev.fix')) + '</b></p><ul>' + bad.map(function (p) { return '<li>' + (p[0] ? '<a href="#' + p[0] + '" data-go="' + p[0] + '">' + esc(p[1]) + '</a>' : esc(p[1])) + '</li>'; }).join('') + '</ul>' : '') +
      (note.length ? '<ul class="notes">' + note.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '');
    m.className = 'ei-msg' + (bad.length ? ' bad' : ' ok');
    m.hidden = false;
    $$('[data-go]', m).forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var f = document.getElementById(a.getAttribute('data-go')); if (!f) return;
        var det = f.closest('details'); if (det) det.open = true;
        if (f.closest('#ship-box')) { var c = document.getElementById('b-ship'); if (c && !c.checked) c.click(); }
        f.focus(); f.scrollIntoView({ block: 'center' });
      });
    });
  }
  function make(what) {
    var d = api.doc(), tt = api.totals(), r = check(d, tt, what);
    if (r.bad.length) { msg(r.bad, r.note); var g = $('[data-go]', box); if (g) g.focus(); return; }
    var data = what === 'einv' ? einvoice(d, tt) : ewaybill(d, tt), name = fileName(what === 'einv' ? 'e-invoice' : 'e-way-bill', d.no);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    msg([], [t(what === 'einv' ? 'ei.made' : 'ei.madeewb', { file: name })].concat(r.note));
  }

  /* ---------- on the invoice ---------- */
  function sheet(d) {
    var i = d.irn;
    if (!i || !(i.irn || i.ewb)) return '';
    var row = function (k, v) { return v ? '<tr><th>' + P[k] + '</th><td class="mono">' + esc(v) + '</td></tr>' : ''; };
    return '<div class="irn">' + (i.qr ? '<div class="irn-qr" data-irn-qr title="' + P.qr + '"></div>' : '') +
      '<table>' + row('irn', i.irn) + row('ack', i.ack) + row('ackdt', i.ackDt) + row('ewb', i.ewb) + row('ewbdt', i.ewbDt) + row('till', i.ewbTill) + '</table></div>';
  }
  function drawn(sh) {
    status();
    var q = $('[data-irn-qr]', sh), d = api && api.doc();
    if (!q || !d || !d.irn || !window.qrcode) return;
    try { var qr = qrcode(0, 'L'); qr.addData(d.irn.qr); qr.make(); q.innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); } catch (e) { q.hidden = true; }
  }

  (NS.docExt = NS.docExt || []).push({ editor: editor, wire: wire, fill: fill, sheet: sheet, drawn: drawn });
  NS.einv = { einvoice: einvoice, ewaybill: ewaybill, check: check, findAll: findAll, qrInfo: qrInfo, unit: unit, lines: lines };
})();
