/* NSMfg: manufacturing extras for the stock register (Stock Step C of the Party and Stock Ledger plan). Pure functions, no screen.
   Records (store 'doc', seller = our business) and item master fields it reads:
     item.alt   { unit, per }: a second unit, 1 alt unit = per base units (1 Box = 12 Pcs). Stock is kept in the base unit (item.unit).
     item.boms  [{ name, from (YYYY-MM-DD, in use from), per, lines:[{ desc, qty, unit }], by:[{ desc, qty, unit, rate }] }]:
                versions of the bill of materials. item.bom stays a copy of the newest version, so older screens keep working.
     make       { type:'stk', kind:'make', ..., ver, subs:[{ desc, qty, unit }] (made and used inside this entry: no stock move),
                  by:[{ desc, qty, unit, rate }] (by-products and scrap: come into stock at rate, their value is taken off out.rate) }
     jobout     { type:'stk', kind:'jobout', date, no, gd, dc (challan no), dcid, worker:{ name, gstin, state },
                  lines:[{ desc, unit, qty, rate (value per unit), gst, cap (1 = capital goods) }] }: sent to a job worker
     jobin      { type:'stk', kind:'jobin', date, no, gd, ref (id of the jobout), wdc (job worker's challan no), nature,
                  lines:[{ desc, unit, back, lost }], out:{ desc, unit, qty, rate } (processed goods, optional) }: received back
   expand(docs, items) turns these into the plain records stockcore.js already understands (move, make, adj), so stock,
   godowns, ledgers and average cost all see job work, by-products and second units without knowing about them.
   Goods at a job worker sit in their own stock place named JW + worker name.
   Law (checked 5 Nov 2026): CGST Act s.143(1): inputs back within 1 year, capital goods within 3 years of being sent
   (moulds, dies, jigs, fixtures and tools are exempt from the 3 years); not back in time = treated as supplied on the day sent.
   ITC-04 (Rule 45(3) as amended by Notification 35/2021-CT from 1 Oct 2021): AATO above Rs 5 crore files half-yearly
   (Apr-Sep by 25 Oct, Oct-Mar by 25 Apr), others once a year (by 25 Apr). */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function r3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function byName(items) { var M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; }); return M; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  var JW = 'JW ';
  function jwPlace(w) { return JW + String(w && w.name || w || '').trim(); }
  function isJw(g) { return String(g || '').indexOf(JW) === 0; }

  /* ---------- alternate units ----------
     ERP round 1 (I-3): an item may have several other units (item.alts = [{ unit, per }], 1 unit = per base units; the older
     item.alt is read as the first one), and the unit master (data home meta 'units' = [{ sym, name, uqc, dec, compound:
     { per, second } }]: 1 sym = per second) plus a few fixed conversions (1 Kg = 1000 Gm, 1 Dozen = 12 Nos ...) convert any
     unit into the item's base unit. A line in a unit that none of these converts is "not a unit of this item" (unitOk false):
     the stock register flags it and the makers refuse it for goods items. Pages pass the unit master in with setUnits(list). */
  var USYN = { no: 'nos', number: 'nos', numbers: 'nos', pc: 'pcs', piece: 'pcs', pieces: 'pcs', kgs: 'kg', kilogram: 'kg', g: 'gm', gms: 'gm', gram: 'gm', grams: 'gm',
    l: 'ltr', ltrs: 'ltr', litre: 'ltr', liter: 'ltr', litres: 'ltr', m: 'mtr', mtrs: 'mtr', metre: 'mtr', meter: 'mtr', boxes: 'box', bags: 'bag', strips: 'strip',
    bottles: 'bottle', btl: 'bottle', pkt: 'pack', packet: 'pack', packs: 'pack', dozens: 'dozen', doz: 'dozen', dz: 'dozen', tonne: 'ton', tons: 'ton', mt: 'ton', quintal: 'qtl',
    ctn: 'carton', cartons: 'carton', sets: 'set', pairs: 'pair', rolls: 'roll', cms: 'cm', mls: 'ml', 'sq. ft': 'sq ft', sqft: 'sq ft', 'sq.ft': 'sq ft' };
  function ukey(u) { var k = key(u).replace(/\.$/, ''); return USYN[k] || k; }
  var FIXED = [['kg', 1000, 'gm'], ['ltr', 1000, 'ml'], ['ton', 1000, 'kg'], ['qtl', 100, 'kg'], ['dozen', 12, 'nos'], ['dozen', 12, 'pcs'], ['mtr', 100, 'cm'], ['km', 1000, 'mtr']];
  var UPAIRS = FIXED.slice(), UMASTER = [];
  function setUnits(list) {
    UMASTER = (list || []).filter(function (u) { return u && u.sym; });
    UPAIRS = FIXED.slice();
    UMASTER.forEach(function (u) { var c = u.compound; if (c && c.second && num(c.per) > 0 && ukey(c.second) !== ukey(u.sym)) UPAIRS.push([ukey(u.sym), num(c.per), ukey(c.second)]); });
    return UMASTER;
  }
  function unitMaster() { return UMASTER; }
  function altsOf(m) {
    if (!m) return [];
    var seen = {}, out = [], base = ukey(m.unit);
    [].concat(m.alt ? [m.alt] : [], m.alts || []).forEach(function (a) {
      var u = a && ukey(a.unit); if (!u || u === base || seen[u] || !(num(a.per) > 0)) return;
      seen[u] = 1; out.push({ unit: String(a.unit).trim(), per: num(a.per) });
    });
    return out;
  }
  function altOf(m) { var a = altsOf(m); return a.length ? a[0] : null; }
  /* base units in one `u` through the unit master / fixed conversions (one step, either way), or 0 when there is none */
  function pairFactor(u, base) {
    for (var i = 0; i < UPAIRS.length; i++) { var p = UPAIRS[i]; if (p[0] === u && p[2] === base) return p[1]; if (p[2] === u && p[0] === base) return 1 / p[1]; }
    return 0;
  }
  /* how many base units one `unit` of this item is (1 when it is the base unit or unknown) */
  function factor(m, unit) {
    if (!m || !unit) return 1;
    var u = ukey(unit), base = ukey(m.unit); if (!base || u === base) return 1;
    var a = altsOf(m).filter(function (x) { return ukey(x.unit) === u; })[0]; if (a) return a.per;
    return pairFactor(u, base) || 1;
  }
  /* is `unit` the item's base unit, one of its other units, or convertible into it? (no item / no unit = nothing to check) */
  function unitOk(m, unit) {
    if (!m || !String(unit || '').trim() || !String(m.unit || '').trim()) return true;
    var u = ukey(unit), base = ukey(m.unit);
    return u === base || altsOf(m).some(function (x) { return ukey(x.unit) === u; }) || !!pairFactor(u, base);
  }
  /* the units a line of this item may use: base first, then its own other units, then units the master converts */
  function unitsOf(m) {
    if (!m || !m.unit) return [];
    var base = ukey(m.unit), out = [m.unit], seen = {}; seen[base] = 1;
    altsOf(m).forEach(function (a) { var k = ukey(a.unit); if (!seen[k]) { seen[k] = 1; out.push(a.unit); } });
    UPAIRS.forEach(function (p) { var o = p[0] === base ? p[2] : p[2] === base ? p[0] : ''; if (o && !seen[o]) { seen[o] = 1; var mu = UMASTER.filter(function (x) { return ukey(x.sym) === o; })[0]; out.push(mu ? mu.sym : o.charAt(0).toUpperCase() + o.slice(1)); } });
    return out;
  }
  /* a line in either unit -> the same line in the base unit (qty × per, rate ÷ per) */
  function toBase(m, it, qk) {
    var ks = [].concat(qk || 'qty'), f = factor(m, it && it.unit); if (f === 1) return it;
    var o = Object.assign({}, it); o.unit = m.unit || '';
    ks.forEach(function (k) { if (o[k] !== '' && o[k] != null) o[k] = r3(num(o[k]) * f); else if (k === 'qty') o.qty = f; });
    if (o.rate !== '' && o.rate != null) o.rate = Math.round(num(o.rate) / f * 10000) / 10000;
    return o;
  }
  /* a base quantity shown in the second unit too: { a (whole alt units), b (base units left), unit, base } or null */
  function split(m, q) {
    var a = altOf(m); if (!a || !q) return null;
    var s = q < 0 ? -1 : 1, x = Math.abs(q), whole = Math.floor(r3(x / a.per) + 1e-9), rest = r3(x - whole * a.per);
    return { a: s * whole, b: s * rest, unit: a.unit, base: m.unit || '', per: a.per };
  }
  function altText(m, q) { var s = split(m, q); if (!s || !s.a) return ''; return s.a + ' ' + s.unit + (s.b ? ' + ' + s.b + ' ' + s.base : ''); }

  /* ---------- BOM versions ---------- */
  function bomList(m) {
    if (!m) return [];
    if (m.boms && m.boms.length) return m.boms.slice().sort(function (a, b) { return String(a.from || '').localeCompare(String(b.from || '')) || String(a.name || '').localeCompare(String(b.name || '')); });
    return m.bom && (m.bom.lines || []).length ? [Object.assign({ name: '', from: '' }, m.bom)] : [];
  }
  /* the version to use on a date: the one named, else the newest one in use by then, else the earliest */
  function pickBom(m, date, name) {
    var L = bomList(m); if (!L.length) return null;
    if (name != null && name !== '') { var hit = L.filter(function (b) { return key(b.name) === key(name); })[0]; if (hit) return hit; }
    var ok = L.filter(function (b) { return !b.from || !date || b.from <= date; });
    return ok.length ? ok[ok.length - 1] : L[0];
  }
  /* item with one version added or replaced (by old name, else by its own name); item.bom = the version in use today */
  function saveVersion(m, v, oldName, today) {
    var r = copy(m || {}), L = bomList(r).map(copy), was = oldName != null ? oldName : v.name;
    var i = -1; L.forEach(function (b, j) { if (key(b.name) === key(was)) i = j; });
    var nv = { name: String(v.name || '').trim(), from: v.from || '', per: num(v.per) || 1, lines: v.lines || [], by: (v.by || []).filter(function (b) { return b.desc; }) };
    if (i >= 0) L[i] = nv; else L.push(nv);
    r.boms = L; var cur = pickBom(r, today || ''); r.bom = { per: cur.per, lines: cur.lines };
    if (cur.by && cur.by.length) r.bom.by = cur.by;
    return r;
  }
  function dropVersion(m, name, today) {
    var r = copy(m || {}), L = bomList(r).filter(function (b) { return key(b.name) !== key(name); });
    if (!L.length) { delete r.boms; delete r.bom; return r; }
    r.boms = L; var cur = pickBom(r, today || ''); r.bom = { per: cur.per, lines: cur.lines }; return r;
  }

  /* ---------- multi-level bill of materials ----------
     explode(items, name, qty, date, opt): opt.use { key: true } = sub-parts taken from stock (not made here),
     opt.ver { key: version name }. Returns { ok, err ('nobom' | 'loop'), loop: [names], raw: [{ desc, qty, unit }] (merged),
     subs: [{ desc, qty, unit, level, ver }] (made inside this entry), tree } */
  function explode(items, name, qty, date, opt) {
    opt = opt || {}; var M = byName(items), use = opt.use || {}, ver = opt.ver || {}, raw = {}, rawOrder = [], subs = [], loop = null;
    var top = M[key(name)], tb = pickBom(top, date, ver[key(name)]);
    if (!tb) return { ok: false, err: 'nobom', raw: [], subs: [], tree: null };
    function walk(nm, q, path, level, b) {
      var k = key(nm), m = M[k], node = { desc: m ? m.desc : nm, qty: r3(q), unit: m && m.unit || '', level: level, kids: [] };
      if (loop) return node;
      if (path.indexOf(k) >= 0) { loop = path.concat([k]).map(function (x) { return M[x] ? M[x].desc : x; }); return node; }
      if (level > 12) { loop = path.map(function (x) { return M[x] ? M[x].desc : x; }); return node; }
      b = b || (level > 0 && !use[k] ? pickBom(m, date, ver[k]) : null);
      if (!b) {
        if (!raw[k]) { raw[k] = { desc: node.desc, qty: 0, unit: node.unit }; rawOrder.push(k); }
        raw[k].qty = r3(raw[k].qty + q); node.raw = true; return node;
      }
      node.ver = b.name || '';
      if (level > 0) subs.push({ desc: node.desc, qty: r3(q), unit: node.unit, level: level, ver: node.ver });
      var per = num(b.per) || 1;
      (b.lines || []).forEach(function (l) {
        var cm = M[key(l.desc)], lq = num(l.qty) * factor(cm, l.unit) * q / per;
        if (lq) node.kids.push(walk(l.desc, lq, path.concat([k]), level + 1));
      });
      return node;
    }
    var tree = walk(name, num(qty), [], 0, tb);
    if (loop) return { ok: false, err: 'loop', loop: loop, raw: [], subs: [], tree: tree };
    return { ok: true, ver: tb.name || '', raw: rawOrder.map(function (k) { return raw[k]; }), subs: subs, tree: tree };
  }
  /* would saving this BOM make a loop? (a part that, through its own BOMs, needs the finished item) -> path or null */
  function bomLoop(items, name, lines) {
    var M = byName(items), seen = {};
    function walk(k, path) {
      if (k === key(name)) return path;
      if (seen[k]) return null; seen[k] = 1;
      var out = null;
      bomList(M[k]).forEach(function (b) { (b.lines || []).forEach(function (l) { if (!out) out = walk(key(l.desc), path.concat([l.desc])); }); });
      return out;
    }
    for (var i = 0; i < (lines || []).length; i++) { var p = walk(key(lines[i].desc), [name, lines[i].desc]); if (p) return p; }
    return null;
  }

  /* ---------- cost of a production entry ---------- */
  function byValue(by) { return r2((by || []).reduce(function (s, b) { return s + num(b.qty) * num(b.rate); }, 0)); }
  function makeTotals(raw, extra, by, qty) {
    var bv = byValue(by), gross = r2(num(raw) + num(extra)), total = r2(gross - bv), q = num(qty);
    return { raw: r2(num(raw)), extra: r2(num(extra)), by: bv, gross: gross, total: total, per: q ? r2(total / q) : 0, tooBig: bv > gross };
  }

  /* ---------- records for the stock register ---------- */
  function conv(M, arr, qk) { return (arr || []).map(function (it) { return toBase(M[key(it && it.desc)], it, qk); }); }
  function expand(docs, items) {
    var M = byName(items), out = [], any = true;   /* every line in another unit becomes base units (I-3: units of the unit master too) */
    (docs || []).forEach(function (d) {
      if (!d) return;
      if (any && d.type !== 'stk' && d.items) { d = Object.assign({}, d, { items: conv(M, d.items) }); }
      if (d.type !== 'stk') { out.push(d); return; }
      if (any) { d = Object.assign({}, d); if (d.lines) d.lines = conv(M, d.lines, d.kind === 'jobin' ? ['back', 'lost'] : 'qty'); if (d.out && d.out.desc) d.out = toBase(M[key(d.out.desc)], d.out); if (d.by) d.by = conv(M, d.by); if (d.items && /^(grn|rejin|rejout)$/.test(d.kind || '')) d.items = conv(M, d.items); }
      if (d.kind === 'make' && (d.by || []).length) {
        out.push(d);
        d.by.forEach(function (b) { if (b.desc && num(b.qty)) out.push(Object.assign({}, d, { by: null, lines: [], out: { desc: b.desc, unit: b.unit, qty: num(b.qty), rate: num(b.rate), batch: '' }, _by: 1 })); });
        return;
      }
      if (d.kind === 'jobout') { out.push(Object.assign({}, d, { kind: 'move', from: d.gd || '', to: jwPlace(d.worker), lines: (d.lines || []).map(function (l) { return { desc: l.desc, unit: l.unit, qty: num(l.qty), batch: l.batch || '' }; }), _job: 'out' })); return; }
      if (d.kind === 'jobin') {
        var place = jwPlace(d.worker), back = (d.lines || []).filter(function (l) { return num(l.back); }), lost = (d.lines || []).filter(function (l) { return num(l.lost); });
        if (d.out && d.out.desc && num(d.out.qty)) {
          out.push(Object.assign({}, d, { kind: 'make', gd: place, by: null, lines: back.map(function (l) { return { desc: l.desc, unit: l.unit, qty: num(l.back) }; }), out: d.out, _job: 'in' }));
          out.push(Object.assign({}, d, { kind: 'move', from: place, to: d.gd || '', lines: [{ desc: d.out.desc, unit: d.out.unit, qty: num(d.out.qty), batch: d.out.batch || '' }], _job: 'in' }));
        } else if (back.length) out.push(Object.assign({}, d, { kind: 'move', from: place, to: d.gd || '', lines: back.map(function (l) { return { desc: l.desc, unit: l.unit, qty: num(l.back) }; }), _job: 'in' }));
        if (lost.length) out.push(Object.assign({}, d, { kind: 'adj', gd: place, lines: lost.map(function (l) { return { desc: l.desc, unit: l.unit, qty: -num(l.lost), reason: 'jwloss' }; }), _job: 'lost' }));
        return;
      }
      out.push(d);
    });
    return out;
  }

  /* ---------- job work: what is still with the job workers ---------- */
  function days(a, b) { return Math.floor((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function addDays(a, n) { return new Date(Date.parse(a + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function addYears(a, n) { var d = new Date(Date.parse(a + 'T00:00:00Z')); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); }
  function mine(docs, biz) { var b = key(biz); return (docs || []).filter(function (d) { return d && (!b || key(d.seller && d.seller.name) === b); }); }
  /* one row per line sent: { d (jobout), desc, unit, sent, back, lost, left, days, cap, due (last day to get it back), over, soon, ins (jobin docs) } */
  function pending(docs, biz, today, all) {
    var D = mine(docs, biz), IN = {};
    D.forEach(function (d) { if (d.type === 'stk' && d.kind === 'jobin' && d.ref && (!today || d.date <= today)) (IN[d.ref] = IN[d.ref] || []).push(d); });
    var rows = [];
    D.filter(function (d) { return d.type === 'stk' && d.kind === 'jobout' && (!today || d.date <= today); }).forEach(function (d) {
      (d.lines || []).forEach(function (l) {
        var k = key(l.desc), back = 0, lost = 0;
        (IN[d.id] || []).forEach(function (r) { (r.lines || []).forEach(function (x) { if (key(x.desc) === k) { back += num(x.back); lost += num(x.lost); } }); });
        var sent = num(l.qty), left = r3(sent - back - lost), due = addDays(addYears(d.date, l.cap ? 3 : 1), -1), n = today ? days(d.date, today) : 0;
        var row = { d: d, desc: l.desc, unit: l.unit || '', sent: r3(sent), back: r3(back), lost: r3(lost), left: left, days: n, cap: !!l.cap, due: due,
          over: left > 0.0005 && today > due, soon: left > 0.0005 && today <= due && days(today, due) <= 30, ins: IN[d.id] || [] };
        if (all || left > 0.0005) rows.push(row);
      });
    });
    return rows.sort(function (a, b) { return a.d.date.localeCompare(b.d.date); });
  }

  /* ---------- ITC-04 ---------- */
  var UQC = { nos: 'NOS', no: 'NOS', number: 'NOS', numbers: 'NOS', pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', kg: 'KGS', kgs: 'KGS', kilogram: 'KGS', g: 'GMS', gm: 'GMS', gms: 'GMS', gram: 'GMS',
    box: 'BOX', boxes: 'BOX', mtr: 'MTR', m: 'MTR', metre: 'MTR', meter: 'MTR', ltr: 'LTR', l: 'LTR', litre: 'LTR', liter: 'LTR', ml: 'MLT', bag: 'BAG', bags: 'BAG', set: 'SET', sets: 'SET',
    doz: 'DOZ', dozen: 'DOZ', ton: 'TON', tonne: 'TON', mt: 'MTS', qtl: 'QTL', quintal: 'QTL', sqm: 'SQM', sqft: 'SQF', 'sq ft': 'SQF', roll: 'ROL', rolls: 'ROL', pack: 'PAC', pkt: 'PAC', packet: 'PAC',
    btl: 'BTL', bottle: 'BTL', ctn: 'CTN', carton: 'CTN', gross: 'GRS', strip: 'STR', strips: 'STR', pair: 'PRS', pairs: 'PRS', bundle: 'BDL', bdl: 'BDL', can: 'CAN', drum: 'DRM', tube: 'TUB', unit: 'UNT', units: 'UNT', cm: 'CMS', km: 'KME' };
  function uqc(u) { var k = key(u).replace(/\.$/, ''); return UQC[k] || (/^[A-Z]{3}$/.test(String(u || '').trim()) ? String(u).trim() : 'OTH'); }
  function stateOf(p) { var g = String(p && p.gstin || '').trim(); return /^\d{2}/.test(g) ? g.slice(0, 2) : String(p && p.state || '').trim(); }
  /* filing periods of a financial year 'YYYY-YY': half-yearly (AATO above Rs 5 crore) or the whole year */
  function periods(fy, half) {
    var y = +String(fy).slice(0, 4), a = y + '-04-01', s = y + '-09-30', o = y + '-10-01', e = (y + 1) + '-03-31';
    return half ? [{ id: 'h1', from: a, to: s, due: y + '-10-25' }, { id: 'h2', from: o, to: e, due: (y + 1) + '-04-25' }] : [{ id: 'fy', from: a, to: e, due: (y + 1) + '-04-25' }];
  }
  /* Table 4 (sent to job workers) and Table 5A (received back) for a period */
  function itc04(docs, biz, from, to) {
    var D = mine(docs, biz), byId = {};
    D.forEach(function (d) { if (d.id) byId[d.id] = d; });
    function inP(d) { return d.date >= from && d.date <= to; }
    var sent = [], back = [];
    D.filter(function (d) { return d.type === 'stk' && d.kind === 'jobout' && inP(d); }).sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (d) {
      var w = d.worker || {}, inter = stateOf(d.seller) && stateOf(w) && stateOf(d.seller) !== stateOf(w);
      (d.lines || []).forEach(function (l) {
        var g = num(l.gst), q = num(l.qty);
        sent.push({ gstin: w.gstin || '', state: stateOf(w), name: w.name || '', dc: d.dc || d.no || '', date: d.date, type: l.cap ? 'Capital goods' : 'Inputs', desc: l.desc, uqc: uqc(l.unit), qty: r3(q),
          value: r2(q * num(l.rate)), igst: inter ? g : '', cgst: inter ? '' : g / 2, sgst: inter ? '' : g / 2, cess: '' });
      });
    });
    D.filter(function (d) { return d.type === 'stk' && d.kind === 'jobin' && inP(d); }).sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (d) {
      var o = byId[d.ref] || {}, w = d.worker || o.worker || {};
      (d.lines || []).forEach(function (l) {
        if (!num(l.back) && !num(l.lost)) return;
        back.push({ gstin: w.gstin || '', state: stateOf(w), name: w.name || '', wdc: d.wdc || '', date: d.date, desc: l.desc, uqc: uqc(l.unit), qty: r3(num(l.back)),
          odc: o.dc || o.no || '', odate: o.date || '', nature: d.nature || '', lossUqc: num(l.lost) ? uqc(l.unit) : '', loss: num(l.lost) ? r3(num(l.lost)) : '' });
      });
    });
    return { sent: sent, back: back };
  }

  var API = { num: num, r2: r2, r3: r3, key: key, JW: JW, jwPlace: jwPlace, isJw: isJw, altOf: altOf, factor: factor, toBase: toBase, split: split, altText: altText,
    bomList: bomList, pickBom: pickBom, saveVersion: saveVersion, dropVersion: dropVersion, explode: explode, bomLoop: bomLoop, byValue: byValue, makeTotals: makeTotals,
    expand: expand, pending: pending, periods: periods, itc04: itc04, uqc: uqc, stateOf: stateOf, addYears: addYears, days: days };
  API.setUnits = setUnits; API.unitMaster = unitMaster; API.altsOf = altsOf; API.unitOk = unitOk; API.unitsOf = unitsOf; API.ukey = ukey; API.FIXED = FIXED;   /* I-3 */
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSMfg = API;
})(this);
