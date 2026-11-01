import { useEffect, useState } from 'react';
import type { Skill, Technician, TechnicianChange, TechnicianChangeFields } from '@shibutz/contracts';
import { fetchTechnicianChanges } from '../api';
import type { Key } from '../i18n';
import { useLang, withLtrNumbers } from '../lang';
import { formatLatLon, skillLabel } from '../map';

interface Props {
  skills: Skill[];
  /** Limits the log to this technician's history; without it, the latest `limit` changes of everyone. */
  technicianId?: number;
  limit?: number;
  /** The loaded roster: a change is logged with a technician save, which bumps a version or adds a row, so a changed roster means refetch. */
  roster: Technician[];
  title: Key;
}

const hhmm = (time: string): string => time.slice(0, 5);

/** The change log: one line per row with the action, the name as it was then, and for an update what changed. */
export function ChangeLog({ skills, technicianId, limit, roster, title }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const [changes, setChanges] = useState<TechnicianChange[] | null>(null);
  // Every logged change bumps a version or adds a technician, so unrelated reloads leave this unchanged.
  const rosterKey = roster.map((x) => `${x.id}:${x.version}`).join();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    fetchTechnicianChanges({ technicianId, limit }).then(
      (c) => { if (current) { setChanges(c); setFailed(null); } },
      (e: unknown) => { if (current) setFailed(e instanceof Error ? e.message : String(e)); },
    );
    return () => { current = false; };
  }, [technicianId, limit, rosterKey]);

  /** "Name: Dana → Dani" for each changed field. */
  const fields = (c: TechnicianChange): string => {
    const before: TechnicianChangeFields = c.before ?? {};
    const after: TechnicianChangeFields = c.after ?? {};
    const line = (field: Key, was: string, now: string): string => t('review.change', { field: t(field), before: was, after: now });
    const skillsOf = (ids: number[]): string => skillLabel(ids, skills, lang) || t('tech.noSkills');
    return [
      after.name !== undefined && line('tech.field.name', before.name ?? '', after.name),
      after.shiftStart !== undefined && line('tech.field.shift.from', hhmm(before.shiftStart ?? ''), hhmm(after.shiftStart)),
      after.shiftEnd !== undefined && line('tech.field.shift.to', hhmm(before.shiftEnd ?? ''), hhmm(after.shiftEnd)),
      after.skillIds !== undefined && line('tech.field.skills', skillsOf(before.skillIds ?? []), skillsOf(after.skillIds)),
      after.home !== undefined && line('tech.field.home', before.home ? formatLatLon(before.home) : '', formatLatLon(after.home)),
    ].filter(Boolean).join('; ');
  };
  const when = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section className="change-log">
      <h3>{t(title)}</h3>
      {failed ? (
        <p className="error" role="alert">{t('error.region', { message: failed })}</p>
      ) : changes === null ? null : changes.length === 0 ? (
        <p className="muted">{t('changes.empty')}</p>
      ) : (
        <ul aria-label={t(title)}>
          {changes.map((c) => (
            <li key={c.id}>
              <span dir="auto">{withLtrNumbers(t(`changes.${c.action}`, { name: c.name, fields: fields(c) }))}</span>{' '}
              <time className="muted" dateTime={c.at}>{when.format(new Date(c.at))}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
