// Builds the layer-toggle sidebar from config/layers.json.
import { state } from "./state.js";
import { swatchColor } from "./utils.js";
import { addLayer, removeLayer } from "./layers.js";
import { showLayerStats } from "./stats.js";
import { downloadLayerData } from "./download.js";
import { setCompareLayerVisible } from "./compare.js";

export function buildSidebar() {
  const root = document.getElementById("layer-categories");
  root.innerHTML = "";

  state.CONFIG.categories.forEach((cat) => {
    const catEl = document.createElement("div");
    catEl.className = "layer-category";

    const h2 = document.createElement("h2");
    h2.textContent = cat.label;
    catEl.appendChild(h2);

    cat.layers.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "layer-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "chk-" + layer.id;
      checkbox.checked = !!layer.active;
      // while compare is open the checkboxes drive the compare maps' own layer set
      // (state.compareLayers) instead of the main map — see syncSidebarChecks().
      checkbox.addEventListener("change", () => {
        if (state.compareOpen) {
          setCompareLayerVisible(layer, checkbox.checked);
          return;
        }
        layer.active = checkbox.checked;
        if (checkbox.checked) addLayer(layer);
        else removeLayer(layer);
      });

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = swatchColor(layer);

      const label = document.createElement("label");
      label.htmlFor = checkbox.id;
      label.textContent = layer.label;

      row.appendChild(checkbox);
      row.appendChild(swatch);
      row.appendChild(label);

      if (layer.data) {
        const statsBtn = document.createElement("button");
        statsBtn.className = "stats-btn";
        statsBtn.textContent = "\u{1F4CA}"; // 📊
        statsBtn.title = "View layer statistics";
        statsBtn.addEventListener("click", (e) => {
          e.preventDefault();
          showLayerStats(layer);
        });
        row.appendChild(statsBtn);

        const downloadBtn = document.createElement("button");
        downloadBtn.className = "stats-btn";
        downloadBtn.textContent = "⬇"; // ⬇
        downloadBtn.title = "Download this layer's data";
        downloadBtn.addEventListener("click", (e) => {
          e.preventDefault();
          downloadLayerData(layer);
        });
        row.appendChild(downloadBtn);
      }

      catEl.appendChild(row);

      if (layer.note) {
        const note = document.createElement("p");
        note.className = "layer-note";
        note.textContent = layer.note;
        catEl.appendChild(note);
      }
    });

    root.appendChild(catEl);
  });
}

const DEFAULT_HINT = "Toggle layers on/off. Click the 📊 icon next to a layer to see its legend and feature counts.";
const COMPARE_HINT =
  "Compare mode: layers toggled here show on both compare panels. Pick each panel's imagery from its dropdown.";

// Points the checkboxes at whichever layer set is currently on screen: the main
// map's (layer.active) or the compare maps' (state.compareLayers). Imagery
// checkboxes are disabled in compare mode — each panel's dropdown picks its imagery.
export function syncSidebarChecks() {
  state.CONFIG.categories.forEach((cat) =>
    cat.layers.forEach((layer) => {
      const checkbox = document.getElementById("chk-" + layer.id);
      if (!checkbox) return;
      const imageryInCompare = state.compareOpen && layer.type === "raster";
      checkbox.checked = state.compareOpen ? state.compareLayers.has(layer.id) : !!layer.active;
      checkbox.disabled = imageryInCompare;
      checkbox.closest(".layer-row").classList.toggle("layer-row-disabled", imageryInCompare);
    })
  );
  const hint = document.querySelector(".sidebar-hint");
  if (hint) hint.textContent = state.compareOpen ? COMPARE_HINT : DEFAULT_HINT;
}
