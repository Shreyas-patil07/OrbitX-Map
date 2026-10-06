// CapabilitiesSection — "01 · Operational advantage" feature grid.
// Three feature cards rendered from a data array to avoid repetition (DRY).
const features = [
  {
    icon: '◎',
    title: 'Multi-temporal change',
    body: 'Compare pre-event and post-event scenes across optical and SAR context to surface meaningful changes in flood, landslide and infrastructure conditions.',
    tag: 'EO · CHANGE DETECTION',
  },
  {
    icon: '◌',
    title: 'Terrain-aware risk',
    body: 'Overlay elevation, rivers, corridors and exposed assets so the model reads the landscape as a system, not a flat image.',
    tag: 'DEM · GIS · TERRAIN',
  },
  {
    icon: '✦',
    title: 'Priority intelligence',
    body: 'Convert detections into operational signals: what is affected, where it matters, what is nearby and what deserves attention first.',
    tag: 'AI · PRIORITY MAP',
  },
];

function CapabilitiesSection() {
  return (
    <section className="section" id="capabilities">
      <div className="section-head">
        <div>
          <div className="kicker">01 · Operational advantage - Capabilities</div>
          <h2>From orbital evidence to a decision you can act on.</h2>
        </div>
        <p>
          OrbitX is designed around the hardest part of disaster mapping: turning
          heterogeneous geospatial signals into a clear priority surface without
          burying the operator in raw layers.
        </p>
      </div>

      <div className="grid3">
        {features.map(({ icon, title, body, tag }) => (
          <article className="feature" key={title}>
            <div className="iconbox">{icon}</div>
            <h3>{title}</h3>
            <p>{body}</p>
            <div className="mini">{tag}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default CapabilitiesSection;
