/* NSBiz custom fields and remembered values (ERP Round 2: beyond.md B-1, B-2, B-5, B-6; config-ux C-B1, C-B2, C-B3; accounting A-B0).
   One engine used by every screen that saves records (document makers, App entry screens and voucher screens, Masters, My data).

   Custom fields (the owner's or his customer's own fields, no developer needed):
     definitions  data home meta 'fields' = { v: 1, defs: [{ id, label, on: ['party' | 'item' | 'vt:<type>' | 'vt:*'], level: 'head' | 'line',
                  type: 'text' | 'num' | 'money' | 'date' | 'list' | 'yesno' | 'phone', opts: [...] (list), req (must be filled before save),
                  remember (text: earlier values offered again), print: 'meta' (heading grid) | 'foot' (above the signature) | 'none'
                  (line fields: 'note' printed under the item | 'none'), filter (a column and a filter in the registers and Excel),
                  carry (copied when a quotation becomes an order, challan or invoice; default yes), biz: [business ids] ([] = all),
                  off (no longer used: not asked any more, values already saved stay and print), order }] }.
                  Shared by every business (as the other masters); an id never changes, so renaming a label never loses a value.
     values       rec.cf = { <id>: value } on parties, items and every voucher; line.cf on item lines. Empty values are not stored;
                  numbers and amounts are numbers, dates YYYY-MM-DD, yes/no true/false.
     old fields   the document fields of My data › Settings (settings.cfields [{ id, label, types, print }], also per business) keep
                  working: they are read as text fields on those document types with the same ids, so the values saved in d.cf still
                  show and print (docmore.js leaves its own boxes to this file when it is on the page).
   Remembered values (NS.recall): data home meta 'recall' = { v: 1, k: { '<key>': [{ v, n (times used), t (last used), p: [party keys] }] } }.
     Learnt from every saved voucher (never from sample data, never from a draft): notes and terms of each document type, narration of
     receipts / payments / expenses / contra / journals, dispatched through, destination, ship-to address and city, custom text fields
     marked "remember". Offered in the same boxes next time (values used with this party first, then the most used and recent);
     × in the list or Masters › Remembered entries forgets one. Transporter, vehicle, driver and transporter ID keep their own masters
     (core.js NS.dispatch); nothing here learns them.
   Line and party strip (B-5, B-6): an item on a line shows its last 5 rates to (or from) this party, the last purchase rate and the stock
     in hand (tap a rate to use it); a party shows its balance, overdue amount with the oldest days, and the credit limit.
   Pure part (node, scripts/test_cfields.js): defs, clean, fmt, missing, carry, printRows, lineText, cols, match, uses, recall helpers.
   Screen words: NS.t('ufd.*'); the words the document makers and My data show are in every language pack. */
(function (G) {
  'use strict';
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function pad(n) { return String(n).padStart(2, '0'); }
  var TYPES = ['text', 'num', 'money', 'date', 'list', 'yesno', 'phone'];
  /* voucher types that take custom fields; those with item lines take line fields too */
  var VTS = ['invoice', 'cashmemo', 'quote', 'proforma', 'so', 'challan', 'po', 'note', 'self', 'expinv', 'pbill', 'receipt', 'voucher', 'exp', 'contra', 'jv', 'rent', 'salary', 'petty'];
  var KITS = ['pharma', 'resto', 'lr', 'fee', 'job', 'rabill', 'jewel', 'garment', 'hotel', 'visit', 'svc', 'gjob', 'pump', 'mandi', 'dairy', 'amc', 'rentb', 'subs', 'tsh'];   /* shop and trade tools (kit.js) */
  var LINES = { invoice: 1, cashmemo: 1, quote: 1, proforma: 1, so: 1, challan: 1, po: 1, note: 1, self: 1, expinv: 1, pbill: 1 };
  var OLD_TYPES = ['invoice', 'quote', 'proforma', 'so', 'challan', 'po', 'note', 'cashmemo', 'self'];
  var MAXH = 20, MAXL = 10;

  /* ---------- definitions ---------- */
  function legacy(S) {
    var out = [], seen = {};
    function add(list, biz) {
      (list || []).forEach(function (f) {
        if (!f || !f.id || !String(f.label || '').trim() || seen[f.id]) return; seen[f.id] = 1;
        out.push({ id: f.id, label: String(f.label).trim(), on: (f.types && f.types.length ? f.types : OLD_TYPES).map(function (t) { return 'vt:' + t; }), level: 'head', type: 'text',
          print: f.print ? 'meta' : 'none', carry: true, biz: biz ? [biz] : [], legacy: true });
      });
    }
    if (S) { add(S.cfields); Object.keys(S.byBiz || {}).forEach(function (b) { add(S.byBiz[b] && S.byBiz[b].cfields, b); }); }
    return out;
  }
  /* every definition: the data home's own plus the old document fields not moved yet */
  function all(meta, S) {
    var defs0 = (meta && meta.defs || []).filter(function (f) { return f && f.id && String(f.label || '').trim(); }), have = {};
    defs0.forEach(function (f) { have[f.id] = 1; });
    return defs0.concat(legacy(S).filter(function (f) { return !have[f.id]; }));
  }
  function onTarget(f, target) { var on = f.on || []; return on.indexOf(target) >= 0 || (target.indexOf('vt:') === 0 && on.indexOf('vt:*') >= 0 && (f.level !== 'line' || LINES[target.slice(3)])); }
  /* the fields of one target (party, item, vt:<type>) and level, in their order; withOff = also the ones no longer used */
  function defs(list, target, level, bizId, withOff) {
    return (list || []).filter(function (f) {
      return (withOff || !f.off) && (f.level || 'head') === (level || 'head') && onTarget(f, target) && (!f.biz || !f.biz.length || !bizId || f.biz.indexOf(bizId) >= 0);
    }).sort(function (a, b) { return (+a.order || 9999) - (+b.order || 9999) || String(a.label).localeCompare(String(b.label)); });
  }
  function vtOf(d) { return d && d.type || 'invoice'; }

  /* ---------- values ---------- */
  function clean(f, v) {
    var t = f && f.type || 'text';
    if (v == null) return undefined;
    if (t === 'yesno') { if (v === true || v === false) return v; var y = key(v); return /^(yes|y|true|1|haan|ha)$/.test(y) ? true : /^(no|n|false|0|nahi)$/.test(y) ? false : undefined; }
    var s = String(v).trim(); if (!s) return undefined;
    if (t === 'num' || t === 'money') { var n = parseFloat(s.replace(/[,₹\s]/g, '')); return isFinite(n) ? (t === 'money' ? Math.round(n * 100) / 100 : n) : undefined; }
    if (t === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s); return m ? m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) : undefined; }
    if (t === 'phone') { s = s.replace(/[^\d+\-\s]/g, '').trim(); return s || undefined; }
    return s.slice(0, 200);
  }
  /* one value into rec.cf (an empty one is removed; rec.cf goes when empty) */
  function setCf(rec, f, v) {
    var c = clean(f, v); rec.cf = rec.cf || {};
    if (c === undefined) delete rec.cf[f.id]; else rec.cf[f.id] = c;
    if (!Object.keys(rec.cf).length) delete rec.cf;
    return rec;
  }
  function fmt(f, v) {
    if (v == null || v === '') return '';
    var t = f && f.type || 'text';
    if (t === 'yesno') return v === true ? 'Yes' : v === false ? 'No' : '';
    if (t === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v).slice(8, 10) + '-' + String(v).slice(5, 7) + '-' + String(v).slice(0, 4);
    if (t === 'money') { var n = +v; return isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v); }
    return String(v);
  }
  /* labels of required fields left empty (a yes/no answered "No" is filled) */
  function missing(list, cf) { return (list || []).filter(function (f) { if (!f.req) return false; var v = cf && cf[f.id]; return v == null || v === ''; }).map(function (f) { return f.label; }); }
  /* required line fields on lines with an item: [{ line (1-based), label }] */
  function lineMissing(list, items) {
    var out = [];
    (items || []).forEach(function (it, i) { if (!String(it && it.desc || '').trim()) return; missing(list, it.cf).forEach(function (l) { out.push({ line: i + 1, label: l }); }); });
    return out;
  }
  /* the values that travel with a converted document: head fields of the new type marked carry (line values travel with the lines) */
  function carry(src, toType, list, bizId) {
    var out = {}, sc = src && src.cf || {};
    defs(list, 'vt:' + toType, 'head', bizId, true).forEach(function (f) { if (f.carry !== false && sc[f.id] != null && sc[f.id] !== '') out[f.id] = sc[f.id]; });
    return out;
  }
  /* printed rows of a document: [[label, value]] for its head fields printed at 'meta' (heading) or 'foot' */
  function printRows(d, list, bizId, where) {
    var cf = d && d.cf || {};
    return defs(list, 'vt:' + vtOf(d), 'head', bizId, true).filter(function (f) { return (f.print || 'meta') === (where || 'meta') && fmt(f, cf[f.id]) !== ''; })
      .map(function (f) { return [f.label, fmt(f, cf[f.id])]; });
  }
  /* "Size: XL · Lot: 7" under a printed item line */
  function lineText(it, d, list, bizId) {
    var cf = it && it.cf || {};
    return defs(list, 'vt:' + vtOf(d), 'line', bizId, true).filter(function (f) { return (f.print || 'note') !== 'none' && fmt(f, cf[f.id]) !== ''; })
      .map(function (f) { return f.label + ': ' + fmt(f, cf[f.id]); }).join(' · ');
  }
  /* "Buyer PO no.: PO/77; Site: Khanna": every head field of a voucher that holds a value (Tally narration) */
  function narr(d, list, bizId) { var cf = d && d.cf || {}; return defs(list, 'vt:' + vtOf(d), 'head', bizId, true).filter(function (f) { return fmt(f, cf[f.id]) !== ''; }).map(function (f) { return f.label + ': ' + fmt(f, cf[f.id]); }).join('; '); }
  /* the register columns of these targets (head fields marked filter), each once */
  function cols(list, targets, bizId) {
    var seen = {}, out = [];
    (targets || []).forEach(function (t) { defs(list, t, 'head', bizId, true).forEach(function (f) { if (f.filter && !seen[f.id]) { seen[f.id] = 1; out.push(f); } }); });
    return out;
  }
  function colsFor(list, docs, bizId) { var t = {}; (docs || []).forEach(function (d) { t['vt:' + vtOf(d)] = 1; }); return cols(list, Object.keys(t), bizId); }
  /* filters: { <id>: text (contains) | list value (equal) | 'yes' / 'no' | { from, to } (number or date range) } */
  function match(rec, filters, list) {
    var cf = rec && rec.cf || {};
    return Object.keys(filters || {}).every(function (id) {
      var q = filters[id]; if (q == null || q === '' || typeof q === 'object' && (q.from == null || q.from === '') && (q.to == null || q.to === '')) return true;
      var f = (list || []).filter(function (x) { return x.id === id; })[0] || { type: 'text' }, v = cf[id];
      if (f.type === 'yesno') return (v === true) === (q === true || q === 'yes');
      if (typeof q === 'object') {
        if (v == null || v === '') return false;
        var dt = f.type === 'date', a = dt ? String(v) : +v, lo = q.from == null || q.from === '' ? null : dt ? String(q.from) : +q.from, hi = q.to == null || q.to === '' ? null : dt ? String(q.to) : +q.to;
        return (lo === null || a >= lo) && (hi === null || a <= hi);
      }
      if (f.type === 'list') return key(v) === key(q);
      return key(fmt(f, v)).indexOf(key(q)) >= 0;
    });
  }
  /* how many saved records hold a value of this field (a field in use is never deleted, only marked "no longer used") */
  function uses(id, docs, parties, items) {
    var n = 0, has = function (c) { return c && c[id] != null && c[id] !== ''; };
    (docs || []).forEach(function (d) { if (has(d.cf) || (d.items || []).some(function (l) { return l && has(l.cf); })) n++; });
    (parties || []).concat(items || []).forEach(function (r) { if (has(r && r.cf)) n++; });
    return n;
  }
  function newId(list) { var id; do { id = 'f' + Math.random().toString(36).slice(2, 6); } while ((list || []).some(function (f) { return f.id === id; })); return id; }
  /* a definition as typed on the screen, made safe */
  function tidy(f) {
    var o = { id: f.id, label: String(f.label || '').trim().slice(0, 30), on: (f.on || []).filter(Boolean), level: f.level === 'line' ? 'line' : 'head', type: TYPES.indexOf(f.type) >= 0 ? f.type : 'text' };
    if (o.type === 'list') o.opts = (Array.isArray(f.opts) ? f.opts : String(f.opts || '').split(/[\n,]+/)).map(function (x) { return String(x).trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 60);
    if (f.req) o.req = true;
    if (o.type === 'text' && f.remember !== false) o.remember = true;
    o.print = o.level === 'line' ? (f.print === 'none' ? 'none' : 'note') : (f.print === 'foot' || f.print === 'none' ? f.print : 'meta');
    if (f.filter) o.filter = true;
    o.carry = f.carry !== false;
    if (f.last && o.level === 'head') o.last = true;
    o.biz = (f.biz || []).filter(Boolean);
    if (f.off) o.off = true;
    o.order = +f.order || 0;
    if (o.level === 'line') o.on = o.on.filter(function (t) { return t === 'vt:*' || t.indexOf('vt:') === 0 && LINES[t.slice(3)]; });
    return o;
  }
  /* what is wrong with a definition before it is saved: '' = fine */
  function invalid(f, list) {
    if (!f.label) return 'label';
    if (!f.on.length) return 'on';
    if (f.type === 'list' && !(f.opts || []).length) return 'opts';
    if ((list || []).some(function (x) { return x.id !== f.id && key(x.label) === key(f.label) && x.level === f.level && x.on.some(function (t) { return f.on.indexOf(t) >= 0; }); })) return 'dup';
    var max = f.level === 'line' ? MAXL : MAXH;
    if (f.on.some(function (t) { return defs(list, t, f.level).filter(function (x) { return x.id !== f.id; }).length >= max; })) return 'max';
    return '';
  }

  /* ---------- remembered values (pure) ---------- */
  var RC_MAX = 200;
  var AUTO = /^(payment against bill|payment on account|part advance|goods on credit|depreciation for fy|receipt against|opening balance)/i;
  function rcVal(k, v) {
    v = String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim();
    if (!v || v.length > 400 || AUTO.test(v)) return '';
    if (/^km:/.test(k)) return /^\d{1,4}$/.test(v) && +v > 0 ? v : '';   /* e-way bill distance of a PIN pair: the one number kept */
    if (/^\d[\d,.\s]*$/.test(v)) return '';   /* never an amount */
    if (/^narr:/.test(k) && (/\b\d{2}[A-Z]{5}\d{4}[A-Z]\w{3}\b/.test(v) || /(^|\D)\d{10}(\D|$)/.test(v))) return '';   /* nor a GSTIN or phone number inside a narration */
    return v;
  }
  function score(x, now) { return (x.n || 1) / (1 + Math.max(0, (now || 0) - (x.t || 0)) / 864e5 / 30); }
  /* docId: the record that taught it; the same record saved again (edited, marked paid, converted) is not counted twice */
  function rcAdd(R, k, v, party, now, docId) {
    v = rcVal(k, v); if (!v) return false;
    R.v = 1; R.k = R.k || {};
    var L = R.k[k] = R.k[k] || [], x = L.filter(function (y) { return key(y.v) === key(v); })[0];
    if (x && docId && (x.d || []).indexOf(docId) >= 0) { x.v = v; x.t = now; return true; }
    if (x) { x.v = v; x.n = (x.n || 0) + 1; x.t = now; } else L.push(x = { v: v, n: 1, t: now });
    if (docId) x.d = [docId].concat((x.d || []).filter(function (i) { return i !== docId; })).slice(0, 3);
    if (party) { x.p = (x.p || []).filter(function (p) { return p !== party; }); x.p.unshift(party); x.p = x.p.slice(0, 5); }
    if (L.length > RC_MAX) { L.sort(function (a, b) { return score(b, now) - score(a, now); }); L.length = RC_MAX; }
    return true;
  }
  /* values of one key in the order they are offered: used with this party first, then by use and recency; q narrows (contains) */
  function rcList(R, k, party, now, q, n) {
    var L = (R && R.k && R.k[k] || []).filter(function (x) { return !q || key(x.v).indexOf(key(q)) >= 0; }).slice();
    L.sort(function (a, b) { var pa = party && (a.p || []).indexOf(party) >= 0 ? 1 : 0, pb = party && (b.p || []).indexOf(party) >= 0 ? 1 : 0; return pb - pa || score(b, now) - score(a, now); });
    return L.slice(0, n || 8).map(function (x) { return x.v; });
  }
  function rcForget(R, k, v) {
    if (!R || !R.k || !R.k[k]) return;
    if (v == null) delete R.k[k];
    else { R.k[k] = R.k[k].filter(function (x) { return key(x.v) !== key(v); }); if (!R.k[k].length) delete R.k[k]; }
  }
  /* "start with the last value": the value on this party's newest voucher of the same type (not the one being changed) */
  function lastValue(docs, vt, party, id, notId) {
    var k = key(party), best = null;
    (docs || []).forEach(function (d) {
      if (d.id === notId || d.cancelled || vtOf(d) !== vt || key(d.buyer && d.buyer.name) !== k || !d.cf || d.cf[id] == null || d.cf[id] === '') return;
      if (!best || String(d.date) > String(best.date) || d.date === best.date && (d.created || 0) > (best.created || 0)) best = d;
    });
    return best ? best.cf[id] : undefined;
  }
  /* the e-way bill distance is asked for every bill: kept per (from PIN, to PIN), from = our PIN, to = ship-to PIN or the buyer's (B-3) */
  function kmKey(d) { var a = String(d && d.seller && d.seller.pin || '').replace(/\D/g, ''), b = String(d && (d.ship && d.ship.pin || d.buyer && d.buyer.pin) || '').replace(/\D/g, ''); return /^\d{6}$/.test(a) && /^\d{6}$/.test(b) ? 'km:' + a + '-' + b : ''; }
  /* what a saved record teaches: [[key, value]] */
  function rcFrom(d, list) {
    if (!d || d.sample) return [];
    var ty = vtOf(d), out = [], add = function (k, v) { v = rcVal(k, v); if (v) out.push([k, v]); };
    if (LINES[ty]) { add('notes:' + ty, d.notes); add('terms:' + ty, d.terms); }
    if (d.disp) { add('disp.through', d.disp.through); add('disp.dest', d.disp.dest); }
    if (d.ship) { add('ship.addr', d.ship.addr); add('ship.city', d.ship.city); }
    var kk = kmKey(d); if (kk && d.einv) add(kk, d.einv.dist);
    if (ty === 'receipt') add('narr:receipt', d.purpose);
    if (ty === 'voucher') add('narr:voucher', d.lines && d.lines[0] && d.lines[0].desc);
    if (ty === 'exp' || ty === 'contra') add('narr:' + ty, d.notes);
    if (ty === 'jv') add('narr:jv', d.narr);
    (list || []).forEach(function (f) {
      if (!f.remember || (f.type || 'text') !== 'text') return;
      if (f.level === 'line') (d.items || []).forEach(function (l) { if (l && l.cf) add('cf:' + f.id, l.cf[f.id]); });
      else if (d.cf) add('cf:' + f.id, d.cf[f.id]);
    });
    return out;
  }

  var PURE = { key: key, TYPES: TYPES, VTS: VTS, LINES: LINES, legacy: legacy, all: all, defs: defs, clean: clean, setCf: setCf, fmt: fmt, missing: missing, lineMissing: lineMissing,
    carry: carry, narr: narr, printRows: printRows, lineText: lineText, cols: cols, colsFor: colsFor, match: match, uses: uses, newId: newId, tidy: tidy, invalid: invalid,
    KITS: KITS, rcVal: rcVal, rcAdd: rcAdd, rcList: rcList, rcForget: rcForget, rcFrom: rcFrom, kmKey: kmKey, lastValue: lastValue, MAXH: MAXH, MAXL: MAXL };
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; return; }
  if (!G.NS) return;

  /* =================================================================== browser part =================================================================== */
  var NS = G.NS, $ = NS.$, $$ = NS.$$, esc = NS.esc;
  function T(k, v) { return NS.t('ufd.' + k, v); }
  var ALL = [], META = null, SETS = null, DOCS = [], PARTIES = [], ITEMS = [], loaded = null;
  function load() {
    if (!G.NSStore) return Promise.resolve();
    return (loaded = Promise.all([NSStore.meta('fields'), NSStore.meta('settings')]).then(function (r) { META = r[0] || { v: 1, defs: [] }; SETS = r[1] || {}; var was = sig(); ALL = all(META, SETS); if (mbox && api && sig() !== was) mDraw(); }, function () {}));
  }
  function sig() { return ALL.map(function (f) { return f.id + (f.off ? '-' : '') + f.label + f.type; }).join('|'); }   /* the maker's box is drawn again only when the fields changed */
  var dataAsk = null;
  function loadData() {
    if (!G.NSStore) return Promise.resolve();
    return (dataAsk = Promise.all([NSStore.list('doc'), NSStore.list('party'), NSStore.list('item')]).then(function (r) { DOCS = r[0] || []; PARTIES = r[1] || []; ITEMS = r[2] || []; }, function () {}));
  }
  var reTimer = 0;
  function refresh() { clearTimeout(reTimer); reTimer = setTimeout(function () { load(); loadData(); }, 400); }
  ['ns-data', 'ns-saved'].forEach(function (ev) { document.addEventListener(ev, refresh); });
  window.addEventListener('focus', refresh);

  function bizIdOf(seller) { try { return NS.bizIdOf ? NS.bizIdOf(seller) : ''; } catch (e) { return ''; } }
  function appBiz() { var A = G.NSApp; return A && A.biz && A.biz() ? A.biz().id || '' : ''; }

  /* ---------- input boxes ---------- */
  function control(f, v, id, attrs) {
    var t = f.type || 'text', a = ' id="' + id + '"' + (attrs || '') + (f.req ? ' aria-required="true"' : '');
    if (t === 'list') return '<select' + a + '><option value=""></option>' + (f.opts || []).concat(v && (f.opts || []).indexOf(v) < 0 ? [v] : []).map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    if (t === 'yesno') return '<select' + a + '><option value=""></option><option value="yes"' + (v === true ? ' selected' : '') + '>' + esc(T('yes')) + '</option><option value="no"' + (v === false ? ' selected' : '') + '>' + esc(T('no')) + '</option></select>';
    var val = v == null ? '' : String(v);
    if (t === 'date') return '<input type="date"' + a + ' value="' + esc(val) + '">';
    if (t === 'num' || t === 'money') return '<input' + a + ' inputmode="decimal" dir="ltr" autocomplete="off" value="' + esc(val) + '">';
    if (t === 'phone') return '<input type="tel"' + a + ' inputmode="tel" dir="ltr" autocomplete="off" value="' + esc(val) + '">';
    return '<input' + a + ' dir="auto" autocomplete="off" maxlength="200" value="' + esc(val) + '"' + (f.remember ? ' data-recall="cf:' + esc(f.id) + '"' : '') + '>';
  }
  /* head fields as the .f boxes every form uses (Enter goes to the next one) */
  function inputs(list, cf, pfx) {
    cf = cf || {};
    return list.map(function (f) {
      var id = pfx + f.id;
      return '<div class="f cf-f"><label for="' + id + '">' + esc(f.label) + (f.req ? ' *' : '') + '</label>' + control(f, cf[f.id], id, ' data-cfid="' + esc(f.id) + '"') + '</div>';
    }).join('');
  }
  function readBox(root, list) {
    var o = {};
    list.forEach(function (f) { var el = root && root.querySelector('[data-cfid="' + f.id + '"]'); if (el) setCf(o, f, el.value); });
    return o.cf || {};
  }

  /* ---------- party and item masters (Masters forms, My data forms) ---------- */
  function formHtml(target, rec) {
    var L = defs(ALL, target, 'head', '');
    if (!L.length) return '';
    return '<fieldset class="card cf-box" data-cfbox="' + target + '"><legend>' + esc(T('box')) + '</legend><div class="fg">' + inputs(L, rec && rec.cf, 'mcf-') + '</div></fieldset>';
  }
  /* reads the boxes into rec.cf (fields of other targets stay); a required field left empty is said, not blocked */
  function formRead(target, root, rec) {
    var box = root && root.querySelector('[data-cfbox="' + target + '"]'); if (!box) return true;
    var L = defs(ALL, target, 'head', ''), got = readBox(box, L), cf = Object.assign({}, rec.cf || {});
    L.forEach(function (f) { if (got[f.id] != null) cf[f.id] = got[f.id]; else delete cf[f.id]; });
    if (Object.keys(cf).length) rec.cf = cf; else delete rec.cf;
    var miss = missing(L, rec.cf); if (miss.length) NS.toast(T('need', { f: miss.join(', ') }), 'bad');
    return true;
  }
  /* My data (vault/my.js) party and item forms */
  (NS.hubExt = NS.hubExt || []).push({
    form: function (s, r) { return s === 'party' || s === 'item' ? formHtml(s, r) : ''; },
    read: function (s, r, f) { if (s === 'party' || s === 'item') formRead(s, f, r); }
  });

  /* ---------- document makers (docs.js through NS.docExt) ---------- */
  var api = null, mbox = null;
  function mType() { return api ? vtOf(api.doc()) : ''; }
  function mBiz() { return api ? bizIdOf(api.doc().seller) : ''; }
  function mHead() { return api ? defs(ALL, 'vt:' + mType(), 'head', mBiz()) : []; }
  function mLine() { return api && LINES[mType()] ? defs(ALL, 'vt:' + mType(), 'line', mBiz()) : []; }
  function mDraw() {
    if (!mbox) return;
    var L = mHead(); mbox.hidden = !L.length;
    $('.fg', mbox).innerHTML = inputs(L, api.doc().cf, 'dcf-');
  }
  NS.docExt = NS.docExt || [];
  var DX = {
    editor: function (_, A) { api = A; return '<fieldset class="card cf-box" id="cf-mbox" hidden><legend>' + esc(T('box')) + '</legend><div class="fg"></div></fieldset>'; },
    wire: function (ed) {
      mbox = $('#cf-mbox', ed); if (!mbox) return;
      mDraw();
      var on = function (e) {
        var el = e.target, id = el.getAttribute && el.getAttribute('data-cfid'); if (!id) return;
        var f = ALL.filter(function (x) { return x.id === id; })[0]; if (!f) return;
        e.stopPropagation(); setCf(api.doc(), f, el.value); api.changed();
      };
      mbox.addEventListener('input', on, true); mbox.addEventListener('change', on, true);
    },
    fill: function () { mDraw(); },
    sheet: function (d) {
      var rows = printRows(d, ALL, bizIdOf(d.seller), 'meta'), h = '';
      for (var i = 0; i < rows.length; i += 2) h += '<tr><th>' + esc(rows[i][0]) + '</th><td' + (rows[i + 1] ? '' : ' colspan="3"') + '>' + esc(rows[i][1]) + '</td>' + (rows[i + 1] ? '<th>' + esc(rows[i + 1][0]) + '</th><td>' + esc(rows[i + 1][1]) + '</td>' : '') + '</tr>';
      var foot = printRows(d, ALL, bizIdOf(d.seller), 'foot');
      return (h ? '<table class="meta cf-meta">' + h + '</table>' : '') + (foot.length ? '<p class="cf-foot">' + foot.map(function (r) { return '<b>' + esc(r[0]) + ':</b> ' + esc(r[1]); }).join(' &nbsp; ') + '</p>' : '');
    },
    line: function (o) {
      var L = mLine(); if (!L.length) return '';
      var it = o.it, i = o.i;
      return L.map(function (f) { var id = 'it-cf' + f.id + '-' + i; return '<div class="f it-x cf-f"><label for="' + id + '">' + esc(f.label) + (f.req ? ' *' : '') + '</label>' + control(f, (it.cf || {})[f.id], id, ' data-lcf="' + esc(f.id) + '"') + '</div>'; }).join('');
    },
    lineNote: function (it) { var s = api ? lineText(it, api.doc(), ALL, mBiz()) : ''; return s ? '<br><small class="ln-x cf-ln">' + esc(s) + '</small>' : ''; },
    block: function (d) {
      var head = missing(defs(ALL, 'vt:' + vtOf(d), 'head', bizIdOf(d.seller)), d.cf);
      if (head.length) return T('need', { f: head.join(', ') });
      var ln = LINES[vtOf(d)] ? lineMissing(defs(ALL, 'vt:' + vtOf(d), 'line', bizIdOf(d.seller)), d.items) : [];
      return ln.length ? T('needl', { n: ln[0].line, f: ln[0].label }) : '';
    }
  };
  NS.docExt.push(DX);
  /* the same pieces for slip.js (receipt, payment voucher, rent receipt, salary slip, petty cash): head fields only */
  function slipEditor(A) { return DX.editor(null, A); }
  function slipPrint(d, html) { var x = DX.sheet(d); if (!x) return html; var i = html.lastIndexOf('<div class="signs'); return i < 0 ? html.replace(/<\/div>\s*$/, x + '</div>') : html.slice(0, i) + '<div class="cf-slip">' + x + '</div>' + html.slice(i); }
  /* a line value typed in a maker: into that line's cf (before docs.js reads the event) */
  document.addEventListener('input', lcf, true); document.addEventListener('change', lcf, true);
  function lcf(e) {
    var el = e.target, id = el && el.getAttribute && el.getAttribute('data-lcf'), row = id && el.closest('.it[data-i]'); if (!row || !api) return;
    var f = ALL.filter(function (x) { return x.id === id; })[0], it = api.doc().items[+row.getAttribute('data-i')]; if (!f || !it) return;
    e.stopPropagation(); setCf(it, f, el.value); api.changed();
  }

  /* ---------- the App's entry screens (app.js openForm) ---------- */
  var APPVT = '', PEND = null, APPREC = '';
  var APPK = { sale: 'invoice', pbill: 'pbill', pret: 'pbill', min: 'receipt', mout: 'voucher', exp: 'exp', contra: 'contra', csale: 'cashmemo' };
  function appVt(kind, F) { return APPK[kind] || (kind === 'vdoc' && F && F.vd ? (F.vd.ty === 'exp' ? 'expinv' : F.vd.ty) : ''); }
  function appHead(vt) { return defs(ALL, 'vt:' + vt, 'head', appBiz()); }
  function appLineDefs() { return LINES[APPVT] ? defs(ALL, 'vt:' + APPVT, 'line', appBiz()) : []; }
  function appBoxHtml(vt, cf) {
    var L = appHead(vt);
    return (L.length ? '<legend>' + esc(T('box')) + '</legend><div class="fg">' + inputs(L, cf, 'fcf-') + '</div>' : '') +
      '<p class="cf-add"><button type="button" class="link" data-cfnew="vt:' + esc(vt) + '">+ ' + esc(T('addf')) + '</button></p>';
  }
  /* the head fields of this voucher type (and a link to make a new one) at the end of the form */
  function appBlock(kind, F, rec) {
    var vt = appVt(kind, F); APPVT = vt; PEND = null; APPREC = rec && rec.id || '';
    if (!vt) return '';
    return '<fieldset class="cf-box' + (appHead(vt).length ? '' : ' cf-empty') + '" data-cfbox="vt:' + esc(vt) + '">' + appBoxHtml(vt, rec && rec.cf) + '</fieldset>';
  }
  /* on Save: required fields are checked and the values wait for the voucher being saved (NSStore.put below) */
  function appTake(form, F) {
    PEND = null;
    var box = form && form.querySelector('[data-cfbox^="vt:"]'); if (!box) return true;
    var vt = box.getAttribute('data-cfbox').slice(3), L = appHead(vt), cf = readBox(box, L), miss = missing(L, cf);
    if (miss.length) { NS.toast(T('need', { f: miss.join(', ') }), 'bad'); var f0 = box.querySelector('[data-cfid="' + L.filter(function (f) { return f.label === miss[0]; })[0].id + '"]'); if (f0) f0.focus(); return false; }
    var LL = appLineDefs(), lines = F && F.lines ? F.lines.map(function (L0) { return { desc: L0.desc, cf: lineCf(L0) }; }) : [], lm = lineMissing(LL, lines);
    if (lm.length) { NS.toast(T('needl', { n: lm[0].line, f: lm[0].label }), 'bad'); return false; }
    PEND = { type: vt, cf: cf, ids: L.map(function (f) { return f.id; }), at: Date.now() };
    return true;
  }
  function lineCf(L) {
    var cf = Object.assign({}, L.cf || {});
    appLineDefs().forEach(function (f) { var k = 'cf.' + f.id; if (k in L) { var o = {}; setCf(o, f, L[k]); if (o.cf) cf[f.id] = o.cf[f.id]; else delete cf[f.id]; } });
    return Object.keys(cf).length ? cf : null;
  }
  /* the App's item grid: line fields after batch / serial (more.js lineX), saved into line.cf (lineCopy) */
  function appLines() {
    var A = G.NSApp; if (!A || A._cfl) return; A._cfl = 1;
    var x0 = A.lineX, c0 = A.lineCopy;
    A.lineX = function (L, i, c) {
      var h = x0 ? x0(L, i, c) || '' : '', LD = appLineDefs();
      if (!LD.length) return h;
      return h + LD.map(function (f) {
        var k = 'cf.' + f.id; if (!(k in L)) L[k] = L.cf && L.cf[f.id] != null ? (f.type === 'yesno' ? (L.cf[f.id] ? 'yes' : 'no') : L.cf[f.id]) : '';
        var v = f.type === 'yesno' ? clean(f, L[k]) : L[k];
        return '<label class="lc lc-cf"><span>' + esc(f.label) + (f.req ? ' *' : '') + '</span>' + control(f, v, 'lcf-' + f.id + '-' + i, ' data-li="' + i + '" data-lk="' + esc(k) + '"') + '</label>';
      }).join('');
    };
    A.lineCopy = function (L, it) { var r = c0 ? c0(L, it) : it; var cf = lineCf(L); if (cf) r.cf = cf; else delete r.cf; return r; };
  }
  /* the values of the form go on the voucher it saves (one put; the receipt / payment saved with it keeps its own) */
  function wrapStore() {
    if (!G.NSStore || NSStore._cfw) return; NSStore._cfw = 1;
    var put0 = NSStore.put;
    NSStore.put = function (store, obj) {
      if (store === 'doc' && obj && PEND && Date.now() - PEND.at < 20000 && vtOf(obj) === PEND.type) {
        var cf = Object.assign({}, obj.cf || {}); PEND.ids.forEach(function (id) { delete cf[id]; }); Object.assign(cf, PEND.cf);
        if (Object.keys(cf).length) obj.cf = cf; else delete obj.cf;
        PEND = null;
      }
      return put0.apply(this, arguments).then(function (r) { try { if (store === 'doc') learn(r && r.id ? r : obj); } catch (e) {} return r; });
    };
  }
  wrapStore();

  /* ---------- carry along a conversion (docs.js fromQuote, vdocs.js convert / toSale) ---------- */
  function carryInto(src, dst, toType, bizId) {
    var c = carry(src, toType || vtOf(dst), ALL, bizId == null ? bizIdOf(dst.seller) : bizId);
    if (Object.keys(c).length) dst.cf = Object.assign({}, dst.cf || {}, c);
    return dst;
  }

  /* ---------- remembered values: learning, offering, forgetting ---------- */
  var RQ = [], rTimer = 0, RC = null;
  function partyKey(d) { var n = d && (d.buyer && d.buyer.name || d.payer || d.lender) || ''; return n ? 'p:' + key(n) : ''; }
  function learn(d) {
    var pairs = rcFrom(d, ALL); if (!pairs.length) return;
    var p = partyKey(d), now = Date.now();
    pairs.forEach(function (x) { RQ.push([x[0], x[1], p, now, d.id || '']); });
    clearTimeout(rTimer); rTimer = setTimeout(flush, 2000);
  }
  function rcEdit(fn) { return NSStore.meta('recall').then(function (R) { R = R && R.k ? R : { v: 1, k: {} }; fn(R); RC = R; return NSStore.meta('recall', R).then(function () { return R; }); }); }
  function flush() { if (!RQ.length || !G.NSStore) return; var q = RQ; RQ = []; rcEdit(function (R) { q.forEach(function (x) { rcAdd(R, x[0], x[1], x[2], x[3], x[4]); }); }).catch(function () {}); }
  window.addEventListener('pagehide', flush);
  function rcGet(fresh) { if (RC && !fresh) return Promise.resolve(RC); return G.NSStore ? NSStore.meta('recall').then(function (R) { RC = R && R.k ? R : { v: 1, k: {} }; return RC; }, function () { return RC || { v: 1, k: {} }; }) : Promise.resolve({ k: {} }); }
  document.addEventListener('ns-data', function () { RC = null; });
  /* which remembered list a box takes, by its id (the boxes of docs.js, slip.js and the App) or its data-recall */
  function rcKeyOf(el) {
    if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.type === 'date' || el.type === 'checkbox') return '';
    var r = el.getAttribute('data-recall'); if (r) return r;
    var id = el.id || '';
    if (id === 'd-notes' || id === 'f-vnotes') return 'notes:' + (api && $('#d-notes') === el ? mType() : APPVT || 'invoice');
    if (id === 'd-terms') return 'terms:' + (api ? mType() : 'invoice');
    if (/^(dp|f-dp)-?through$/.test(id)) return 'disp.through';
    if (/^(dp|f-dp)-?dest$/.test(id)) return 'disp.dest';
    if (/^(sh-addr|f-shaddr)$/.test(id)) return 'ship.addr';
    if (/^(sh-city|f-shcity)$/.test(id)) return 'ship.city';
    if (id === 'f-note' && /^(receipt|voucher|exp|contra)$/.test(APPVT) && el.closest('#app-form')) return 'narr:' + APPVT;
    if (id === 'jv-narr') return 'narr:jv';
    if (id === 'ei-dist' && api) return kmKey(api.doc());
    return '';
  }
  function ctxParty(el) {
    var box = el.closest('form,dialog,#tool,.tool') || document, p = box.querySelector('#f-party,#b-name');
    return p && p.value.trim() ? 'p:' + key(p.value) : '';
  }
  var pop = null, popFor = null;
  function popClose() { if (pop) { pop.remove(); pop = null; popFor = null; } }
  function popShow(el) {
    var k = rcKeyOf(el); if (!k) return;
    rcGet().then(function (R) {
      if (document.activeElement !== el) return;
      var L = rcList(R, k, ctxParty(el), Date.now(), el.value.length > 1 && el.value.length < 60 ? el.value : '', 8).filter(function (v) { return v !== el.value; });
      if (!L.length) { if (popFor === el) popClose(); return; }
      if (!pop || popFor !== el) {
        popClose();
        pop = document.createElement('div'); pop.className = 'rc-pop'; pop.setAttribute('role', 'listbox'); popFor = el;
        var host = el.parentNode; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(pop);
        pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
        pop.addEventListener('click', function (e) {
          var x = e.target.closest('[data-rcx]'), u = e.target.closest('[data-rcv]'), K = rcKeyOf(el);
          if (x) { var v0 = x.getAttribute('data-rcx'); rcEdit(function (R2) { rcForget(R2, K, v0); }).then(function () { popShow(el); }); return; }
          if (u) { el.value = u.getAttribute('data-rcv'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); popClose(); }
        });
      }
      pop.innerHTML = '<p class="rc-h">' + esc(T('recent')) + '</p>' + L.map(function (v) {
        return '<div class="rc-row" role="option"><button type="button" class="rc-v" data-rcv="' + esc(v) + '">' + esc(v.length > 90 ? v.slice(0, 88) + '…' : v) + '</button><button type="button" class="rc-x" data-rcx="' + esc(v) + '" title="' + esc(T('forget')) + '" aria-label="' + esc(T('forget')) + '">×</button></div>';
      }).join('');
    });
  }
  document.addEventListener('focusin', function (e) { if (rcKeyOf(e.target)) popShow(e.target); else if (pop && !pop.contains(e.target)) popClose(); });
  document.addEventListener('input', function (e) { if (popFor === e.target) popShow(e.target); });
  document.addEventListener('focusout', function (e) { if (pop && (popFor === e.target || pop.contains(e.target))) setTimeout(function () { var a = document.activeElement; if (popFor && a !== popFor && !(pop && pop.contains(a))) popClose(); }, 150); });
  /* keys: Down from the box goes into the list, Up / Down move in it, Enter picks, Delete forgets, Esc goes back to the box */
  document.addEventListener('keydown', function (e) {
    if (!pop) return;
    var inBox = popFor === e.target, inPop = pop.contains(e.target), vs = $$('.rc-v', pop), i = vs.indexOf(e.target);
    if (!inBox && !inPop) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (inPop) popFor.focus(); else popClose(); return; }
    if (e.key === 'ArrowDown' && vs.length && (inBox || i >= 0)) { e.preventDefault(); e.stopPropagation(); vs[inBox ? 0 : Math.min(vs.length - 1, i + 1)].focus(); return; }
    if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); e.stopPropagation(); if (i === 0) popFor.focus(); else vs[i - 1].focus(); return; }
    if (e.key === 'Delete' && i >= 0) { e.preventDefault(); e.stopPropagation(); var x = e.target.parentNode.querySelector('.rc-x'); if (x) x.click(); popFor.focus(); return; }
    if (e.key === 'Enter' && i >= 0) { e.preventDefault(); e.stopPropagation(); var el = popFor; e.target.click(); if (el) el.focus(); }
  }, true);
  NS.recall = {
    learn: learn, flush: flush, get: rcGet, edit: rcEdit,
    offer: function (input, k) { if (input) input.setAttribute('data-recall', k); },
    forget: function (k, v) { return rcEdit(function (R) { rcForget(R, k, v); }); }
  };

  /* ---------- line and party strip (B-5, B-6) ---------- */
  function money(v) { return NS.money ? NS.money(v) : String(v); }
  function shortDate(iso) { try { return NS.fmtDate ? NS.fmtDate(iso) : iso; } catch (e) { return iso; } }
  function stockOf(desc, biz) {
    try {
      if (!G.NSStock || !NSStock.summary) return null;
      var s = NSStock.summary(DOCS, ITEMS, biz, '', NS.today()).items.filter(function (x) { return key(x.name) === key(desc); })[0];
      return s ? { q: s.close, unit: s.unit || '' } : null;
    } catch (e) { return null; }
  }
  /* where the line is and what the screen is: maker (docs.js) or App form */
  function lineCtx(el) {
    var row = el.closest('.it[data-i]');
    if (row && api && row.closest('#items')) {
      var d = api.doc(), it = d.items[+row.getAttribute('data-i')], ty = mType();
      return it && { row: row, at: row, desc: it.desc, party: d.buyer && d.buyer.name, biz: d.seller && d.seller.name, buy: ty === 'po' || ty === 'self' || ty === 'note' && d.side === 'purchase',
        rate: function (v) { var r = $('#it-rate-' + row.getAttribute('data-i'), row); if (r) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); } } };
    }
    var line = el.closest('#app-form .line[data-row]'), A = G.NSApp;
    if (line && A) {
      var form = line.closest('form'), dk = (form.closest('dialog') || {}).getAttribute ? form.closest('dialog').getAttribute('data-kind') : '', dsc = line.querySelector('[data-lk="desc"]'), pl = $('label[for="f-party"]', form), pi = $('#f-party', form);
      return dsc && { row: line, at: line, desc: dsc.value, party: pi ? pi.value : '', biz: A.bizName ? A.bizName() : '', buy: /^(pbill|pret)$/.test(dk) || dk === 'vdoc' && !!pl && A.T && pl.textContent === A.T('supp'),
        rate: function (v) { var r = line.querySelector('[data-lk="rate"]'); if (r) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); } } };
    }
    return null;
  }
  var strip = null, stripFor = null;
  function stripHide() { if (strip) { strip.remove(); strip = null; stripFor = null; } }
  function lineStrip(el) {
    var c = lineCtx(el); if (!c || !String(c.desc || '').trim() || !G.NSReuse) { stripHide(); return; }
    var R = G.NSReuse, hist = c.party ? R.rateHistory(DOCS, c.biz, c.party, c.desc, c.buy ? 'buy' : 'sale', 5) : [], lp = R.lastPurchase(DOCS, c.biz, c.desc), st = stockOf(c.desc, c.biz), bits = [];
    if (hist.length) bits.push('<span class="cs-l">' + esc(T(c.buy ? 's_lastb' : 's_last')) + ':</span> ' + hist.map(function (h) { return '<button type="button" class="link cs-r" data-csrate="' + h.rate + '" title="' + esc(T('s_use')) + '">' + esc(String(h.rate)) + '</button> <small>(' + esc(shortDate(h.date)) + ')</small>'; }).join(', '));
    if (lp && !(c.buy && hist.length && hist[0].date === lp.date && hist[0].rate === lp.rate)) bits.push('<span class="cs-l">' + esc(T('s_pur')) + ':</span> <button type="button" class="link cs-r" data-csrate="' + lp.rate + '" title="' + esc(T('s_use')) + '">' + esc(String(lp.rate)) + '</button> <small>(' + esc(shortDate(lp.date)) + ')</small>');
    if (st) bits.push('<span class="cs-l">' + esc(T('s_stock')) + ':</span> <b' + (st.q <= 0 ? ' class="bad"' : '') + '>' + esc(String(Math.round(st.q * 1000) / 1000)) + (st.unit ? ' ' + esc(st.unit) : '') + '</b>');
    if (!bits.length) { stripHide(); return; }
    if (!strip || stripFor !== c.row) { stripHide(); strip = document.createElement('div'); strip.className = 'cf-strip'; strip.setAttribute('aria-live', 'polite'); stripFor = c.row; c.at.insertAdjacentElement(c.at.classList.contains('line') ? 'afterend' : 'beforeend', strip); }
    strip.innerHTML = bits.join(' · ');
    strip._rate = c.rate;
  }
  document.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('[data-csrate]')) e.preventDefault(); }, true);
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-csrate]'); if (b && strip && strip._rate) { strip._rate(b.getAttribute('data-csrate')); } });
  /* party: balance, overdue (oldest days) and credit limit, under the party box */
  function partyStrip(el) {
    var name = String(el.value || '').trim(), host = el.closest('.f') || el.parentNode, old = host.querySelector('.cf-pstrip');
    var B = G.NSBooks, A = G.NSApp, biz = el.id === 'b-name' && api ? api.doc().seller && api.doc().seller.name : A && A.bizName ? A.bizName() : '';
    if (!name || !B) { if (old) old.remove(); return; }
    var k = key(name), p = PARTIES.filter(function (x) { return key(x.name) === k; })[0], bits = [];
    try {
      var bal = ((B.parties(DOCS, biz) || {})[B.key ? B.key(name) : k] || {}).bal || 0;
      if (Math.abs(bal) >= 0.01) bits.push('<span class="cs-l">' + esc(T('s_bal')) + ':</span> <b>' + esc(T(bal > 0 ? 's_recv' : 's_pay', { a: money(Math.abs(bal)) })) + '</b>');
      var open = (B.bills(DOCS, biz, B.key ? B.key(name) : k).bills || []).filter(function (b) { return b.side === (bal < 0 ? 'pay' : 'recv'); }), today = NS.today(), od = 0, oldest = 0;
      open.forEach(function (b) { var due = b.due || (p && +p.cdays ? B.addDays(b.date, +p.cdays) : ''); if (due && due < today) { od += b.left; oldest = Math.max(oldest, Math.round((new Date(today) - new Date(due)) / 864e5)); } });
      if (od > 0.004) bits.push('<span class="bad">' + esc(T('s_over', { a: money(od), n: oldest })) + '</span>');
      var lim = p ? +p.climit || 0 : 0;
      if (lim > 0) bits.push('<span class="cs-l">' + esc(T('s_lim')) + ':</span> ' + esc(money(lim)) + (bal > lim ? ' <span class="bad">' + esc(T('s_overlim', { a: money(bal - lim) })) + '</span>' : ''));
    } catch (e) {}
    if (!bits.length) { if (old) old.remove(); return; }
    var s = old || document.createElement('div'); s.className = 'cf-strip cf-pstrip'; s.innerHTML = bits.join(' · ');
    if (!old) host.appendChild(s);
  }
  /* a field on Parties and on this voucher type: picking the party fills it when the box is still empty (never overwrites typing) */
  function fromParty(el) {
    var name = String(el.value || '').trim(); if (!name) return;
    var L = G.NSApp && NSApp.data ? NSApp.data().party : PARTIES, p = L.filter(function (x) { return key(x.name) === key(name); })[0];
    if (el.id === 'b-name' && api) {
      var d = api.doc(), n = 0;
      mHead().forEach(function (f) { if (p && p.cf && onTarget(f, 'party') && p.cf[f.id] != null && (!d.cf || d.cf[f.id] == null || d.cf[f.id] === '')) { setCf(d, f, p.cf[f.id]); n++; } });
      mHead().forEach(function (f) { if (!f.last || d.cf && d.cf[f.id] != null && d.cf[f.id] !== '') return; var lv = lastValue(DOCS, mType(), name, f.id, api.id && api.id()); if (lv !== undefined) { setCf(d, f, lv); n++; } });
      if (n) { mDraw(); api.changed(); }
      return;
    }
    var box = el.form && el.form.querySelector('[data-cfbox^="vt:"]'); if (!box) return;
    var vt = box.getAttribute('data-cfbox').slice(3), D = G.NSApp && NSApp.data ? NSApp.data().doc : DOCS;
    appHead(vt).forEach(function (f) {
      var inp = box.querySelector('[data-cfid="' + f.id + '"]'), v = p && p.cf && onTarget(f, 'party') ? p.cf[f.id] : undefined;
      if (v == null && f.last) v = lastValue(D, vt, name, f.id, APPREC);
      if (!inp || v == null || String(inp.value).trim()) return;
      inp.value = f.type === 'yesno' ? (v ? 'yes' : 'no') : v; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function isParty(el) { return el && (el.id === 'f-party' && !!el.closest('#app-form') || el.id === 'b-name' && !!api); }
  var pTimer = 0;
  document.addEventListener('change', function (e) { if (isParty(e.target)) { var el = e.target; fromParty(el); (dataAsk || loadData()).then(function () { partyStrip(el); }); } });
  document.addEventListener('input', function (e) { if (isParty(e.target)) { var el = e.target; clearTimeout(pTimer); pTimer = setTimeout(function () { partyStrip(el); }, 500); } });
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el.closest && (el.closest('.it[data-i]') || el.closest('#app-form .line[data-row]'))) { (dataAsk || loadData()).then(function () { if (document.activeElement === el) lineStrip(el); }); }
    else if (strip && !(el.closest && el.closest('.cf-strip'))) { if (ptrDown) hideLater = true; else stripHide(); }
  });
  /* owner's sales check 24 Nov: the strip used to vanish on mouse-down, so everything under it jumped up and the click landed on
     the wrong button ("+ Add line" missed, the "No GST" tick could be hit). With the mouse, it now goes only after the click. */
  var ptrDown = false, hideLater = false;
  document.addEventListener('pointerdown', function () { ptrDown = true; }, true);
  document.addEventListener('pointerup', function () {
    setTimeout(function () {
      ptrDown = false; if (!hideLater) return; hideLater = false;
      var a = document.activeElement;
      if (strip && !(a && a.closest && (a.closest('.cf-strip') || a.closest('.it[data-i]') || a.closest('#app-form .line[data-row]')))) stripHide();
    }, 0);
  }, true);

  /* ---------- registers: filter row, extra columns, group by a field (ledger.js) ---------- */
  var FILT = {};
  function filterDefs(targets) { return cols(ALL, targets, ''); }
  function filterBar(scope, targets) {
    var L = filterDefs(targets); if (!L.length) return '';
    var F = FILT[scope] || {};
    return '<div class="cf-filt" data-cfscope="' + esc(scope) + '">' + L.map(function (f) {
      var v = F[f.id], id = 'cff-' + scope + '-' + f.id, lab = '<span>' + esc(f.label) + '</span> ';
      if (f.type === 'list') return '<label>' + lab + '<select data-cff="' + esc(f.id) + '"><option value="">' + esc(T('any')) + '</option>' + (f.opts || []).map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
      if (f.type === 'yesno') return '<label>' + lab + '<select data-cff="' + esc(f.id) + '"><option value="">' + esc(T('any')) + '</option><option value="yes"' + (v === 'yes' ? ' selected' : '') + '>' + esc(T('yes')) + '</option><option value="no"' + (v === 'no' ? ' selected' : '') + '>' + esc(T('no')) + '</option></select></label>';
      if (f.type === 'num' || f.type === 'money' || f.type === 'date') { var r = v || {}, ty = f.type === 'date' ? ' type="date"' : ' inputmode="decimal" size="6"'; return '<label>' + lab + '<input' + ty + ' data-cff="' + esc(f.id) + '" data-cfr="from" value="' + esc(r.from || '') + '" aria-label="' + esc(f.label + ' ' + T('from')) + '"> – <input' + ty + ' data-cff="' + esc(f.id) + '" data-cfr="to" value="' + esc(r.to || '') + '" aria-label="' + esc(f.label + ' ' + T('to')) + '"></label>'; }
      return '<label>' + lab + '<input id="' + id + '" type="search" data-cff="' + esc(f.id) + '" value="' + esc(v || '') + '" placeholder="' + esc(T('contains')) + '"></label>';
    }).join('') + '</div>';
  }
  document.addEventListener('change', function (e) {
    var el = e.target, id = el && el.getAttribute && el.getAttribute('data-cff'), bar = id && el.closest('[data-cfscope]'); if (!bar) return;
    var sc = bar.getAttribute('data-cfscope'), F = FILT[sc] = FILT[sc] || {}, r = el.getAttribute('data-cfr');
    if (r) { F[id] = F[id] || {}; F[id][r] = el.value; } else if (el.value) F[id] = el.value; else delete F[id];
    if (G.NSApp && NSApp.show) NSApp.show();
  });
  function pass(d, scope) { return match(d, FILT[scope], ALL); }
  function partyPass(k, scope) {
    if (!FILT[scope] || !Object.keys(FILT[scope]).length) return true;
    var L = G.NSApp && NSApp.data ? NSApp.data().party : PARTIES, p = L.filter(function (x) { return key(x.name) === k; })[0];
    return match(p || {}, FILT[scope], ALL);
  }
  /* every custom value of a record (and of its lines) as one text: Ctrl K finds records by them */
  NS.cfText = function (r) {
    if (!r) return '';
    var bits = [], add = function (cf) { Object.keys(cf || {}).forEach(function (id) { var f = ALL.filter(function (x) { return x.id === id; })[0]; if (f) bits.push(fmt(f, cf[id])); }); };
    add(r.cf); (r.items || []).forEach(function (l) { if (l) add(l.cf); });
    return bits.join(' ');
  };
  function colHead(list) { return list.map(function (f) { return '<th>' + esc(f.label) + '</th>'; }).join(''); }
  function colCells(list, d) { return list.map(function (f) { return '<td>' + esc(fmt(f, d && d.cf && d.cf[f.id])) + '</td>'; }).join(''); }
  function colVals(list, d) { return list.map(function (f) { var v = d && d.cf && d.cf[f.id]; return f.type === 'num' || f.type === 'money' ? (v == null ? '' : v) : fmt(f, v); }); }

  /* ---------- Masters › Custom fields and Remembered entries (masters.js reads window.NSMsExt) ---------- */
  function vtName(t) { var s = NS.t('ufd.vt_' + t); if (s !== 'ufd.vt_' + t) return s; s = NS.t('ufd.kt_' + t); return s === 'ufd.kt_' + t ? t : s; }
  function onName(f) { return (f.on || []).map(function (t) { return t === 'party' ? T('t_party') : t === 'item' ? T('t_item') : t === 'vt:*' ? T('t_all') : vtName(t.slice(3)); }).join(', '); }
  function saveDefs(fn) {
    return NSStore.meta('fields').then(function (m) { m = m && m.defs ? m : { v: 1, defs: [] }; fn(m.defs); return NSStore.meta('fields', m).then(function () { META = m; ALL = all(META, SETS); return m; }); });
  }
  function fieldForm(f0, preset, onSaved) {
    var A = G.NSApp, X = A && A.acx; if (!X) return;
    var f = f0 || Object.assign({ id: '', label: '', on: [], level: 'head', type: 'text', print: 'meta', carry: true, remember: true, filter: false, biz: [] }, preset || {});
    var chk = function (t, lbl) { return '<label class="chk"><input type="checkbox" data-cfon="' + esc(t) + '"' + ((f.on || []).indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(lbl) + '</label>'; };
    var box = function (id, lbl, on, hint) { return '<div class="f wide"><label class="chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> <span>' + esc(lbl) + '</span></label>' + (hint ? '<small class="hint">' + esc(hint) + '</small>' : '') + '</div>'; };
    var bz = A.biz && A.biz(), many = A.data && A.data().biz.length > 1;
    var html = '<div class="fg">' + X.fld('cf-label', T('f_label'), X.inp('cf-label', f.label, { req: 1 }), { hint: T('f_labelh') }) +
      X.fld('cf-type', T('f_type'), X.sel('cf-type', f.type, TYPES.map(function (t) { return [t, T('ty_' + t)]; }))) +
      X.fld('cf-level', T('f_level'), X.sel('cf-level', f.level || 'head', [['head', T('lv_head')], ['line', T('lv_line')]])) +
      '<div class="f wide" data-cfopts><label for="cf-opts">' + esc(T('f_opts')) + '</label><textarea id="cf-opts" rows="3" dir="auto">' + esc((f.opts || []).join('\n')) + '</textarea><small class="hint">' + esc(T('f_optsh')) + '</small></div>' +
      '<fieldset class="f wide cf-on"><legend>' + esc(T('f_on')) + '</legend><small class="hint">' + esc(T('f_onh')) + '</small><div data-cfmasters>' + chk('party', T('t_party')) + chk('item', T('t_item')) + '</div>' + chk('vt:*', T('t_all')) +
        '<div class="cf-vts">' + VTS.map(function (t) { return chk('vt:' + t, vtName(t)); }).join('') + '</div>' +
        '<details class="cf-kits"' + (KITS.some(function (k) { return (f.on || []).indexOf('vt:' + k) >= 0; }) ? ' open' : '') + '><summary>' + esc(T('kits')) + '</summary><div class="cf-vts">' + KITS.map(function (t) { return chk('vt:' + t, vtName(t)); }).join('') + '</div></details></fieldset>' +
      X.fld('cf-print', T('f_print'), X.sel('cf-print', f.print || 'meta', [['meta', T('pr_meta')], ['foot', T('pr_foot')], ['note', T('pr_note')], ['none', T('pr_none')]])) +
      box('cf-req', T('f_req'), f.req) + box('cf-rem', T('f_rem'), f.remember !== false, T('f_remh')) + box('cf-filter', T('f_filter'), f.filter, T('f_filterh')) + box('cf-carry', T('f_carry'), f.carry !== false, T('f_carryh')) + box('cf-last', T('f_last'), f.last, T('f_lasth')) +
      (many && bz ? box('cf-biz', T('f_biz', { b: bz.name }), (f.biz || []).length > 0) : '') +
      (f0 ? box('cf-off', T('f_off'), f.off, T('f_offh')) : '') + '</div><p class="soft">' + esc(T('f_h')) + '</p>';
    X.open(T(f0 ? 'alter' : 'create'), html, function () {
      var form = $('.acx-dlg form'), v = function (id) { var e = $('#' + id, form); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; };
      var next = tidy({ id: f.id || newId(ALL), label: v('cf-label'), type: v('cf-type'), level: v('cf-level'), opts: v('cf-opts'), on: $$('[data-cfon]', form).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-cfon'); }),
        req: v('cf-req'), remember: v('cf-rem'), print: v('cf-print'), filter: v('cf-filter'), carry: v('cf-carry'), last: v('cf-last'), biz: v('cf-biz') && bz ? [bz.id] : (f0 && !$('#cf-biz', form) ? f.biz : []), off: v('cf-off'), order: f.order || ALL.length + 1 });
      if (next.level === 'line' && next.on.some(function (t) { return t === 'party' || t === 'item'; })) next.on = next.on.filter(function (t) { return t !== 'party' && t !== 'item'; });
      var bad = invalid(next, ALL); if (bad) { NS.toast(T('bad_' + bad, { n: next.level === 'line' ? MAXL : MAXH }), 'bad'); return; }
      saveDefs(function (L) { var i = L.findIndex(function (x) { return x.id === next.id; }); if (i >= 0) L[i] = next; else L.push(next); }).then(function () {
        $('.acx-dlg').close(); NS.toast(T('saved')); if (onSaved) onSaved(next); else if (A.show) A.show();
      }, function (e) { NS.toast(NS.t('nosave', { e: e && e.message || '' }), 'bad'); });
    }, function (form) {
      function sync() {
        var line = $('#cf-level', form).value === 'line', ty = $('#cf-type', form).value;
        $('[data-cfopts]', form).hidden = ty !== 'list';
        $('[data-cfmasters]', form).hidden = line;
        $$('.cf-vts [data-cfon]', form).forEach(function (c) { var ok = !line || LINES[c.getAttribute('data-cfon').slice(3)]; c.closest('label').hidden = !ok; if (!ok) c.checked = false; });
        var pr = $('#cf-print', form), opts = line ? ['note', 'none'] : ['meta', 'foot', 'none'];
        $$('option', pr).forEach(function (o) { o.hidden = opts.indexOf(o.value) < 0; });
        if (opts.indexOf(pr.value) < 0) pr.value = opts[0];
        var rm = $('#cf-rem', form); if (rm) rm.closest('.f').hidden = ty !== 'text';
        $('#cf-last', form).closest('.f').hidden = line;
      }
      ['cf-level', 'cf-type'].forEach(function (id) { $('#' + id, form).addEventListener('change', sync); });
      sync();
    });
  }
  function usesOf(f) { var A = G.NSApp, D = A && A.data ? A.data() : { doc: DOCS, party: PARTIES, item: ITEMS }; return uses(f.id, D.doc, D.party, D.item); }
  function delField(f) {
    var n = usesOf(f), A = G.NSApp;
    if (f.legacy) { NS.toast(T('legacyh'), 'bad'); return; }
    if (n) { NS.toast(T('inuse', { n: n }), 'bad'); return; }
    (NS.ask ? NS.ask(T('delq', { x: f.label }), { danger: true, ok: NS.t('desk.del') }) : Promise.resolve(confirm(T('delq', { x: f.label })))).then(function (y) {
      if (y) saveDefs(function (L) { var i = L.findIndex(function (x) { return x.id === f.id; }); if (i >= 0) L.splice(i, 1); }).then(function () { NS.toast(T('deleted')); A.show(); });
    });
  }
  /* an old My data document field becomes a field of this list (same id: its saved values stay) */
  function adopt(f) { var n = tidy(Object.assign({}, f, { remember: true })); delete n.legacy; saveDefs(function (L) { L.push(n); }).then(function () { fieldForm(n); }); }
  function cfHtml() {
    var L = ALL.slice().sort(function (a, b) { return (+a.order || 0) - (+b.order || 0); });
    if (!L.length) return '<p class="soft">' + esc(T('none')) + '</p><p class="soft">' + esc(T('ex')) + '</p>';
    return '<div class="tbl-wrap"><table class="tbl ms-tbl"><thead><tr><th>' + esc(T('f_label')) + '</th><th>' + esc(T('f_on')) + '</th><th>' + esc(T('f_level')) + '</th><th>' + esc(T('f_type')) + '</th><th>' + esc(T('c_flags')) + '</th><th class="n">' + esc(T('c_uses')) + '</th><th class="noprint"></th></tr></thead><tbody>' +
      L.map(function (f) {
        var flags = [f.req ? T('fl_req') : '', f.filter ? T('fl_filter') : '', f.print && f.print !== 'none' ? T('fl_print') : '', f.carry !== false ? T('fl_carry') : '', f.off ? T('fl_off') : '', f.legacy ? T('fl_old') : ''].filter(Boolean).join(', ');
        var btn = function (a, ic, lbl, cls) { return '<button type="button" class="btn sm ib' + (cls ? ' ' + cls : '') + '" ' + a + ' title="' + esc(lbl) + '" aria-label="' + esc(lbl) + '">' + NS.icSvg(ic) + '</button>'; };
        return '<tr' + (f.off ? ' class="soft"' : '') + '><td class="l">' + esc(f.label) + '</td><td class="l">' + esc(onName(f)) + '</td><td class="l">' + esc(T(f.level === 'line' ? 'lv_line' : 'lv_head')) + '</td><td class="l">' + esc(T('ty_' + (f.type || 'text'))) + (f.type === 'list' ? ' <small class="soft">(' + esc((f.opts || []).join(', ')) + ')</small>' : '') + '</td><td class="l">' + esc(flags) + '</td><td class="n">' + usesOf(f) + '</td>' +
          '<td class="noprint ms-acts">' + (f.legacy ? btn('data-cfadopt="' + esc(f.id) + '"', 'edit', T('adopt')) : btn('data-cfalt="' + esc(f.id) + '"', 'edit', T('alter')) + btn('data-cfdel="' + esc(f.id) + '"', 'trash', NS.t('desk.del'), 'danger')) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="soft">' + esc(T('h')) + '</p>';
  }
  var RK = null, TRN = null;
  function rkName(k) {
    var m = /^(notes|terms|narr):(.+)$/.exec(k); if (m) return T('rk_' + m[1], { t: vtName(m[2]) });
    if (/^km:/.test(k)) return T('rk_km', { a: k.slice(3, 9), b: k.slice(10) });
    if (/^cf:/.test(k)) { var f = ALL.filter(function (x) { return x.id === k.slice(3); })[0]; return f ? f.label : k; }
    return T('rk_' + k.replace('.', '_'));
  }
  function remHtml() {
    if (!RK) { Promise.all([rcGet(true), NS.dispatch ? NS.dispatch(true) : Promise.resolve({ tr: [] })]).then(function (r) { RK = r[0]; TRN = (r[1].tr || []).map(function (t) { return key(t.name); }); if (/^#masters\/rem/.test(location.hash)) G.NSApp.show(); }); return '<p class="soft">…</p>'; }
    var ks = Object.keys(RK.k || {}).sort(function (a, b) { return rkName(a).localeCompare(rkName(b)); });
    if (!ks.length) return '<p class="soft">' + esc(T('rem_none')) + '</p>';
    return '<p class="soft">' + esc(T('rem_h')) + '</p>' + ks.map(function (k) {
      var L = RK.k[k].slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
      return '<section class="card cf-rk"><h3>' + esc(rkName(k)) + ' <span class="pill">' + L.length + '</span> <button type="button" class="btn sm" data-rkall="' + esc(k) + '">' + esc(T('forgetall')) + '</button></h3><ul class="cf-rkl">' +
        L.map(function (x) { return '<li><span dir="auto">' + esc(x.v) + '</span> <small class="soft">' + esc(T('used', { n: x.n || 1 })) + '</small> ' +
          (k === 'disp.through' && NS.dispatchSave && TRN && TRN.indexOf(key(x.v)) < 0 ? '<button type="button" class="btn sm" data-rkpro="' + esc(x.v) + '">' + esc(T('promote')) + '</button> ' : '') + '<button type="button" class="rc-x" data-rkx="' + esc(k) + '" data-rkv="' + esc(x.v) + '" title="' + esc(T('forget')) + '" aria-label="' + esc(T('forget')) + '">×</button></li>'; }).join('') + '</ul></section>';
    }).join('');
  }
  function remWire(pane) {
    if (pane._cfRw) return; pane._cfRw = 1;
    pane.addEventListener('click', function (e) {
      if (!/^#masters\/(cf|rem)/.test(location.hash) && !/^#masters\/?$/.test(location.hash)) return;
      var b = e.target.closest('button'); if (!b) return;
      var g = function (a) { return b.getAttribute(a); };
      if (g('data-msnew') === 'cf') { e.stopPropagation(); fieldForm(); return; }
      if (g('data-cfalt')) return fieldForm(ALL.filter(function (x) { return x.id === g('data-cfalt'); })[0]);
      if (g('data-cfdel')) return delField(ALL.filter(function (x) { return x.id === g('data-cfdel'); })[0]);
      if (g('data-cfadopt')) return adopt(ALL.filter(function (x) { return x.id === g('data-cfadopt'); })[0]);
      if (g('data-rkpro')) {   /* a remembered "dispatched through" becomes a transporter of Masters › Transporters */
        var nm = g('data-rkpro');
        return NS.dispatchSave(function (D) { if (!D.tr.some(function (t) { return key(t.name) === key(nm); })) D.tr.push({ id: 't' + Date.now().toString(36), name: nm, tid: '' }); })
          .then(function (D) { TRN = D.tr.map(function (t) { return key(t.name); }); NS.toast(T('promoted', { n: nm })); G.NSApp.show(); });
      }
      if (g('data-rkx') || g('data-rkall')) {
        var k = g('data-rkx') || g('data-rkall'), v = g('data-rkall') ? null : g('data-rkv');
        (v == null && NS.ask ? NS.ask(T('forgetq', { x: rkName(k) }), { danger: true }) : Promise.resolve(true)).then(function (y) { if (y) rcEdit(function (R) { rcForget(R, k, v); }).then(function (R) { RK = R; G.NSApp.show(); }); });
      }
    }, true);
  }
  G.NSMsExt = (G.NSMsExt || []).concat([
    { id: 'cf', newKey: 'ufd.create', html: cfHtml, wire: remWire, count: function () { return ALL.length; } },
    { id: 'rem', html: function () { return remHtml(); }, wire: function (pane) { RK = RK && /^#masters\/rem/.test(location.hash) ? RK : null; remWire(pane); } }
  ]);

  /* "+ Field" on an App form: make the field here, the form shows it at once (typed values stay) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cfnew]'); if (!b) return;
    e.preventDefault();
    var box = b.closest('[data-cfbox]'), vt = b.getAttribute('data-cfnew');
    fieldForm(null, { on: [vt] }, function () {
      if (!box || !box.isConnected) return;
      var cf = readBox(box, appHead(vt.slice(3)));
      box.innerHTML = appBoxHtml(vt.slice(3), cf); box.classList.toggle('cf-empty', !appHead(vt.slice(3)).length);
      if (G.NSApp && NSApp.redrawLines) NSApp.redrawLines();
    });
  });

  /* small styles of this file (one place) */
  var css = document.createElement('style');
  css.textContent = '.rc-pop{position:absolute;left:0;right:0;top:100%;z-index:60;background:var(--surface-solid,var(--bg,#fff));border:1px solid var(--line,#ccd);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:260px;overflow:auto;padding:4px}' +
    '.rc-h{margin:2px 6px;font-size:.75rem;opacity:.7}.rc-row{display:flex;align-items:stretch}.rc-v{flex:1;text-align:start;background:none;border:0;padding:7px 8px;cursor:pointer;color:inherit;font:inherit;border-radius:6px;white-space:normal}.rc-v:hover,.rc-v:focus{background:var(--hover,rgba(0,0,0,.06))}' +
    '.rc-x{background:none;border:0;cursor:pointer;color:inherit;opacity:.6;padding:0 10px;font-size:1.1rem;min-width:32px}.rc-x:hover{opacity:1;color:#b42318}' +
    '.cf-strip{font-size:.82rem;margin:4px 0 6px;padding:5px 8px;border-radius:6px;background:var(--soft-bg,rgba(11,59,91,.06));line-height:1.6;grid-column:1/-1}.cf-strip .cs-l{opacity:.75}.cf-strip .cs-r{font-weight:600;padding:0 2px;min-height:0}.cf-strip .bad{color:#b42318}' +
    '.cf-box.cf-empty{border:0;padding:0;margin:4px 0}.cf-add{margin:4px 0}.cf-filt{display:flex;flex-wrap:wrap;gap:8px 14px;margin:6px 0}.cf-filt label{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.cf-filt input,.cf-filt select{max-width:11rem}' +
    '.cf-on .chk{display:inline-flex;margin:2px 12px 2px 0}.cf-vts{margin-top:4px}.cf-rkl{list-style:none;padding:0;margin:0}.cf-rkl li{display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--line,#eee)}.cf-rkl li span{flex:1}.cf-foot{margin:6px 0;font-size:.9em}' +
    '@media print{.rc-pop,.cf-strip,.cf-add{display:none!important}}';
  (document.head || document.documentElement).appendChild(css);

  function start() { appLines(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  if (G.NSStore) (NSStore.ready ? NSStore.ready() : Promise.resolve()).then(function () { load(); loadData(); });

  G.NSCF = Object.assign({}, PURE, {
    ready: function () { return loaded || load(); }, list: function () { return ALL; }, inputs: inputs, readBox: readBox,
    formHtml: formHtml, formRead: formRead, appBlock: appBlock, slipEditor: slipEditor, slipWire: function (ed) { DX.wire(ed); }, slipFill: function () { DX.fill(); }, slipPrint: slipPrint, slipBlock: function (d) { return DX.block(d); }, appTake: appTake, carryInto: carryInto, fieldForm: fieldForm,
    filterBar: filterBar, pass: pass, partyPass: partyPass, colsOf: function (docs) { return colsFor(ALL, docs, ''); }, colsTargets: function (t) { return cols(ALL, t, ''); },
    colHead: colHead, colCells: colCells, colVals: colVals, groupDefs: function (t) { return cols(ALL, t, '').filter(function (f) { return f.type === 'list' || f.type === 'text' || f.type === 'yesno'; }); },
    get: function (id) { return ALL.filter(function (f) { return f.id === id; })[0]; },
    narr: function (d) { return narr(d, ALL, ''); },
    thermalRows: function (d) { var b = bizIdOf(d.seller); return printRows(d, ALL, b, 'meta').concat(printRows(d, ALL, b, 'foot')); }
  });
})(this);
