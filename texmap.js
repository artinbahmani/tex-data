/* ============================================================================
   TEX & TEX — Dubai Property Map. v4, 2026-09-18.
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

  var C = window.TEXCORE;
  /* Palette, scale and base-style repaint all live in texcore.js, shared with the
     rental, benchmark and villa maps. One place decides what a colour means. */
  var BOUNDS = C.BOUNDS, HOME = C.HOME;

  var METRICS = {
    psf:    { k: "psf",    label: "Price per sqft",   fmt: C.fmtAED,   dir: "hi" },
    price:  { k: "price",  label: "Median price",     fmt: C.fmtAED,   dir: "hi" },
    sales:  { k: "sales",  label: "Sales volume",     fmt: C.fmtNum,   dir: "hi" },
    val:    { k: "val",    label: "Money transacted", fmt: C.fmtShort, dir: "hi" },
    yld:    { k: "yld",    label: "Gross yield",      fmt: C.fmtPct,   dir: "hi" },
    rent:   { k: "rent",   label: "Typical rent",     fmt: C.fmtAED,   dir: "hi" },
    exp90:  { k: "exp90",  label: "Leases expiring",  fmt: C.fmtNum,   dir: "hi" },
    off:    { k: "off",    label: "Off-plan share",   fmt: C.fmtPct,   dir: "hi" }
  };

  function ramp(t) { return C.ramp(t); }
  function stats(rows) { return C.stats(rows.map(function (r) { return { v: +r[METRIC] || 0 }; }), "v"); }
  function pct(v, s) { return C.pct(v, s); }
  function darken() { C.darken(map); }

  /* ── AREAS mode: real district polygons, coloured by the metric ── */
  function buildAreas() {
    var s = stats(AREAS), by = {};
    AREAS.forEach(function (a) { by[a.dld] = a; });
    POLY.features.forEach(function (f) {
      var a = by[f.properties.dld] || {};
      var v = +a[METRIC] || 0;
      f.properties.c = v ? ramp(pct(v, s)) : C.PAL.nodata;
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
      paint: { "fill-color": ["get", "c"],
               "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], .95, .82],
               "fill-opacity-transition": { duration: 180 },
               "fill-color-transition": { duration: 260 } } });
    map.addLayer({ id: "area-line", type: "line", source: "areas",
      paint: { "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#ffffff", "rgba(10,12,16,.55)"],
               "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.4, .7] } });
    map.addLayer({ id: "area-label", type: "symbol", source: "areas", minzoom: 11.2,
      layout: { "text-field": ["get", "name"], "text-allow-overlap": false, "text-padding": 6,
                "text-size": ["interpolate", ["linear"], ["zoom"], 11.2, 11, 14, 14],
                /* the district with the most sales wins a collision, not whichever
                   happens to be drawn last */
                "symbol-sort-key": ["-", 0, ["get", "sales"]] },
      paint: { "text-color": "#ffffff", "text-halo-color": "rgba(8,10,14,.92)", "text-halo-width": 1.6 } });
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

  /* ── legend: shared with every other map ── */
  function legend(s) { C.legend("lg", METRICS[METRIC].label, s, METRICS[METRIC].fmt); }

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
    /* The 3D city belongs to Projects. On a choropleth it is noise: towers stand on
       top of the shapes whose colour you are trying to read. */
    cityVisible(m === "projects" && THREE_D);
    if (m === "projects") {
      var P = C.HOME3D;
      map.flyTo({ center: P.center, zoom: P.zoom, pitch: P.pitch, bearing: P.bearing, duration: 2200, curve: 1.5 });
    } else {
      /* flat and square-on: a choropleth is read from above, not from an angle */
      map.flyTo({ center: HOME.center, zoom: HOME.zoom, pitch: 0, bearing: 0, duration: 1600 });
    }
  }

  function cityVisible(on) {
    (map.getStyle().layers || []).forEach(function (L) {
      if (L.type !== "fill-extrusion" || L.id.indexOf("proj") === 0) return;
      try { map.setLayoutProperty(L.id, "visibility", on ? "visible" : "none"); } catch (e) {}
    });
  }

  function set3D(on) {
    THREE_D = on;
    /* Areas stays flat whatever this is set to — a tilted choropleth is unreadable,
       and the toggle is really asking about the city model, which lives in Projects. */
    if (MODE === "projects") map.easeTo({ pitch: on ? 62 : 0, duration: 900 });
    cityVisible(on && MODE === "projects");
    if (map.getLayer("proj-shape")) map.setLayoutProperty("proj-shape", "visibility", (on && MODE === "projects") ? "visible" : "none");
  }

  M.init = function (cfg) {
    CFG = cfg; AREAS = cfg.areas; PROJECTS = cfg.projects; POLY = cfg.poly;
    POLY.features.forEach(function (f, i) { f.id = i; });
    map = new maplibregl.Map({
      container: "map", style: C.STYLE,
      center: HOME.center, zoom: HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing,
      maxBounds: BOUNDS, minZoom: 8.6, maxZoom: 17.5, maxPitch: 75,
      antialias: true, attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    C.observeResize(map);
    map.on("style.load", function () {
      darken(); C.addRealBuildings(map); buildAreas(); setMode(MODE);
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
    if (rs) rs.onclick = function () {
      var P = (MODE === "projects") ? C.HOME3D : HOME;
      map.easeTo({ center: P.center, zoom: P.zoom, pitch: P.pitch, bearing: P.bearing, duration: 1200 });
    };
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
