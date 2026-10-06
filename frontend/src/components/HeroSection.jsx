function HeroSection() {

  return (
    <section className="hero">
      <div className="hero-inner">

        {/* Left column — headline copy and CTAs */}
        <div className="hero-copy">
          <div className="eyebrow reveal">
            <span className="dot" />
            Intelligence · near-real-time
          </div>

          <h1 className="reveal d1">
            See the change.<br />
            <span className="dim">Understand the</span>{' '}
            <span className="accent">risk.</span>
          </h1>

          <p className="reveal d2">
            OrbitX turns multi-temporal satellite data, terrain, infrastructure and
            AI-driven change detection into one operational picture — built for the
            moments when the map changes faster than the response plan.
          </p>

          <div className="status-row reveal d4">
            <div className="status-chip"><b>Sentinel-1</b> SAR aware</div>
            <div className="status-chip"><b>Sentinel-2</b> optical context</div>
            <div className="status-chip"><b>AI / ML</b> priority mapping</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
