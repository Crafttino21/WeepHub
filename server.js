import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const SMARTTHINGS_TOKEN = process.env.SMARTTHINGS_TOKEN;
const PORT = process.env.PORT || 3001;

if (!SMARTTHINGS_TOKEN) {
  console.error("❌ SMARTTHINGS_TOKEN fehlt in der .env");
  process.exit(1);
}

console.log("✅ SmartThings API aktiv");

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
  const { on } = req.body;

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
// ✅ FRONTEND
// ----------------------------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`✅ WeepHub läuft auf http://localhost:${PORT}`);
});
