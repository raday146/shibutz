import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate } from './i18n';
import type { Key, Lang, Vars } from './i18n';

const STORAGE_KEY = 'shibutz.lang';

/** Browser storage can be blocked or absent; the language then lasts for the session only. */
function stored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

interface LangValue {
  lang: Lang;
  t: (key: Key, vars?: Vars) => string;
  toggle: () => void;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLang] = useState<Lang>(stored);

  // <html lang dir> follows the language; the map keeps its own direction in CSS.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  const toggle = useCallback(() => {
    setLang((l) => {
      const next: Lang = l === 'he' ? 'en' : 'he';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage unavailable: the choice is not remembered
      }
      return next;
    });
  }, []);

  const value = useMemo<LangValue>(() => ({ lang, toggle, t: (key, vars) => translate(lang, key, vars) }), [lang, toggle]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const value = useContext(LangContext);
  if (!value) throw new Error('useLang outside LangProvider');
  return value;
}

/** Times and ranges read left to right inside right-to-left text. */
export function Ltr({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <bdi dir="ltr">{children}</bdi>;
}

/**
 * Isolates every number in a translated string as its own left-to-right unit: times and ranges (08:00–16:00), counts and
 * fractions (3/7), durations (45). The words around it, units included ("דק׳"), stay in the sentence's own direction, so
 * "45 דק׳" reads number first in Hebrew. Never wrap a whole translated string in <Ltr>: that flips the unit before the number.
 */
export function withLtrNumbers(text: string): React.ReactNode[] {
  return text.split(/(\d\d:\d\d(?:–\d\d:\d\d)?|\d+(?:[/.]\d+)*)/).map((part, i) => (i % 2 ? <Ltr key={i}>{part}</Ltr> : part));
}
