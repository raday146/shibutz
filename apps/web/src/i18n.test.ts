import { describe, expect, it } from 'vitest';
import { dictionaries, formatDay, pluralKey, sortByName, translate } from './i18n';

describe('number and unit order', () => {
  // Hebrew copy puts the number first ("45 דק׳"), the same as English ("45 min"); a unit before the placeholder reads reversed.
  it('never puts a duration unit before its number in a copy key', () => {
    for (const [key, text] of Object.entries(dictionaries.he)) expect(text, key).not.toMatch(/דק׳\s*\{/);
    for (const [key, text] of Object.entries(dictionaries.en)) expect(text, key).not.toMatch(/\bmin\b\s*\{/);
  });
});

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
