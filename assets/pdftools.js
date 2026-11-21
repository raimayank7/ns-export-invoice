/* PDF tools shared by the makers and the App (owner 20 Nov, from the open-source shortlist): pdf-lib (@cantoo/pdf-lib 2.11.1,
   the maintained fork of pdf-lib, MIT) kept in /assets/vendor/ so it works offline, and loaded only when a PDF is joined or split.
   - NS.joinPdf(parts): many PDFs (Blob, ArrayBuffer or bytes) into one, pages in the given order
   - NS.splitPdf(part, groups): one PDF into several, groups = lists of page numbers (from 1)
   - NS.pageRanges(text, count): "1-3, 5, 7-" into page groups; null when the text is wrong
   - NS.manyPdf(groups, name): each document drawn with the Share-as-PDF code (html2canvas + jsPDF), then joined into one file
   Everything stays in the browser: no file leaves this computer. */
(function (root) {
  'use strict';
  var LIB = '/assets/vendor/pdf-lib-cantoo-2.11.1.min.js';
  function lib() {
    if (root.PDFLib && root.PDFLib.PDFDocument) return Promise.resolve(root.PDFLib);
    return root.NS.loadJs(LIB).then(function () { return root.PDFLib; });
  }
  function bytes(p) {
    if (p instanceof Uint8Array || p instanceof ArrayBuffer) return Promise.resolve(p);
    if (p && typeof p.arrayBuffer === 'function') return p.arrayBuffer();
    return Promise.reject(new Error('not a PDF'));
  }
  /* pure: page groups from what the user typed. "1-3, 4, 6-" (an open end runs to the last page); one group per comma.
     "each" or "all" = every page on its own. Returns null when a number is out of range or the text cannot be read. */
  function pageRanges(text, count) {
    var s = String(text || '').trim().toLowerCase();
    if (!count || count < 1) return null;
    if (s === 'each' || s === 'all' || s === '*') { var e = []; for (var k = 1; k <= count; k++) e.push([k]); return e; }
    if (!s) return null;
    var out = [], parts = s.split(/[,;]+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var m = /^(\d+)?\s*(?:(-|to)\s*(\d+)?)?$/.exec(p);
      if (!m || (!m[1] && !m[3])) return null;
      var a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : count) : a;
      if (a < 1 || b < 1 || a > count || b > count || a > b) return null;
      var g = []; for (var n = a; n <= b; n++) g.push(n); out.push(g);
    }
    return out.length ? out : null;
  }
  /* join with a given PDFLib (also used by the node tests) */
  function joinWith(L, list) {
    return L.PDFDocument.create().then(function (out) {
      return list.reduce(function (pr, buf) {
        return pr.then(function () { return L.PDFDocument.load(buf, { ignoreEncryption: true }); }).then(function (src) {
          return out.copyPages(src, src.getPageIndices()).then(function (pages) { pages.forEach(function (pg) { out.addPage(pg); }); });
        });
      }, Promise.resolve()).then(function () { out.setProducer('NSBiz by Nivesh Sahayak'); out.setCreator('NSBiz'); return out.save(); });
    });
  }
  function splitWith(L, buf, groups) {
    return L.PDFDocument.load(buf, { ignoreEncryption: true }).then(function (src) {
      return groups.reduce(function (pr, g) {
        return pr.then(function (acc) {
          return L.PDFDocument.create().then(function (out) {
            return out.copyPages(src, g.map(function (n) { return n - 1; })).then(function (pages) {
              pages.forEach(function (pg) { out.addPage(pg); }); out.setProducer('NSBiz by Nivesh Sahayak'); return out.save();
            });
          }).then(function (b) { acc.push(b); return acc; });
        });
      }, Promise.resolve([]));
    });
  }
  function pageCountWith(L, buf) { return L.PDFDocument.load(buf, { ignoreEncryption: true }).then(function (d) { return d.getPageCount(); }); }
  var API = { pageRanges: pageRanges, joinWith: joinWith, splitWith: splitWith, pageCountWith: pageCountWith };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }

  var NS = root.NS; if (!NS) return;
  NS.pdfLib = lib;
  NS.pageRanges = pageRanges;
  NS.joinPdf = function (parts) { return lib().then(function (L) { return Promise.all(parts.map(bytes)).then(function (list) { return joinWith(L, list); }); }); };
  NS.splitPdf = function (part, groups) { return lib().then(function (L) { return bytes(part).then(function (b) { return splitWith(L, b, groups); }); }); };
  NS.pdfPages = function (part) { return lib().then(function (L) { return bytes(part).then(function (b) { return pageCountWith(L, b); }); }); };
  function safeName(n) { return String(n || 'Documents').replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) + '.pdf'; }
  /* groups = [{ nodes: printed sheets of one document, paper: 'a4' | 'a5' | 'th80' | 'th58' }]: each document keeps its own paper size */
  NS.manyPdf = function (groups, name) {
    var fname = safeName(name), parts = [];
    NS.toast(NS.t('pdf.joining', { n: groups.length }));
    return groups.reduce(function (pr, g) {
      return pr.then(function () { return NS.makePdf(g.nodes, g.paper); }).then(function (b) { parts.push(b); });
    }, Promise.resolve()).then(function () { return NS.joinPdf(parts); }).then(function (out) {
      return lib().then(function (L) { return pageCountWith(L, out); }).then(function (pages) {
        (NS.saveFile || function () {})(new Blob([out], { type: 'application/pdf' }), fname);
        NS.toast(NS.t('pdf.joined', { file: fname, n: groups.length, p: pages }));
        return pages;
      });
    }).catch(function (e) {
      try { console.warn('One PDF could not be made', e); } catch (e2) {}
      NS.toast(NS.t('pdf.joinfail'), 'bad');
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
