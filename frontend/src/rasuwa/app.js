// Lifecycle for the Bhotekoshi flood map: start() after the React tree has mounted
// its DOM, stop() on unmount. Replaces the old standalone js/main.js.
import { state } from "./state.js";
import { noCache } from "./utils.js";
import { createMainMap, wireTopbarButtons, destroyMapCore } from "./map-core.js";
import { initElevationProfile, destroyElevationProfile } from "./elevationProfile.js";

export async function startRasuwa(isCancelled) {
  const config = await fetch(noCache("config/layers.json")).then((r) => r.json());
  if (isCancelled()) return; // unmounted (or StrictMode re-ran the effect) before config arrived
  state.CONFIG = config;
  createMainMap();
  wireTopbarButtons();
  initElevationProfile();
}

export function stopRasuwa() {
  destroyMapCore();
  destroyElevationProfile();
  for (const key of ["map", "beforeMap", "afterMap"]) {
    try { state[key]?.remove(); } catch { /* map already torn down */ }
    state[key] = null;
  }
  Object.assign(state, { CONFIG: null, is3D: true, compareInitialized: false, compareControl: null, compareOpen: false, autoPopups: {} });
  state.compareLayers.clear();
}
