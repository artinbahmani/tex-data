/* ============================================================================
   TEX & TEX — shared map core. 2026-09-18.
   One palette, one base-style repaint, one colour scale, used by every map page
   (/map/, /map/rent/, /map/benchmark/, /map/villas/). Changing a colour here
   changes it everywhere, which is the whole point of this file existing.
   MapLibre + free OpenFreeMap tiles. No API key anywhere.
   ========================================================================== */
(function () {
  "use strict";
  var C = window.TEXCORE = {};

  /* Dubai plus a little breathing room. Stops a zoom-out to the open ocean. */
  C.BOUNDS = [[54.55, 24.55], [56.15, 25.80]];
  C.HOME   = { center: [55.21, 25.09], zoom: 9.6, pitch: 55, bearing: -18 };
  C.STYLE  = "https://tiles.openfreemap.org/styles/liberty";

  /* ── the palette ──────────────────────────────────────────────────────────
     Ground and ink are kept deliberately low-contrast against each other: this
     map is read for minutes at a time, and a near-black ground under saturated
     fills is what makes a data map tiring to look at. Data colour is the only
     thing on the page allowed to be vivid.                                   */
  C.PAL = {
    /* Charcoal, not black. A near-black ground under saturated fills is what makes a
       data map tiring, and it also crushes the 3D city into a silhouette. Measured
       against the reference product, which sits its whole map on #292929.          */
    ground:   "#1b1d23",
    land:     "#212430",
    water:    "#151d28",
    green:    "#1a2420",
    sand:     "#252219",
    aero:     "#2a2d36",
    bldgFlat: "#262932",
    roadHi:   "#464954",
    road2:    "#383b45",
    road3:    "#2e313a",
    roadMin:  "#26282f",
    rail:     "#2a2c34",
    border:   "rgba(211,161,136,.26)",
    ink:      "rgba(238,235,231,.58)",
    inkHalo:  "rgba(12,13,17,.94)",
    nodata:   "#23262f",
    accent:   "#d3a188",   /* TEX copper */
    accentHi: "#f0cdb4"
  };

  /* The 3D city.

     Two sources, because neither is enough alone. The vector tiles carry every footprint
     but only ONE extrusion per building, so the Burj Khalifa arrives as a single 828 m
     slab: OpenMapTiles does not ship `building:part`, and the Burj's whole shape IS its
     setbacks. OpenStreetMap models it properly, 37 parts stepping 828 → 760 → 740 → 720
     → ... → 545, so we fetch those ourselves and draw the towers from real geometry,
     leaving the tiles to handle the low-rise.

     Greyscale only, top-lit. Height shades the stone the way distance and daylight
     actually do; it is not a data encoding, and nothing here is allowed to be chromatic,
     because the only chromatic thing on a data map should be the data. */
  C.BLDG = {
    base:  "#33363f",    /* street level, in shadow */
    mid:   "#454953",
    high:  "#5b606c",
    top:   "#767c8a",    /* the last hundred metres, catching the light */
    opacity: 0.94,
    cut: 60              /* metres: above this the tiles hand over to real geometry */
  };
  C.bldgRamp = function () {
    return ["interpolate", ["linear"], ["coalesce", ["get", "h"], ["get", "render_height"], 12],
            0, C.BLDG.base, 45, C.BLDG.mid, 140, C.BLDG.high, 420, C.BLDG.top];
  };

  /* Real tower geometry, fetched once and drawn over the tiles. */
  C.addRealBuildings = function (map, url) {
    if (map.getSource("bldg3d")) return;
    map.addSource("bldg3d", { type: "geojson", data: url || "/osm_parts.json" });
    var firstLabel = null;
    (map.getStyle().layers || []).forEach(function (L) {
      if (!firstLabel && L.type === "symbol") firstLabel = L.id;
    });
    map.addLayer({
      id: "bldg3d", type: "fill-extrusion", source: "bldg3d", minzoom: 12.5,
      paint: {
        "fill-extrusion-color": C.bldgRamp(),
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-base": ["get", "b"],
        "fill-extrusion-opacity": C.BLDG.opacity,
        "fill-extrusion-vertical-gradient": true,
        /* fade in rather than pop when the source finishes loading */
        "fill-extrusion-opacity-transition": { duration: 600 }
      }
    }, firstLabel || undefined);

    /* Hand the towers over: below the cut the tiles draw, above it we do. Without this
       the Burj's 828 m tile slab still stands inside our setbacks. */
    (map.getStyle().layers || []).forEach(function (L) {
      if (L.type !== "fill-extrusion" || L.id === "bldg3d" || L.id.indexOf("proj") === 0) return;
      try {
        map.setFilter(L.id, ["<", ["coalesce", ["get", "render_height"], 0], C.BLDG.cut]);
      } catch (e) {}
    });
  };

  /* ── the data ramp ────────────────────────────────────────────────────────
     Sequential, single-family, cool to warm through the TEX copper. Lightness
     rises monotonically so it survives greyscale and colour-vision deficiency;
     the endpoints are muted rather than pure, which is what keeps a full screen
     of it comfortable.                                                        */
  C.RAMP = [[0, [62, 92, 134]], [.28, [104, 148, 178]], [.52, [199, 158, 138]],
            [.76, [216, 137, 100]], [1, [188, 78, 58]]];

  C.ramp = function (t) {
    var st = C.RAMP;
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        var a = st[i - 1], b = st[i], k = (t - a[0]) / (b[0] - a[0]) || 0;
        return "rgb(" + a[1].map(function (c, j) { return Math.round(c + (b[1][j] - c) * k); }).join(",") + ")";
      }
    }
    return "rgb(188,78,58)";
  };
  C.rampAt = function (p) { return C.ramp(p); };
  C.LOW = C.ramp(0); C.MID = C.ramp(.52); C.HIGH = C.ramp(1);

  /* ── scale helpers ────────────────────────────────────────────────────────
     Colour shows RANK, not raw distance. A linear scale put 90% of Dubai in the
     same blue, because a handful of prime districts stretch every measure.     */
  C.stats = function (rows, key) {
    var v = rows.map(function (r) { return +r[key] || 0; })
                .filter(function (x) { return x > 0; })
                .sort(function (a, b) { return a - b; });
    if (!v.length) return { mn: 0, mx: 1, avg: 0, med: 0, sorted: [] };
    return { mn: v[0], mx: v[v.length - 1], sorted: v,
             med: v[Math.floor(v.length / 2)],
             avg: v.reduce(function (a, b) { return a + b; }, 0) / v.length };
  };
  C.pct = function (v, s) {
    var a = s.sorted, lo = 0, hi = a.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
    return a.length > 1 ? lo / (a.length - 1) : .5;
  };
  C.colorFor = function (v, s) { return v > 0 ? C.ramp(C.pct(v, s)) : C.PAL.nodata; };

  /* ── repaint the base style ───────────────────────────────────────────────
     Every free vector style ships light, so the night palette is applied in code
     layer by layer rather than by hosting a style of our own.                  */
  C.darken = function (map) {
    var P = C.PAL;
    (map.getStyle().layers || []).forEach(function (L) {
      var id = L.id, t = L.type;
      try {
        if (t === "background") map.setPaintProperty(id, "background-color", P.ground);
        else if (t === "fill") {
          var c = P.land;
          if (/water|ocean|sea|river|lake|bay/i.test(id)) c = P.water;
          else if (/park|grass|wood|forest|golf|garden|scrub|cemetery|pitch/i.test(id)) c = P.green;
          else if (/sand|beach|desert/i.test(id)) c = P.sand;
          else if (/building/i.test(id)) c = P.bldgFlat;
          else if (/aeroway|airport|runway|apron/i.test(id)) c = P.aero;
          else if (/residential|landuse|industrial|commercial/i.test(id)) c = P.land;
          map.setPaintProperty(id, "fill-color", c);
        } else if (t === "line") {
          var lc = P.roadMin;
          if (/motorway|trunk/i.test(id)) lc = P.roadHi;
          else if (/primary/i.test(id)) lc = P.road2;
          else if (/secondary|tertiary/i.test(id)) lc = P.road3;
          else if (/water|river/i.test(id)) lc = P.water;
          else if (/boundary|admin/i.test(id)) lc = P.border;
          else if (/rail|transit|aeroway/i.test(id)) lc = P.rail;
          map.setPaintProperty(id, "line-color", lc);
        } else if (t === "symbol") {
          map.setPaintProperty(id, "text-color", P.ink);
          map.setPaintProperty(id, "text-halo-color", P.inkHalo);
          map.setPaintProperty(id, "text-halo-width", 1.3);
          /* Label restraint. Every free style ships every POI and every side street, and
             on a tilted 3D scene they pile up at the horizon into grey soup. Points of
             interest go entirely; street names only appear once you are actually in a
             street; place names stay, because they are how you navigate.              */
          if (/poi|shop|amenity|housenum|transit|airport|water-(point|line)/i.test(id))
            map.setLayoutProperty(id, "visibility", "none");
          else if (/road|street|highway|motorway/i.test(id))
            map.setLayerZoomRange(id, 14.5, 24);
        } else if (t === "fill-extrusion") {
          map.setPaintProperty(id, "fill-extrusion-color", C.bldgRamp());
          map.setPaintProperty(id, "fill-extrusion-opacity", C.BLDG.opacity);
          map.setPaintProperty(id, "fill-extrusion-vertical-gradient", true);
          /* show the model earlier than the style default (z14) so it reads at district zoom */
          map.setLayerZoomRange(id, 11.8, 24);
        }
      } catch (e) {}
    });
    /* Without this the top third of a pitched frame is dead black pixels. A faint
       horizon glow costs nothing and makes the city read as a place rather than a hole. */
    /* Directional light. Without it every face of every tower is the same grey and the
       city reads as cardboard; with it the setbacks catch the light and you can see the
       shape of a building. */
    try {
      map.setLight({ anchor: "map", position: [1.4, 215, 42], color: "#fff6ec", intensity: 0.42 });
    } catch (e) {}
    try {
      map.setSky({
        "sky-color": "#0b1018", "horizon-color": "#1d2532", "fog-color": "#151a22",
        "fog-ground-blend": 0.55, "horizon-fog-blend": 0.42, "sky-horizon-blend": 0.7
      });
    } catch (e) {}
  };

  /* ── a configured map, identical on every page ── */
  C.make = function (container, o) {
    o = o || {};
    var m = new maplibregl.Map({
      container: container, style: C.STYLE,
      center: o.center || C.HOME.center, zoom: o.zoom || C.HOME.zoom,
      pitch: o.pitch != null ? o.pitch : C.HOME.pitch,
      bearing: o.bearing != null ? o.bearing : C.HOME.bearing,
      maxBounds: C.BOUNDS, minZoom: 8.6, maxZoom: 17.5, maxPitch: 75,
      antialias: true, attributionControl: { compact: true }
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    return m;
  };

  /* a slow drift that stops the moment the user touches the map */
  C.orbit = function (map, base) {
    var spin = true, t0 = performance.now(), b = base == null ? C.HOME.bearing : base;
    (function step(t) {
      if (!spin) return;
      map.setBearing(b + Math.sin((t - t0) / 32000) * 11);
      requestAnimationFrame(step);
    })(t0);
    ["mousedown", "touchstart", "wheel"].forEach(function (ev) {
      map.getCanvas().addEventListener(ev, function () { spin = false; }, { once: true });
    });
  };

  /* ── legend, shared shape across all four maps ── */
  C.legend = function (elId, label, s, fmt) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML =
      '<div class="lgbar"><span>Low</span><i></i><b>' + label + '</b><span>High</span></div>' +
      '<div class="lgrow"><em style="background:' + C.HIGH + '"></em>Highest<b>' + fmt(Math.round(s.mx)) + '</b></div>' +
      '<div class="lgrow"><em style="background:' + C.MID + '"></em>Median<b>' + fmt(Math.round(s.med || s.avg)) + '</b></div>' +
      '<div class="lgrow"><em style="background:' + C.LOW + '"></em>Lowest<b>' + fmt(Math.round(s.mn)) + '</b></div>';
  };

  /* ── price pills ──────────────────────────────────────────────────────────
     A real pill: solid surface, 1px edge, drop shadow, white or dark text chosen
     by the fill's own luminance. Drawn once per colour step as a nine-patch image
     and stretched to the label by `icon-text-fit`, so MapLibre owns the collision
     detection. The reference maps use DOM markers with none, and measure 91% and
     99.8% of their markers overlapping another; ours simply cannot.               */
  C.STEPS = 7;
  function lum(rgb) {
    var m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb);
    if (!m) return 0;
    var c = [+m[1], +m[2], +m[3]].map(function (v) {
      v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
    });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  /* WCAG contrast against the fill decides the label colour, rather than a guess */
  C.inkOn = function (bg) {
    var L = lum(bg);
    return (L + .05) / .05 > 1.06 / (L + .05) ? "#12131a" : "#ffffff";
  };

  /* the expiry buckets: a sequential urgency scale, not arbitrary hues, and the
     label always carries the count so the colour is never the only signal */
  C.EXP = { 1: "rgb(188,78,58)", 2: "rgb(216,137,100)", 3: "rgb(199,158,138)", 0: "#3c4250" };

  function pillImage(fill, border) {
    var R = 2, W = 48, H = 30, r = 15;            /* logical px, drawn at 2x */
    var cv = document.createElement("canvas");
    cv.width = W * R; cv.height = H * R;
    var x = cv.getContext("2d");
    x.scale(R, R);
    x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 5; x.shadowOffsetY = 2;
    x.beginPath();
    if (x.roundRect) x.roundRect(2, 2, W - 4, H - 6, r);
    else { x.moveTo(2 + r, 2); x.arcTo(W - 2, 2, W - 2, H - 4, r); x.arcTo(W - 2, H - 4, 2, H - 4, r);
           x.arcTo(2, H - 4, 2, 2, r); x.arcTo(2, 2, W - 2, 2, r); x.closePath(); }
    x.fillStyle = fill; x.fill();
    x.shadowColor = "transparent";
    x.lineWidth = 1.2; x.strokeStyle = border || "rgba(255,255,255,.62)"; x.stroke();
    return { data: x.getImageData(0, 0, cv.width, cv.height), W: W, H: H, R: R };
  }

  /* one image per ramp step, plus the selected state and the four expiry buckets */
  C.ensurePills = function (map) {
    if (map.__pills) return;
    map.__pills = {};
    var add = function (id, fill, border) {
      var p = pillImage(fill, border);
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, p.data, {
        pixelRatio: p.R,
        stretchX: [[16 * p.R, 32 * p.R]],
        stretchY: [[12 * p.R, 18 * p.R]],
        content: [8 * p.R, 4 * p.R, (p.W - 8) * p.R, (p.H - 8) * p.R]
      });
      map.__pills[id] = C.inkOn(fill);
    };
    for (var i = 0; i < C.STEPS; i++) add("pl" + i, C.ramp(i / (C.STEPS - 1)));
    add("plsel", C.PAL.accentHi, "#ffffff");
    Object.keys(C.EXP).forEach(function (k) { add("plx" + k, C.EXP[k]); });
  };
  /* quantise a percentile to a pill image, so a continuous ramp needs 7 images not 600 */
  C.pillFor = function (map, p) {
    var i = Math.max(0, Math.min(C.STEPS - 1, Math.round(p * (C.STEPS - 1))));
    return { img: "pl" + i, ink: map.__pills["pl" + i] };
  };
  C.pillExp = function (map, bucket) {
    var id = "plx" + (C.EXP[bucket] ? bucket : 0);
    return { img: id, ink: map.__pills[id] };
  };

  C.addPills = function (map, id, data, opts) {
    opts = opts || {};
    C.ensurePills(map);
    map.addSource(id, { type: "geojson", data: data });
    map.addLayer({
      id: id + "-pill", type: "symbol", source: id,
      minzoom: opts.minzoom == null ? 11.2 : opts.minzoom,
      layout: {
        "icon-image": ["get", "img"],
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 9, 1, 9],
        "icon-allow-overlap": false,
        "text-field": ["get", "lbl"],
        "text-size": ["case", ["==", ["get", "sel"], 1], 13.5, 12],
        "text-font": ["Noto Sans Bold"],
        "text-allow-overlap": false,
        "text-padding": 2,
        "text-anchor": "center",
        /* the pills that matter survive a collision: selected first, then by value */
        "symbol-sort-key": ["case", ["==", ["get", "sel"], 1], -1e9, ["-", 0, ["get", "v"]]]
      },
      paint: {
        "text-color": ["get", "ink"],
        "icon-opacity": ["interpolate", ["linear"], ["zoom"], 10.8, 0, 11.4, 1],
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 10.8, 0, 11.4, 1]
      }
    });
    /* a small dot keeps every building findable below the zoom where pills appear */
    map.addLayer({
      id: id + "-dot", type: "circle", source: id,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.4, 15, 7],
        "circle-color": ["get", "c"], "circle-opacity": .9,
        "circle-stroke-width": 1, "circle-stroke-color": "rgba(255,255,255,.5)"
      }
    }, id + "-pill");
    return id + "-dot";
  };

  /* ── never ship a map that needs a window nudge ──
     The reference villa map paints nothing until the viewport is resized, silently.
     A ResizeObserver plus a settle tick removes that whole class of failure.      */
  C.observeResize = function (map, el) {
    var node = el || map.getContainer();
    try {
      new ResizeObserver(function () { map.resize(); }).observe(node);
    } catch (e) {
      window.addEventListener("resize", function () { map.resize(); });
    }
    setTimeout(function () { map.resize(); }, 350);
    setTimeout(function () { map.resize(); }, 1400);
  };

  /* ── an explicit empty state, because a blank map is not an answer ── */
  C.empty = function (elId, on, msg) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = on ? ('<b>Nothing matches this filter</b><i>' + msg + '</i>') : "";
    el.classList.toggle("on", !!on);
  };

  C.fmtAED  = function (v) { return "AED " + TEX.full(v); };
  C.fmtShort= function (v) { return "AED " + TEX.fmt(v); };
  C.fmtNum  = function (v) { return TEX.full(v); };
  C.fmtPct  = function (v) { return v + "%"; };
})();
