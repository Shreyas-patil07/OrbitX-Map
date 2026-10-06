// SVG icons are loaded as plain <img> elements, then registered with MapLibre.
import { state } from "./state.js";
import { noCache } from "./utils.js";

// an icon entry is either a plain URL string (rendered as-is, full color), or
// {url, sdf: true} for a solid-silhouette icon whose color is set per-feature
// at render time via the layer's "iconColor" paint option.
// targetMap defaults to the main map; the compare maps pass their own.
export function loadIcons(iconMap, targetMap = state.map) {
  return Promise.all(
    Object.keys(iconMap).map((id) => {
      const spec = iconMap[id];
      const url = typeof spec === "string" ? spec : spec.url;
      const sdf = typeof spec === "object" && !!spec.sdf;
      return loadOneIcon(targetMap, id, url, sdf);
    })
  );
}

function loadOneIcon(map, id, url, sdf) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, sdf ? { sdf: true } : {});
      resolve();
    };
    img.onerror = () => resolve(); // don't block the whole app on one bad icon
    img.src = noCache(url);
  });
}
