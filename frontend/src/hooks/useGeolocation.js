// Custom hook that wraps the browser Geolocation API.
// Returns { locateText, coords, handleLocate } so any component can trigger it.
// note: navigator.geolocation is accessed lazily on button click, not on mount.
import { useState, useCallback } from 'react';

function useGeolocation() {
  const [locateText, setLocateText] = useState('Locate me');
  const [coords, setCoords] = useState('LAT 28.082 · LON 85.244');

  // useCallback avoids a new function reference every render
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateText('GPS unavailable');
      return;
    }
    setLocateText('Locating…');
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        const lat = c.latitude.toFixed(5);
        const lon = c.longitude.toFixed(5);
        setCoords(`LAT ${lat} · LON ${lon}`);
        setLocateText('Location locked');
      },
      () => setLocateText('Permission needed'),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 10000 }
    );
  }, []);

  return { locateText, coords, handleLocate };
}

export default useGeolocation;
