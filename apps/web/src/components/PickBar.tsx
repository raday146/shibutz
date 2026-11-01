import { useEffect, useRef } from 'react';
import { useLang } from '../lang';

interface Props {
  /** Takes the point under the map's center crosshair. */
  onUsePoint: () => void;
  onBack: () => void;
}

/** The bar shown while a map-pick waits for a point; knows nothing about what is being placed. */
export function PickBar({ onUsePoint, onBack }: Props): React.JSX.Element {
  const { t } = useLang();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => bar.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') return onBack();
      if (e.key !== 'Tab') return;
      // The bar and the map form a two-stop loop, so a keyboard user can pan the map (arrow keys) and come back to "Use this point"
      // without tabbing through every marker.
      const map = document.querySelector<HTMLElement>('.leaflet-container');
      const buttons = [...(bar.current?.querySelectorAll('button') ?? [])];
      const at = document.activeElement;
      if (at === map && !e.shiftKey) buttons[0]?.focus();
      else if (e.shiftKey ? at === buttons[0] || at === bar.current : at === buttons[buttons.length - 1]) map?.focus();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <div ref={bar} tabIndex={-1} role="group" aria-label={t('location.label')} className="pickbar">
      <span>{t('location.picking')}</span>
      <button onClick={onUsePoint}>{t('location.use')}</button>
      <button onClick={onBack}>{t('location.back')}</button>
    </div>
  );
}
