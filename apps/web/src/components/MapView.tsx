import { Fragment, useEffect, useRef } from 'react';
import { divIcon, latLngBounds } from 'leaflet';
import type { DivIcon, Marker as LeafletMarker } from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { useLang } from '../lang';
import { routeVar, skillLabel, toLatLng, toLatLngs } from '../map';

export type Point = [number, number];
const CENTER: Point = [32.05, 34.85];

/** Fits the map to `points` when `fitKey` changes or the points first appear, never closer than zoom 13; later reloads keep the user's view. */
/** Names the map container (DESIGN.md: labeled "Map"); Leaflet already makes it focusable with keyboard pan and zoom. */
function MapLabel(): null {
  const map = useMap();
  const { t } = useLang();
  useEffect(() => {
    const el = map.getContainer();
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', t('map.label'));
  });
  return null;
}

function FitTo({ points, fitKey }: { points: Point[]; fitKey: string }): null {
  const map = useMap();
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (hasPoints) map.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
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

/** Reports the map's center, for the crosshair's "Use this point". */
function ReportCenter({ onCenter }: { onCenter: (at: LonLat) => void }): null {
  const map = useMapEvents({ moveend: () => onCenter([map.getCenter().lng, map.getCenter().lat]) });
  useEffect(() => onCenter([map.getCenter().lng, map.getCenter().lat]), [map, onCenter]);
  return null;
}

export interface Props {
  technicians: Technician[];
  dayJobs: Job[];
  skills: Skill[];
  routes: RouteView[];
  selected: number | null;
  /** The stop whose marker pulses, linked to its drawer row. */
  highlighted: number | null;
  focus: Point | null;
  picking: boolean;
  at: LonLat | null;
  /** Dashed preview of a slot option: previous stop, the job, next stop, in the technician's color. */
  preview: { points: LonLat[]; color: number } | null;
  onPick: (at: LonLat) => void;
  onCenter: (at: LonLat) => void;
  onSelect: (technicianId: number) => void;
  onSelectStop: (technicianId: number, jobId: number) => void;
  onSelectJob: (jobId: number) => void;
}

// One icon per look, so a re-render never replaces a marker (and drops its keyboard focus).
const icons = new Map<string, DivIcon>();
/** A 24px transparent hit area around the visible `.pin`; `text` goes in as text, never HTML. */
function pinIcon(cls: string, color: number, text: string): DivIcon {
  const key = `${cls}|${color}|${text}`;
  let icon = icons.get(key);
  if (!icon) {
    const pin = document.createElement('span');
    pin.className = `pin ${cls}${text.length > 0 && text !== '✓' ? ' num' : ''}`;
    pin.style.setProperty('--c', routeVar(color));
    pin.textContent = text;
    icon = divIcon({ className: 'hit', iconSize: [24, 24], html: pin });
    icons.set(key, icon);
  }
  return icon;
}

interface PinProps {
  at: LonLat;
  cls: string;
  color?: number;
  text?: string;
  label: string;
  faded: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

/** A keyboard-focusable map marker with an accessible name. */
function Pin({ at, cls, color = 1, text = '', label, faded, onClick, children }: PinProps): React.JSX.Element {
  const ref = useRef<LeafletMarker>(null);
  useEffect(() => ref.current?.getElement()?.setAttribute('aria-label', label));
  return (
    <Marker ref={ref} position={toLatLng(at)} icon={pinIcon(cls, color, text)} opacity={faded ? 0.2 : 1} eventHandlers={{ click: () => onClick?.() }}>
      <Tooltip>{children ?? label}</Tooltip>
    </Marker>
  );
}

export function MapView({ technicians, dayJobs, skills, routes, selected, highlighted, focus, picking, at, preview, onPick, onCenter, onSelect, onSelectStop, onSelectJob }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const jobById = new Map(dayJobs.map((j) => [j.id, j]));
  const colorOf = (id: number): number => technicians.find((tech) => tech.id === id)?.color ?? 1;
  const fades = (owner: number): boolean => selected !== null && owner !== selected;
  const mine = routes.find((r) => r.technicianId === selected);
  const home = technicians.find((tech) => tech.id === selected)?.home;
  const selectedPoints: Point[] = [...(mine?.geometry ? toLatLngs(mine.geometry.coordinates) : []), ...(home ? [toLatLng(home)] : [])];
  const allPoints: Point[] = [...technicians.map((tech) => toLatLng(tech.home)), ...dayJobs.map((j) => toLatLng(j.location))];
  const drawn = [...routes].sort((a, b) => Number(a.technicianId === selected) - Number(b.technicianId === selected)); // the selected route on top
  return (
    <MapContainer className="map" center={CENTER} zoom={10} zoomControl={false}>
      <ZoomControl position={lang === 'he' ? 'topright' : 'topleft'} />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MapLabel />
      <FitTo points={selected !== null ? selectedPoints : allPoints} fitKey={selected !== null ? `route${selected}` : 'all'} />
      <FlyTo target={focus} />
      <PickLocation active={picking} onPick={onPick} />
      <ReportCenter onCenter={onCenter} />
      {at && <CircleMarker center={toLatLng(at)} radius={8} pathOptions={{ color: '#dc2626', dashArray: '3' }} />}
      {drawn.map((r) => {
        if (!r.geometry) return null;
        const line = toLatLngs(r.geometry.coordinates);
        const thick = r.technicianId === selected;
        const opacity = fades(r.technicianId) ? 0.2 : 1;
        return (
          <Fragment key={`r${r.technicianId}`}>
            <Polyline positions={line} pathOptions={{ color: '#fff', weight: thick ? 7 : 5, opacity }} interactive={false} />
            <Polyline positions={line} pathOptions={{ weight: thick ? 3.5 : 2, opacity, className: `route-${colorOf(r.technicianId)}` }} interactive={false} />
          </Fragment>
        );
      })}
      {preview && <Polyline positions={toLatLngs(preview.points)} pathOptions={{ weight: 3, dashArray: '6 6', className: `route-${preview.color}` }} interactive={false} />}
      {dayJobs
        .filter((j) => j.status === 'unassigned')
        .map((j) => (
          <Pin key={`j${j.id}`} at={j.location} cls="unassigned" label={`${j.title}, ${t('status.unassigned')}`} faded={selected !== null} onClick={() => onSelectJob(j.id)}>
            <b dir="auto">{j.title}</b>
            <div dir="auto">{j.address || t('job.noAddress')}</div>
            <div>{`${t('status.unassigned')}, ${t('map.needs', { skills: skillLabel(j.skillIds, skills, lang) })}`}</div>
          </Pin>
        ))}
      {routes.flatMap((r) =>
        r.stops.map((s, i) => {
          const status = jobById.get(s.jobId)?.status ?? 'assigned';
          const numbered = r.technicianId === selected;
          return (
            <Pin
              key={`s${s.jobId}`}
              at={s.location}
              cls={s.jobId === highlighted ? `${status} hl` : status}
              color={colorOf(r.technicianId)}
              text={numbered ? String(i + 1) : status === 'done' ? '✓' : ''}
              label={`${t('map.stop', { n: i + 1, title: s.title })}, ${t(`status.${status}`)}`}
              faded={fades(r.technicianId)}
              onClick={() => onSelectStop(r.technicianId, s.jobId)}
            />
          );
        }),
      )}
      {technicians.map((tech) => (
        <Pin
          key={`t${tech.id}`}
          at={tech.home}
          cls="home"
          color={tech.color}
          text={[...tech.name][0] ?? ''}
          label={t('map.home', { name: tech.name })}
          faded={fades(tech.id)}
          onClick={() => onSelect(tech.id)}
        />
      ))}
    </MapContainer>
  );
}
