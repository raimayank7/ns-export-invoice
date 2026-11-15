/* NS cashare (gap round, 2026-11-14): the accountant (CA) hand-over FILE, pure functions (no screen, no storage).
   There is no server and no shared login: the owner packs the books of one business for a period into ONE read-only file
   (".nsca", plain JSON) and sends it by WhatsApp or email. The CA opens it on ca.niveshsahayak.in (works offline), reads, searches,
   adds queries and comments, and sends back a small comments file (".nsca-comments") that the owner loads to see them beside the entries.
     build(lists, opts)            -> the share object (with checksum). Only what the owner ticked goes in:
                                      always: the chosen business, its documents up to the period end, the parties named in them, items, settings needed for the reports
                                      opts.orders  quotations, proforma invoices, sales orders, challans, purchase orders (not in the books)   default off
                                      opts.staff   salary slips, staff advances, loans/EMI, employee list, petty cash                           default off
                                      opts.phones  phone numbers, e-mail addresses and WhatsApp numbers of parties and documents               default off
                                      opts.bank    the business's own bank account, IFSC and UPI id                                             default off
                                      never:       the PIN, backup and sync settings, logos, signatures, stamps and photos (large and not needed), the recycle bin
     verify(share)                 -> { ok, sha, code }   the checksum is SHA-256 of the file's content without the checksum itself
     comments: newComments, addComment, mergeComments, openCount, sealComments, verifyComments
   The checksum shows a change by accident or by a careless edit. It does not stop someone who edits the file and recomputes it: the owner
   therefore reads out the short check code (the first 16 characters, in groups of four) in the message that carries the file. */
(function (G) {
  'use strict';
  var FORMAT = 'nivesh-sahayak-ca-share', CFORMAT = 'nivesh-sahayak-ca-comments', VERSION = 1;

  /* ---------- SHA-256 (pure, so it also works on http pages and in node tests) ---------- */
  var K256 = (function () { var k = [], n = 2, c = 0; function prime(x) { for (var i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; }
    while (c < 64) { if (prime(n)) { k.push(Math.floor((Math.pow(n, 1 / 3) % 1) * 4294967296) >>> 0); c++; } n++; } return k; })();
  var H0 = (function () { var h = [], n = 2, c = 0; function prime(x) { for (var i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; }
    while (c < 8) { if (prime(n)) { h.push(Math.floor((Math.pow(n, 1 / 2) % 1) * 4294967296) >>> 0); c++; } n++; } return h; })();
  function utf8(s) {
    var o = [], i, c;
    s = String(s);
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
      if (c < 128) o.push(c);
      else if (c < 2048) o.push(192 | c >> 6, 128 | c & 63);
      else if (c < 65536) o.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
      else o.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
    }
    return o;
  }
  function sha256(str) {
    var b = utf8(str), l = b.length, h = H0.slice(), w = new Array(64), i, j, t1, t2;
    b.push(128); while (b.length % 64 !== 56) b.push(0);
    var hi = Math.floor(l / 536870912), lo = (l << 3) >>> 0;
    b.push(hi >>> 24 & 255, hi >>> 16 & 255, hi >>> 8 & 255, hi & 255, lo >>> 24 & 255, lo >>> 16 & 255, lo >>> 8 & 255, lo & 255);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < b.length; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (b[i + 4 * j] << 24 | b[i + 4 * j + 1] << 16 | b[i + 4 * j + 2] << 8 | b[i + 4 * j + 3]) >>> 0;
      for (j = 16; j < 64; j++) { var s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3), s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0; }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (j = 0; j < 64; j++) {
        t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K256[j] + w[j]) >>> 0;
        t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      h = [(h[0] + a) >>> 0, (h[1] + bb) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0, (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0];
    }
    return h.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }
  /* the same text for the same content wherever it was written: keys in sorted order */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function code(sha) { return sha.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-'); }
  function copy(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- what is in the file ---------- */
  var ORDER_TYPES = { quote: 1, proforma: 1, so: 1, challan: 1, po: 1 };
  var STAFF_TYPES = { salary: 1, salpay: 1, sadv: 1, loan: 1, emi: 1, petty: 1, pettyl: 1 };
  var HEAVY = /^(logo|sign|signature|stamp|photo|image|img|qr|upiQr|pic)$/i;
  var PHONE = /^(phone|mobile|email|mail|whatsapp|wa|tel|contact)$/i;
  var BANK = /^(bank|bankName|bankAcc|bankIfsc|bankBranch|acc|ifsc|upi|upiId|accNo|accountNo)$/i;
  /* remove (recursively) the keys matching the patterns; large data-URL strings (pictures) always go */
  function scrub(o, kill) {
    if (Array.isArray(o)) return o.map(function (x) { return scrub(x, kill); });
    if (o && typeof o === 'object') {
      var out = {};
      Object.keys(o).forEach(function (k) {
        if (HEAVY.test(k) || kill.some(function (re) { return re.test(k); })) return;
        out[k] = scrub(o[k], kill);
      });
      return out;
    }
    if (typeof o === 'string' && o.length > 4000 && /^data:/.test(o)) return undefined;
    return o;
  }
  function docIsStaff(d) { return !!STAFF_TYPES[d.type]; }
  function docKeep(d, o) {
    if (ORDER_TYPES[d.type] && !o.orders) return false;
    if (docIsStaff(d) && !o.staff) return false;
    return true;
  }
  var META_DROP = ['pin', 'prefs', 'lastBackup', 'lockBefore', 'features'];
  function safeSettings(S, o) {
    var s = copy(S || {});
    META_DROP.forEach(function (k) { delete s[k]; });
    if (s.byBiz) Object.keys(s.byBiz).forEach(function (b) { META_DROP.forEach(function (k) { delete s.byBiz[b][k]; }); });
    return s;
  }
  /* lists = { biz:[], party:[], item:[], doc:[], meta:{ settings, groups, heads, <others by id> } }
     opts = { biz: name, from, to, earlier (default true), orders, staff, phones, bank, items (default true), note, by } */
  function build(lists, o) {
    o = o || {};
    var bk = key(o.biz), from = o.from || '', to = o.to || '9999-12-31', earlier = o.earlier !== false;
    var kill = [];
    if (!o.phones) kill.push(PHONE);
    if (!o.bank) kill.push(BANK);
    var docs = (lists.doc || []).filter(function (d) {
      if (!d || d.sample || key(d.seller && d.seller.name) !== bk) return false;
      if (d.date && d.date > to) return false;
      if (!earlier && d.date && d.date < from) return false;
      return docKeep(d, o);
    }).map(function (d) { return scrub(d, kill); });
    var names = {};
    docs.forEach(function (d) { if (d.buyer && d.buyer.name) names[key(d.buyer.name)] = 1; });
    var biz = (lists.biz || []).filter(function (b) { return key(b.name) === bk; }).map(function (b) { return scrub(b, kill); });
    var party = (lists.party || []).filter(function (p) { return p && !p.sample && names[key(p.name)]; }).map(function (p) { return scrub(p, kill); });
    var item = o.items === false ? [] : (lists.item || []).filter(function (i) { return i && !i.sample; }).map(function (i) { return scrub(i, kill); });
    var meta = {}, M = lists.meta || {};
    Object.keys(M).forEach(function (id) {
      if (M[id] === undefined || M[id] === null) return;
      if (id === 'settings') meta.settings = safeSettings(M.settings, o);
      else if (id === 'groups' || id === 'heads' || /^(gstr3b|fa)/i.test(id)) meta[id] = copy(M[id]);
      else if (id === 'staff' && o.staff) meta.staff = copy(M.staff);
    });
    var staffN = docs.filter(docIsStaff).length;
    var share = {
      format: FORMAT, version: VERSION, id: uid(), created: new Date().toISOString(),
      business: { name: biz[0] ? biz[0].name : o.biz, gstin: biz[0] && biz[0].gstin || '' },
      period: { from: from, to: to === '9999-12-31' ? '' : to, earlier: earlier },
      scope: { items: o.items !== false, orders: !!o.orders, staff: !!o.staff, phones: !!o.phones, bank: !!o.bank },
      note: String(o.note || ''), by: String(o.by || ''),
      counts: { docs: docs.length, parties: party.length, items: item.length, staff: staffN },
      data: { biz: biz, party: party, item: item, doc: docs, meta: meta }
    };
    return seal(share);
  }
  function body(s) { var c = {}; Object.keys(s).forEach(function (k) { if (k !== 'sha256') c[k] = s[k]; }); return canon(c); }
  function seal(s) { s.sha256 = sha256(body(s)); return s; }
  function verify(s) {
    if (!s || s.format !== FORMAT || !s.data) return { ok: false, why: 'format' };
    if (s.version > VERSION) return { ok: false, why: 'newer' };
    var sha = sha256(body(s));
    return { ok: sha === s.sha256, sha: sha, code: code(sha), stored: s.sha256 || '', storedCode: code(s.sha256 || '') };
  }
  /* "what is not in this file" for the owner and the CA, in plain words (keys of the screen text, filled by the caller) */
  function leftOut(s) {
    var sc = s.scope || {}, out = [];
    if (!sc.orders) out.push('orders'); if (!sc.staff) out.push('staff'); if (!sc.phones) out.push('phones'); if (!sc.bank) out.push('bank');
    return out;
  }

  /* ---------- queries and comments ---------- */
  /* ref = { kind: 'doc' | 'party' | 'screen' | 'general', id, label }  (doc: the document id, party: name key, screen: the page address, label: words to show) */
  function newComments(share) { return { format: CFORMAT, version: VERSION, shareId: share.id, shareCode: code(share.sha256 || ''), business: share.business && share.business.name || '', items: [] }; }
  function addComment(cf, ref, text, kind, by) {
    text = String(text || '').trim(); if (!text) return null;
    var c = { id: uid(), ref: { kind: ref && ref.kind || 'general', id: ref && ref.id || '', label: ref && ref.label || '' }, kind: kind === 'note' ? 'note' : 'query', text: text, by: String(by || ''), at: new Date().toISOString(), status: 'open', reply: '', repliedAt: '' };
    cf.items.push(c); return c;
  }
  /* bring a comments file into the owner's list: same comment id = keep the newer state (replied/closed wins over open) */
  function mergeComments(have, inc) {
    have = have || { items: [] };
    var m = {};
    (have.items || []).forEach(function (c) { m[c.id] = c; });
    var added = 0, changed = 0;
    ((inc && inc.items) || []).forEach(function (c) {
      var h = m[c.id];
      if (!h) { m[c.id] = copy(c); added++; return; }
      var rank = function (x) { return (x.status === 'closed' ? 2 : x.reply ? 1 : 0); };
      if (rank(c) > rank(h) || (rank(c) === rank(h) && String(c.repliedAt || c.at) > String(h.repliedAt || h.at))) { m[c.id] = copy(c); changed++; }
    });
    var out = Object.assign({}, have, { format: CFORMAT, version: VERSION, shareId: have.shareId || inc && inc.shareId, shareCode: have.shareCode || inc && inc.shareCode, business: have.business || inc && inc.business,
      items: Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }) });
    return { file: out, added: added, changed: changed };
  }
  function openCount(cf) { return ((cf && cf.items) || []).filter(function (c) { return c.status !== 'closed'; }).length; }
  function sealComments(cf) { cf.sha256 = sha256(canon(Object.assign({}, cf, { sha256: undefined }))); return cf; }
  function verifyComments(cf) {
    if (!cf || cf.format !== CFORMAT || !Array.isArray(cf.items)) return { ok: false, why: 'format' };
    return { ok: !cf.sha256 || sha256(canon(Object.assign({}, cf, { sha256: undefined }))) === cf.sha256 };
  }
  /* a document in a few words for lists (the entry next to a comment) */
  function brief(d) {
    if (!d) return '';
    var t = { invoice: 'Invoice', cashmemo: 'Cash memo', pbill: 'Purchase bill', receipt: 'Receipt', voucher: 'Voucher', exp: 'Expense', note: d.kind === 'debit' ? 'Debit note' : 'Credit note', self: 'Self invoice', fee: 'Fee receipt', jv: 'Journal', ob: 'Opening balance', contra: 'Contra' }[d.type || 'invoice'] || d.type;
    return [t, d.no || d.billNo || '', d.date || '', d.buyer && d.buyer.name || ''].filter(Boolean).join(' · ');
  }

  var API = { FORMAT: FORMAT, CFORMAT: CFORMAT, VERSION: VERSION, sha256: sha256, canon: canon, code: code, build: build, verify: verify, seal: seal, leftOut: leftOut, newComments: newComments, addComment: addComment, mergeComments: mergeComments,
    openCount: openCount, sealComments: sealComments, verifyComments: verifyComments, brief: brief, key: key, uid: uid, docIsStaff: docIsStaff };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSCAshare = API;
})(this);
