/* "Found a mistake? Report it" and the contact form, on every Nivesh Sahayak site (build.py adds this file to every site).
   build.py draws a slim notice above the footer ([data-tell], button [data-tell-open]); the Contact page has a [data-ns-contact]
   box whose plain link (to the niveshsahayak.in contact page) stays as the fallback. The form posts to the owner's Cloudflare
   Worker (repo ns-contact, URL in NS_CFG.contact), which saves it in the owner's inbox. No URL: the old link stays.
   Sent along so a problem can be found: page address, language, screen size, browser. Screen words: NS.t('ct.<key>'). */
(function () {
  'use strict';
  if (!window.NS || !NS.$) return;
  var $ = NS.$, esc = NS.esc;
  var API = window.NS_CFG && NS_CFG.contact;
  var FS = !!API && /^https:\/\/formsubmit\.co\//.test(API);   /* FormSubmit address, else the older Worker */
  var OLD = 'https://www.niveshsahayak.in/p/contact.html';
  function T(k) { return NS.t('ct.' + k); }
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var TOPICS = ['err', 'bug', 'q', 'idea', 'other'];
  var n = 0;

  /* FormSubmit switches on one website address at a time, so the message goes through my.niveshsahayak.in/relay.html (a hidden frame, the same
     data home every site already uses) and only that one address had to be activated. The relay forwards to the fixed FormSubmit address only. */
  function viaRelay(json) {
    return new Promise(function (res, rej) {
      var url = ((window.NS_CFG && NS_CFG.vault) || '').replace(/vault\.html$/, 'relay.html');
      if (!/relay\.html$/.test(url)) return rej(new Error('no'));
      var id = Date.now() + '-' + Math.random(), origin = new URL(url).origin, done = false, tm;
      var fr = document.createElement('iframe');
      fr.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'; fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1; fr.title = '';
      function fin(ok) {
        if (done) return; done = true; clearTimeout(tm); window.removeEventListener('message', on);
        if (fr.parentNode) fr.parentNode.removeChild(fr);
        if (ok) res({ ok: true }); else rej(new Error('no'));
      }
      function on(e) { var d = e.data; if (e.origin === origin && d && d.ns === 'contact-done' && d.id === id) fin(!!d.ok); }
      window.addEventListener('message', on);
      tm = setTimeout(function () { fin(false); }, 25000);
      fr.onload = function () { try { fr.contentWindow.postMessage({ ns: 'contact-send', id: id, body: JSON.stringify(json) }, origin); } catch (x) { fin(false); } };
      fr.src = url;
      document.body.appendChild(fr);
    });
  }

  function form(topic) {
    var id = 'ct' + (++n);
    var f = NS.el('form', { 'class': 'ct-form', novalidate: '' });
    f.innerHTML =
      '<div class="ct-f"><label for="' + id + '-t">' + esc(T('topic')) + '</label><select id="' + id + '-t" name="topic">' +
      TOPICS.map(function (t) { return '<option value="' + t + '"' + (t === topic ? ' selected' : '') + '>' + esc(T('t_' + t)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="ct-f"><label for="' + id + '-m">' + esc(T('msg')) + '</label><textarea id="' + id + '-m" name="msg" rows="5" maxlength="3000" required placeholder="' + esc(T('msg_ph')) + '"></textarea></div>' +
      '<div class="ct-2"><div class="ct-f"><label for="' + id + '-n">' + esc(T('name')) + '</label><input id="' + id + '-n" name="name" maxlength="80" autocomplete="name"></div>' +
      '<div class="ct-f"><label for="' + id + '-r">' + esc(T('reply')) + '</label><input id="' + id + '-r" name="reply" maxlength="120" autocomplete="email" inputmode="email"></div></div>' +
      '<div class="ct-hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<p class="ct-priv">' + esc(T('priv')) + '</p>' +
      '<p class="ct-out" role="status" aria-live="polite"></p>' +
      '<div class="ct-btns"><button type="submit" class="btn primary">' + esc(T('send')) + '</button></div>';
    var t0 = Date.now(), out = $('.ct-out', f), btn = $('[type=submit]', f);
    function say(msg, bad, link) {
      out.className = 'ct-out' + (bad ? ' bad' : ' ok');
      out.innerHTML = esc(msg) + (link ? ' <a href="' + OLD + '" target="_blank" rel="noopener">' + esc(T('other')) + '</a>' : '');
    }
    function v(k) { return f.elements.namedItem(k).value; }   /* f.name would be the form's own name, so read fields this way */
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = v('msg').trim();
      if (msg.length < 10) { say(T('short'), true); f.elements.namedItem('msg').focus(); return; }
      var last = +LS.get('ns-ct-last') || 0;
      if (Date.now() - last < 60000) { say(T('wait'), true); return; }
      var data = {
        topic: v('topic'), msg: msg, name: v('name').trim(), reply: v('reply').trim(), website: v('website'),
        page: location.href.split('#')[0].slice(0, 300), site: location.hostname, lang: NS.lang ? NS.lang() : 'en',
        screen: innerWidth + 'x' + innerHeight, agent: navigator.userAgent.slice(0, 300), ms: String(Date.now() - t0)
      };
      var req;
      if (FS) {
        /* FormSubmit: JSON in, the message is mailed to the owner. _honey = the hidden "website" box (any value = dropped silently). */
        var reply = data.reply, isMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply);
        if (data.website) { say(T('ok')); f.reset(); return; }   /* a robot filled the hidden box: look sent, send nothing */
        if (Date.now() - t0 < 3000) { say(T('wait'), true); return; }   /* sent in under 3 s = robot */
        var j = {
          _subject: 'Nivesh Sahayak: [' + data.topic + '] ' + data.site, _captcha: 'false', _template: 'table', _honey: '',
          Topic: data.topic, Message: msg, Name: data.name, Reply: reply, Page: data.page, Language: data.lang, Screen: data.screen, Browser: data.agent
        };
        if (isMail) j.email = reply;   /* FormSubmit's _replyto reads the field called "email" */
        req = viaRelay(j);
      } else {
        req = fetch(API, { method: 'POST', body: new URLSearchParams(data) }).then(function (r) { return r.json(); });
      }
      btn.disabled = true; btn.textContent = T('sending'); out.textContent = '';
      req.then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.why || 'no');
        LS.set('ns-ct-last', String(Date.now()));
        f.reset();
        say(T('ok'));
      }).catch(function (err) {
        say(T(err && err.message === 'short' ? 'short' : 'fail'), true, err && err.message !== 'short');
      }).then(function () { btn.disabled = false; btn.textContent = T('send'); });
    });
    return f;
  }

  /* the "Report it" window */
  var dlg;
  function openReport() {
    if (!API) { window.open(OLD, '_blank', 'noopener'); return; }
    if (!dlg) {
      dlg = NS.el('dialog', { id: 'ns-tell', 'aria-labelledby': 'ns-tell-h' });
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = '<div class="dlg-h"><h2 id="ns-tell-h">' + esc(T('title')) + '</h2><form method="dialog"><button class="btn sm">' + esc(NS.t('close')) + '</button></form></div><div class="dlg-b"></div>';
    $('.dlg-b', dlg).appendChild(form('err'));
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var m = $('textarea', dlg); if (m) m.focus();
  }

  function draw() {
    var bar = $('[data-tell]');
    if (bar) {
      $('[data-tell-text]', bar).textContent = T('note');
      $('[data-tell-open]', bar).textContent = T('btn');
    }
    /* the Contact page: the form in place of the link (the link stays when no web app is set) */
    if (API) NS.$$('[data-ns-contact]').forEach(function (box) {
      var keep = box.querySelector('textarea') && box.querySelector('textarea').value;
      if (keep) return;   /* never wipe what someone is typing when the language changes */
      box.innerHTML = '';
      box.appendChild(form('q'));
    });
  }
  function start() {
    document.addEventListener('click', function (e) { if (e.target.closest('[data-tell-open]')) openReport(); });
    draw();
    document.addEventListener('ns-lang', draw);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
