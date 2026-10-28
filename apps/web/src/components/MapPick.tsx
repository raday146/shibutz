import { divIcon } from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { Marker, useMapEvents } from 'react-leaflet';
import type { LonLat } from '@shibutz/contracts';
import { fromLatLng, toLatLng } from '../map';

const icon = divIcon({ className: 'hit', iconSize: [24, 24], html: '<span class="pin picked"></span>' });

interface Props {
  /** Clicks on the map place the point only while this is true. */
  picking: boolean;
  at: LonLat | null;
  /** A click on the map or the end of a pin drag. */
  onPick: (at: LonLat) => void;
}

/** Inside a MapContainer: click-to-place plus a draggable pin on the chosen point. Generic over what is being placed. */
export function MapPick({ picking, at, onPick }: Props): React.JSX.Element | null {
  useMapEvents({ click: (e) => picking && onPick(fromLatLng(e.latlng)) });
  return at && (
    <Marker
      position={toLatLng(at)}
      icon={icon}
      draggable
      eventHandlers={{ dragend: (e) => onPick(fromLatLng((e.target as LeafletMarker).getLatLng())) }}
    />
  );
}
