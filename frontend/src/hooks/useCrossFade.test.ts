// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCrossFade } from './useCrossFade';

let reducedMotion = false;
beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCrossFade', () => {
  it('shows only the current key at first', () => {
    const { result } = renderHook(() => useCrossFade('A', 300));
    expect(result.current).toEqual([{ key: 'A', leaving: false }]);
  });

  it('keeps the old key, leaving, under the new one while they fade', () => {
    const { result, rerender } = renderHook(({ key }) => useCrossFade(key, 300), {
      initialProps: { key: 'A' },
    });
    rerender({ key: 'B' });
    expect(result.current).toEqual([
      { key: 'A', leaving: true },
      { key: 'B', leaving: false },
    ]);
  });

  it('drops the old key once the fade is over', () => {
    const { result, rerender } = renderHook(({ key }) => useCrossFade(key, 300), {
      initialProps: { key: 'A' },
    });
    rerender({ key: 'B' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([{ key: 'B', leaving: false }]);
  });

  it('swaps at once with reduced motion', () => {
    reducedMotion = true;
    const { result, rerender } = renderHook(({ key }) => useCrossFade(key, 300), {
      initialProps: { key: 'A' },
    });
    rerender({ key: 'B' });
    expect(result.current).toEqual([{ key: 'B', leaving: false }]);
  });

  it('fades only the latest change when keys change quickly', () => {
    const { result, rerender } = renderHook(({ key }) => useCrossFade(key, 300), {
      initialProps: { key: 'A' },
    });
    rerender({ key: 'B' });
    rerender({ key: 'C' });
    expect(result.current).toEqual([
      { key: 'B', leaving: true },
      { key: 'C', leaving: false },
    ]);
  });
});
