import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

class ResizeObserverMock {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
