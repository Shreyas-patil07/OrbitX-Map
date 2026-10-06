// MethodSection — "02 · System architecture" — three pipeline steps.
const steps = [
  {
    num: '01',
    title: 'Observe',
    body: 'Ingest satellite, terrain and contextual geospatial datasets around an event-defined area of interest.',
    tag: 'SENTINEL · OGC · GIS',
  },
  {
    num: '02',
    title: 'Detect',
    body: 'Run change detection and validity checks, keeping the distinction between actual evidence and model inference explicit.',
    tag: 'SAR · OPTICAL · ML',
  },
  {
    num: '03',
    title: 'Act',
    body: "Rank affected infrastructure, hazards and accessible resources around the operator's live position.",
    tag: 'GPS · ROUTING · RESPONSE',
  },
];

function MethodSection() {
  return (
    <section className="section" id="method">
      <div className="section-head">
        <div>
          <div className="kicker">02 · System architecture - Method</div>
          <h2>One visual language across the entire intelligence pipeline.</h2>
        </div>
        <p>
          The interface is intentionally modular: discovery, evidence, analysis,
          prioritisation and action can all share the same map-first design system.
        </p>
      </div>

      <div className="grid3">
        {steps.map(({ num, title, body, tag }) => (
          <article className="feature" key={num}>
            <div className="iconbox">{num}</div>
            <h3>{title}</h3>
            <p>{body}</p>
            <div className="mini">{tag}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default MethodSection;
