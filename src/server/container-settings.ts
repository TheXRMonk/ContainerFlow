import fs from "fs";
import path from "path";
import type { ContainerSettings } from "../shared/types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, ".dockerflow-container-settings.json");

export function loadContainerSettings(): Record<string, ContainerSettings> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

export function saveContainerSettings(settings: Record<string, ContainerSettings>): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
