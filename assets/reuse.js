/* NSReuse: less retyping (pure functions, node-testable; scripts/test_reuse.js).
     orderAgain      a new purchase bill draft with the same supplier and lines as the supplier's last bill (rates, HSN, GST as then, today's date)
     lastBill        the newest sale (invoice, cash memo) or purchase bill (pbill) of a party
     lastRates       the rate each item had on that party's newest bills (to fill a party's own price list)
     rateHistory     the last 5 rates of one item to (or from) one party, lastPurchase the newest purchase rate (ERP Round 2, B-5)
     partyRate       a party's own rate for an item (party.prices = [{ item, rate }]), null when there is none
     parsePrices / pricesText   the price list as one line per item in a text box ("Cement OPC 53 = 380")
     dueDates        standing bills: the dates up to today for which no copy was made yet (weekly, fortnightly, monthly, quarterly,
                     half-yearly, yearly; optional stop date and number of bills)
   Nothing here saves anything; the App and the document makers do that, as for every other record. */
(function (G) {
  'use strict';
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  var SALES = { invoice: 1, cashmemo: 1, pharma: 1, resto: 1 };

  function partyOf(d) { return d && (d.type === 'pbill' ? (d.buyer && d.buyer.name) : (d.buyer && d.buyer.name)) || ''; }
  function sellerOk(d, biz) { return !biz || key(d.seller && d.seller.name) === key(biz); }
  /* side 'sale' | 'buy' */
  function lastBill(docs, biz, party, side) {
    var k = key(party), best = null;
    (docs || []).forEach(function (d) {
      var ty = d.type || 'invoice';
      if (!sellerOk(d, biz) || key(partyOf(d)) !== k || !d.items || !d.items.length) return;
      if (side === 'buy' ? !(ty === 'pbill' && d.kind !== 'return') : !SALES[ty]) return;
      if (!best || String(d.date) > String(best.date) || (d.date === best.date && String(d.created || '') > String(best.created || ''))) best = d;
    });
    return best;
  }
  function line(l) { return { desc: l.desc || '', hsn: l.hsn || '', qty: num(l.qty) || 1, unit: l.unit || '', rate: l.rate === '' || l.rate == null ? '' : num(l.rate), gst: l.gst === '' || l.gst == null ? 18 : num(l.gst), disc: num(l.disc) || 0 }; }
  /* a purchase bill draft: { buyer, items, round } in the shape app.js openForm('pbill', { draft }) expects */
  function orderAgain(doc) {
    if (!doc || !doc.items) return null;
    return { buyer: { name: partyOf(doc), gstin: (doc.buyer && doc.buyer.gstin) || '', state: (doc.buyer && doc.buyer.state) || '' },
      items: doc.items.filter(function (l) { return String(l.desc || '').trim(); }).map(function (l) { var x = line(l); return { desc: x.desc, hsn: x.hsn, qty: x.qty, rate: x.rate, gst: x.gst }; }), round: doc.round !== false, noGst: !!doc.noGst };
  }
  /* rate after the line discount, per unit, as the newest document of that party shows it */
  function lastRates(docs, biz, party, side) {
    var k = key(party), got = {};
    (docs || []).forEach(function (d) {
      var ty = d.type || 'invoice';
      if (!sellerOk(d, biz) || key(partyOf(d)) !== k || !d.items) return;
      if (side === 'buy' ? !(ty === 'pbill' && d.kind !== 'return') : !SALES[ty]) return;
      d.items.forEach(function (l) {
        var n = key(l.desc), r = num(l.rate); if (!n || !r) return;
        var net = r2(r - r * (num(l.disc) || 0) / 100);
        if (!got[n] || String(d.date) > got[n].date) got[n] = { item: String(l.desc).trim(), rate: net, date: d.date };
      });
    });
    return Object.keys(got).map(function (n) { return got[n]; }).sort(function (a, b) { return a.item.localeCompare(b.item); });
  }
  /* ERP Round 2 (B-5): the rates of one item on this party's newest bills, newest first, net of the line discount:
     [{ rate, date, no, type }] (at most n, default 5); cancelled bills are left out. Sale side: invoices, cash memos, shop bills,
     export invoices; buy side: purchase bills (not returns) and self invoices */
  function rateHistory(docs, biz, party, item, side, n) {
    var k = key(party), ik = key(item), out = [];
    if (!ik) return out;
    (docs || []).forEach(function (d) {
      var ty = d.type || 'invoice';
      if (d.cancelled || !sellerOk(d, biz) || (k && key(partyOf(d)) !== k) || !d.items) return;
      if (side === 'buy' ? !(ty === 'pbill' && d.kind !== 'return' || ty === 'self') : !(SALES[ty] || ty === 'expinv')) return;
      d.items.forEach(function (l) { if (key(l.desc) !== ik || !num(l.rate)) return; out.push({ rate: r2(num(l.rate) - num(l.rate) * (num(l.disc) || 0) / 100), date: d.date || '', no: d.no || '', type: ty, party: partyOf(d) }); });
    });
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return out.slice(0, n || 5);
  }
  /* the newest purchase rate of an item from any supplier: { rate, date, no, party } or null */
  function lastPurchase(docs, biz, item) { return rateHistory(docs, biz, '', item, 'buy', 1)[0] || null; }
  function partyRate(party, desc) {
    var k = key(desc), list = party && party.prices;
    if (!k || !list || !list.length) return null;
    for (var i = 0; i < list.length; i++) if (key(list[i].item) === k && num(list[i].rate) > 0) return num(list[i].rate);
    return null;
  }
  /* "name = rate" (also "name: rate", "name | rate", tab, or the last number on the line); lines without a rate are skipped; later lines win */
  function parsePrices(text) {
    var out = [], at = {};
    String(text || '').split(/\r?\n/).forEach(function (l) {
      l = l.trim(); if (!l) return;
      var m = /^(.*?)\s*(?:=|:|\||\t|-{1,2}>?)\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*$/i.exec(l) || /^(.*\D)\s+([\d,]+(?:\.\d+)?)\s*$/.exec(l);
      if (!m || !m[1].trim() || !(num(m[2]) > 0)) return;
      var it = { item: m[1].trim(), rate: r2(num(m[2])) }, k = key(it.item);
      if (at[k] != null) out[at[k]] = it; else { at[k] = out.length; out.push(it); }
    });
    return out;
  }
  function pricesText(list) { return (list || []).map(function (x) { return x.item + ' = ' + x.rate; }).join('\n'); }

  /* ---------- standing bills ---------- */
  var FREQ = { week: { days: 7 }, fortnight: { days: 14 }, month: { months: 1 }, quarter: { months: 3 }, half: { months: 6 }, year: { months: 12 } };
  function addMonths(iso, n) {
    var p = iso.split('-'), y = +p[0], m = +p[1] - 1 + n, day = +p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
  }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  /* the i-th copy's date (i >= 1) and its key: the month ("2026-12") for monthly and longer, the date for weekly and fortnightly */
  function nth(from, every, i) {
    var f = FREQ[every]; if (!f) return null;
    var dt = f.days ? addDays(from, f.days * i) : addMonths(from, f.months * i);
    return { date: dt, period: f.days ? dt : dt.slice(0, 7) };
  }
  /* tpl.rec = { every, until, max, stop }; made = { period: true } for the copies that exist; -> [{ date, period }] up to today, at most the last 3,
     never more copies in all than tpl.rec.max (copies already made count) */
  function dueDates(tpl, made, today) {
    var r = tpl && tpl.rec; if (!r || !FREQ[r.every] || r.stop || !tpl.date) return [];
    var list = [], have = Object.keys(made || {}).length, max = num(r.max);
    for (var i = 1; i < 400; i++) {
      var n = nth(tpl.date, r.every, i);
      if (n.date > today || (r.until && n.date > r.until)) break;
      if (max > 0 && i > max) break;
      if (!made || !made[n.period]) list.push(n);
    }
    if (max > 0) list = list.slice(0, Math.max(0, max - have));
    return list.slice(-3);
  }

  var API = { key: key, lastBill: lastBill, orderAgain: orderAgain, lastRates: lastRates, rateHistory: rateHistory, lastPurchase: lastPurchase, partyRate: partyRate, parsePrices: parsePrices, pricesText: pricesText, dueDates: dueDates, nth: nth, FREQ: FREQ, addMonths: addMonths, addDays: addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSReuse = API;
})(this);
