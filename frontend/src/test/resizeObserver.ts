/** jsdom has no layout: a ResizeObserver that reports a desktop-sized box as soon as it
 * observes. Stub it with `vi.stubGlobal('ResizeObserver', FixedSizeObserver)`. */
export class FixedSizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = { target, contentRect: { width: 800, height: 500 } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
