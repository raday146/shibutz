import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lang';

/** Placeholder rows for a region's first load; the same height as the rows they stand in for, so nothing shifts. */
export function Skeleton({ rows = 5 }: { rows?: number }): React.JSX.Element {
  return (
    <ul className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <li key={i} />)}
    </ul>
  );
}

/** A failed region load, with Retry. */
export function RegionError({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  const { t } = useLang();
  return (
    <p role="alert" className="error">
      {t('error.region', { message })} <button onClick={onRetry}>{t('error.retry')}</button>
    </p>
  );
}

const STAY_MS = 3500;
const EXIT_MS = 140;

/** One toast: leaves after 3.5 s, with the clock paused while hovered or while the tab is hidden. */
function Toast({ text, onGone }: { text: string; onGone: () => void }): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(STAY_MS);
  useEffect(() => {
    const onVisible = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const paused = hover || hidden;
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => setLeaving(true), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onGone, EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, onGone]);
  return (
    <p className={leaving ? 'toast leaving' : 'toast'} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{text}</p>
  );
}

/** The polite live region is always mounted, so a screen reader announces text added to it. */
export function Toasts({ toast, onGone }: { toast: { id: number; text: string } | null; onGone: () => void }): React.JSX.Element {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="true" data-testid="toasts">
      {toast && <Toast key={toast.id} text={toast.text} onGone={onGone} />}
    </div>
  );
}
