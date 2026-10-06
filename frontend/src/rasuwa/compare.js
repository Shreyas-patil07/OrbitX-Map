import maplibregl from "maplibre-gl";
import Compare from "mapbox-gl-compare";
// Before/after imagery swipe: two independent MapLibre maps synced by mapbox-gl-compare.
// Each side shows its own imagery (switchable via the in-panel dropdowns), with vector
// overlays on top and the same 3D terrain state as the main map. The overlays are the
// compare maps' own layer set (state.compareLayers, default config.map.compare.layers),
// toggled from the sidebar while compare is open — independent of the main map's layers.
import { state } from "./state.js";
import { loadIcons } from "./icons.js";
import { addLayer, removeLayer } from "./layers.js";
import { syncSidebarChecks } from "./sidebar.js";

const IMAGERY_LAYER_ID = "img";
const TERRAIN_SOURCE_ID = "terrainSource";
const iconsReady = new WeakMap(); // compare map -> promise resolved once its icons are registered

export function toggleCompare() {
  const container = document.getElementById("compare-container");
  const mapDiv = document.getElementById("map");
  const btn = document.getElementById("btn-compare");
  const showing = container.classList.contains("hidden");

  if (showing) {
    // unhide BEFORE building the maps: mapbox-gl-compare places its slider at half
    // the container's measured width, which is 0 while it's display:none.
    container.classList.remove("hidden");
    if (!state.compareInitialized) initCompareMaps();
    state.compareOpen = true;
    syncSidebarChecks();
    mapDiv.style.visibility = "hidden";
    btn.classList.add("active");
    const view = {
      center: state.map.getCenter(),
      zoom: state.map.getZoom(),
      bearing: state.map.getBearing(),
      pitch: state.map.getPitch(),
    };
    state.beforeMap.jumpTo(view);
    state.afterMap.jumpTo(view);
    // re-apply every time compare opens, in case 3D was toggled since the last open
    [state.beforeMap, state.afterMap].forEach((m) => iconsReady.get(m).then(() => applyTerrain(m)));
    setTimeout(() => {
      state.beforeMap.resize();
      state.afterMap.resize();
    }, 50);
  } else {
    container.classList.add("hidden");
    state.compareOpen = false;
    syncSidebarChecks();
    mapDiv.style.visibility = "visible";
    btn.classList.remove("active");
  }
}

// Sidebar checkbox handler while compare is open. Imagery is picked per panel via
// the dropdowns, so raster layers are never added as overlays.
export function setCompareLayerVisible(layer, visible) {
  if (layer.type === "raster") return;
  if (visible) state.compareLayers.add(layer.id);
  else state.compareLayers.delete(layer.id);
  [state.beforeMap, state.afterMap].forEach((m) =>
    iconsReady.get(m).then(() => (visible ? addLayer(layer, m) : removeLayer(layer, m)))
  );
}

// Called by the topbar 3D toggle so it also works while compare is open.
export function updateCompareTerrain(pitch, bearing) {
  if (!state.compareInitialized) return;
  [state.beforeMap, state.afterMap].forEach((m) => iconsReady.get(m).then(() => applyTerrain(m)));
  // the two compare maps are move-synced with each other, so easing one moves both
  if (!document.getElementById("compare-container").classList.contains("hidden")) {
    state.beforeMap.easeTo({ pitch, bearing, duration: 800 });
  }
}

function initCompareMaps() {
  const cfg = state.CONFIG.map;
  const imagery = imageryLayers();
  const defaults = cfg.compare || {};
  const beforeLayer = findImagery(defaults.before, "pre");
  const afterLayer = findImagery(defaults.after, "post");

  const opts = { center: cfg.center, zoom: cfg.zoom, maxPitch: 85 };
  state.beforeMap = new maplibregl.Map({ ...opts, container: "before-map", style: compareStyle(beforeLayer) });
  state.afterMap = new maplibregl.Map({ ...opts, container: "after-map", style: compareStyle(afterLayer) });
  [state.beforeMap, state.afterMap].forEach((m) =>
    iconsReady.set(m, new Promise((resolve) => m.once("load", () => loadIcons(cfg.icons || {}, m).then(resolve))))
  );

  // default overlays: just the river, unless config says otherwise
  (defaults.layers || ["river"]).forEach((id) => state.compareLayers.add(id));
  [state.beforeMap, state.afterMap].forEach((m) =>
    iconsReady.get(m).then(() => allLayers().filter((l) => state.compareLayers.has(l.id)).forEach((l) => addLayer(l, m)))
  );

  buildImagerySelect("compare-select-before", state.beforeMap, imagery, beforeLayer.id);
  buildImagerySelect("compare-select-after", state.afterMap, imagery, afterLayer.id);

  state.compareControl = new Compare(state.beforeMap, state.afterMap, "#compare-container", {});
  state.compareInitialized = true;
}

function allLayers() {
  return state.CONFIG.categories.flatMap((c) => c.layers);
}

function imageryLayers() {
  return state.CONFIG.categories.find((c) => c.id === "imagery").layers.filter((l) => l.type === "raster");
}

// the configured default for a side, falling back to the first layer of the matching period
function findImagery(id, period) {
  const imagery = imageryLayers();
  return imagery.find((l) => l.id === id) || imagery.find((l) => l.period === period) || imagery[0];
}

// One dropdown per panel listing every imagery layer, grouped by pre/post period,
// so either side can show any layer (e.g. pre NDVI vs post NDVI, or true vs false color).
function buildImagerySelect(selectId, map, imagery, selectedId) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";
  const groups = [
    ["pre", "Pre-disaster"],
    ["post", "Post-disaster"],
  ];
  groups.forEach(([period, label]) => {
    const layers = imagery.filter((l) => l.period === period);
    if (!layers.length) return;
    const og = document.createElement("optgroup");
    og.label = label;
    layers.forEach((l) => og.appendChild(new Option(l.label, l.id, false, l.id === selectedId)));
    select.appendChild(og);
  });
  // anything without a period still shows up rather than silently disappearing
  imagery
    .filter((l) => !groups.some(([p]) => p === l.period))
    .forEach((l) => select.appendChild(new Option(l.label, l.id, false, l.id === selectedId)));

  select.addEventListener("change", () => {
    const layer = imagery.find((l) => l.id === select.value);
    if (layer) setImagery(map, layer);
  });
}

// swaps the imagery source in place, keeping it underneath the vector overlays
function setImagery(map, layer) {
  if (map.getLayer(IMAGERY_LAYER_ID)) map.removeLayer(IMAGERY_LAYER_ID);
  if (map.getSource(IMAGERY_LAYER_ID)) map.removeSource(IMAGERY_LAYER_ID);
  map.addSource(IMAGERY_LAYER_ID, imagerySource(layer));
  const bottom = map.getStyle().layers[0];
  map.addLayer({ id: IMAGERY_LAYER_ID, type: "raster", source: IMAGERY_LAYER_ID }, bottom ? bottom.id : undefined);
}

function applyTerrain(map) {
  const t = state.CONFIG.map.terrain;
  map.setTerrain(state.is3D ? { source: TERRAIN_SOURCE_ID, exaggeration: t.exaggeration } : null);
}

function imagerySource(layer) {
  return {
    type: "raster",
    tiles: layer.tiles,
    tileSize: layer.tileSize || 256,
    maxzoom: layer.maxzoom || 22, // see the raster case in layers.js
    attribution: layer.attribution || "",
  };
}

function compareStyle(layer) {
  const t = state.CONFIG.map.terrain;
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf", // for label/icon-text layers
    sources: {
      [IMAGERY_LAYER_ID]: imagerySource(layer),
      [TERRAIN_SOURCE_ID]: {
        type: "raster-dem",
        tiles: t.tiles,
        encoding: t.encoding,
        tileSize: t.tileSize,
        maxzoom: t.maxzoom,
        attribution: t.attribution,
      },
    },
    layers: [{ id: IMAGERY_LAYER_ID, type: "raster", source: IMAGERY_LAYER_ID }],
  };
}
