export interface Particle {
  id: string;
  flowId: string;
  color: string;
  path: string[]; // UIDs
  currentStep: number;
  progress: number; // 0-1 within current edge
  speed: number;
  paused: number; // remaining pause time in ms at node
}

export interface NodeHit {
  nodeId: string;
  color: string;
}

let idCounter = 0;

const PAUSE_AT_NODE_MS = 400;

export class ParticleEngine {
  particles: Particle[] = [];
  maxParticles = 50;
  nodeHits: NodeHit[] = [];

  spawn(flowId: string, color: string, speed: number, pathUids: string[]): void {
    if (pathUids.length < 2) return;
    if (this.particles.length >= this.maxParticles) return;

    this.particles.push({
      id: `p-${++idCounter}`,
      flowId,
      color,
      path: pathUids,
      currentStep: 0,
      progress: 0,
      speed,
      paused: 0,
    });

    // First node hit
    this.nodeHits.push({ nodeId: pathUids[0]!, color });
  }

  tick(deltaMs: number): void {
    this.nodeHits = [];

    for (const p of this.particles) {
      // If paused at a node, count down
      if (p.paused > 0) {
        p.paused -= deltaMs;
        if (p.paused > 0) continue;
        // Resume: advance to next step
        p.currentStep++;
        p.progress = 0;
        continue;
      }

      p.progress += deltaMs / (p.speed * 1000);

      if (p.progress >= 1) {
        // Arrived at next node — pause there
        const arrivedAt = p.path[p.currentStep + 1];
        if (arrivedAt) {
          this.nodeHits.push({ nodeId: arrivedAt, color: p.color });
        }
        p.progress = 1;
        p.paused = PAUSE_AT_NODE_MS;
      }
    }

    // Remove completed particles (past last edge and done pausing)
    this.particles = this.particles.filter((p) => {
      if (p.currentStep >= p.path.length - 1) return false;
      return true;
    });
  }

  getEdgeParticles(): Map<string, { progress: number; color: string; reverse: boolean }[]> {
    const map = new Map<string, { progress: number; color: string; reverse: boolean }[]>();
    for (const p of this.particles) {
      if (p.paused > 0) continue; // paused at node, don't render on edge
      if (p.currentStep >= p.path.length - 1) continue;

      const from = p.path[p.currentStep]!;
      const to = p.path[p.currentStep + 1]!;

      // Try forward edge first, then reverse
      const forwardId = `${from}-${to}`;
      const reverseId = `${to}-${from}`;

      // We'll try both — the renderer will check which exists in DOM
      const edgeId = forwardId;
      const reverseEdgeId = reverseId;

      if (!map.has(edgeId)) map.set(edgeId, []);
      map.get(edgeId)!.push({ progress: p.progress, color: p.color, reverse: false });

      // Also register reverse so renderer can pick whichever edge exists
      if (!map.has(reverseEdgeId)) map.set(reverseEdgeId, []);
      map.get(reverseEdgeId)!.push({ progress: p.progress, color: p.color, reverse: true });
    }
    return map;
  }

  getNodeHits(): NodeHit[] {
    return this.nodeHits;
  }

  clear(): void {
    this.particles = [];
    this.nodeHits = [];
  }

  get count(): number {
    return this.particles.length;
  }
}
