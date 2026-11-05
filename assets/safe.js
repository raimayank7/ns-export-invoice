/* NS safe (Batch 3): keeping the data safe and handing it on, on every site.
   1. Password-locked backup file: AES-GCM 256 with a key from the password (PBKDF2-SHA-256, 600,000 rounds, random salt), all
      in the browser (Web Crypto). The file has no readable data, only { app, kind: 'backup', locked, box }. Restore asks for the
      password; old plain backups still restore as before (core.js).
   2. Google Drive sync: the user's own Drive, permission drive.file (only files this app made), Google Identity Services in the
      browser, no server. Hidden until the owner puts an OAuth client id in NS_CFG.gdriveClient (build.py GDRIVE_CLIENT).
      Runs on my.niveshsahayak.in and app.niveshsahayak.in only (Google needs every web address listed one by one); the other
      sites link there. One file "nivesh-sahayak-sync.json" in the user's Drive holds every record.
      Merge per record (merge() below, tested by scripts/test_sync.js): changed on one side only -> that side; changed on both
      sides (a clash) -> the newest wins and the other copy is kept in meta 'gdClash' so it can be brought back; deleted on one
      side and not changed on the other -> deleted on both.
   3. "Send to accountant" button: loads acct.js (and books.js, xlsx.js, tally.js) only when pressed (NS_CFG.lazy). */
(function (G) {
  'use strict';
  /* ---------- the merge (pure, also run by node in scripts/test_sync.js) ---------- */
  var SKIPMETA = /^(gd|lastBackup$|pin|lock)/i;   /* device-only settings are never synced */
  function upd(r) { return r && r.updated || 0; }
  function merge(L, R, seen) {
    var stores = {}, out = { local: { put: {}, del: {} }, remote: {}, seen: {}, clashes: [], changed: 0 };
    [L, R].forEach(function (x) { Object.keys(x || {}).forEach(function (s) { stores[s] = 1; }); });
    Object.keys(stores).forEach(function (s) {
      var l = {}, r = {}, ids = {}, base = (seen || {})[s] || {}, keep = [], nseen = {};
      ((L || {})[s] || []).forEach(function (x) { if (x && x.id && !(s === 'meta' && SKIPMETA.test(x.id))) { l[x.id] = x; ids[x.id] = 1; } });
      ((R || {})[s] || []).forEach(function (x) { if (x && x.id && !(s === 'meta' && SKIPMETA.test(x.id))) { r[x.id] = x; ids[x.id] = 1; } });
      out.local.put[s] = []; out.local.del[s] = [];
      Object.keys(ids).forEach(function (id) {
        var a = l[id], b = r[id], was = base[id], win = null;
        if (a && b) {
          if (upd(a) === upd(b)) win = a;
          else if (was != null && upd(a) === was) { win = b; out.local.put[s].push(b); }   /* only the other device changed it */
          else if (was != null && upd(b) === was) win = a;                                  /* only this device changed it */
          else {   /* both changed (or never synced before): the newest wins, the other copy is kept */
            win = upd(a) >= upd(b) ? a : b;
            var lose = win === a ? b : a;
            if (JSON.stringify(strip(a)) !== JSON.stringify(strip(b))) out.clashes.push({ store: s, id: id, rec: lose, from: win === a ? 'drive' : 'here', at: Date.now() });
            if (win === b) out.local.put[s].push(b);
          }
        } else if (a) {
          if (was != null && upd(a) <= was) { out.local.del[s].push(id); return; }   /* deleted on the other device */
          win = a;
        } else {
          if (was != null && upd(b) <= was) return;   /* deleted here */
          win = b; out.local.put[s].push(b);
        }
        keep.push(win); nseen[id] = upd(win);
      });
      out.remote[s] = keep; out.seen[s] = nseen;
      out.changed += out.local.put[s].length + out.local.del[s].length;
    });
    return out;
  }
  function strip(r) { var o = {}; Object.keys(r || {}).sort().forEach(function (k) { if (k !== 'updated') o[k] = r[k]; }); return o; }
  G.NSSyncMerge = merge;
  if (typeof module !== 'undefined' && module.exports) { module.exports = { merge: merge }; return; }

  var NS = G.NS = G.NS || {};
  var CFG = G.NS_CFG || {};
  function T(k, v) { return NS.t ? NS.t(k, v) : k; }
  function E(s) { return NS.esc(s); }

  /* ---------- bytes <-> base64 ---------- */
  function b64(bytes) {
    var s = '', u = new Uint8Array(bytes);
    for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  /* ---------- 1. password-locked backup ---------- */
  var ITER = 600000;
  function keyFrom(pw, salt, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  NS.lockData = function (obj, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return keyFrom(pw, salt, ITER).then(function (k) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    }).then(function (ct) {
      return { app: 'Nivesh Sahayak', kind: 'backup', version: 2, saved: new Date().toISOString(),
        locked: { alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA-256', iter: ITER, salt: b64(salt), iv: b64(iv) }, box: b64(ct) };
    });
  };
  /* wrong password: AES-GCM refuses (the tag does not match), so a bad password never gives wrong data */
  NS.unlockData = function (file, pw) {
    var L = file.locked || {};
    return keyFrom(pw, unb64(L.salt), +L.iter || ITER).then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(L.iv) }, k, unb64(file.box));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); }, function () { throw new Error('pw'); });
  };

  /* password box: mode 'set' (type it twice) or 'open' */
  NS.askPassword = function (mode, msg) {
    return new Promise(function (res) {
      var d = document.createElement('dialog');
      d.className = 'pw-dlg';
      d.setAttribute('aria-labelledby', 'pw-h');
      d.innerHTML = '<form method="dialog" class="pw-f"><h2 id="pw-h">' + E(T(mode === 'set' ? 'b3.pw.set' : 'b3.pw.open')) + '</h2>' +
        (msg ? '<p class="note bad" role="alert">' + E(msg) + '</p>' : '') +
        '<p class="soft">' + E(T(mode === 'set' ? 'b3.pw.why' : 'b3.pw.ask')) + '</p>' +
        '<label for="pw-1">' + E(T('b3.pw.pw')) + '</label><input id="pw-1" type="password" autocomplete="' + (mode === 'set' ? 'new-password' : 'current-password') + '" minlength="' + (mode === 'set' ? 8 : 1) + '" required dir="ltr">' +
        (mode === 'set' ? '<label for="pw-2">' + E(T('b3.pw.again')) + '</label><input id="pw-2" type="password" autocomplete="new-password" required dir="ltr">' : '') +
        '<label class="chk"><input type="checkbox" data-pw-show> ' + E(T('b3.pw.show')) + '</label>' +
        (mode === 'set' ? '<p class="note">' + E(T('b3.pw.warn')) + '</p>' : '') +
        '<p class="note bad" data-pw-err hidden></p>' +
        '<div class="btns"><button class="btn primary" value="ok">' + E(T(mode === 'set' ? 'b3.pw.lock' : 'b3.pw.unlock')) + '</button><button class="btn" value="no" formnovalidate>' + E(T('b3.cancel')) + '</button></div></form>';
      document.body.appendChild(d);
      var p1 = d.querySelector('#pw-1'), p2 = d.querySelector('#pw-2'), err = d.querySelector('[data-pw-err]');
      d.querySelector('[data-pw-show]').addEventListener('change', function (e) { [p1, p2].forEach(function (p) { if (p) p.type = e.target.checked ? 'text' : 'password'; }); });
      d.querySelector('form').addEventListener('submit', function (e) {
        if (e.submitter && e.submitter.value === 'no') return;
        if (mode === 'set' && p1.value.length < 8) { e.preventDefault(); err.textContent = T('b3.pw.short'); err.hidden = false; return; }
        if (mode === 'set' && p1.value !== p2.value) { e.preventDefault(); err.textContent = T('b3.pw.diff'); err.hidden = false; return; }
      });
      d.addEventListener('close', function () { var v = d.returnValue === 'ok' ? p1.value : null; d.remove(); res(v); });
      d.showModal ? d.showModal() : d.setAttribute('open', '');
      p1.focus();
    });
  };

  function saveFile(blob, name) {
    var a = NS.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  NS.saveFile = saveFile;
  NS.downloadLockedBackup = function () {
    return NS.askPassword('set').then(function (pw) {
      if (!pw) return false;
      NS.toast(T('b3.pw.making'));
      return NS.backupData().then(function (b) { return NS.lockData(b, pw); }).then(function (f) {
        saveFile(new Blob([JSON.stringify(f)], { type: 'application/json' }), 'nivesh-sahayak-backup-locked-' + NS.today() + '.json');
        return NSStore.meta('lastBackup', Date.now());
      }).then(function () { var r = NS.$('#ns-remind'); if (r) r.hidden = true; NS.toast(T('b3.pw.saved')); return true; });
    });
  };

  /* restore: a locked file asks for the password (3 tries), any other file goes to the plain restore of core.js */
  var plainRestore = NS.restoreFromFile;
  NS.restoreFromFile = function (file) {
    return file.text().then(function (txt) {
      var f; try { f = JSON.parse(txt); } catch (e) { f = null; }
      if (!f || f.app !== 'Nivesh Sahayak' || !f.box || !f.locked) return plainRestore(file);
      function attempt(n, msg) {
        return NS.askPassword('open', msg).then(function (pw) {
          if (pw == null) { var e = new Error(T('b3.pw.stopped')); e.quiet = true; throw e; }
          return NS.unlockData(f, pw).catch(function () {
            if (n >= 3) throw new Error(T('b3.pw.wrong3'));
            return attempt(n + 1, T('b3.pw.wrong'));
          });
        });
      }
      return attempt(1).then(function (b) {
        if (!b || b.app !== 'Nivesh Sahayak' || !b.data) throw new Error(T('bk.notours'));
        return NSStore.importAll(b.data, false);
      }).then(function (n) { NS.toast(n ? T('bk.restored', { n: n }) : T('bk.nothing')); return n; },
        function (e) { NS.toast(e.message || T('bk.unread'), e.quiet ? '' : 'bad'); throw e; });
    });
  };

  /* ---------- 2. Google Drive sync ---------- */
  var GD_FILE = 'nivesh-sahayak-sync.json', SCOPE = 'https://www.googleapis.com/auth/drive.file', API = 'https://www.googleapis.com';
  var GD_HOST = /^(my|app)\.niveshsahayak\.in$|^(localhost|127\.0\.0\.1)$/;
  var token = null, tokenExp = 0, tokenClient = null, busy = null, timer = null;
  var GD = NS.gdrive = {
    enabled: function () { return !!CFG.gdriveClient; },
    here: function () { return GD.enabled() && GD_HOST.test(location.hostname); },
    state: function () { return NSStore.meta('gdSync').then(function (s) { return s || {}; }); },
    signedIn: function () { return !!token && Date.now() < tokenExp; }
  };
  function loadGis() { return window.google && google.accounts && google.accounts.oauth2 ? Promise.resolve() : NS.loadJs('https://accounts.google.com/gsi/client'); }
  /* must run inside a tap: Google opens its own sign-in window */
  GD.signIn = function () {
    return loadGis().then(function () {
      return new Promise(function (res, rej) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CFG.gdriveClient, scope: SCOPE,
          callback: function (r) {
            if (r && r.access_token && google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) { token = r.access_token; tokenExp = Date.now() + ((+r.expires_in || 3600) - 120) * 1000; res(true); }
            else rej(new Error(T('b3.gd.denied')));
          },
          error_callback: function (e) { rej(new Error(e && e.type === 'popup_closed' ? T('b3.gd.closed') : T('b3.gd.nosign'))); }
        });
        tokenClient.requestAccessToken({ prompt: '' });
      });
    }, function () { throw new Error(T('b3.gd.noload')); });
  };
  function api(path, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {});
    return fetch(API + path, opt).then(function (r) {
      if (r.status === 401) { token = null; throw new Error(T('b3.gd.again')); }
      if (!r.ok) return r.text().then(function (x) { var e = new Error(T('b3.gd.fail', { code: r.status })); e.code = r.status; e.body = x; throw e; });
      return r;
    });
  }
  function findFile(st) {
    var check = st.fileId ? api('/drive/v3/files/' + st.fileId + '?fields=id,trashed').then(function (r) { return r.json(); }).then(function (j) { return j.trashed ? null : j.id; }, function (e) { if (e.code === 404) return null; throw e; }) : Promise.resolve(null);
    return check.then(function (id) {
      if (id) return id;
      var q = encodeURIComponent("name='" + GD_FILE + "' and trashed=false");
      return api('/drive/v3/files?q=' + q + '&spaces=drive&orderBy=createdTime&pageSize=5&fields=files(id)').then(function (r) { return r.json(); }).then(function (j) { return j.files && j.files[0] ? j.files[0].id : null; });
    });
  }
  function upload(id, content) {
    if (id) return api('/upload/drive/v3/files/' + id + '?uploadType=media&fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content }).then(function () { return id; });
    var b = 'ns' + Math.random().toString(36).slice(2), meta = { name: GD_FILE, mimeType: 'application/json', description: 'Nivesh Sahayak data, kept in step by my.niveshsahayak.in. Please do not edit or rename.' };
    var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + content + '\r\n--' + b + '--';
    return api('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body }).then(function (r) { return r.json(); }).then(function (j) { return j.id; });
  }
  GD.sync = function () {
    if (busy) return busy;
    if (!GD.signedIn()) return Promise.reject(new Error(T('b3.gd.again')));
    busy = Promise.all([GD.state(), NSStore.exportAll()]).then(function (x) {
      var st = x[0], local = x[1];
      return findFile(st).then(function (id) {
        var remote = id ? api('/drive/v3/files/' + id + '?alt=media').then(function (r) { return r.json(); }) : Promise.resolve(null);
        return remote.then(function (rf) {
          if (rf && (rf.app !== 'Nivesh Sahayak' || rf.kind !== 'sync')) throw new Error(T('b3.gd.badfile'));
          /* a different Drive file than last time (first sync on this device, or the file was replaced): nothing counts as "seen" */
          var m = merge(local, rf ? rf.data : {}, id && id === st.fileId ? st.seen : {});
          return applyLocal(m).then(function () {
            var content = JSON.stringify({ app: 'Nivesh Sahayak', kind: 'sync', version: 1, saved: new Date().toISOString(), data: m.remote });
            return upload(id, content);
          }).then(function (fid) {
            return NSStore.meta('gdClash').then(function (old) {
              var cl = (m.clashes || []).concat(old || []).slice(0, 50);
              return NSStore.meta('gdClash', cl);
            }).then(function () {
              return NSStore.meta('gdSync', { on: true, fileId: fid, last: Date.now(), seen: m.seen });
            }).then(function () { return m; });
          });
        });
      });
    }).then(function (m) { busy = null; if (m.changed && NS.onRestore) NS.onRestore(); return m; }, function (e) { busy = null; throw e; });
    return busy;
  };
  function applyLocal(m) {
    var jobs = [];
    Object.keys(m.local.del).forEach(function (s) { m.local.del[s].forEach(function (id) { jobs.push(function () { return NSStore.del(s, id); }); }); });
    Object.keys(m.local.put).forEach(function (s) {
      if (!m.local.put[s].length) return;
      /* importAll keeps each record's own "updated"; remove first so an older copy from the other device still lands */
      jobs.push(function () { return Promise.all(m.local.put[s].map(function (r) { return NSStore.del(s, r.id); })); });
      jobs.push(function () { var d = {}; d[s] = m.local.put[s]; return NSStore.importAll(d, false); });
    });
    return jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
  }
  GD.connect = function () {
    return GD.signIn().then(GD.sync).then(function (m) { startTimer(); NS.toast(T('b3.gd.done', { n: m.changed })); return m; });
  };
  GD.syncNow = function () {
    return (GD.signedIn() ? Promise.resolve() : GD.signIn()).then(GD.sync).then(function (m) { startTimer(); NS.toast(T('b3.gd.done', { n: m.changed })); return m; });
  };
  GD.disconnect = function () {
    if (token && window.google && google.accounts) try { google.accounts.oauth2.revoke(token, function () {}); } catch (e) {}
    token = null; clearInterval(timer);
    return GD.state().then(function (s) { s.on = false; return NSStore.meta('gdSync', s); });
  };
  /* while signed in on this page: sync every 5 minutes and when the page is put away */
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(function () { if (GD.signedIn()) GD.sync().catch(function () {}); }, 5 * 60000);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && GD.signedIn()) GD.sync().catch(function () {}); });

  function when(ms) { return ms ? new Date(ms).toLocaleString('en-IN') : T('md.never'); }
  /* the Drive card: in the hub's Backup section and the My data box on my. and app.; a link on every other site */
  NS.gdriveCard = function (box) {
    if (!GD.enabled()) return;
    var c = NS.el('div', { 'class': 'card gd-card', 'data-gd': '' });
    box.appendChild(c);
    if (!GD.here()) {
      c.innerHTML = '<h3>' + E(T('b3.gd.t')) + '</h3><p class="note">' + T('b3.gd.there', { link: '<a href="https://my.niveshsahayak.in/#backup" target="_blank" rel="noopener">my.niveshsahayak.in</a>' }) + '</p>';
      return;
    }
    Promise.all([GD.state(), NSStore.meta('gdClash')]).then(function (x) {
      var st = x[0], cl = x[1] || [];
      c.innerHTML = '<h3>' + E(T('b3.gd.t')) + '</h3><p class="note">' + E(T('b3.gd.p')) + '</p>' +
        (st.on ? '<p>' + E(T('b3.gd.last')) + ' <b>' + E(when(st.last)) + '</b></p><div class="btns"><button type="button" class="btn primary" data-gd-act="sync">' + E(T('b3.gd.now')) + '</button><button type="button" class="btn" data-gd-act="off">' + E(T('b3.gd.off')) + '</button></div>'
          : '<div class="btns"><button type="button" class="btn primary" data-gd-act="on">' + E(T('b3.gd.on')) + '</button></div>') +
        '<p class="soft" data-gd-msg aria-live="polite"></p>' +
        (cl.length ? '<details class="gd-cl"><summary>' + E(T('b3.gd.clash', { n: cl.length })) + '</summary><p class="soft">' + E(T('b3.gd.clashp')) + '</p><ul>' + cl.map(function (k, i) {
          var r = k.rec || {}, nm = r.no || r.name || r.desc || r.id;
          return '<li><span>' + E(T('b3.gd.st.' + k.store) || k.store) + ': <b>' + E(nm) + '</b> <small>' + E(when(r.updated)) + '</small></span><button type="button" class="btn sm" data-gd-use="' + i + '">' + E(T('b3.gd.use')) + '</button><button type="button" class="btn sm" data-gd-drop="' + i + '">' + E(T('b3.gd.drop')) + '</button></li>';
        }).join('') + '</ul></details>' : '');
      var msg = NS.$('[data-gd-msg]', c);
      function run(p) {
        msg.textContent = T('b3.gd.busy');
        return p.then(function () { NS.gdriveRefresh(c); }, function (e) { msg.textContent = e.message || String(e); });
      }
      c.addEventListener('click', function (e) {
        var b = e.target.closest('[data-gd-act],[data-gd-use],[data-gd-drop]'); if (!b) return;
        var a = b.getAttribute('data-gd-act');
        if (a === 'on') run(GD.connect());
        else if (a === 'sync') run(GD.syncNow());
        else if (a === 'off' && confirm(T('b3.gd.offc'))) run(GD.disconnect());
        else if (b.hasAttribute('data-gd-use') || b.hasAttribute('data-gd-drop')) {
          var i = +(b.getAttribute('data-gd-use') || b.getAttribute('data-gd-drop')), k = cl[i];
          var p = b.hasAttribute('data-gd-use') ? NSStore.put(k.store, Object.assign({}, k.rec)) : Promise.resolve();
          run(p.then(function () { cl.splice(i, 1); return NSStore.meta('gdClash', cl); }).then(function () { if (b.hasAttribute('data-gd-use') && NS.onRestore) NS.onRestore(); }));
        }
      });
    });
  };
  NS.gdriveRefresh = function (c) { var p = c.parentNode; c.remove(); NS.gdriveCard(p); };

  /* ---------- 3. Send to accountant (acct.js, loaded when pressed) ---------- */
  NS.loadLazy = function (names) {
    var L = CFG.lazy || {};
    return names.reduce(function (p, n) { return p.then(function () { if (!L[n]) throw new Error('missing ' + n); return NS.loadJs(L[n]); }); }, Promise.resolve());
  };
  NS.openAccountant = function () {
    var need = [];
    if (!window.NSBooks) need.push('books.js');
    if (!NS.xlsx) need.push('xlsx.js');
    if (!NS.tally) need.push('tally.js');
    if (!NS.acct) need.push('acct.js');
    return NS.loadLazy(need).then(function () { NS.acct.open(); }, function () { NS.toast(T('b3.ac.noload'), 'bad'); });
  };

  /* ---------- the extra buttons in the My data box and the hub's Backup section ---------- */
  function extras(box, hub) {
    var w = NS.el('div', { 'class': 'b3-extra' });
    w.innerHTML = '<h3>' + E(T('b3.pw.t')) + '</h3><p class="note">' + E(T('b3.pw.p')) + '</p><div class="btns"><button type="button" class="btn" data-act="backup-lock">' + E(T('b3.pw.b')) + '</button></div>' +
      '<h3>' + E(T('b3.ac.t')) + '</h3><p class="note">' + E(T('b3.ac.p')) + '</p><div class="btns"><button type="button" class="btn" data-act="acct">' + E(T('b3.ac.b')) + '</button></div>';
    if (hub) w.className += ' card';
    box.appendChild(w);
    NS.gdriveCard(box);
  }
  NS.mdExt = (NS.mdExt || []).concat([function (body) { extras(body, false); }]);
  NS.hubBackupExt = (NS.hubBackupExt || []).concat([function (pane) { var x = NS.$('[data-backup-ext]', pane) || pane; extras(x, true); }]);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'backup-lock') NS.downloadLockedBackup().then(function (ok) { if (ok && NS.$('#ns-mydata[open]')) NS.openMyData(); }).catch(function () { NS.toast(T('b3.pw.fail'), 'bad'); });
    else if (a === 'acct') NS.openAccountant();
  });
})(typeof window !== 'undefined' ? window : globalThis);
