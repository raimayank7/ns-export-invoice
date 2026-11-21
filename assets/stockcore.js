/* NSStock: the stock register underneath stock.niveshsahayak.in (and the closing stock of profit-loss.).
   Like NSBooks, nothing extra is stored for bills: every saved document in the data home is read on the fly.
   Pure functions: the page passes in documents and item masters and gets movements, a summary and item ledgers back.

   Goods come in:   pbill (purchase bill), self (self invoice), note credit with reason 'ret' (sales return),
                    stk open (opening stock), stk adj with a + quantity (found, extra on count)
   Goods go out:    invoice, cashmemo, pbill return (purchase return), stk adj with a − quantity
                    (damage, own use, free sample, gift, lost or stolen, expired, short on count)
   Record of this site (store 'doc', seller = our business):
     { type:'stk', kind:'open'|'adj', date, no, seller, note, lines:[{ desc, unit, qty, rate, reason }] }
     open: qty = quantity in hand on that date, rate = cost per unit. adj: qty signed (+ in, − out), reason code.
   Which lines count: item masters marked as goods, or any name that was bought, opened or adjusted.
   Services (master kind 'service' or SAC code 99…) and names that were only ever sold are left out.
   Value: weighted average cost of opening stock and purchases (rate after discount, without GST) up to the date, or FIFO
   (first in, first out: the stock in hand is valued at the cost of the latest purchases) when My data › Settings says so
   (meta settings.stockValue 'fifo'; pages call NSStock.valuation(settings.stockValue) after loading). Both are allowed by
   AS 2 (Valuation of Inventories); use the same method every year. Under FIFO a purchase return comes off the newest lot.
   Batch 2 (godowns, batches, manufacturing):
     godown   d.gd on a bill (or it.gd on a line) = the godown the goods left or came into; '' = the main godown.
     move     { type:'stk', kind:'move', from, to, lines:[{ desc, unit, qty, batch }] }: stock transfer between godowns
              (the business's total does not change, so the summary of all godowns leaves transfers out).
     make     { type:'stk', kind:'make', gd, out:{ desc, unit, qty, rate, batch, exp }, lines:[{ desc, unit, qty }], extra }:
              production; raw material lines go out, the finished item comes in at out.rate (cost of the raw material
              at average cost plus extra cost, per unit, worked out when it was saved), which joins the average cost.
     batch    it.batch, it.exp (YYYY-MM, usable to the end of that month), it.serial (serial / IMEI numbers, comma separated).
   ERP round 1:
     I-1      which records move goods comes from NSBooks.stockRole(d) (books.js), shared with the books: every goods sale
              (pharmacy, export invoice, closed restaurant bill, job card printed as a bill ...) goes out, not only invoices.
     I-2      challan kind sale / approval = goods out on its date (src 'dn'); an invoice made from it (inv.dnRef [{ id }] or
              inv.fromId) does not move the same quantity again; goods back on a challan: { type:'stk', kind:'rejin', ref:
              challan id, date, gd, lines } (src 'rej'), or the whole challan when its status is 'dret' (returned) on d.retOn;
              kind transfer with d.toGd = a godown transfer; kind job = goods to the job worker's place (JW + consignee), unless
              an App job work entry was made from that challan (jobout.dcid).
     I-3      a line whose unit is not a unit of its item (mfgcore unitOk) is kept as it is but flagged (x.badUnit; summary bad).
     I-5      opening stock, adjustments and counts carry d.gd and it.batch / it.exp / it.serial like bills.
     I-6      { type:'stk', kind:'phys', date, gd, lines:[{ desc, unit, qty (counted), batch }] }: physical stock. The counted
              quantity becomes the balance of that item (that godown, that batch) at the end of that date; the register works
              out the difference itself (src 'phys'), so an entry dated earlier and made later never undoes the count.
     I-8/10   shortfall(), batchPick(), serialCheck() for the save checks of the makers and the App (stockguard.js).
     I-15     reorder(): reorder status and purchase suggestions (item min, rq, max, lead, supplier).
   ERP round 2 (orders, r2-orders):
     I-4      { type:'stk', kind:'grn', date, no, gd, buyer (the supplier), items:[{ desc, unit, qty, rate, batch, exp, serial, lid, src }] }:
              receipt note (goods received note): goods in on its date at its rate (src 'grn'). A purchase bill that names it (line
              it.src, or d.grnRef / d.fromId) does not bring the same quantity in again, and the GRN's goods then cost what the bill
              says (bill rate after discount plus landed cost). { type:'stk', kind:'rejout', ref, items }: goods sent back to the
              supplier (src 'rejo', out); kind 'rejin' (goods back from a customer) may now carry items as well as lines. A credit /
              debit note made from a rejection (d.fromId) does not move the goods a second time.
     I-14     landed cost: freight, cartage, packing, loading, insurance (service lines of a purchase bill with those words, or any
              line ticked it.lc, bill charges d.charges unless c.lc === false) and later additional cost records
              { type:'stk', kind:'lcost', date, no, ref (purchase bill id), amt, basis:'value'|'qty', buyer (the transporter) } are spread
              over the bill's goods lines (by value unless by 'qty'; d.lcBy 'none' = never) and raise their cost. The books do not
              change: freight stays an expense, only the closing stock value rises (AS 2 para 10, periodic method).
     I-7      adjValue(): value of a stock adjustment at the cost of that date and the GST input credit to reverse on it (s.17(5)(h)
              CGST Act: goods lost, stolen, destroyed, written off, given as gifts or free samples; own use s.17(5)(g)); the stock site
              stores it on the record (it.cost, it.value, it.itcRev, d.val) so the books (books.js 'stkadj') never change later. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function r3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var OUTR = { damage: 1, own: 1, sample: 1, gift: 1, lost: 1, expired: 1, short: 1, jwloss: 1 };   /* jwloss: loss and waste at the job worker (ITC-04), not theft */
  var INR = { found: 1, extra: 1 };

  function bizOf(d) { return key(d.seller && d.seller.name); }
  function lineQty(it) { return it.qty === '' || it.qty == null ? 1 : num(it.qty); }
  function lineCost(it) { var r = num(it.rate); return r2(r - r * num(it.disc) / 100); }
  function isService(m, it) { return m && m.kind === 'service' || /^99/.test(String(it && it.hsn || m && m.hsn || '').replace(/\D/g, '')); }

  function serialsOf(it) { return String(it && it.serial || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function mv(k, name, unit, d, q, rate, src, reason, gd, it) {
    return { k: k, name: name, unit: unit, date: d.date || '', qty: r3(q), rate: rate, src: src, reason: reason || '', d: d,
      g: String(gd || '').trim(), batch: String(it && it.batch || '').trim(), exp: String(it && it.exp || '').trim(), sn: serialsOf(it) };
  }
  /* godown filter: gd null/'' = the whole business (transfers left out), else that godown ('main' = the main godown, '') */
  var MAIN = 'main';
  function gdOk(x, gd) { if (gd == null || gd === '') return x.src !== 'move'; return key(x.g || MAIN) === key(gd); }

  /* every stock movement of one business, in date order: { k, name, unit, date, qty (+ in / − out), rate (cost, in only), src, reason, d } */
  /* manufacturing extras (mfgcore.js): job work, by-products and second units become plain records first */
  function mfg() { return G.NSMfg || (typeof require === 'function' ? require('./mfgcore.js') : null); }
  function moves(docs, items, biz) {
    var b = key(biz), M = {}, out = [], X = mfg(); if (X) docs = X.expand(docs, items);
    (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    docs = (docs || []).filter(function (d) { return d && (!b || bizOf(d) === b); });
    challanLinks(docs, M);
    orderLinks(docs, M);   /* ERP round 2: receipt notes, rejections, landed cost */
    (docs || []).forEach(function (d) {
      if (b && bizOf(d) !== b) return;
      if (d.cancelled) return;   /* ERP Round 1, A-3: a cancelled voucher moves no stock */
      var ty = d.type || 'invoice', src = '', sign = 0;
      if (ty === 'stk' && d.kind === 'move') {
        (d.lines || []).forEach(function (it) {
          var nm = String(it.desc || '').trim(), q = num(it.qty); if (!nm || !q) return;
          var k = key(nm), m = M[k];
          [[d.from, -q], [d.to, q]].forEach(function (p) { out.push(mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, p[1], null, 'move', '', p[0], it)); });
        });
        return;
      }
      if (ty === 'stk' && d.kind === 'make') {
        var o = d.out || {}, onm = String(o.desc || '').trim(), oq = num(o.qty);
        (d.lines || []).forEach(function (it) {
          var nm = String(it.desc || '').trim(), q = num(it.qty); if (!nm || !q) return;
          var k = key(nm), m = M[k]; if (isService(m, it)) return;
          out.push(mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, -q, null, 'use', '', d.gd, it));
        });
        if (onm && oq) { var ok = key(onm), om = M[ok]; out.push(mv(ok, om ? om.desc : onm, o.unit || om && om.unit || '', d, oq, num(o.rate), 'make', '', d.gd, o)); }
        return;
      }
      if (ty === 'stk' && d.kind === 'lcost') return;   /* additional cost: only raises the cost of its bill's lots (orderLinks) */
      if (ty === 'stk' && d.kind === 'grn') src = 'grn';
      else if (ty === 'stk' && d.kind === 'rejout') src = 'rejo';
      else if (ty === 'stk' && d.kind === 'rejin') src = 'rej';
      else if (ty === 'stk' && d.kind === 'phys') src = 'phys';
      else if (ty === 'stk') src = d.kind === 'open' ? 'open' : 'adj';
      else {
        var sr = stockRole(d);   /* I-1: one rule with the books */
        if (sr === 'sale') { src = 'sale'; sign = -1; }   /* jewel: stock by weight under it.stk; old gold taken in comes in below */
        else if (sr === 'buy') { src = 'buy'; sign = 1; }
        else if (sr === 'pret') { src = 'pret'; sign = -1; }   /* goods sent back to the supplier */
        else if (sr === 'sret') { src = 'sret'; sign = 1; }
        else if (sr === 'dn') { src = 'dn'; sign = -1; }
        else if (sr === 'dnmove' || sr === 'dnjob') {
          if (sr === 'dnjob' && JOBDC[d.id]) return;   /* the App's job work entry made from this challan moves the goods */
          var to = sr === 'dnmove' ? d.toGd : (X ? X.jwPlace(d.buyer) : 'JW ' + String(d.buyer && d.buyer.name || '').trim());
          (d.items || []).forEach(function (it) {
            var nm = String(it.desc || '').trim(), q = lineQty(it); if (!nm || !q) return;
            var k = key(nm), m = M[k]; if (isService(m, it)) return;
            [[d.gd, -q], [to, q]].forEach(function (p) { var o = mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, p[1], null, 'move', '', p[0], it); o.dc = 1; out.push(o); });
          });
          return;
        }
      }
      if (ty === 'jewel') (d.oldGold || []).forEach(function (x) {   /* old gold / silver taken in exchange: stock in at the value paid for it */
        var nm = String(x.stk || '').trim(), q = num(x.net); if (!nm || !(q > 0)) return;
        out.push(mv(key(nm), nm, 'g', d, q, r2(num(x.value) / q), 'buy', '', d.gd, x));
      });
      if (!src) return;
      var cov = COVER[d.id || ''] || null;   /* I-2: quantity of each line already gone out on a delivery challan */
      (src === 'open' || src === 'adj' || src === 'rej' || src === 'phys' || src === 'grn' || src === 'rejo' ? (d.lines && d.lines.length ? d.lines : d.items || []) : d.items || []).forEach(function (it, li) {
        var nm = String(it.stk || it.desc || '').trim(); if (!nm) return;   /* it.stk: jewellery keeps stock under metal and purity, not the ornament's name */
        var k = key(nm), m = M[k];
        if (isService(m, it)) return;
        var q, rate = null;
        if (src === 'open') { q = num(it.qty); rate = num(it.rate); }
        else if (src === 'adj') { q = num(it.qty); if (OUTR[it.reason] && q > 0) q = -q; if (INR[it.reason] && q < 0) q = -q; }
        else if (src === 'rej') q = Math.abs(num(it.qty));
        else if (src === 'grn') { q = Math.abs(num(it.qty)); rate = GRATE[d.id + '|' + li] != null ? GRATE[d.id + '|' + li] : lineCost(it); }
        else if (src === 'rejo') q = -Math.abs(num(it.qty));
        else if (src === 'phys') { var c0 = mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, 0, null, 'phys', '', d.gd, it); c0.counted = r3(num(it.qty)); c0.hasBatch = !!String(it.batch || '').trim(); out.push(c0); return; }
        else { q = sign * lineQty(it); if (src === 'buy') rate = r2(lineCost(it) + (LAND[d.id + '|' + li] || 0)); if (cov && cov[li]) q = r3(q + cov[li]); if (GCOV[d.id + '|' + li]) q = r3(q - sign * GCOV[d.id + '|' + li]); }
        if (!q) return;
        var o = mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, q, rate, src, it.reason || '', it.gd != null && it.gd !== '' ? it.gd : d.gd, it);
        if (m && X && X.unitOk && !X.unitOk(m, it.unit)) o.badUnit = 1;   /* I-3: kept as typed, flagged */
        out.push(o);
      });
      /* a challan whose status says the goods came back, with no "goods back" entry for it: all of it back in on d.retOn */
      if (src === 'dn' && d.status === 'dret' && !REJ[d.id]) (d.items || []).forEach(function (it) {
        var nm = String(it.desc || '').trim(), q = lineQty(it); if (!nm || !q) return;
        var k = key(nm), m = M[k]; if (isService(m, it)) return;
        var o = mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, q, null, 'rej', '', d.gd, it); o.date = d.retOn || d.date; out.push(o);
      });
    });
    var ORD = { open: 0, buy: 1, sret: 1, rej: 1, grn: 1, make: 1, move: 2, use: 2, adj: 2, pret: 3, rejo: 3, sale: 3, dn: 3, phys: 5 };
    out.sort(function (x, y) { return x.date.localeCompare(y.date) || ORD[x.src] - ORD[y.src] || (x.d.created || 0) - (y.d.created || 0); });
    return physPass(out);
  }
  /* ---------- ERP round 2 (orders): receipt notes, rejections, landed cost (filled at the start of moves) ----------
     GCOV  { 'bill id|line': quantity of that bill line already brought in on a receipt note (or, for a note, moved by a rejection) }
     GRATE { 'grn id|line': cost per unit of the GRN's goods (the bill's landed rate for what is billed, its own rate for the rest) }
     LAND  { 'bill id|line': landed cost added per unit } */
  var GCOV = {}, GRATE = {}, LAND = {}, LTOT = {};
  var LC_WORDS = /freight|cartage|carriage|transport|loading|unloading|packing|forwarding|insurance|octroi|hamali|handling|courier|delivery charge/i;
  function lidAt(it, i) { return it && it.lid ? String(it.lid) : '#' + i; }
  function refIds(d) { return [d.fromId].concat([].concat(d.grnRef || []), (d.dnRef || [])).map(function (r) { return r && (r.id || r); }).filter(Boolean); }
  function orderLinks(docs, M) {
    GCOV = {}; GRATE = {}; LAND = {}; LTOT = {};
    var GR = {}, LC = {}, bills = [], rej = {}, notes = [];
    (docs || []).forEach(function (d) {
      if (!d || d.cancelled) return;
      if (d.type === 'stk' && d.kind === 'grn' && d.id) GR[d.id] = d;
      else if (d.type === 'stk' && d.kind === 'lcost' && d.ref) (LC[d.ref] = LC[d.ref] || []).push(d);
      else if (d.type === 'stk' && (d.kind === 'rejout' || d.kind === 'rejin') && d.id) rej[d.id] = d;
      else if (d.type !== 'stk') { var sr = stockRole(d); if (sr === 'buy') bills.push(d); else if ((sr === 'sret' || sr === 'pret') && d.fromId) notes.push(d); }
    });
    /* I-14: landed cost of each purchase bill, per goods line */
    bills.forEach(function (d) {
      if (d.lcBy === 'none') return;
      var goods = [], extra = 0;
      (d.items || []).forEach(function (it, li) {
        var nm = String(it.desc || '').trim(), m = M[key(nm)], q = lineQty(it), v = r2(q * lineCost(it));
        if (!nm && !num(it.rate)) return;
        if (isService(m, it)) { if (it.lc === true || (it.lc !== false && LC_WORDS.test(nm))) extra += v; return; }
        if (it.lc === true && !m) { extra += v; return; }
        if (q > 0) goods.push({ li: li, q: q, v: v });
      });
      (d.charges || []).forEach(function (c) { if (c && c.lc !== false) extra += num(c.amt); });
      var byQ = d.lcBy === 'qty', parts = [{ amt: extra, byQ: byQ }];
      (LC[d.id] || []).forEach(function (x) { parts.push({ amt: num(x.amt), byQ: x.basis === 'qty' }); });
      var W = goods.reduce(function (s, g) { return s + g.v; }, 0), WQ = goods.reduce(function (s, g) { return s + g.q; }, 0);
      parts.forEach(function (p) {
        if (!(p.amt > 0) || !goods.length) return;
        LTOT[d.id] = r2((LTOT[d.id] || 0) + p.amt);
        goods.forEach(function (g) { var w = p.byQ || !(W > 0) ? (WQ > 0 ? g.q / WQ : 0) : g.v / W; var add = p.amt * w / g.q; LAND[d.id + '|' + g.li] = (LAND[d.id + '|' + g.li] || 0) + add; });
      });
      goods.forEach(function (g) { if (LAND[d.id + '|' + g.li]) LAND[d.id + '|' + g.li] = r2(LAND[d.id + '|' + g.li]); });
    });
    /* I-4: what is still open on each GRN line (less goods sent back), then the bills that name the GRN take from it */
    var left = {}, billed = {}, rejq = {};
    Object.keys(GR).forEach(function (id) { (GR[id].items || GR[id].lines || []).forEach(function (it, i) { left[id + '|' + lidAt(it, i)] = { q: r3(Math.abs(num(it.qty))), k: key(it.desc), i: i, g: id }; }); });
    Object.keys(rej).forEach(function (rid) {
      var r = rej[rid]; if (r.kind !== 'rejout') return;
      (r.items || r.lines || []).forEach(function (it) {
        var s = it.src && GR[it.src.id] ? left[it.src.id + '|' + it.src.lid] : null;
        if (!s && r.ref && GR[r.ref]) s = Object.keys(left).filter(function (x) { return x.indexOf(r.ref + '|') === 0 && left[x].k === key(it.desc) && left[x].q > 0; }).map(function (x) { return left[x]; })[0];
        if (s) { s.q = r3(Math.max(0, s.q - Math.abs(num(it.qty)))); rejq[s.g + '|' + s.i] = r3((rejq[s.g + '|' + s.i] || 0) + Math.abs(num(it.qty))); }
      });
    });
    bills.slice().sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || (a.created || 0) - (b.created || 0); }).forEach(function (d) {
      var refs = refIds(d).filter(function (id) { return GR[id]; });
      (d.items || []).forEach(function (it, li) {
        var need = lineQty(it), took = 0, nm = key(it.desc); if (!(need > 0) || !nm) return;
        var cands = it.src && GR[it.src.id] ? [it.src.id + '|' + it.src.lid] : it.src ? [] : [].concat.apply([], refs.map(function (id) { return Object.keys(left).filter(function (x) { return x.indexOf(id + '|') === 0 && left[x].k === nm; }); }));
        cands.forEach(function (c) {
          var s = left[c]; if (!s || !(need > 0) || !(s.q > 0)) return;
          var t = Math.min(need, s.q); s.q = r3(s.q - t); need = r3(need - t); took = r3(took + t);
          var g = c.split('|')[0], b = billed[g + '|' + s.i] = billed[g + '|' + s.i] || [0, 0];
          b[0] = r3(b[0] + t); b[1] = r2(b[1] + t * r2(lineCost(it) + (LAND[d.id + '|' + li] || 0)));
        });
        if (took > 0) GCOV[d.id + '|' + li] = took;
      });
    });
    Object.keys(GR).forEach(function (id) {
      (GR[id].items || GR[id].lines || []).forEach(function (it, i) {
        var b = billed[id + '|' + i], q = Math.abs(num(it.qty)); if (!b || !(q > 0)) return;
        var rest = Math.max(0, q - b[0] - (rejq[id + '|' + i] || 0)); GRATE[id + '|' + i] = r2((b[1] + rest * lineCost(it)) / (b[0] + rest));
      });
    });
    /* a credit / debit note made from a goods-back / goods-sent-back entry: the rejection already moved the goods */
    notes.forEach(function (d) {
      var r = rej[d.fromId]; if (!r) return;
      var have = {}; (r.items || r.lines || []).forEach(function (it) { var k = key(it.desc); have[k] = r3((have[k] || 0) + Math.abs(num(it.qty))); });
      (d.items || []).forEach(function (it, li) { var k = key(it.desc), t = Math.min(lineQty(it), have[k] || 0); if (t > 0) { have[k] = r3(have[k] - t); GCOV[d.id + '|' + li] = t; } });
    });
  }
  /* I-12: quantity still to go out on open sales orders (not yet on a challan or bill, not closed short), in the item's own unit:
     { item key: qty }. In hand minus this = free to sell. Needs ordercore.js; {} without it. */
  function promised(docs, items, biz, upto) {
    var OC = G.NSOrders || (typeof require === 'function' ? (function () { try { return require('./ordercore.js'); } catch (e) { return null; } })() : null), out = {};
    if (!OC) return out;
    var X = mfg(), M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    OC.track(docs, biz, {}).list.forEach(function (e) {
      if (e.d.type !== 'so' || upto && e.d.date > upto) return;
      e.lines.forEach(function (L) { if (L.pending > 0) out[L.k] = r3((out[L.k] || 0) + L.pending * (X ? X.factor(M[L.k], L.unit) : 1)); });
    });
    return out;
  }
  /* I-14: freight and other cost added to each purchase bill's goods: { bill id: amount } (for the purchase register) */
  function landed(docs, items, biz) {
    var b = key(biz), M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    var D = (docs || []).filter(function (d) { return d && (!b || bizOf(d) === b); });
    orderLinks(D, M);
    return Object.assign({}, LTOT);
  }
  /* I-7: value of an adjustment (stock written off, own use, samples, gifts, theft, count shortage) at the cost on its date, and the
     GST input credit to reverse (s.17(5)(g)/(h) CGST Act) at the rate of the item's last purchase that carried GST.
     Returns { lines: [{ i, k, cost, value, rate, itc: { igst, cgst, sgst } }], value, itc } for the out-going lines only. */
  var REV = { damage: 1, own: 1, sample: 1, gift: 1, lost: 1, expired: 1, short: 1 };
  function adjValue(docs, items, biz, d) {
    var date = d.date || '', S = {}, b = key(biz || (d.seller && d.seller.name));
    summary((docs || []).filter(function (x) { return !(d.id && x.id === d.id); }), items, b, '', date).items.forEach(function (s) { S[s.k] = s; });
    var last = {};
    (docs || []).filter(function (x) { return x && !x.cancelled && bizOf(x) === b && x.date <= date && stockRole(x) === 'buy' && x.type === 'pbill' && !x.noGst && String(x.buyer && x.buyer.gstin || '').trim(); })
      .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); })
      .forEach(function (x) { var inter = !!(x.buyer && x.buyer.state && x.seller && x.seller.state && x.buyer.state !== x.seller.state); (x.items || []).forEach(function (it) { if (num(it.gst) > 0 && it.itc !== 'blocked' && it.itc !== 'ineligible') last[key(it.desc)] = { gst: num(it.gst), inter: inter }; }); });
    var out = { lines: [], value: 0, itc: { igst: 0, cgst: 0, sgst: 0 } };
    (d.lines || []).forEach(function (it, i) {
      var k = key(it.desc), q = Math.abs(num(it.qty)); if (!k || !(q > 0) || !OUTR[it.reason] || it.reason === 'jwloss') return;
      if (num(it.qty) > 0 && !OUTR[it.reason]) return;
      var cost = S[k] ? num(S[k].cost) : 0, value = r2(q * cost), L = last[k], tax = { igst: 0, cgst: 0, sgst: 0 };
      if (L && REV[it.reason] && value > 0) { var t = r2(value * L.gst / 100); if (L.inter) tax.igst = t; else { tax.cgst = r2(t / 2); tax.sgst = r2(t - tax.cgst); } }
      out.lines.push({ i: i, k: k, cost: cost, value: value, rate: L ? L.gst : 0, itc: tax });
      out.value = r2(out.value + value); ['igst', 'cgst', 'sgst'].forEach(function (h) { out.itc[h] = r2(out.itc[h] + tax[h]); });
    });
    return out;
  }
  /* I-1: the books' rule (books.js), else (a page without the books) the same rule kept here */
  function bk() { return G.NSBooks || (typeof require === 'function' ? (function () { try { return require('./books.js'); } catch (e) { return null; } })() : null); }
  var OWN_SALE = { invoice: 1, cashmemo: 1, pharma: 1, jewel: 1, garment: 1, expinv: 1 };
  function stockRole(d) {
    var B = bk(); if (B && B.stockRole) return B.stockRole(d);
    var ty = d.type || 'invoice';
    if (ty === 'challan') return d.kind === 'sale' || d.kind === 'approval' || !d.kind ? 'dn' : d.kind === 'transfer' ? (String(d.toGd || '').trim() ? 'dnmove' : '') : d.kind === 'job' ? 'dnjob' : '';
    if (OWN_SALE[ty] || (ty === 'resto' && d.status !== 'open') || ((ty === 'gjob' || ty === 'job') && d.print === 'bill')) return 'sale';
    if (ty === 'pbill') return d.kind === 'return' ? 'pret' : 'buy';
    if (ty === 'self') return 'buy';
    if (ty === 'note' && d.reason === 'ret') return d.side === 'purchase' ? (d.kind === 'debit' ? 'pret' : '') : (d.kind !== 'debit' ? 'sret' : '');
    return '';
  }
  /* I-2 (filled at the start of moves): JOBDC = challan ids an App job work entry was made from; REJ = challan ids with a
     "goods back" entry; COVER = { invoice id: { line index: quantity already gone out on its challan (a + number) } } */
  var JOBDC = {}, REJ = {}, COVER = {};
  function challanLinks(docs, M) {
    JOBDC = {}; REJ = {}; COVER = {};
    var CH = {}, ev = [];
    (docs || []).forEach(function (d) {
      if (!d) return;
      if (d.type === 'stk' && (d.kind === 'jobout' || d._job === 'out') && d.dcid) JOBDC[d.dcid] = 1;   /* expand() has made the jobout a move */
      if (d.type === 'challan' && d.id && stockRole(d) === 'dn') CH[d.id] = d;
    });
    (docs || []).forEach(function (d) {
      if (!d) return;
      var rj = d.type === 'stk' && d.kind === 'rejin' ? (d.ref && CH[d.ref] ? d.ref : ((d.items || []).map(function (it) { return it.src && CH[it.src.id] ? it.src.id : ''; }).filter(Boolean)[0] || '')) : '';   /* ERP round 2: a goods-back voucher names its challan on its lines */
      if (rj) { REJ[rj] = 1; d._rj = rj; ev.push(d); return; }
      if (d.type === 'stk' || d.type === 'challan' || stockRole(d) !== 'sale') return;
      var refs = (d.dnRef || []).map(function (r) { return r && r.id; }).filter(function (id) { return CH[id]; });
      if (!refs.length && d.fromId && CH[d.fromId]) refs = [d.fromId];
      (d.items || []).forEach(function (it) { if (it && it.src && CH[it.src.id] && refs.indexOf(it.src.id) < 0) refs.push(it.src.id); });   /* ERP round 2: lines picked from a challan (it.src) */
      if (refs.length) { d._dn = refs; ev.push(d); }
    });
    if (!ev.length) return;
    var left = {};   /* challan id -> { item key: quantity still out on it } */
    Object.keys(CH).forEach(function (id) { var L = left[id] = {}; (CH[id].items || []).forEach(function (it) { var k = key(it.desc); if (k) L[k] = r3((L[k] || 0) + lineQty(it)); }); });
    ev.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || (a.created || 0) - (b.created || 0); }).forEach(function (d) {
      if (d.type === 'stk') { var L0 = left[d._rj]; delete d._rj; (d.lines && d.lines.length ? d.lines : d.items || []).forEach(function (it) { var k = key(it.desc); if (L0[k]) L0[k] = r3(Math.max(0, L0[k] - Math.abs(num(it.qty)))); }); return; }
      var c = {};
      (d.items || []).forEach(function (it, li) {
        var k = key(it.stk || it.desc), need = lineQty(it); if (!k || !(need > 0)) return;
        (it.src && CH[it.src.id] ? [it.src.id] : it.src ? [] : d._dn).forEach(function (id) { var L = left[id], t = Math.min(need, L[k] || 0); if (t > 0) { L[k] = r3(L[k] - t); need = r3(need - t); c[li] = r3((c[li] || 0) + t); } });
      });
      COVER[d.id] = c; delete d._dn;
    });
  }
  /* I-6: walk the movements in order; each physical stock line becomes the difference between what was counted and the
     balance at that point (the whole item in that godown, or that batch: goods out take their own batch first, then the
     earliest expiry, as batches() does). A count that matches the books leaves no row. */
  function physPass(out) {
    if (!out.some(function (x) { return x.src === 'phys'; })) return out;
    var bal = {}, lots = {}, res = [];
    function lotsOf(id) { return lots[id] = lots[id] || { by: {}, order: [] }; }
    function apply(x) {
      var id = x.k + '|' + key(x.g || MAIN), L = lotsOf(id), b = key(x.batch);
      bal[id] = r3((bal[id] || 0) + x.qty);
      if (x.qty > 0) { if (!L.by[b]) { L.by[b] = { qty: 0, exp: x.exp }; L.order.push(b); } L.by[b].qty = r3(L.by[b].qty + x.qty); return; }
      var need = -x.qty;
      if (b && L.by[b] && L.by[b].qty > 0) { var t = Math.min(need, L.by[b].qty); L.by[b].qty = r3(L.by[b].qty - t); need = r3(need - t); }
      L.order.filter(function (o) { return L.by[o].qty > 0; }).sort(function (p, q) { return (L.by[p].exp || '9999').localeCompare(L.by[q].exp || '9999'); }).forEach(function (o) {
        if (need <= 0) return; var t2 = Math.min(need, L.by[o].qty); L.by[o].qty = r3(L.by[o].qty - t2); need = r3(need - t2);
      });
      if (need > 0.0005) { if (!L.by[b]) { L.by[b] = { qty: 0, exp: x.exp }; L.order.push(b); } L.by[b].qty = r3(L.by[b].qty - need); }
    }
    out.forEach(function (x) {
      if (x.src !== 'phys') { apply(x); res.push(x); return; }
      var id = x.k + '|' + key(x.g || MAIN), book = x.hasBatch ? ((lots[id] && lots[id].by[key(x.batch)] || {}).qty || 0) : (bal[id] || 0), diff = r3(x.counted - book);
      if (!diff) return;
      x.qty = diff; x.book = r3(book); x.reason = diff < 0 ? 'short' : 'extra';
      apply(x); res.push(x);
    });
    return res;
  }

  /* which names the register follows: goods masters + anything bought, opened or adjusted */
  function tracked(mv, items) {
    var T = {};
    (items || []).forEach(function (m) { if (m && m.desc && m.kind === 'goods' && !isService(m)) T[key(m.desc)] = { k: key(m.desc), name: m.desc, unit: m.unit || '', min: num(m.min), m: m }; });
    var M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    mv.forEach(function (x) {
      if (x.src === 'sale' || x.src === 'sret' || x.src === 'dn' || x.src === 'rej' || x.dc) return;
      if (!T[x.k]) T[x.k] = { k: x.k, name: x.name, unit: x.unit, min: num(M[x.k] && M[x.k].min), m: M[x.k] || null };
      if (!T[x.k].unit && x.unit) T[x.k].unit = x.unit;
    });
    return T;
  }

  /* summary of every tracked item for a period: opening, in, out, adjust, closing, average cost, value, low */
  function summary(docs, items, biz, from, to, gd, how) {
    var all = API.moves(docs, items, biz), T = tracked(all, items), S = {}, CQ = {};
    var mv = all.filter(function (x) { return gdOk(x, gd); });
    /* average cost is the business's own, whichever godown the goods sit in */
    all.forEach(function (x) { if (to && x.date > to || x.rate == null || x.qty <= 0) return; var c = CQ[x.k] = CQ[x.k] || [0, 0]; c[0] += x.qty; c[1] += x.qty * x.rate; });
    Object.keys(T).forEach(function (k) { S[k] = { k: k, name: T[k].name, unit: T[k].unit, min: T[k].min, m: T[k].m, open: 0, inq: 0, outq: 0, adj: 0, close: 0, n: 0 }; });
    mv.forEach(function (x) {
      var s = S[x.k]; if (!s) return;
      if (to && x.date > to) return;
      if (!from || x.date < from || x.src === 'open') s.open += x.qty;
      else if (x.src === 'adj' || x.src === 'phys') s.adj += x.qty;
      else if (x.qty > 0) s.inq += x.qty;
      else s.outq -= x.qty;
      s.n++; if (x.badUnit) s.bad = (s.bad || 0) + 1;
    });
    var tot = 0, low = 0, neg = 0, bad = 0, fifo = (how || VAL) === 'fifo', BQ = {};
    /* FIFO: the business's own quantity in hand (all godowns) is valued from the newest lots back */
    if (fifo) all.forEach(function (x) { if (to && x.date > to || x.src === 'move') return; BQ[x.k] = (BQ[x.k] || 0) + x.qty; });
    var list = Object.keys(S).map(function (k) {
      var s = S[k];
      s.open = r3(s.open); s.inq = r3(s.inq); s.outq = r3(s.outq); s.adj = r3(s.adj);
      s.close = r3(s.open + s.inq - s.outq + s.adj);
      var c = CQ[k]; s.cost = c && c[0] > 0 ? r2(c[1] / c[0]) : 0;
      if (fifo) { var bq = r3(BQ[k] || 0), fv = bq > 0 ? fifoValue(all, k, to, bq, s.cost) : 0; if (bq > 0) s.cost = r2(fv / bq); s.value = s.close > 0 ? (s.close === bq ? fv : r2(s.close * s.cost)) : 0; }
      else s.value = s.close > 0 ? r2(s.close * s.cost) : 0;
      s.low = s.min > 0 && s.close <= s.min;
            tot = r2(tot + s.value); if (s.low) low++; if (s.close < 0) neg++; if (s.bad) bad++;
      return s;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { items: list, value: tot, low: low, neg: neg, bad: bad };
  }

  /* stock valuation method of the books: 'avg' (weighted average, the default) or 'fifo'; summary(..., how) can ask for either */
  var VAL = 'avg';
  function valuation(m) { if (m !== undefined) VAL = m === 'fifo' ? 'fifo' : 'avg'; return VAL; }
  /* FIFO value of qty units of item k in hand on `to`: lots bought (opening stock, purchases, production) in date order, a purchase
     return takes its quantity off the newest lots; the stock in hand is the newest lots. A quantity with no priced lot left
     (for example goods found on a count) is valued at `fallback` (the average cost). */
  function fifoValue(mv, k, to, qty, fallback) {
    var lots = [];
    mv.forEach(function (x) {
      if (x.k !== k || to && x.date > to) return;
      if (x.rate != null && x.qty > 0) lots.push([x.qty, x.rate]);
      else if (x.src === 'pret') { var q = -x.qty; for (var i = lots.length - 1; i >= 0 && q > 0; i--) { var t = Math.min(q, lots[i][0]); lots[i][0] -= t; q -= t; } }
    });
    var left = qty, v = 0;
    for (var j = lots.length - 1; j >= 0 && left > 0.0005; j--) { var u = Math.min(left, lots[j][0]); v += u * lots[j][1]; left -= u; }
    if (left > 0.0005) v += left * (fallback || 0);
    return r2(v);
  }

  /* the stock in hand on `date`, item by item, traced to the lots it came from (FIFO: the newest lots are the ones still in hand), for the
     GST stock forms (ITC-01, ITC-03, GSTR-10). Each row: { k, name, unit, qty, rate, value, src ('buy' purchase bill, 'make' made here,
     other = opening stock or count), d (the bill or entry) }; a quantity no priced lot covers comes as src 'none' at the average cost. */
  function lotsOn(docs, items, biz, date) {
    var all = moves(docs, items, biz).filter(function (x) { return x.src !== 'move' && (!date || x.date <= date); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var Q = {}, L = {}, N = {}, out = [];
    all.forEach(function (x) {
      Q[x.k] = r3((Q[x.k] || 0) + x.qty); N[x.k] = N[x.k] || { name: x.name, unit: x.unit };
      var ls = L[x.k] || (L[x.k] = []);
      if (x.rate != null && x.qty > 0) ls.push({ q: x.qty, rate: x.rate, src: x.src, d: x.d });
      else if (x.src === 'pret') { var q = -x.qty; for (var i = ls.length - 1; i >= 0 && q > 0; i--) { var t = Math.min(q, ls[i].q); ls[i].q -= t; q -= t; } }
    });
    Object.keys(Q).forEach(function (k) {
      var left = Q[k]; if (left <= 0.0005) return;
      var ls = L[k] || [], tq = 0, tv = 0; ls.forEach(function (l) { tq += l.q; tv += l.q * l.rate; });
      for (var j = ls.length - 1; j >= 0 && left > 0.0005; j--) {
        var u = Math.min(left, ls[j].q); if (u <= 0) continue;
        out.push({ k: k, name: N[k].name, unit: N[k].unit, qty: r3(u), rate: ls[j].rate, value: r2(u * ls[j].rate), src: ls[j].src, d: ls[j].d }); left = r3(left - u);
      }
      if (left > 0.0005) { var avg = tq ? tv / tq : 0; out.push({ k: k, name: N[k].name, unit: N[k].unit, qty: left, rate: r2(avg), value: r2(left * avg), src: 'none', d: null }); }
    });
    return out;
  }

  /* one item's register: opening, rows with running balance, closing */
  function ledger(docs, items, biz, k, from, to, gd) {
    var open = 0, rows = [], bal;
    moves(docs, items, biz).forEach(function (x) {
      if (x.k !== k || to && x.date > to || !gdOk(x, gd)) return;
      if (from && x.date < from) { open = r3(open + x.qty); return; }
      rows.push(x);
    });
    bal = open;
    rows.forEach(function (r) { bal = r3(bal + r.qty); r.bal = bal; });
    return { open: open, rows: rows, close: bal, inq: r3(rows.reduce(function (a, r) { return a + (r.qty > 0 ? r.qty : 0); }, 0)), outq: r3(rows.reduce(function (a, r) { return a + (r.qty < 0 ? -r.qty : 0); }, 0)) };
  }

  /* quantity in hand of every tracked item on a date (for the count sheet and the adjustment form) */
  function inHand(docs, items, biz, upto, gd) {
    var o = {}; summary(docs, items, biz, '', upto, gd).items.forEach(function (s) { o[s.k] = s.close; }); return o;
  }

  /* stock of each godown up to a date: [{ g ('' = main), value, n (items in hand), neg }]; names = godowns set in Settings */
  function godowns(docs, items, biz, upto, names) {
    var seen = {}, out = [];
    [''].concat(names || []).concat(moves(docs, items, biz).map(function (x) { return x.g; })).forEach(function (g) {
      var k = key(g || MAIN); if (seen[k]) return; seen[k] = 1;
      var s = summary(docs, items, biz, '', upto, g || MAIN);
      out.push({ g: g || '', value: s.value, n: s.items.filter(function (x) { return x.close; }).length, neg: s.neg, items: s.items });
    });
    return out;
  }

  /* expiry month YYYY-MM -> last day of that month (goods may be used until then) */
  function expEnd(m) { if (!/^\d{4}-\d{2}$/.test(m || '')) return ''; var d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); return d.toISOString().slice(0, 10); }
  /* batches in hand of one item (k) or every item: [{ k, name, batch, exp, qty }], qty > 0 only.
     Goods going out take their own batch first; what is left (or a line without a batch) takes the earliest expiry first. */
  function batches(docs, items, biz, k, upto, gd) {
    var by = {}, order = [];
    moves(docs, items, biz).forEach(function (x) {
      if (k && x.k !== k || upto && x.date > upto || !gdOk(x, gd)) return;
      var id = x.k + '|' + key(x.batch);
      if (x.qty > 0) { if (!by[id]) { by[id] = { k: x.k, name: x.name, batch: x.batch, exp: x.exp, qty: 0 }; order.push(id); } if (x.exp && !by[id].exp) by[id].exp = x.exp; by[id].qty = r3(by[id].qty + x.qty); return; }
      var need = -x.qty;
      if (x.batch && by[id]) { var t = Math.min(need, by[id].qty); by[id].qty = r3(by[id].qty - t); need = r3(need - t); }
      order.filter(function (o) { return by[o].k === x.k && by[o].qty > 0; }).sort(function (a, b) { return (by[a].exp || '9999').localeCompare(by[b].exp || '9999'); }).forEach(function (o) {
        if (need <= 0) return; var t2 = Math.min(need, by[o].qty); by[o].qty = r3(by[o].qty - t2); need = r3(need - t2);
      });
    });
    return order.map(function (o) { return by[o]; }).filter(function (b) { return b.qty > 0.0005; });
  }
  /* batches that expire within `days` of today (or have expired), earliest first */
  function expiring(docs, items, biz, today, days) {
    var lim = new Date(Date.parse(today + 'T00:00:00Z') + (days || 0) * 864e5).toISOString().slice(0, 10);
    return batches(docs, items, biz, '', today).filter(function (b) { var e = expEnd(b.exp); return e && e <= lim; })
      .map(function (b) { b.end = expEnd(b.exp); b.gone = b.end < today; return b; }).sort(function (a, b) { return a.end.localeCompare(b.end); });
  }
  /* serial / IMEI numbers: in hand, and where each one went (last movement) */
  function serials(docs, items, biz, k) {
    var have = {}, went = {};
    moves(docs, items, biz).forEach(function (x) {
      if (k && x.k !== k || x.src === 'move') return;
      x.sn.forEach(function (n) { var nk = key(n); if (x.qty > 0) { have[nk] = { sn: n, k: x.k, name: x.name, d: x.d }; delete went[nk]; } else { delete have[nk]; went[nk] = { sn: n, k: x.k, name: x.name, d: x.d }; } });
    });
    return { inHand: Object.keys(have).map(function (n) { return have[n]; }), out: Object.keys(went).map(function (n) { return went[n]; }) };
  }
  /* cost of raw material at average cost on a date: { lines: [{ k, qty, cost, value, have }], total } */
  function makeCost(docs, items, biz, lines, date) {
    var S = {}; summary(docs, items, biz, '', date).items.forEach(function (s) { S[s.k] = s; });
    var tot = 0, out = (lines || []).map(function (l) { var k = key(l.desc), c = S[k] ? S[k].cost : 0, v = r2(num(l.qty) * c); tot += v; return { k: k, qty: num(l.qty), cost: c, value: v, have: S[k] ? S[k].close : 0 }; });
    return { lines: out, total: r2(tot) };
  }

  /* ---------- Stock ledger (groups, ledgers of many items, godown and batch views, movement report) ----------
     Item groups (meta 'groups'.item = [{ id, name, under }], under = '' or a top group id; one level of sub-groups).
     An item's group: item.group (id), else a group named like item.cat, else the category itself as a group of its own
     (so categories typed so far show as groups), else no group. NS.itemGroup in core.js, when there, decides instead. */
  function itemGroupOf(m, groups) {
    var G = groups || [], g = m && m.group ? G.filter(function (x) { return x.id === m.group; })[0] : null;
    if (!g && m && m.cat) g = G.filter(function (x) { return key(x.name) === key(m.cat); })[0] || { id: 'cat:' + key(m.cat), name: String(m.cat).trim(), under: '' };
    if (!g) return { id: '', name: '', top: '' };
    return { id: g.id, name: g.name, top: g.under || '' };
  }
  /* list of rows (anything with .m = item master) sorted into groups: [{ id, name, list, subs: [{ id, name, list, tot }], tot }]
     gOf(m) -> { id, name, top }; fields = the numbers to add up; groups without a name ("No group") come last */
  function groupTree(list, gOf, groups, fields) {
    var G = groups || [], T = {}, order = [];
    function nameOf(id) { var g = G.filter(function (x) { return x.id === id; })[0]; return g ? g.name : ''; }
    function node(id, name) { if (!T[id]) { T[id] = { id: id, name: name, list: [], subs: [], S: {}, tot: {} }; order.push(id); } return T[id]; }
    function add(tot, x) { (fields || []).forEach(function (f) { tot[f] = r3((tot[f] || 0) + num(x[f])); }); tot.n = (tot.n || 0) + 1; }
    (list || []).forEach(function (x) {
      var g = gOf(x.m || null) || {}, top = g.top ? node(g.top, g.topName || nameOf(g.top) || g.top) : node(g.id || '', g.name || '');
      if (g.top) { var s = top.S[g.id]; if (!s) { s = top.S[g.id] = { id: g.id, name: g.name, list: [], tot: {} }; top.subs.push(s); } s.list.push(x); add(s.tot, x); }
      else top.list.push(x);
      add(top.tot, x);
    });
    return order.map(function (id) { var n = T[id]; delete n.S; n.subs.sort(function (a, b) { return a.name.localeCompare(b.name); }); return n; })
      .sort(function (a, b) { return !a.id - !b.id || a.name.localeCompare(b.name); });
  }
  /* voucher type of a movement, for the ledger filter */
  var VT = { open: 'open', buy: 'buy', sret: 'sret', sale: 'sale', pret: 'pret', adj: 'adj', move: 'move', make: 'make', use: 'make', dn: 'dn', rej: 'rej', phys: 'phys' };
  function partyOf(x) { var d = x.d || {}; if (x.src === 'move') return (d.from || 'Main') + ' → ' + (d.to || 'Main'); return d.buyer && d.buyer.name || ''; }
  /* ledgers of many items at once.  o = { keys: [k] (null = every tracked item), from, to, gd (godown, see gdOk), types: { vt: 1 } (null = all) }
     Each: { k, name, unit, m, open, openValue, rows: [{ date, vt, no, party, inq, outq, bal, cost, value, neg, x }], inq, outq, close, cost, value, neg }
     The running balance counts every movement; the type filter only hides rows (their in/out leave the totals too).
     cost = weighted average cost of everything that came in up to that row's date (the summary's cost at `to`). */
  function ledgers(docs, items, biz, o) {
    o = o || {};
    var all = moves(docs, items, biz), T = tracked(all, items), want = o.keys ? {} : null, by = {};
    if (want) o.keys.forEach(function (k) { want[k] = 1; });
    all.forEach(function (x) { if (T[x.k] && (!want || want[x.k])) (by[x.k] = by[x.k] || []).push(x); });
    return Object.keys(T).filter(function (k) { return !want || want[k]; }).map(function (k) {
      var t = T[k], open = 0, bal = 0, rows = [], inq = 0, outq = 0, neg = 0, c = [0, 0], oc = 0;
      function cost() { return c[0] > 0 ? r2(c[1] / c[0]) : 0; }
      (by[k] || []).forEach(function (x) {
        if (o.to && x.date > o.to) return;
        if (o.from && x.date >= o.from && !oc) oc = cost() || -1;
        if (x.rate != null && x.qty > 0) { c[0] += x.qty; c[1] += x.qty * x.rate; }
        if (!gdOk(x, o.gd)) return;
        bal = r3(bal + x.qty);
        if (o.from && x.date < o.from) { open = bal; return; }
        var vt = x.d && x.d._job ? 'job' : VT[x.src] || x.src, cc = cost(), row = { date: x.date, vt: vt, src: x.src, reason: x.reason, no: x.d.no || x.d.billNo || '', party: partyOf(x),
          inq: x.qty > 0 ? x.qty : 0, outq: x.qty < 0 ? -x.qty : 0, bal: bal, cost: cc, value: bal > 0 ? r2(bal * cc) : 0, neg: bal < 0, batch: x.batch, x: x };
        if (row.neg) neg++;
        if (o.types && !o.types[vt]) return;
        inq = r3(inq + row.inq); outq = r3(outq + row.outq); rows.push(row);
      });
      if (!oc) oc = cost();
      return { k: k, name: t.name, unit: t.unit, m: t.m, min: t.min, open: open, openValue: open > 0 && oc > 0 ? r2(open * oc) : 0, rows: rows, inq: inq, outq: outq,
        close: bal, cost: cost(), value: bal > 0 ? r2(bal * cost()) : 0, neg: neg };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  /* totals of several ledgers (a group, or all items): { open, inq, outq, close, openValue, value, neg (items that went below zero) } */
  function ledgerTotals(L) {
    var t = { open: 0, inq: 0, outq: 0, close: 0, openValue: 0, value: 0, neg: 0 };
    (L || []).forEach(function (l) { ['open', 'inq', 'outq', 'close'].forEach(function (f) { t[f] = r3(t[f] + l[f]); }); t.openValue = r2(t.openValue + l.openValue); t.value = r2(t.value + l.value); t.neg += l.neg ? 1 : 0; });
    return t;
  }
  /* stock of every item in each godown on a date: { gds: ['' (main), names…], keys (godown keys, same order), rows: [{ k, name, unit, m, q: { godown key: qty }, total, value }], tot } */
  function godownMatrix(docs, items, biz, upto, names) {
    var G = godowns(docs, items, biz, upto, names), R = {}, tot = {};
    G.forEach(function (g) {
      var gk = key(g.g || MAIN);
      g.items.forEach(function (s) {
        var r = R[s.k] = R[s.k] || { k: s.k, name: s.name, unit: s.unit, m: s.m, q: {}, total: 0, value: 0 };
        r.q[gk] = s.close; r.total = r3(r.total + s.close); tot[gk] = r3((tot[gk] || 0) + s.close);
      });
    });
    var S = {}; summary(docs, items, biz, '', upto).items.forEach(function (s) { S[s.k] = s; });
    var rows = Object.keys(R).map(function (k) { var r = R[k]; r.value = S[k] ? S[k].value : 0; return r; })
      .filter(function (r) { return Object.keys(r.q).some(function (g) { return r.q[g]; }); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { gds: G.map(function (g) { return g.g; }), keys: G.map(function (g) { return key(g.g || MAIN); }), rows: rows, tot: tot };
  }
  /* each batch of one item with its own in, out and balance: [{ batch, exp, end, open, rows: [{ date, vt, no, party, inq, outq, bal, neg, x }], inq, outq, close }]
     Goods going out take their own batch first, then the earliest expiry first (as batches()); what no batch can cover
     stays on the line's own batch (or "no batch") as a minus balance, so the warning shows where it happened. */
  function batchLedger(docs, items, biz, k, from, to, gd) {
    var by = {}, order = [];
    function get(b, exp) { var id = key(b); if (!by[id]) { by[id] = { batch: b || '', exp: exp || '', bal: 0, open: 0, rows: [], inq: 0, outq: 0 }; order.push(id); } if (exp && !by[id].exp) by[id].exp = exp; return by[id]; }
    function put(B, x, q) {
      B.bal = r3(B.bal + q);
      if (from && x.date < from) { B.open = B.bal; return; }
      var r = { date: x.date, vt: x.d && x.d._job ? 'job' : VT[x.src] || x.src, src: x.src, reason: x.reason, no: x.d.no || x.d.billNo || '', party: partyOf(x), inq: q > 0 ? q : 0, outq: q < 0 ? -q : 0, bal: B.bal, neg: B.bal < 0, x: x };
      B.inq = r3(B.inq + r.inq); B.outq = r3(B.outq + r.outq); B.rows.push(r);
    }
    moves(docs, items, biz).forEach(function (x) {
      if (x.k !== k || to && x.date > to || !gdOk(x, gd)) return;
      if (x.qty > 0) { put(get(x.batch, x.exp), x, x.qty); return; }
      var need = r3(-x.qty), own = x.batch && by[key(x.batch)];
      if (own && own.bal > 0) { var t = Math.min(need, own.bal); put(own, x, -t); need = r3(need - t); }
      order.map(function (id) { return by[id]; }).filter(function (b) { return b.bal > 0; }).sort(function (a, b) { return (a.exp || '9999').localeCompare(b.exp || '9999'); }).forEach(function (b) {
        if (need <= 0) return; var t2 = Math.min(need, b.bal); put(b, x, -t2); need = r3(need - t2);
      });
      if (need > 0.0005) put(get(x.batch, x.exp), x, -need);
    });
    return order.map(function (id) { var b = by[id]; b.close = b.bal; b.end = expEnd(b.exp); delete b.bal; return b; })
      .filter(function (b) { return b.rows.length || b.open; })
      .sort(function (a, b) { return (a.exp || '9999').localeCompare(b.exp || '9999') || a.batch.localeCompare(b.batch); });
  }
  /* fast, slow and non-moving items.  Period from..to; days = no movement for this many days up to `to` (default 90).
     sold = quantity sold in the period (sales less sales returns); lastSale = last sale up to `to`; lastMove = last movement
     of any kind except opening stock and godown transfers; idle = days since lastMove (or since the first entry);
     cover = days the closing stock lasts at the period's selling speed.
     fast = the top third of the items sold in the period by value sold at cost (at least one);
     none = in hand and nothing moved for `days` days; slow = every other item sold or in hand. */
  function movement(docs, items, biz, from, to, days) {
    days = days == null || days === '' ? 90 : num(days);
    var all = moves(docs, items, biz), T = tracked(all, items), S = {}, A = {};
    summary(docs, items, biz, from, to).items.forEach(function (s) { S[s.k] = s; });
    Object.keys(T).forEach(function (k) { A[k] = { k: k, name: T[k].name, unit: T[k].unit, m: T[k].m, sold: 0, lastSale: '', lastMove: '', first: '' }; });
    all.forEach(function (x) {
      var a = A[x.k]; if (!a || to && x.date > to || x.src === 'move') return;
      if (!a.first) a.first = x.date;
      if (x.src !== 'open') a.lastMove = x.date;
      if (x.src === 'sale' || x.src === 'dn') a.lastSale = x.date;
      /* raw material used in production moves too: a manufacturer's sheet and handles are not "slow" (round C) */
      if ((x.src === 'sale' || x.src === 'sret' || x.src === 'use' || x.src === 'dn' || x.src === 'rej') && (!from || x.date >= from)) a.sold = r3(a.sold - x.qty);
      if (x.src === 'use' && (!a.lastSale || x.date > a.lastSale)) a.lastSale = x.date;
    });
    var span = from && to ? Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1) : 0;
    var cut = to ? new Date(Date.parse(to + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10) : '';
    var list = Object.keys(A).map(function (k) {
      var a = A[k], s = S[k] || {}, since = a.lastMove || a.first;
      a.close = s.close || 0; a.cost = s.cost || 0; a.value = s.value || 0; a.soldValue = r2(Math.max(0, a.sold) * a.cost);
      a.idle = to && since ? Math.round((Date.parse(to) - Date.parse(since)) / 864e5) : null;
      a.cover = span && a.sold > 0 && a.close > 0 ? Math.round(a.close / (a.sold / span)) : null;
      a.cls = ''; a.rank = 0;
      return a;
    });
    var sold = list.filter(function (a) { return a.sold > 0; }).sort(function (a, b) { return b.soldValue - a.soldValue || b.sold - a.sold; }), nf = Math.max(1, Math.ceil(sold.length / 3));
    sold.forEach(function (a, i) { a.rank = i + 1; if (i < nf) a.cls = 'fast'; });
    list.forEach(function (a) {
      if (a.cls) return;
      if (a.close > 0 && cut && (a.lastMove || a.first) <= cut) a.cls = 'none';
      else if (a.close > 0 || a.sold > 0) a.cls = 'slow';
    });
    var order = { fast: 0, slow: 1, none: 2 };
    return list.filter(function (a) { return a.cls; }).sort(function (a, b) { return order[a.cls] - order[b.cls] || (a.rank || 1e9) - (b.rank || 1e9) || b.value - a.value || a.name.localeCompare(b.name); });
  }


  /* ---------- ERP round 1: checks while saving (stockguard.js) and the reorder report ---------- */
  function sameDoc(a, b) { return a === b || !!(a && b && (a.id && a.id === b.id || !a.id && !b.id && (a.type || 'invoice') === (b.type || 'invoice') && key(a.no) && key(a.no) === key(b.no) && bizOf(a) === bizOf(b))); }
  function without(docs, doc, id) { return (docs || []).filter(function (d) { return !(id && d.id === id) && !sameDoc(d, doc); }); }
  /* I-8: lines of `doc` (not saved yet, or being changed; `id` = its saved id) that need more than is in hand on its date in
     its godown (and batch, when the line names one): [{ k, name, unit, want, have, g, batch }]. Only goods the register follows. */
  function shortfall(docs, items, biz, doc, id) {
    if (!doc) return [];
    var rest = without(docs, doc, id), me = Object.assign({}, doc, { _me: 1, id: id || doc.id || '_new' }), all = moves(rest.concat([me]), items, biz), T = tracked(all.filter(function (x) { return !x.d._me; }), items);
    var want = {};
    all.forEach(function (x) {
      if (!x.d._me || x.qty >= 0 || !T[x.k] || x.src === 'move' && !x.dc) return;
      var id2 = x.k + '|' + key(x.g || MAIN) + '|' + key(x.batch), w = want[id2] = want[id2] || { k: x.k, name: x.name, unit: T[x.k].unit || x.unit, want: 0, g: x.g, batch: x.batch };
      w.want = r3(w.want - x.qty);
    });
    var date = doc.date || '', res = [];
    Object.keys(want).forEach(function (id3) {
      var w = want[id3], gd = w.g || MAIN, have;
      if (w.batch) have = (batches(rest, items, biz, w.k, date, gd).filter(function (b) { return key(b.batch) === key(w.batch); })[0] || {}).qty || 0;
      else have = ledger(rest, items, biz, w.k, '', date, gd).close;
      w.have = r3(have);
      if (w.want > w.have + 0.0005) res.push(w);
    });
    return res.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  /* I-10: batches of an item in hand on a date (godown gd, '' = main, null = all): earliest expiry first, expired ones last,
     each { batch, exp, end (last day usable), qty, expired } */
  function batchPick(docs, items, biz, k, date, gd) {
    var day = date || '';
    return batches(docs, items, biz, k, day, gd == null ? null : gd || MAIN).map(function (b) { var e = expEnd(b.exp); return { batch: b.batch, exp: b.exp, end: e, qty: b.qty, expired: !!(e && day && e < day) }; })
      .filter(function (b) { return b.batch; })
      .sort(function (a, b) { return a.expired - b.expired || (a.exp || '9999').localeCompare(b.exp || '9999') || a.batch.localeCompare(b.batch); });
  }
  /* I-10: serial / IMEI numbers on the outgoing lines of `doc`: dup = typed twice in this document, gone = already sold or
     sent out and not back, unknown = never received (a warning only), each [{ sn, name }] */
  function serialCheck(docs, items, biz, doc, id) {
    var res = { dup: [], gone: [], unknown: [] }; if (!doc) return res;
    var me = Object.assign({}, doc, { _me: 1, id: id || doc.id || '_new' }), mine = moves([me], items, biz).filter(function (x) { return x.qty < 0 && x.sn.length; });
    if (!mine.length) return res;
    var S = serials(without(docs, doc, id), items, biz), have = {}, out = {}, seen = {};
    S.inHand.forEach(function (x) { have[key(x.sn)] = 1; }); S.out.forEach(function (x) { out[key(x.sn)] = 1; });
    mine.forEach(function (x) { x.sn.forEach(function (n) {
      var nk = key(n), o = { sn: n, name: x.name };
      if (seen[nk]) { res.dup.push(o); return; } seen[nk] = 1;
      if (out[nk] && !have[nk]) res.gone.push(o); else if (!have[nk]) res.unknown.push(o);
    }); });
    return res;
  }
  /* I-3: lines whose unit is not a unit of their item (mfgcore unitOk): [{ name, unit, base }] */
  function badUnits(doc, items) {
    var X = mfg(); if (!X || !X.unitOk || !doc) return [];
    var M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    return (doc.items || doc.lines || []).map(function (it) { var m = M[key(it && (it.stk || it.desc))]; return m && m.kind !== 'service' && !isService(m, it) && !X.unitOk(m, it.unit) ? { name: m.desc, unit: it.unit, base: m.unit } : null; }).filter(Boolean);
  }
  /* I-15: reorder status on `today`.  Item fields: min (reorder level), rq (reorder / minimum order quantity), max (stock
     to fill up to), lead (days from order to arrival), supplier (preferred supplier's name).
     projected = in hand + ordered from suppliers (purchase orders still open) - booked by customers (sales orders still open);
     an item is due when projected is at or below its reorder level (or below zero).
     suggested = max - projected when a maximum is set, else what it sells in (lead + 15) days at the last 90 days' speed plus
     the reorder level, less projected (twice the level when nothing sold); never less than the reorder quantity.
     Rows: [{ k, name, unit, m, have, po, so, projected, min, max, rq, lead, daily, suggest, supplier, due }], due first. */
  var PO_OPEN = { '': 1, popen: 1 }, SO_OPEN = { '': 1, sopen: 1, spart: 1 };
  function reorder(docs, items, biz, today, opt) {
    opt = opt || {};
    var b = key(biz), all = moves(docs, items, biz), T = tracked(all, items), S = {}, PO = {}, SO = {}, used = {}, lastSup = {};
    summary(docs, items, biz, '', today).items.forEach(function (s) { S[s.k] = s; });
    var from = new Date(Date.parse(today + 'T00:00:00Z') - 89 * 864e5).toISOString().slice(0, 10);
    all.forEach(function (x) {
      if (x.date > today) return;
      if ((x.src === 'sale' || x.src === 'dn' || x.src === 'use' || x.src === 'sret' || x.src === 'rej') && x.date >= from) used[x.k] = r3((used[x.k] || 0) - x.qty);
      if (x.src === 'buy' && x.d.buyer && x.d.buyer.name) lastSup[x.k] = x.d.buyer.name;
    });
    var OC = G.NSOrders || (typeof require === 'function' ? (function () { try { return require('./ordercore.js'); } catch (e) { return null; } })() : null);
    if (OC) {   /* ERP round 2: what is really still to come / to go, line by line (part receipts, part deliveries, lines closed short) */
      var X0 = mfg(), M0 = {}; (items || []).forEach(function (m) { if (m && m.desc) M0[key(m.desc)] = m; });
      OC.track(docs, biz, { today: today }).list.forEach(function (e) {
        var P0 = e.d.type === 'po' ? PO : e.d.type === 'so' ? SO : null; if (!P0 || e.d.date > today) return;
        e.lines.forEach(function (L) { if (!(L.pending > 0)) return; var f = X0 ? X0.factor(M0[L.k], L.unit) : 1; P0[L.k] = r3((P0[L.k] || 0) + L.pending * f); });
      });
    }
    else (docs || []).forEach(function (d) {
      if (!d || b && bizOf(d) !== b || d.date > today) return;
      var P = d.type === 'po' && PO_OPEN[d.status || ''] ? PO : d.type === 'so' && SO_OPEN[d.status || ''] ? SO : null; if (!P) return;
      var X = mfg(), M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
      (d.items || []).forEach(function (it) { var k = key(it.desc); if (!k) return; var f = X ? X.factor(M[k], it.unit) : 1; P[k] = r3((P[k] || 0) + lineQty(it) * f); });
    });
    var rows = Object.keys(T).map(function (k) {
      var m = T[k].m || {}, s = S[k] || { close: 0 }, min = num(m.min), max = num(m.max), rq = num(m.rq), lead = num(m.lead);
      if (!(min > 0) && !(max > 0) && !opt.all) return null;
      var have = r3(s.close || 0), po = r3(PO[k] || 0), so = r3(SO[k] || 0), proj = r3(have + po - so), daily = r3((Math.max(0, used[k] || 0)) / 90);
      var due = min > 0 ? proj <= min : proj < 0, target = max > 0 ? max : daily > 0 ? daily * ((lead || 0) + 15) + min : 2 * min, sug = 0;
      if (due) { sug = Math.max(rq, r3(target - proj)); if (sug > 0 && rq > 0) sug = Math.ceil(sug / rq - 1e-9) * rq; sug = Math.ceil(sug * 1000 - 1e-6) / 1000; }
      return { k: k, name: T[k].name, unit: T[k].unit, m: T[k].m, have: have, po: po, so: so, projected: proj, min: min, max: max, rq: rq, lead: lead, daily: daily,
        suggest: due ? sug : 0, supplier: String(m.supplier || lastSup[k] || '').trim(), due: due };
    }).filter(Boolean);
    return rows.sort(function (a, b) { return b.due - a.due || a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name); });
  }

  var API = { num: num, r2: r2, r3: r3, key: key, moves: moves, tracked: tracked, summary: summary, ledger: ledger, inHand: inHand, OUTR: OUTR, INR: INR,
    MAIN: MAIN, godowns: godowns, batches: batches, expiring: expiring, expEnd: expEnd, serials: serials, serialsOf: serialsOf, makeCost: makeCost };
  /* Stock ledger additions */
  API.itemGroupOf = itemGroupOf; API.groupTree = groupTree; API.VT = VT; API.ledgers = ledgers; API.ledgerTotals = ledgerTotals;
  /* stock valuation (FIFO or weighted average) */
  API.valuation = valuation; API.fifoValue = fifoValue; API.lotsOn = lotsOn;
  API.godownMatrix = godownMatrix; API.batchLedger = batchLedger; API.movement = movement;
  /* ERP round 1 */
  API.stockRole = stockRole; API.shortfall = shortfall; API.batchPick = batchPick; API.serialCheck = serialCheck; API.badUnits = badUnits; API.reorder = reorder; API.PO_OPEN = PO_OPEN; API.SO_OPEN = SO_OPEN;
  API.adjValue = adjValue; API.LC_WORDS = LC_WORDS; API.landed = landed; API.promised = promised;   /* ERP round 2 (orders): I-7, I-14 */
  var BK = typeof NSBooks !== 'undefined' ? NSBooks : G.NSBooks;   /* SQLite Stage 3: one answer per screen drawing (books.js memo) */
  if (BK && BK.memoize) { API.moves = memoize0('moves', API.moves); API.summary = memoize0('summary', API.summary); }
  function memoize0(n, f) { var w = BK.memoize('stk.' + n, f); return function () { return w.apply(this, arguments); }; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSStock = API;
})(this);
