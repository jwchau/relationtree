import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { ChevronRight, Maximize } from 'lucide-react';
import type { GraphPerson, TreeGraph } from '@/api/client';
import { Button } from '@/components/ui/button';
import { crumbs } from '@/lib/map/breadcrumb';
import { clampTransform, type Transform, type Viewport } from '@/lib/map/camera';
import { embeddedHint, embeddedZoomFilter, type EmbeddedHint } from '@/lib/map/embedded';
import {
  anchoredTransform,
  cameraForFocus,
  chipRoute,
  focusedFrame,
  focusFromParam,
  focusZoomRange,
  framePath,
  frameToRoot,
} from '@/lib/map/focus';
import { cardContentScale } from '@/lib/map/frameLayout';
import { mapModel } from '@/lib/map/model';
import { frameName } from '@/lib/map/overflow';
import { planKey, planRender, zoomCeiling, type PlanNode } from '@/lib/map/renderPlan';
import { cn } from '@/lib/utils';
import { FamilyFrame } from './FamilyFrame';
import { MapContext, type MapContextValue } from './MapContext';

const MOVE_MS = 300;
/** Below this width the breadcrumb shortens to root › … › last two. */
const NARROW_PX = 640;
/** How many frames above the focus are drawn. Higher ones are many screens wide. */
const ANCESTORS_DRAWN = 2;
/** How long the embedded map's "use Ctrl + scroll" hint stays up after the last try. */
const HINT_MS = 1500;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toD3 = (t: Transform) => zoomIdentity.translate(t.x, t.y).scale(t.k);
const sameTransform = (a: Transform, b: Transform) => a.k === b.k && a.x === b.x && a.y === b.y;
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const hintText = (hint: EmbeddedHint) =>
  hint === 'touch'
    ? 'Use two fingers to move the map'
    : `Use ${isMac() ? '⌘' : 'Ctrl'} + scroll to zoom the map`;

/** The node for a frame on the path, if the plan has it open. */
function nodeAt(root: PlanNode, path: string[]): PlanNode | null {
  let node: PlanNode | undefined = root;
  for (const id of path.slice(1)) node = node?.open.get(id);
  return node ?? null;
}

/** The zoomable map. d3-zoom keeps the camera relative to the root frame, in JavaScript's
 * double precision. The drawing is anchored a couple of frames above the focus, with that
 * frame's transform composed here, so the numbers the browser sees stay near 1 however deep
 * you zoom (design doc FG-4). React re-renders only when what's drawn changes: a level
 * crossed, a frame on or off screen, or a new focus. `embedded` is for a map inside a
 * scrolling page: the page keeps plain scrolling and one-finger swipes. */
export function MapCanvas({
  graph,
  rootId,
  people,
  initialFocus,
  onFocusChange,
  embedded = false,
  className,
}: {
  graph: TreeGraph;
  rootId: string;
  people: Map<string, GraphPerson>;
  /** The `?focus=` the map opened with; read once. */
  initialFocus?: string | null;
  onFocusChange?: (path: string[]) => void;
  embedded?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const anchorRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const cameraRef = useRef<Transform | null>(null);
  const planKeyRef = useRef('');
  const focusRef = useRef<string[] | null>(null);
  const initialFocusRef = useRef(initialFocus ?? null);
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [plan, setPlan] = useState<PlanNode | null>(null);
  const [focus, setFocus] = useState<string[]>([rootId]);
  const [hint, setHint] = useState<EmbeddedHint | null>(null);

  // Each frame is laid out once per root and reused while you zoom, and when you come back.
  const { ownership, layoutOf } = mapModel(graph, rootId);
  const rootBounds = layoutOf(rootId)!.bounds;

  const anchorPath = useMemo(() => focus.slice(0, Math.max(1, focus.length - ANCESTORS_DRAWN)), [focus]);
  const anchorM = useMemo(() => frameToRoot(anchorPath, layoutOf), [anchorPath, layoutOf]);
  const anchorId = anchorPath[anchorPath.length - 1];

  // Track the canvas size: it changes with the window and on phone rotation.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // Draws the anchored frame for a camera, and works out what should be on screen.
  const anchorMRef = useRef(anchorM);
  anchorMRef.current = anchorM;
  // The cards drawn, each with its frame's scale and the content scale last set on it.
  const cardsRef = useRef<{ el: SVGGElement; scale: number; set: number }[]>([]);
  const drawAnchored = (t: Transform) => {
    const a = anchoredTransform(t, anchorMRef.current);
    anchorRef.current?.setAttribute('transform', `translate(${a.x},${a.y}) scale(${a.k})`);
    // Cap each card's contents. Only cards whose scale changed are touched, so ordinary
    // zooming restyles a few elements, not the whole canvas.
    for (const card of cardsRef.current) {
      const s = cardContentScale(a.k, card.scale);
      if (s !== card.set) {
        card.el.style.transform = `scale(${s})`;
        card.set = s;
      }
    }
  };
  // After each render, find the cards (new ones have no scale yet), then draw: re-anchoring
  // changes the group's transform, so apply it before the browser paints.
  useLayoutEffect(() => {
    const groups = anchorRef.current?.querySelectorAll<SVGGElement>('[data-card-scale]') ?? [];
    const known = new Map(cardsRef.current.map((c) => [c.el, c]));
    cardsRef.current = Array.from(groups, (el) => {
      const scale = Number(el.dataset.cardScale);
      const old = known.get(el);
      return old && old.scale === scale ? old : { el, scale, set: NaN };
    });
    if (cameraRef.current) drawAnchored(cameraRef.current);
  });

  // Attach d3-zoom per root and viewport, and open on the focus from the URL (or the frame
  // that was in focus before a resize).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !viewport || viewport.width === 0 || viewport.height === 0) return;
    let range = focusZoomRange([rootId], layoutOf, viewport);

    const onCamera = (t: Transform) => {
      cameraRef.current = t;
      drawAnchored(t);
      const nextPlan = planRender(rootId, t, viewport, layoutOf);
      const key = planKey(nextPlan);
      const path = focusedFrame(t, viewport, rootId, layoutOf);
      const focusChanged = focusRef.current?.join(' ') !== path.join(' ');
      if (key !== planKeyRef.current || focusChanged) {
        // You may zoom as far as the focused frame or any frame open on screen allows.
        const [min, focusMax] = focusZoomRange(path, layoutOf, viewport);
        range = [min, Math.max(focusMax, zoomCeiling(nextPlan, layoutOf, viewport))];
        behaviour.scaleExtent(range);
      }
      if (key !== planKeyRef.current) {
        planKeyRef.current = key;
        setPlan(nextPlan);
      }
      if (focusChanged) {
        focusRef.current = path;
        setFocus(path);
        onFocusChangeRef.current?.(path);
      }
    };

    const behaviour = zoom<SVGSVGElement, unknown>()
      // The viewport the camera maths uses, rather than d3 measuring the SVG again.
      .extent([
        [0, 0],
        [viewport.width, viewport.height],
      ])
      .scaleExtent(range)
      .constrain((t) => {
        const c = clampTransform(t, viewport, rootBounds, range);
        return sameTransform(c, t) ? t : toD3(c);
      })
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => onCamera(event.transform));
    if (embedded) behaviour.filter(embeddedZoomFilter);
    zoomRef.current = behaviour;

    const startPath = focusRef.current ?? focusFromParam(initialFocusRef.current, ownership, layoutOf);
    focusRef.current = null; // so the first camera reports its focus
    planKeyRef.current = '';
    const start = cameraForFocus(startPath, layoutOf, viewport);
    range = focusZoomRange(startPath, layoutOf, viewport);
    behaviour.scaleExtent(range);
    select(svg).call(behaviour).call(behaviour.transform, toD3(start));
    return () => {
      select(svg).on('.zoom', null);
    };
    // drawAnchored reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, rootId, layoutOf, ownership, rootBounds, embedded]);

  // When the page takes an input meant for the map, say how to move the map instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!embedded || !svg) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (event: Event) => {
      const next = embeddedHint(event);
      if (!next) return;
      setHint(next);
      clearTimeout(timer);
      timer = setTimeout(() => setHint(null), HINT_MS);
    };
    svg.addEventListener('wheel', onInput, { passive: true });
    svg.addEventListener('touchmove', onInput, { passive: true });
    return () => {
      clearTimeout(timer);
      svg.removeEventListener('wheel', onInput);
      svg.removeEventListener('touchmove', onInput);
    };
  }, [embedded]);

  /** Animates the camera through each frame in turn, ending on the last. */
  const moveTo = (...paths: string[][]) => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (!svg || !behaviour || !viewport) return;
    // Widen the limits first so the move isn't clamped short of a deep frame.
    behaviour.scaleExtent(focusZoomRange(paths[paths.length - 1], layoutOf, viewport));
    const targets = paths.map((path) => toD3(cameraForFocus(path, layoutOf, viewport)));
    const selection = select(svg);
    if (prefersReducedMotion()) {
      selection.call(behaviour.transform, targets[targets.length - 1]);
      return;
    }
    let move = selection.transition().duration(MOVE_MS).call(behaviour.transform, targets[0]);
    for (const target of targets.slice(1)) {
      move = move.transition().duration(MOVE_MS).call(behaviour.transform, target);
    }
  };

  // A chip flies out to the nearest frame it shares with where its person is drawn, then in.
  const goToRef = useRef((personId: string) => {
    void personId;
  });
  goToRef.current = (personId: string) => {
    moveTo(...chipRoute(focusRef.current ?? [rootId], framePath(ownership, layoutOf, personId)));
  };
  const mapContext = useMemo<MapContextValue>(
    () => ({
      rootId,
      goTo: (personId) => goToRef.current(personId),
      drawnIn: (personId) => {
        const owner = ownership.get(personId)?.owner ?? null;
        return owner === null ? null : (people.get(owner)?.name ?? '?');
      },
    }),
    [rootId, ownership, people],
  );

  const nameOfFrame = (id: string) =>
    frameName(id, (personId) => people.get(personId)?.name, (frameId) => layoutOf(frameId)?.slots.length ?? 0);
  const anchorNode = plan && nodeAt(plan, anchorPath);
  const anchorLayout = layoutOf(anchorId);
  const narrow = (viewport?.width ?? 0) < NARROW_PX;

  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        aria-label="Family map"
        className={cn(
          'block size-full cursor-grab select-none active:cursor-grabbing',
          // Embedded, the browser keeps one-finger scrolling; pinches still reach d3-zoom.
          embedded ? 'touch-pan-x touch-pan-y' : 'touch-none',
        )}
      >
        <g ref={anchorRef}>
          {anchorNode && anchorLayout && (
            <MapContext.Provider value={mapContext}>
              <FamilyFrame
                layout={anchorLayout}
                node={anchorNode}
                people={people}
                layoutOf={layoutOf}
                anchorScale={anchorM.scale}
              />
            </MapContext.Provider>
          )}
        </g>
      </svg>
      {focus.length > 1 && (
        <nav aria-label="Frames above this one" className="absolute top-3 left-3 max-w-[calc(100%-7rem)]">
          <ol className="bg-surface-2/90 flex flex-wrap items-center gap-0.5 rounded-[12px] px-1.5 py-1 text-[14px] shadow-sm">
            {crumbs(focus, narrow).map((id, i, all) => (
              <li key={id ?? `gap-${i}`} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight aria-hidden className="text-muted-foreground size-3.5" />}
                {id === null ? (
                  <span className="text-muted-foreground px-1.5" aria-label="more frames">
                    …
                  </span>
                ) : i === all.length - 1 ? (
                  <span aria-current="location" className="px-1.5 font-semibold">
                    {nameOfFrame(id)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => moveTo(focus.slice(0, focus.indexOf(id) + 1))}
                    className="focus-ring hover:bg-ghost-hover min-h-9 rounded-[8px] px-1.5"
                  >
                    {nameOfFrame(id)}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {embedded && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 grid place-items-center">
          {hint && (
            <p className="bg-surface-2/90 rounded-[12px] px-4 py-2 text-[15px] font-medium shadow-sm">
              {hintText(hint)}
            </p>
          )}
        </div>
      )}
      <Button variant="secondary" className="absolute top-3 right-3" onClick={() => moveTo([rootId])}>
        <Maximize />
        Fit
      </Button>
    </div>
  );
}
