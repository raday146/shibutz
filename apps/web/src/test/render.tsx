import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../App';
import { LangProvider } from '../lang';

export type Routes = Record<string, unknown>;

/** Replaces `fetch` with canned JSON per API path; an unknown path is a 404 so a forgotten route fails loudly. */
export function fakeApi(routes: Routes): void {
  vi.stubGlobal('fetch', (path: string) =>
    Promise.resolve(
      path in routes
        ? { ok: true, status: 200, json: () => Promise.resolve(routes[path]) }
        : { ok: false, status: 404, json: () => Promise.resolve({ message: `no fake for ${path}` }) },
    ),
  );
}

export const emptyDay: Routes = { '/technicians': [], '/jobs': [], '/skills': [] };

export const renderConsole = (): ReturnType<typeof render> => render(<LangProvider><App /></LangProvider>);
