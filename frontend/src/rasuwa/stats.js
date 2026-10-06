// The 📊 per-layer panel: legend (accurate to that layer's actual colors/icon)
// plus a feature-count bar chart grouped by whatever field is most meaningful.
import { state } from "./state.js";
import { noCache, normalizeGeoJSON, fieldLabel, layerColorSpec, swatchColor } from "./utils.js";

const MAX_STATS_BARS = 20;

// which property to group counts by, in priority order:
// explicit layer.statsField > the field a data-driven color is keyed on > labelField.
function statsGroupField(layer) {
  if (layer.statsField) return layer.statsField;
  const colorSpec = layerColorSpec(layer);
  if (colorSpec && typeof colorSpec === "object" && colorSpec.field) return colorSpec.field;
  return layer.labelField || null;
}

function legendRow(color, text) {
  const row = document.createElement("div");
  row.className = "stats-legend-row";
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = color;
  const lbl = document.createElement("span");
  lbl.textContent = text;
  row.appendChild(sw);
  row.appendChild(lbl);
  return row;
}

function renderLayerLegend(container, layer) {
  const legend = document.createElement("div");
  legend.className = "stats-legend";
  const colorSpec = layerColorSpec(layer);

  if (colorSpec && typeof colorSpec === "object" && colorSpec.values) {
    Object.keys(colorSpec.values).forEach((val) => {
      legend.appendChild(legendRow(colorSpec.values[val], val));
    });
    if (colorSpec.default) legend.appendChild(legendRow(colorSpec.default, "other"));
  } else if (layer.type === "icon" && layer.icon && state.CONFIG.map.icons[layer.icon]) {
    const spec = state.CONFIG.map.icons[layer.icon];
    const img = document.createElement("img");
    img.src = typeof spec === "string" ? spec : spec.url;
    img.className = "stats-legend-icon";
    const row = document.createElement("div");
    row.className = "stats-legend-row";
    const lbl = document.createElement("span");
    lbl.textContent = layer.label;
    row.appendChild(img);
    row.appendChild(lbl);
    legend.appendChild(row);
  } else {
    legend.appendChild(legendRow(swatchColor(layer), layer.label));
  }
  container.appendChild(legend);
}

export async function showLayerStats(layer) {
  const modalBody = openStatsModal(layer.label);
  modalBody.textContent = "Loading…";

  let geojson;
  try {
    geojson = normalizeGeoJSON(await fetch(noCache(layer.data)).then((r) => r.json()));
  } catch (err) {
    modalBody.textContent = "Could not load this layer's data.";
    return;
  }

  const total = geojson.features.length;
  const groupField = statsGroupField(layer);
  const colorSpec = layerColorSpec(layer);
  const colorSpecAppliesToGroup = colorSpec && typeof colorSpec === "object" && colorSpec.field === groupField;

  modalBody.innerHTML = "";
  renderLayerLegend(modalBody, layer);

  const totalEl = document.createElement("div");
  totalEl.className = "stats-total";
  totalEl.textContent = `${total} feature${total === 1 ? "" : "s"} total` + (groupField ? `, grouped by "${fieldLabel(layer, groupField)}"` : "");
  modalBody.appendChild(totalEl);

  if (!groupField) return;

  const counts = new Map();
  geojson.features.forEach((f) => {
    const raw = f.properties ? f.properties[groupField] : undefined;
    const key = raw === undefined || raw === null || raw === "" ? "(no value)" : String(raw);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, MAX_STATS_BARS);
  const maxCount = shown.length ? shown[0][1] : 1;
  const fallbackColor = swatchColor(layer) || "#1f9dd6";

  shown.forEach(([key, count]) => {
    const row = document.createElement("div");
    row.className = "stats-bar-row";

    const labelRow = document.createElement("div");
    labelRow.className = "stats-bar-label";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = key;
    const countSpan = document.createElement("span");
    countSpan.textContent = count;
    labelRow.appendChild(nameSpan);
    labelRow.appendChild(countSpan);

    const track = document.createElement("div");
    track.className = "stats-bar-track";
    const fill = document.createElement("div");
    fill.className = "stats-bar-fill";
    fill.style.width = Math.max(4, (count / maxCount) * 100) + "%";
    fill.style.background = colorSpecAppliesToGroup ? colorSpec.values[key] || colorSpec.default || fallbackColor : fallbackColor;
    track.appendChild(fill);

    row.appendChild(labelRow);
    row.appendChild(track);
    modalBody.appendChild(row);
  });

  if (entries.length > MAX_STATS_BARS) {
    const more = document.createElement("div");
    more.className = "stats-more-note";
    more.textContent = `+${entries.length - MAX_STATS_BARS} more distinct value(s) not shown`;
    modalBody.appendChild(more);
  }
}

function openStatsModal(title) {
  closeStatsModal();
  const overlay = document.createElement("div");
  overlay.id = "stats-modal-overlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeStatsModal();
  });

  const modal = document.createElement("div");
  modal.className = "stats-modal";

  const closeBtn = document.createElement("button");
  closeBtn.className = "stats-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeStatsModal);

  const h2 = document.createElement("h2");
  h2.textContent = title;

  const body = document.createElement("div");
  body.className = "stats-body";

  modal.appendChild(closeBtn);
  modal.appendChild(h2);
  modal.appendChild(body);
  overlay.appendChild(modal);
  (document.querySelector(".rasuwa-app") || document.body).appendChild(overlay);
  return body;
}

function closeStatsModal() {
  const existing = document.getElementById("stats-modal-overlay");
  if (existing) existing.remove();
}
