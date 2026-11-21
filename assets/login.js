/* NSBiz user logins (owner 20 Nov 2026, SQLite Stage 2): the login box on every NSBiz page.
   Logins are turned on by the owner in My data › Settings › Users and logins (hubusers.js). From then on the data home refuses
   every command of a tab that is not logged in (sqlauth.js checks the rights where the data is), store.js fires 'ns-login',
   and this box asks for the user and password. The login lasts while the tab is open; after the idle time set by the owner
   (default 15 minutes without a key or click) the screen locks again. NS.login.me() = the logged-in user (name, role, rights,
   limits) for screens that hide what a user may not do; NS.login.can(area, act); NS.login.word(error) = the message of a
   refused command in the reader's language. Words: 'lgn.*' (the box shows on every site, so they are in every language). */
(function () {
  'use strict';
  if (!window.NSStore || !NSStore.auth) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (k, o) { return window.NS && NS.t ? NS.t('lgn.' + k, o) : k; };
  var ME = null, ST = null, box = null, idleT = 0, IDLE = 15;
  try { IDLE = +(localStorage.getItem('nsbiz-idle') || 15) || 15; } catch (e) {}
  function status() { return NSStore.auth('authStatus').then(function (s) { ST = s || {}; ME = ST.me || null; return ST; }, function () { return {}; }); }
  /* the data home answers in English ('NSAUTH: …'); the known answers are shown in the reader's language */
  var WORDS = [[/^login$/, 'e_login'], [/^no right/, 'e_noright'], [/^back date: entries older than (\d+)/, 'e_back'], [/^only the owner can bring back/, 'e_restore'],
    [/^only the owner can use the recovery code/, 'e_rconly'], [/^only the owner$/, 'e_owner'], [/^logins are already on/, 'e_already'], [/^name and a password/, 'e_namepw'],
    [/^wrong name or password/, 'e_wrong'], [/^wrong recovery code/, 'e_rcwrong'], [/^a password of 6/, 'e_pw6'], [/^give a new name/, 'e_newname'],
    [/^there is one owner/, 'e_oneowner'], [/^no such user/, 'e_nouser'], [/^the owner stays the owner/, 'e_staysowner'], [/^the old password is wrong/, 'e_oldwrong'],
    [/^the owner role is fixed/, 'e_ownerfixed'], [/^this browser cannot open data protected by logins/, 'e_browser']];
  function word(er) {
    var m = String(er && er.message || er || '').replace(/^NSAUTH: /, '');
    for (var i = 0; i < WORDS.length; i++) { var x = WORDS[i][0].exec(m); if (x) return T(WORDS[i][1], { n: x[1] || '' }); }
    return m.replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function show(msg) {
    if (box) { var m = box.querySelector('[data-lmsg]'); if (m && msg) m.textContent = msg; return; }
    var users = (ST && ST.users) || [];
    box = document.createElement('dialog'); box.className = 'b2-dlg ns-login'; box.setAttribute('aria-labelledby', 'nsl-h');
    box.innerHTML = '<form method="dialog" data-lf><h2 id="nsl-h">' + esc(T('title')) + '</h2>' +
      '<p class="soft" data-lmsg>' + esc(msg || T('intro')) + '</p>' +
      '<label>' + esc(T('user')) + ' <select name="u" required>' + users.map(function (u) { return '<option>' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(T('pw')) + ' <input name="p" type="password" autocomplete="current-password" required minlength="1"></label>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" type="submit">' + esc(T('go')) + '</button>' +
      '<button class="btn" type="button" data-lrec>' + esc(T('forgot')) + '</button></div>' +
      '<div data-lrecbox hidden style="margin-top:12px"><p class="soft">' + esc(T('rcp')) + '</p>' +
      '<label>' + esc(T('rc')) + ' <input name="rc" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" dir="ltr"></label>' +
      '<label>' + esc(T('newpw')) + ' <input name="np" type="password" autocomplete="new-password" minlength="6"></label>' +
      '<button class="btn" type="button" data-lrecgo>' + esc(T('userc')) + '</button></div></form>';
    document.body.appendChild(box);
    box.addEventListener('cancel', function (e) { e.preventDefault(); });   /* no way around the box */
    var f = box.querySelector('[data-lf]'), say = function (t) { box.querySelector('[data-lmsg]').textContent = t; };
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      say(T('checking'));
      NSStore.auth('login', { name: f.u.value, pw: f.p.value }).then(function () { location.reload(); }, function (er) { f.p.value = ''; f.p.focus(); say(word(er) || T('e_wrong')); });
    });
    box.querySelector('[data-lrec]').addEventListener('click', function () { box.querySelector('[data-lrecbox]').hidden = false; });
    box.querySelector('[data-lrecgo]').addEventListener('click', function () {
      say(T('checkrc'));
      NSStore.auth('recover', { name: f.u.value, code: f.rc.value, pw: f.np.value }).then(function () { location.reload(); }, function (er) { say(word(er)); });
    });
    box.showModal();
    setTimeout(function () { f.p.focus(); }, 50);
  }
  /* idle lock: no key, click or touch for IDLE minutes */
  function poke() { clearTimeout(idleT); if (ME) idleT = setTimeout(lock, IDLE * 60000); }
  function lock() { NSStore.auth('logout').then(function () { ME = null; return status(); }).then(function () { show(T('locked', { n: IDLE })); }); }
  ['keydown', 'pointerdown', 'wheel'].forEach(function (ev) { document.addEventListener(ev, poke, { passive: true, capture: true }); });
  document.addEventListener('ns-login', function (e) {
    var why = String(e.detail || '');
    status().then(function () { if (/this browser/.test(why)) show(word(why)); else if (ST.on && !ME) show(); });
  });
  NS.login = {
    me: function () { return ME; },
    status: status,
    word: word,
    can: function (area, act) { if (!ST || !ST.on) return true; return !!(ME && ME.rights && ME.rights[area] && ME.rights[area][act]); },
    logout: function () { return NSStore.auth('logout').then(function () { location.reload(); }); },
    switchUser: function () { return NSStore.auth('logout').then(function () { ME = null; return status(); }).then(function () { show(T('choose')); }); },
    setIdle: function (m) { IDLE = Math.max(1, +m || 15); try { localStorage.setItem('nsbiz-idle', String(IDLE)); } catch (e) {} poke(); }
  };
  /* on start: logins on and nobody logged in here, ask at once */
  var go = function () { status().then(function (s) { if (s.on && !s.me) show(); if (s.on && s.me) { poke(); document.documentElement.classList.add('ns-logged'); } }); };
  if (NSStore.ready) NSStore.ready().then(go, go); else go();
})();
