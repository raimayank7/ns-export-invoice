/* NSBiz user logins (owner 20 Nov 2026, SQLite Stage 2): the login box on every NSBiz page.
   Logins are turned on by the owner in My data › Settings › Users and logins (hubusers.js). From then on the data home refuses
   every command of a tab that is not logged in (sqlauth.js checks the rights where the data is), store.js fires 'ns-login',
   and this box asks for the user and password. The login lasts while the tab is open; after the idle time set by the owner
   (default 15 minutes without a key or click) the screen locks again. NS.login.me() = the logged-in user (name, role, rights,
   limits) for screens that hide what a user may not do; NS.login.can(area, act). */
(function () {
  'use strict';
  if (!window.NSStore || !NSStore.auth) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ME = null, ST = null, box = null, idleT = 0, IDLE = 15;
  try { IDLE = +(localStorage.getItem('nsbiz-idle') || 15) || 15; } catch (e) {}
  function status() { return NSStore.auth('authStatus').then(function (s) { ST = s || {}; ME = ST.me || null; return ST; }, function () { return {}; }); }
  function show(msg) {
    if (box) { var m = box.querySelector('[data-lmsg]'); if (m && msg) m.textContent = msg; return; }
    var users = (ST && ST.users) || [];
    box = document.createElement('dialog'); box.className = 'b2-dlg ns-login'; box.setAttribute('aria-labelledby', 'nsl-h');
    box.innerHTML = '<form method="dialog" data-lf><h2 id="nsl-h">Log in to NSBiz</h2>' +
      '<p class="soft" data-lmsg>' + esc(msg || 'This business data is protected. Choose your name and type your password.') + '</p>' +
      '<label>User <select name="u" required>' + users.map(function (u) { return '<option>' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>Password <input name="p" type="password" autocomplete="current-password" required minlength="1"></label>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" type="submit">Log in</button>' +
      '<button class="btn" type="button" data-lrec>Owner forgot the password?</button></div>' +
      '<div data-lrecbox hidden style="margin-top:12px"><p class="soft">Type the recovery code printed when logins were turned on, and a new owner password.</p>' +
      '<label>Recovery code <input name="rc" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" dir="ltr"></label>' +
      '<label>New owner password <input name="np" type="password" autocomplete="new-password" minlength="6"></label>' +
      '<button class="btn" type="button" data-lrecgo>Use the recovery code</button></div></form>';
    document.body.appendChild(box);
    box.addEventListener('cancel', function (e) { e.preventDefault(); });   /* no way around the box */
    var f = box.querySelector('[data-lf]'), say = function (t) { box.querySelector('[data-lmsg]').textContent = t; };
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      say('Checking…');
      NSStore.auth('login', { name: f.u.value, pw: f.p.value }).then(function () { location.reload(); }, function (er) { f.p.value = ''; f.p.focus(); say(clean(er) || 'Wrong name or password.'); });
    });
    box.querySelector('[data-lrec]').addEventListener('click', function () { box.querySelector('[data-lrecbox]').hidden = false; });
    box.querySelector('[data-lrecgo]').addEventListener('click', function () {
      say('Checking the recovery code…');
      NSStore.auth('recover', { name: f.u.value, code: f.rc.value, pw: f.np.value }).then(function () { location.reload(); }, function (er) { say(clean(er)); });
    });
    box.showModal();
    setTimeout(function () { f.p.focus(); }, 50);
  }
  function clean(er) { return String(er && er.message || er || '').replace(/^NSAUTH: /, '').replace(/^./, function (c) { return c.toUpperCase(); }); }
  /* idle lock: no key, click or touch for IDLE minutes */
  function poke() { clearTimeout(idleT); if (ME) idleT = setTimeout(lock, IDLE * 60000); }
  function lock() { NSStore.auth('logout').then(function () { ME = null; return status(); }).then(function () { show('Locked after ' + IDLE + ' minutes without use. Log in again.'); }); }
  ['keydown', 'pointerdown', 'wheel'].forEach(function (ev) { document.addEventListener(ev, poke, { passive: true, capture: true }); });
  document.addEventListener('ns-login', function (e) {
    var why = String(e.detail || '');
    status().then(function () { if (/this browser/.test(why)) show(clean(why)); else if (ST.on && !ME) show(); });
  });
  NS.login = {
    me: function () { return ME; },
    status: status,
    can: function (area, act) { if (!ST || !ST.on) return true; return !!(ME && ME.rights && ME.rights[area] && ME.rights[area][act]); },
    logout: function () { return NSStore.auth('logout').then(function () { location.reload(); }); },
    switchUser: function () { return NSStore.auth('logout').then(function () { ME = null; return status(); }).then(function () { show('Choose the user to log in as.'); }); },
    setIdle: function (m) { IDLE = Math.max(1, +m || 15); try { localStorage.setItem('nsbiz-idle', String(IDLE)); } catch (e) {} poke(); }
  };
  /* on start: logins on and nobody logged in here, ask at once */
  var go = function () { status().then(function (s) { if (s.on && !s.me) show(); if (s.on && s.me) { poke(); document.documentElement.classList.add('ns-logged'); } }); };
  if (NSStore.ready) NSStore.ready().then(go, go); else go();
})();
