import { describe, expect, it } from 'vitest';
import type { Key } from './i18n';
import { dictionaries, formatDay, pluralKey, sortByName, translate } from './i18n';

describe('number and unit order', () => {
  // Hebrew copy puts the number first ("45 דק׳"), the same as English ("45 min"); a unit before the placeholder reads reversed.
  it('never puts a duration unit before its number in a copy key', () => {
    for (const [key, text] of Object.entries(dictionaries.he)) expect(text, key).not.toMatch(/דק׳\s*\{/);
    for (const [key, text] of Object.entries(dictionaries.en)) expect(text, key).not.toMatch(/\bmin\b\s*\{/);
  });
});

describe('gender-safe copy', () => {
  // DESIGN.md: no message that includes a person's name may use a verb or adjective that agrees with the name.
  // Whole words only, so the neutral plural "עודכנו" (details were updated) is not caught by "עודכן". Extend the list as the deck grows.
  const hebrew = ['הושבת', 'הושבתה', 'נוסף', 'נוספה', 'עודכן', 'עודכנה', 'הופעל', 'הופעלה', 'נוצר', 'נוצרה', 'נשמר', 'נשמרה', 'שונה', 'נמחק', 'נמחקה', 'הוסר', 'הוסרה'];
  const hebrewWord = new RegExp(`(?<![\\u0590-\\u05FF])(${hebrew.join('|')})(?![\\u0590-\\u05FF])`);
  const english = /\b(he|she|his|her|hers|him|himself|herself)\b/i;

  it('has no gendered verb, adjective or pronoun in any message that contains {name}', () => {
    const named = (Object.keys(dictionaries.he) as Key[]).filter((k) => dictionaries.he[k].includes('{name}') || dictionaries.en[k].includes('{name}'));
    expect(named.length).toBeGreaterThan(0);
    for (const k of named) {
      expect(dictionaries.he[k], k).not.toMatch(hebrewWord);
      expect(dictionaries.en[k], k).not.toMatch(english);
    }
  });

  it('catches a gendered form (the guard itself works)', () => {
    expect('הטכנאי הושבת: {name}').toMatch(hebrewWord);
    expect('הפרטים של {name} עודכנו').not.toMatch(hebrewWord);
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
