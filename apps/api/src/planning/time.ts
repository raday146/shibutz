// Solver/heuristic time scale: integer *elapsed* seconds since local midnight (Asia/Jerusalem)
// of the plan date. Elapsed (not wall-clock) keeps `departure + travel` exact on DST days.
const format = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Local UTC offset in ms at the given instant. */
function offsetMs(ms: number): number {
  const p = Object.fromEntries(format.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  const local = Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day, p.hour, p.minute, p.second);
  return local - Math.floor(ms / 1000) * 1000;
}

/** The instant of a local wall-clock time (`HH:MM:SS`) on a local date (`YYYY-MM-DD`). */
function localInstantMs(date: string, time: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  return guess - offsetMs(guess - offsetMs(guess));
}

export function toDaySeconds(instant: Date, date: string): number {
  return Math.round((instant.getTime() - localInstantMs(date, '00:00:00')) / 1000);
}

export function fromDaySeconds(seconds: number, date: string): Date {
  return new Date(localInstantMs(date, '00:00:00') + seconds * 1000);
}

/** A daily local time (technician shift) as seconds since local midnight of `date`. */
export function wallClockDaySeconds(time: string, date: string): number {
  return Math.round((localInstantMs(date, time) - localInstantMs(date, '00:00:00')) / 1000);
}
