import { useEffect, useRef } from 'react';

export default function FleetMap({ drivers = [], orders = [], height = 380 }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const L = window.L;
    if (!L) return;

    if (!mapInstanceRef.current) {
      // Default Cairo Coordinates
      const defaultCenter = [30.0444, 31.2357];
      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: 12,
        zoomControl: true
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const bounds = [];

    // Plot Driver Markers
    drivers.forEach(d => {
      const lat = parseFloat(d.lat || d.clock_in_lat || 30.0444);
      const lng = parseFloat(d.lng || d.clock_in_lng || 31.2357);
      if (isNaN(lat) || isNaN(lng)) return;

      const pos = [lat, lng];
      bounds.push(pos);

      const isOnline = d.online_status === 'online' || d.status === 'online';
      const iconHtml = `<div style="
        width: 34px; height: 34px; border-radius: 50%;
        background: ${isOnline ? '#22c55e' : '#64748b'};
        color: white; display: flex; align-items: center; justify-content: center;
        font-size: 16px; border: 2px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      ">🚚</div>`;

      const customIcon = L.divIcon({
        className: 'custom-driver-pin',
        html: iconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker(pos, { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-title">${d.name || d.driver_name || 'Driver'}</div>
          <div class="map-popup-sub">Status: <strong>${isOnline ? '🟢 Online' : '⚪ Offline'}</strong></div>
          <div class="map-popup-sub">Cash Held: $${parseFloat(d.collection_balance || 0).toFixed(2)}</div>
        </div>
      `);
      markersRef.current.push(marker);
    });

    // Plot Order Destination Pins
    orders.forEach(o => {
      const lat = parseFloat(o.latitude);
      const lng = parseFloat(o.longitude);
      if (isNaN(lat) || isNaN(lng) || !lat || !lng) return;

      const pos = [lat, lng];
      bounds.push(pos);

      const iconHtml = `<div style="
        width: 28px; height: 28px; border-radius: 50%;
        background: #4f8ef7; color: white; display: flex; align-items: center; justify-content: center;
        font-size: 13px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      ">📍</div>`;

      const customIcon = L.divIcon({
        className: 'custom-order-pin',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker(pos, { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-title">Order #${o.tracking_number}</div>
          <div class="map-popup-sub">Address: ${o.client_address || 'Address'}</div>
          <div class="map-popup-sub">Amount: $${parseFloat(o.order_amount || 0).toFixed(2)} (${o.status})</div>
        </div>
      `);
      markersRef.current.push(marker);
    });

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } catch (_) {}
    }
  }, [drivers, orders]);

  return (
    <div className="fleet-map-wrapper">
      <div className="fleet-map-header">
        <div className="card-title">
          <span>🗺️ Live Fleet & Route GIS Map</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
          Active Drivers & Order Destinations
        </div>
      </div>
      <div ref={mapRef} className="fleet-map-canvas" style={{ height }} />
    </div>
  );
}
