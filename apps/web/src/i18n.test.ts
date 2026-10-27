import { describe, expect, it } from 'vitest';
import { formatDay, pluralKey, sortByName, translate } from './i18n';

describe('i18n helpers', () => {
  it('fills placeholders in the active language', () => {
    expect(translate('en', 'job.ref', { id: 3 })).toBe('Job 3');
    expect(translate('he', 'job.ref', { id: 3 })).toBe('עבודה 3');
  });

  it('picks plural forms by language rules (Hebrew has a dual)', () => {
    expect(pluralKey('he', 2, 'stops')).toBe('stops.two');
    expect(pluralKey('en', 2, 'stops')).toBe('stops.other');
    expect(pluralKey('en', 1, 'stops')).toBe('stops.one');
  });

  it('formats a calendar day without a time zone shift', () => {
    expect(formatDay('en', '2026-11-02')).toBe('Monday, November 2, 2026');
  });

  it('sorts names alphabetically for the language', () => {
    expect(sortByName('he', [{ name: 'תמר' }, { name: 'אבי' }]).map((x) => x.name)).toEqual(['אבי', 'תמר']);
  });
});
