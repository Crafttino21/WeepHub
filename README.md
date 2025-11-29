# WeepHub

Self-hosted, privacy-first smart home control hub for Raspberry Pi and local servers. Manage devices from SmartThings, Tuya, IFTTT, Wake-on-LAN, and custom APIs inside one unified dashboard that lives entirely on your local network.

## 🚀 Overview
- Node.js + Express backend serving React-based login, dashboard, and API-Management from `public/`
- Local user system (hashed password, session cookie) stored in `data/`
- SmartThings API integration via PATs (multiple tokens supported, aggregated)
- Encrypted integration storage in `data/` with local key
- Local scheduler for routines (configurable check interval via Settings)
- Local-only by default (`http://localhost:3001`) with i18n (EN/DE)
- .env-driven configuration; no cloud relay

## 🔒 Philosophy & Privacy
- Local-first: all control stays inside your LAN by default.
- Minimal data collection: no telemetry or third-party relays.
- Explicit configuration: bring your own credentials via `.env`.
- Extensible without surrendering control: plugins remain opt-in and local.

## ✨ Features
**Current**
- Login/account creation (local file-based auth, scrypt hash, session cookie).
- SmartThings devices load, report status (on/off + health), and toggle from the dashboard (multiple PATs aggregated).
- Encrypted storage for integration tokens in `data/integrations.json` with local AES key (`data/secret.key`).
- Live activity log (toggle + online/offline) persisted to `logs/activity.log` with UI table and clear action.
- Routines with multiple actions: switch, dim, set temperature, or custom SmartThings commands; triggers by time (optional weekdays) or interval; local scheduler with adjustable check interval.
- Debug/overlay: Server time overlay toggled via Settings; optional in-app debug console.
- Static frontend served from `/public` (login `index.html`, dashboard `dashboard.html`, API management `api.html`).
- Runs on `localhost:3001` with `.env` configuration or saved tokens.

**Planned**
- Plugin system (widgets, integrations, tools) with a lightweight SDK.
- More integrations (Tuya, IFTTT, local/LAN APIs, Wake-on-LAN) and richer device capabilities (temperature, scenes, levels, sensors).
- Encrypted credential storage hardening and optional RBAC (admin/user).
- Optional port-forwarding / reverse-proxy mode for external hosting.
- Theme engine, dashboard widgets, and reusable UI components.
- Expanded automation: device groups/scenes, additional triggers/conditions, richer scheduling.
- Offline-first behavior and caching.

## 🧰 Tech Stack
- Node.js + Express
- Static frontend (React via Babel in `public/*.html`)
- Fetch-based SmartThings API calls
- `dotenv` for configuration
- AES-GCM for local secret storage (integration tokens)

## 📂 Project Structure
```
WeepHub/
├─ server.js            # Express server, auth, SmartThings proxy, logs, encrypted tokens
├─ package.json         # Scripts and dependencies
├─ public/
│  ├─ index.html        # Login/Signup (React, i18n)
│  ├─ dashboard.html    # Dashboard (devices, logs, i18n)
│  ├─ api.html          # API management (integrations, tokens, i18n)
│  ├─ settings.html     # Settings (UI prefs, language, polling, routine interval, overlays)
│  ├─ routines.html     # Routine editor (time/interval triggers, multi-actions)
│  └─ time-overlay.js   # Optional server time overlay (toggle via Settings)
├─ data/                # Local auth/tokens (ignored by git)
│  ├─ user.json         # Local user (hashed)
│  ├─ secret.key        # Local AES key for integrations
│  ├─ integrations.json # Encrypted integration entries
│  ├─ routines.json     # Routines (time/weekday/interval triggers, multi-actions)
│  └─ settings.json     # Server-side settings (routine interval)
├─ logs/activity.log    # Persisted activity log
├─ nodemon.json         # Dev: ignores data/logs for hot reload
├─ .env.example         # Sample environment variables
└─ .env                 # Local secrets (not committed)
```

## ⚙️ Installation
Prerequisites: Node.js and npm/yarn installed on your machine (tested with the current LTS).

```bash
git clone https://github.com/Crafttino21/WeepHub.git
cd weephub
npm install
```

## 🔧 Environment Variables
Create `.env` based on `.env.example`:

```bash
SMARTTHINGS_TOKEN=your_personal_access_token
PORT=3001
```

- `SMARTTHINGS_TOKEN` (optional): SmartThings PAT with Devices Read/Write; if omitted, use API Management to add tokens.
- `PORT` (optional): Defaults to `3001`.

## ▶️ Usage
```bash
npm start
# or: npm run dev (nodemon, ignores data/logs)
# App runs at http://localhost:3001
```

- Open `http://localhost:3001` → create or log into your local account.
- In the dashboard avatar menu, go to “API Management” and add/enable SmartThings PAT(s).
- Devices load automatically; toggle/status events are persisted to the activity log.
- In “Settings”, adjust the routine check interval and optionally enable the server time overlay.

## 🧩 Plugin System (Planned)
- Goal: lightweight plugin layer for integrations (weather, tools, device APIs) and UI widgets.
- Approach: declarative manifests, sandboxed execution, and a small SDK for data fetching and dashboard blocks.
- Governance: plugins stay optional, locally installed, and explicit about required permissions.

## 🛡️ Security Philosophy
- Local-first deployment keeps control traffic off third-party clouds.
- Credentials stay lokal: `.env` oder verschlüsselt in `data/` (AES key lokal abgelegt).
- Lokales Konto mit scrypt-Hash + HttpOnly Session-Cookie; (noch) kein RBAC.
- External exposure (port-forwarding/reverse-proxy) bleibt opt-in.

## 🗺️ Roadmap
- RBAC + hardened credential storage.
- Plugin host + SDK, plus Tuya/IFTTT/local API connectors.
- Automation upgrades: more trigger types (conditions, sensors), groups/scenes, reusable actions.
- UI extensions: themes, widgets, and reusable blocks.
- Offline-first and safe external exposure options.

## 🤝 Contributing
- Fork the repo and create a feature branch.
- Keep changes focused and document new configuration or endpoints.
- Open an issue or discussion for large features (plugins, auth, SDK) before implementation.
- Add tests where applicable and update docs alongside code changes.

## 📄 License
TBD — to be defined before the first stable release.

## ⚠️ Status
MVP/early-stage. Expect breaking changes and rapid iteration; use on trusted networks while authentication and encryption are still in progress.
