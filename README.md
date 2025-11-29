# WeepHub

Self-hosted, privacy-first smart home control hub for Raspberry Pi and local servers. Manage devices from SmartThings, Tuya, IFTTT, Wake-on-LAN, and custom APIs inside one unified dashboard that lives entirely on your local network.

## 🚀 Overview
- Node.js + Express backend serving a static dashboard from `public/`
- SmartThings API integration via personal access token
- Local-only by default (`http://localhost:3001`)
- .env-driven configuration; no cloud relay

## 🔒 Philosophy & Privacy
- Local-first: all control stays inside your LAN by default.
- Minimal data collection: no telemetry or third-party relays.
- Explicit configuration: bring your own credentials via `.env`.
- Extensible without surrendering control: plugins remain opt-in and local.

## ✨ Features
**Current (MVP)**
- SmartThings devices load, report status (on/off + health), and toggle from the dashboard.
- Backend proxy endpoints for SmartThings with token-based auth.
- Static frontend served from `/public`.
- Runs on `localhost:3001` with `.env` configuration.

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
- Static frontend (`public/index.html`)
- Fetch-based SmartThings API calls
- `dotenv` for configuration

## 📂 Project Structure
```
WeepHub/
├─ server.js          # Express server + SmartThings proxy endpoints
├─ package.json       # Scripts and dependencies
├─ public/
│  └─ index.html      # Static dashboard frontend
├─ .env.example       # Sample environment variables
└─ .env               # Local secrets (not committed)
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

- `SMARTTHINGS_TOKEN` (required): SmartThings PAT with Devices Read/Write.
- `PORT` (optional): Defaults to `3001`.

## ▶️ Usage
```bash
npm start
# App runs at http://localhost:3001
```

- Open the dashboard in your browser.
- Devices should load automatically; toggle devices directly from the UI.

## 🧩 Plugin System (Planned)
- Goal: lightweight plugin layer for integrations (weather, tools, device APIs) and UI widgets.
- Approach: declarative manifests, sandboxed execution, and a small SDK for data fetching and dashboard blocks.
- Governance: plugins stay optional, locally installed, and explicit about required permissions.

## 🛡️ Security Philosophy
- Local-first deployment keeps control traffic off third-party clouds.
- Credentials stay in `.env`; future plans include encrypted storage.
- Authentication/roles are planned; the current MVP has no auth—run on trusted networks only.
- External exposure (port-forwarding/reverse-proxy) will remain opt-in.

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
