/* NSOrders: line-level order tracking underneath NSBiz (ERP round 2, I-12 / I-4 / B-12), like Tally's tracking numbers.
   Pure functions, nothing extra is stored: every saved document in the data home is read on the fly.

   Sources (documents whose lines can be followed):
     quote / proforma         quotation, estimate, proforma invoice          (sales side, 'order' stage)
     so                       sales order                                     (sales side, 'order' stage)
     po                       purchase order                                  (purchase side, 'order' stage)
     challan (sale/approval)  delivery challan: goods out, bill to follow     (sales side, 'move' stage)
     stk grn                  receipt note (goods received note): goods in, bill to follow (purchase side, 'move' stage)
   Followers (documents made from them):
     'order'  so / proforma made from a quotation            'move' challan (from an order), stk grn (from a PO)
     'bill'   sale bill (invoice, cash memo, export, pharmacy, jewellery, garment) / purchase bill, self invoice
     'ret'    stk rejin (goods back from the customer on a challan) / stk rejout (goods sent back to the supplier from a GRN)
   A follower line names the line it came from: it.src = { id, lid }. Every source line has a stable it.lid (ensureLids(),
   '#<index>' for lines saved without one, so lines saved by the makers keep working). A follower with no line links but a
   document link (d.fromId, d.dnRef [{ id }], d.grnRef, d.poRef) is matched by item name, first open line first (older records).
   d.closed = { date, lines: [{ lid, qty }] }: the rest of an order line closed short ("will not be supplied").
   A source no follower ever reached keeps its hand-picked status: done ('inv', 'sdone', 'prec') or closed ('dec', 'scan');
   a challan marked returned ('dret') counts as all back.

   Per source line: ordered, conv (made into an order), moved (challan / GRN), billed (direct), via (billed through a challan
   or GRN of this order), ret (returned), closed, pending = ordered - closed - conv - moved - billed - ret (never below 0).
   State of a source: open (nothing done), part, done (nothing pending), closed (closed short, nothing pending). */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function r3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function bizOf(d) { return key(d && d.seller && d.seller.name); }
  function partyKey(d) { return key(d && d.buyer && d.buyer.name); }
  function lineQty(it) { return it.qty === '' || it.qty == null ? 1 : num(it.qty); }
  function lineRate(it) { var r = num(it.rate); return r2(r - r * num(it.disc) / 100); }
  function linesOf(d) { return d.type === 'stk' ? (d.items && d.items.length ? d.items : d.lines || []) : d.items || []; }
  function lidOf(it, i) { return it && it.lid ? String(it.lid) : '#' + i; }

  var SALE_BILL = { invoice: 1, cashmemo: 1, expinv: 1, pharma: 1, jewel: 1, garment: 1 };
  /* what a record is for tracking: { src: 'order' | 'move' | '', fol: 'order' | 'move' | 'bill' | 'ret' | '', side: 'sale' | 'buy' } */
  function kindOf(d) {
    if (!d || d.cancelled) return null;
    var ty = d.type || 'invoice';
    if (ty === 'quote' || ty === 'proforma') return { src: 'order', fol: ty === 'proforma' ? 'order' : '', side: 'sale' };
    if (ty === 'so') return { src: 'order', fol: 'order', side: 'sale' };
    if (ty === 'po') return { src: 'order', fol: '', side: 'buy' };
    if (ty === 'challan') return d.kind === 'sale' || d.kind === 'approval' || !d.kind ? { src: 'move', fol: 'move', side: 'sale' } : null;
    if (ty === 'stk') {
      if (d.kind === 'grn') return { src: 'move', fol: 'move', side: 'buy' };
      if (d.kind === 'rejin') return { src: '', fol: 'ret', side: 'sale' };
      if (d.kind === 'rejout') return { src: '', fol: 'ret', side: 'buy' };
      return null;
    }
    if (SALE_BILL[ty] || (ty === 'exp' && Array.isArray(d.items) && d.seller && !d.app)) return { src: 'bill', fol: 'bill', side: 'sale' };   /* a bill is also a source for goods coming back (I-13) */
    if ((ty === 'pbill' && d.kind !== 'return') || ty === 'self') return { src: 'bill', fol: 'bill', side: 'buy' };
    return null;
  }
  /* which follower stage a source accepts, and which field of its line it fills */
  function fieldFor(srcK, folK) {
    if (srcK.src === 'order') return folK.fol === 'order' ? 'conv' : folK.fol === 'move' ? 'moved' : folK.fol === 'bill' ? 'billed' : '';
    if (srcK.src === 'move') return folK.fol === 'bill' ? 'billed' : folK.fol === 'ret' ? 'ret' : '';
    if (srcK.src === 'bill') return folK.fol === 'ret' ? 'ret' : '';   /* I-13: goods back / sent back against a bill */
    return '';
  }
  var DONE_ST = { inv: 1, sdone: 1, prec: 1 }, SHUT_ST = { dec: 1, scan: 1 };
  var STAGE = { order: 0, move: 1, bill: 2, ret: 3 };

  /* every source of a business (and, with party, of one party) with its lines worked out.
     o.today (for overdue), o.skip (id of a document being edited: its own lines do not count) */
  function track(docs, biz, o) {
    o = o || {};
    var b = key(biz), S = {}, list = [], fol = [];
    (docs || []).forEach(function (d) {
      if (!d || (b && bizOf(d) !== b)) return;
      var K = kindOf(d); if (!K) return;
      if (K.src && d.id) {
        var e = { id: d.id, d: d, k: K, side: K.side, lines: [] };
        linesOf(d).forEach(function (it, i) {
          var nm = String(it.desc || '').trim(); if (!nm) return;
          e.lines.push({ lid: lidOf(it, i), i: i, name: nm, k: key(nm), it: it, unit: it.unit || '', rate: lineRate(it), qty: r3(lineQty(it)),
            conv: 0, moved: 0, billed: 0, via: 0, ret: 0, closed: 0, due: it.due || d.deliv || d.valid || '' });
        });
        ((d.closed && d.closed.lines) || []).forEach(function (c) { var L = e.lines.filter(function (x) { return x.lid === String(c.lid); })[0]; if (L) L.closed = r3(L.closed + Math.abs(num(c.qty))); });
        S[d.id] = e; list.push(e);
      }
      if (K.fol && d.id !== o.skip) fol.push({ d: d, k: K });
    });
    var UP = {};   /* id|lid of a challan / GRN line -> the order line it came from */
    fol.sort(function (x, y) { return String(x.d.date || '').localeCompare(String(y.d.date || '')) || STAGE[x.k.fol] - STAGE[y.k.fol] || (x.d.created || 0) - (y.d.created || 0); });
    fol.forEach(function (F) {
      var d = F.d, refs = [];
      [d.fromId].concat((d.dnRef || []).map(function (r) { return r && (r.id || r); }), [].concat(d.grnRef || []).map(function (r) { return r && (r.id || r); }), [].concat(d.poRef || []).map(function (r) { return r && (r.id || r); }))
        .forEach(function (id) { if (id && S[id] && S[id].side === F.k.side && refs.indexOf(id) < 0 && id !== d.id) refs.push(id); });
      linesOf(d).forEach(function (it, li) {
        var q = lineQty(it); if (!(q > 0)) return;
        var hits = [];
        /* a line copied whole by a maker from its source keeps the source's own link (a challan made from an order made from a
           quotation): that link is the order's, not this document's, so it is matched through the document link instead */
        var up = it.src && d.fromId && d.fromId !== it.src.id && S[d.fromId] && S[d.fromId].lines.some(function (x) { return x.it.src && x.it.src.id === it.src.id && String(x.it.src.lid) === String(it.src.lid); });
        if (up) it = Object.assign({}, it, { src: null });
        if (it.src && it.src.id && S[it.src.id] && it.src.id !== d.id) {
          var E = S[it.src.id], f = fieldFor(E.k, F.k), L = f && E.lines.filter(function (x) { return x.lid === String(it.src.lid); })[0];
          if (L) hits.push([E, L, f, q]);
        } else if (!it.src) {
          var need = q, k = key(it.stk || it.desc);
          refs.forEach(function (id) {
            var E2 = S[id], f2 = fieldFor(E2.k, F.k); if (!f2 || !(need > 0)) return;
            E2.lines.forEach(function (L2) { if (!(need > 0) || L2.k !== k) return; var room = r3(L2.qty - L2.closed - done(L2)); if (room <= 0) return; var t = Math.min(room, need); need = r3(need - t); hits.push([E2, L2, f2, t]); });
          });
        }
        hits.forEach(function (h) {
          h[1][h[2]] = r3(h[1][h[2]] + h[3]);
          if (F.k.src === 'move' && d.id) UP[d.id + '|' + lidOf(it, li)] = { E: h[0], L: h[1] };
          if (h[2] === 'billed' && h[0].k.src === 'move') { var u = UP[h[0].id + '|' + h[1].lid]; if (u) u.L.via = r3(u.L.via + h[3]); }
          if (h[2] === 'ret' && h[0].k.src === 'move') { var u2 = UP[h[0].id + '|' + h[1].lid]; if (u2) u2.L.back = r3((u2.L.back || 0) + h[3]); }
        });
      });
    });
    var today = o.today || '';
    list.forEach(function (e) {
      var any = e.lines.some(function (L) { return done(L) > 0; }), st = e.d.status || '';
      e.lines.forEach(function (L) {
        if (!any && DONE_ST[st]) { L.hand = 1; L.handDone = r3(L.qty - L.closed); }
        else if (!any && SHUT_ST[st]) { L.hand = 1; L.closed = L.qty; }
        else if (!any && st === 'dret' && e.k.src === 'move') { L.hand = 1; L.ret = r3(L.qty - L.closed); }
        L.pending = r3(Math.max(0, L.qty - L.closed - done(L) - (L.handDone || 0)));
        L.value = r2(L.pending * L.rate);
        L.late = !!(L.pending > 0 && L.due && today && L.due < today);
      });
      e.ordered = r3(sum(e.lines, 'qty')); e.pending = r3(sum(e.lines, 'pending')); e.value = r2(sum(e.lines, 'value'));
      var gone = e.lines.some(function (L) { return done(L) > 0 || L.handDone; }), shut = e.lines.some(function (L) { return L.closed > 0; });
      e.state = e.pending <= 0.0005 ? (gone ? 'done' : shut ? 'closed' : 'done') : gone || shut ? 'part' : 'open';
      e.party = String(e.d.buyer && e.d.buyer.name || '').trim(); e.pkey = partyKey(e.d);
      e.due = e.lines.filter(function (L) { return L.pending > 0 && L.due; }).map(function (L) { return L.due; }).sort()[0] || '';
      e.late = e.lines.some(function (L) { return L.late; });
    });
    return { list: list, byId: S };
  }
  function done(L) { return r3(L.conv + L.moved + L.billed + L.ret); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + num(x[f]); }, 0); }

  /* sources whose open lines can go into a new document of kind `into`, and the stage each one accepts */
  var INTO = {
    sale: ['move', 'order'],          /* a sale bill: unbilled challans first, then orders */
    dn: ['order'],                    /* a delivery challan: sales orders, quotations */
    so: ['order'],                    /* a sales order: quotations, estimates */
    pbill: ['move', 'order'],         /* a purchase bill: unbilled receipt notes, then purchase orders */
    grn: ['order'],                   /* a receipt note: purchase orders */
    rejin: ['move', 'bill'],          /* goods back: challans (sale on approval), then sale bills of the last 180 days */
    rejout: ['move', 'bill']          /* goods sent back: receipt notes, then purchase bills of the last 180 days */
  };
  var SIDE = { sale: 'sale', dn: 'sale', so: 'sale', rejin: 'sale', pbill: 'buy', grn: 'buy', rejout: 'buy' };
  function okSrc0(e, into, today) {
    var t = e.d.type || 'invoice';
    if (into === 'so') return t === 'quote';
    if (into === 'dn') return t === 'so' || t === 'quote';
    if (into === 'grn') return t === 'po';
    if (e.k.src === 'bill') return !today || !e.d.date || (new Date(today + 'T00:00:00') - new Date(e.d.date + 'T00:00:00')) / 864e5 <= 180;
    return true;
  }
  function pickable(docs, biz, party, into, o) {
    o = o || {};
    var T = o.T || track(docs, biz, o), p = key(party), want = INTO[into] || [], side = SIDE[into];
    var today = o.today || '';
    function okSrc(e, into) { return okSrc0(e, into, today); }
    return T.list.filter(function (e) { return e.side === side && want.indexOf(e.k.src) >= 0 && okSrc(e, into) && e.pending > 0 && e.id !== o.skip && (!p || e.pkey === p); })
      .sort(function (a, b) { return want.indexOf(a.k.src) - want.indexOf(b.k.src) || String(a.d.date || '').localeCompare(String(b.d.date || '')); });
  }
  /* a new line made from a source line: the source's own details, qty = what is picked, it.src names the line */
  function lineFrom(e, L, qty) {
    var it = JSON.parse(JSON.stringify(L.it));
    delete it.lid; delete it.src; delete it.due;
    it.qty = r3(qty == null ? L.pending : qty);
    it.src = { id: e.id, lid: L.lid };
    return it;
  }
  /* lines of a source document saved without an own lid get one ('#<index>' while free, so older links keep working) */
  function ensureLids(d) {
    var L = linesOf(d), used = {};
    L.forEach(function (it) { if (it && it.lid) used[it.lid] = 1; });
    L.forEach(function (it, i) {
      if (!it || it.lid) return;
      var id = '#' + i;
      if (used[id]) { id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
      it.lid = id; used[id] = 1;
    });
    return d;
  }
  /* close the rest of some lines short: lines [{ lid, qty }] (qty = what will not come); returns the changed copy */
  function closeShort(d, date, lines) {
    var c = JSON.parse(JSON.stringify(d)), C = c.closed && Array.isArray(c.closed.lines) ? c.closed : { lines: [] };
    (lines || []).forEach(function (x) {
      var q = r3(num(x.qty)); if (!(q > 0)) return;
      var hit = C.lines.filter(function (y) { return String(y.lid) === String(x.lid); })[0];
      if (hit) hit.qty = r3(num(hit.qty) + q); else C.lines.push({ lid: String(x.lid), qty: q });
    });
    C.date = date || C.date || ''; c.closed = C;
    return c;
  }
  function reopen(d) { var c = JSON.parse(JSON.stringify(d)); delete c.closed; return c; }

  /* Order outstanding: one row per open order line. o.side 'sale' | 'buy', o.kinds (list of types, default so / po),
     o.from / o.to (order dates), o.party (key). Sorted overdue first, then by due date. */
  function outstanding(docs, biz, o) {
    o = o || {};
    var T = o.T || track(docs, biz, o), kinds = o.kinds || (o.side === 'buy' ? ['po'] : ['so']), rows = [];
    T.list.forEach(function (e) {
      if (o.side && e.side !== o.side) return;
      if (kinds.indexOf(e.d.type) < 0) return;
      if (o.from && e.d.date < o.from || o.to && e.d.date > o.to) return;
      if (o.party && e.pkey !== o.party) return;
      e.lines.forEach(function (L) {
        if (!(L.pending > 0) && !o.all) return;
        rows.push({ id: e.id, no: e.d.no || '', date: e.d.date || '', type: e.d.type, party: e.party, pkey: e.pkey, name: L.name, unit: L.unit, lid: L.lid,
          ordered: L.qty, done: r3(L.conv + L.moved + L.billed + (L.handDone || 0)), billed: r3(L.billed + L.via), closed: L.closed, pending: L.pending, rate: L.rate, value: L.value, due: L.due, late: L.late, state: e.state });
      });
    });
    return rows.sort(function (a, b) { return (b.late - a.late) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.date.localeCompare(b.date) || a.no.localeCompare(b.no); });
  }
  /* rows grouped by party or by item: [{ name, n, pending, value, late, rows }] */
  function groupBy(rows, by) {
    var M = {}, out = [];
    rows.forEach(function (r) {
      var id = by === 'item' ? key(r.name) : r.pkey || key(r.party);
      var g = M[id]; if (!g) { g = M[id] = { id: id, name: by === 'item' ? r.name : r.party, unit: by === 'item' ? r.unit : '', n: 0, pending: 0, value: 0, late: 0, rows: [] }; out.push(g); }
      g.n++; g.pending = r3(g.pending + r.pending); g.value = r2(g.value + r.value); g.late += r.late ? 1 : 0; g.rows.push(r);
    });
    return out.sort(function (a, b) { return b.late - a.late || b.value - a.value || a.name.localeCompare(b.name); });
  }
  /* challans / receipt notes not fully billed yet (Tally: "Sales / Purchase bills pending"); side 'sale' | 'buy'; o.kind 'approval' only */
  function unbilled(docs, biz, side, o) {
    o = o || {};
    var T = o.T || track(docs, biz, o), today = o.today || '';
    return T.list.filter(function (e) { return e.k.src === 'move' && e.side === side && e.pending > 0 && (!o.kind || (e.d.kind || 'sale') === o.kind); }).map(function (e) {
      return { id: e.id, no: e.d.no || '', date: e.d.date || '', kind: e.d.kind || '', party: e.party, pkey: e.pkey, pending: e.pending, value: e.value, state: e.state,
        days: today && e.d.date ? Math.max(0, Math.round((new Date(today + 'T00:00:00') - new Date(e.d.date + 'T00:00:00')) / 864e5)) : 0, e: e };
    }).sort(function (a, b) { return b.days - a.days || a.party.localeCompare(b.party); });
  }
  /* a one-line note for an entry screen: how many open sources the party has for this kind of document */
  function hint(docs, biz, party, into, o) {
    if (!key(party)) return null;
    var L = pickable(docs, biz, party, into, o);
    return L.length ? { n: L.length, lines: L.reduce(function (s, e) { return s + e.lines.filter(function (x) { return x.pending > 0; }).length; }, 0), list: L } : null;
  }

  var API = { kindOf: kindOf, track: track, pickable: pickable, lineFrom: lineFrom, ensureLids: ensureLids, closeShort: closeShort, reopen: reopen,
    outstanding: outstanding, groupBy: groupBy, unbilled: unbilled, hint: hint, lidOf: lidOf, linesOf: linesOf, INTO: INTO };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSOrders = API;
})(typeof window !== 'undefined' ? window : this);
