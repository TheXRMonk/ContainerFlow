#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import os from "os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const MCP_ENTRY_PATH = path.resolve(path.join(import.meta.dir, "../src/server/mcp.ts"));

// Ensure ~/.claude exists
const claudeDir = path.dirname(SETTINGS_PATH);
if (!fs.existsSync(claudeDir)) {
  fs.mkdirSync(claudeDir, { recursive: true });
}

// Read or create settings
let settings: Record<string, any> = {};
if (fs.existsSync(SETTINGS_PATH)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
}

// Add MCP server
if (!settings.mcpServers) settings.mcpServers = {};

if (settings.mcpServers.dockerflow) {
  console.log("DockerFlow MCP server already configured. Updating path...");
}

settings.mcpServers.dockerflow = {
  command: "bun",
  args: [MCP_ENTRY_PATH],
};

fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");

console.log(`DockerFlow MCP server installed globally.`);
console.log(`  → ${SETTINGS_PATH}`);
console.log(`  → Entry: ${MCP_ENTRY_PATH}`);
console.log(`\nReinicia Claude Code para activarlo.`);
