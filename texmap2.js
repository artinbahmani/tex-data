/* ============================================================================
   TEX & TEX — the three specialised map views. 2026-09-18.
     /map/rent/       rental analysis, with the Expiring-in filter
     /map/benchmark/  pick a building, price its neighbours around it
     /map/villas/     the villa market on its own terms
   All three share TEXCORE for the palette, the scale and the base-style repaint,
   so a colour changes in exactly one place.
   ========================================================================== */
(function () {
  "use strict";
  var M = window.TEXMAP2 = {};
  var C = window.TEXCORE;
  var map, CFG, VIEW, METRIC, WINDOW = 12, EXPIRY = 0, RADIUS = 2, PICKED = null;
  var AREAS = [], PROJECTS = [], POLY = null;

  /* ── measures, per view ─────────────────────────────────────────────────── */
  var SET = {
    rent: {
      rent:     { key: "rent",     label: "Typical rent",       fmt: C.fmtAED },
      rentpsf:  { key: "rentpsf",  label: "Rent per sqft",      fmt: C.fmtAED },
      contracts:{ key: "contracts",label: "Contracts on record",fmt: C.fmtNum },
      expiring: { key: "expiring", label: "Leases expiring",    fmt: C.fmtNum },
      newlet:   { key: "newlet",   label: "New-let asking rent",fmt: C.fmtAED },
      gap:      { key: "gap",      label: "Renewal gap",        fmt: C.fmtPct },
      sqft:     { key: "sqft",     label: "Typical size",       fmt: function (v) { return TEX.full(v) + " sqft"; } }
    },
    villas: {
      price:    { key: "price",    label: "Median villa price", fmt: C.fmtAED },
      psf:      { key: "psf",      label: "Price per sqft",     fmt: C.fmtAED },
      sales:    { key: "sales",    label: "Villa sales",        fmt: C.fmtNum },
      sqft:     { key: "sqft",     label: "Typical villa size", fmt: function (v) { return TEX.full(v) + " sqft"; } },
      rent:     { key: "rent",     label: "Typical villa rent", fmt: C.fmtAED },
      rentpsf:  { key: "rentpsf",  label: "Rent per sqft",      fmt: C.fmtAED },
      yld:      { key: "yld",      label: "Gross yield",        fmt: C.fmtPct },
      expiring: { key: "expiring", label: "Leases expiring",    fmt: C.fmtNum },
      val:      { key: "val",      label: "Money transacted",   fmt: C.fmtShort }
    },
    bench: {
      price:  { key: "price",  label: "Median price",   fmt: C.fmtAED,   pill: C.fmtShort },
      psf:    { key: "psf",    label: "Price per sqft", fmt: C.fmtAED,   pill: function (v) { return TEX.full(v); } },
      volume: { key: "volume", label: "Sales volume",   fmt: C.fmtNum,   pill: function (v) { return TEX.full(v); } },
      supply: { key: "supply", label: "Off-plan supply",fmt: C.fmtNum,   pill: function (v) { return TEX.full(v); } }
    }
  };
  function m() { return SET[VIEW][METRIC]; }

  /* The Expiring-in control rewrites which bucket the "Leases expiring" measure
     reads, so the filter and the colour never disagree with each other. */
  function expKey() { return EXPIRY === 1 ? "exp30" : EXPIRY === 2 ? "exp60" : EXPIRY === 3 ? "exp90" : "exp90"; }

  function areaVal(a) {
    if (METRIC === "expiring") return +a[expKey()] || 0;
    return +a[METRIC] || 0;
  }
  /* In benchmark view every measure is read inside the chosen time window. */
  function benchVal(p) {
    var w = WINDOW;
    if (METRIC === "price")  return +p["p" + w] || 0;
    if (METRIC === "psf")    return +p["f" + w] || 0;
    if (METRIC === "volume") return +p["n" + w] || 0;
    if (METRIC === "supply") return +p["s" + w] || 0;
    return 0;
  }
  function projVal(p) {
    if (VIEW === "bench") return benchVal(p);
    if (METRIC === "expiring") return +p[expKey()] || 0;
    return +p[METRIC] || 0;
  }

  /* An area is dimmed out when the Expiring-in filter is on and it has nothing
     ending inside that window. Filtering by hiding would lose the city's shape. */
  function passesExpiry(o) { return !EXPIRY || (+o[expKey()] || 0) > 0; }

  /* ── choropleth ─────────────────────────────────────────────────────────── */
  function drawAreas() {
    var live = AREAS.filter(passesExpiry);
    var s = C.stats(live.map(function (a) { return { v: areaVal(a) }; }), "v");
    var by = {};
    AREAS.forEach(function (a) { by[a.dld] = a; });
    POLY.features.forEach(function (f) {
      var a = by[f.properties.dld], p = f.properties;
      var v = a ? areaVal(a) : 0, ok = a && passesExpiry(a);
      p.v = ok ? v : 0;
      p.c = (ok && v > 0) ? C.ramp(C.pct(v, s)) : C.PAL.nodata;
      p.name = (a && a.n) || p.dld;
      p.s = (a && a.s) || "";
      p.dim = ok ? 0 : 1;
      p.also = f.properties.also ? f.properties.also.join(", ") : "";
      ["rent","rentpsf","contracts","newlet","gap","sqft","price","psf","sales",
       "yld","val","exp30","exp60","exp90"].forEach(function (k) { p[k] = (a && a[k]) || 0; });
    });
    var src = map.getSource("a2");
    if (src) { src.setData(POLY); paintLegend(s); return; }
    map.addSource("a2", { type: "geojson", data: POLY });
    map.addLayer({ id: "a2-fill", type: "fill", source: "a2",
      paint: { "fill-color": ["get", "c"],
               "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], .95,
                                ["==", ["get", "dim"], 1], .10, .82],
               "fill-opacity-transition": { duration: 180 },
               "fill-color-transition": { duration: 260 } } });
    map.addLayer({ id: "a2-line", type: "line", source: "a2",
      paint: { "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#ffffff", "rgba(10,12,16,.55)"],
               "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.4, .7] } });
    map.addLayer({ id: "a2-label", type: "symbol", source: "a2", minzoom: 11.2,
      layout: { "text-field": ["get", "name"], "text-allow-overlap": false, "text-padding": 6,
                "text-size": ["interpolate", ["linear"], ["zoom"], 11.2, 11, 14, 14],
                "symbol-sort-key": ["-", 0, ["coalesce", ["get", "contracts"], ["get", "sales"], 0]] },
      paint: { "text-color": "#ffffff", "text-halo-color": "rgba(8,10,14,.92)", "text-halo-width": 1.6 } });
    var hov = null;
    map.on("mousemove", "a2-fill", function (e) {
      map.getCanvas().style.cursor = "pointer";
      if (hov !== null) map.setFeatureState({ source: "a2", id: hov }, { hover: false });
      hov = e.features[0].id;
      map.setFeatureState({ source: "a2", id: hov }, { hover: true });
      var p = e.features[0].properties;
      C.legendHover = p.name;
      TEX.showTip(e.originalEvent, "<b>" + p.name + "</b><br><s>" + m().label + ": " +
        (p.v ? m().fmt(p.v) : "no data") + "</s>" + hoverExtra(p) +
        (p.also ? "<br><i style='opacity:.6'>this outline also covers " + p.also + "</i>" : ""));
    });
    map.on("mouseleave", "a2-fill", function () {
      map.getCanvas().style.cursor = "";
      if (hov !== null) map.setFeatureState({ source: "a2", id: hov }, { hover: false });
      hov = null; TEX.hideTip();
    });
    map.on("click", "a2-fill", function (e) { panel(e.features[0].properties, "area"); });
    paintLegend(s);
  }
  /* one place decides which legend is on screen, so the redraw path and the
     first-draw path can never disagree about it */
  function paintLegend(s) {
    if (EXPIRY) expiryLegend(); else C.legend("lg", m().label, s, m().fmt);
  }
  /* their villa map colours nothing and explains nothing; ours does both */
  function expiryLegend() {
    var el = document.getElementById("lg");
    if (!el) return;
    var lab = ["", "within 1 month", "within 2 months", "within 3 months"][EXPIRY];
    el.innerHTML = '<div class="lgbar"><span>Soon</span><i style="background:linear-gradient(90deg,' +
        C.EXP[1] + ',' + C.EXP[2] + ',' + C.EXP[3] + ')"></i><b>Leases ending ' + lab + '</b><span>Later</span></div>' +
      [[1, "Ending within 1 month"], [2, "Within 2 months"], [3, "Within 3 months"]].map(function (r) {
        return '<div class="lgrow"><em style="background:' + C.EXP[r[0]] + '"></em>' + r[1] +
               '<b>' + (r[0] <= EXPIRY ? "shown" : "hidden") + "</b></div>";
      }).join("") +
      '<div class="lgrow"><em style="background:' + C.EXP[0] + '"></em>Nothing ending<b>dimmed</b></div>';
  }
  function hoverExtra(p) {
    if (VIEW === "rent") return "<br>" + TEX.full(p.contracts) + " contracts · " + TEX.full(p[expKey()]) + " ending soon";
    if (VIEW === "villas") return "<br>" + TEX.full(p.sales) + " villa sales this year";
    return "";
  }

  /* ── building pills ─────────────────────────────────────────────────────── */
  function pillData() {
    C.ensurePills(map);   /* pillData runs before addPills on the first draw */
    var pool = PROJECTS;
    if (VIEW === "bench" && PICKED) pool = near(PICKED, RADIUS);
    pool = pool.filter(function (p) { return p.lat && projVal(p) > 0 && (VIEW !== "rent" || passesExpiry(p)); });
    var s = C.stats(pool.map(function (p) { return { v: projVal(p) }; }), "v");
    return { s: s, n: pool.length, fc: { type: "FeatureCollection", features: pool.map(function (p) {
      var v = projVal(p);
      var lf = (VIEW === "bench" ? (m().pill || m().fmt) : shortPill);
      var sel = !!(PICKED && p.s === PICKED.s);
      /* When the Expiring-in filter is on, the pill itself carries the urgency and the
         label carries the count, so the colour is never the only thing saying it.
         The reference villa map defines exactly this encoding in CSS and then never
         renders it, which is why its whole premise is unreadable. */
      var pill = sel ? { img: "plsel", ink: C.inkOn(C.PAL.accentHi) }
               : EXPIRY ? C.pillExp(map, EXPIRY)
               : C.pillFor(map, C.pct(v, s));
      var lbl = EXPIRY ? (TEX.full(+p[expKey()] || 0) + " ending") : lf(v);
      return { type: "Feature",
        properties: { n: p.n, s: p.s, area: p.area, v: v, sel: sel ? 1 : 0,
                      lbl: lbl, img: pill.img, ink: pill.ink,
                      c: sel ? C.PAL.accentHi : (EXPIRY ? C.EXP[EXPIRY] : C.ramp(C.pct(v, s))),
                      sub: subFor(p) },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
    }) } };
  }
  /* 1,553,000 is nine glyphs; 1.6M is four. On a map that is a ~40% width cut and
     therefore directly fewer collisions. The full figure lives in the hover card. */
  function shortPill(v) {
    return v >= 1000000 ? (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + "M"
         : v >= 1000 ? Math.round(v / 1000) + "K" : TEX.full(v);
  }
  function subFor(p) {
    if (VIEW === "rent")   return TEX.full(p.contracts || 0) + " contracts \u00b7 " + TEX.full(p[expKey()] || 0) + " ending";
    if (VIEW === "villas") return TEX.full(p.sales || 0) + " villa sales";
    return TEX.full(p["n" + WINDOW] || 0) + " sales in the last " + WINDOW + " months";
  }
  function drawPills() {
    var d = pillData();
    /* the benchmark map has no choropleth, so the pills are what the legend is about */
    if (VIEW === "bench") C.legend("lg", m().label + ", last " + WINDOW + " months", d.s, m().fmt);
    C.empty("mempty", d.n === 0,
      VIEW === "bench" ? "No building inside this radius has enough registered sales for this window. Widen the radius, or switch to 12 months."
      : EXPIRY ? ("No building we track has a lease ending within " + EXPIRY + " month" + (EXPIRY > 1 ? "s" : "") + ". Try a longer window.")
      : "No building has data for this measure yet.");
    if (map.getSource("pp")) { map.getSource("pp").setData(d.fc); return; }
    C.addPills(map, "pp", d.fc, { minzoom: VIEW === "bench" ? 10.5 : 11.4 });
    map.on("mousemove", "pp-dot", function (e) {
      map.getCanvas().style.cursor = "pointer";
      var p = e.features[0].properties;
      TEX.showTip(e.originalEvent, "<b>" + p.n + "</b><br><s>" + m().label + ": " + m().fmt(p.v) + "</s><br>" + p.sub);
    });
    map.on("mouseleave", "pp-dot", function () { map.getCanvas().style.cursor = ""; TEX.hideTip(); });
    map.on("click", "pp-dot", function (e) {
      var p = e.features[0].properties;
      if (VIEW === "bench") pick(p.s); else panel(p, "project");
    });
  }

  /* ── benchmark: the neighbourhood around one building ───────────────────── */
  function km(a, b) {
    var R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function near(p, r) {
    return PROJECTS.filter(function (o) { return o.lat && km(p, o) <= r; });
  }
  function pick(s) {
    var p = PROJECTS.filter(function (x) { return x.s === s; })[0];
    if (!p || !p.lat) return;
    PICKED = p;
    map.easeTo({ center: [p.lon, p.lat], zoom: RADIUS <= 1 ? 14.6 : RADIUS <= 2 ? 13.8 : 12.8,
                 pitch: 52, duration: 1300 });
    drawPills(); ring(); benchCard();
    var f = document.getElementById("find");
    if (f) f.value = p.n;
  }
  /* the search radius, drawn so the comparison set is never implicit */
  function ring() {
    if (!PICKED) return;
    var pts = [], R = RADIUS / 111.32;
    for (var i = 0; i <= 64; i++) {
      var t = i / 64 * Math.PI * 2;
      pts.push([PICKED.lon + Math.cos(t) * R / Math.cos(PICKED.lat * Math.PI / 180), PICKED.lat + Math.sin(t) * R]);
    }
    var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {},
               geometry: { type: "Polygon", coordinates: [pts] } }] };
    if (map.getSource("ring")) { map.getSource("ring").setData(fc); return; }
    map.addSource("ring", { type: "geojson", data: fc });
    map.addLayer({ id: "ring-f", type: "fill", source: "ring",
      paint: { "fill-color": C.PAL.accent, "fill-opacity": .06 } }, "pp-dot");
    map.addLayer({ id: "ring-l", type: "line", source: "ring",
      paint: { "line-color": C.PAL.accent, "line-opacity": .5, "line-width": 1.4, "line-dasharray": [3, 3] } }, "pp-dot");
  }
  /* the answer the page exists to give: this building against everything around it */
  function benchCard() {
    var el = document.getElementById("bench");
    if (!el) return;
    if (!PICKED) { el.classList.remove("on"); return; }
    var set = near(PICKED, RADIUS).filter(function (o) { return o.s !== PICKED.s && projVal(o) > 0; });
    var mine = projVal(PICKED);
    var s = C.stats(set.map(function (o) { return { v: projVal(o) }; }), "v");
    var med = s.med || 0;
    var d = med ? Math.round((mine - med) / med * 1000) / 10 : 0;
    var word = !med ? "no comparable set" : d > 3 ? "above" : d < -3 ? "below" : "in line with";
    var cls = !med ? "" : d > 3 ? "up" : d < -3 ? "down" : "flat";
    el.classList.add("on");
    el.innerHTML =
      '<div class="bh"><b>' + PICKED.n + '</b><span>' + (PICKED.area || "Dubai") + '</span>' +
        '<button class="x" id="bx">&times;</button></div>' +
      '<div class="bnum"><em>' + m().fmt(mine) + '</em><span>' + m().label + ', last ' + WINDOW + ' months</span></div>' +
      '<div class="bcmp ' + cls + '">' + (med
        ? (d > 0 ? "+" : "") + d + '% <i>' + word + ' the ' + set.length + ' buildings within ' + RADIUS + ' km</i>'
        : '<i>Nothing else within ' + RADIUS + ' km has enough registered sales to compare against.</i>') + '</div>' +
      (med ? '<div class="brow"><span>Neighbourhood median</span><b>' + m().fmt(Math.round(med)) + '</b></div>' +
             '<div class="brow"><span>Cheapest nearby</span><b>' + m().fmt(Math.round(s.mn)) + '</b></div>' +
             '<div class="brow"><span>Dearest nearby</span><b>' + m().fmt(Math.round(s.mx)) + '</b></div>' : '') +
      '<div class="brow"><span>Typical size here</span><b>' + (PICKED.sqft ? TEX.full(PICKED.sqft) + " sqft" : "—") + '</b></div>' +
      '<a class="btn" href="/projects/' + PICKED.s + '/">Open the full building page &rarr;</a>';
    var bx = document.getElementById("bx");
    if (bx) bx.onclick = function () { PICKED = null; el.classList.remove("on"); drawPills(); if (map.getSource("ring")) map.getSource("ring").setData({type:"FeatureCollection",features:[]}); };
  }

  /* ── the slide-in panel ─────────────────────────────────────────────────── */
  function row(k, v) { return '<div class="row"><span>' + k + "</span><b>" + v + "</b></div>"; }
  function panel(p, kind) {
    var el = document.getElementById("panel");
    if (!el) return;
    document.getElementById("pn").textContent = p.name || p.n;
    var per = EXPIRY ? ("leases ending within " + EXPIRY + " month" + (EXPIRY > 1 ? "s" : "")) : "registered 2026";
    document.getElementById("ps").textContent = kind === "area"
      ? ("Dubai Land Department records · " + per)
      : ("In " + (p.area || "Dubai") + " · " + per);
    var h = "";
    if (VIEW === "rent") {
      h = row("Contracts on record", TEX.full(p.contracts)) +
          (p.rent ? row("Typical rent", "AED " + TEX.full(p.rent)) : "") +
          (p.rentpsf ? row("Rent per sqft", "AED " + TEX.full(p.rentpsf)) : "") +
          (p.sqft ? row("Typical size", TEX.full(p.sqft) + " sqft") : "") +
          row("Ending in 30 days", TEX.full(p.exp30)) +
          row("Ending in 60 days", TEX.full(p.exp60)) +
          row("Ending in 90 days", TEX.full(p.exp90)) +
          (p.newlet ? row("New lets are asking", "AED " + TEX.full(p.newlet)) : "") +
          (p.gap ? row("Renewal gap", p.gap + "%") : "");
    } else if (VIEW === "villas") {
      h = (p.sales ? row("Villa sales", TEX.full(p.sales)) : "") +
          (p.price ? row("Median price", "AED " + TEX.full(p.price)) : "") +
          (p.psf ? row("Price per sqft", "AED " + TEX.full(p.psf)) : "") +
          (p.sqft ? row("Typical size", TEX.full(p.sqft) + " sqft") : "") +
          (p.rent ? row("Typical rent", "AED " + TEX.full(p.rent)) : "") +
          (p.yld ? row("Gross yield", p.yld + "%") : "") +
          (p.exp90 ? row("Leases ending in 90d", TEX.full(p.exp90)) : "");
    }
    document.getElementById("pr").innerHTML = (h || "<p class='note'>No registered activity in this cut.</p>") +
      (p.also ? '<p class="note" style="margin-top:12px">OpenStreetMap draws one outline here where the Land Department records several districts. These figures are for ' +
                (p.name || p.n) + ' alone; the same outline also covers ' + p.also + '.</p>' : "");
    document.getElementById("pl").href = (kind === "area" ? "/areas/" : "/projects/") + p.s + "/";
    el.classList.add("on");
  }

  /* ── controls ───────────────────────────────────────────────────────────── */
  function group(sel, fn) {
    document.querySelectorAll(sel).forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll(sel).forEach(function (o) { o.classList.remove("on"); });
        b.classList.add("on");
        fn(b.getAttribute("data-v"), b);
      };
    });
  }
  function cityVisible(on) {
    (map.getStyle().layers || []).forEach(function (L) {
      if (L.type !== "fill-extrusion" || L.id.indexOf("pp") === 0) return;
      try { map.setLayoutProperty(L.id, "visibility", on ? "visible" : "none"); } catch (e) {}
    });
  }
  function redraw() { drawAreas(); drawPills(); if (VIEW === "bench") { ring(); benchCard(); } }

  M.init = function (cfg) {
    CFG = cfg; VIEW = cfg.view; AREAS = cfg.areas || []; PROJECTS = cfg.projects || [];
    POLY = cfg.poly; METRIC = cfg.metric;
    POLY.features.forEach(function (f, i) { f.id = i; });

    map = C.make("map", VIEW === "bench" ? { center: [55.2735, 25.1875], zoom: 12.6, pitch: 55, bearing: -22 } : null);
    M.map = map;   /* exposed so the map can be inspected from the console */
    M.state = function () { return { view: VIEW, metric: METRIC, window: WINDOW, expiry: EXPIRY,
                                     radius: RADIUS, picked: PICKED && PICKED.n,
                                     areas: AREAS.length, projects: PROJECTS.length }; };
    C.observeResize(map);
    map.on("style.load", function () {
      C.darken(map);
      C.addRealBuildings(map);
      /* A choropleth is read from above. The city model only helps on the benchmark
         map, where you are looking at one building among its neighbours. */
      if (VIEW !== "bench") cityVisible(false);
      drawAreas();
      drawPills();
      if (VIEW === "bench" && cfg.start) pick(cfg.start);
    });

    group("[data-metric]", function (v) { METRIC = v; redraw(); });
    group("[data-exp]",    function (v) { EXPIRY = +v; redraw(); });
    group("[data-win]",    function (v) { WINDOW = +v; redraw(); });
    group("[data-rad]",    function (v) { RADIUS = +v; if (PICKED) pick(PICKED.s); else redraw(); });

    var td = document.getElementById("td");
    if (td) td.onchange = function () {
      map.easeTo({ pitch: td.checked ? 55 : 0, duration: 800 });
      cityVisible(td.checked);
    };
    var px = document.getElementById("px");
    if (px) px.onclick = function () { document.getElementById("panel").classList.remove("on"); };
    var rs = document.getElementById("reset");
    if (rs) rs.onclick = function () {
      PICKED = null; benchCard();
      if (map.getSource("ring")) map.getSource("ring").setData({ type: "FeatureCollection", features: [] });
      drawPills();
      map.easeTo({ center: C.HOME.center, zoom: C.HOME.zoom, pitch: 55, bearing: C.HOME.bearing, duration: 1200 });
    };

    /* search: buildings first in benchmark view, districts first everywhere else */
    var find = document.getElementById("find"), list = document.getElementById("finds");
    if (find) {
      find.oninput = function () {
        var q = find.value.toLowerCase().trim();
        if (!list) return;
        if (q.length < 2) { list.classList.remove("on"); return; }
        var pool = (VIEW === "bench" ? PROJECTS : PROJECTS.concat(AREAS));
        var hits = pool.filter(function (x) { return (x.n || "").toLowerCase().indexOf(q) > -1; }).slice(0, 8);
        if (!hits.length) { list.classList.remove("on"); return; }
        list.classList.add("on");
        list.innerHTML = hits.map(function (h) {
          return '<button data-s="' + h.s + '" data-lat="' + (h.lat || "") + '" data-lon="' + (h.lon || "") + '">' +
                 h.n + (h.area ? '<i>' + h.area + '</i>' : '<i>district</i>') + '</button>';
        }).join("");
        list.querySelectorAll("button").forEach(function (b) {
          b.onclick = function () {
            list.classList.remove("on");
            var s = b.getAttribute("data-s"), la = +b.getAttribute("data-lat"), lo = +b.getAttribute("data-lon");
            if (VIEW === "bench") { pick(s); return; }
            find.value = b.childNodes[0].nodeValue;
            if (la && lo) map.easeTo({ center: [lo, la], zoom: 13.4, duration: 1200 });
          };
        });
      };
      document.addEventListener("click", function (e) {
        if (list && !list.contains(e.target) && e.target !== find) list.classList.remove("on");
      });
    }
  };
})();
