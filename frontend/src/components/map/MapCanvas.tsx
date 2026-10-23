import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { Maximize } from 'lucide-react';
import type { GraphPerson } from '@/api/client';
import { Button } from '@/components/ui/button';
import { clampTransform, fitTransform, zoomRange, type Transform, type Viewport } from '@/lib/map/camera';
import { detailFor, type Detail } from '@/lib/map/detail';
import type { FamilyCore } from '@/lib/map/familyCore';
import { cn } from '@/lib/utils';
import { CARD_MAX_PX, CARD_SCALE_VAR, frameLayout, SLOT_W } from '@/lib/map/frameLayout';
import { FamilyFrame } from './FamilyFrame';

const FIT_MS = 300;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The zoomable map. d3-zoom handles wheel, pinch, drag and double-click/tap, and the camera
 * is written straight onto the frame's transform, so React only re-renders when the level of
 * detail changes. */
export function MapCanvas({
  core,
  people,
  className,
}: {
  core: FamilyCore;
  people: Map<string, GraphPerson>;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [detail, setDetail] = useState<Detail>('name');
  const layout = useMemo(() => frameLayout(core), [core]);
  const { bounds } = layout;

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

  // Attach d3-zoom once per frame and viewport, and open fitted.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !viewport || viewport.width === 0 || viewport.height === 0) return;

    const apply = (t: Transform) => {
      frameRef.current?.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
      const slotPx = SLOT_W * t.k;
      svg.style.setProperty(CARD_SCALE_VAR, String(Math.min(1, CARD_MAX_PX / slotPx)));
      const next = detailFor(slotPx);
      setDetail((prev) => (prev === next ? prev : next));
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
  }, [viewport, bounds]);

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

  const centre = people.get(core.self);
  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        role="group"
        aria-label={centre ? `Family of ${centre.name}` : 'Family'}
        className="block size-full cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <g ref={frameRef}>
          {viewport && <FamilyFrame layout={layout} people={people} detail={detail} />}
        </g>
      </svg>
      <Button variant="secondary" className="absolute top-3 right-3" onClick={fitView}>
        <Maximize />
        Fit
      </Button>
    </div>
  );
}
