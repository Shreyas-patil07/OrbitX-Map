import { useEffect } from "react";
import { Link } from "react-router-dom";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl-compare/dist/mapbox-gl-compare.css";
import "./rasuwa.css";
import { startRasuwa, stopRasuwa } from "./app.js";

// Bhotekoshi River flood map (Aug 2026). The map logic lives in the plain modules next
// to this file; React owns the page structure and the mount/unmount lifecycle.
export default function RasuwaMap() {
  useEffect(() => {
    let cancelled = false;
    document.title = "Bhotekoshi Flood Map - August 2026";
    startRasuwa(() => cancelled);
    return () => {
      cancelled = true;
      stopRasuwa();
    };
  }, []);

  return (
    <div className="rasuwa-app">
      <header id="topbar">
        <h1>
          Bhotekoshi River Flood <span>&mdash; 26&ndash;28 Aug 2026</span>
        </h1>
        <div id="topbar-buttons">
          <Link className="toolbtn toolbtn-pinned" to="/">&larr; OrbitX</Link>
          <button id="btn-sidebar-toggle" className="toolbtn toolbtn-pinned" type="button" aria-label="Toggle layers panel">&#9776; Layers</button>
          <button id="btn-more-toggle" className="toolbtn toolbtn-pinned toolbtn-more" type="button" aria-label="More map tools" aria-haspopup="true" aria-expanded="false">&#8942;</button>
          <div id="topbar-more-menu">
            <button id="btn-terrain3d" className="toolbtn">3D Terrain</button>
            <button id="btn-play-tour" className="toolbtn" type="button">&#9658; Play Tour</button>
            <button id="btn-compare" className="toolbtn">Compare Before / After</button>
            <button id="btn-elevation-profile" className="toolbtn">📈 Elevation Profile</button>
          </div>
        </div>
      </header>

      <div id="app">
        <aside id="sidebar">
          <div id="sidebar-inner">
            <p className="sidebar-hint">Toggle layers on/off. Click the 📊 icon next to a layer to see its legend and feature counts.</p>
            <div id="layer-categories"></div>
            <p className="sidebar-credit">
              Data: HOTOSM / HDX hot_flood_npl, Overture Maps, OpenStreetMap, NAXA, Vantor, EOX Sentinel-2 cloudless, AWS Terrain Tiles, Esri World Imagery. Landslide inventory produced by the British Geological Survey through Hazard Tracker.
            </p>
          </div>
        </aside>

        <main id="map-area">
          <div id="map"></div>
          <button id="btn-skip-intro" className="hidden" type="button">Skip intro &#9193;</button>

          <div id="compare-container" className="hidden">
            <div id="before-map" className="compare-map"></div>
            <div id="after-map" className="compare-map"></div>
            <div className="compare-label compare-label-left">
              <select id="compare-select-before" aria-label="Left panel imagery"></select>
            </div>
            <div className="compare-label compare-label-right">
              <select id="compare-select-after" aria-label="Right panel imagery"></select>
            </div>
          </div>

          <section id="elevation-panel" className="elevation-panel hidden">
            <div id="ep-resize-handle" className="ep-resize-handle" title="Drag to resize"><span></span></div>
            <div className="ep-header">
              <div className="ep-titles">
                <h2>Flood Elevation Profile</h2>
                <p className="ep-subtitle">Bhotekoshi &ndash; Trishuli river corridor, 26 Aug 2026</p>
              </div>
              <div id="ep-stats" className="ep-stats"></div>
              <div className="ep-controls">
                <button id="ep-play" className="ep-btn" type="button">&#9658; Play</button>
                <button id="ep-close" className="ep-btn ep-close" type="button" aria-label="Close elevation profile">&times;</button>
              </div>
            </div>
            <div id="ep-chart-wrap" className="ep-chart-wrap">
              <svg id="ep-svg" className="ep-svg"></svg>
              <div id="ep-tooltip" className="ep-tooltip hidden"></div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
