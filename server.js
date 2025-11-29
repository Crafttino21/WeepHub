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

const SMARTTHINGS_TOKEN = process.env.SMARTTHINGS_TOKEN;
const PORT = process.env.PORT || 3001;
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "activity.log");
const DATA_DIR = path.join(__dirname, "data");
const USER_FILE = path.join(DATA_DIR, "user.json");
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 Tage

if (!SMARTTHINGS_TOKEN) {
  console.error("❌ SMARTTHINGS_TOKEN fehlt in der .env");
  process.exit(1);
}

console.log("✅ SmartThings API aktiv");

async function ensureLogFile() {
  try {
    await fsPromises.mkdir(LOG_DIR, { recursive: true });
    if (!fs.existsSync(LOG_FILE)) {
      await fsPromises.writeFile(LOG_FILE, "", "utf8");
    }
  } catch (err) {
    console.error("❌ Konnte Logdatei nicht anlegen:", err);
  }
}

async function ensureUserFile() {
  try {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USER_FILE)) {
      await fsPromises.writeFile(USER_FILE, "", "utf8");
    }
  } catch (err) {
    console.error("❌ Konnte Userdatei nicht anlegen:", err);
  }
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
    console.error("❌ Schreiben ins Log fehlgeschlagen:", err);
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
    console.error("❌ Lesen des Logs fehlgeschlagen:", err);
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

// ----------------------------
// 🔧 DEVICE STATUS + HEALTH
// ----------------------------
async function getDeviceStatus(deviceId) {
  // 1) On/Off Status
  const statusRes = await fetch(
    `https://api.smartthings.com/v1/devices/${deviceId}/status`,
    {
      headers: {
        Authorization: `Bearer ${SMARTTHINGS_TOKEN}`
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
        Authorization: `Bearer ${SMARTTHINGS_TOKEN}`
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
// ✅ ALLE GERÄTE LADEN
// ----------------------------
app.get("/api/smartlife/devices", async (_req, res) => {
  try {
    const r = await fetch("https://api.smartthings.com/v1/devices", {
      headers: {
        Authorization: `Bearer ${SMARTTHINGS_TOKEN}`
      }
    });

    const data = await r.json();
    const devices = data.items || [];

    const mapped = [];

    for (const device of devices) {
      const liveStatus = await getDeviceStatus(device.deviceId);
      mapped.push(mapSmartThingsDevice(device, liveStatus));
    }

    res.json(mapped);
  } catch (err) {
    console.error("❌ GERÄTE FEHLER:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------
// ✅ GERÄT SCHALTEN (TOGGLE)
// ----------------------------
app.post("/api/smartlife/devices/:id/state", async (req, res) => {
  const { id } = req.params;
  const { on, deviceName } = req.body;

  try {
    const r = await fetch(
      `https://api.smartthings.com/v1/devices/${id}/commands`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SMARTTHINGS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          commands: [
            {
              component: "main",
              capability: "switch",
              command: on ? "on" : "off"
            }
          ]
        })
      }
    );

    const result = await r.json();

    const liveStatus = await getDeviceStatus(id);

    res.json({
      success: true,
      result,
      state: liveStatus
    });

  } catch (err) {
    console.error("❌ SCHALT FEHLER:", err);
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
    console.error("❌ Log löschen fehlgeschlagen:", err);
    res.status(500).json({ error: "Konnte Log nicht löschen" });
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

// ----------------------------
// ✅ FRONTEND
// ----------------------------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Serve dashboard explicitly
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// Default to login page for other routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ WeepHub läuft auf http://localhost:${PORT}`);
});
