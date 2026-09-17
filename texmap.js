/* ============================================================================
   TEX & TEX — Dubai Property Map. v3, 2026-09-17.
   Two modes like the reference product, built on MapLibre + free OpenFreeMap tiles:
     Areas    — district choropleth (real OSM boundaries) + a slide-in district panel
     Projects — the dark 3D city (real extruded buildings) + project markers
   Everything is repainted to the TEX night palette in code, because every free vector
   style ships light. No API key anywhere.
   ========================================================================== */
(function () {
  "use strict";
  var M = window.TEXMAP = {};
  var map, MODE = "areas", METRIC = "psf", THREE_D = true, SEL = [];
  var AREAS = [], PROJECTS = [], POLY = null, CFG = {};

  /* Dubai + a little breathing room. Stops the user from zooming out to the ocean. */
  var BOUNDS = [[54.55, 24.55], [56.15, 25.80]];
  var HOME = { center: [55.21, 25.09], zoom: 9.6, pitch: 55, bearing: -18 };

  var METRICS = {
    psf:    { k: "psf",    label: "Price per sqft",   fmt: function (v) { return "AED " + TEX.full(v); }, dir: "hi" },
    price:  { k: "price",  label: "Median price",     fmt: function (v) { return "AED " + TEX.full(v); }, dir: "hi" },
    sales:  { k: "sales",  label: "Sales volume",     fmt: function (v) { return TEX.full(v); },          dir: "hi" },
    val:    { k: "val",    label: "Money transacted", fmt: function (v) { return "AED " + TEX.fmt(v); },  dir: "hi" },
    yld:    { k: "yld",    label: "Gross yield",      fmt: function (v) { return v + "%"; },              dir: "hi" },
    rent:   { k: "rent",   label: "Typical rent",     fmt: function (v) { return "AED " + TEX.full(v); }, dir: "hi" },
    exp90:  { k: "exp90",  label: "Leases expiring",  fmt: function (v) { return TEX.full(v); },          dir: "hi" },
    off:    { k: "off",    label: "Off-plan share",   fmt: function (v) { return v + "%"; },              dir: "hi" }
  };

  /* cool → warm ramp, anchored on the TEX copper in the middle */
  function ramp(t) {
    var st = [[0, [58, 96, 152]], [.28, [98, 160, 198]], [.52, [211, 161, 136]], [.76, [228, 138, 94]], [1, [202, 66, 45]]];
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        var a = st[i - 1], b = st[i], k = (t - a[0]) / (b[0] - a[0]);
        return "rgb(" + a[1].map(function (c, j) { return Math.round(c + (b[1][j] - c) * k); }).join(",") + ")";
      }
    }
    return "rgb(202,66,45)";
  }
  function vals(rows) {
    return rows.map(function (r) { return +r[METRIC] || 0; }).filter(function (v) { return v > 0; });
  }
  function stats(rows) {
    var v = vals(rows).sort(function (a, b) { return a - b; });
    if (!v.length) return { mn: 0, mx: 1, avg: 0, sorted: [] };
    return { mn: v[0], mx: v[v.length - 1],
             avg: v.reduce(function (a, b) { return a + b; }, 0) / v.length, sorted: v };
  }
  /* percentile position of a value inside the set, so colour shows RANK not raw distance.
     A linear ramp put 90% of Dubai in the same blue because a few prime districts stretch it. */
  function pct(v, s) {
    var a = s.sorted, lo = 0, hi = a.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
    return a.length > 1 ? lo / (a.length - 1) : .5;
  }

  /* ── repaint the light base style into the TEX night palette ── */
  function darken() {
    (map.getStyle().layers || []).forEach(function (L) {
      var id = L.id, t = L.type;
      try {
        if (t === "background") map.setPaintProperty(id, "background-color", "#06060a");
        else if (t === "fill") {
          var c = "#0d0d13";
          if (/water|ocean|sea|river|lake|bay/i.test(id)) c = "#081420";
          else if (/park|grass|wood|forest|golf|garden|scrub|cemetery|pitch/i.test(id)) c = "#0a1310";
          else if (/sand|beach|desert/i.test(id)) c = "#12100d";
          else if (/building/i.test(id)) c = "#14141b";
          else if (/aeroway|airport|runway|apron/i.test(id)) c = "#0e0e14";
          else if (/residential|landuse|industrial|commercial/i.test(id)) c = "#0b0b11";
          map.setPaintProperty(id, "fill-color", c);
        } else if (t === "line") {
          var lc = "#191921";
          if (/motorway|trunk/i.test(id)) lc = "#39373f";
          else if (/primary/i.test(id)) lc = "#2c2b33";
          else if (/secondary|tertiary/i.test(id)) lc = "#23222a";
          else if (/water|river/i.test(id)) lc = "#0b1826";
          else if (/boundary|admin/i.test(id)) lc = "rgba(211,161,136,.20)";
          else if (/rail|transit|aeroway/i.test(id)) lc = "#1e1e27";
          map.setPaintProperty(id, "line-color", lc);
        } else if (t === "symbol") {
          map.setPaintProperty(id, "text-color", "rgba(255,255,255,.46)");
          map.setPaintProperty(id, "text-halo-color", "rgba(0,0,0,.9)");
          map.setPaintProperty(id, "text-halo-width", 1.3);
          if (/poi|shop|amenity|housenum/i.test(id)) map.setLayoutProperty(id, "visibility", "none");
        } else if (t === "fill-extrusion") {
          /* the real city: light grey volumes reading as a physical model against the dark ground */
          map.setPaintProperty(id, "fill-extrusion-color", [
            "interpolate", ["linear"], ["get", "render_height"],
            0, "#24242c", 60, "#33333d", 160, "#45454f", 400, "#5c5c66"
          ]);
          map.setPaintProperty(id, "fill-extrusion-opacity", .92);
          map.setPaintProperty(id, "fill-extrusion-vertical-gradient", true);
          /* show the model earlier than the style's default z14 so it reads at district zoom */
          map.setLayerZoomRange(id, 12.4, 24);
        }
      } catch (e) {}
    });
  }

  /* ── AREAS mode: real district polygons, coloured by the metric ── */
  function buildAreas() {
    var s = stats(AREAS), by = {};
    AREAS.forEach(function (a) { by[a.dld] = a; });
    POLY.features.forEach(function (f) {
      var a = by[f.properties.dld] || {};
      var v = +a[METRIC] || 0;
      f.properties.c = v ? ramp(pct(v, s)) : "#16161d";
      f.properties.v = v;
      f.properties.name = a.n || f.properties.dld;
      f.properties.s = a.s || "";
      f.properties.sales = a.sales || 0; f.properties.psf = a.psf || 0;
      f.properties.price = a.price || 0; f.properties.off = a.off || 0;
      f.properties.yld = a.yld || null; f.properties.rent = a.rent || null;
      f.properties.exp90 = a.exp90 || 0; f.properties.val = a.val || 0;
    });
    var src = map.getSource("areas");
    if (src) { src.setData(POLY); legend(s); return; }
    map.addSource("areas", { type: "geojson", data: POLY });
    map.addLayer({ id: "area-fill", type: "fill", source: "areas",
      paint: { "fill-color": ["get", "c"], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], .88, .66] } });
    map.addLayer({ id: "area-line", type: "line", source: "areas",
      paint: { "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#f0cdb4", "rgba(211,161,136,.45)"],
               "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.2, .9] } });
    map.addLayer({ id: "area-label", type: "symbol", source: "areas", minzoom: 10.2,
      layout: { "text-field": ["get", "name"], "text-size": 12, "text-allow-overlap": false },
      paint: { "text-color": "rgba(255,255,255,.9)", "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 1.5 } });
    var hov = null;
    map.on("mousemove", "area-fill", function (e) {
      map.getCanvas().style.cursor = "pointer";
      if (hov !== null) map.setFeatureState({ source: "areas", id: hov }, { hover: false });
      hov = e.features[0].id;
      map.setFeatureState({ source: "areas", id: hov }, { hover: true });
      var p = e.features[0].properties;
      TEX.showTip(e.originalEvent, "<b>" + p.name + "</b><br><s>" + METRICS[METRIC].label + ": " +
        (p.v ? METRICS[METRIC].fmt(p.v) : "no data") + "</s><br>" + TEX.full(p.sales) + " sales this year");
    });
    map.on("mouseleave", "area-fill", function () {
      map.getCanvas().style.cursor = "";
      if (hov !== null) map.setFeatureState({ source: "areas", id: hov }, { hover: false });
      hov = null; TEX.hideTip();
    });
    map.on("click", "area-fill", function (e) { panel(e.features[0].properties, "area"); });
    legend(s);
  }

  /* ── PROJECTS mode: markers on the 3D city, plus real footprints where OSM has them ── */
  function buildProjects() {
    var rows = PROJECTS.filter(function (p) { return (+p[METRIC] || 0) > 0; });
    var s = stats(rows);
    var pts = { type: "FeatureCollection", features: rows.map(function (p) {
      var v = +p[METRIC] || 0;
      return { type: "Feature",
        properties: { n: p.n, s: p.s, c: ramp(pct(v, s)), v: v, exact: p.src && p.src.indexOf("osm") === 0 ? 1 : 0,
                      sales: p.sales, psf: p.psf, price: p.price, off: p.off, area: p.area, exp90: p.exp90 || 0 },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
    }) };
    var shapes = { type: "FeatureCollection", features: rows.filter(function (p) { return p.rings; }).map(function (p) {
      var v = +p[METRIC] || 0;
      return { type: "Feature", properties: { n: p.n, s: p.s, c: ramp(pct(v, s)), h: p.h || 90 },
               geometry: { type: "Polygon", coordinates: p.rings } };
    }) };
    if (map.getSource("proj")) { map.getSource("proj").setData(pts); map.getSource("projshape").setData(shapes); legend(s); return; }
    map.addSource("projshape", { type: "geojson", data: shapes });
    map.addLayer({ id: "proj-shape", type: "fill-extrusion", source: "projshape", minzoom: 12.5,
      paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"],
               "fill-extrusion-base": 0, "fill-extrusion-opacity": .95, "fill-extrusion-vertical-gradient": true } });
    map.addSource("proj", { type: "geojson", data: pts });
    map.addLayer({ id: "proj-glow", type: "circle", source: "proj",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 11, 15, 34],
               "circle-color": ["get", "c"], "circle-opacity": .18, "circle-blur": 1 } });
    map.addLayer({ id: "proj-dot", type: "circle", source: "proj",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 15],
               "circle-color": ["get", "c"], "circle-opacity": .9,
               "circle-stroke-width": 1.4, "circle-stroke-color": "rgba(255,255,255,.75)" } });
    map.addLayer({ id: "proj-label", type: "symbol", source: "proj", minzoom: 13,
      layout: { "text-field": ["get", "n"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" },
      paint: { "text-color": "rgba(255,255,255,.9)", "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 1.4 } });
    function hov(e) {
      map.getCanvas().style.cursor = "pointer";
      var p = e.features[0].properties;
      TEX.showTip(e.originalEvent, "<b>" + p.n + "</b><br><s>" + METRICS[METRIC].label + ": " + METRICS[METRIC].fmt(p.v) +
        "</s><br>" + TEX.full(p.sales) + " sales" + (p.exact ? "" : "<br><i style='opacity:.6'>placed in district</i>"));
    }
    map.on("mousemove", "proj-dot", hov);
    map.on("mouseleave", "proj-dot", function () { map.getCanvas().style.cursor = ""; TEX.hideTip(); });
    map.on("click", "proj-dot", function (e) { panel(e.features[0].properties, "project"); });
    legend(s);
  }

  /* ── legend: gradient + the three reference values, like the reference product ── */
  function legend(s) {
    var m = METRICS[METRIC];
    var el = document.getElementById("lg");
    if (!el) return;
    el.innerHTML =
      '<div class="lgbar"><span>Low</span><i></i><b>' + m.label + '</b><span>High</span></div>' +
      '<div class="lgrow"><em style="background:rgb(202,66,45)"></em>Highest<b>' + m.fmt(Math.round(s.mx)) + '</b></div>' +
      '<div class="lgrow"><em style="background:rgb(211,161,136)"></em>Median<b>' + m.fmt(Math.round(s.sorted[Math.floor(s.sorted.length/2)] || s.avg)) + '</b></div>' +
      '<div class="lgrow"><em style="background:rgb(58,96,152)"></em>Lowest<b>' + m.fmt(Math.round(s.mn)) + '</b></div>';
  }

  /* ── slide-in detail panel ── */
  function row(k, v) { return '<div class="row"><span>' + k + "</span><b>" + v + "</b></div>"; }
  function panel(p, kind) {
    var el = document.getElementById("panel");
    document.getElementById("pn").textContent = p.name || p.n;
    document.getElementById("ps").textContent = kind === "area"
      ? "Registered DLD activity, 2026" : ("In " + (p.area || "Dubai") + " · registered 2026");
    document.getElementById("pr").innerHTML =
      row("Sales", TEX.full(p.sales)) +
      row("Median AED/sqft", "AED " + TEX.full(p.psf)) +
      row("Median price", "AED " + TEX.full(p.price)) +
      row("Off-plan share", p.off + "%") +
      (p.rent ? row("Typical rent", "AED " + TEX.full(p.rent)) : "") +
      (p.yld ? row("Gross yield", p.yld + "%") : "") +
      (p.exp90 ? row("Leases ending in 90d", TEX.full(p.exp90)) : "");
    var href = (kind === "area" ? "/areas/" : "/projects/") + p.s + "/";
    document.getElementById("pl").href = href;
    var cmp = document.getElementById("pc");
    if (cmp) {
      cmp.style.display = kind === "area" ? "" : "none";
      cmp.onclick = function () { addCompare(p.s, p.name || p.n); };
    }
    el.classList.add("on");
  }

  /* ── compare tray: pick areas straight off the map ── */
  function addCompare(s, n) {
    if (SEL.some(function (x) { return x.s === s; })) return;
    if (SEL.length >= 4) SEL.shift();
    SEL.push({ s: s, n: n });
    drawTray();
  }
  function drawTray() {
    var t = document.getElementById("tray");
    if (!t) return;
    if (!SEL.length) { t.classList.remove("on"); t.innerHTML = ""; return; }
    t.classList.add("on");
    t.innerHTML = '<span class="tl">Compare</span>' +
      SEL.map(function (x, i) { return '<span class="tchip">' + x.n + '<button data-i="' + i + '">&times;</button></span>'; }).join("") +
      '<a class="tgo" href="/compare/?a=' + SEL.map(function (x) { return x.s; }).join(",") + '">Compare ' + SEL.length + ' &rarr;</a>';
    t.querySelectorAll("button[data-i]").forEach(function (b) {
      b.onclick = function () { SEL.splice(+b.getAttribute("data-i"), 1); drawTray(); };
    });
  }

  function setMode(m) {
    MODE = m;
    ["area-fill", "area-line", "area-label"].forEach(function (id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", m === "areas" ? "visible" : "none");
    });
    ["proj-dot", "proj-glow", "proj-label", "proj-shape"].forEach(function (id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", m === "projects" ? "visible" : "none");
    });
    if (m === "projects" && !map.getSource("proj")) buildProjects();
    if (m === "areas" && !map.getSource("areas")) buildAreas();
    else if (m === "areas") buildAreas(); else buildProjects();
    document.getElementById("panel").classList.remove("on");
    if (m === "projects") map.easeTo({ zoom: Math.max(map.getZoom(), 12.6), pitch: 62, duration: 1100 });
  }

  function set3D(on) {
    THREE_D = on;
    map.easeTo({ pitch: on ? 58 : 0, duration: 900 });
    (map.getStyle().layers || []).forEach(function (L) {
      if (L.type === "fill-extrusion" && L.id.indexOf("proj") !== 0) {
        try { map.setLayoutProperty(L.id, "visibility", on ? "visible" : "none"); } catch (e) {}
      }
    });
    if (map.getLayer("proj-shape")) map.setLayoutProperty("proj-shape", "visibility", (on && MODE === "projects") ? "visible" : "none");
  }

  M.init = function (cfg) {
    CFG = cfg; AREAS = cfg.areas; PROJECTS = cfg.projects; POLY = cfg.poly;
    POLY.features.forEach(function (f, i) { f.id = i; });
    map = new maplibregl.Map({
      container: "map", style: "https://tiles.openfreemap.org/styles/liberty",
      center: HOME.center, zoom: HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing,
      maxBounds: BOUNDS, minZoom: 8.6, maxZoom: 17.5, maxPitch: 75,
      antialias: true, attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("style.load", function () {
      darken(); buildAreas(); setMode(MODE);
      var spin = true, t0 = performance.now();
      (function orbit(t) { if (!spin) return; map.setBearing(-18 + Math.sin((t - t0) / 32000) * 11); requestAnimationFrame(orbit); })(t0);
      ["mousedown", "touchstart", "wheel"].forEach(function (ev) {
        map.getCanvas().addEventListener(ev, function () { spin = false; }, { once: true });
      });
    });
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll("[data-mode]").forEach(function (o) { o.classList.remove("on"); });
        b.classList.add("on"); setMode(b.getAttribute("data-mode"));
      };
    });
    var sel = document.getElementById("metric");
    if (sel) sel.onchange = function () {
      METRIC = sel.value;
      MODE === "areas" ? buildAreas() : buildProjects();
    };
    var td = document.getElementById("td");
    if (td) td.onchange = function () { set3D(td.checked); };
    var px = document.getElementById("px");
    if (px) px.onclick = function () { document.getElementById("panel").classList.remove("on"); };
    var rs = document.getElementById("reset");
    if (rs) rs.onclick = function () { map.easeTo({ center: HOME.center, zoom: HOME.zoom, pitch: THREE_D ? HOME.pitch : 0, bearing: HOME.bearing, duration: 1200 }); };
    var find = document.getElementById("find");
    if (find) find.oninput = function () {
      var q = find.value.toLowerCase().trim();
      if (q.length < 2) return;
      var pool = MODE === "areas" ? AREAS : PROJECTS;
      var hit = pool.filter(function (x) { return (x.n || "").toLowerCase().indexOf(q) > -1; })[0];
      if (hit && hit.lat) map.easeTo({ center: [hit.lon, hit.lat], zoom: MODE === "areas" ? 12.4 : 14.4, duration: 1200 });
      else if (hit) {
        var f = POLY.features.filter(function (x) { return x.properties.dld === hit.dld; })[0];
        if (f) {
          var pts = f.geometry.coordinates[0][0];
          var lon = pts.reduce(function (a, p) { return a + p[0]; }, 0) / pts.length;
          var lat = pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length;
          map.easeTo({ center: [lon, lat], zoom: 12.4, duration: 1200 });
        }
      }
    };
    drawTray();
  };
})();
