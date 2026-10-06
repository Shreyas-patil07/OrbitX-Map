import maplibregl from "maplibre-gl";
// Interactive flood elevation-profile panel, synced with the MapLibre map.
//
// Data comes from data/elevation_profile.json, a small downsampled export
// produced by elevation_profile/flood_profile.py (see that file's
// export_web_json). Hovering the chart moves a marker on the map to the
// matching point on the river; hovering a city on the map highlights the
// matching point on the chart; clicking a city (on either side) flies the
// map to it; Play animates the flood front sweeping downstream.
import { state } from "./state.js";
import { noCache } from "./utils.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// extra top padding makes room for the rotated city-name row above the plot
// area -- SVG clips anything with y < 0 by default, so this isn't cosmetic,
// it's what keeps long rotated labels from disappearing behind the header.
const PAD = { top: 86, right: 24, bottom: 34, left: 52 };
const LABEL_ROW_Y = 78; // shared baseline all city labels rotate from
const LABEL_ANGLE_DEG = 48;
const CRITICAL = "#d03b3b";
const ORANGE = "#eb6834";
const INK_PRIMARY = "#0b0b0b";
const INK_MUTED = "#898781";
const GRIDLINE = "#e1e0d9";
const BASELINE = "#c3c2b7";

// a couple of exported names are too long to sit legibly on the chart at any
// angle; shorten just those for the on-chart label (hover/tooltip still shows
// the full name), and truncate anything else that's still too long.
const SHORT_NAME = { "Rasuwagadhi (Rashuwa)": "Rasuwagadhi" };
function shortLabel(name) {
  const base = SHORT_NAME[name] || name;
  return base.length > 15 ? base.slice(0, 14) + "…" : base;
}

// Rough on-screen width of a label once rotated -- used only to decide which
// labels have room to be drawn without overlapping a neighbour; doesn't need
// to be exact, just monotonic in string length.
function labelFootprintPx(text) {
  const angleRad = (LABEL_ANGLE_DEG * Math.PI) / 180;
  return text.length * 5.6 * Math.cos(angleRad);
}

// Greedy label placement: cities with a confirmed flood_time get first claim
// on space (they're the ones the story is about), then the rest fill in
// left-to-right wherever they still fit without colliding. Every city keeps
// its dot regardless -- a hidden label is still reachable via hover.
function computeVisibleLabels(cities) {
  const GAP = 6;
  const items = cities.map((c, i) => ({
    i,
    x: scales.xScale(c.distance_km),
    w: labelFootprintPx(shortLabel(c.name)),
  }));
  const placed = [];
  const visible = new Set();
  function tryPlace(it) {
    const lo = it.x;
    const hi = it.x + it.w + GAP;
    if (placed.some((p) => lo < p.hi && hi > p.lo)) return;
    placed.push({ lo, hi });
    visible.add(it.i);
  }
  items
    .filter((it) => cities[it.i].flood_time)
    .forEach(tryPlace);
  items
    .filter((it) => !cities[it.i].flood_time)
    .forEach(tryPlace);
  return visible;
}

let data = null; // fetched JSON payload
let svg, chartWrap, tooltipEl, statsEl, playBtn;
let scales = null;
let mapMarker = null;
let isOpen = false;
let dataLoaded = false;
let playRAF = null;

export function initElevationProfile() {
  document.getElementById("btn-elevation-profile").addEventListener("click", togglePanel);
  document.getElementById("ep-close").addEventListener("click", closePanel);
  playBtn = document.getElementById("ep-play");
  playBtn.addEventListener("click", togglePlay);
  svg = document.getElementById("ep-svg");
  chartWrap = document.getElementById("ep-chart-wrap");
  tooltipEl = document.getElementById("ep-tooltip");
  statsEl = document.getElementById("ep-stats");
  resizeHandler = () => isOpen && render();
  window.addEventListener("resize", resizeHandler);
  wireResizeHandle();
}

// drag the top handle to resize the panel's height (bottom-docked, so dragging
// up = taller). Pointer Events cover mouse + touch/pen with one code path.
function wireResizeHandle() {
  const handle = document.getElementById("ep-resize-handle");
  const panel = document.getElementById("elevation-panel");
  const MIN_H = 160;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("ep-resizing");
    const startY = e.clientY;
    const startH = panel.getBoundingClientRect().height;
    const maxH = window.innerHeight - 140;

    function onMove(ev) {
      const newH = Math.max(MIN_H, Math.min(maxH, startH + (startY - ev.clientY)));
      panel.style.height = `${newH}px`;
      render();
    }
    function onUp(ev) {
      handle.classList.remove("ep-resizing");
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}

async function togglePanel() {
  isOpen ? closePanel() : await openPanel();
}

async function openPanel() {
  const panel = document.getElementById("elevation-panel");
  panel.classList.remove("hidden");
  document.getElementById("btn-elevation-profile").classList.add("active");
  isOpen = true;
  if (!dataLoaded) {
    data = await fetch(noCache("data/elevation_profile.json")).then((r) => r.json());
    dataLoaded = true;
    wireCityMapHover();
  }
  render();
}

function closePanel() {
  document.getElementById("elevation-panel").classList.add("hidden");
  document.getElementById("btn-elevation-profile").classList.remove("active");
  isOpen = false;
  stopPlay();
  hideMapMarker();
}

// ---------------------------------------------------------------------------
// Layout + static drawing
// ---------------------------------------------------------------------------

function render() {
  if (!data) return;
  const rect = chartWrap.getBoundingClientRect();
  const width = Math.max(rect.width, 200);
  const height = Math.max(rect.height, 120);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  const xMax = data.distance_km[data.distance_km.length - 1];
  const yMin = Math.min(...data.elevation_m);
  const yMax = Math.max(...data.elevation_m) * 1.12 + 40;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xScale = (km) => PAD.left + (km / xMax) * innerW;
  const xInv = (px) => Math.max(0, Math.min(xMax, ((px - PAD.left) / innerW) * xMax));
  const yScale = (elev) => PAD.top + (1 - (elev - yMin) / (yMax - yMin)) * innerH;
  scales = { xScale, xInv, yScale, xMax, yMin, yMax, width, height };

  const defs = el("defs");
  defs.appendChild(gradientDef("ep-grad-pending", "#dcdad2", "#f8f7f5"));
  defs.appendChild(gradientDef("ep-grad-reached", "#e8623a", "#fdf1ea"));
  svg.appendChild(defs);

  drawGridlines();
  drawArea("pending", data.distance_km, data.elevation_m, "url(#ep-grad-pending)");
  const reachedIdx = data.distance_km.findIndex((d) => d > data.meta.marker_km);
  const cutoff = reachedIdx === -1 ? data.distance_km.length : reachedIdx;
  drawArea("reached", data.distance_km.slice(0, cutoff), data.elevation_m.slice(0, cutoff), "url(#ep-grad-reached)", CRITICAL);

  drawCities();
  drawMarkerDot("ep-end-marker", data.meta.marker_km, CRITICAL, 6);

  // interaction + hover layers drawn last, on top
  const crosshair = el("line", { class: "ep-crosshair-line", stroke: INK_MUTED, "stroke-width": 1, "stroke-dasharray": "3,3", opacity: 0 });
  const hoverDot = el("circle", { class: "ep-hover-dot", r: 5, fill: CRITICAL, stroke: "#fff", "stroke-width": 1.6, opacity: 0 });
  svg.appendChild(crosshair);
  svg.appendChild(hoverDot);

  const overlay = el("rect", { x: PAD.left, y: PAD.top, width: innerW, height: innerH, fill: "transparent" });
  overlay.addEventListener("mousemove", (e) => onHover(e, crosshair, hoverDot));
  overlay.addEventListener("mouseleave", () => onHoverEnd(crosshair, hoverDot));
  overlay.addEventListener("click", (e) => {
    const km = xInv(localX(e));
    flyToKm(km);
  });
  svg.appendChild(overlay);

  renderStats(data.meta.marker_km);
}

function gradientDef(id, topColor, bottomColor) {
  const g = el("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
  g.appendChild(el("stop", { offset: "0%", "stop-color": topColor, "stop-opacity": 0.85 }));
  g.appendChild(el("stop", { offset: "100%", "stop-color": bottomColor, "stop-opacity": 0.15 }));
  return g;
}

function drawGridlines() {
  const { yMin, yMax, width } = scales;
  const step = niceStep(yMax - yMin);
  for (let v = Math.ceil(yMin / step) * step; v < yMax; v += step) {
    const y = scales.yScale(v);
    svg.appendChild(el("line", { x1: PAD.left, x2: width - PAD.right, y1: y, y2: y, stroke: GRIDLINE, "stroke-width": 1 }));
    svg.appendChild(el("text", { x: PAD.left - 8, y: y + 3, "text-anchor": "end", class: "ep-axis-label", fill: INK_MUTED, "font-size": 10 }, `${Math.round(v).toLocaleString()}`));
  }
  const { xMax, height } = scales;
  const xStep = niceStep(xMax / 5);
  for (let v = 0; v <= xMax; v += xStep) {
    const x = scales.xScale(v);
    svg.appendChild(el("text", { x, y: height - PAD.bottom + 18, "text-anchor": "middle", class: "ep-axis-label", fill: INK_MUTED, "font-size": 10 }, `${Math.round(v)} km`));
  }
}

function niceStep(range) {
  const rough = range / 5;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

function drawArea(cls, xs, ys, fill, strokeColor) {
  if (xs.length < 2) return;
  const { xScale, yScale, height } = scales;
  const baseY = height - PAD.bottom;
  let d = `M ${xScale(xs[0])} ${baseY} `;
  xs.forEach((x, i) => (d += `L ${xScale(x)} ${yScale(ys[i])} `));
  d += `L ${xScale(xs[xs.length - 1])} ${baseY} Z`;
  svg.appendChild(el("path", { class: `ep-area ep-area-${cls}`, d, fill }));

  let ld = `M ${xScale(xs[0])} ${yScale(ys[0])} `;
  xs.forEach((x, i) => (ld += `L ${xScale(x)} ${yScale(ys[i])} `));
  svg.appendChild(el("path", { class: `ep-line ep-line-${cls}`, d: ld, fill: "none", stroke: strokeColor || BASELINE, "stroke-width": strokeColor ? 2 : 1.4 }));
}

function drawCities() {
  const visibleLabels = computeVisibleLabels(data.cities);
  data.cities.forEach((c, i) => {
    const x = scales.xScale(c.distance_km);
    const y = scales.yScale(c.elevation_m);
    const reached = c.flood_reached && c.distance_km <= data.meta.marker_km + 1e-6;

    svg.appendChild(el("line", { x1: x, x2: x, y1: y, y2: LABEL_ROW_Y, stroke: reached ? "#e7c3bd" : GRIDLINE, "stroke-width": 1.2 }));

    const dot = el("circle", {
      class: "ep-city-dot",
      cx: x,
      cy: y,
      r: 4.5,
      fill: reached ? CRITICAL : "#fff",
      stroke: reached ? "#fff" : INK_MUTED,
      "stroke-width": 1.3,
      "data-idx": i,
    });
    dot.addEventListener("click", (evt) => {
      evt.stopPropagation();
      flyToCity(c);
    });
    dot.addEventListener("mouseenter", () => showTooltip(x, y, c));
    dot.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(dot);

    if (!visibleLabels.has(i)) return; // dot only -- name is still on hover

    const label = el(
      "text",
      {
        class: "ep-city-label",
        x: x + 3,
        y: LABEL_ROW_Y - 4,
        transform: `rotate(-${LABEL_ANGLE_DEG} ${x + 3} ${LABEL_ROW_Y - 4})`,
        fill: reached ? INK_PRIMARY : INK_MUTED,
        "font-weight": reached ? 700 : 400,
        "data-idx": i,
      },
      shortLabel(c.name)
    );
    svg.appendChild(label);
  });
}

function drawMarkerDot(id, km, color, r) {
  const idx = nearestIndex(km);
  const x = scales.xScale(data.distance_km[idx]);
  const y = scales.yScale(data.elevation_m[idx]);
  const glow = el("circle", { id: id + "-glow", cx: x, cy: y, r: r * 2.4, fill: color, opacity: 0.18 });
  const dot = el("circle", { id, cx: x, cy: y, r, fill: color, stroke: "#fff", "stroke-width": 1.6 });
  svg.appendChild(glow);
  svg.appendChild(dot);
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------

function renderStats(km) {
  const idx = nearestIndex(km);
  const elevDrop = Math.round(data.elevation_m[0] - Math.min(...data.elevation_m));
  const elapsedMin = Math.round((timeAtKm(km) - data.meta.start_time_sec) / 60);
  statsEl.innerHTML = "";
  statsEl.appendChild(stat(`${elevDrop.toLocaleString()} m`, "Elevation drop"));
  statsEl.appendChild(stat(`${Math.round(km).toLocaleString()} km`, "Distance traced"));
  statsEl.appendChild(stat(`${elapsedMin} min`, "Time elapsed"));
  statsEl.appendChild(stat(secToHms(timeAtKm(km)), "Clock", true));
}

function stat(value, label, live) {
  const wrap = document.createElement("div");
  wrap.className = "ep-stat";
  const v = document.createElement("div");
  v.className = "ep-stat-value" + (live ? " ep-live" : "");
  v.textContent = value;
  const l = document.createElement("div");
  l.className = "ep-stat-label";
  l.textContent = label;
  wrap.appendChild(v);
  wrap.appendChild(l);
  return wrap;
}

// ---------------------------------------------------------------------------
// Hover / tooltip / map sync
// ---------------------------------------------------------------------------

function onHover(evt, crosshair, hoverDot) {
  const km = scales.xInv(localX(evt));
  const idx = nearestIndex(km);
  const x = scales.xScale(data.distance_km[idx]);
  const y = scales.yScale(data.elevation_m[idx]);

  crosshair.setAttribute("x1", x);
  crosshair.setAttribute("x2", x);
  crosshair.setAttribute("y1", PAD.top);
  crosshair.setAttribute("y2", scales.height - PAD.bottom);
  crosshair.setAttribute("opacity", 1);

  hoverDot.setAttribute("cx", x);
  hoverDot.setAttribute("cy", y);
  hoverDot.setAttribute("opacity", 1);

  showTooltip(x, y, {
    name: nearestCityName(data.distance_km[idx]),
    distance_km: data.distance_km[idx],
    elevation_m: data.elevation_m[idx],
    flood_time: null,
  });

  moveMapMarker(data.lon[idx], data.lat[idx]);
}

function onHoverEnd(crosshair, hoverDot) {
  crosshair.setAttribute("opacity", 0);
  hoverDot.setAttribute("opacity", 0);
  hideTooltip();
  hideMapMarker();
}

function nearestCityName(km) {
  let best = null;
  let bestDist = Infinity;
  data.cities.forEach((c) => {
    const d = Math.abs(c.distance_km - km);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  });
  return best && bestDist < 3 ? best.name : null;
}

function showTooltip(x, y, c) {
  const rect = chartWrap.getBoundingClientRect();
  tooltipEl.style.left = `${(x / scales.width) * rect.width}px`;
  tooltipEl.style.top = `${(y / scales.height) * rect.height}px`;
  const parts = [];
  if (c.name) parts.push(`<b>${c.name}</b>`);
  parts.push(`${Math.round(c.distance_km)} km &middot; ${Math.round(c.elevation_m).toLocaleString()} m`);
  if (c.flood_time) parts.push(`arrived ${c.flood_time}`);
  tooltipEl.innerHTML = parts.join("<br>");
  tooltipEl.classList.remove("hidden");
}

function hideTooltip() {
  tooltipEl.classList.add("hidden");
}

function moveMapMarker(lon, lat) {
  if (!state.map) return;
  if (!mapMarker) {
    const elDiv = document.createElement("div");
    elDiv.className = "ep-map-marker";
    mapMarker = new maplibregl.Marker({ element: elDiv }).setLngLat([lon, lat]).addTo(state.map);
  } else {
    mapMarker.setLngLat([lon, lat]);
  }
  mapMarker.getElement().style.display = "block";
}

function hideMapMarker() {
  if (mapMarker) mapMarker.getElement().style.display = "none";
}

function flyToKm(km) {
  const idx = nearestIndex(km);
  if (!state.map) return;
  state.map.flyTo({ center: [data.lon[idx], data.lat[idx]], zoom: Math.max(state.map.getZoom(), 12.5), speed: 1.2 });
}

function flyToCity(c) {
  if (!state.map) return;
  state.map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(state.map.getZoom(), 13.5), speed: 1.2 });
}

// hovering a point on the "cities" map layer highlights the matching chart point.
// the cities layer is added asynchronously after map "load", so retry once via
// "idle" if it isn't there yet the first time this is called.
function wireCityMapHover() {
  const map = state.map;
  if (!map) return;
  if (!map.getLayer("cities")) {
    map.once("idle", wireCityMapHover);
    return;
  }
  map.on("mousemove", "cities", (e) => {
    if (!isOpen || !data) return;
    const props = e.features[0].properties;
    const match = data.cities.find((c) => c.name_local === props.name);
    if (!match) return;
    const idx = nearestIndex(match.distance_km);
    const x = scales.xScale(data.distance_km[idx]);
    const y = scales.yScale(data.elevation_m[idx]);
    showTooltip(x, y, match);
  });
  map.on("mouseleave", "cities", () => isOpen && hideTooltip());
}

// ---------------------------------------------------------------------------
// Play animation
// ---------------------------------------------------------------------------

function togglePlay() {
  playRAF ? stopPlay() : startPlay();
}

function startPlay() {
  const durationMs = 15000;
  const marker = data.meta.marker_km;
  const pauseMs = 450;
  const cityKms = data.cities.filter((c) => c.distance_km <= marker).map((c) => c.distance_km).sort((a, b) => a - b);
  let pausedUntil = 0;
  let firedPauses = new Set();
  const start = performance.now();
  let accumulatedPause = 0;

  playBtn.textContent = "⏸ Pause";
  playBtn.classList.add("ep-playing");

  function frame(now) {
    if (now < pausedUntil) {
      playRAF = requestAnimationFrame(frame);
      return;
    }
    const elapsed = now - start - accumulatedPause;
    const km = Math.min(marker, (elapsed / durationMs) * marker);

    for (const ck of cityKms) {
      if (km >= ck && !firedPauses.has(ck)) {
        firedPauses.add(ck);
        pausedUntil = now + pauseMs;
        accumulatedPause += pauseMs;
      }
    }

    updatePlayFrame(km);

    if (km >= marker) {
      stopPlay();
      return;
    }
    playRAF = requestAnimationFrame(frame);
  }
  playRAF = requestAnimationFrame(frame);
}

function stopPlay() {
  if (playRAF) cancelAnimationFrame(playRAF);
  playRAF = null;
  if (playBtn) {
    playBtn.textContent = "▶ Play";
    playBtn.classList.remove("ep-playing");
  }
  if (data) render(); // reset to the static "as of last confirmed" state
}

function updatePlayFrame(km) {
  const idx = nearestIndex(km);
  const cutoffIdx = data.distance_km.findIndex((d) => d > km);
  const cutoff = cutoffIdx === -1 ? data.distance_km.length : cutoffIdx;

  const reachedPath = svg.querySelector(".ep-area-reached");
  const reachedLine = svg.querySelector(".ep-line-reached");
  if (reachedPath && reachedLine) redrawArea(reachedPath, reachedLine, data.distance_km.slice(0, cutoff), data.elevation_m.slice(0, cutoff));

  const endDot = document.getElementById("ep-end-marker");
  const endGlow = document.getElementById("ep-end-marker-glow");
  const x = scales.xScale(data.distance_km[idx]);
  const y = scales.yScale(data.elevation_m[idx]);
  [endDot, endGlow].forEach((n) => {
    if (n) {
      n.setAttribute("cx", x);
      n.setAttribute("cy", y);
    }
  });

  svg.querySelectorAll(".ep-city-dot").forEach((dot, i) => {
    const c = data.cities[i];
    const reached = c.distance_km <= km + 1e-6;
    dot.setAttribute("fill", reached ? CRITICAL : "#fff");
    dot.setAttribute("stroke", reached ? "#fff" : INK_MUTED);
  });
  svg.querySelectorAll(".ep-city-label").forEach((label) => {
    const c = data.cities[Number(label.dataset.idx)];
    const reached = c.distance_km <= km + 1e-6;
    label.setAttribute("fill", reached ? INK_PRIMARY : INK_MUTED);
    label.setAttribute("font-weight", reached ? 700 : 400);
  });

  moveMapMarker(data.lon[idx], data.lat[idx]);
  renderStats(km);
}

function redrawArea(pathEl, lineEl, xs, ys) {
  const { xScale, yScale, height } = scales;
  const baseY = height - PAD.bottom;
  if (xs.length < 2) {
    pathEl.setAttribute("d", "");
    lineEl.setAttribute("d", "");
    return;
  }
  let d = `M ${xScale(xs[0])} ${baseY} `;
  xs.forEach((x, i) => (d += `L ${xScale(x)} ${yScale(ys[i])} `));
  d += `L ${xScale(xs[xs.length - 1])} ${baseY} Z`;
  pathEl.setAttribute("d", d);

  let ld = `M ${xScale(xs[0])} ${yScale(ys[0])} `;
  xs.forEach((x, i) => (ld += `L ${xScale(x)} ${yScale(ys[i])} `));
  lineEl.setAttribute("d", ld);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function nearestIndex(km) {
  const n = data.distance_km.length;
  const idx = Math.round((km / scales.xMax) * (n - 1));
  return Math.max(0, Math.min(n - 1, idx));
}

function timeAtKm(km) {
  const { control_km, control_sec } = data.meta;
  if (km >= control_km[control_km.length - 1]) return control_sec[control_sec.length - 1];
  for (let i = 1; i < control_km.length; i++) {
    if (km <= control_km[i]) {
      const t = (km - control_km[i - 1]) / (control_km[i] - control_km[i - 1]);
      return control_sec[i - 1] + t * (control_sec[i] - control_sec[i - 1]);
    }
  }
  return control_sec[0];
}

function secToHms(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function localX(evt) {
  const box = svg.getBoundingClientRect();
  return ((evt.clientX - box.left) / box.width) * scales.width;
}

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text !== undefined) node.textContent = text;
  return node;
}

let resizeHandler;
export function destroyElevationProfile() {
  window.removeEventListener("resize", resizeHandler);
  hideMapMarker();
}
