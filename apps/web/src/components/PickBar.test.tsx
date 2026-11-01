import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../lang';
import { PickBar } from './PickBar';

describe('PickBar', () => {
  it('uses the crosshair point, and Escape steps back', async () => {
    localStorage.setItem('shibutz.lang', 'en');
    const onUsePoint = vi.fn();
    const onBack = vi.fn();
    render(<LangProvider><PickBar onUsePoint={onUsePoint} onBack={onBack} /></LangProvider>);
    expect(document.activeElement).toBe(screen.getByRole('group'));
    await userEvent.click(screen.getByRole('button', { name: 'Use this point' }));
    expect(onUsePoint).toHaveBeenCalledOnce();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledOnce();
  });
});
