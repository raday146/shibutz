import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom';

type Props = Omit<React.ComponentProps<'div'>, 'style'> & {
  /** The element the menu hangs from. It keeps focus handling: Escape returns focus to it. */
  trigger: React.RefObject<HTMLElement | null>;
  /** Escape or a press outside both the menu and the trigger. */
  onClose: () => void;
};

/**
 * A menu or popover in a portal on <body>, so no ancestor's overflow can clip it, placed with Floating UI: below the trigger,
 * aligned to its inline-start edge (it follows the document direction), flipping to the other side or above and shifting
 * to stay inside the viewport. Escape closes it from anywhere, before any other Escape handler, and returns focus to the trigger.
 */
export function Anchored({ trigger, onClose, ref, className, ...rest }: Props): React.JSX.Element {
  // Until the first position is computed the menu waits off screen, still measurable and still in the accessibility tree.
  const { refs, floatingStyles, isPositioned } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false, // top/left, so the menu's own scale-in animation can use transform
    elements: { reference: trigger.current },
    middleware: [offset(4), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // only the topmost layer closes
      onClose();
      trigger.current?.focus();
    };
    const onPress = (e: PointerEvent): void => {
      const at = e.target as Node;
      if (!refs.floating.current?.contains(at) && !trigger.current?.contains(at)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [onClose, refs.floating, trigger]);

  const own = (node: HTMLDivElement | null): void => {
    refs.setFloating(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  return createPortal(
    <div ref={own} className={['anchored', className].filter(Boolean).join(' ')} {...rest} style={isPositioned ? floatingStyles : { ...floatingStyles, left: -9999 }} />,
    document.body,
  );
}
