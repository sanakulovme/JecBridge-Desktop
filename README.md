# JecBridge Desktop

**Connect your local projects to AI tools through MCP — from one desktop workspace.**

JecBridge Desktop is an Electron application for managing local project folders and starting JecBridge MCP connections. Add a folder, start its connection, and use the generated private endpoint in an MCP-compatible AI client.

> **Security notice:** Starting a project creates a tunnel and exposes that selected project through its MCP endpoint. Treat the endpoint URL like a password: only share it with trusted AI clients and people.

---

## What's new in 2.0.0

- Global My Skills library with create, import, edit, delete, and per-project assignment.
- Project enable/disable controls and clearer command-access settings.
- Improved project and skill management interface.
- GitHub Releases-based update checks and in-app update installation.

See [CHANGELOG.md](CHANGELOG.md) for the release notes.

## Features

- **Local project workspace** — add, search, and manage project folders from one place.
- **One-click MCP connections** — start or stop the JecBridge process for each project.
- **Private endpoint display** — view the generated MCP endpoint, with part of the URL obscured on screen.
- **Live process console** — inspect output when diagnosing a connection.
- **Persistent project list** — project entries are saved in the desktop app's local user data.
- **Runtime and system details** — check app, Electron, Node.js, and platform information.
- **Windows installer** — package the desktop app as a Windows NSIS installer.
- **In-app updates** — check GitHub Releases, download updates, and install them from Settings.
- **SVG-based branding** — the app uses the SVG artwork as its source of truth and generates multi-resolution ICO assets for Windows.

## How it works

1. Add a local project folder in JecBridge Desktop.
2. Start the project connection.
3. JecBridge launches its CLI for the selected folder and creates an MCP tunnel.
4. Copy the generated endpoint URL.
5. Add that endpoint to an MCP-compatible AI client using the client's remote MCP connection settings.
6. Use the connected project from your AI client. Stop the connection in JecBridge Desktop when you no longer need it.

The endpoint is a secret access link. Do not publish it, commit it to source control, or send it to untrusted services.

## Requirements

- **Windows 10/11 (x64)** — the current packaged-app target.

The Windows installer includes the JecBridge CLI and its Node.js 22 runtime. End users do not need to install Node.js, npm, Git, or any development tools. Node.js and npm are only needed when building the application from source.

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/sanakulovme/JecBridge-Desktop.git
cd JecBridge-Desktop
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the desktop app in development

```bash
npm run electron:dev
```

This starts the Vite development server and launches Electron.

To run only the frontend in a browser:

```bash
npm run dev
```

Some features, including native folder selection and MCP process management, are available only in the Electron desktop app.

## Build

### Build the frontend

```bash
npm run build
```

This runs the TypeScript project build and creates the production frontend in `dist/`.

### Run lint checks

```bash
npm run lint
```

### Build the Windows installer

```bash
npm run electron:build
```

The command:

1. Generates Windows ICO files from `assets/icon.svg` at multiple resolutions.
2. Copies the SVG icon into the public assets.
3. Builds the frontend.
4. Packages the Windows x64 application with electron-builder.

The installer and packaged application are written to `release/`.

To regenerate the icons separately:

```bash
npm run icons:build
```

## Project structure

```text
.
├── assets/
│   ├── build-icons.mjs    # Generates Windows icons from the SVG source
│   ├── icon.svg           # Main brand icon source
│   └── icon.ico           # Generated Windows icon
├── electron/
│   ├── main.cjs           # Main process, project storage and CLI lifecycle
│   └── preload.cjs        # Restricted renderer-to-main API bridge
├── public/                # Static app icons and brand assets
├── src/
│   ├── App.tsx            # Main application UI and interactions
│   ├── App.css            # Application styles
│   ├── index.css          # Global styles
│   └── main.tsx           # React entry point
├── index.html
├── package.json
└── vite.config.ts
```

## Data and security

- Project folder paths are stored locally in the Electron application's user data directory.
- The application does not need to upload the project list to a JecBridge account.
- The MCP CLI is started with the selected folder as its working directory.
- The generated tunnel endpoint grants access to the selected project. Keep it private and stop the connection when finished.
- Electron uses context isolation, a restricted preload API, and disabled renderer Node.js integration.
- Do not add secrets, private endpoint URLs, or personal project data to issues, screenshots, logs, or commits.

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop runtime
- [React](https://react.dev/) — user interface
- [TypeScript](https://www.typescriptlang.org/) — application types
- [Vite](https://vite.dev/) — frontend tooling
- [JecBridge CLI](https://www.npmjs.com/package/jecbridge) — MCP project connection
- [Lucide](https://lucide.dev/) — interface icons
- [electron-builder](https://www.electron.build/) — Windows packaging

## Troubleshooting

### The app cannot find Node.js

Install Node.js 22 or newer, make sure the `node` command is available in your terminal, then restart JecBridge Desktop.

### A project does not connect

- Confirm that the selected folder still exists.
- Check that Node.js 22 or newer is installed.
- Open the project's console in JecBridge Desktop and review the process output.
- Stop the process and try starting it again.

### The endpoint is not visible yet

The app waits for the CLI to print its MCP tunnel URL. Keep the connection running while the endpoint is being created, then check the project console if it does not appear.

---

## Development scripts

| Command | Description |
| --- | --- |
| `npm run electron:dev` | Start Vite and Electron in development |
| `npm run dev` | Start the Vite web development server |
| `npm run build` | Type-check and build the frontend |
| `npm run lint` | Run ESLint |
| `npm run icons:build` | Generate icon assets from the SVG source |
| `npm run electron:build` | Build the Windows installer |

---

**JecBridge Desktop** · A desktop workspace for local AI and MCP workflows.
