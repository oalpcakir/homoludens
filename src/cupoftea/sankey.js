/* A Cup of Tea: "where the farthings went", a hand-built Sankey diagram (inline SVG, no libraries).
   Inlined into each scene page by build_cupoftea.py, which also puts the three scenes' answer keys in
   window.TEA_KEYS[1..3] ({CLUES, ROWS, RETAIL, ...}, copied out of the scenes' own source). Every figure
   drawn here is read from those keys: nothing is typed twice.

   TeaSankey.sugar()           Scene 1: her 4½d for a pound of sugar
   TeaSankey.tea()             Scene 3: her 5d for two ounces of Congou
   TeaSankey.whole(havana)     the whole receipt, 9½d; havana=true splits the 1.75d as Scene 2 found it
   TeaSankey.render(el, spec, {order:[recipient keys in the order the ledger lines locked], onStep})
     Wide screens: receipt on the left, recipients on the right. Under 700px: the money pours down and
     peels off to the right, one recipient per row. Flows draw in one by one when the figure comes into
     view; the labour line is a hairline with its note. A table with the same figures sits under it. */
(function () {
  var K = window.TEA_KEYS || {};
  var num = function (t) { return parseFloat(t); };
  var r4 = function (x) { return Math.round(x * 1e4) / 1e4; };
  var COL = { crown: '#2c4a6b', grocer: '#2f5d3a', shipowner: '#4d5761', havana: '#7b4a22', planter: '#7b4a22',
    merchant: '#9a7428', china: '#5e6630', sugar: '#a7622f', tea: '#4f5a35' };
  var RED = '#8b2a1f', INK = '#2a1f17', INK2 = '#5a4a3a', PAPER = '#efe5cc';
  function pence(v) { // 4.5 -> 4½d, 0.29 -> 0.29d
    var w = Math.floor(v + 1e-9), f = r4(v - w), fr = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[f];
    return f === 0 ? w + 'd' : fr ? (w || '') + fr + 'd' : v.toFixed(2) + 'd';
  }
  function row(KEY, r, from) {
    return { key: r.ans.who, who: KEY.CLUES[r.ans.who].t, what: KEY.CLUES[r.ans.what].t, v: num(KEY.CLUES[r.ans.share].t), from: from };
  }

  /* ------------------------------------------------------------------ the ledgers, from the answer keys */
  function sugarFlows(havana, from) {
    var A = K[1], flows = A.ROWS.map(function (r) { return row(A, r, from); });
    var traces = [];
    if (havana && K[2]) { // Scene 2's money page: who took the 1.75d
      var B = K[2];
      B.ROWS.filter(function (r) { return r.g === 'money'; }).forEach(function (r) { flows.push(row(B, r, from)); });
      var cut = B.ROWS.filter(function (r) { return r.ans.who === 'cutter'; })[0];
      if (cut) traces.push({ to: 'planter', from: from, who: B.CLUES.cutter.t,
        note: B.CLUES[cut.ans.hours].t + ' a day at harvest. ' + B.CLUES[cut.ans.wage].t + '. Her share is inside the planter’s; nobody wrote it down.' });
    } else {
      var known = flows.reduce(function (a, f) { return a + f.v; }, 0);
      flows.push({ key: 'havana', who: 'Stayed in Havana', what: 'The rest of the bonded price: not freight, never in London', v: r4(A.RETAIL - known), from: from });
      traces.push({ to: 'havana', from: from, who: A.NONAME.whoNote.split('. ')[0],
        note: A.NONAME.share + ' ' + A.NONAME.shareNote + ' ' + A.NONAME.labour + '.' });
    }
    return { flows: flows, traces: traces, total: A.RETAIL };
  }
  function teaFlows(from) {
    var C = K[3], flows = C.ROWS.map(function (r) { return row(C, r, from); });
    var china = C.ROWS.filter(function (r) { return r.ans.who === 'china'; })[0];
    return { flows: flows, total: C.RETAIL,
      traces: china ? [{ to: 'china', from: from, who: 'The people who grew it', note: china.labour }] : [] };
  }
  var api = {
    sugar: function () {
      var s = sugarFlows(false, 'root');
      return { id: 'sugar', total: s.total, source: 'Her ' + pence(s.total), item: 'a pound of sugar', flows: s.flows, traces: s.traces,
        title: 'Where her ' + pence(s.total) + ' for a pound of sugar went' };
    },
    tea: function () {
      var t = teaFlows('root');
      return { id: 'tea', total: t.total, source: 'Her ' + pence(t.total), item: 'two ounces of Congou', flows: t.flows, traces: t.traces,
        title: 'Where her ' + pence(t.total) + ' for two ounces of tea went' };
    },
    whole: function (havana) {
      var s = sugarFlows(havana, 'sugar'), t = teaFlows('tea'), total = r4(s.total + t.total);
      return { id: 'whole', total: total, source: 'Her ' + pence(total), item: 'the whole receipt',
        mids: [{ key: 'sugar', label: 'Sugar', v: s.total }, { key: 'tea', label: 'Tea', v: t.total }],
        flows: s.flows.concat(t.flows), traces: s.traces.concat(t.traces),
        title: 'Where every farthing of her ' + pence(total) + ' went' };
    },
    pence: pence
  };

  /* ------------------------------------------------------------------ styles (once) */
  var css = '\
.sk{position:relative;margin:6px 0 4px;text-align:left}\
.sk svg{display:block;width:100%;height:auto;overflow:visible}\
.sk .lab{font-family:"IM Fell English",Georgia,serif;font-size:17px;fill:' + INK + '}\
.sk .fig{font-family:"EB Garamond",Georgia,serif;font-weight:600;font-size:15px}\
.sk .fig tspan.pc{font-weight:400;fill:' + INK2 + '}\
.sk .wh{font-family:"EB Garamond",Georgia,serif;font-style:italic;font-size:13.5px;fill:' + INK2 + '}\
.sk .tn{font-family:"EB Garamond",Georgia,serif;font-style:italic;font-size:13.5px;fill:' + RED + '}\
.sk .tn tspan.tw{font-style:normal;font-weight:600}\
.sk .halo{paint-order:stroke;stroke:' + PAPER + ';stroke-width:4px;stroke-linejoin:round}\
.sk .src{font-family:"IM Fell English",Georgia,serif;font-size:19px;fill:' + INK + '}\
.sk .lk{transition:opacity .25s}\
.sk.hov .lk:not(.on){opacity:.28}\
.sk .lbl{transition:opacity .6s ease-out}\
.sk.pre .lbl{opacity:0}.sk.pre .lbl.in{opacity:1}\
.sk .tr{fill:none;stroke:' + RED + ';stroke-width:1.3;stroke-dasharray:3 2.5}\
.sk-tip{position:absolute;pointer-events:none;background:#fbf6e8;border:1px solid #c9b78f;box-shadow:2px 3px 0 rgba(0,0,0,.12);\
padding:5px 9px;font:14px/1.35 "EB Garamond",Georgia,serif;color:' + INK + ';max-width:260px;opacity:0;transition:opacity .15s;z-index:2}\
.sk-tip.on{opacity:1}.sk-tip b{font-family:"IM Fell English",Georgia,serif;font-weight:400;font-size:16px}\
.sk details{margin:6px 0 0;font-size:14px}\
.sk summary{cursor:pointer;color:' + INK2 + ';font-style:italic;font-size:14px;text-align:center}\
.sk summary:focus-visible{outline:3px solid #2c4a6b;outline-offset:2px}\
.sk table{border-collapse:collapse;width:100%;margin:6px 0 0;font-size:14px}\
.sk th,.sk td{border-bottom:1px solid #c9b78f;padding:3px 5px;text-align:left;vertical-align:top}\
.sk th{font-weight:600;color:' + INK2 + ';font-size:13px}\
.sk td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}\
.sk tr.lab td{color:' + RED + ';font-style:italic}\
.sk tr.tot td{border-bottom:2px solid ' + INK + ';font-weight:600}';
  function style() { if (document.getElementById('sk-css')) return; var s = document.createElement('style'); s.id = 'sk-css'; s.textContent = css; document.head.appendChild(s); }

  /* ------------------------------------------------------------------ helpers */
  var NS = 'http://www.w3.org/2000/svg', uid = 0;
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  }
  var mctx = null;
  function measure(s, font) { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); mctx.font = font; return mctx.measureText(s).width; }
  function wrap(s, font, w) {
    var out = [], line = '';
    String(s).split(' ').forEach(function (word) { var t = line ? line + ' ' + word : word; if (line && measure(t, font) > w) { out.push(line); line = word; } else line = t; });
    if (line) out.push(line); return out;
  }
  var F_LAB = '17px "IM Fell English",Georgia,serif', F_WH = 'italic 13.5px "EB Garamond",Georgia,serif';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function pct(v, t) { var p = v / t * 100; return (p < 10 ? Math.round(p * 10) / 10 : Math.round(p)) + '%'; }
  function fx(v) { return v.toFixed(2) + 'd'; }
  // recipients in the order they first appear, with their flows summed
  function recipients(spec) {
    var out = [], by = {};
    spec.flows.forEach(function (f) {
      var r = by[f.key];
      if (!r) { r = by[f.key] = { key: f.key, who: f.who, what: f.what, v: 0, parts: [], traces: [] }; out.push(r); }
      r.v = r4(r.v + f.v); r.parts.push(f);
    });
    (spec.traces || []).forEach(function (t) { if (by[t.to]) by[t.to].traces.push(t); });
    return out;
  }
  // combined figure: order recipients so sugar-only come first, then the shared ones, then tea-only
  function ordered(spec) {
    var rs = recipients(spec);
    if (!spec.mids) return rs;
    var rank = function (r) { var s = r.parts.some(function (p) { return p.from === 'sugar'; }), t = r.parts.some(function (p) { return p.from === 'tea'; }); return s && t ? 1 : s ? 0 : 2; };
    return rs.map(function (r, i) { return [rank(r), i, r]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return x[2]; });
  }
  // label block for a recipient: name, figure, what-for and any labour notes, wrapped to w
  function labelLines(r, spec, w) {
    var whatTxt = spec.mids && r.parts.length > 1 ? r.parts.map(function (p) { return p.from + ' ' + fx(p.v); }).join(' + ') : r.what;
    var L = { what: wrap(whatTxt, F_WH, w), notes: [] };
    r.traces.forEach(function (t) { L.notes.push(wrap(t.who + '. ' + t.note, F_WH, w - 6)); });
    var h = 18 + 19 + L.what.length * 17;
    L.noteY = h + 8; L.notes.forEach(function (n) { h += 8 + n.length * 17; });
    L.h = h; return L;
  }
  function drawLabel(g, r, spec, L, x, y, cls) {
    var col = COL[r.key] || INK;
    var t = el('text', { x: x, y: y + 14, 'class': 'lab' }, g); t.textContent = r.who;
    var f = el('text', { x: x, y: y + 33, 'class': 'fig', fill: col }, g);
    f.appendChild(document.createTextNode(fx(r.v) + ' '));
    var pc = el('tspan', { 'class': 'pc' }, f); pc.textContent = '· ' + pct(r.v, spec.total) + ' of ' + api.pence(spec.total);
    L.what.forEach(function (s, i) { var w = el('text', { x: x, y: y + 51 + i * 17, 'class': 'wh' }, g); w.textContent = s; });
    var ny = y + L.noteY;
    L.notes.forEach(function (n) {
      n.forEach(function (s, i) { var w = el('text', { x: x + 6, y: ny + 13 + i * 17, 'class': 'tn' }, g); w.textContent = s; });
      ny += 8 + n.length * 17;
    });
  }
  function hatch(defs, key) {
    var id = 'skh-' + key + '-' + uid, c = COL[key] || INK;
    var p = el('pattern', { id: id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(' + (key === 'crown' ? -35 : 35) + ')' }, defs);
    el('rect', { width: 5, height: 5, fill: c, 'fill-opacity': .38 }, p);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: c, 'stroke-width': 1.3, 'stroke-opacity': .55 }, p);
    return 'url(#' + id + ')';
  }

  /* ------------------------------------------------------------------ layouts
     Both return {W, H, steps:[{els, clip:{x,y,w,h, grow:'x'|'y'}}], ...} drawn into svg. */
  function horizontal(svg, spec, W, steps) {
    var defs = el('defs', {}, svg), rs = ordered(spec), mids = spec.mids;
    var nodeW = 10, top = 40, gap = 16;
    var xs = 0, xm = mids ? Math.round(W * 0.25) : null, xr = Math.round(W * (mids ? 0.5 : 0.4));
    var lx = xr + nodeW + 14, lw = W - lx - 2;
    var k = (mids ? 290 : 240) / spec.total;
    rs.forEach(function (r) { r.h = Math.max(2, r.v * k); r.L = labelLines(r, spec, lw); r.slot = Math.max(r.h, r.L.h); });
    var colH = rs.reduce(function (a, r) { return a + r.slot; }, 0) + gap * (rs.length - 1);
    var y = top; rs.forEach(function (r) { r.y = y; r.yIn = y; y += r.slot + gap; });
    var srcH = spec.total * k, sy = top;
    var H = top + colH + 12;
    // the source: her receipt
    var gS = el('g', { 'class': 'lbl' }, svg);
    el('rect', { x: xs, y: sy, width: nodeW, height: srcH, fill: INK }, gS);
    var st = el('text', { x: xs, y: sy - 12, 'class': 'src' }, gS); st.textContent = spec.source;
    var sub = el('text', { x: xs, y: sy - 12 + 0, dx: measure(spec.source, '19px "IM Fell English",Georgia,serif') + 8, 'class': 'wh' }, gS); sub.textContent = spec.item;
    steps.push({ els: [gS] });
    function ribbon(x1, a1, x2, a2, h, key, tip, cls) {
      var xm2 = (x1 + x2) / 2, d = 'M' + x1 + ',' + a1 + 'C' + xm2 + ',' + a1 + ' ' + xm2 + ',' + a2 + ' ' + x2 + ',' + a2 +
        'L' + x2 + ',' + (a2 + h) + 'C' + xm2 + ',' + (a2 + h) + ' ' + xm2 + ',' + (a1 + h) + ' ' + x1 + ',' + (a1 + h) + 'Z';
      var p = el('path', { d: d, fill: hatch(defs, key), stroke: COL[key] || INK, 'stroke-opacity': .75, 'stroke-width': .8, 'class': 'lk ' + cls, 'data-tip': tip }, svg);
      var tt = el('title', {}, p); tt.textContent = tip.replace(/<[^>]+>/g, '');
      return p;
    }
    var srcOff = sy;
    if (mids) {
      var my = top + Math.max(0, Math.min(40, (colH - (spec.total * k + 28)) / 2));
      mids.forEach(function (m) {
        m.h = m.v * k; m.y = my; m.out = my; my += m.h + 28;
        var p = ribbon(xs + nodeW, srcOff, xm, m.y, m.h, m.key, '<b>' + m.label + '</b><br>' + fx(m.v) + ' · ' + pct(m.v, spec.total) + ' of ' + api.pence(spec.total), 'sk-mid');
        p.setAttribute('data-v', m.v); srcOff += m.h;
        var g = el('g', { 'class': 'lbl' }, svg);
        el('rect', { x: xm, y: m.y, width: nodeW, height: m.h, fill: COL[m.key] }, g);
        // a small paper tag on the node: "Sugar 4½d"
        var tw = measure(m.label, F_LAB) + 8 + measure(api.pence(m.v), '600 15px "EB Garamond",Georgia,serif') + 16, ty = m.y + m.h / 2 - 13;
        el('rect', { x: xm - 6 - tw, y: ty, width: tw, height: 26, rx: 2, fill: '#fbf6e8', stroke: COL[m.key], 'stroke-width': 1 }, g);
        var t = el('text', { x: xm - 6 - tw + 8, y: ty + 18, 'class': 'lab' }, g); t.textContent = m.label + ' ';
        var t2 = el('tspan', { 'class': 'fig', fill: COL[m.key] }, t); t2.textContent = api.pence(m.v);
        steps.push({ els: [p, g], clip: { x: xs + nodeW, y: 0, w: xm - xs, h: H, grow: 'x' } });
      });
    }
    var midBy = {}; (mids || []).forEach(function (m) { midBy[m.key] = m; });
    var traceAt = [];
    rs.forEach(function (r) {
      var els = [], x0 = mids ? xm + nodeW : xs + nodeW;
      r.parts.forEach(function (f) {
        var h = f.v * k, a1;
        if (mids) { var m = midBy[f.from]; a1 = m.out; m.out += h; } else { a1 = srcOff; srcOff += h; }
        var tip = '<b>' + f.who + '</b><br>' + f.what + '<br>' + fx(f.v) + ' · ' + pct(f.v, spec.total) + ' of ' + api.pence(spec.total) + (mids ? ' (' + f.from + ')' : '');
        var p = ribbon(x0, a1, xr, r.yIn, h, r.key, tip, 'sk-flow');
        p.setAttribute('data-v', f.v); p.setAttribute('data-key', r.key);
        f._a1 = a1; f._a2 = r.yIn; f._h = h; r.yIn += h; els.push(p);
      });
      var g = el('g', { 'class': 'lbl' }, svg);
      el('rect', { x: xr, y: r.y, width: nodeW, height: r.h, fill: COL[r.key] || INK }, g);
      drawLabel(g, r, spec, r.L, lx, r.y - 2);
      els.push(g);
      steps.push({ key: r.key, els: els, clip: { x: x0, y: 0, w: xr - x0 + nodeW, h: H, grow: 'x' } });
      r.traces.forEach(function (t) {
        var f = r.parts.filter(function (p) { return p.from === t.from; })[0] || r.parts[0];
        var b1 = f._a1 + f._h + 3, b2 = f._a2 + f._h + 3, xmm = (x0 + xr) / 2, ny = r.y - 2 + r.L.noteY + 9;
        var d = 'M' + x0 + ',' + b1 + 'C' + xmm + ',' + b1 + ' ' + xmm + ',' + b2 + ' ' + (xr + nodeW) + ',' + b2 +
          'C' + (xr + nodeW + 9) + ',' + b2 + ' ' + (lx - 6) + ',' + ny + ' ' + (lx + 2) + ',' + ny;
        traceAt.push({ d: d, x0: x0 });
      });
    });
    traceAt.forEach(function (t) {
      var p = el('path', { d: t.d, 'class': 'tr' }, svg);
      steps.push({ trace: true, els: [p], clip: { x: t.x0, y: 0, w: W - t.x0, h: H, grow: 'x' } });
    });
    return H;
  }

  function vertical(svg, spec, W, steps) {
    var defs = el('defs', {}, svg), rs = ordered(spec);
    var x0 = 6, T = Math.min(Math.round(W * 0.3), 120), k = T / spec.total, R = 9, nodeW = 7, topY = 46, gap = 14;
    var Xe = x0 + T + R + 10, lx = Xe + nodeW + 10, lw = W - lx - 2;
    rs.forEach(function (r) { r.w = r.v * k; r.L = labelLines(r, spec, lw); r.slot = Math.max(r.w, r.L.h); });
    // slices: the first row peels off the right edge of the stream
    var right = x0 + T, y = topY + R + 18;
    rs.forEach(function (r) { r.right = right; right -= r.w; r.y = y; y += r.slot + gap; });
    var H = y - gap + 10;
    var gS = el('g', { 'class': 'lbl' }, svg);
    el('rect', { x: x0, y: topY - 7, width: T, height: 7, fill: INK }, gS);
    var st = el('text', { x: x0, y: topY - 16, 'class': 'src' }, gS); st.textContent = spec.source;
    var sub = el('text', { x: x0, y: topY - 16, dx: measure(spec.source, '19px "IM Fell English",Georgia,serif') + 8, 'class': 'wh' }, gS); sub.textContent = spec.item;
    steps.push({ els: [gS] });
    var traces = [];
    rs.forEach(function (r) {
      var els = [], off = 0, yy = r.y;
      r.parts.forEach(function (f) {
        var w = f.v * k, lb = r.right - off, la = lb - w, ri = R + off, ro = ri + w, ya = yy, yb = yy + w;
        var d = 'M' + la + ',' + topY + 'L' + la + ',' + (yb - ro) + 'Q' + la + ',' + yb + ' ' + (la + ro) + ',' + yb + 'L' + Xe + ',' + yb +
          'L' + Xe + ',' + ya + 'L' + (lb + ri) + ',' + ya + 'Q' + lb + ',' + ya + ' ' + lb + ',' + (ya - ri) + 'L' + lb + ',' + topY + 'Z';
        var tip = '<b>' + f.who + '</b><br>' + f.what + '<br>' + fx(f.v) + ' · ' + pct(f.v, spec.total) + ' of ' + api.pence(spec.total) + (spec.mids ? ' (' + f.from + ')' : '');
        var p = el('path', { d: d, fill: hatch(defs, r.key), stroke: COL[r.key] || INK, 'stroke-opacity': .75, 'stroke-width': .8, 'class': 'lk sk-flow', 'data-tip': tip, 'data-v': f.v, 'data-key': r.key }, svg);
        el('title', {}, p).textContent = tip.replace(/<br>/g, ' · ').replace(/<[^>]+>/g, '');
        f._la = la; f._yb = yb; f._ro = ro; off += w; yy += w; els.push(p);
      });
      var g = el('g', { 'class': 'lbl' }, svg);
      el('rect', { x: Xe, y: r.y, width: nodeW, height: Math.max(2, r.w), fill: COL[r.key] || INK }, g);
      drawLabel(g, r, spec, r.L, lx, r.y - 3);
      els.push(g);
      steps.push({ key: r.key, els: els, clip: { x: 0, y: topY - 1, w: W, h: r.y + r.slot - topY + 2, grow: 'y' } });
      r.traces.forEach(function (t) {
        var f = r.parts.filter(function (p) { return p.from === t.from; })[0] || r.parts[0];
        var x = f._la - 3, yb = f._yb + 3, ro = f._ro + 3, ny = r.y - 3 + r.L.noteY + 9;
        traces.push({ d: 'M' + x + ',' + topY + 'L' + x + ',' + (yb - ro) + 'Q' + x + ',' + yb + ' ' + (x + ro) + ',' + yb + 'L' + (Xe + nodeW) + ',' + yb +
          'C' + (Xe + nodeW + 6) + ',' + yb + ' ' + (lx - 4) + ',' + ny + ' ' + (lx + 3) + ',' + ny, bottom: ny + 4 });
      });
    });
    traces.forEach(function (t) {
      var p = el('path', { d: t.d, 'class': 'tr' }, svg);
      steps.push({ trace: true, els: [p], clip: { x: 0, y: topY - 1, w: W, h: t.bottom - topY + 2, grow: 'y' } });
    });
    return H;
  }

  /* ------------------------------------------------------------------ render */
  function table(spec) {
    var rs = ordered(spec), cap = spec.title + '. Every figure is the one worked out in the ledger.';
    var h = '<table><caption class="sk-cap" style="caption-side:bottom;font-size:12px;color:' + INK2 + ';font-style:italic;padding-top:4px">' + esc(cap) + '</caption>' +
      '<thead><tr><th scope="col">Who</th><th scope="col">What for</th>' + (spec.mids ? '<th scope="col">From</th>' : '') + '<th scope="col" class="n">Pence</th><th scope="col" class="n">Share</th></tr></thead><tbody>';
    rs.forEach(function (r) {
      r.parts.forEach(function (f) {
        h += '<tr><td>' + esc(f.who) + '</td><td>' + esc(f.what) + '</td>' + (spec.mids ? '<td>' + esc(f.from) + '</td>' : '') +
          '<td class="n">' + fx(f.v) + '</td><td class="n">' + pct(f.v, spec.total) + '</td></tr>';
      });
      r.traces.forEach(function (t) {
        h += '<tr class="lab"><td>' + esc(t.who) + '</td><td colspan="' + (spec.mids ? 2 : 1) + '">' + esc(t.note) + '</td><td class="n">?</td><td class="n">inside ' + esc(r.who.replace(/^The /, 'the ')) + '’s share</td></tr>';
      });
    });
    var sum = r4(spec.flows.reduce(function (a, f) { return a + f.v; }, 0));
    h += '<tr class="tot"><td>Total</td><td>Her receipt</td>' + (spec.mids ? '<td></td>' : '') + '<td class="n">' + fx(sum) + '</td><td class="n">100%</td></tr></tbody></table>';
    return h;
  }
  function describe(spec) {
    return spec.title + ': ' + ordered(spec).map(function (r) { return r.who + ' ' + fx(r.v) + ' (' + pct(r.v, spec.total) + ')'; }).join(', ') +
      '. ' + (spec.traces || []).map(function (t) { return t.who + ': ' + t.note; }).join(' ');
  }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function tween(rect, attr, to, ms) {
    var t0 = null;
    function f(t) { if (t0 == null) t0 = t; var p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); rect.setAttribute(attr, to * e); if (p < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }

  function render(host, spec, opts) {
    opts = opts || {}; style();
    var state = host._sk || (host._sk = { played: false });
    state.spec = spec; state.opts = opts;
    host.classList.add('sk');
    host.innerHTML = '';
    var W = Math.floor(host.clientWidth);
    if (!W) return host; // hidden: drawn when it becomes visible (see observe)
    state.W = W;
    var narrow = window.innerWidth < 700 || W < 520;
    var id = 'sk' + (++uid);
    var svg = el('svg', { role: 'img', 'aria-labelledby': id + 't ' + id + 'd', 'data-total': spec.total, 'data-layout': narrow ? 'vertical' : 'horizontal', 'data-spec': spec.id }, host);
    el('title', { id: id + 't' }, svg).textContent = spec.title;
    el('desc', { id: id + 'd' }, svg).textContent = describe(spec);
    var steps = [];
    var H = (narrow ? vertical : horizontal)(svg, spec, W, steps);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(H));
    svg.setAttribute('width', W); svg.setAttribute('height', Math.ceil(H));
    var tip = document.createElement('div'); tip.className = 'sk-tip'; tip.setAttribute('aria-hidden', 'true'); host.appendChild(tip);
    var det = document.createElement('details'); det.innerHTML = '<summary>The same figures as a table</summary>' + table(spec); host.appendChild(det);
    // tooltips and highlight
    function show(e) {
      var p = e.target.closest && e.target.closest('[data-tip]');
      host.classList.toggle('hov', !!p);
      svg.querySelectorAll('.lk.on').forEach(function (x) { x.classList.remove('on'); });
      if (!p) { tip.classList.remove('on'); return; }
      svg.querySelectorAll('.lk[data-key="' + p.getAttribute('data-key') + '"]').forEach(function (x) { x.classList.add('on'); });
      p.classList.add('on');
      tip.innerHTML = p.getAttribute('data-tip');
      var b = host.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      tip.classList.add('on');
      var tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(W - tw, x - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 14) + 'px';
    }
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', function () { host.classList.remove('hov'); tip.classList.remove('on'); svg.querySelectorAll('.lk.on').forEach(function (x) { x.classList.remove('on'); }); });

    // the animation: flows ink in one by one, in the order the ledger lines were locked
    if (state.played || reduced() || opts.animate === false) { state.played = true; return host; }
    host.classList.add('pre');
    var defs = svg.querySelector('defs');
    var order = (opts.order || []).slice();
    var head = steps.filter(function (s) { return !s.key && !s.trace; }),
        flows = steps.filter(function (s) { return s.key; }),
        tr = steps.filter(function (s) { return s.trace; });
    flows.sort(function (a, b) {
      var ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var seq = head.concat(flows, tr);
    seq.forEach(function (s) {
      if (!s.clip) return;
      var cid = 'skc' + (++uid), cp = el('clipPath', { id: cid }, defs), c = s.clip;
      s.rect = el('rect', { x: c.x, y: c.y, width: c.grow === 'x' ? 0 : c.w, height: c.grow === 'y' ? 0 : c.h }, cp);
      s.els.forEach(function (e) { if (e.tagName !== 'g') e.setAttribute('clip-path', 'url(#' + cid + ')'); });
    });
    function play() {
      if (state.played) return; state.played = true;
      var clock = 0;
    seq.forEach(function (s) {
        var at = clock; clock += s.trace ? 450 : s.key ? 560 : 380; if (s.trace) at += 300;
        setTimeout(function () {
          if (s.rect) tween(s.rect, s.clip.grow === 'x' ? 'width' : 'height', s.clip.grow === 'x' ? s.clip.w : s.clip.h, s.trace ? 1600 : 850);
          s.els.forEach(function (e) { if (e.tagName === 'g') setTimeout(function () { e.classList.add('in'); }, s.rect ? 420 : 0); });
          if (opts.onStep && s.key) try { opts.onStep(s.key); } catch (e) {}
        }, at);
      });
      setTimeout(function () { host.classList.remove('pre'); }, clock + 2600);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); play(); } }, { threshold: 0.25 });
      io.observe(svg);
    } else play();
    return host;
  }
  // redraw (without animating again) when the width or the layout changes
  var watched = [];
  function observe(host) { if (watched.indexOf(host) < 0) watched.push(host); }
  var rt = null;
  function relayout() {
    watched.forEach(function (h) {
      var s = h._sk; if (!s || !s.spec) return;
      var W = Math.floor(h.clientWidth); if (!W || W === s.W) return;
      if (s.W) s.played = true; // already seen once: no second animation
      render(h, s.spec, s.opts);
    });
  }
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(relayout, 120); });
  api.render = function (host, spec, opts) { observe(host); return render(host, spec, opts); };
  api.relayout = relayout;
  window.TeaSankey = api;
})();
