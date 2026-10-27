import { useEffect } from 'react';
import { latLngBounds } from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { useLang } from '../lang';
import { skillLabel, statusColor, toLatLng, toLatLngs } from '../map';

export type Point = [number, number];
const CENTER: Point = [32.05, 34.85];

/** Fits the map to `points` when `fitKey` changes or the points first appear; later reloads keep the user's view. */
function FitTo({ points, fitKey }: { points: Point[]; fitKey: string }): null {
  const map = useMap();
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (hasPoints) map.fitBounds(latLngBounds(points), { padding: [30, 30] });
    // points is deliberately not a dependency: refit on a new target only, not on every reload
  }, [map, fitKey, hasPoints]);
  return null;
}

/** Moves the map to a clicked unassigned job. */
function FlyTo({ target }: { target: Point | null }): null {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14);
  }, [map, target]);
  return null;
}

/** Reports map clicks while the new-job form is waiting for a location. */
function PickLocation({ active, onPick }: { active: boolean; onPick: (at: LonLat) => void }): null {
  useMapEvents({ click: (e) => active && onPick([e.latlng.lng, e.latlng.lat]) });
  return null;
}

interface Props {
  technicians: Technician[];
  dayJobs: Job[];
  skills: Skill[];
  route: RouteView | null;
  focus: Point | null;
  picking: boolean;
  at: LonLat | null;
  onPick: (at: LonLat) => void;
  onSelect: (technicianId: number) => void;
}

export function MapView({ technicians, dayJobs, skills, route, focus, picking, at, onPick, onSelect }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const owner = technicians.find((tech) => tech.id === route?.technicianId);
  const allPoints: Point[] = [...technicians.map((tech) => toLatLng(tech.home)), ...dayJobs.map((j) => toLatLng(j.location))];
  return (
    <MapContainer className="map" center={CENTER} zoom={10}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitTo points={route?.geometry ? toLatLngs(route.geometry.coordinates) : allPoints} fitKey={route ? `route${route.technicianId}` : 'all'} />
      <FlyTo target={focus} />
      <PickLocation active={picking || at !== null} onPick={onPick} />
      {at && <CircleMarker center={toLatLng(at)} radius={8} pathOptions={{ color: '#dc2626', dashArray: '3' }} />}
      {route?.geometry && (
        <>
          <Polyline positions={toLatLngs(route.geometry.coordinates)} color="#fff" weight={7} interactive={false} />
          <Polyline positions={toLatLngs(route.geometry.coordinates)} weight={3.5} className={`route-${owner?.color ?? 1}`} interactive={false} />
        </>
      )}
      {dayJobs.map((j) => (
        <CircleMarker key={`j${j.id}`} center={toLatLng(j.location)} radius={6} pathOptions={{ color: statusColor(j.status), fillOpacity: 0.8 }}>
          <Tooltip><b dir="auto">{j.title}</b>
          <div dir="auto">{j.address || t('job.noAddress')}</div>
          <div>{`${t(`status.${j.status}`)}, ${t('map.needs', { skills: skillLabel(j.skillIds, skills, lang) })}`}</div></Tooltip>
        </CircleMarker>
      ))}
      {technicians.map((tech) => (
        <CircleMarker
          key={`t${tech.id}`}
          center={toLatLng(tech.home)}
          radius={9}
          pathOptions={{ color: '#111827', fillColor: '#fff', fillOpacity: 1, weight: 3 }}
          eventHandlers={{ click: () => onSelect(tech.id) }}
        >
          <Tooltip>{t('map.home', { name: tech.name })}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
