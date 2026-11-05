/* NS xlsx: read the first sheet of an Excel .xlsx file and write a simple one, without any library.
   An .xlsx is a zip of XML files: reading unzips with the browser's DecompressionStream, writing stores the files uncompressed.
   Every written cell is text, so Excel keeps leading zeros (HSN 0401, state code 03, PIN codes). CSV is read too. */
(function () {
  'use strict';
  var NS = window.NS = window.NS || {};

  /* ---------- zip ---------- */
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  function unzip(buf) {
    var b = new Uint8Array(buf), e = b.length - 22;
    while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
    if (e < 0) return Promise.reject(new Error('not a zip'));
    var n = u16(b, e + 10), p = u32(b, e + 16), files = {}, jobs = [];
    for (var k = 0; k < n; k++) {
      var meth = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      var start = off + 30 + u16(b, off + 26) + u16(b, off + 28), data = b.subarray(start, start + csize);
      jobs.push(inflate(meth, data).then(function (nm) { return function (txt) { files[nm] = txt; }; }(name)));
      p += 46 + nl + xl + cl;
    }
    return Promise.all(jobs).then(function () { return files; });
  }
  function inflate(meth, data) {
    if (meth === 0) return Promise.resolve(new TextDecoder().decode(data));
    if (meth !== 8 || !window.DecompressionStream) return Promise.resolve('');
    var s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(s).text();
  }
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    function h(n, v) { var a = []; for (var i = 0; i < n; i++) a.push((v >>> (8 * i)) & 255); return a; }
    Object.keys(files).forEach(function (name) {
      var nm = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
      var head = [].concat(h(4, 0x04034b50), h(2, 20), h(2, 0x0800), h(2, 0), h(2, 0), h(2, 0x21), h(4, crc), h(4, data.length), h(4, data.length), h(2, nm.length), h(2, 0));
      parts.push(new Uint8Array(head), nm, data);
      central.push(new Uint8Array([].concat(h(4, 0x02014b50), h(2, 20), h(2, 20), h(2, 0x0800), h(2, 0), h(2, 0), h(2, 0x21), h(4, crc), h(4, data.length), h(4, data.length),
        h(2, nm.length), h(2, 0), h(2, 0), h(2, 0), h(2, 0), h(4, 0), h(4, off))), nm);
      off += head.length + nm.length + data.length;
    });
    var size = central.reduce(function (a, x) { return a + x.length; }, 0), n = Object.keys(files).length;
    return new Blob(parts.concat(central, [new Uint8Array([].concat(h(4, 0x06054b50), h(2, 0), h(2, 0), h(2, n), h(2, n), h(4, size), h(4, off), h(2, 0)))]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- read ---------- */
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function kids(el, tag) { return Array.prototype.filter.call(el.getElementsByTagName('*'), function (x) { return x.localName === tag; }); }
  function colNo(ref) { var m = /^([A-Z]+)/.exec(ref || ''), n = 0; if (!m) return -1; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function readXlsx(buf) {
    return unzip(buf).then(function (f) {
      var ss = f['xl/sharedStrings.xml'] ? kids(xml(f['xl/sharedStrings.xml']).documentElement, 'si').map(function (si) { return kids(si, 't').map(function (x) { return x.textContent; }).join(''); }) : [];
      /* the first sheet in the workbook's order */
      var first = 'xl/worksheets/sheet1.xml';
      try {
        var wb = xml(f['xl/workbook.xml']), rels = xml(f['xl/_rels/workbook.xml.rels']), sh = kids(wb.documentElement, 'sheet')[0];
        var rid = sh && (sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
        kids(rels.documentElement, 'Relationship').forEach(function (r) { if (r.getAttribute('Id') === rid) first = 'xl/' + r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, ''); });
      } catch (e) {}
      var s = f[first] || f['xl/worksheets/sheet1.xml'];
      if (!s) throw new Error('no sheet');
      var rows = [];
      kids(xml(s).documentElement, 'row').forEach(function (r) {
        var ri = (+r.getAttribute('r') || rows.length + 1) - 1, row = [];
        kids(r, 'c').forEach(function (c, i) {
          var ci = colNo(c.getAttribute('r')); if (ci < 0) ci = i;
          var t = c.getAttribute('t'), v = kids(c, 'v')[0], val;
          if (t === 's') val = ss[+(v && v.textContent)] || '';
          else if (t === 'inlineStr') val = kids(c, 't').map(function (x) { return x.textContent; }).join('');
          else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
          else val = v ? v.textContent : '';
          row[ci] = val;
        });
        for (var k = 0; k < row.length; k++) if (row[k] == null) row[k] = '';
        rows[ri] = row;
      });
      for (var k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
      return rows;
    });
  }
  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.indexOf('\t') >= 0 && first.indexOf(',') < 0 ? '\t' : ',');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  /* any file the user picks: .xlsx, or .csv/.txt (Excel's "CSV UTF-8") */
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      if (b[0] === 0x50 && b[1] === 0x4B) return readXlsx(buf);
      if (b[0] === 0xD0 && b[1] === 0xCF) throw new Error('xls');
      return readCsv(new TextDecoder().decode(buf));
    }).then(function (rows) { return rows.map(function (r) { return r.map(function (c) { return String(c == null ? '' : c).trim(); }); }).filter(function (r) { return r.some(Boolean); }); });
  }

  /* ---------- write: one sheet per [name, rows]; the first row is bold and frozen ---------- */
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function colName(i) { var s = ''; i++; while (i) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; }
  function write(sheets) {
    var f = {}, ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', rns = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    f['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>';
    f['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    f['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ' + ns + ' ' + rns + '><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + x(s[0]).slice(0, 31) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>';
    f['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    /* style 1 = bold, 2 = text (@) so Excel keeps typed codes as text, 3 = bold + wrap for the notes row */
    f['xl/styles.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ' + ns + '><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="49" applyNumberFormat="1"/><xf numFmtId="49" applyNumberFormat="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>';
    sheets.forEach(function (s, i) {
      var rows = s[1], w = s[2] || [];
      var cols = (rows[0] || []).map(function (h, c) { return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (w[c] || Math.min(40, Math.max(10, String(h).length + 2))) + '" style="2" customWidth="1"/>'; }).join('');
      f['xl/worksheets/sheet' + (i + 1) + '.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ' + ns + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' +
        rows.map(function (r, ri) { return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) { return '<c r="' + colName(ci) + (ri + 1) + '" t="inlineStr" s="' + (ri === 0 && s[3] !== false ? 1 : s[3] === 'wrap' ? 3 : 2) + '"><is><t xml:space="preserve">' + x(v) + '</t></is></c>'; }).join('') + '</row>'; }).join('') +
        '</sheetData></worksheet>';
    });
    return zip(f);
  }
  /* Excel stores typed dates as day numbers since 30 Dec 1899; turn one into YYYY-MM-DD */
  function serialDate(n) { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(+n) * 864e5); return d.toISOString().slice(0, 10); }

  NS.xlsx = { read: readFile, readCsv: readCsv, write: write, serialDate: serialDate };
})();
