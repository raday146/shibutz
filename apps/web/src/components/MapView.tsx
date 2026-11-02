import { Fragment, useEffect, useRef } from 'react';
import { divIcon, latLngBounds } from 'leaflet';
import type { DivIcon, Marker as LeafletMarker } from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { useLang } from '../lang';
import { MapPick } from './MapPick';
import { fromLatLng, routeVar, skillLabel, toLatLng, toLatLngs } from '../map';

export type Point = [number, number];
const CENTER: Point = [32.05, 34.85];
/** Opacity of routes and markers that do not belong to the selected technician. */
const FADED = 0.45;

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

/** While picking, takes the markers out of the Tab order (Leaflet sets tabindex when it creates them); the pick bar and the map are the only stops. */
function PickFocus({ picking }: { picking: boolean }): null {
  const map = useMap();
  useEffect(() => {
    if (!picking) return;
    const icons = (): NodeListOf<HTMLElement> => map.getContainer().querySelectorAll<HTMLElement>('.leaflet-marker-icon[tabindex]');
    icons().forEach((el) => el.setAttribute('tabindex', '-1'));
    return () => icons().forEach((el) => el.setAttribute('tabindex', '0'));
  }); // every render: markers are created and removed as the data reloads
  return null;
}

/** Reports the map's center, for the crosshair's "Use this point". */
function ReportCenter({ onCenter }: { onCenter: (at: LonLat) => void }): null {
  const map = useMapEvents({ moveend: () => onCenter(fromLatLng(map.getCenter())) });
  useEffect(() => onCenter(fromLatLng(map.getCenter())), [map, onCenter]);
  return null;
}

export interface Props {
  date: string;
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
function pinIcon(cls: string, color: number | null, text: string): DivIcon {
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
  /** Undefined is route 1; null is an inactive technician's neutral grey. */
  color?: number | null;
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
    <Marker ref={ref} position={toLatLng(at)} icon={pinIcon(cls, color, text)} opacity={faded ? FADED : 1} eventHandlers={{ click: () => onClick?.() }}>
      <Tooltip>{children ?? label}</Tooltip>
    </Marker>
  );
}

export function MapView({ date, technicians, dayJobs, skills, routes, selected, highlighted, focus, picking, at, preview, onPick, onCenter, onSelect, onSelectStop, onSelectJob }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const jobById = new Map(dayJobs.map((j) => [j.id, j]));
  const colorOf = (id: number): number | null => technicians.find((tech) => tech.id === id)?.color ?? null;
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
      <FitTo points={selected !== null ? selectedPoints : allPoints} fitKey={selected !== null ? `route${selected}|${date}|${selectedPoints.length > 0}` : 'all'} />
      <FlyTo target={focus} />
      <MapPick picking={picking} at={at} onPick={onPick} />
      <PickFocus picking={picking} />
      <ReportCenter onCenter={onCenter} />
      {drawn.map((r) => {
        if (!r.geometry) return null;
        const line = toLatLngs(r.geometry.coordinates);
        const thick = r.technicianId === selected;
        const opacity = fades(r.technicianId) ? FADED : 1;
        return (
          <Fragment key={`r${r.technicianId}`}>
            <Polyline positions={line} pathOptions={{ color: '#fff', weight: thick ? 7 : 5, opacity }} interactive={false} />
            <Polyline positions={line} pathOptions={{ weight: thick ? 3.5 : 2, opacity, className: `route-${colorOf(r.technicianId) ?? 'none'}` }} interactive={false} />
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
      {technicians.filter((tech) => tech.active || tech.id === selected).map((tech) => (
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
