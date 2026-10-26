/** The size FixedSizeObserver reports. Tests that need a bigger screen set it with
 * `observedSize`, and it goes back to desktop size with `observedSize()`. */
let size = { width: 800, height: 500 };
export function observedSize(next = { width: 800, height: 500 }) {
  size = next;
}

/** jsdom has no layout: a ResizeObserver that reports a desktop-sized box as soon as it
 * observes. Stub it with `vi.stubGlobal('ResizeObserver', FixedSizeObserver)`. */
export class FixedSizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = { target, contentRect: { ...size } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
