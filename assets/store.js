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
  var STORES = ['biz', 'party', 'item', 'doc', 'meta', 'bin', 'log'];
  var KEPT = { biz: 1, party: 1, item: 1, doc: 1 }, BIN_DAYS = 30;
  var cfg = window.NS_CFG || {};
  var VAULT = cfg.vault || 'https://my.niveshsahayak.in/vault.html';
  var VAULT_ORIGIN = new URL(VAULT, location.href).origin;
  var frame, seq = 0, waiting = {}, mode = null, readyP;

  /* ---------- local fallback (same operations, this site's own IndexedDB) ---------- */
  var ldbp;
  function ldb() {
    if (ldbp) return ldbp;
    ldbp = new Promise(function (res, rej) {
      var r = indexedDB.open('ns-local', 2);
      r.onupgradeneeded = function () { STORES.forEach(function (s) { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
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
        return (a.replace ? LOCAL.clear({ store: s }) : Promise.resolve()).then(function () { return LOCAL.list({ store: s }); }).then(function (have) {
          var map = {}; have.forEach(function (h) { map[h.id] = h; });
          var put = rows.filter(function (r) { return !map[r.id] || (r.updated || 0) > (map[r.id].updated || 0); });
          n += put.length;
          return put.length ? LOCAL.put({ store: s, value: put }) : 0;
        });
      })).then(function () { return n; });
    },
    persist: function () { return navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false); },
    estimate: function () { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null); }
  };

  /* ---------- the shared data home ---------- */
  function send(op, args) {
    return new Promise(function (res, rej) {
      var id = ++seq;
      waiting[id] = { res: res, rej: rej, t: setTimeout(function () { delete waiting[id]; rej(new Error('The data home did not answer')); }, 15000) };
      frame.contentWindow.postMessage({ ns: 'vault', id: id, op: op, args: args || {} }, VAULT_ORIGIN);
    });
  }
  function call(op, args) {
    return ready().then(function () { return mode === 'local' ? LOCAL[op](args || {}) : send(op, args); });
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== VAULT_ORIGIN || !e.data || e.data.ns !== 'vault' || !e.data.id) return;
    var w = waiting[e.data.id];
    if (!w) return;
    clearTimeout(w.t); delete waiting[e.data.id];
    e.data.ok ? w.res(e.data.result) : w.rej(new Error(e.data.result));
  });

  function ready() {
    if (readyP) return readyP;
    readyP = new Promise(function (res) {
      var done = false;
      function finish(m) { if (done) return; done = true; mode = m; res(m); }
      if (!('indexedDB' in window)) return finish('local');
      frame = document.createElement('iframe');
      frame.src = VAULT;
      frame.title = 'Nivesh Sahayak data home';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;width:1px;height:1px;border:0;left:0;top:0;opacity:0;pointer-events:none;clip-path:inset(50%)';
      function onMsg(e) {
        if (e.origin !== VAULT_ORIGIN || !e.data || e.data.ns !== 'vault' || !('ready' in e.data)) return;
        window.removeEventListener('message', onMsg);
        finish(e.data.ready ? 'vault' : 'local');
      }
      window.addEventListener('message', onMsg);
      setTimeout(function () { finish('local'); }, 6000);
      (document.body || document.documentElement).appendChild(frame);
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
  function addLog(store, act, rec, ch, extra) {
    if (!KEPT[store] || rec && rec.sample) return Promise.resolve();
    return whoName().then(function (w) {
      var e = Object.assign({ id: uid(), at: Date.now(), who: w, site: location.hostname, store: store, rid: rec && rec.id, act: act,
        no: rec && (rec.no || rec.billNo) || '', type: rec && rec.type || '', name: rec && (rec.name || rec.desc || rec.buyer && rec.buyer.name) || '', ch: (ch || []).slice(0, 60) }, extra || {});
      return call('put', { store: 'log', value: e });
    }).catch(function () {});   /* an older data home without the log store: the record itself is still saved */
  }

  /* ---------- period lock ---------- */
  var LOCK_FREE = { status: 1, paidBy: 1, invNo: 1, nextNo: 1, nextType: 1, chq: 1, rec: 1 };   /* payment status (and stopping a repeat) may still change on a locked document */
  function lockDate() { return call('get', { store: 'meta', id: 'settings' }).then(function (r) { return r && r.v && r.v.lockBefore || ''; }, function () { return ''; }); }
  function lockErr(d) {
    var e = new Error(NS.t ? NS.t('b1.locked', { d: NS.fmtDate ? NS.fmtDate(d) : d }) : 'Locked: documents dated before ' + d + ' cannot be changed');
    e.locked = true; return e;
  }
  function checkLock(store, old, obj) {
    if (store !== 'doc') return Promise.resolve();
    return lockDate().then(function (lk) {
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

  function put(store, obj) {
    if (!obj.id) obj.id = uid();
    var old;
    return (KEPT[store] ? call('get', { store: store, id: obj.id }) : Promise.resolve()).then(function (o) {
      old = o;
      return checkLock(store, old, obj);
    }).then(function () {
      if (!obj.created) obj.created = Date.now();
      obj.updated = Date.now();
      return call('put', { store: store, value: obj });
    }).then(function () {
      if (KEPT[store]) { var ch = diff(old, obj); if (!old || ch.length) addLog(store, old ? 'edit' : 'add', obj, old ? ch : []); }
      return obj;
    });
  }
  /* opts.hard: no bin and no history (removing sample records) */
  function del(store, id, opts) {
    if (!KEPT[store]) return call('del', { store: store, id: id });
    var hard = opts && opts.hard, rec;
    return call('get', { store: store, id: id }).then(function (r) {
      rec = r;
      if (!rec) return;
      return checkLock(store, rec, null).then(function () {
        if (hard || rec.sample) return;
        return whoName().then(function (w) { return call('put', { store: 'bin', value: { id: store + ':' + id, store: store, rec: rec, at: Date.now(), who: w } }); }).catch(function () {});
      });
    }).then(function () {
      return call('del', { store: store, id: id });
    }).then(function () { if (rec && !hard) addLog(store, 'del', rec, []); });
  }
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

  window.NSStore = {
    ready: function () { return ready().then(function (m) { if (!purged) { purged = true; purgeBin(); } return m; }); },
    mode: function () { return mode; },
    list: function (store) { return call('list', { store: store }).then(function (r) { return r || []; }, function (e) { if (store === 'bin' || store === 'log') return []; throw e; }); },
    get: function (store, id) { return call('get', { store: store, id: id }); },
    put: put,
    del: del,
    restore: restore,
    binDays: BIN_DAYS,
    lockDate: lockDate,
    exportAll: function () { return call('exportAll'); },
    importAll: function (data, replace) {
      return call('importAll', { data: data, replace: !!replace }).then(function (n) {
        if (n) whoName().then(function (w) { return call('put', { store: 'log', value: { id: uid(), at: Date.now(), who: w, site: location.hostname, act: 'import', n: n, ch: [] } }); }).catch(function () {});
        return n;
      });
    },
    persist: function () { return call('persist'); },
    estimate: function () { return call('estimate'); },
    meta: function (key, val) {
      if (arguments.length < 2) return call('get', { store: 'meta', id: key }).then(function (r) { return r ? r.v : undefined; });
      if (key === 'who') who = val || '';
      return call('put', { store: 'meta', value: { id: key, v: val, updated: Date.now() } });
    },
    uid: uid
  };
})();
