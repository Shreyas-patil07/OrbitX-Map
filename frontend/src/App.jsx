import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Landing from './Landing';

// The flood map pulls in MapLibre, so it is only loaded when its route is opened.
const RasuwaMap = lazy(() => import('./rasuwa/RasuwaMap'));

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/rasuwa-flood"
          element={
            <Suspense fallback={null}>
              <RasuwaMap />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
