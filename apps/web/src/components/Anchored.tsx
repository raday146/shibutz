import { useId, useLayoutEffect, useRef } from 'react';

/** A dashed-ident for CSS anchor positioning, unique per call site. */
export function useAnchorName(): string {
  return `--anchor-${useId().replace(/\W/g, '')}`;
}

type Props = Omit<React.ComponentProps<'div'>, 'style' | 'popover'> & { anchor: string };

/**
 * A menu or popover shown in the browser's top layer, so no ancestor's overflow can clip it, and anchored to the element that carries
 * `style={{ anchorName: anchor }}`. Placement is logical (below, starting at the anchor's inline-start edge) and flips when it does not
 * fit (see `.anchored` in style.css). `manual` leaves closing to the caller, which already handles Escape and blur.
 */
export function Anchored({ anchor, className, ref, ...rest }: Props): React.JSX.Element {
  const el = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    // Set here, not in JSX, so a browser (or jsdom) without the popover API never hides the element: it just renders in place.
    // ponytail: no positioned fallback for browsers without the popover API; add one only if an old browser matters.
    const node = el.current;
    if (!node?.showPopover) return;
    node.popover = 'manual';
    node.showPopover();
  }, []);
  const own = (node: HTMLDivElement | null): void => {
    el.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  return <div ref={own} className={['anchored', className].filter(Boolean).join(' ')} {...rest} style={{ positionAnchor: anchor }} />;
}
