import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.requestTime = Date.now();
  next();
});

const ENV_SMARTTHINGS_TOKEN = process.env.SMARTTHINGS_TOKEN;
const PORT = process.env.PORT || 3001;
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "activity.log");
const DATA_DIR = path.join(__dirname, "data");
const USER_FILE = path.join(DATA_DIR, "user.json");
const KEY_FILE = path.join(DATA_DIR, "secret.key");
const INTEGRATION_FILE = path.join(DATA_DIR, "integrations.json");
const ROUTINE_FILE = path.join(DATA_DIR, "routines.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 Tage
const DEFAULT_ROUTINE_CHECK_INTERVAL_MS = 30 * 1000; // 30 Sekunden
const MAX_ACTIONS_PER_ROUTINE = 20;

async function ensureLogFile() {
  try {
    await fsPromises.mkdir(LOG_DIR, { recursive: true });
    if (!fs.existsSync(LOG_FILE)) {
      await fsPromises.writeFile(LOG_FILE, "", "utf8");
    }
  } catch (err) {
    console.error("❌ Failed to create log file:", err);
  }
}

async function ensureUserFile() {
  try {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USER_FILE)) {
      await fsPromises.writeFile(USER_FILE, "", "utf8");
    }
    if (!fs.existsSync(INTEGRATION_FILE)) {
      await fsPromises.writeFile(INTEGRATION_FILE, JSON.stringify({ smartthings: { entries: [] } }, null, 2), "utf8");
    }
    if (!fs.existsSync(KEY_FILE)) {
      const key = crypto.randomBytes(32);
      await fsPromises.writeFile(KEY_FILE, key.toString("hex"), "utf8");
    }
    if (!fs.existsSync(ROUTINE_FILE)) {
      await fsPromises.writeFile(ROUTINE_FILE, JSON.stringify({ routines: [] }, null, 2), "utf8");
    } else {
      const stats = await fsPromises.stat(ROUTINE_FILE);
      if (stats.size === 0) {
        await fsPromises.writeFile(ROUTINE_FILE, JSON.stringify({ routines: [] }, null, 2), "utf8");
      }
    }
    if (!fs.existsSync(SETTINGS_FILE)) {
      await fsPromises.writeFile(SETTINGS_FILE, JSON.stringify({ routineCheckIntervalMs: DEFAULT_ROUTINE_CHECK_INTERVAL_MS }, null, 2), "utf8");
    } else {
      const stats = await fsPromises.stat(SETTINGS_FILE);
      if (stats.size === 0) {
        await fsPromises.writeFile(SETTINGS_FILE, JSON.stringify({ routineCheckIntervalMs: DEFAULT_ROUTINE_CHECK_INTERVAL_MS }, null, 2), "utf8");
      }
    }
  } catch (err) {
    console.error("❌ Failed to create user file:", err);
  }
}

async function getKey() {
  const hex = await fsPromises.readFile(KEY_FILE, "utf8");
  return Buffer.from(hex.trim(), "hex");
}

function encryptSecret(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptSecret(payload, key) {
  if (!payload) return "";
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

async function readIntegrations() {
  try {
    const content = await fsPromises.readFile(INTEGRATION_FILE, "utf8");
    if (!content.trim()) return { smartthings: { entries: [] } };
    const parsed = JSON.parse(content);
    if (!parsed.smartthings) {
      parsed.smartthings = { entries: [] };
    } else if (!Array.isArray(parsed.smartthings.entries)) {
      parsed.smartthings.entries = [];
    }
    return parsed;
  } catch {
    return { smartthings: { entries: [] } };
  }
}

async function writeIntegrations(data) {
  await fsPromises.writeFile(INTEGRATION_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function getStoredSmartThingsTokens() {
  const key = await getKey();
  const integrations = await readIntegrations();
  const entries = integrations.smartthings?.entries || [];
  return entries.map((entry) => {
    try {
      return {
        id: entry.id,
        label: entry.label,
        enabled: Boolean(entry.enabled),
        token: decryptSecret(entry.token, key),
        updatedAt: entry.updatedAt
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function saveSmartThingsEntry({ id, label, token, enabled = true }) {
  const key = await getKey();
  const integrations = await readIntegrations();
  const entries = integrations.smartthings.entries || [];
  const idx = entries.findIndex((e) => e.id === id);
  const newEntry = {
    id: id || crypto.randomBytes(8).toString("hex"),
    label: label || "SmartThings",
    token: encryptSecret(token, key),
    enabled: Boolean(enabled),
    updatedAt: Date.now()
  };
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...newEntry };
  } else {
    entries.push(newEntry);
  }
  integrations.smartthings.entries = entries;
  await writeIntegrations(integrations);
  return newEntry.id;
}

async function readSettings() {
  try {
    const content = await fsPromises.readFile(SETTINGS_FILE, "utf8");
    if (!content.trim()) {
      const fallback = { routineCheckIntervalMs: DEFAULT_ROUTINE_CHECK_INTERVAL_MS };
      await writeSettings(fallback);
      return fallback;
    }
    const parsed = JSON.parse(content);
    if (typeof parsed.routineCheckIntervalMs !== "number") {
      parsed.routineCheckIntervalMs = DEFAULT_ROUTINE_CHECK_INTERVAL_MS;
    }
    return parsed;
  } catch (err) {
    console.error("❌ Failed to read settings, resetting:", err);
    const fallback = { routineCheckIntervalMs: DEFAULT_ROUTINE_CHECK_INTERVAL_MS };
    await writeSettings(fallback);
    return fallback;
  }
}

async function writeSettings(data) {
  await fsPromises.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isValidTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return Array.from(
    new Set(
      days
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
  );
}

function normalizeActions(actions) {
  const list = Array.isArray(actions) ? actions : actions ? [actions] : [];
  const normalized = [];
  for (const action of list) {
    if (!action || !action.deviceId) continue;
    const base = {
      id: action.id || crypto.randomBytes(6).toString("hex"),
      deviceId: String(action.deviceId),
      sourceId: action.sourceId ? String(action.sourceId) : undefined,
      deviceName: action.deviceName ? String(action.deviceName).slice(0, 120) : undefined
    };
    if (action.type === "device_toggle") {
      const desired = typeof action.desiredState === "boolean" ? action.desiredState : typeof action.on === "boolean" ? action.on : null;
      if (desired === null) continue;
      normalized.push({
        ...base,
        type: "device_toggle",
        desiredState: desired
      });
      continue;
    }
    if (action.type === "device_command") {
      const capability = (action.capability || "").trim();
      const command = (action.command || "").trim();
      if (!capability || !command) continue;
      normalized.push({
        ...base,
        type: "device_command",
        capability,
        command,
        arguments: Array.isArray(action.arguments) ? action.arguments : []
      });
    }
  }
  return normalized.slice(0, MAX_ACTIONS_PER_ROUTINE);
}

function buildRoutineFromPayload(payload, existing) {
  const now = Date.now();
  const base = existing ? { ...existing } : { id: crypto.randomBytes(8).toString("hex"), createdAt: now, lastRunAt: null };

  if (payload.name !== undefined) {
    const name = String(payload.name || "").trim();
    if (!name) {
      return { error: "Name fehlt" };
    }
    base.name = name.slice(0, 120);
  }

  if (payload.enabled !== undefined) {
    base.enabled = Boolean(payload.enabled);
  } else if (!existing) {
    base.enabled = true;
  }

  if (payload.trigger !== undefined) {
    const trigger = payload.trigger || {};
    if (trigger.type === "time") {
      if (!isValidTimeString(trigger.time)) {
        return { error: "Ungültiger Trigger" };
      }
      const days = normalizeDays(trigger.days);
      base.trigger = { type: "time", time: String(trigger.time).trim(), days };
    } else if (trigger.type === "interval") {
      const everyMinutes = Math.max(1, Math.min(1440, Number(trigger.everyMinutes) || 0));
      if (!everyMinutes) {
        return { error: "Ungültiger Trigger" };
      }
      base.trigger = { type: "interval", everyMinutes };
    } else {
      return { error: "Ungültiger Trigger" };
    }
  } else if (!existing) {
    return { error: "Trigger fehlt" };
  }

  if (payload.actions !== undefined || payload.action !== undefined) {
    const actions = normalizeActions(payload.actions || payload.action);
    if (actions.length === 0) {
      return { error: "Ungültige Aktionen" };
    }
    base.actions = actions;
  } else if (!existing) {
    return { error: "Aktionen fehlen" };
  }

  base.updatedAt = now;
  return { routine: base };
}

async function readRoutines() {
  try {
    const content = await fsPromises.readFile(ROUTINE_FILE, "utf8");
    if (!content.trim()) {
      const fallback = { routines: [] };
      await writeRoutines(fallback);
      return fallback;
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.routines)) parsed.routines = [];
    return parsed;
  } catch (err) {
    console.error("❌ Failed to read routines, resetting file:", err);
    const fallback = { routines: [] };
    await writeRoutines(fallback);
    return { routines: [] };
  }
}

async function writeRoutines(data) {
  await fsPromises.writeFile(ROUTINE_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function appendLog(entry) {
  const logEntry = {
    device: entry.device || "Unbekannt",
    action: entry.action || "unknown",
    timestamp: entry.timestamp || Date.now()
  };
  const line = JSON.stringify(logEntry);
  try {
    await fsPromises.appendFile(LOG_FILE, line + "\n", "utf8");
  } catch (err) {
    console.error("❌ Failed to write to log:", err);
  }
}

async function readLogs(limit = 100) {
  try {
    const data = await fsPromises.readFile(LOG_FILE, "utf8");
    const lines = data.trim() === "" ? [] : data.trim().split("\n");
    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
    return parsed.slice(-limit).reverse(); // neueste zuerst
  } catch (err) {
    console.error("❌ Failed to read log:", err);
    return [];
  }
}

async function readUser() {
  try {
    const content = await fsPromises.readFile(USER_FILE, "utf8");
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeUser(user) {
  await fsPromises.writeFile(USER_FILE, JSON.stringify(user, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    })
  );
}

function makeSessionToken(user) {
  const payload = `${user.username}:${user.hash}:${user.salt}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function validateSession(req, user) {
  if (!user) return null;
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (!token) return null;
  const expected = makeSessionToken(user);
  if (token !== expected) return null;
  return user.username;
}

await ensureUserFile();
await ensureLogFile();

async function resolveSmartThingsToken() {
  if (ENV_SMARTTHINGS_TOKEN) return [{ token: ENV_SMARTTHINGS_TOKEN, id: "env", label: "Env Token" }];
  const stored = await getStoredSmartThingsTokens();
  const enabled = stored.filter((e) => e.enabled);
  if (enabled.length > 0) return enabled;
  throw new Error("SMARTTHINGS_TOKEN fehlt");
}

async function requireAuth(req, res) {
  const user = await readUser();
  const username = validateSession(req, user);
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { user, username };
}

// ----------------------------
// 🔧 DEVICE STATUS + HEALTH
// ----------------------------
async function getDeviceStatus(deviceId, token) {
  // 1) On/Off Status
  const statusRes = await fetch(
    `https://api.smartthings.com/v1/devices/${deviceId}/status`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const statusData = await statusRes.json();
  const main = statusData.components?.main || {};

  const on =
    main?.switch?.switch?.value === "on";

  // 2) ONLINE STATUS (Health API)
  const healthRes = await fetch(
    `https://api.smartthings.com/v1/devices/${deviceId}/health`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const healthData = await healthRes.json();
  const online = healthData.state === "ONLINE";

  return {
    on: Boolean(on),
    online: Boolean(online)
  };
}

async function toggleSmartThingsDevice(deviceId, on, sourceId) {
  const tokens = await resolveSmartThingsToken();
  const tokenEntry = sourceId ? tokens.find((t) => t.id === sourceId) : tokens[0];
  if (!tokenEntry) {
    throw new Error("Token für Quelle nicht gefunden");
  }
  return sendSmartThingsCommand({
    deviceId,
    source: tokenEntry,
    capability: "switch",
    command: on ? "on" : "off",
    arguments: []
  });
}

async function sendSmartThingsCommand({ deviceId, source, capability, command, arguments: args = [], component = "main" }) {
  const r = await fetch(
    `https://api.smartthings.com/v1/devices/${deviceId}/commands`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${source.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        commands: [
          {
            component,
            capability,
            command,
            arguments: Array.isArray(args) ? args : []
          }
        ]
      })
    }
  );

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`SmartThings Command fehlgeschlagen (${r.status}) ${text}`);
  }

  const result = await r.json();
  const liveStatus = await getDeviceStatus(deviceId, source.token);

  return { result, state: liveStatus, source };
}

// ----------------------------
// ✅ DEVICE MAPPING
// ----------------------------
function mapSmartThingsDevice(device, liveStatus) {
  const caps = (device.components || []).flatMap((c) =>
    (c.capabilities || []).map((cap) => (typeof cap === "string" ? cap : cap.id))
  );
  const hasDim = caps.includes("switchLevel") || caps.includes("colorControl");
  const hasColor = caps.includes("colorControl") || caps.includes("colorTemperature");
  const hasPower = caps.includes("powerMeter") || caps.includes("energyMeter");
  const hasSwitch = caps.includes("switch");

  const inferredType = hasDim || hasColor ? "Licht" : hasPower || hasSwitch ? "Steckdose" : "Gerät";

  return {
    id: device.deviceId,
    name: device.label || device.name || "Unbenannt",
    online: liveStatus.online,
    on: liveStatus.on,
    type: inferredType,
    room: device.roomId || "Unbekannt",
    brand: device.manufacturerName || "SmartThings"
  };
}

// ----------------------------
// ✅ LOAD ALL DEVICES
// ----------------------------
app.get("/api/smartlife/devices", async (_req, res) => {
  try {
    const tokens = await resolveSmartThingsToken(); // array
    const mappedAll = [];

    for (const entry of tokens) {
      const r = await fetch("https://api.smartthings.com/v1/devices", {
        headers: {
          Authorization: `Bearer ${entry.token}`
        }
      });

      const data = await r.json();
      const devices = data.items || [];

      for (const device of devices) {
        const liveStatus = await getDeviceStatus(device.deviceId, entry.token);
        mappedAll.push({
          ...mapSmartThingsDevice(device, liveStatus),
          sourceId: entry.id,
          sourceLabel: entry.label || "SmartThings"
        });
      }
    }

    res.json(mappedAll);
  } catch (err) {
    console.error("❌ DEVICE LIST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// ✅ DEVICE TOGGLE
// ----------------------------
app.post("/api/smartlife/devices/:id/state", async (req, res) => {
  const { id } = req.params;
  const { on, deviceName, sourceId } = req.body;

  try {
    const { result, state } = await toggleSmartThingsDevice(id, on, sourceId);
    res.json({
      success: true,
      result,
      state
    });

  } catch (err) {
    console.error("❌ TOGGLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// 📝 LOG ENDPOINTS
// ----------------------------
app.get("/api/logs", async (_req, res) => {
  const logs = await readLogs(120);
  res.json(logs);
});

app.post("/api/logs", async (req, res) => {
  const { device, action, timestamp } = req.body || {};
  if (!device || !action) {
    return res.status(400).json({ error: "device und action sind erforderlich" });
  }

  const logEntry = {
    device: String(device).slice(0, 200),
    action: String(action).slice(0, 50),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
  };

  await appendLog(logEntry);
  res.json({ success: true, log: logEntry });
});

app.delete("/api/logs", async (_req, res) => {
  try {
    await fsPromises.writeFile(LOG_FILE, "", "utf8");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to clear log:", err);
    res.status(500).json({ error: "Could not clear log" });
  }
});

// ----------------------------
// 🤖 ROUTINEN (Automation)
// ----------------------------
const routineRunTracker = new Map();
let routineIntervalMs = DEFAULT_ROUTINE_CHECK_INTERVAL_MS;
let routineIntervalHandle = null;

async function runRoutineActions(routine) {
  const results = [];
  for (const action of routine.actions || []) {
    try {
      if (action.type === "device_toggle") {
        const { state } = await toggleSmartThingsDevice(action.deviceId, action.desiredState, action.sourceId);
        await appendLog({
          device: action.deviceName || routine.name || action.deviceId,
          action: action.desiredState ? "on" : "off",
          timestamp: Date.now()
        });
        results.push({ ok: true, actionId: action.id, state });
        continue;
      }
      if (action.type === "device_command") {
        const tokens = await resolveSmartThingsToken();
        const tokenEntry = action.sourceId ? tokens.find((t) => t.id === action.sourceId) : tokens[0];
        if (!tokenEntry) throw new Error("Token für Quelle nicht gefunden");
        const { state } = await sendSmartThingsCommand({
          deviceId: action.deviceId,
          source: tokenEntry,
          capability: action.capability,
          command: action.command,
          arguments: action.arguments || []
        });
        await appendLog({
          device: action.deviceName || routine.name || action.deviceId,
          action: `${action.capability}:${action.command}`,
          timestamp: Date.now()
        });
        results.push({ ok: true, actionId: action.id, state });
        continue;
      }
      results.push({ ok: false, actionId: action.id, error: "Unsupported action type" });
    } catch (err) {
      console.error("❌ Routine action failed:", err);
      results.push({ ok: false, actionId: action.id, error: err.message });
    }
  }
  return results;
}

async function evaluateRoutines() {
  try {
    const data = await readRoutines();
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const currentDay = now.getDay(); // 0 = Sunday
    let changed = false;

    const updatedRoutines = (data.routines || []).map((routine) => {
      const updated = { ...routine };
      if (!updated.enabled || !updated.trigger) return updated;

      if (updated.trigger.type === "time") {
        if (updated.trigger.time === hhmm) {
          const days = normalizeDays(updated.trigger.days);
          if (days.length > 0 && !days.includes(currentDay)) {
            return updated;
          }
          const key = `${now.toDateString()}-${hhmm}`;
          if (routineRunTracker.get(updated.id) === key) return updated;
          routineRunTracker.set(updated.id, key);
          runRoutineActions(updated).catch((err) => console.error("❌ Routine execution failed:", err));
          updated.lastRunAt = Date.now();
          changed = true;
        }
      } else if (updated.trigger.type === "interval") {
        const everyMinutes = Math.max(1, Math.min(1440, Number(updated.trigger.everyMinutes) || 0));
        const last = updated.lastRunAt || 0;
        if (Date.now() - last >= everyMinutes * 60 * 1000) {
          runRoutineActions(updated).catch((err) => console.error("❌ Routine execution failed:", err));
          updated.lastRunAt = Date.now();
          changed = true;
        }
      }

      return updated;
    });

    if (changed) {
      await writeRoutines({ routines: updatedRoutines });
    }
  } catch (err) {
    console.error("❌ Routine evaluation failed:", err);
  }
}

async function applyRoutineInterval(ms) {
  if (!Number.isFinite(ms) || ms < 5000) {
    ms = DEFAULT_ROUTINE_CHECK_INTERVAL_MS;
  }
  routineIntervalMs = ms;
  if (routineIntervalHandle) {
    clearInterval(routineIntervalHandle);
  }
  routineIntervalHandle = setInterval(() => {
    evaluateRoutines();
  }, routineIntervalMs);
  evaluateRoutines();
}

const initialSettings = await readSettings();
await applyRoutineInterval(initialSettings.routineCheckIntervalMs || DEFAULT_ROUTINE_CHECK_INTERVAL_MS);

app.get("/api/routines", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  try {
    const routines = await readRoutines();
    res.json(routines);
  } catch (err) {
    res.status(500).json({ error: "Konnte Routinen nicht laden" });
  }
});

app.post("/api/routines", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { routine, error } = buildRoutineFromPayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const data = await readRoutines();
    data.routines.push(routine);
    await writeRoutines(data);
    res.json({ success: true, routine });
  } catch (err) {
    res.status(500).json({ error: "Konnte Routine nicht speichern" });
  }
});

app.patch("/api/routines/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { id } = req.params;
  const data = await readRoutines();
  const idx = (data.routines || []).findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "Routine nicht gefunden" });

  const { routine, error } = buildRoutineFromPayload(req.body || {}, data.routines[idx]);
  if (error) return res.status(400).json({ error });

  data.routines[idx] = routine;
  await writeRoutines(data);
  res.json({ success: true, routine });
});

app.delete("/api/routines/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { id } = req.params;
  const data = await readRoutines();
  const before = data.routines.length;
  data.routines = data.routines.filter((r) => r.id !== id);
  if (before === data.routines.length) return res.status(404).json({ error: "Routine nicht gefunden" });
  await writeRoutines(data);
  res.json({ success: true });
});

app.post("/api/routines/:id/run", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { id } = req.params;
  const data = await readRoutines();
  const routine = (data.routines || []).find((r) => r.id === id);
  if (!routine) return res.status(404).json({ error: "Routine nicht gefunden" });
  try {
    const results = await runRoutineActions(routine);
    routine.lastRunAt = Date.now();
    await writeRoutines(data);
    res.json({ success: true, results, routine });
  } catch (err) {
    res.status(500).json({ error: "Routine konnte nicht ausgeführt werden" });
  }
});

// ----------------------------
// 🕒 SERVER TIME (for overlays)
// ----------------------------
app.get("/api/time", (_req, res) => {
  const now = new Date();
  res.json({
    now: now.getTime(),
    iso: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
});

// ----------------------------
// ⚙️ SETTINGS (AUTH REQUIRED)
// ----------------------------
app.get("/api/settings", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Konnte Settings nicht laden" });
  }
});

app.post("/api/settings", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { routineCheckIntervalMs } = req.body || {};
  const sanitized = Math.max(5000, Math.min(5 * 60 * 1000, Number(routineCheckIntervalMs) || DEFAULT_ROUTINE_CHECK_INTERVAL_MS));
  try {
    const current = await readSettings();
    const next = { ...current, routineCheckIntervalMs: sanitized };
    await writeSettings(next);
    await applyRoutineInterval(next.routineCheckIntervalMs);
    res.json({ success: true, settings: next });
  } catch (err) {
    res.status(500).json({ error: "Konnte Settings nicht speichern" });
  }
});

// ----------------------------
// 🔑 API MANAGEMENT (AUTH REQUIRED)
// ----------------------------
app.get("/api/integrations/smartthings", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  try {
    const tokens = await getStoredSmartThingsTokens();
    res.json({ entries: tokens });
  } catch (err) {
    res.status(500).json({ error: "Konnte Token nicht lesen" });
  }
});

app.post("/api/integrations/smartthings", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { token, label } = req.body || {};
  if (!token || !String(token).trim()) {
    return res.status(400).json({ error: "Token fehlt" });
  }
  try {
    const id = await saveSmartThingsEntry({
      token: String(token).trim(),
      label: String(label || "SmartThings").trim(),
      enabled: true
    });
    const entries = await getStoredSmartThingsTokens();
    res.json({ success: true, entries, id });
  } catch (err) {
    res.status(500).json({ error: "Konnte Token speichern" });
  }
});

app.patch("/api/integrations/smartthings/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { id } = req.params;
  const { enabled, label, token } = req.body || {};
  if (!id) return res.status(400).json({ error: "ID fehlt" });
  try {
    const existing = await getStoredSmartThingsTokens();
    const match = existing.find((e) => e.id === id);
    if (!match) return res.status(404).json({ error: "Nicht gefunden" });
    await saveSmartThingsEntry({
      id,
      token: token ? String(token).trim() : match.token,
      label: label ? String(label).trim() : match.label,
      enabled: typeof enabled === "boolean" ? enabled : match.enabled
    });
    const entries = await getStoredSmartThingsTokens();
    res.json({ success: true, entries });
  } catch (err) {
    res.status(500).json({ error: "Update fehlgeschlagen" });
  }
});

// ----------------------------
// 👤 LOCAL USER + SESSION
// ----------------------------
app.get("/api/user/status", async (req, res) => {
  const user = await readUser();
  const username = validateSession(req, user);
  res.json({
    hasUser: Boolean(user),
    authenticated: Boolean(username),
    username: username || null
  });
});

app.post("/api/user/setup", async (req, res) => {
  const existing = await readUser();
  if (existing) {
    return res.status(400).json({ error: "User existiert bereits" });
  }
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Username/Passwort ungültig (min. 6 Zeichen)" });
  }
  const trimmedUser = String(username).trim();
  const { salt, hash } = hashPassword(String(password));
  const user = { username: trimmedUser, salt, hash, createdAt: Date.now() };
  await writeUser(user);
  const token = makeSessionToken(user);
  res
    .cookie("sid", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS
    })
    .json({ success: true, username: trimmedUser });
});

app.post("/api/user/login", async (req, res) => {
  const user = await readUser();
  if (!user) return res.status(400).json({ error: "Kein User angelegt" });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Fehlende Credentials" });
  if (String(username).trim() !== user.username) return res.status(401).json({ error: "Ungültige Credentials" });
  const ok = verifyPassword(String(password), user.salt, user.hash);
  if (!ok) return res.status(401).json({ error: "Ungültige Credentials" });
  const token = makeSessionToken(user);
  res
    .cookie("sid", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS
    })
    .json({ success: true, username: user.username });
});

app.post("/api/user/logout", (req, res) => {
  res
    .cookie("sid", "", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0
    })
    .json({ success: true });
});

app.post("/api/user/update", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { username, password } = req.body || {};
  if (!username && !password) {
    return res.status(400).json({ error: "Nichts zu ändern" });
  }

  const user = await readUser();
  if (!user) return res.status(400).json({ error: "Kein User angelegt" });

  const updated = { ...user };
  if (username && String(username).trim()) {
    updated.username = String(username).trim();
  }
  if (password && String(password).length >= 6) {
    const { salt, hash } = hashPassword(String(password));
    updated.salt = salt;
    updated.hash = hash;
  }

  await writeUser(updated);
  const token = makeSessionToken(updated);
  res
    .cookie("sid", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS
    })
    .json({ success: true, username: updated.username });
});

// ----------------------------
// ✅ FRONTEND
// ----------------------------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Serve dashboard explicitly
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// Serve API management
app.get("/api-management", (_req, res) => {
  res.sendFile(path.join(publicDir, "api.html"));
});

// Serve settings
app.get("/settings", (_req, res) => {
  res.sendFile(path.join(publicDir, "settings.html"));
});

// Serve routines
app.get("/routines", (_req, res) => {
  res.sendFile(path.join(publicDir, "routines.html"));
});

// Default to login page for other routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ----------------------------
app.listen(PORT, () => {
console.log(`✅ WeepHub running at http://localhost:${PORT}`);
});
