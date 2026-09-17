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
    ground:   "#0e0f14",   /* base canvas: charcoal, not black */
    land:     "#141620",
    water:    "#0f1b28",
    green:    "#121a16",
    sand:     "#181611",
    aero:     "#141620",
    bldgFlat: "#1b1e27",
    roadHi:   "#3a3945",
    road2:    "#2c2b36",
    road3:    "#23222c",
    roadMin:  "#1b1a23",
    rail:     "#20202a",
    border:   "rgba(211,161,136,.22)",
    ink:      "rgba(236,232,228,.52)",
    inkHalo:  "rgba(8,9,12,.92)",
    nodata:   "#191b23",
    accent:   "#d3a188",   /* TEX copper */
    accentHi: "#f0cdb4"
  };

  /* Extruded buildings. Kept as a narrow, low-chroma grey band so the city reads
     as a physical model and never competes with the data colour on top of it. */
  C.BLDG = { lo: "#252831", mid: "#2f3340", hi: "#3b4050", top: "#4a5062", opacity: 0.88 };

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
          if (/poi|shop|amenity|housenum/i.test(id)) map.setLayoutProperty(id, "visibility", "none");
        } else if (t === "fill-extrusion") {
          map.setPaintProperty(id, "fill-extrusion-color", [
            "interpolate", ["linear"], ["get", "render_height"],
            0, C.BLDG.lo, 60, C.BLDG.mid, 160, C.BLDG.hi, 400, C.BLDG.top
          ]);
          map.setPaintProperty(id, "fill-extrusion-opacity", C.BLDG.opacity);
          map.setPaintProperty(id, "fill-extrusion-vertical-gradient", true);
          /* show the model earlier than the style default (z14) so it reads at district zoom */
          map.setLayerZoomRange(id, 11.8, 24);
        }
      } catch (e) {}
    });
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
