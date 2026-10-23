import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { Maximize } from 'lucide-react';
import type { GraphPerson, TreeGraph } from '@/api/client';
import { Button } from '@/components/ui/button';
import { clampTransform, fitTransform, zoomRange, type Transform, type Viewport } from '@/lib/map/camera';
import { ZOOM_VAR } from '@/lib/map/frameLayout';
import { frameLayouts } from '@/lib/map/frames';
import { planRender, type PlanNode } from '@/lib/map/renderPlan';
import { cn } from '@/lib/utils';
import { FamilyFrame } from './FamilyFrame';

const FIT_MS = 300;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The zoomable map. d3-zoom handles wheel, pinch, drag and double-click/tap, and the camera
 * is written straight onto the root frame's transform. React re-renders only when zooming
 * crosses a level of detail somewhere on screen (the render plan's band), at which point
 * nested frames open or close. */
export function MapCanvas({
  graph,
  rootId,
  people,
  className,
}: {
  graph: TreeGraph;
  rootId: string;
  people: Map<string, GraphPerson>;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const bandRef = useRef<[number, number]>([0, 0]);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [plan, setPlan] = useState<PlanNode | null>(null);
  // Each frame is laid out once per root and reused while you zoom.
  const layoutOf = useMemo(() => frameLayouts(graph, rootId), [graph, rootId]);
  const rootLayout = layoutOf(rootId)!;
  const { bounds } = rootLayout;

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

  // Attach d3-zoom once per root and viewport, and open fitted.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !viewport || viewport.width === 0 || viewport.height === 0) return;
    bandRef.current = [0, 0]; // forces a fresh plan on the first transform

    const apply = (t: Transform) => {
      frameRef.current?.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
      svg.style.setProperty(ZOOM_VAR, String(t.k));
      const [lo, hi] = bandRef.current;
      if (t.k < lo || t.k >= hi) {
        const next = planRender(rootId, t.k, layoutOf);
        bandRef.current = next.band;
        setPlan(next.root);
      }
    };

    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent(zoomRange(viewport, bounds))
      .constrain((t) => {
        const c = clampTransform(t, viewport, bounds);
        return zoomIdentity.translate(c.x, c.y).scale(c.k);
      })
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => apply(event.transform));
    zoomRef.current = behaviour;

    const fit = fitTransform(viewport, bounds);
    select(svg)
      .call(behaviour)
      .call(behaviour.transform, zoomIdentity.translate(fit.x, fit.y).scale(fit.k));
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [viewport, bounds, rootId, layoutOf]);

  const fitView = () => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (!svg || !behaviour || !viewport) return;
    const fit = fitTransform(viewport, bounds);
    const target = zoomIdentity.translate(fit.x, fit.y).scale(fit.k);
    const selection = select(svg);
    if (prefersReducedMotion()) selection.call(behaviour.transform, target);
    else selection.transition().duration(FIT_MS).call(behaviour.transform, target);
  };

  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        aria-label="Family map"
        className="block size-full cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <g ref={frameRef}>
          {plan && plan.personId === rootId && (
            <FamilyFrame layout={rootLayout} node={plan} people={people} layoutOf={layoutOf} />
          )}
        </g>
      </svg>
      <Button variant="secondary" className="absolute top-3 right-3" onClick={fitView}>
        <Maximize />
        Fit
      </Button>
    </div>
  );
}
