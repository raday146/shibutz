import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Web component test seam: the real console runs against a fake fetch (see render.tsx) and the map is stubbed, since jsdom has no layout.
vi.mock('../components/MapView', () => ({ MapView: () => null }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
