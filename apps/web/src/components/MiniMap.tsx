import { divIcon } from 'leaflet';
import { AttributionControl, MapContainer, Marker, TileLayer } from 'react-leaflet';
import type { LonLat } from '@shibutz/contracts';
import { toLatLng } from '../map';

const icon = divIcon({ className: 'hit', iconSize: [24, 24], html: '<span class="pin picked"></span>' });

/** A small, fixed map showing one point (read-only: no dragging, zooming or keyboard). */
export function MiniMap({ at, label }: { at: LonLat; label: string }): React.JSX.Element {
  return (
    <div className="minimap" dir="ltr" role="img" aria-label={label}>
      <MapContainer center={toLatLng(at)} zoom={14} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} attributionControl={false}>
        <AttributionControl prefix={false} />
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={toLatLng(at)} icon={icon} interactive={false} />
      </MapContainer>
    </div>
  );
}
