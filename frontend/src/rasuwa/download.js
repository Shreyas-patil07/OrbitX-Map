// Triggers a browser download of a layer's underlying data file (GeoJSON, etc).
// Not offered for "raster" layers — those are XYZ tile endpoints, not a single
// downloadable file (see sidebar.js, which only renders this button when layer.data exists).
import { noCache } from "./utils.js";

export async function downloadLayerData(layer) {
  try {
    const res = await fetch(noCache(layer.data));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();

    const ext = layer.data.split(".").pop().split(/[?#]/)[0] || "geojson";
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = layer.id + "." + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to download layer data:", layer.data, err);
    alert("Could not download this layer's data. See console for details.");
  }
}
