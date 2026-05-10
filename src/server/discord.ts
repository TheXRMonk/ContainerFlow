import fs from "fs";
import path from "path";
import type { DiscordConfig } from "../shared/types";
import { insertNotification, type NotificationLogEntry } from "./events-db";

// External listener (set by index.ts) so we can broadcast new notifications via WS
let onNotificationLogged: ((entry: NotificationLogEntry) => void) | null = null;
export function setNotificationListener(fn: typeof onNotificationLogged) {
  onNotificationLogged = fn;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
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
    cpuPercent: 50,
    memPercent: 60,
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
  if (!config.events.containerStateChanges) return;
  const now = Date.now();
  for (const [service, downSince] of downServices) {
    // Skip services that are still in debounce window (might be restarting)
    if (pendingDown.has(service)) continue;
    const downMinutes = Math.floor((now - downSince) / 60_000);
    // Don't send "Still Down" for less than 1 minute
    if (downMinutes < 1) continue;
    const cooldownKey = `down:${service}`;
    sendEmbed(config, {
      title: "Container Still Down",
      color: 0xef4444,
      description: `**${service}**\n\nDown for: \`${downMinutes} min\`\nStatus: \`offline\``,
      footer: { text: "ContainerFlow" },
    }, cooldownKey, { type: "state_change", service });
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

/** Map embed color to notification level for in-app log */
function colorToLevel(color: number): NotificationLogEntry["level"] {
  if (color === 0xef4444) return "error";      // red
  if (color === 0xf59e0b) return "warning";    // amber
  if (color === 0x22c55e) return "info";       // green
  if (color === 0x3b82f6) return "info";       // blue
  return "info";
}

function sendEmbed(
  config: DiscordConfig,
  embed: any,
  cooldownKey?: string,
  meta?: { type: NotificationLogEntry["type"]; service: string },
): void {
  if (cooldownKey && isOnCooldown(cooldownKey, config.cooldownMinutes)) return;
  if (cooldownKey) setCooldown(cooldownKey);

  // Always log to in-app notifications (regardless of Discord webhook config)
  if (meta) {
    try {
      const entry = insertNotification(
        meta.type,
        meta.service,
        colorToLevel(embed.color),
        embed.title || "Notification",
        embed.description || "",
      );
      if (entry && onNotificationLogged) onNotificationLogged(entry);
    } catch {}
  }

  // Send to Discord only if enabled + configured
  if (!config.enabled || !config.webhookUrl) return;
  queueWebhook(config.webhookUrl, {
    username: "ContainerFlow",
    embeds: [{ ...embed, timestamp: new Date().toISOString() }],
  });
}

// ── Notification functions ──

const STATE_DEBOUNCE_MS = 15_000; // Wait 15s before notifying stop/die to detect restarts

// Pending stop/die events waiting to be flushed or cancelled
const pendingDown = new Map<string, { action: string; timer: ReturnType<typeof setTimeout>; config: DiscordConfig }>();

function flushPendingDown(service: string): void {
  const pending = pendingDown.get(service);
  if (!pending) return;
  pendingDown.delete(service);
  clearTimeout(pending.timer);

  const { action, config } = pending;

  // Now we know it's a real stop/crash (no start followed within the debounce window)
  downServices.set(service, Date.now());
  // Set cooldown for down reminders so the first "Still Down" doesn't fire immediately
  setCooldown(`down:${service}`);

  const cooldownKey = `state:${action}:${service}`;
  const title = action === "die" ? "Container Crashed" : "Container Stopped";
  sendEmbed(config, {
    title,
    color: 0xef4444,
    description: `**${service}**\n\nAction: \`${action}\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey, { type: "state_change", service });
}

function cancelPendingDown(service: string): void {
  const pending = pendingDown.get(service);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDown.delete(service);
  }
}

export function notifyStateChange(service: string, action: string, config: DiscordConfig): void {
  if (!config.events.containerStateChanges) return;

  // Ignore create/destroy — they're internal Docker lifecycle noise
  if (action === "create" || action === "destroy") return;

  if (action === "die" || action === "stop") {
    // Don't notify immediately — buffer to detect restart sequences
    // If there's already a pending event for this service, keep the first one
    if (pendingDown.has(service)) return;
    const timer = setTimeout(() => flushPendingDown(service), STATE_DEBOUNCE_MS);
    pendingDown.set(service, { action, timer, config });
    return;
  }

  if (action === "start") {
    const wasPending = pendingDown.has(service);
    cancelPendingDown(service);

    // Service recovered — stop tracking and clear cooldowns
    downServices.delete(service);
    clearCooldown(`state:die:${service}`);
    clearCooldown(`state:stop:${service}`);

    if (wasPending) {
      // stop/die → start within debounce window = restart/redeploy, send single message
      const cooldownKey = `state:restart:${service}`;
      sendEmbed(config, {
        title: "Container Restarted",
        color: 0xf59e0b,
        description: `**${service}**\n\nAction: \`redeployed\``,
        footer: { text: "ContainerFlow" },
      }, cooldownKey, { type: "state_change", service });
    } else {
      // Fresh start (no preceding stop/die)
      const cooldownKey = `state:start:${service}`;
      sendEmbed(config, {
        title: "Container Started",
        color: 0x22c55e,
        description: `**${service}**\n\nAction: \`start\``,
        footer: { text: "ContainerFlow" },
      }, cooldownKey, { type: "state_change", service });
    }
    return;
  }

  // Other events (restart, health_status)
  const titles: Record<string, string> = {
    restart: "Container Restarted",
    health_status: "Health Status Changed",
  };
  const colors: Record<string, number> = {
    restart: 0xf59e0b,
    health_status: 0xf59e0b,
  };
  const cooldownKey = `state:${action}:${service}`;
  sendEmbed(config, {
    title: titles[action] || `Container ${action}`,
    color: colors[action] || 0x94a3b8,
    description: `**${service}**\n\nAction: \`${action}\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey, { type: "state_change", service });
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
  }, cooldownKey, { type: "resource_alert", service });
}

export function notifyUIAction(service: string, action: string, config: DiscordConfig): void {
  if (!config.events.uiActions) return;
  const cooldownKey = `ui:${action}:${service}`;
  sendEmbed(config, {
    title: "Manual Action",
    color: 0x3b82f6,
    description: `**${service}**\n\nAction: \`${action}\``,
    footer: { text: "ContainerFlow" },
  }, cooldownKey, { type: "ui_action", service });
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
  }, cooldownKey, { type: "action_error", service });
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
