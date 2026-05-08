import fs from "fs";
import path from "path";
import type { DiscordConfig } from "../shared/types";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const CONFIG_FILE = path.join(DATA_DIR, ".dockerflow-discord.json");

const DEFAULT_CONFIG: DiscordConfig = {
  enabled: false,
  webhookUrl: "",
  events: {
    containerStateChanges: true,
    resourceAlerts: true,
    uiActions: true,
    actionErrors: true,
  },
  thresholds: {
    cpuPercent: 80,
    memPercent: 90,
  },
  cooldownMinutes: 5,
  downReminderMinutes: 5,
};

export function loadDiscordConfig(): DiscordConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULT_CONFIG, ...data, events: { ...DEFAULT_CONFIG.events, ...data.events }, thresholds: { ...DEFAULT_CONFIG.thresholds, ...data.thresholds } };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveDiscordConfig(config: DiscordConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Cooldown ──
const cooldowns = new Map<string, number>();

function isOnCooldown(key: string, cooldownMinutes: number): boolean {
  const last = cooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < cooldownMinutes * 60_000;
}

function setCooldown(key: string): void {
  cooldowns.set(key, Date.now());
}

function clearCooldown(key: string): void {
  cooldowns.delete(key);
}

// Clean stale cooldown entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of cooldowns) {
    if (now - ts > 60 * 60_000) cooldowns.delete(key);
  }
}, 30 * 60_000);

// ── Down services tracker ──
// Tracks services that are down so we can re-alert periodically
const downServices = new Map<string, number>(); // service → timestamp when it went down

/**
 * Called periodically (from stats polling interval) to re-send alerts
 * for services that are still down after the cooldown period.
 */
export function checkDownServices(config: DiscordConfig): void {
  if (!config.enabled || !config.events.containerStateChanges) return;
  const now = Date.now();
  for (const [service, downSince] of downServices) {
    const cooldownKey = `down:${service}`;
    if (!isOnCooldown(cooldownKey, config.downReminderMinutes)) {
      const downMinutes = Math.floor((now - downSince) / 60_000);
      setCooldown(cooldownKey);
      queueWebhook(config.webhookUrl, {
        username: "ContainerFlow",
        embeds: [{
          title: "Container Still Down",
          color: 0xef4444,
          description: `**${service}**\n\nDown for: \`${downMinutes} min\`\nStatus: \`offline\``,
          footer: { text: "ContainerFlow" },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  }
}

// ── Rate-limited queue ──
let lastSend = 0;
const sendQueue: Array<{ url: string; body: any; resolve: () => void }> = [];
let processing = false;

async function processSendQueue() {
  if (processing) return;
  processing = true;
  while (sendQueue.length > 0) {
    const item = sendQueue.shift()!;
    const elapsed = Date.now() - lastSend;
    if (elapsed < 500) {
      await new Promise((r) => setTimeout(r, 500 - elapsed));
    }
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      lastSend = Date.now();
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("Retry-After") || "5") * 1000;
        await new Promise((r) => setTimeout(r, retryAfter));
        // Re-queue
        sendQueue.unshift(item);
        continue;
      }
    } catch (err) {
      console.error("Discord webhook error:", err);
    }
    item.resolve();
  }
  processing = false;
}

function queueWebhook(url: string, body: any): Promise<void> {
  return new Promise((resolve) => {
    sendQueue.push({ url, body, resolve });
    processSendQueue();
  });
}

function sendEmbed(config: DiscordConfig, embed: any, cooldownKey?: string): void {
  if (!config.enabled || !config.webhookUrl) return;
  if (cooldownKey && isOnCooldown(cooldownKey, config.cooldownMinutes)) return;
  if (cooldownKey) setCooldown(cooldownKey);
  queueWebhook(config.webhookUrl, {
    username: "ContainerFlow",
    embeds: [{ ...embed, timestamp: new Date().toISOString() }],
  });
}

// ── Notification functions ──

const STATE_COLORS: Record<string, number> = {
  start: 0x22c55e,       // green
  stop: 0xef4444,        // red
  die: 0xef4444,
  restart: 0xf59e0b,     // orange
  health_status: 0xf59e0b,
  create: 0x3b82f6,      // blue
  destroy: 0xef4444,
};

const STATE_TITLES: Record<string, string> = {
  start: "Container Started",
  stop: "Container Stopped",
  die: "Container Crashed",
  restart: "Container Restarted",
  health_status: "Health Status Changed",
  create: "Container Created",
  destroy: "Container Destroyed",
};

export function notifyStateChange(service: string, action: string, config: DiscordConfig): void {
  if (!config.events.containerStateChanges) return;

  // Track down services for re-alerting
  if (action === "die" || action === "stop") {
    downServices.set(service, Date.now());
  } else if (action === "start") {
    // Service recovered — stop tracking and clear die/stop cooldowns
    downServices.delete(service);
    clearCooldown(`state:die:${service}`);
    clearCooldown(`state:stop:${service}`);
  }

  // Cooldown per action per service
  const cooldownKey = `state:${action}:${service}`;
  const title = STATE_TITLES[action] || `Container ${action}`;
  sendEmbed(config, {
    title,
    color: STATE_COLORS[action] || 0x94a3b8,
    description: `**${service}**\n\nAction: \`${action}\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey);
}

export function notifyResourceAlert(service: string, resource: "cpu" | "memory", value: number, threshold: number, config: DiscordConfig): void {
  if (!config.events.resourceAlerts) return;
  const cooldownKey = `resource:${resource}:${service}`;
  const color = value >= threshold + 10 ? 0xef4444 : 0xf59e0b;
  sendEmbed(config, {
    title: `Resource Alert — ${resource.toUpperCase()}`,
    color,
    description: `**${service}**\n\nCurrent: \`${value.toFixed(1)}%\`\nThreshold: \`${threshold}%\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey);
}

export function notifyUIAction(service: string, action: string, config: DiscordConfig): void {
  if (!config.events.uiActions) return;
  const cooldownKey = `ui:${action}:${service}`;
  sendEmbed(config, {
    title: "Manual Action",
    color: 0x3b82f6,
    description: `**${service}**\n\nAction: \`${action}\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey);
}

export function notifyActionError(service: string, action: string, error: string, config: DiscordConfig): void {
  if (!config.events.actionErrors) return;
  const cooldownKey = `error:${action}:${service}`;
  const truncated = error.length > 1000 ? error.slice(0, 1000) + "..." : error;
  sendEmbed(config, {
    title: `Action Failed — ${action}`,
    color: 0xef4444,
    description: `**${service}**\n\n\`\`\`\n${truncated}\n\`\`\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey);
}

export async function testWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ContainerFlow",
        embeds: [{
          title: "Test Notification",
          description: "ContainerFlow Discord integration is working!",
          color: 0x22c55e,
          footer: { text: "ContainerFlow" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (res.status === 429) {
      return { ok: false, error: "Rate limited by Discord. Try again shortly." };
    }
    if (!res.ok) {
      return { ok: false, error: `Discord returned status ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send webhook" };
  }
}
