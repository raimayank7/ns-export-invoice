/* NSStore: the one place every Nivesh Sahayak document site keeps its data.
   It talks to the shared data home (my.niveshsahayak.in) in a hidden frame, so masters are shared across sites.
   If that frame can't load (first visit while offline, blocked), it keeps data in this site's own browser storage
   and moves it into the data home the next time the frame works.
   Batch 1 safety, here so every site gets it:
     recycle bin   a deleted business, party, item or document is kept 30 days in store 'bin' ({id: '<store>:<id>', store, rec, at, who}); restore() puts it back
     edit history  every add, change, delete and restore of those records is added to store 'log' ({id, at, who, site, store, rid, act, no, type, name, ch: [[field, from, to]]});
                   nothing here edits or removes a log entry (Companies (Accounts) Rules 2014, rule 3(1) proviso: audit trail from 1 April 2023)
     period lock   settings.lockBefore 'YYYY-MM-DD': documents dated before it can't be added, changed or deleted (only payment status may change)
   Sample records (sample: true, getting-started wizard) are left out of the history and skip the bin when removed. */
(function () {
  'use strict';
  var STORES = ['biz', 'party', 'item', 'doc', 'meta', 'bin', 'log', 'ver'];   /* ver: full earlier versions (ERP Round 1, A-2) */
  var KEPT = { biz: 1, party: 1, item: 1, doc: 1 }, BIN_DAYS = 30, KEEPS = { log: 1, ver: 1 };
  var cfg = window.NS_CFG || {};
  var VAULT = cfg.vault || 'https://my.niveshsahayak.in/vault.html';
  var VAULT_ORIGIN = new URL(VAULT, location.href).origin;
  var frame, seq = 0, waiting = {}, mode = null, readyP;

  /* ---------- local fallback (same operations, this site's own IndexedDB) ---------- */
  var ldbp;
  function ldb() {
    if (ldbp) return ldbp;
    ldbp = new Promise(function (res, rej) {
      var r = indexedDB.open('ns-local', 3);
      r.onupgradeneeded = function () { STORES.forEach(function (s) { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); }); };
      r.onblocked = blockedNote;
      var slow = setTimeout(blockedNote, 4000);   /* "blocked" reaches only the first waiting page; later ones just wait */
      r.onsuccess = function () {
        clearTimeout(slow);
        var d = r.result;
        d.onversionchange = function () { d.close(); ldbp = null; };   /* a newer page needs to upgrade: let it */
        unblocked();
        res(d);
      };
      r.onerror = function () { clearTimeout(slow); rej(r.error); };
    });
    return ldbp;
  }
  function ltx(store, m, fn) {
    return ldb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, m), out = fn(t.objectStore(store));
        t.oncomplete = function () { res(out && 'result' in out ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  var LOCAL = {
    list: function (a) { return ltx(a.store, 'readonly', function (s) { return s.getAll(); }); },
    get: function (a) { return ltx(a.store, 'readonly', function (s) { return s.get(a.id); }); },
    put: function (a) { var l = Array.isArray(a.value) ? a.value : [a.value]; return ltx(a.store, 'readwrite', function (s) { l.forEach(function (v) { s.put(v); }); }); },
    del: function (a) { return ltx(a.store, 'readwrite', function (s) { s.delete(a.id); }); },
    clear: function (a) { return ltx(a.store, 'readwrite', function (s) { s.clear(); }); },
    exportAll: function () {
      var out = {};
      return Promise.all(STORES.map(function (s) { return LOCAL.list({ store: s }).then(function (r) { out[s] = r; }); })).then(function () { return out; });
    },
    importAll: function (a) {
      var data = a.data || {}, n = 0;
      return Promise.all(STORES.map(function (s) {
        var rows = (data[s] || []).filter(function (r) { return r && r.id; });
        return (a.replace && !KEEPS[s] ? LOCAL.clear({ store: s }) : Promise.resolve()).then(function () { return LOCAL.list({ store: s }); }).then(function (have) {
          var map = {}; have.forEach(function (h) { map[h.id] = h; });
          var put = rows.filter(function (r) { return !map[r.id] || !KEEPS[s] && (r.updated || 0) > (map[r.id].updated || 0); });   /* history: add only */
          n += put.length;
          return put.length ? LOCAL.put({ store: s, value: put }) : 0;
        });
      })).then(function () { return n; });
    },
    logAdd: function (a) { return LOCAL.importAll({ data: { log: [].concat(a.value) } }); },   /* sealed when it moves into the data home */
    logCheck: function () { return Promise.resolve(null); },
    persist: function () { return navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false); },
    estimate: function () { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null); }
  };

  /* an older tab of a Nivesh Sahayak site (opened before an update) still holds the data: nothing can load until it closes */
  /* a bar that stays until the data opens (it goes away by itself once the other tab is closed or reloaded) */
  function blockedNote() {
    if (document.getElementById('ns-blocked') || !document.body) return;
    var t = window.NS && NS.t ? NS.t('db.blocked') : 'Close the other Nivesh Sahayak tabs, or reload them. This page then continues by itself.';
    var bar = document.createElement('div');
    bar.id = 'ns-blocked'; bar.className = 'remind'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<div class="wrap"><span></span> <button type="button" class="btn sm"></button></div>';
    bar.firstChild.firstChild.textContent = t;
    /* once the old tab is closed the data opens, but a page that already fell back to its own storage needs one reload */
    var rb = bar.querySelector('button'); rb.textContent = window.NS && NS.t ? NS.t('blk.reload') : 'Reload the page';
    rb.onclick = function () { location.reload(); };
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function unblocked() { var b = document.getElementById('ns-blocked'); if (b) b.remove(); }
  window.addEventListener('message', function (e) {
    if (e.origin !== VAULT_ORIGIN || !e.data || e.data.ns !== 'vault') return;
    if (e.data.blocked) blockedNote(); else if ('ready' in e.data) unblocked();
    /* the data home saw a change made in this or another tab ('chg'): the App's auto save writes the file (core.js) */
    if (e.data.af) document.dispatchEvent(new CustomEvent('ns-autosave', { detail: e.data.af }));
  });

  /* ---------- the App's own copy of a maker (/do/<site>/, NS_CFG.inApp) uses the App's open data home ---------- */
  /* (speed, 2026-11-06) the App page around it (same origin) already holds the data home frame: every call goes through the App's
     NSStore, so a document opens without loading my.niveshsahayak.in a second time, and the records are the very same. Opened
     on its own (no App around it), the page works as everywhere else. */
  var host = null;
  try { if (cfg.inApp && window.parent !== window && window.parent.NSStore && window.parent.NSStore._call) host = window.parent.NSStore; } catch (e) { host = null; }
  if (host) {   /* the App switched to the data home late (slow first load): this page redraws too */
    try { window.parent.document.addEventListener('ns-data', function () { document.dispatchEvent(new CustomEvent('ns-data')); }); } catch (e) {}
  }

  /* ---------- the shared data home ---------- */
  var LONG = { snapshot: 1, restoreFiles: 1, deskBackup: 1 };   /* Stage 4: copying or bringing back the data files can take a while on big data */
  /* a save on a busy computer can take longer than 15 s and still go through: giving up early showed 'Could not save' (and the screen kept the bill that was in fact saved) while the data was written (real-use test R-001, R-005, R-024) */
  var SLOWW = { put: 1, del: 1, clear: 1, importAll: 1 };
  /* a read that gets no answer (a busy computer, a page that was reloaded a moment ago) is asked once more before it fails: reading changes nothing, and the App then does not stay empty (R-001) */
  var READ = { list: 1, get: 1 };
  function send(op, args) {
    var first = send1(op, args);
    return READ[op] ? first.catch(function (e) { return e && /did not answer/.test(e.message) ? send1(op, args) : Promise.reject(e); }) : first;
  }
  function send1(op, args) {
    if (host) return host._send(op, args);
    return new Promise(function (res, rej) {
      var id = ++seq;
      waiting[id] = { res: res, rej: rej, t: setTimeout(function () { delete waiting[id]; rej(new Error('The data home did not answer')); }, LONG[op] ? 600000 : SLOWW[op] ? 60000 : 15000) };
      frame.contentWindow.postMessage({ ns: 'vault', id: id, op: op, args: args || {} }, VAULT_ORIGIN);
    });
  }
  /* a change of saved data: the auto save (core.js) writes the backup file a moment later. Its own marks (lastBackup, autosave) are not changes. */
  var CHG = { put: 1, del: 1, clear: 1, importAll: 1 }, CHG_SKIP = { lastBackup: 1, autosave: 1 };
  function changedOp(op, args) {
    if (!CHG[op]) return false;
    if (args && args.store === 'meta') { var v = [].concat(args.value || { id: args.id }); if (v.every(function (x) { return x && CHG_SKIP[x.id]; })) return false; }
    return true;
  }
  function call(op, args) {
    if (host) return host._call(op, args);
    return ready().then(function () { return mode === 'local' ? LOCAL[op](args || {}) : send(op, args); }).then(function (r) {
      if (changedOp(op, args)) document.dispatchEvent(new CustomEvent('ns-saved'));
      return r;
    });
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== VAULT_ORIGIN || !e.data || e.data.ns !== 'vault' || !e.data.id) return;
    var w = waiting[e.data.id];
    if (!w) return;
    clearTimeout(w.t); delete waiting[e.data.id];
    e.data.ok ? w.res(e.data.result) : w.rej(new Error(e.data.result));
    /* logins on (SQLite Stage 2) and this tab is not logged in, or the login ended: the page shows the login box (core.js) */
    if (!e.data.ok && /^NSAUTH: (login|this browser)/.test(String(e.data.result || ''))) document.dispatchEvent(new CustomEvent('ns-login', { detail: String(e.data.result) }));
  });

  function ready() {
    if (readyP) return readyP;
    if (host) return (readyP = host.ready().then(function (m) { mode = m; return m; }));
    readyP = new Promise(function (res) {
      var done = false;
      function finish(m) { if (done) return; done = true; mode = m; res(m); }
      if (!('indexedDB' in window)) return finish('local');
      var early = window.__nsVF;   /* the App home started the data home from its head (build.py) */
      if (early && early.src === VAULT) {
        frame = early;
        if (window.__nsVR) { var r0 = window.__nsVR; window.__nsVR = null; return finish(r0.ready ? 'vault' : 'local'); }
      } else early = null;
      if (!early) { frame = document.createElement('iframe'); frame.src = VAULT; }
      frame.title = 'Nivesh Sahayak data home';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;width:1px;height:1px;border:0;left:0;top:0;opacity:0;pointer-events:none;clip-path:inset(50%)';
      function onMsg(e) {
        if (e.origin !== VAULT_ORIGIN || !e.data || e.data.ns !== 'vault' || !('ready' in e.data)) return;
        window.removeEventListener('message', onMsg);
        if (!done) return finish(e.data.ready ? 'vault' : 'local');
        /* the data home answered after this page gave up waiting (slow first load on mobile data): switch to it now,
           bring in anything saved here meanwhile, and let the page draw again ('ns-data') */
        if (e.data.ready && mode === 'local') {
          mode = 'vault';
          var redraw = function () { document.dispatchEvent(new CustomEvent('ns-data')); };
          moveLocalIntoVault().then(redraw, redraw);
        }
      }
      window.addEventListener('message', onMsg);
      setTimeout(function () { finish('local'); }, 6000);
      if (!early) (document.body || document.documentElement).appendChild(frame);
    }).then(function (m) {
      if (m === 'vault') return moveLocalIntoVault().then(function () { return m; }, function () { return m; });
      return m;
    });
    return readyP;
  }
  /* anything saved while the data home was unreachable is moved in, then removed here */
  function moveLocalIntoVault() {
    return LOCAL.exportAll().then(function (data) {
      var n = STORES.reduce(function (a, s) { return a + (data[s] || []).length; }, 0);
      if (!n) return;
      return send('importAll', { data: data }).then(function () {
        return Promise.all(STORES.map(function (s) { return LOCAL.clear({ store: s }); }));
      });
    });
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- edit history ---------- */
  var who = null;
  function whoName() {
    if (who != null) return Promise.resolve(who);
    return call('get', { store: 'meta', id: 'who' }).then(function (r) { who = r && r.v || ''; return who; }, function () { return ''; });
  }
  /* field-by-field changes; pictures and long text are shortened so the history stays small */
  function flat(o, pre, out) {
    out = out || {};
    if (o == null || typeof o !== 'object') { out[pre] = o; return out; }
    Object.keys(o).forEach(function (k) {
      if (!pre && (k === 'id' || k === 'created' || k === 'updated')) return;
      var v = o[k], p = pre ? pre + '.' + k : k;
      if (v && typeof v === 'object') flat(v, p, out); else out[p] = v;
    });
    return out;
  }
  function short(v) {
    if (v == null || v === '') return '';
    v = String(v);
    return /^data:/.test(v) ? '[picture]' : v.length > 120 ? v.slice(0, 117) + '...' : v;
  }
  function diff(a, b) {
    var A = flat(a || {}, ''), B = flat(b || {}, ''), ch = [];
    Object.keys(Object.assign({}, A, B)).forEach(function (k) { var x = short(A[k]), y = short(B[k]); if (x !== y) ch.push([k, x, y]); });
    return ch;
  }
  /* ERP Round 1, A-1: the data home seals each entry onto a hash chain ('logAdd'); an older data home just stores it */
  function logEntry(e) { return call('logAdd', { value: e }).catch(function (err) { if (/Unknown operation/.test(err && err.message)) return call('put', { store: 'log', value: e }); throw err; }); }
  function addLog(store, act, rec, ch, extra) {
    if (!KEPT[store] && store !== 'meta' || rec && rec.sample) return Promise.resolve();
    return whoName().then(function (w) {
      var e = Object.assign({ id: uid(), at: Date.now(), who: w, site: location.hostname, store: store, rid: rec && rec.id, act: act,
        no: rec && (rec.no || rec.billNo) || '', type: rec && rec.type || '', name: rec && (rec.name || rec.desc || rec.buyer && rec.buyer.name) || '', ch: (ch || []).slice(0, 60) }, extra || {});
      if (rec && rec.date && store === 'doc') e.date = rec.date;   /* the voucher's own date: "changes to entries dated before the lock" (C-18) */
      Object.keys(e).forEach(function (k) { if (e[k] === undefined) delete e[k]; });
      return logEntry(e);
    }).catch(function () {});   /* an older data home without the log store: the record itself is still saved */
  }
  /* ERP Round 1, A-2: the full record as it was before a change or delete, kept for good in store 'ver' (never purged) */
  function keepVersion(store, old, act) {
    if (!old || old.sample) return Promise.resolve('');
    return whoName().then(function (w) {
      var v = { id: uid(), rid: old.id, store: store, at: Date.now(), who: w, act: act, rec: old };
      return call('put', { store: 'ver', value: v }).then(function () { return v.id; });
    }).catch(function () { return ''; });
  }

  /* ---------- the business of a document by id (ERP Round 1, C-1) ----------
     d.bizId links a voucher to its business record. Read back, a voucher of a renamed business shows the current name, so every
     report that still matches by name keeps it; a voucher with no bizId is matched by name as before. */
  var bizC = null, bizT = 0;
  function bizList() {
    if (bizC && Date.now() - bizT < 3000) return Promise.resolve(bizC);
    return call('list', { store: 'biz' }).then(function (l) { bizC = l || []; bizT = Date.now(); return bizC; }, function () { return []; });
  }
  function nk(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  /* the id of the business a seller copy belongs to: its current name first, then a name it had before; '' when none or several */
  function bizIdFor(seller, list) {
    var k = nk(seller && seller.name); if (!k) return '';
    var now = list.filter(function (b) { return b && b.id && nk(b.name) === k; });
    if (now.length) return now.length === 1 ? now[0].id : '';
    var was = list.filter(function (b) { return b && b.id && (b.oldNames || []).some(function (n) { return nk(n) === k; }); });
    return was.length === 1 ? was[0].id : '';
  }
  function showBiz(d, map) {
    var b = d && d.bizId && map[d.bizId];
    if (b && d.seller && nk(d.seller.name) !== nk(b.name)) d.seller.name = b.name;
    return d;
  }
  function withBizNames(rows) {
    if (!rows || !(Array.isArray(rows) ? rows : [rows]).some(function (d) { return d && d.bizId; })) return Promise.resolve(rows);
    return bizList().then(function (l) { var m = {}; l.forEach(function (b) { m[b.id] = b; }); (Array.isArray(rows) ? rows : [rows]).forEach(function (d) { showBiz(d, m); }); return rows; });
  }
  /* each App / My data start (cheap): vouchers with no bizId whose seller matches exactly one business get it; one history entry */
  function unlinkedDocs() {
    var all = function () { return call('list', { store: 'doc' }); };
    return mode === 'vault' && !host ? send('noBiz', {}).then(function (l) { return Array.isArray(l) ? l : all(); }, all) : all();
  }
  function linkBiz() {
    bizC = null;
    return Promise.all([bizList(), unlinkedDocs()]).then(function (r) {   /* SQLite Stage 3: only the vouchers with no business id are read */
      var l = r[0], fix = [];
      (r[1] || []).forEach(function (d) { if (d && !d.bizId && d.seller) { var id = bizIdFor(d.seller, l); if (id) { d.bizId = id; fix.push(d); } } });
      if (!fix.length) return 0;
      return call('put', { store: 'doc', value: fix }).then(function () {
        var by = {}; fix.forEach(function (d) { by[d.bizId] = (by[d.bizId] || 0) + 1; });
        return whoName().then(function (w) { return logEntry({ id: uid(), at: Date.now(), who: w, site: location.hostname, store: 'doc', act: 'link', n: fix.length,
          ch: Object.keys(by).map(function (id) { var b = l.filter(function (x) { return x.id === id; })[0]; return ['bizId', b ? b.name : id, String(by[id])]; }) }); }).catch(function () {});
      }).then(function () { return fix.length; });
    }).catch(function () { return 0; });
  }
  /* Masters > Businesses: the unlinked vouchers whose seller name is `name` (every unlinked one when name is null) go to business bizId; one history entry */
  function linkTo(name, bizId, why) {
    bizC = null;
    return Promise.all([bizList(), unlinkedDocs()]).then(function (r) {   /* SQLite Stage 3: only the vouchers with no business id are read */
      var b = r[0].filter(function (x) { return x && x.id === bizId; })[0]; if (!b) throw new Error('No such business');
      var fix = (r[1] || []).filter(function (d) { return d && !d.bizId && d.seller && (name == null || nk(d.seller.name) === nk(name)); });
      if (!fix.length) return 0;
      fix.forEach(function (d) { d.bizId = bizId; });
      return call('put', { store: 'doc', value: fix }).then(function () {
        return whoName().then(function (w) { return logEntry({ id: uid(), at: Date.now(), who: w, site: location.hostname, store: 'doc', act: 'link', n: fix.length, why: why || '',
          ch: [['bizId', name == null ? '' : String(name), b.name + ' (' + fix.length + ')']] }); }).catch(function () {});
      }).then(function () { return fix.length; });
    });
  }
  /* vouchers no business claims: seller name -> how many (Masters > Businesses) */
  function unlinked(docs) {
    var o = {};
    (docs || []).forEach(function (d) { if (d && !d.bizId && d.seller && !d.sample) { var n = String(d.seller.name || '').trim(), k = nk(n); o[k] = o[k] || { name: n, n: 0 }; o[k].n++; } });
    return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.n - a.n; });
  }

  /* ---------- period lock ---------- */
  var LOCK_FREE = { status: 1, paidBy: 1, invNo: 1, nextNo: 1, nextType: 1, chq: 1, rec: 1, bizId: 1 };   /* payment status (and stopping a repeat) may still change on a locked document */
  /* the lock date of the document's business (settings per business, core.js NS.cfgFor), else the shared one */
  function lockDate(d) {
    return call('get', { store: 'meta', id: 'settings' }).then(function (r) {
      var S = r && r.v || {};
      if (!S.byBiz || !NS.cfgFor || !d || !d.seller) return S.lockBefore || '';
      return call('list', { store: 'biz' }).then(function (l) { return NS.cfgFor(S, d.seller, l || []).lockBefore || ''; }, function () { return S.lockBefore || ''; });
    }, function () { return ''; });
  }
  function lockErr(d) {
    var e = new Error(NS.t ? NS.t('b1.locked', { d: NS.fmtDate ? NS.fmtDate(d) : d }) : 'Locked: documents dated before ' + d + ' cannot be changed');
    e.locked = true; return e;
  }
  function checkLock(store, old, obj) {
    if (store !== 'doc') return Promise.resolve();
    return lockDate(obj || old).then(function (lk) {
      if (!lk) return;
      var oldIn = old && old.date && old.date < lk, newIn = obj && obj.date && obj.date < lk;
      if (!oldIn && !newIn) return;
      if (old && obj && oldIn && newIn && diff(old, obj).every(function (c) { return LOCK_FREE[c[0].split('.')[0]]; })) return;
      throw lockErr(lk);
    });
  }

  /* ---------- recycle bin ---------- */
  var purged = false;
  function purgeBin() {
    return call('list', { store: 'bin' }).then(function (rows) {
      var old = (rows || []).filter(function (r) { return Date.now() - (r.at || 0) > BIN_DAYS * 864e5; });
      return Promise.all(old.map(function (r) { return call('del', { store: 'bin', id: r.id }); }));
    }).catch(function () {});
  }

  /* shared folder mode (sharedfolder.js): a staff member signed in on this tab cannot delete, nor change settings and PINs. A lock for everyday
     use, not security: it is only in the page. Off (no role set) = nothing changes. */
  var SF_NO = { settings: 1, pin: 1, groups: 1, heads: 1, sf: 1, sfcfg: 1 };
  function sfDenied(op, store, id) {
    try { if (sessionStorage.getItem('ns-sf-role') !== 'staff') return false; } catch (e) { return false; }
    return op === 'del' || (store === 'meta' && !!SF_NO[id]);
  }
  function sfErr() { var e = new Error(window.NS && NS.t ? NS.t('sfd.denied') : 'An employee cannot do this. Ask the owner.'); e.denied = true; return Promise.reject(e); }

  /* opts.act / opts.why: the history entry's action and reason (cancel, uncancel) */
  var CYC = 'This opening balance is carried from a closed year. Reopen that year (Year end) to change it.';
  function put(store, obj, opts) {
    if (sfDenied('put', store, obj && obj.id)) return sfErr();
    if (store === 'log' || store === 'ver') return call('put', { store: store, value: obj });   /* the data home adds these, never overwrites */
    if (store === 'doc' && obj && obj.cyc) return Promise.reject(new Error(CYC));   /* Stage 3: an opening balance carried from a closed year lives only on screen */
    if (!obj.id) obj.id = uid();
    var old, verId = '';
    opts = opts || {};
    return (KEPT[store] ? call('get', { store: store, id: obj.id }) : Promise.resolve()).then(function (o) {
      old = o;
      return checkLock(store, old, obj);
    }).then(function () {
      if (store === 'doc' && obj.seller) return bizList().then(function (l) { var id = bizIdFor(obj.seller, l); if (id) obj.bizId = id; else if (!obj.bizId && old && old.bizId) obj.bizId = old.bizId; });
      if (store === 'biz' && old && nk(old.name) && nk(old.name) !== nk(obj.name)) {   /* a renamed business keeps its vouchers (C-1) */
        obj.oldNames = (obj.oldNames || old.oldNames || []).filter(function (n) { return nk(n) !== nk(obj.name); });
        if (obj.oldNames.map(nk).indexOf(nk(old.name)) < 0) obj.oldNames.push(old.name);
        return linkBiz();   /* vouchers still without a bizId are linked under the old name first */
      }
    }).then(function () {
      if (old && !old.sample && KEPT[store] && diff(old, obj).length) return keepVersion(store, old, opts.act || 'edit').then(function (v) { verId = v; });
    }).then(function () {
      if (!obj.created) obj.created = Date.now();
      obj.updated = Date.now();
      return call('put', { store: store, value: obj });
    }).then(function () {
      if (store === 'biz') bizC = null;
      if (KEPT[store]) { var ch = diff(old, obj); if (!old || ch.length) addLog(store, opts.act || (old ? 'edit' : 'add'), obj, old ? ch : [], { ver: verId || undefined, why: opts.why || undefined }); }
      return obj;
    });
  }

  /* ---------- cancel a voucher (ERP Round 1, A-3) ----------
     d.cancelled = { at, who, why }: the number and date stay, nothing posts (books.js role, stock, GST returns), the print says
     CANCELLED and GSTR-1 table 13 counts it as cancelled. A numbered voucher of a GST business can be deleted only while it is
     the last number of its series or was saved today (mustCancel), unless My data › Settings allows deleting vouchers. */
  var GSTDOC = { invoice: 1, cashmemo: 1, note: 1, receipt: 1, voucher: 1, self: 1, expinv: 1, pbill: 1, pharma: 1, jewel: 1, garment: 1, resto: 1, lr: 1, fee: 1 };
  function dayOf(ms) { var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fyOf(iso) { var y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7); if (m < 4) y--; return y; }
  function seriesOf(no) { return nk(String(no || '').replace(/\d+\s*$/, '')); }
  function tailOf(no) { var m = String(no || '').match(/(\d+)\s*$/); return m ? +m[1] : NaN; }
  /* '' = may be deleted; 'cancel' = only Cancel (a number in the middle of a GST series, saved before today) */
  function mustCancel(rec, all, S, now) {
    if (!rec || rec.sample || !GSTDOC[rec.type || 'invoice'] || !String(rec.no || '').trim()) return '';
    if (!(rec.seller && String(rec.seller.gstin || '').trim())) return '';   /* not a GST business */
    if (S && S.allowDel) return '';
    if (rec.created && dayOf(rec.created) === dayOf(now || Date.now())) return '';
    if ((rec.type || 'invoice') === 'pbill') return 'cancel';   /* the supplier's number: only a bill saved today may go */
    var t = tailOf(rec.no), ser = seriesOf(rec.no), fy = fyOf(rec.date), me = rec.bizId || nk(rec.seller.name);
    if (!isFinite(t)) return 'cancel';
    var later = (all || []).some(function (d) {
      return d && d.id !== rec.id && (d.type || 'invoice') === (rec.type || 'invoice') && (d.kind || '') === (rec.kind || '') && fyOf(d.date) === fy && seriesOf(d.no) === ser &&
        (d.bizId || nk(d.seller && d.seller.name)) === me && tailOf(d.no) > t;
    });
    return later ? 'cancel' : '';
  }
  function cancelErr() {
    var e = new Error(window.NS && NS.t ? NS.t('au.mustcancel') : 'This voucher has a number in a GST series. Cancel it instead of deleting it.');
    e.mustCancel = true; return e;
  }
  /* undo: bring a cancelled voucher back (the screens ask for the PIN when one is set) */
  function cancel(id, why, undo) {
    return call('get', { store: 'doc', id: id }).then(function (d) {
      if (!d) throw new Error('gone');
      if (!undo && d.cancelled || undo && !d.cancelled) return d;
      return whoName().then(function (w) {
        var n = JSON.parse(JSON.stringify(d)), y = String(why || '').trim();
        if (undo) delete n.cancelled; else n.cancelled = { at: Date.now(), who: w, why: y };
        return put('doc', n, { act: undo ? 'uncancel' : 'cancel', why: y });
      });
    });
  }
  /* opts.hard: no bin and no history; only for sample records (A-1: any other caller still goes through the bin and the history).
     opts.batch: taking out a whole import from other software ("Bring data from other software", migrate.js): only the records of that
     import (src.batch) skip the recycle bin, the earlier-version copy and the delete-or-cancel test (which re-reads every bill: 10,000
     of them made it crawl); each still gets its line in the edit history. */
  function del(store, id, opts) {
    if (sfDenied('del', store, id)) return sfErr();
    if (store === 'log' || store === 'ver') return Promise.reject(new Error('The edit history cannot be changed or removed'));
    if (store === 'doc' && /^cy-/.test(String(id))) return Promise.reject(new Error(CYC));
    if (!KEPT[store]) return call('del', { store: store, id: id });
    var hard = false, rec, verId = '';
    /* logins on: no right to delete = stop before the recycle-bin copy and the earlier version are written */
    return send('can', { store: store, id: id, act: 'del' }).catch(function () { return true; }).then(function (ok) { if (ok === false) throw new Error('NSAUTH: no right to delete this'); return call('get', { store: store, id: id }); }).then(function (r) {
      rec = r;
      if (!rec) return;
      hard = !!(opts && opts.hard && rec.sample);
      var imp = !!(opts && opts.batch && rec.src && rec.src.batch === opts.batch);
      return checkLock(store, rec, null).then(function () {
        if (store !== 'doc' || rec.sample || imp) return;
        return Promise.all([call('list', { store: 'doc' }), call('get', { store: 'meta', id: 'settings' })]).then(function (x) {
          var S = x[1] && x[1].v || {}, own = rec.bizId && S.byBiz && S.byBiz[rec.bizId];
          if (mustCancel(rec, x[0], own && 'allowDel' in own ? own : S)) { if (!(opts && opts.quiet)) offerCancel(rec); throw cancelErr(); }
        });
      }).then(function () {
        if (hard || rec.sample || imp) return;
        return keepVersion(store, rec, 'del').then(function (v) { verId = v; return whoName(); })
          .then(function (w) { return call('put', { store: 'bin', value: { id: store + ':' + id, store: store, rec: rec, at: Date.now(), who: w } }); }).catch(function () {});
      });
    }).then(function () {
      if (rec) return call('del', { store: store, id: id });
    }).then(function () { if (store === 'biz') bizC = null; if (rec && !hard) return addLog(store, 'del', rec, [], { ver: verId || undefined }); });
  }
  /* taking out a whole import from other software (migrate.js): one rights check per kind of record and one lock date for the lot,
     then only the deletes, 50 at a time, with their edit-history lines written together. Only records of that import (src.batch)
     are touched; carried openings (cy-) never. One by one through del() this took about 15 minutes for 10,000 records. */
  function delImport(batch, list, prog) {
    list = (list || []).filter(function (x) { return x && x.rec && x.rec.src && x.rec.src.batch === batch && !/^cy-/.test(String(x.rec.id)) && !(x.store === 'log' || x.store === 'ver'); });
    if (!list.length) return Promise.resolve(0);
    if (sfDenied('del', list[0].store, list[0].rec.id)) return sfErr();
    var first = {}; list.forEach(function (x) { if (!(x.store in first)) first[x.store] = x.rec.id; });
    return Promise.all(Object.keys(first).map(function (st) {
      return send('can', { store: st, id: first[st], act: 'del' }).catch(function () { return true; }).then(function (ok) { if (ok === false) throw new Error('NSAUTH: no right to delete this'); });
    })).then(function () {
      var docs = list.filter(function (x) { return x.store === 'doc'; });
      return docs.length ? lockDate(docs[0].rec) : '';
    }).then(function (lk) {
      var hit = lk && list.filter(function (x) { return x.store === 'doc' && x.rec.date && x.rec.date < lk; })[0];
      if (hit) throw lockErr(lk);
      return whoName();
    }).then(function (w) {
      var i = 0;
      function step() {
        var part = list.slice(i, i + 50); if (!part.length) return Promise.resolve(list.length);
        i += part.length;
        return Promise.all(part.map(function (x) { return call('del', { store: x.store, id: x.rec.id }); })).then(function () {
          var es = part.filter(function (x) { return KEPT[x.store]; }).map(function (x) {
            var r = x.rec, e = { id: uid(), at: Date.now(), who: w, site: location.hostname, store: x.store, rid: r.id, act: 'del', no: r.no || r.billNo || '', type: r.type || '', name: r.name || r.desc || r.buyer && r.buyer.name || '', ch: [], imp: batch };
            if (r.date && x.store === 'doc') e.date = r.date;
            Object.keys(e).forEach(function (k) { if (e[k] === undefined) delete e[k]; });
            return e;
          });
          return es.length ? logEntry(es).catch(function () {}) : null;
        }).then(function () { if (prog) prog(i, list.length); return new Promise(function (res) { setTimeout(res, 0); }); }).then(step);
      }
      return step();
    }).then(function (n) { bizC = null; return n; });
  }
  /* a Delete button anywhere that hits such a voucher offers Cancel instead (extras.js NS.cancelDoc asks the reason) */
  function offerCancel(rec) { setTimeout(function () { if (window.NS && NS.cancelDoc) NS.cancelDoc(rec, { fromDelete: true }); }, 0); }
  function restore(binId) {
    return call('get', { store: 'bin', id: binId }).then(function (b) {
      if (!b || !b.rec) throw new Error('gone');
      var rec = b.rec;
      return checkLock(b.store, null, rec).then(function () {
        rec.updated = Date.now();
        return call('put', { store: b.store, value: rec });
      }).then(function () {
        addLog(b.store, 'restore', rec, []);
        return call('del', { store: 'bin', id: binId });
      }).then(function () { return b; });
    });
  }

  /* ---------- settings that guard the books are logged too (ERP Round 1, A-4 / C-18) ----------
     settings: only the period lock, closed years, number series and "allow deleting vouchers"; heads and groups: every change;
     the PIN: switched on or off. Moving the lock earlier, reopening a year and emptying the bin ask for the PIN on the screens. */
  var META_LOG = { settings: 1, heads: 1, groups: 1, pin: 1 };
  var SET_KEEP = /(^|\.)(lockBefore|allowDel|prefix|digits)$|(^|\.)closed\./;
  function metaCh(key, a, b) {
    if (key === 'pin') return !a === !b ? (a && b && a.hash !== b.hash ? [['pin', 'on', 'changed']] : []) : [['pin', a ? 'on' : 'off', b ? 'on' : 'off']];
    var ch = diff(a && typeof a === 'object' ? a : { v: a }, b && typeof b === 'object' ? b : { v: b });
    return key === 'settings' ? ch.filter(function (c) { return SET_KEEP.test(c[0]); }) : ch;
  }
  function metaPut(key, val, opts) {
    var rec = { id: key, v: val, updated: Date.now() };
    if (!META_LOG[key]) return call('put', { store: 'meta', value: rec });
    var old;
    return call('get', { store: 'meta', id: key }).then(function (o) { old = o ? o.v : undefined; }, function () {}).then(function () {
      return call('put', { store: 'meta', value: rec });
    }).then(function (r) {
      var ch = metaCh(key, old, val);
      if (ch.length) addLog('meta', ch.some(function (c) { return /lockBefore|closed/.test(c[0]); }) ? 'lock' : 'meta', { id: key, name: key }, ch.slice(0, 60), { why: opts && opts.why || undefined });
      return r;
    });
  }
  function sha(s) {
    try { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }, function () { return ''; }); }
    catch (e) { return Promise.resolve(''); }
  }

  window.NSStore = {
    ready: function () { return ready().then(function (m) { if (!purged) { purged = true; purgeBin(); } return m; }); },
    mode: function () { return host ? host.mode() : mode; },
    _call: call, _send: send,   /* for the App's own copies of the makers (see host above) */
    /* user logins (SQLite Stage 2): authStatus, login, logout, setupOwner, recover, users, addUser, setUser, changePw, setRole */
    auth: function (op, args) { return ready().then(function (m) { return m === 'vault' ? send(op, args || {}) : (op === 'authStatus' ? { on: false, local: true } : Promise.reject(new Error('The data home is not reachable'))); }); },
    list: function (store) { return call('list', { store: store }).then(function (r) { r = r || []; return store === 'doc' ? withBizNames(r) : r; }, function (e) { if (store === 'bin' || store === 'log' || store === 'ver') return []; throw e; }); },
    get: function (store, id) { return call('get', { store: store, id: id }).then(function (r) { return store === 'doc' && r ? withBizNames(r) : r; }); },
    delImport: delImport,
    /* Stage 3: { n, oldest } of the saved documents without reading them (falls back to reading them) */
    docStat: function (noRead) {
      return ready().then(function (m) { return m === 'vault' ? send('docStat', {}).then(null, function () { return null; }) : null; }).then(function (s) {
        if (s && typeof s.n === 'number') return s;
        if (noRead) return null;   /* only asking for the stamp: no reading of every document */
        return call('list', { store: 'doc' }).then(function (l) { l = l || []; return { n: l.length, oldest: l.length ? Math.min.apply(null, l.map(function (d) { return d.created || Date.now(); })) : 0 }; });
      });
    },
    /* Stage 3: documents of the open years only; closed = { '<business id>': ['2024-25', ...] } -> { docs, cut } (no cut without SQLite) */
    docsFrom: function (closed) {
      return ready().then(function (m) {
        var p = m === 'vault' ? send('docsFrom', { closed: closed || {} }).then(null, function (e) { if (/NSAUTH/.test(e && e.message)) throw e; return null; }) : Promise.resolve(null);
        return p.then(function (r) { return r && Array.isArray(r.docs) ? r : call('list', { store: 'doc' }).then(function (l) { return { docs: l || [], cut: {} }; }); });
      }).then(function (r) { return withBizNames(r.docs).then(function (d) { r.docs = d || []; return r; }); });
    },
    put: put,
    del: del,
    restore: restore,
    binDays: BIN_DAYS,
    lockDate: lockDate,
    exportAll: function () { return call('exportAll'); },
    /* Stage 4: the data files as they are (still locked once logins are on); null when the data is not on SQLite.
       have = { name: stamp } of a copy already made (those come back { same: 1 }); auto = the daily copy (the Windows program makes
       its own and answers { desk: true }) */
    snapshot: function (have, auto) {
      return ready().then(function (m) { return m === 'vault' ? send('snapshot', { have: have || {}, auto: !!auto }).then(null, function (e) { if (/NSAUTH|office network/.test(e && e.message)) throw e; return null; }) : null; });
    },
    /* Stage 4: bring back a backup's files (replaces everything on this device). note = which copy, for the edit history */
    restoreFiles: function (files, note) {
      return ready().then(function (m) {
        if (m !== 'vault') throw new Error('The data home is not reachable');
        return send('restoreFiles', { files: files, note: note || '' });
      }).then(function (r) {
        /* one edit-history entry in the brought-back data (skipped when it needs a login first) */
        return whoName().then(function (w) { return logEntry({ id: uid(), at: Date.now(), who: w, site: location.hostname, act: 'restore-files', n: files.length, file: note || '', ch: [] }); }).catch(function () {}).then(function () { return r; });
      });
    },
    deskBackup: function (op, args) { return ready().then(function (m) { return m === 'vault' ? send('deskBackup', Object.assign({ op: op }, args || {})) : null; }); },
    /* info: { file } the backup file's name, { wipe } "Delete everything". A restore never clears or overwrites the edit history (A-1);
       it adds one entry with the file name, how many records of each kind the file held and the file's SHA-256. */
    importAll: function (data, replace, info) {
      info = info || {};
      var counts = {}; Object.keys(data || {}).forEach(function (s) { if (Array.isArray(data[s])) counts[s] = data[s].length; });
      return Promise.all([call('importAll', { data: data, replace: !!replace }), sha(JSON.stringify(data || {}))]).then(function (r) {
        var n = r[0], act = info.wipe ? 'wipe' : info.file || replace ? 'restore-file' : 'import';
        if (n || act !== 'import') whoName().then(function (w) { return logEntry({ id: uid(), at: Date.now(), who: w, site: location.hostname, act: act, n: n || 0, file: info.file || '', replace: !!replace, counts: counts, fileHash: r[1], ch: [] }); }).catch(function () {});
        return n;
      });
    },
    /* ERP Round 1: cancel / bring back a voucher (A-3), the delete rule, linking vouchers to their business (C-1),
       checking the edit history seal (A-1), one history entry for a screen action such as emptying the bin (C-18) */
    cancel: function (id, why) { return cancel(id, why, false); },
    uncancel: function (id, why) { return cancel(id, why, true); },
    mustCancel: mustCancel,
    linkBiz: linkBiz,
    linkTo: linkTo,
    unlinked: unlinked,
    bizIdFor: bizIdFor,
    logCheck: function () { return call('logCheck'); },
    /* "Delete everything": every business, party, item, document and the recycle bin go; the edit history and earlier versions stay (A-1) */
    wipe: function (why) {
      if (sfDenied('del', 'doc')) return sfErr();
      var counts = {};
      return Promise.all(['biz', 'party', 'item', 'doc', 'bin'].map(function (s) { return call('list', { store: s }).then(function (r) { counts[s] = (r || []).filter(function (x) { return !x.sample; }).length; return call('clear', { store: s }); }); }))
        .then(function () { bizC = null; return window.NSStore.note('wipe', { counts: counts, why: why || undefined }); });
    },
    note: function (act, extra) { return whoName().then(function (w) { return logEntry(Object.assign({ id: uid(), at: Date.now(), who: w, site: location.hostname, act: act, ch: [] }, extra || {})); }).catch(function () {}); },
    persist: function () { return call('persist'); },
    estimate: function () { return call('estimate'); },
    /* one auto save for every site (vault.js afStatus / afWrite / afOff); null when the data home is not reachable */
    autosave: function (op, args) { return ready().then(function (m) { return m === 'vault' ? send(op, args) : null; }); },
    meta: function (key, val) {
      if (arguments.length < 2) return call('get', { store: 'meta', id: key }).then(function (r) { return r ? r.v : undefined; });
      if (sfDenied('put', 'meta', key)) return sfErr();
      if (key === 'who') who = val || '';
      return metaPut(key, val, arguments[2]);
    },
    /* shared folder mode: this computer's bill-number letter (sharedfolder.js keeps it here), '' when the mode is off */
    sfTag: function () {
      return Promise.all([call('get', { store: 'meta', id: 'sf' }), call('get', { store: 'meta', id: 'sf-tag' })]).then(function (r) { return r[0] && r[0].v && r[0].v.on && r[1] && r[1].v || ''; }, function () { return ''; });
    },
    /* shared folder mode, common series: the App page around a maker (or the page itself) holds the folder; null = not available here, number as usual */
    sfClaim: function (a) { return sfReady().then(function (sf) { if (!sf) return null; a.owner = SF_OWNER; hookLeave(sf); return sf.claim(a).then(function (n) { return n || null; }, function () { return null; }); }); },
    sfRelease: function () { return sfReady().then(function (sf) { return sf ? sf.release(SF_OWNER) : null; }); },
    sfEditing: function (id, no) { return sfReady().then(function (sf) { if (!sf) return null; hookLeave(sf); return sf.setEditing(SF_OWNER, id || null, no || '').then(function () { return id ? sf.editorOf(id) : null; }, function () { return null; }); }); },
    uid: uid
  };
  var SF_OWNER = 'o' + Math.random().toString(36).slice(2, 10), leaving = false;
  /* waits until the App page knows whether the shared folder is on (a few seconds after it opened); a page with no App around it answers at once */
  function sfReady() {
    try { var w = host ? window.parent : window; if (!(w.NS && w.NS.sf && w.NS.sf.ready)) return Promise.resolve(null); return w.NS.sf.ready().then(sfTop); } catch (e) { return Promise.resolve(null); }
  }
  function sfTop() { try { var w = host ? window.parent : window; return w.NS && w.NS.sf && w.NS.sf.engine && w.NS.sf.engine() ? w.NS.sf : null; } catch (e) { return null; } }
  /* the page (a maker's frame) closes: its reserved number goes back unless a bill has it, and it no longer shows as editing */
  function hookLeave(sf) { if (leaving) return; leaving = true; window.addEventListener('pagehide', function () { try { sf.release(SF_OWNER); sf.setEditing(SF_OWNER, null); } catch (e) {} }); }
})();
