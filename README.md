# WeepHub

Self-hosted, privacy-first smart home control hub for Raspberry Pi and local servers. Manage devices from SmartThings, Tuya, IFTTT, Wake-on-LAN, and custom APIs inside one unified dashboard that lives entirely on your local network.

## 🚀 Overview
- Node.js + Express backend serving React-based login, dashboard, and API-Management from `public/`
- Local user system (hashed password, session cookie) stored in `data/`
- SmartThings API integration via PATs (multiple tokens supported, aggregated)
- Encrypted integration storage in `data/` with local key
- Local-only by default (`http://localhost:3001`) with i18n (EN/DE)
- .env-driven configuration; no cloud relay

## 🔒 Philosophy & Privacy
- Local-first: all control stays inside your LAN by default.
- Minimal data collection: no telemetry or third-party relays.
- Explicit configuration: bring your own credentials via `.env`.
- Extensible without surrendering control: plugins remain opt-in and local.

## ✨ Features
**Current**
- Login/Account creation (local file-based auth, scrypt hash, session cookie).
- SmartThings devices load, report status (on/off + health), and toggle from the dashboard (multiple PATs aggregated).
- Encrypted storage for integration tokens in `data/integrations.json` with local AES key (`data/secret.key`).
- Live activity log (toggle + online/offline) persisted to `logs/activity.log` with UI table and clear action.
- Static frontend served from `/public` (login `index.html`, dashboard `dashboard.html`, API management `api.html`).
- Runs on `localhost:3001` with `.env` configuration or saved tokens.

**Planned**
- Plugin system (widgets, integrations, tools).
- Multi-API support (SmartThings, Tuya, IFTTT, local devices, custom APIs, Wake-on-LAN).
- Encrypted credential storage.
- File-based authentication with role-based access (admin/user).
- Optional port-forwarding / reverse-proxy mode for external hosting.
- Theme engine and dashboard widgets.
- Extension SDK for community plugins.
- Home automation rules plus device groups/scenes.
- Offline-first behavior.

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
│  ├─ api.html          # API Management (integrations, tokens, i18n)
│  └─ settings.html     # Settings (UI prefs, language, polling)
├─ data/                # Local auth/tokens (ignored by git)
│  ├─ user.json         # Local user (hashed)
│  ├─ secret.key        # Local AES key for integrations
│  └─ integrations.json # Encrypted integration entries
├─ logs/activity.log    # Persisted activity log
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
# App runs at http://localhost:3001
```

- Öffne `http://localhost:3001` → Account anlegen oder einloggen.
- Im Dashboard über Avatar-Dropdown zu „API Management“ und SmartThings PAT(s) hinzufügen/aktivieren.
- Geräte laden automatisch; Toggle/Status-Events landen im Log (persistiert).

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
- Add authentication and role-based access.
- Implement plugin host + SDK.
- Expand integrations (Tuya, IFTTT, local APIs, Wake-on-LAN).
- Add dashboard widgets, themes, and device groups/scenes.
- Ship automation rules and offline-first behavior.
- Harden credential storage and external hosting options.

## 🤝 Contributing
- Fork the repo and create a feature branch.
- Keep changes focused and document new configuration or endpoints.
- Open an issue or discussion for large features (plugins, auth, SDK) before implementation.
- Add tests where applicable and update docs alongside code changes.

## 📄 License
TBD — to be defined before the first stable release.

## ⚠️ Status
MVP/early-stage. Expect breaking changes and rapid iteration; use on trusted networks while authentication and encryption are still in progress.
