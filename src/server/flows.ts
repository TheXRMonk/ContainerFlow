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

function saveFlows(): void {
  const filePath = path.join(process.cwd(), "flows.yaml");
  const data: Record<string, any> = {};

  if (flows.length > 0) {
    data.flows = {};
    for (const f of flows) {
      data.flows[f.id] = {
        name: f.name,
        ...(f.description ? { description: f.description } : {}),
        color: f.color,
        speed: f.speed,
        path: f.path,
      };
    }
  }

  // Only write settings if they differ from defaults
  const hasCustomSettings = Object.entries(settings).some(
    ([k, v]) => DEFAULT_SETTINGS[k as keyof FlowSettings] !== v,
  );
  if (hasCustomSettings) {
    data.settings = settings;
  }

  fs.writeFileSync(filePath, yaml.stringify(data), "utf-8");
}

export function addFlow(flow: Flow): void {
  if (flows.some((f) => f.id === flow.id)) {
    throw new Error(`Flow "${flow.id}" already exists`);
  }
  flows.push(flow);
  saveFlows();
}

export function updateFlow(id: string, partial: Partial<Omit<Flow, "id">>): Flow {
  const idx = flows.findIndex((f) => f.id === id);
  if (idx === -1) {
    throw new Error(`Flow "${id}" not found`);
  }
  flows[idx] = { ...flows[idx], ...partial, id };
  saveFlows();
  return flows[idx];
}

export function deleteFlow(id: string): void {
  const idx = flows.findIndex((f) => f.id === id);
  if (idx === -1) {
    throw new Error(`Flow "${id}" not found`);
  }
  flows.splice(idx, 1);
  saveFlows();
}
