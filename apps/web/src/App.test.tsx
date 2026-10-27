import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyDay, fakeApi, renderConsole } from './test/render';

const tech = (id: number, name: string) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color: 1 });

describe('language toggle', () => {
  it('opens in Hebrew, right to left', async () => {
    fakeApi(emptyDay);
    renderConsole();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(await screen.findByRole('heading', { name: 'טכנאים' })).toBeTruthy();
  });

  it('flips direction, language and strings, and remembers the choice', async () => {
    fakeApi(emptyDay);
    const { unmount } = renderConsole();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('heading', { name: 'Technicians' })).toBeTruthy();

    unmount();
    renderConsole();
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to Hebrew and still toggles when browser storage throws', async () => {
    fakeApi(emptyDay);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderConsole();
    expect(document.documentElement.dir).toBe('rtl');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('sorts technicians by name for the active language', async () => {
    fakeApi({ ...emptyDay, '/technicians': [tech(1, 'Zed'), tech(2, 'Avi')] });
    renderConsole();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Zed|Avi/ }).map((b) => b.textContent)).toEqual(['Avi', 'Zed']));
  });
});

describe('skill names and technician colors', () => {
  const skill = (id: number, nameEn: string, nameHe: string) => ({ id, code: `s${id}`, nameEn, nameHe });
  const day = (skills: ReturnType<typeof skill>[]) => ({
    ...emptyDay,
    '/skills': skills,
    '/technicians': [{ ...tech(1, 'Dana'), skillIds: skills.map((s) => s.id), color: 4 }],
  });

  it('shows the skill name of the current language', async () => {
    fakeApi(day([skill(1, 'Plumbing', 'אינסטלציה')]));
    renderConsole();
    expect(await screen.findByText(/אינסטלציה/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByText(/Plumbing/)).toBeTruthy();
    expect(screen.queryByText(/אינסטלציה/)).toBeNull();
  });

  it('falls back to the other language when a name is empty', async () => {
    fakeApi(day([skill(1, 'Plumbing', '')]));
    renderConsole();
    expect(await screen.findByText(/Plumbing/)).toBeTruthy();
  });

  it('shows a swatch in the technician color on each technician row', async () => {
    fakeApi(day([]));
    renderConsole();
    const row = (await screen.findByRole('button', { name: /Dana/ })).closest('li');
    expect(row?.querySelector<HTMLElement>('.swatch')?.style.background).toBe('var(--route-4)');
  });
});
