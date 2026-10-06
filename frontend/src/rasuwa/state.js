// Shared mutable state for the whole app. Exported as one object (rather than
// individual `export let` bindings) so any module can both read AND write
// through it — ES module live bindings only allow the owning module to reassign.
export const state = {
  CONFIG: null,
  map: null,
  is3D: true, // default view starts pitched (see config.map.pitch)
  compareInitialized: false,
  beforeMap: null,
  afterMap: null,
  compareControl: null,
  compareOpen: false,
  compareLayers: new Set(), // layer ids shown on the compare maps (separate from the main map's layer.active)
  autoPopups: {}, // layer.id -> [maplibregl.Popup, ...] currently shown for highlighted features
};
