import { useRef } from 'react';
import { useLang } from '../lang';

export type Tab = 'technicians' | 'unassigned';
const TABS: Tab[] = ['technicians', 'unassigned'];

/** The left-panel switch. Arrow keys follow the visual order, so they are mirrored in right-to-left. */
export function PanelTabs({ tab, unassignedCount, onTab }: { tab: Tab; unassignedCount: number; onTab: (tab: Tab) => void }): React.JSX.Element {
  const { lang, t } = useLang();
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ technicians: null, unassigned: null });
  const label = { technicians: t('techs.title'), unassigned: `${t('kpi.unassigned')} (${unassignedCount})` };
  const onKey = (e: React.KeyboardEvent): void => {
    const forward = lang === 'he' ? 'ArrowLeft' : 'ArrowRight';
    const back = lang === 'he' ? 'ArrowRight' : 'ArrowLeft';
    const to = e.key === forward ? 'unassigned' : e.key === back ? 'technicians' : null;
    if (!to) return;
    e.preventDefault();
    onTab(to);
    refs.current[to]?.focus();
  };
  return (
    <div role="tablist" className="tabs" onKeyDown={onKey}>
      {TABS.map((id) => (
        <button
          key={id}
          ref={(el) => { refs.current[id] = el; }}
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls="tabpanel"
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onTab(id)}
        >
          {label[id]}
        </button>
      ))}
    </div>
  );
}
