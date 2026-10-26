import { afterEach } from 'vitest';

// Component tests only: node tests have no document to clean up.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
