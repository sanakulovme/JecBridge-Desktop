const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const execFileAsync = promisify(execFile)
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDev = !app.isPackaged
let mainWindow
const processes = new Map()
const storePath = () => path.join(app.getPath('userData'), 'projects.json')

async function assertSupportedNode(nodeCommand) {
  let stdout
  try {
    ({ stdout } = await execFileAsync(nodeCommand, ['--version'], {
      windowsHide: true,
      timeout: 5000,
    }))
  } catch {
    throw new Error('Node.js was not found. Install Node.js 22 or newer, then restart JecBridge Desktop.')
  }

  const version = String(stdout).trim()
  const major = Number(version.replace(/^v/, '').split('.')[0]) || 0
  if (major < 22) {
    throw new Error(`Node.js ${version || 'version unknown'} is not supported. JecBridge requires Node.js 22 or newer.`)
  }
}

async function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (!child.pid) {
    child.kill()
    return
  }

  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        timeout: 10000,
      })
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) throw error
    }
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

async function readProjects() {
  try {
    const value = JSON.parse(await fs.readFile(storePath(), 'utf8'))
    return Array.isArray(value) ? value : []
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeProjects(projects) {
  await fs.mkdir(path.dirname(storePath()), { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(projects, null, 2), 'utf8')
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

async function updateProject(id, patch) {
  const projects = await readProjects()
  const next = projects.map(project => project.id === id ? { ...project, ...patch } : project)
  await writeProjects(next)
  send('projects:changed', next)
  return next
}

async function resetStaleProjects() {
  const projects = await readProjects()
  let changed = false
  const next = projects.map(project => {
    if (project.status === 'running' || project.status === 'starting' || project.url) {
      changed = true
      return { ...project, status: 'ready', url: undefined }
    }
    return project
  })
  if (changed) await writeProjects(next)
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }))
  ipcMain.handle('projects:list', readProjects)
  ipcMain.handle('projects:choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a project folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] || null)
  })

  ipcMain.handle('projects:add', async (_event, input) => {
    if (!input || typeof input.path !== 'string' || !path.isAbsolute(input.path)) {
      throw new Error('The project folder path is invalid.')
    }
    const projectPath = path.resolve(input.path)
    const stat = await fs.stat(projectPath).catch(() => null)
    if (!stat || !stat.isDirectory()) throw new Error('The selected folder does not exist.')
    const projects = await readProjects()
    if (projects.some(item => item.path.toLowerCase() === projectPath.toLowerCase())) {
      throw new Error('This project has already been added.')
    }
    const next = [{
      id: crypto.randomUUID(),
      name: path.basename(projectPath),
      path: projectPath,
      status: 'ready',
    }, ...projects]
    await writeProjects(next)
    send('projects:changed', next)
    return next
  })

  ipcMain.handle('projects:remove', async (_event, id) => {
    if (processes.has(id)) throw new Error('Stop this project’s MCP server before removing it.')
    const next = (await readProjects()).filter(item => item.id !== id)
    await writeProjects(next)
    send('projects:changed', next)
    return next
  })

  ipcMain.handle('projects:start', async (_event, id) => {
    if (processes.has(id)) throw new Error('This project is already starting or running.')

    const projects = await readProjects()
    const project = projects.find(item => item.id === id)
    if (!project) throw new Error('Project not found.')

    const cliPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'jecbridge', 'src', 'cli.js')
      : path.join(__dirname, '..', 'node_modules', 'jecbridge', 'src', 'cli.js')
    const nodeCommand = process.env.JECBRIDGE_NODE || 'node'

    try {
      await fs.access(cliPath)
    } catch {
      throw new Error('JecBridge CLI was not found. Reinstall the application or its dependencies.')
    }

    await assertSupportedNode(nodeCommand)

      // Persist the transitional state before spawning to avoid a fast URL event being overwritten.
    await updateProject(id, { status: 'starting', url: undefined })

    let child
    try {
      child = spawn(nodeCommand, [cliPath, project.path, '--tunnel'], {
        cwd: project.path,
          detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      await updateProject(id, { status: 'ready', url: undefined })
      throw new Error(error instanceof Error ? error.message : 'Could not start the JecBridge process.')
    }

    const entry = { child, logs: [], url: null, outputBuffer: '', finalized: false }
    processes.set(id, entry)

    const append = (chunk) => {
      const line = chunk.toString()
      entry.logs.push(line)
      let totalLength = entry.logs.reduce((sum, part) => sum + part.length, 0)
      while (totalLength > 30000 && entry.logs.length > 1) {
        totalLength -= entry.logs.shift().length
      }
      send('process:log', { id, text: line, url: entry.url })

      // Keep a rolling tail so an endpoint split across stream chunks can still be detected.
      entry.outputBuffer = (entry.outputBuffer + line).slice(-4096)
      const match = entry.outputBuffer.match(/https:\/\/[^\s"'<>]+\/mcp\/[^\s"'<>]+/)
      if (match) {
        const url = match[0].replace(/[),.]+$/, '')
        if (url !== entry.url) {
          entry.url = url
          void updateProject(id, { status: 'running', url }).catch(error => {
            append(Buffer.from('Could not save MCP endpoint: ' + error.message + '\n'))
          })
        }
      }
    }

    const finalize = async (code, reason) => {
      if (entry.finalized) return
      entry.finalized = true
      if (reason) append(Buffer.from(reason + '\n'))
      if (processes.get(id) === entry) processes.delete(id)
      try {
        await updateProject(id, { status: 'ready', url: undefined })
      } catch (error) {
        send('process:log', { id, text: 'Could not update project status: ' + error.message + '\n', url: null })
      }
      send('process:exit', { id, code })
    }

    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', (error) => {
      void finalize(-1, 'Process start error: ' + error.message)
    })
    child.once('close', (code, signal) => {
      void finalize(code, signal ? 'Process stopped by signal: ' + signal : null)
    })

    return { started: true }
  })

  ipcMain.handle('projects:stop', async (_event, id) => {
    const entry = processes.get(id)
    if (!entry) return { stopped: true, alreadyStopped: true }
    if (entry.finalized) return { stopped: true, alreadyStopped: true }
    await terminateProcessTree(entry.child)
    // Process-tree termination completed.
    return { stopped: true }
  })

  ipcMain.handle('projects:logs', (_event, id) => processes.get(id)?.logs.join('') || '')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#090b10',
    title: 'JecBridge Desktop',
    icon: path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'app-icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173')
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  await resetStaleProjects()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch(error => {
  dialog.showErrorBox('JecBridge Desktop startup error', error.message)
  app.quit()
})

let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  const shutdown = [...processes.values()].map(({ child }) => terminateProcessTree(child))
  void Promise.allSettled(shutdown).finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
