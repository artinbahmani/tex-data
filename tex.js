/* ============================================================================
   TEX & TEX — Dubai Property Data. Front-end engine v2, 2026-09-17.
   Hand-rolled SVG charts, animated counters, scroll reveals, sortable tables.
   No dependencies, ~11KB. Every chart draws itself from a data-* attribute so
   the renderer only has to emit numbers.
   ========================================================================== */
(function () {
  "use strict";
  var C = { copper: "#d3a188", hi: "#f0cdb4", lo: "#a9765b", up: "#5fd39a", dn: "#ff8b76",
            blue: "#6f9bd1", dim: "rgba(255,255,255,.38)" };
  var NS = "http://www.w3.org/2000/svg";

  function el(t, a, kids) {
    var e = document.createElementNS(NS, t);
    for (var k in (a || {})) e.setAttribute(k, a[k]);
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function fmt(n) {
    n = Number(n);
    if (!isFinite(n)) return "n/a";
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "bn";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + "k";
    return Math.round(n).toLocaleString();
  }
  function full(n) { return Math.round(Number(n)).toLocaleString(); }

  /* ── tooltip (one, reused) ── */
  var tip = document.createElement("div"); tip.className = "tip";
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(tip); });
  function showTip(e, html) {
    tip.innerHTML = html; tip.classList.add("on");
    var r = tip.getBoundingClientRect();
    var x = Math.min(Math.max(e.clientX - r.width / 2, 10), innerWidth - r.width - 10);
    tip.style.left = x + "px";
    tip.style.top = Math.max(10, e.clientY - r.height - 14) + "px";
  }
  function hideTip() { tip.classList.remove("on"); }

  /* ── scroll reveal ── */
  function reveal() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
    }, { threshold: .08, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".rv").forEach(function (n) { io.observe(n); });
  }

  /* ── count-up numbers ── */
  function counters() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) {
        if (!x.isIntersecting) return;
        io.unobserve(x.target);
        var n = x.target, to = parseFloat(n.getAttribute("data-count")),
            pre = n.getAttribute("data-pre") || "", suf = n.getAttribute("data-suf") || "",
            dec = parseInt(n.getAttribute("data-dec") || "0", 10), t0 = 0;
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 1100, 1), e = 1 - Math.pow(1 - p, 4);
          n.textContent = pre + (to * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: .5 });
    document.querySelectorAll("[data-count]").forEach(function (n) { io.observe(n); });
  }

  /* ── bar chart ──────────────────────────────────────────────
     <svg class="chart" data-bar='[{"l":"Jan","v":123,"t":"tooltip html"}]' data-unit="AED"> */
  function bars(svg) {
    var d = JSON.parse(svg.getAttribute("data-bar") || "[]"); if (!d.length) return;
    var W = svg.clientWidth || 860, H = parseInt(svg.getAttribute("data-h") || "230", 10),
        pad = { t: 18, r: 8, b: 30, l: 46 };
    var max = Math.max.apply(null, d.map(function (x) { return +x.v || 0; })) || 1;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / d.length;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.innerHTML = "";
    var g = el("g", { class: "grid" });
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + ih - (ih * i / 4);
      g.appendChild(el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      var tx = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", class: "axis" });
      tx.textContent = fmt(max * i / 4); g.appendChild(tx);
    }
    svg.appendChild(el("g", { class: "axis" }, [g]));
    var grad = el("linearGradient", { id: "bg" + Math.random().toString(36).slice(2, 7), x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el("stop", { offset: "0%", "stop-color": C.hi }));
    grad.appendChild(el("stop", { offset: "100%", "stop-color": C.lo, "stop-opacity": ".55" }));
    var defs = el("defs", {}, [grad]); svg.appendChild(defs);
    d.forEach(function (x, i) {
      var h = Math.max(2, (+x.v || 0) / max * ih), bx = pad.l + i * bw + bw * .17, w = bw * .66;
      var grp = el("g", {});
      var r = el("rect", { x: bx, y: pad.t + ih, width: w, height: 0, rx: 5, fill: "url(#" + grad.id + ")", class: "bar" });
      grp.appendChild(r);
      var lab = el("text", { x: bx + w / 2, y: H - 10, "text-anchor": "middle", class: "axis" });
      lab.textContent = x.l; grp.appendChild(lab);
      var hit = el("rect", { x: pad.l + i * bw, y: pad.t, width: bw, height: ih, fill: "transparent", style: "cursor:pointer" });
      hit.addEventListener("mousemove", function (e) { showTip(e, x.t || ("<b>" + x.l + "</b><br><s>" + full(x.v) + "</s>")); });
      hit.addEventListener("mouseleave", hideTip);
      if (x.href) hit.addEventListener("click", function () { location.href = x.href; });
      grp.appendChild(hit);
      svg.appendChild(grp);
      setTimeout(function () {
        r.style.transition = "y .8s cubic-bezier(.22,1,.36,1),height .8s cubic-bezier(.22,1,.36,1)";
        r.setAttribute("y", pad.t + ih - h); r.setAttribute("height", h);
      }, 40 + i * 32);
    });
  }

  /* ── line / area chart ──────────────────────────────────────
     <svg class="chart" data-line='[{"l":"Jan","v":1700}]' data-h="260"> */
  function lines(svg) {
    var d = JSON.parse(svg.getAttribute("data-line") || "[]"); if (d.length < 2) return;
    var W = svg.clientWidth || 860, H = parseInt(svg.getAttribute("data-h") || "250", 10),
        pad = { t: 20, r: 12, b: 30, l: 52 };
    var vals = d.map(function (x) { return +x.v || 0; });
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var span = (mx - mn) || mx || 1; mn = Math.max(0, mn - span * .22); mx = mx + span * .12;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var X = function (i) { return pad.l + iw * (i / (d.length - 1)); };
    var Y = function (v) { return pad.t + ih - ih * ((v - mn) / (mx - mn)); };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.innerHTML = "";
    var uid = "l" + Math.random().toString(36).slice(2, 7);
    var lg = el("linearGradient", { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(el("stop", { offset: "0%", "stop-color": C.copper, "stop-opacity": ".42" }));
    lg.appendChild(el("stop", { offset: "100%", "stop-color": C.copper, "stop-opacity": "0" }));
    svg.appendChild(el("defs", {}, [lg]));
    var g = el("g", { class: "grid" });
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + ih - (ih * i / 4), v = mn + (mx - mn) * i / 4;
      g.appendChild(el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      var tx = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", class: "axis" });
      tx.textContent = fmt(v); g.appendChild(tx);
    }
    svg.appendChild(el("g", { class: "axis" }, [g]));
    var dp = d.map(function (x, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(+x.v).toFixed(1); }).join(" ");
    svg.appendChild(el("path", { d: dp + " L" + X(d.length - 1) + " " + (pad.t + ih) + " L" + pad.l + " " + (pad.t + ih) + " Z", fill: "url(#" + uid + ")" }));
    var path = el("path", { d: dp, class: "line", stroke: C.copper });
    svg.appendChild(path);
    var len = path.getTotalLength ? path.getTotalLength() : 1000;
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    requestAnimationFrame(function () {
      path.style.transition = "stroke-dashoffset 1.5s cubic-bezier(.22,1,.36,1)";
      path.style.strokeDashoffset = 0;
    });
    d.forEach(function (x, i) {
      if (d.length <= 14 || i % Math.ceil(d.length / 10) === 0) {
        var lab = el("text", { x: X(i), y: H - 10, "text-anchor": "middle", class: "axis" });
        lab.textContent = x.l; svg.appendChild(lab);
      }
      svg.appendChild(el("circle", { cx: X(i), cy: Y(+x.v), r: 3.4, fill: "#0b0b0f", stroke: C.copper, "stroke-width": 2, class: "dot" }));
    });
    var cross = el("line", { y1: pad.t, y2: pad.t + ih, stroke: "rgba(211,161,136,.45)", "stroke-dasharray": "3 3", opacity: 0 });
    svg.appendChild(cross);
    var hit = el("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent", style: "cursor:crosshair" });
    hit.addEventListener("mousemove", function (e) {
      var bb = svg.getBoundingClientRect(), rel = (e.clientX - bb.left) / bb.width * W;
      var i = Math.round((rel - pad.l) / iw * (d.length - 1)); i = Math.max(0, Math.min(d.length - 1, i));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 1);
      showTip(e, d[i].t || ("<b>" + d[i].l + "</b><br><s>" + full(d[i].v) + "</s>"));
    });
    hit.addEventListener("mouseleave", function () { cross.setAttribute("opacity", 0); hideTip(); });
    svg.appendChild(hit);
  }

  /* ── horizontal ranked bars ─────────────────────────────────
     <svg class="chart" data-hbar='[{"l":"Business Bay","v":4685,"href":"/areas/.."}]'> */
  function hbars(svg) {
    var d = JSON.parse(svg.getAttribute("data-hbar") || "[]"); if (!d.length) return;
    var W = svg.clientWidth || 860, rowH = 34, pad = { t: 6, r: 62, b: 6, l: 172 };
    var H = pad.t + pad.b + d.length * rowH;
    var max = Math.max.apply(null, d.map(function (x) { return +x.v || 0; })) || 1;
    var iw = W - pad.l - pad.r;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H); svg.innerHTML = "";
    var uid = "h" + Math.random().toString(36).slice(2, 7);
    var lg = el("linearGradient", { id: uid, x1: 0, y1: 0, x2: 1, y2: 0 });
    lg.appendChild(el("stop", { offset: "0%", "stop-color": C.lo, "stop-opacity": ".75" }));
    lg.appendChild(el("stop", { offset: "100%", "stop-color": C.hi }));
    svg.appendChild(el("defs", {}, [lg]));
    d.forEach(function (x, i) {
      var y = pad.t + i * rowH, w = Math.max(3, (+x.v || 0) / max * iw);
      var grp = el("g", { style: x.href ? "cursor:pointer" : "" });
      var nm = el("text", { x: pad.l - 12, y: y + rowH / 2 + 4, "text-anchor": "end", fill: "rgba(255,255,255,.82)", "font-size": "12.5" });
      nm.textContent = x.l.length > 24 ? x.l.slice(0, 23) + "…" : x.l; grp.appendChild(nm);
      var r = el("rect", { x: pad.l, y: y + 6, width: 0, height: rowH - 12, rx: 5, fill: "url(#" + uid + ")", class: "bar" });
      grp.appendChild(r);
      var vt = el("text", { x: pad.l + w + 9, y: y + rowH / 2 + 4, fill: "rgba(255,255,255,.62)", "font-size": "12", opacity: 0 });
      vt.textContent = x.d || fmt(x.v); grp.appendChild(vt);
      var hit = el("rect", { x: 0, y: y, width: W, height: rowH, fill: "transparent" });
      hit.addEventListener("mousemove", function (e) { showTip(e, x.t || ("<b>" + x.l + "</b><br><s>" + full(x.v) + "</s>")); });
      hit.addEventListener("mouseleave", hideTip);
      if (x.href) hit.addEventListener("click", function () { location.href = x.href; });
      grp.appendChild(hit); svg.appendChild(grp);
      setTimeout(function () {
        r.style.transition = "width .9s cubic-bezier(.22,1,.36,1)"; r.setAttribute("width", w);
        vt.style.transition = "opacity .5s .4s"; vt.setAttribute("opacity", 1);
      }, 40 + i * 42);
    });
  }

  /* ── donut ──────────────────────────────────────────────────
     <svg class="chart" data-donut='[{"l":"Off-plan","v":71},{"l":"Ready","v":29}]'> */
  function donut(svg) {
    var d = JSON.parse(svg.getAttribute("data-donut") || "[]"); if (!d.length) return;
    var S = parseInt(svg.getAttribute("data-h") || "200", 10), R = S / 2 - 12, r0 = R * .62, cx = S / 2, cy = S / 2;
    var tot = d.reduce(function (a, x) { return a + (+x.v || 0); }, 0) || 1;
    var cols = [C.copper, C.blue, C.hi, C.lo, "#8f7f9e"];
    svg.setAttribute("viewBox", "0 0 " + S + " " + S); svg.setAttribute("height", S); svg.innerHTML = "";
    var a0 = -Math.PI / 2;
    d.forEach(function (x, i) {
      var a1 = a0 + (+x.v || 0) / tot * Math.PI * 2, big = (a1 - a0) > Math.PI ? 1 : 0;
      var p = ["M", cx + R * Math.cos(a0), cy + R * Math.sin(a0),
               "A", R, R, 0, big, 1, cx + R * Math.cos(a1), cy + R * Math.sin(a1),
               "L", cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1),
               "A", r0, r0, 0, big, 0, cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0), "Z"].join(" ");
      var seg = el("path", { d: p, fill: cols[i % cols.length], opacity: 0, style: "transition:opacity .6s " + (i * .12) + "s,transform .3s;transform-origin:" + cx + "px " + cy + "px" });
      seg.addEventListener("mousemove", function (e) {
        seg.style.transform = "scale(1.04)";
        showTip(e, "<b>" + x.l + "</b><br><s>" + (100 * x.v / tot).toFixed(1) + "%</s> · " + full(x.v));
      });
      seg.addEventListener("mouseleave", function () { seg.style.transform = ""; hideTip(); });
      svg.appendChild(seg);
      requestAnimationFrame(function () { seg.setAttribute("opacity", 1); });
      a0 = a1;
    });
    var big = el("text", { x: cx, y: cy - 2, "text-anchor": "middle", fill: "#fff", "font-size": S * .17, "font-weight": "600" });
    big.textContent = Math.round(100 * d[0].v / tot) + "%";
    var sub = el("text", { x: cx, y: cy + S * .12, "text-anchor": "middle", fill: C.dim, "font-size": S * .06 });
    sub.textContent = d[0].l;
    svg.appendChild(big); svg.appendChild(sub);
  }

  /* ── sparkline (tiles) ── */
  function spark(svg) {
    var v = JSON.parse(svg.getAttribute("data-spark") || "[]"); if (v.length < 2) return;
    var W = 200, H = 34, mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), sp = (mx - mn) || 1;
    var pts = v.map(function (y, i) { return [W * i / (v.length - 1), H - 3 - (H - 8) * ((y - mn) / sp)]; });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "none"); svg.innerHTML = "";
    var uid = "s" + Math.random().toString(36).slice(2, 7);
    var lg = el("linearGradient", { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(el("stop", { offset: "0%", "stop-color": C.copper, "stop-opacity": ".4" }));
    lg.appendChild(el("stop", { offset: "100%", "stop-color": C.copper, "stop-opacity": "0" }));
    svg.appendChild(el("defs", {}, [lg]));
    var dp = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    svg.appendChild(el("path", { d: dp + " L" + W + " " + H + " L0 " + H + " Z", fill: "url(#" + uid + ")" }));
    svg.appendChild(el("path", { d: dp, fill: "none", stroke: C.copper, "stroke-width": 1.8, "stroke-linecap": "round" }));
    var last = pts[pts.length - 1];
    svg.appendChild(el("circle", { cx: last[0] - 1.5, cy: last[1], r: 2.6, fill: C.hi }));
  }

  /* ── sortable + filterable tables ── */
  function tables() {
    document.querySelectorAll("table[data-sortable]").forEach(function (t) {
      t.querySelectorAll("thead th").forEach(function (th, idx) {
        if (th.classList.contains("nosort")) return;
        th.addEventListener("click", function () {
          var dir = th.getAttribute("data-dir") === "desc" ? "asc" : "desc";
          t.querySelectorAll("th").forEach(function (o) { o.removeAttribute("data-dir"); });
          th.setAttribute("data-dir", dir);
          var rows = Array.prototype.slice.call(t.tBodies[0].rows);
          rows.sort(function (a, b) {
            var x = a.cells[idx].getAttribute("data-v") || a.cells[idx].innerText,
                y = b.cells[idx].getAttribute("data-v") || b.cells[idx].innerText;
            var nx = parseFloat(String(x).replace(/[^0-9.\-]/g, "")), ny = parseFloat(String(y).replace(/[^0-9.\-]/g, ""));
            var c = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : String(x).localeCompare(String(y));
            return dir === "asc" ? c : -c;
          });
          rows.forEach(function (r) { t.tBodies[0].appendChild(r); });
        });
      });
    });
    document.querySelectorAll("[data-filter]").forEach(function (inp) {
      inp.addEventListener("keyup", function () {
        var v = inp.value.toLowerCase(), tgt = document.querySelector(inp.getAttribute("data-filter"));
        if (!tgt) return;
        var shown = 0;
        Array.prototype.slice.call(tgt.tBodies[0].rows).forEach(function (r) {
          var hit = r.innerText.toLowerCase().indexOf(v) > -1;
          r.style.display = hit ? "" : "none"; if (hit) shown++;
        });
        var c = document.getElementById("fcount"); if (c) c.textContent = shown;
      });
    });
  }

  /* ── mobile nav ── */
  function nav() {
    var b = document.querySelector(".burger"), m = document.querySelector("nav.main");
    if (b && m) b.addEventListener("click", function () { m.classList.toggle("open"); b.textContent = m.classList.contains("open") ? "✕" : "☰"; });
  }

  function draw() {
    document.querySelectorAll("svg[data-bar]").forEach(bars);
    document.querySelectorAll("svg[data-line]").forEach(lines);
    document.querySelectorAll("svg[data-hbar]").forEach(hbars);
    document.querySelectorAll("svg[data-donut]").forEach(donut);
    document.querySelectorAll("svg[data-spark]").forEach(spark);
  }
  function boot() { reveal(); counters(); tables(); nav(); draw(); }
  if (document.readyState !== "loading") boot(); else document.addEventListener("DOMContentLoaded", boot);
  var rt; addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(draw, 220); });
  window.TEX = { fmt: fmt, full: full, showTip: showTip, hideTip: hideTip, draw: draw, C: C };
})();
