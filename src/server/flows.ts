import fs from "fs";
import path from "path";
import yaml from "yaml";
import type { Flow, FlowSettings } from "../shared/types";

const DEFAULT_SETTINGS: FlowSettings = {
  particle_size: 5,
  trail: true,
  trail_opacity: 0.3,
  glow: true,
  max_particles: 50,
};

let flows: Flow[] = [];
let settings: FlowSettings = { ...DEFAULT_SETTINGS };

export function loadFlows(): void {
  const filePath = path.join(process.cwd(), "flows.yaml");
  if (!fs.existsSync(filePath)) {
    flows = [];
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  try {
    const raw = yaml.parse(fs.readFileSync(filePath, "utf-8"));
    if (raw?.flows) {
      flows = Object.entries(raw.flows).map(([id, def]: [string, any]) => ({
        id,
        name: def.name || id,
        description: def.description || "",
        color: def.color || "#3b82f6",
        speed: def.speed ?? 0.8,
        path: def.path || [],
      }));
    }
    if (raw?.settings) {
      settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    }
  } catch (err) {
    console.error("Failed to parse flows.yaml:", err);
    flows = [];
    settings = { ...DEFAULT_SETTINGS };
  }
}

export function getFlows(): Flow[] {
  return flows;
}

export function getSettings(): FlowSettings {
  return settings;
}
