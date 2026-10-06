// Navbar — glassmorphism pill with brand logo, nav links and CTA buttons.
// Nav links are hidden on <1050px via CSS; ghost button hidden on <720px.
function Navbar() {
  return (
    <header className="nav-wrap">
      <nav className="nav">
        <a className="brand" href="#top" aria-label="OrbitX home">
          <img src="/OrbitX.png" alt="OrbitX" />
          <span className="brand-copy">
            <strong>Disaster intelligence</strong>
            <span>Earth observation · AI · GIS</span>
          </span>
        </a>

        <div className="nav-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#method">Method</a>
          <a href="#mission">Mission</a>
        </div>

        <div className="nav-actions">
          <a className="ghost" href="#method">Method</a>
          <a className="primary" href="#capabilities">Explore platform</a>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
