import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

// Navbar provides mission-control navigation, real-time UTC clock ticker,
// and orbital system health telemetry across all viewports.
function Navbar() {

  return (
    <header className="nav-wrap">
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="OrbitX home">
          <img src="/OrbitX.png" alt="OrbitX logo" />
          <span className="brand-copy">
            <strong>Disaster Intelligence</strong>
            <span>Earth Observation · AI · GIS</span>
          </span>
        </a>

        <div className="nav-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#method">Architecture</a>
          <a href="#mission">Mission</a>
        </div>

        <div className="nav-actions">
          <a className="ghost" href="#method">
            Docs & Specs
          </a>
          <Link className="primary" to="/rasuwa-flood">
            Launch Console
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;

