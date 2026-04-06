import { useEffect, useRef, useState } from 'react';

const LEAFLET_CSS = 'https://my.living-apps.de/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://my.living-apps.de/npm/leaflet@1.9.4/dist/leaflet.js';

declare const L: any;

function loadLeaflet(): Promise<void> {
  if (typeof L !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const check = setInterval(() => {
        if (typeof L !== 'undefined') { clearInterval(check); resolve(); }
      }, 50);
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

interface GeoMapPickerProps {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

export function GeoMapPicker({ lat, lng, onChange, readOnly }: GeoMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const propsRef = useRef({ lat, lng, onChange });
  propsRef.current = { lat, lng, onChange };
  const [ready, setReady] = useState(typeof L !== 'undefined');

  useEffect(() => {
    if (!ready) { loadLeaflet().then(() => setReady(true)).catch(() => {}); }
  }, [ready]);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: !readOnly,
      dragging: !readOnly,
      scrollWheelZoom: !readOnly,
      doubleClickZoom: !readOnly,
      touchZoom: !readOnly,
      boxZoom: !readOnly,
      keyboard: !readOnly,
    });

    if (!readOnly) {
      L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    if (!readOnly) {
      map.on('moveend', () => {
        const c = map.getCenter();
        propsRef.current.onChange?.(c.lat, c.lng);
      });
    }

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);

    return () => { map.remove(); mapRef.current = null; };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - lat) > 0.00005 || Math.abs(c.lng - lng) > 0.00005) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ height: 200 }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ zIndex: 1000 }}
      >
        <svg width="28" height="40" viewBox="0 0 28 40" className="drop-shadow-md" style={{ marginBottom: 40 }}>
          <path
            d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
            fill="#ef4444"
          />
          <circle cx="14" cy="14" r="5" fill="white" />
        </svg>
      </div>
    </div>
  );
}
