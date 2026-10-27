import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { DaySummary } from '@shibutz/contracts';
import { App } from '../App';
import { LangProvider } from '../lang';
import { today } from '../map';

export type Routes = Record<string, unknown>;

/** Replaces `fetch` with canned JSON per API path; an unknown path is a 404 so a forgotten route fails loudly. Returns the spy. */
export function fakeApi(routes: Routes): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((path: string) =>
    Promise.resolve(
      path in routes
        ? { ok: true, status: 200, json: () => Promise.resolve(routes[path]) }
        : { ok: false, status: 404, json: () => Promise.resolve({ message: `no fake for ${path}` }) },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

export const daySummary = (date: string, over: Partial<DaySummary['totals']> = {}, technicians: DaySummary['technicians'] = []): DaySummary => ({
  date,
  totals: { total: 0, assigned: 0, unassigned: 0, done: 0, driveS: 0, ...over },
  technicians,
});

export const emptyDay: Routes = { '/technicians': [], '/jobs': [], '/skills': [], [`/days/${today()}/summary`]: daySummary(today()) };

export const renderConsole = (): ReturnType<typeof render> => render(<LangProvider><App /></LangProvider>);
