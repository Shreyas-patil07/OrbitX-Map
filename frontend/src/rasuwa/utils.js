// Generic, map-independent helper functions: caching, GeoJSON normalization,
// color/label resolution, and geometry math. No DOM or MapLibre calls in here.

export const CATEGORY_COLORS_FALLBACK = "#888";

// local data/config files get hand-edited while the map is open — always bypass
// the browser cache for them so a reload reliably shows the latest content.
const ASSET_BASE = `${import.meta.env.BASE_URL}rasuwa/`;
export function noCache(url) {
  if (!/^([a-z]+:)?\/\//i.test(url) && !url.startsWith("/") && !url.startsWith("data:") && !url.startsWith("blob:")) url = ASSET_BASE + url;
  return url + (url.includes("?") ? "&" : "?") + "_ts=" + Date.now();
}

// Some GIS export tools (QGIS "save selected features", certain merges, etc.) can
// write a bare GeometryCollection ({type, geometries: [...]}) instead of a proper
// FeatureCollection. MapLibre's tiler doesn't unpack nested GeometryCollections and
// silently renders nothing — no error — so normalize any such file into Features.
export function normalizeGeoJSON(gj) {
  if (!gj || !gj.type || gj.type === "FeatureCollection") return gj;
  if (gj.type === "GeometryCollection") {
    return {
      type: "FeatureCollection",
      features: gj.geometries.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
    };
  }
  if (gj.type === "Feature") return { type: "FeatureCollection", features: [gj] };
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: gj }] };
}

// paint.circleColor / layer.iconColor is either a flat color string, or an object
// { field, values: {value: color}, default } which becomes a "match" expression.
export function resolveColorExpr(spec) {
  if (typeof spec === "string") return spec;
  const expr = ["match", ["get", spec.field]];
  Object.keys(spec.values).forEach((k) => {
    expr.push(k, spec.values[k]);
  });
  expr.push(spec.default || "#888888");
  return expr;
}

// swatches need a single CSS color; for a {field, values, default} spec, just show its default.
export function flatColor(spec) {
  if (typeof spec === "string") return spec;
  return spec.default || "#888888";
}

// the color-by-value spec a layer uses for its dots/icons, if any (same object
// shape as resolveColorExpr's input) — reused by the map paint, the legend, and stats.
export function layerColorSpec(layer) {
  return (
    (layer.paint && layer.paint.circleColor) ||
    layer.iconColor ||
    (layer.polygonPaint && layer.polygonPaint.fillColor) ||
    (layer.paint && layer.paint.fillColor) ||
    (layer.paint && layer.paint.lineColor) ||
    null
  );
}

export function swatchColor(layer) {
  if (layer.type === "raster") return "#555";
  if (layer.type === "icon") {
    if (layer.iconColor) return flatColor(layer.iconColor);
    if (layer.polygonPaint) return flatColor(layer.polygonPaint.fillColor);
    return "#555";
  }
  if (layer.paint && layer.paint.fillColor) return flatColor(layer.paint.fillColor);
  if (layer.paint && layer.paint.circleColor) return flatColor(layer.paint.circleColor);
  if (layer.paint && layer.paint.lineColor) return flatColor(layer.paint.lineColor);
  return CATEGORY_COLORS_FALLBACK;
}

// "GaPa_NaPa" -> "Ga Pa Na Pa", "bridge_structure" -> "Bridge Structure", "DISTRICT" -> "District".
// Good enough as a default; override odd cases per-field via layer.popupLabels.
export function prettifyFieldName(key) {
  const spaced = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fieldLabel(layer, field) {
  return (layer.popupLabels && layer.popupLabels[field]) || prettifyFieldName(field);
}

// ---------- Geometry math (used by the spotlight mask and popup anchoring) ----------

export function ringSignedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

// a hole ring must wind opposite to the outer ring, regardless of the source's
// own winding convention (shapefile exports are often clockwise, GeoJSON expects
// holes counter to whatever the outer ring does) — so just compare signs.
export function windOppositeToOuter(ring, outerSign) {
  const sign = Math.sign(ringSignedArea(ring));
  return sign !== 0 && sign === Math.sign(outerSign) ? ring.slice().reverse() : ring;
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length; // last point usually duplicates the first
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

// a single representative [lng, lat] for any GeoJSON geometry type — used to
// anchor a popup regardless of whether the feature is a point, line, or polygon.
export function geometryAnchor(geometry) {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates;
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates[0];
    case "MultiLineString":
      return geometry.coordinates[0][0];
    case "Polygon":
      return ringCentroid(geometry.coordinates[0]);
    case "MultiPolygon":
      return ringCentroid(geometry.coordinates[0][0]);
    default:
      return [0, 0];
  }
}
