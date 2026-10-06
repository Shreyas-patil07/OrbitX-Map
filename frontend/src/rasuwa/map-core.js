import maplibregl from "maplibre-gl";
// Map construction, base style, 3D-terrain toggle, the camera tour, and topbar button wiring.
import { state } from "./state.js";
import { loadIcons } from "./icons.js";
import { addAllConfiguredLayers } from "./layers.js";
import { buildSidebar } from "./sidebar.js";
import { toggleCompare, updateCompareTerrain } from "./compare.js";

// First launch only (per browser tab): play the camera tour defined in
// config.map.tour — a scripted flyover of waypoints (landslide source, full
// corridor overview, resting valley view, ...). Cancels itself the instant the
// user touches the map, and never auto-plays again this session. Once it's
// played (or been skipped), every subsequent load in the same tab starts
// straight at the tour's last waypoint — the flyover is an intro flourish, not
// the resting state. Replayable any time via the topbar "Play Tour" button.
const INTRO_SEEN_KEY = "bhotekoshi_intro_seen";

export function createMainMap() {
  const cfg = state.CONFIG.map;
  const tour = cfg.tour;
  const introSeen = !!sessionStorage.getItem(INTRO_SEEN_KEY);
  const startView = introSeen && tour && tour.length ? tour[tour.length - 1] : cfg;

  state.map = new maplibregl.Map({
    container: "map",
    style: buildBaseStyle(cfg),
    center: startView.center,
    zoom: startView.zoom,
    pitch: startView.pitch,
    bearing: startView.bearing,
    maxPitch: 85, // MapLibre's default cap is 60 — too low for a dramatic terrain hero shot
    antialias: true,
  });
  const map = state.map;

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl(), "bottom-left");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");

  map.on("load", async () => {
    map.setTerrain({ source: "terrainSource", exaggeration: cfg.terrain.exaggeration });

    if (cfg.bounds && cfg.fitBoundsOnLoad !== false) {
      map.fitBounds(cfg.bounds, { padding: 40, duration: 0, pitch: cfg.pitch, bearing: cfg.bearing });
    }

    await loadIcons(cfg.icons || {});
    addAllConfiguredLayers();
    buildSidebar();

    // on a narrow screen the sidebar is a full-height overlay (see the mobile
    // media query in style.css) — start collapsed so the map is what greets
    // the user, rather than the layer list covering most of the viewport.
    setSidebarCollapsed(window.matchMedia("(max-width: 720px)").matches);

    // ?nointro=1 — dev/testing hook so a specific camera config can be
    // inspected as a static screenshot without the tour immediately playing.
    const skipTourParam = new URLSearchParams(location.search).has("nointro");
    if (!introSeen && tour && tour.length && !skipTourParam) {
      playTour(tour, { markSeen: true });
    }

    // Listen for the 'move' event, which fires continuously during panning
  // map.on('move', () => {
  //     // 1. Fetch all current camera properties
  //     const zoom = map.getZoom();
  //     const pitch = map.getPitch();
  //     const bearing = map.getBearing();
  //     const center = map.getCenter();
  //     const conf = {"zoom": zoom, "pitch": pitch, "bearing": bearing, "center": [center.lng, center.lat]};

  //     // 2. Log or utilize the values
  //     console.log(conf);
  // });
  });
}

// Replays the tour on demand (topbar "Play Tour" button) regardless of
// whether the auto-intro has already run this session.
export function replayTour() {
  const tour = state.CONFIG.map.tour;
  if (tour && tour.length) playTour(tour, { markSeen: false });
}

function playTour(tour, { markSeen }) {
  const map = state.map;
  if (markSeen) sessionStorage.setItem(INTRO_SEEN_KEY, "1");

  const skipBtn = document.getElementById("btn-skip-intro");
  const playBtn = document.getElementById("btn-play-tour");
  skipBtn.classList.remove("hidden");
  if (playBtn) playBtn.disabled = true;

  // the tour is a cinematic flyover of the map itself — don't let the layers
  // panel sit on top of it. Remember whatever state it was already in so
  // cleanup() can put it back rather than force it open afterwards.
  const sidebarWasCollapsed = document.getElementById("sidebar").classList.contains("collapsed");
  setSidebarCollapsed(true);

  let done = false;
  let cancelHold = () => {};

  const cleanup = () => {
    skipBtn.classList.add("hidden");
    skipBtn.removeEventListener("click", onSkip);
    map.off("dragstart", onSkip);
    map.off("wheel", onSkip);
    map.off("touchstart", onSkip);
    if (playBtn) playBtn.disabled = false;
    if (!sidebarWasCollapsed) setSidebarCollapsed(false);
  };
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
  };
  const onSkip = () => {
    if (done) return;
    map.stop();
    cancelHold();
    const last = tour[tour.length - 1];
    map.jumpTo({ center: last.center, zoom: last.zoom, pitch: last.pitch, bearing: last.bearing });
    applyShowLayers(tour.flatMap((w) => w.showLayers || [])); // reveal everything the tour would have shown
    finish();
  };

  skipBtn.addEventListener("click", onSkip);
  map.on("dragstart", onSkip);
  map.on("wheel", onSkip);
  map.on("touchstart", onSkip);

  // Land on the first waypoint immediately — a no-op if the map was already
  // constructed there (the auto-intro case), but essential for a manual replay
  // triggered from wherever the user had navigated to.
  const first = tour[0];
  map.jumpTo({ center: first.center, zoom: first.zoom, pitch: first.pitch, bearing: first.bearing });
  applyShowLayers(first.showLayers);

  let i = 0;
  const step = () => {
    if (done) return;
    const holdMs = tour[i].holdMs ?? 1200;
    const timer = setTimeout(() => {
      if (done) return;
      i += 1;
      if (i >= tour.length) {
        finish();
        return;
      }
      const wp = tour[i];
      map.flyTo({
        center: wp.center,
        zoom: wp.zoom,
        pitch: wp.pitch,
        bearing: wp.bearing,
        duration: wp.flyMs ?? 5000,
        curve: 1.15, // gentle arc — avoids a big theatrical zoom-out that just adds tile-loading gaps mid-flight
        // not `essential` — a purely decorative flourish should honor
        // prefers-reduced-motion and jump instantly for those users.
      });
      map.once("moveend", () => {
        if (done) return;
        applyShowLayers(wp.showLayers);
        step();
      });
    }, holdMs);
    cancelHold = () => clearTimeout(timer);
  };
  step();
}

// Waypoints can name layer ids to switch on as the camera reveals them (e.g.
// bridge/building damage once the corridor pulls into view) — reuses the same
// checkbox + change-event path the sidebar itself uses, so state stays in sync.
function applyShowLayers(ids) {
  (ids || []).forEach((id) => {
    const checkbox = document.getElementById("chk-" + id);
    if (checkbox && !checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
    }
  });
}

function buildBaseStyle(cfg) {
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: cfg.basemap.tiles,
        tileSize: cfg.basemap.tileSize,
        attribution: cfg.basemap.attribution,
      },
      terrainSource: {
        type: "raster-dem",
        tiles: cfg.terrain.tiles,
        encoding: cfg.terrain.encoding,
        tileSize: cfg.terrain.tileSize,
        maxzoom: cfg.terrain.maxzoom,
        attribution: cfg.terrain.attribution,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

export function wireTopbarButtons() {
  document.getElementById("btn-terrain3d").addEventListener("click", toggle3D);
  document.getElementById("btn-terrain3d").classList.add("active"); // default view starts in 3D
  document.getElementById("btn-compare").addEventListener("click", toggleCompare);
  document.getElementById("btn-play-tour").addEventListener("click", replayTour);
  document.getElementById("btn-sidebar-toggle").addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
  });
  wireMoreMenu();
}

// mobile-only "⋯ More" dropdown (see the mobile media query in style.css) that
// holds the secondary toolbar buttons (3D Terrain, Play Tour, Compare,
// Elevation Profile) — on wider screens it's just displayed inline and this
// is all a no-op since #btn-more-toggle stays hidden.
function wireMoreMenu() {
  const moreBtn = document.getElementById("btn-more-toggle");
  const moreMenu = document.getElementById("topbar-more-menu");
  if (!moreBtn || !moreMenu) return;

  const setOpen = (open) => {
    moreMenu.classList.toggle("open", open);
    moreBtn.setAttribute("aria-expanded", String(open));
  };

  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!moreMenu.classList.contains("open"));
  });
  // picking any action in the menu should close it, same as a native select
  moreMenu.addEventListener("click", (e) => {
    if (e.target.closest(".toolbtn")) setOpen(false);
  });
  outsideClickHandler = (e) => {
    if (moreMenu.classList.contains("open") && !moreMenu.contains(e.target) && e.target !== moreBtn) {
      setOpen(false);
    }
  };
  document.addEventListener("click", outsideClickHandler);
}

// keeps the sidebar's visibility and the "Layers" toggle button's active/pressed
// look in sync everywhere the sidebar is shown/hidden (initial mobile state, the
// manual toggle button, and the tour's auto-hide/restore).
function setSidebarCollapsed(collapsed) {
  document.getElementById("sidebar").classList.toggle("collapsed", collapsed);
  const btn = document.getElementById("btn-sidebar-toggle");
  if (btn) btn.classList.toggle("active", !collapsed);
}

function toggle3D() {
  state.is3D = !state.is3D;
  const btn = document.getElementById("btn-terrain3d");
  btn.classList.toggle("active", state.is3D);

  if (state.is3D) {
    const t = state.CONFIG.map.terrain3d;
    state.map.setTerrain({ source: "terrainSource", exaggeration: state.CONFIG.map.terrain.exaggeration });
    state.map.easeTo({ pitch: t.pitch, bearing: t.bearing, duration: 800 });
  } else {
    state.map.setTerrain(null);
    state.map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }
  const t = state.CONFIG.map.terrain3d;
  updateCompareTerrain(state.is3D ? t.pitch : 0, state.is3D ? t.bearing : 0);
}

let outsideClickHandler;
export function destroyMapCore() {
  document.removeEventListener("click", outsideClickHandler);
}
