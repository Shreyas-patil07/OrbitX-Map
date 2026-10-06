// Generic add/remove logic for every layer type declared in config/layers.json,
// plus the spotlight-mask effect that can be attached to any "fill" layer.
// addLayer/removeLayer target the main map by default; the compare maps pass their own.
import { state } from "./state.js";
import { noCache, normalizeGeoJSON, resolveColorExpr, ringSignedArea, windOppositeToOuter } from "./utils.js";
import { attachPopup, attachVideoPopup, showHighlightPopups } from "./popups.js";

// url -> promise of normalized geojson, so the main map and both compare maps share
// one download per dataset (noCache still busts the browser cache on each page load).
const geojsonCache = new Map();
function loadGeoJson(url) {
  if (!geojsonCache.has(url)) {
    const promise = fetch(noCache(url))
      .then((r) => r.json())
      .then(normalizeGeoJSON);
    promise.catch(() => geojsonCache.delete(url)); // let a later toggle retry a failed fetch
    geojsonCache.set(url, promise);
  }
  return geojsonCache.get(url);
}

// creates the source immediately (empty) so addLayer() can reference it synchronously,
// then fetches + normalizes + fills in the real data once it arrives.
// tolerance: 0 disables geojson-vt's default simplification — our datasets are all
// small, and without this a thin/small polygon (e.g. a narrow landslide runout) can
// get simplified down to a near-zero-area sliver and effectively vanish at low zoom.
function addGeoJsonSourceAsync(map, id, url) {
  map.addSource(id, { type: "geojson", tolerance: 0, data: { type: "FeatureCollection", features: [] } });
  loadGeoJson(url)
    .then((gj) => {
      const src = map.getSource(id);
      if (src) src.setData(gj);
    })
    .catch((err) => console.error("Failed to load geojson:", url, err));
}

// Fixed z-order anchors (invisible), created before any layer so the stacking never
// depends on category order in config/layers.json:
//   basemap < raster/imagery < RASTER_ANCHOR < spotlight mask < VECTOR_ANCHOR < vectors
// Vector layers are simply appended on top; rasters and the mask insert via beforeId.
const RASTER_ANCHOR = "raster-overlay-anchor";
const VECTOR_ANCHOR = "vector-overlay-anchor";

export function addAllConfiguredLayers() {
  const map = state.map;
  [RASTER_ANCHOR, VECTOR_ANCHOR].forEach((id) => {
    if (!map.getLayer(id)) map.addLayer({ id, type: "background", paint: { "background-opacity": 0 } });
  });
  state.CONFIG.categories.forEach((cat) => {
    cat.layers.forEach((layer) => {
      if (layer.active) addLayer(layer);
    });
  });
}

export function addLayer(layer, map = state.map) {
  const isMain = map === state.map;
  if (map.getLayer(layer.id)) return; // already added

  switch (layer.type) {
    case "raster":
      map.addSource(layer.id, {
        type: "raster",
        tiles: layer.tiles,
        tileSize: layer.tileSize || 256,
        // e.g. Sentinel-2 (10 m) has no detail past z14 — overzoom instead of requesting more tiles
        maxzoom: layer.maxzoom || 22,
        attribution: layer.attribution || "",
      });
      // always insert below the raster anchor, even if this raster is toggled on after
      // vector layers already exist, so imagery never ends up on top of them.
      map.addLayer(
        { id: layer.id, type: "raster", source: layer.id },
        map.getLayer(RASTER_ANCHOR) ? RASTER_ANCHOR : undefined
      );
      break;

    case "fill":
      addGeoJsonSourceAsync(map, layer.id, layer.data);
      map.addLayer({
        id: layer.id,
        type: "fill",
        source: layer.id,
        minzoom: layer.minzoom || 0,
        paint: {
          // fillColor/lineColor can be a flat hex string, or a {field, values, default}
          // match-spec (same shape as circle/icon color) to classify polygons by a
          // property, e.g. a mapping-task boundary colored by its status.
          "fill-color": resolveColorExpr(layer.paint.fillColor),
          "fill-opacity": layer.paint.fillOpacity,
        },
      });
      map.addLayer({
        id: layer.id + "-outline",
        type: "line",
        source: layer.id,
        minzoom: layer.minzoom || 0,
        paint: {
          "line-color": resolveColorExpr(layer.paint.lineColor),
          "line-width": layer.paint.lineWidth || 1,
        },
      });
      // main map only — on a compare map it would darken the imagery being compared
      if (layer.spotlight && isMain) addSpotlightMask(layer);
      break;

    case "line": {
      addGeoJsonSourceAsync(map, layer.id, layer.data);
      const linePaint = {
        // lineColor can be a flat hex string, or a {field, values, default} match-spec
        // (same shape as fill/circle/icon color) to classify lines by a property,
        // e.g. a road network colored by highway class.
        "line-color": resolveColorExpr(layer.paint.lineColor),
        "line-width": layer.paint.lineWidth || 2,
      };
      // MapLibre's style validator rejects a paint key that's present but set to
      // undefined (throws instead of treating it as absent) — so only add this key
      // when a real value exists, rather than "value || undefined".
      if (layer.paint.lineDasharray) linePaint["line-dasharray"] = layer.paint.lineDasharray;
      map.addLayer({ id: layer.id, type: "line", source: layer.id, paint: linePaint });
      break;
    }

    case "circle":
      addGeoJsonSourceAsync(map, layer.id, layer.data);
      map.addLayer({
        id: layer.id,
        type: "circle",
        source: layer.id,
        paint: {
          "circle-color": resolveColorExpr(layer.paint.circleColor),
          "circle-radius": layer.paint.circleRadius || 5,
          "circle-stroke-color": layer.paint.circleStrokeColor || "#fff",
          "circle-stroke-width": layer.paint.circleStrokeWidth || 1,
        },
      });
      if (layer.alwaysLabel && layer.labelField) addAlwaysOnLabelLayer(map, layer);
      break;

    case "icon":
      addGeoJsonSourceAsync(map, layer.id, layer.data);
      // symbol layers can only place markers on point geometry — restrict explicitly
      // so a mixed-geometry source (e.g. points + a digitized polygon) doesn't
      // silently try and fail to place a symbol on the polygon. Some exports (e.g.
      // shapefile-derived helipad points) use MultiPoint rather than Point, so accept both.
      map.addLayer({
        id: layer.id,
        type: "symbol",
        source: layer.id,
        filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
        layout: {
          "icon-image": layer.iconField ? ["get", layer.iconField] : layer.icon,
          "icon-size": layer.iconSize || 0.5,
          "icon-allow-overlap": true,
          "text-field": layer.alwaysLabel && layer.labelField ? ["get", layer.labelField] : "",
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-anchor": "top",
          "text-offset": [0, 1.1],
          "text-allow-overlap": !!layer.alwaysLabel,
          "text-optional": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#111111",
          "text-halo-width": 1.4,
          // only takes effect on an SDF icon (config.map.icons[...].sdf: true);
          // ignored harmlessly by full-color icons.
          "icon-color": layer.iconColor ? resolveColorExpr(layer.iconColor) : "#000000",
        },
      });
      // an "icon" layer can also carry Polygon features on the same source (e.g. a
      // digitized landslide/flood-source area alongside point markers) — render
      // those as an actual filled area instead of trying to force a point icon on them.
      if (layer.polygonPaint) {
        const pp = layer.polygonPaint;
        // fillColor/lineColor can be a flat hex string, or a {field, values, default}
        // match-spec (same shape as circleColor/iconColor) to color polygons by a
        // property — e.g. a landslide scar vs. a lake should read as different hazards.
        const fillColorExpr = resolveColorExpr(pp.fillColor);
        const lineColorExpr = pp.lineColor ? resolveColorExpr(pp.lineColor) : fillColorExpr;
        map.addLayer({
          id: layer.id + "-polygon",
          type: "fill",
          source: layer.id,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": fillColorExpr,
            "fill-opacity": pp.fillOpacity != null ? pp.fillOpacity : 0.35,
          },
        });
        map.addLayer({
          id: layer.id + "-polygon-outline",
          type: "line",
          source: layer.id,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": lineColorExpr,
            "line-width": pp.lineWidth || 1.5,
          },
        });
      }
      // similarly, an "icon" layer can carry LineString features on the same source
      // (e.g. an OSM way that was mapped as a line rather than a closed area/point —
      // common for helipads, waterways and open-space boundaries in HDX exports) —
      // render those as an actual line instead of silently dropping them.
      if (layer.linePaint) {
        const lp = layer.linePaint;
        const lineColorExpr = resolveColorExpr(lp.lineColor);
        map.addLayer({
          id: layer.id + "-line",
          type: "line",
          source: layer.id,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": lineColorExpr,
            "line-width": lp.lineWidth || 2,
          },
        });
      }
      break;
  }

  if (layer.type !== "raster" && !layer.alwaysLabel) attachPopup(layer, map);
  if (layer.type === "icon" && layer.icon === "video_play") attachVideoPopup(layer, map);
  if (layer.autoPopupOnHighlight && isMain) showHighlightPopups(layer);
}

export function removeLayer(layer, map = state.map) {
  const isMain = map === state.map;
  const idsToRemove = [
    layer.id,
    layer.id + "-outline",
    layer.id + "-label",
    layer.id + "-polygon",
    layer.id + "-polygon-outline",
    layer.id + "-line",
  ];
  idsToRemove.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(layer.id)) map.removeSource(layer.id);
  if (!isMain) return; // highlight callouts and the spotlight mask only ever exist on the main map

  if (state.autoPopups[layer.id]) {
    state.autoPopups[layer.id].forEach((p) => p.remove());
    delete state.autoPopups[layer.id];
  }

  if (layer.spotlight) removeSpotlightMask();
}

// a text-only symbol layer riding on the same source, for circle-type layers that want permanent labels
function addAlwaysOnLabelLayer(map, layer) {
  map.addLayer({
    id: layer.id + "-label",
    type: "symbol",
    source: layer.id,
    layout: {
      "text-field": ["get", layer.labelField],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "top",
      "text-offset": [0, 0.8],
      "text-allow-overlap": true,
      "text-optional": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#111111",
      "text-halo-width": 1.4,
    },
  });
}

// ---------- Spotlight mask: darken everything outside a set of polygons ----------
// Builds one big rectangle covering the map bounds, with a hole punched out for
// every polygon in `layer.data`, and renders it as a dark fill between the raster
// imagery and the vector overlays — so only the chosen area reads "bright".

async function addSpotlightMask(layer) {
  const map = state.map;
  const spec = layer.spotlight === true ? {} : layer.spotlight;
  const color = spec.color || "#000000";
  const opacity = spec.opacity != null ? spec.opacity : 0.55;
  const pad = spec.padDegrees != null ? spec.padDegrees : 2;

  const b = state.CONFIG.map.bounds;
  const outerRing = [
    [b[0][0] - pad, b[0][1] - pad],
    [b[1][0] + pad, b[0][1] - pad],
    [b[1][0] + pad, b[1][1] + pad],
    [b[0][0] - pad, b[1][1] + pad],
    [b[0][0] - pad, b[0][1] - pad],
  ];
  const outerSign = ringSignedArea(outerRing);

  const geojson = normalizeGeoJSON(await fetch(noCache(layer.data)).then((r) => r.json()));
  const holes = [];
  geojson.features.forEach((f) => {
    const g = f.geometry;
    if (!g) return;
    const polys = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];
    polys.forEach((poly) => holes.push(windOppositeToOuter(poly[0], outerSign)));
  });

  const maskFeature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [outerRing, ...holes] },
  };

  if (map.getLayer("spotlight-mask")) map.removeLayer("spotlight-mask");
  if (map.getSource("spotlight-mask")) map.removeSource("spotlight-mask");

  map.addSource("spotlight-mask", { type: "geojson", data: maskFeature });
  map.addLayer(
    {
      id: "spotlight-mask",
      type: "fill",
      source: "spotlight-mask",
      paint: { "fill-color": color, "fill-opacity": opacity },
    },
    map.getLayer(VECTOR_ANCHOR) ? VECTOR_ANCHOR : undefined
  );
}

function removeSpotlightMask() {
  const map = state.map;
  if (map.getLayer("spotlight-mask")) map.removeLayer("spotlight-mask");
  if (map.getSource("spotlight-mask")) map.removeSource("spotlight-mask");
}
