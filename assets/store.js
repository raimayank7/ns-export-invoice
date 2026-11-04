/* NSStore: the one place every Nivesh Sahayak document site keeps its data.
   It talks to the shared data home (my.niveshsahayak.in) in a hidden frame, so masters are shared across sites.
   If that frame can't load (first visit while offline, blocked), it keeps data in this site's own browser storage
   and moves it into the data home the next time the frame works. */
(function () {
  'use strict';
  var STORES = ['biz', 'party', 'item', 'doc', 'meta'];
  var cfg = window.NS_CFG || {};
  var VAULT = cfg.vault || 'https://my.niveshsahayak.in/vault.html';
  var VAULT_ORIGIN = new URL(VAULT, location.href).origin;
  var frame, seq = 0, waiting = {}, mode = null, readyP;

  /* ---------- local fallback (same operations, this site's own IndexedDB) ---------- */
  var ldbp;
  function ldb() {
    if (ldbp) return ldbp;
    ldbp = new Promise(function (res, rej) {
      var r = indexedDB.open('ns-local', 1);
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

  window.NSStore = {
    ready: ready,
    mode: function () { return mode; },
    list: function (store) { return call('list', { store: store }).then(function (r) { return r || []; }); },
    get: function (store, id) { return call('get', { store: store, id: id }); },
    put: function (store, obj) {
      if (!obj.id) obj.id = uid();
      if (!obj.created) obj.created = Date.now();
      obj.updated = Date.now();
      return call('put', { store: store, value: obj }).then(function () { return obj; });
    },
    del: function (store, id) { return call('del', { store: store, id: id }); },
    exportAll: function () { return call('exportAll'); },
    importAll: function (data, replace) { return call('importAll', { data: data, replace: !!replace }); },
    persist: function () { return call('persist'); },
    estimate: function () { return call('estimate'); },
    meta: function (key, val) {
      if (arguments.length < 2) return call('get', { store: 'meta', id: key }).then(function (r) { return r ? r.v : undefined; });
      return call('put', { store: 'meta', value: { id: key, v: val, updated: Date.now() } });
    },
    uid: uid
  };
})();
