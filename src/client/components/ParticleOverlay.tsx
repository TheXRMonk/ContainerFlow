import { useEffect, useRef, useCallback } from "react";
import type { ParticleEngine } from "../engine/particles";
import type { FlowSettings } from "../../shared/types";

interface ParticleOverlayProps {
  engine: ParticleEngine;
  settings: FlowSettings;
  onNodeHits?: (hits: { nodeId: string; color: string }[]) => void;
}

export function ParticleOverlay({ engine, settings, onNodeHits }: ParticleOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  // Cache edge path lookups to avoid querying DOM every frame
  const pathCache = useRef<Map<string, SVGPathElement | null>>(new Map());

  const findEdgePath = useCallback((edgeId: string): SVGPathElement | null => {
    if (pathCache.current.has(edgeId)) return pathCache.current.get(edgeId)!;
    const el = document.querySelector(`[data-testid="rf__edge-${edgeId}"]`);
    const pathEl = (el?.querySelector(".react-flow__edge-path") as SVGPathElement) || null;
    pathCache.current.set(edgeId, pathEl);
    // Invalidate cache after a bit in case edges re-render
    setTimeout(() => pathCache.current.delete(edgeId), 2000);
    return pathEl;
  }, []);

  const loop = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const delta = Math.min(timestamp - lastTimeRef.current, 100);
    lastTimeRef.current = timestamp;

    engine.tick(delta);

    // Notify node hits
    const hits = engine.getNodeHits();
    if (hits.length > 0 && onNodeHits) {
      onNodeHits(hits);
    }

    const svg = svgRef.current;
    if (!svg) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // Clear previous particles (keep <defs>)
    const defs = svg.firstChild;
    while (svg.lastChild && svg.lastChild !== defs) {
      svg.removeChild(svg.lastChild);
    }

    const edgeParticles = engine.getEdgeParticles();
    if (edgeParticles.size === 0) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const size = settings.particle_size;
    const svgCTM = svg.getScreenCTM();
    if (!svgCTM) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const svgCTMInverse = svgCTM.inverse();

    // Track which edges we already rendered particles for (avoid duplicates from forward+reverse)
    const rendered = new Set<string>();

    for (const [edgeId, pList] of edgeParticles) {
      const pathEl = findEdgePath(edgeId);
      if (!pathEl) continue;

      const pathCTM = pathEl.getScreenCTM();
      if (!pathCTM) continue;

      const totalLength = pathEl.getTotalLength();

      for (const p of pList) {
        // Unique key to avoid rendering same particle twice (forward+reverse entries)
        const particleKey = `${p.color}-${p.progress.toFixed(4)}-${p.reverse}`;
        if (rendered.has(particleKey)) continue;
        rendered.add(particleKey);

        // If reverse, traverse path backwards
        const t = p.reverse ? (1 - p.progress) : p.progress;
        const point = pathEl.getPointAtLength(t * totalLength);

        // Convert: path-local → screen → our SVG coords
        const screenX = pathCTM.a * point.x + pathCTM.c * point.y + pathCTM.e;
        const screenY = pathCTM.b * point.x + pathCTM.d * point.y + pathCTM.f;
        const x = svgCTMInverse.a * screenX + svgCTMInverse.c * screenY + svgCTMInverse.e;
        const y = svgCTMInverse.b * screenX + svgCTMInverse.d * screenY + svgCTMInverse.f;

        // Outer glow
        if (settings.trail) {
          const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          glow.setAttribute("cx", String(x));
          glow.setAttribute("cy", String(y));
          glow.setAttribute("r", String(size * 2.5));
          glow.setAttribute("fill", p.color);
          glow.setAttribute("opacity", String(settings.trail_opacity * 0.25));
          svg.appendChild(glow);
        }

        // Main circle
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", String(size));
        circle.setAttribute("fill", p.color);
        if (settings.glow) {
          circle.setAttribute("filter", "url(#particle-glow)");
        }
        svg.appendChild(circle);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [engine, settings, onNodeHits, findEdgePath]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
        overflow: "visible",
      }}
    >
      <defs>
        <filter id="particle-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
