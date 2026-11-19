/* NSGst: GST rules shared by Masters, the document makers, the App and the return screens (ERP round 1, branch r1-gst, 19 Nov 2026).
   Pure functions (no screen, no storage), tested by scripts/test_gst_r1.js. Loaded after core.js; books.js does not need it
   (the decisions are saved on each line when a voucher is made: line.gst, line.tk, line.itc).

   S-1 Item GST rate with dates and taxability. An item record may carry
       tax: { hist: [{ from: 'YYYY-MM-DD', rate: 18 }], kind: 'taxable' | 'nil' | 'exempt' | 'nongst', itc: 'ok' | 'blocked' | 'ineligible', rcm: bool }
     An old item has only gst: it reads as one history row that applies from the start. item.gst is kept = the rate as on today, so code
     that reads item.gst still gets a sensible rate. itemRate(item, date) = the rate that applies on the voucher date.
     GST 2.0: the 5% / 18% / 40% structure applies to supplies from 22 Sep 2025 (Notification 9/2025-Central Tax (Rate), 17 Sep 2025,
     after the 56th GST Council meeting of 3 Sep 2025); 28% and compensation cess on the remaining tobacco goods ended 1 Feb 2026
     (Notification 19/2025-CT(Rate), as docs.js RATE_SETS). The "Apply GST 2.0 rates" tool only LISTS items still at 12% / 28%; the user
     types the new rate (it depends on the HSN; never guessed here).
     Taxability (GSTR-1 table 8 and GSTR-3B 3.1(c) / (e)): nil rated = 0% in the rate schedule, exempt = exempted by notification
     (Notification 2/2017-CT(Rate) and later), non-GST = outside GST (petrol, diesel, ATF, natural gas, crude, alcohol for drinking).
   S-5 Input tax credit per purchase line: line.itc (or the bill's itc) 'ok' | 'blocked' (section 17(5) CGST Act: motor vehicles, food and
     catering, club membership, works contract for immovable property, goods lost / stolen / gifted, personal use ...) | 'ineligible'
     (place of supply rules, section 16(4) time limit). Books: blocked or ineligible GST is part of the cost (books.js itcBlk).
     GSTR-3B (format from 5 Jul 2022, Notification 14/2022-CT; Circular 170/02/2022-GST, 6 Jul 2022): ITC blocked under s.17(5) is shown
     in 4(A) (2B shows it) and reversed in 4(B)(1); ITC ineligible under s.16(4) or place of supply is not in 4(A) and is shown in 4(D)(2).
     Section 16(4) (as amended by Finance Act 2022 from 1 Oct 2022): ITC of an invoice can be taken up to 30 November after the end of the
     financial year of the invoice, or the annual return, whichever is earlier: deadline164().
   S-6 ITC period from the saved GSTR-2B match: gstr2b.js saves meta 'gstr2b' '<business key>|<YYYY-MM>' = { at, ok: [bill ids with ITC
     available], noitc: [...], impg: { igst, cess } }. claimPeriod() = the first saved 2B month that shows the bill (or the period typed on
     the bill, d.itcPeriod). Rule 36(4) / s.16(2)(aa): ITC only for invoices shown in GSTR-2B.
   S-7 Reversals. Rule 37 (substituted by Notification 19/2022-CT from 1 Oct 2022, amended by 26/2022-CT): when the supplier is not paid
     within 180 days from the invoice date, the ITC on the part not paid is reversed (4(B)(2), temporary) in the return of the period in
     which the 180 days end; when the supplier is paid later the ITC is taken again (in 4(A)(5) and shown in 4(D)(1)). Interest u/s 50 may
     apply: told, not worked. rule37() is worked from the bills and their payments, so nothing extra is stored.
     Rule 42: common credit on inputs and input services used for both taxable and exempt supplies: D1 = C2 x E / F (E = exempt turnover
     incl. nil rated and non-GST, F = total turnover), reversed in 4(B)(1) each period; a year-end true-up is due under rule 42(2) by the
     September return of the next year (told, not worked). rule42(). */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (+n || 0)); return d.toISOString().slice(0, 10); }

  /* ---------- S-1: rate history and taxability ---------- */
  var TK = ['taxable', 'nil', 'exempt', 'nongst'];
  var ITC = ['ok', 'blocked', 'ineligible'];
  var GST2 = { from: '2025-09-22', old: [12, 28], note: 'Notification 9/2025-CT(Rate): 5/18/40 from 22 Sep 2025' };
  function hist(item) {
    var t = item && item.tax, h = t && Array.isArray(t.hist) ? t.hist.filter(function (x) { return x && x.rate !== '' && x.rate != null && isFinite(+x.rate); }) : [];
    h = h.map(function (x) { return { from: isoOk(x.from) ? x.from : '', rate: +x.rate }; });
    if (!h.length && item && item.gst !== '' && item.gst != null && isFinite(+item.gst)) h = [{ from: '', rate: +item.gst }];
    return h.sort(function (a, b) { return a.from.localeCompare(b.from); });
  }
  function kindOf(item) { var k = item && item.tax && item.tax.kind; return TK.indexOf(k) >= 0 ? k : 'taxable'; }
  function itcOf(item) { var k = item && item.tax && item.tax.itc; return ITC.indexOf(k) >= 0 ? k : 'ok'; }
  /* the rate on a date: the last history row from that date or before; a date before every row uses the earliest row */
  function itemRate(item, date) {
    var h = hist(item), d = String(date || ''), row = null;
    h.forEach(function (x) { if (!x.from || x.from <= d) row = x; });
    if (!row && h.length) row = h[0];
    var tk = kindOf(item), rate = row ? row.rate : null;
    if (tk !== 'taxable') rate = 0;
    return { rate: rate, tk: tk, itc: itcOf(item), rcm: !!(item && item.tax && item.tax.rcm), from: row ? row.from : '' };
  }
  /* a copy of the item with a rate from a date (a row on the same date is replaced); item.gst = the rate as on 'today' */
  function addRate(item, from, rate, today) {
    var x = JSON.parse(JSON.stringify(item || {})), h = hist(x).filter(function (r) { return r.from !== (from || ''); });
    h.push({ from: isoOk(from) ? from : '', rate: +rate });
    x.tax = Object.assign({}, x.tax || {}, { hist: h.sort(function (a, b) { return a.from.localeCompare(b.from); }) });
    var now = itemRate(x, today || '9999-12-31');
    if (now.rate != null) x.gst = now.rate;
    return x;
  }
  /* items that still carry a rate GST 2.0 removed (12% / 28%) on 'date' (default 22 Sep 2025) and have no later change typed */
  function gst2List(items, date) {
    var on = date || GST2.from;
    return (items || []).filter(function (it) {
      if (!it || it.inactive || kindOf(it) !== 'taxable') return false;
      var r = itemRate(it, on).rate;
      return GST2.old.indexOf(+r) >= 0 && !hist(it).some(function (x) { return x.from && x.from >= GST2.from; });
    }).map(function (it) { return { item: it, rate: itemRate(it, on).rate, hsn: it.hsn || '' }; });
  }
  /* a voucher's date changed: lines whose item has dated rates take the rate of the new date (an item with one undated rate is left
     alone, so a rate typed on the line stays). lines = doc.items, items = the item masters. Returns how many lines changed. */
  function relines(lines, items, date) {
    var by = {}, n = 0; (items || []).forEach(function (m) { if (m && m.desc) by[String(m.desc).trim().toLowerCase()] = m; });
    (lines || []).forEach(function (it) {
      var m = it && by[String(it.desc || '').trim().toLowerCase()]; if (!m || !hist(m).some(function (h) { return h.from; })) return;
      var r = itemRate(m, date); if (r.rate == null || +it.gst === r.rate && (it.tk || 'taxable') === r.tk) return;
      it.gst = r.rate; if (r.tk !== 'taxable') it.tk = r.tk; else delete it.tk; n++;
    });
    return n;
  }
  /* apply an item master to a line: rate of the date, taxability, and (purchase) input credit eligibility */
  function fillLine(it, m, date, purchase) {
    var r = itemRate(m, date);
    if (r.rate != null) it.gst = r.rate;
    if (r.tk !== 'taxable') it.tk = r.tk; else delete it.tk;
    if (purchase && r.itc !== 'ok') it.itc = r.itc; else if (purchase) delete it.itc;
    return r;
  }
  /* 0% lines of a document by taxability: { nil, exempt, nongst } taxable value; dflt = taxability of a 0% line with no tk */
  function zeroSplit(d, dflt) {
    var o = { nil: 0, exempt: 0, nongst: 0 };
    (d && d.items || []).forEach(function (it) {
      var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), rate = num(it.rate); if (!it.desc && !rate) return;
      var v = r2(q * rate - q * rate * num(it.disc) / 100), tk = TK.indexOf(it.tk) > 0 ? it.tk : num(it.gst) ? '' : dflt || 'nil';
      if (tk && o[tk] != null) o[tk] = r2(o[tk] + v);
    });
    return o;
  }

  /* ---------- S-5: input tax credit per line ---------- */
  function lineItc(it, d) { var v = it && it.itc || d && typeof d.itc === 'string' && d.itc || 'ok'; return ITC.indexOf(v) >= 0 ? v : 'ok'; }
  /* last day to take ITC of an invoice dated 'date' under section 16(4): 30 November after the end of its financial year */
  function deadline164(date) { if (!isoOk(date)) return ''; var y = +date.slice(0, 4), m = +date.slice(5, 7); return (m >= 4 ? y + 1 : y) + '-11-30'; }

  /* ---------- S-6: the period in which a bill's ITC is claimed ---------- */
  /* matches = meta 'gstr2b' (all keys); bk = business key. Returns 'YYYY-MM' or '' (not yet in any saved 2B) */
  function claimPeriod(d, matches, bk) {
    if (d && /^\d{4}-\d{2}$/.test(d.itcPeriod || '')) return d.itcPeriod;
    var best = '';
    Object.keys(matches || {}).forEach(function (k) {
      var i = k.lastIndexOf('|'); if (i < 0 || k.slice(0, i) !== bk) return;
      var m = k.slice(i + 1), x = matches[k];
      if (x && Array.isArray(x.ok) && x.ok.indexOf(d.id) >= 0 && (!best || m < best)) best = m;
    });
    return best;
  }
  function has2b(matches, bk, months) { return (months || []).every(function (m) { return !!(matches && matches[bk + '|' + m]); }); }
  function monthsOf(from, to) { var out = [], m = from.slice(0, 7); while (m <= to.slice(0, 7) && out.length < 24) { out.push(m); var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } m = y + '-' + (mo < 10 ? '0' : '') + mo; } return out; }

  /* ---------- S-7: rule 37 (180 days) and rule 42 (common credit) ---------- */
  /* every = NSBooks.bills(docs, biz).every (purchase side bills with what paid each, by: [{ date, amt, adv }]),
     itc(id) = { igst, cgst, sgst } eligible ITC of that bill (0 = not a GST bill), P = { from, to }.
     Returns { rev: {igst,cgst,sgst}, back: {...}, rows: [{ id, no, party, date, day181, unpaid, total, rev | back }] }.
     The 180 days run from the invoice date; payment on day 180 is in time; the reversal falls in the period that holds day 181. */
  function paidBy(b, upto) { return r2((b.by || []).reduce(function (a, x) { return a + ((x.date || '') <= upto ? num(x.amt) : 0); }, 0)); }
  function rule37(every, itc, P) {
    var out = { rev: { igst: 0, cgst: 0, sgst: 0 }, back: { igst: 0, cgst: 0, sgst: 0 }, rows: [] };
    (every || []).forEach(function (b) {
      if (b.side !== 'pay' || !isoOk(b.date) || !(b.total > 0)) return;
      var tx = itc(b.id); if (!tx || !(num(tx.igst) + num(tx.cgst) + num(tx.sgst) > 0)) return;
      var d181 = addDays(b.date, 181), d180 = addDays(b.date, 180);
      if (d181 > P.to) return;
      var unpaid = r2(b.total - paidBy(b, d180)); if (!(unpaid > 0.004)) return;
      var share = Math.min(1, unpaid / b.total), h = ['igst', 'cgst', 'sgst'];
      if (d181 >= P.from) {   /* the 180 days end in this period: reverse the unpaid part */
        var rv = {}; h.forEach(function (k) { rv[k] = r2(num(tx[k]) * share); out.rev[k] = r2(out.rev[k] + rv[k]); });
        out.rows.push({ id: b.id, no: b.no, party: b.party, date: b.date, day181: d181, unpaid: unpaid, total: b.total, rev: rv });
      }
      /* paid in this period after the 180 days: take that part back */
      var paidNow = r2((b.by || []).reduce(function (a, x) { var dt = x.date || ''; return a + (dt >= d181 && dt >= P.from && dt <= P.to ? num(x.amt) : 0); }, 0));
      paidNow = Math.min(paidNow, unpaid);
      if (paidNow > 0.004) {
        var bk = {}; h.forEach(function (k) { bk[k] = r2(num(tx[k]) * paidNow / b.total); out.back[k] = r2(out.back[k] + bk[k]); });
        out.rows.push({ id: b.id, no: b.no, party: b.party, date: b.date, day181: d181, unpaid: unpaid, total: b.total, paid: paidNow, back: bk });
      }
    });
    return out;
  }
  /* rule 42 D1: common credit C2 (per head) x exempt turnover E / total turnover F of the period; nothing when E or F is 0 */
  function rule42(C2, E, F) {
    var o = { igst: 0, cgst: 0, sgst: 0, share: 0 }; E = num(E); F = num(F);
    if (!(E > 0) || !(F > 0)) return o;
    o.share = Math.min(1, E / F);
    ['igst', 'cgst', 'sgst'].forEach(function (k) { o[k] = r2(Math.max(0, num(C2 && C2[k])) * o.share); });
    return o;
  }

  /* ---------- S-2: party registration type ---------- */
  var REG = ['regular', 'comp', 'unreg', 'sez', 'uin', 'overseas', 'eco'];
  /* registration type from a party record: its own reg, else from the taxpayer type read from the portal, else by GSTIN */
  function partyReg(p) {
    if (!p) return 'unreg';
    if (REG.indexOf(p.reg) >= 0) return p.reg;
    var ty = String(p.gst && p.gst.type || '').toLowerCase(), g = String(p.gstin || '').toUpperCase();
    if (/composition/.test(ty)) return 'comp';
    if (/sez/.test(ty)) return 'sez';
    if (/un body|embassy|uin|united nations/.test(ty)) return 'uin';
    if (/non.?resident|oidar/.test(ty)) return 'overseas';
    return /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(g) ? 'regular' : 'unreg';
  }
  /* deductee type from a PAN's 4th letter (income-tax PAN structure): P individual, H HUF, C company, F firm / LLP, others 'other' */
  function deducteeOf(pan) { var c = String(pan || '').toUpperCase().charAt(3); return c === 'P' ? 'ind' : c === 'H' ? 'huf' : c === 'C' ? 'co' : c === 'F' ? 'firm' : /^[ABTGLJ]$/.test(c) ? 'other' : ''; }

  var API = { num: num, r2: r2, TK: TK, ITC: ITC, REG: REG, GST2: GST2, hist: hist, kindOf: kindOf, itcOf: itcOf, itemRate: itemRate, addRate: addRate, gst2List: gst2List, relines: relines, fillLine: fillLine, zeroSplit: zeroSplit,
    lineItc: lineItc, deadline164: deadline164, claimPeriod: claimPeriod, has2b: has2b, monthsOf: monthsOf, rule37: rule37, rule42: rule42, paidBy: paidBy, partyReg: partyReg, deducteeOf: deducteeOf, addDays: addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else {
    G.NSGst = API;
    if (G.NS) { G.NS.itemRate = itemRate; G.NS.partyReg = partyReg; }
  }
})(this);
