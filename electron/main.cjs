const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
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
const skillsRoot = () => path.join(app.getPath('userData'), 'skills')
const registryPath = () => path.join(skillsRoot(), 'registry.json')



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
  const temp = storePath() + '.tmp'
  await fs.writeFile(temp, JSON.stringify(projects, null, 2), 'utf8')
  await fs.rename(temp, storePath())
}

async function readSkills() {
  try {
    const value = JSON.parse(await fs.readFile(registryPath(), 'utf8'))
    return Array.isArray(value) ? value : []
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeSkills(skills) {
  await fs.mkdir(skillsRoot(), { recursive: true })
  const temp = registryPath() + '.tmp'
  await fs.writeFile(temp, JSON.stringify(skills, null, 2), 'utf8')
  await fs.rename(temp, registryPath())
}

function skillId(name) {
  const id = String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
  if (!id) throw new Error('Skill name is invalid.')
  return id
}

function parseSkill(content, fallback = '') {
  const end = content.indexOf(String.fromCharCode(10) + '---')
  //'\\n---')
  const match = content.startsWith('---') && end >= 0 ? { 0: content.slice(0, end + 4), 1: content.slice(4, end).replace(/^\\r?\\n/, '') } : null
  ///^\\uFEFF?---\\r?\\n([\\s\\S]*?)\\r?\\n---[ \\t]*(?:\\r?\\n|$)/)
  const lines = (match?.[1] || '').split(String.fromCharCode(10))
  const get = key => {
    const line = lines.find(item => item.startsWith(`${key}:`))
    return line ? line.slice(key.length + 1).trim().replace(/^['\"]|['\"]$/g, '') : ''
  }
  const name = get('name') || fallback
  const description = get('description')
  if (!name || !description) throw new Error('SKILL.md requires name and description frontmatter.')
  return { name, description, body: match ? content.slice(match[0].length).trim() : content.trim() }
}

async function skillsWithUsage() {
  const [skills, projects] = await Promise.all([readSkills(), readProjects()])
  return skills.map(skill => ({ ...skill, projects: projects.filter(project => (project.enabledSkillIds || []).includes(skill.id)).map(project => ({ id: project.id, name: project.name })) }))
}

async function copySkillFolder(source, destination) {
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error('Symbolic links are not allowed in imported skills.')
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true })
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      if (['node_modules', '.git', '.venv', '__pycache__'].includes(entry.name)) continue
      await copySkillFolder(path.join(source, entry.name), path.join(destination, entry.name))
    }
  } else if (stat.isFile()) {
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
  }
}

async function syncProjectSkills(project) {
  const skillsDir = path.join(project.path, '.claude', 'skills')
  await fs.mkdir(skillsDir, { recursive: true })
  const registry = await readSkills()
  const enabled = new Set(project.enabledSkillIds || [])
  for (const skill of registry) {
    const target = path.join(skillsDir, skill.name.replace(/[^a-zA-Z0-9._-]+/g, '-'))
    if (enabled.has(skill.id)) {
      try { await fs.lstat(target); continue } catch {}
      await fs.symlink(path.join(skillsRoot(), skill.id), target, process.platform === 'win32' ? 'junction' : 'dir')
    } else {
      try { const stat = await fs.lstat(target); if (stat.isSymbolicLink()) await fs.unlink(target) } catch {}
    }
  }
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
  ipcMain.handle('app:update-check', async () => {
      if (!app.isPackaged) return { status: 'development' }
      const result = await autoUpdater.checkForUpdates()
      return { status: 'checking', version: result?.updateInfo?.version || null }
    })
    ipcMain.handle('app:update-download', async () => { await autoUpdater.downloadUpdate(); return { downloaded: true } })
    ipcMain.handle('app:update-install', () => { autoUpdater.quitAndInstall(); return { installing: true } })
    ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }))
  ipcMain.handle('projects:list', readProjects)
    ipcMain.handle('skills:list', skillsWithUsage)
    ipcMain.handle('skills:choose-folder', async () => {
      const result = await dialog.showOpenDialog(mainWindow, { title: 'Import skill folder', properties: ['openDirectory'] })
      return result.canceled ? null : (result.filePaths[0] || null)
    })
    ipcMain.handle('skills:read', async (_event, id) => {
      const skill = (await readSkills()).find(item => item.id === id)
      if (!skill) throw new Error('Skill not found.')
      const parsed = parseSkill(await fs.readFile(path.join(skillsRoot(), id, 'SKILL.md'), 'utf8'), skill.name)
      return { ...skill, content: parsed.body }
    })
    ipcMain.handle('skills:save', async (_event, input) => {
      if (!input || typeof input.name !== 'string' || typeof input.description !== 'string' || typeof input.content !== 'string') throw new Error('Invalid skill details.')
      const name = input.name.trim(), description = input.description.trim(), body = input.content.trim()
      if (!name || !description || !body) throw new Error('Name, description and instructions are required.')
      const id = input.id ? skillId(input.id) : skillId(name)
      const registry = await readSkills(), existing = registry.find(item => item.id === id)
      if (registry.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) throw new Error('Skill already exists.')
      const dir = path.join(skillsRoot(), id), temp = dir + '.tmp-' + crypto.randomUUID(), backup = dir + '.backup'
      await fs.mkdir(temp, { recursive: true })
      const yaml = value => value.replace(/\\/g, '\\\\').replace(/\"/g, '\\\"').replace(/\r?\n/g, ' ')
      await fs.writeFile(path.join(temp, 'SKILL.md'), `---\nname: "${yaml(name)}"\ndescription: "${yaml(description)}"\n---\n\n${body}\n`, 'utf8')
      await fs.writeFile(path.join(temp, 'metadata.json'), JSON.stringify({ category: String(input.category || 'General') }, null, 2), 'utf8')
      await fs.rm(backup, { recursive: true, force: true })
      try {
        if (existing) await fs.rename(dir, backup)
        await fs.rename(temp, dir)
        await writeSkills([...registry.filter(item => item.id !== id), { id, name, description, category: String(input.category || 'General'), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }])
        await fs.rm(backup, { recursive: true, force: true })
      } catch (error) { await fs.rm(dir, { recursive: true, force: true }); try { await fs.rename(backup, dir) } catch {}; await fs.rm(temp, { recursive: true, force: true }); throw error }
      return skillsWithUsage()
    })
    ipcMain.handle('skills:import', async (_event, source) => {
      if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error('Invalid skill folder.')
      const parsed = parseSkill(await fs.readFile(path.join(source, 'SKILL.md'), 'utf8'), path.basename(source))
      const id = skillId(parsed.name), registry = await readSkills()
      if (registry.some(item => item.id === id)) throw new Error('Skill already exists.')
      await fs.mkdir(skillsRoot(), { recursive: true })
      const temp = path.join(skillsRoot(), id + '.tmp-' + crypto.randomUUID()), dest = path.join(skillsRoot(), id)
      await copySkillFolder(source, temp)
      try { await fs.rename(temp, dest); await writeSkills([...registry, { id, name: parsed.name, description: parsed.description, category: 'Imported', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]) }
      catch (error) { await fs.rm(dest, { recursive: true, force: true }); await fs.rm(temp, { recursive: true, force: true }); throw error }
      return skillsWithUsage()
    })
    ipcMain.handle('skills:delete', async (_event, id) => {
      const registry = await readSkills(), skill = registry.find(item => item.id === id)
      if (!skill) throw new Error('Skill not found.')
      const projects = await readProjects(), affected = projects.filter(project => (project.enabledSkillIds || []).includes(id))
      const dir = path.join(skillsRoot(), id), trash = dir + '.deleted-' + crypto.randomUUID()
      await fs.rename(dir, trash)
      try {
        await writeProjects(projects.map(project => ({ ...project, enabledSkillIds: (project.enabledSkillIds || []).filter(value => value !== id) })))
        await writeSkills(registry.filter(item => item.id !== id))
        await fs.rm(trash, { recursive: true, force: true })
      } catch (error) { try { await fs.rename(trash, dir) } catch {}; await writeProjects(projects); await writeSkills(registry); throw error }
      return { skills: await skillsWithUsage(), affectedProjects: affected.map(project => project.name) }
    })
    ipcMain.handle('projects:skills:set', async (_event, { id, skillIds }) => {
      if (!Array.isArray(skillIds)) throw new Error('Invalid skill selection.')
      if (processes.has(id)) throw new Error('Stop project before changing skills.')
      const [projects, registry] = await Promise.all([readProjects(), readSkills()]), project = projects.find(item => item.id === id)
      if (!project) throw new Error('Project not found.')
      const valid = new Set(registry.map(item => item.id)), enabledSkillIds = [...new Set(skillIds)].filter(value => valid.has(value))
      const next = projects.map(item => item.id === id ? { ...item, enabledSkillIds } : item)
      await syncProjectSkills({ ...project, enabledSkillIds })
      await writeProjects(next)
      send('projects:changed', next)
      return next
    })
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
        enabled: true,
        allowAllCommands: input.allowAllCommands !== false,
        enabledSkillIds: [],
      status: 'ready',
    }, ...projects]
    await writeProjects(next)
    send('projects:changed', next)
    return next
  })

  ipcMain.handle('projects:set-enabled', async (_event, { id, enabled }) => {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value.')
      if (processes.has(id)) throw new Error('Stop the project before changing its enabled state.')
      const projects = await readProjects()
      const next = projects.map(project => project.id === id ? { ...project, enabled } : project)
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

    if (project.enabled === false) throw new Error('This project is disabled. Enable it before starting.')
      const skillHome = skillsRoot()
      await fs.mkdir(skillHome, { recursive: true })
      await syncProjectSkills(project)
      const cliPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'jecbridge', 'src', 'cli.js')
      : path.join(__dirname, '..', 'node_modules', 'jecbridge', 'src', 'cli.js')
    const nodeCommand = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'node', 'bin', 'node.exe')
        : path.join(__dirname, '..', 'node_modules', 'node', 'bin', 'node.exe')

    try {
      await fs.access(cliPath)
    } catch {
      throw new Error('JecBridge CLI was not found. Reinstall the application or its dependencies.')
    }

    try {
        await fs.access(nodeCommand)
      } catch {
        throw new Error('The bundled Node.js runtime was not found. Reinstall JecBridge Desktop.')
      }

      // Persist the transitional state before spawning to avoid a fast URL event being overwritten.
    await updateProject(id, { status: 'starting', url: undefined })

    let child
    try {
      const args = [cliPath, project.path, '--tunnel']
      if (project.allowAllCommands !== false) args.push('--allow-all-commands')
      child = spawn(nodeCommand, args, {
        cwd: project.path,
          env: { ...process.env, JECBRIDGE_HOME: skillHome },
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
  autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('update-available', info => send('app:update-status', { status: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => send('app:update-status', { status: 'latest' }))
    autoUpdater.on('download-progress', progress => send('app:update-status', { status: 'downloading', percent: Math.round(progress.percent) }))
    autoUpdater.on('update-downloaded', info => send('app:update-status', { status: 'downloaded', version: info.version }))
    autoUpdater.on('error', error => send('app:update-status', { status: 'error', message: error.message }))
    if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(error => send('app:update-status', { status: 'error', message: error.message })), 5000)
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
