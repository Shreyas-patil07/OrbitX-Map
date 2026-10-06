import BackgroundVideo from './components/BackgroundVideo';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import CapabilitiesSection from './components/CapabilitiesSection';
import MethodSection from './components/MethodSection';
import MissionSection from './components/MissionSection';
import Footer from './components/Footer';

// App is the page shell — it just assembles the sections in order.
// All stateful logic lives inside HeroSection (geolocation) so this
// component stays purely declarative and easy to read end-to-end.
function Landing() {
  return (
    <>
      {/* Fixed decorative background — rendered first so it sits behind everything */}
      <BackgroundVideo />

      <Navbar />

      <main id="top">
        <HeroSection />
        <CapabilitiesSection />
        <MethodSection />
        <MissionSection />
      </main>

      <Footer />
    </>
  );
}

export default Landing;
