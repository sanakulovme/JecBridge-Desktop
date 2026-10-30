import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, Folder,
  FolderPlus, LayoutGrid, Link2, MoreHorizontal, Plus, Search,
  Settings2, ShieldCheck, Terminal, Trash2, X, Zap, Info, Cpu, Monitor,
} from 'lucide-react'
import './App.css'

type Project = {
  id: string
  name: string
  path: string
  status: 'ready' | 'starting' | 'running'
  url?: string
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [consoleProjectId, setConsoleProjectId] = useState<string | null>(null)
  const [expandedLogs] = useState<Record<string, boolean>>({})
  const [activePage, setActivePage] = useState<'projects' | 'settings'>('projects')
  const [appInfo, setAppInfo] = useState<{ version: string; electron: string; node: string; platform: string; arch: string } | null>(null)
  

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (window.jecbridge) {
          const saved = await window.jecbridge.listProjects()
          if (active) setProjects(saved)
        } else {
          const saved = localStorage.getItem('jecbridge-projects')
          if (active && saved) setProjects(JSON.parse(saved) as Project[])
        }
      } catch {
        if (active) notify('Failed to load projects')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    if (window.jecbridge) void window.jecbridge.getAppInfo().then(setAppInfo).catch(() => undefined)
      const offProjects = window.jecbridge?.onProjectsChanged((next) => setProjects(next))
    const offLogs = window.jecbridge?.onProcessLog(({ id, text }) => setLogs(current => ({ ...current, [id]: (current[id] || '').concat(text).slice(-5000) })))
    const offExit = window.jecbridge?.onProcessExit(({ code }) => notify(code === 0 ? 'MCP server stopped' : code === -1 ? 'Could not start the MCP process. Check the logs.' : `MCP process exited with code ${code ?? 'unknown'}`))
    return () => { active = false; offProjects?.(); offLogs?.(); offExit?.() }
  }, [])

  const filteredProjects = useMemo(
    () => projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()) || project.path.toLowerCase().includes(search.toLowerCase())),
    [projects, search],
  )

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  async function chooseFolder() {
    if (!window.jecbridge) { notify('Folder selection is available in the desktop app only'); return }
    try {
      const selected = await window.jecbridge.chooseFolder()
      if (selected) setProjectPath(selected)
    } catch { notify('Failed to select folder') }
  }

  async function addProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = projectPath.trim()
    if (!path) return
    try {
      if (window.jecbridge) {
        const next = await window.jecbridge.addProject(path)
          setProjects(next)
          const added = next[0]
          if (added) {
            setLogs(current => ({ ...current, [added.id]: '' }))
            await window.jecbridge.startProject(added.id)
            notify('Project added · waiting for MCP endpoint')
          }
      } else {
        const normalized = path.replace(/\\/g, '/').replace(/\/$/, '')
        if (projects.some((project) => project.path.toLowerCase() === normalized.toLowerCase())) { notify('This project has already been added'); return }
        const name = normalized.split('/').filter(Boolean).pop() || 'New project'
        const next = [{ id: crypto.randomUUID(), name, path: normalized, status: 'ready' as const }, ...projects]
        setProjects(next)
        localStorage.setItem('jecbridge-projects', JSON.stringify(next))
      }
      setProjectPath('')
      setModalOpen(false)
      if (!window.jecbridge) notify('Project added successfully')
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not add project') }
  }

  async function manageProject(project: Project) {
    if (!window.jecbridge) { notify('MCP controls are available in the desktop app only'); return }
    try {
      if (project.status === 'running' || project.status === 'starting') {
        await window.jecbridge.stopProject(project.id)
        notify('Stop request sent')
      } else {
        setLogs(current => ({ ...current, [project.id]: '' }))
        await window.jecbridge.startProject(project.id)
        notify('JecBridge CLI started')
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not control the process') }
  }

  function copyUrl(url?: string) {
    if (!url) {
      notify('MCP endpoint is not available yet')
      return
    }
    void navigator.clipboard.writeText(url)
    notify('MCP URL copied to clipboard')
  }

  async function removeProject(id: string) {
    try {
      if (window.jecbridge) setProjects(await window.jecbridge.removeProject(id))
      else {
        const next = projects.filter((project) => project.id !== id)
        setProjects(next)
        localStorage.setItem('jecbridge-projects', JSON.stringify(next))
      }
      setActiveMenu(null)
      notify('Project removed')
    } catch { notify('Failed to remove project') }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="./logo-dark.svg" alt="JecBridge" />
          
          <span className="brand-version">DESKTOP</span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`nav-item ${activePage === 'projects' ? 'active' : ''}`} onClick={() => setActivePage('projects')}><LayoutGrid size={17} /> Projects <span className="nav-count">{projects.length}</span></button>
        <button className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => setActivePage('settings')}><Settings2 size={17} /> Settings</button>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-icon"><ShieldCheck size={17} /></div>
            <div><strong>Local-first</strong><small>Your data stays on this device</small></div>
          </div>
          <button className="nav-item help-link" onClick={() => notify('Help center is coming soon')}><CircleHelp size={17} /> Help Center <ArrowUpRight size={14} /></button>
          <div className="profile-row"><div className="avatar">A</div><div><strong>Workspace</strong><small>Personal workspace</small></div><MoreHorizontal size={18} className="muted-icon" /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{activePage === 'projects' ? 'Projects' : 'Settings'}</strong></div>
          <div className="topbar-right"><span className="system-status"><i /> System ready</span><button className="icon-button" onClick={() => setActivePage('settings')} aria-label="Settings"><Settings2 size={18} /></button></div>
        </header>

        <section className="content">{activePage === 'settings' ? <div className="settings-page"><div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> APP SETTINGS</div><h1>Settings</h1><p>Application details, runtime requirements and security.</p></div></div><div className="settings-layout"><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Info size={18} /></div><div><h2>About JecBridge Desktop</h2><p>Your local bridge between project folders and AI tools.</p></div></div><div className="app-identity"><div className="app-identity-mark"><img src="./icon.svg" alt="" /></div><div><strong>JecBridge Desktop</strong><span>Desktop MCP workspace</span></div><b>v{appInfo?.version || '0.1.0'}</b></div><div className="settings-detail-list"><div><span>Application version</span><strong>{appInfo?.version || '0.1.0'}</strong></div><div><span>Electron</span><strong>{appInfo?.electron || '—'}</strong></div><div><span>Node.js requirement</span><strong>22 or newer</strong></div><div><span>Node.js runtime</span><strong>{appInfo?.node || '—'}</strong></div></div></article><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon blue"><Monitor size={18} /></div><div><h2>System information</h2><p>Workspace overview.</p></div></div><div className="settings-detail-list"><div><span>Projects in workspace</span><strong>{projects.length}</strong></div><div><span>Active MCP connections</span><strong>{projects.filter(project => project.status === 'running').length}</strong></div><div><span>Application platform</span><strong>{appInfo ? `${appInfo.platform} · ${appInfo.arch}` : '—'}</strong></div></div></article><article className="settings-card security-card"><div className="settings-card-heading"><div className="settings-icon green"><ShieldCheck size={18} /></div><div><h2>Privacy & security</h2><p>How JecBridge protects local project access.</p></div></div><ul className="security-list"><li><Check size={15} /><span><strong>Local project list</strong><small>Project folder paths are stored in this device's app data.</small></span></li><li><Check size={15} /><span><strong>Private MCP endpoints</strong><small>Tunnel URLs are secret access links. Do not share them publicly.</small></span></li><li><Check size={15} /><span><strong>Isolated renderer</strong><small>Node integration is disabled and access is exposed through a restricted preload bridge.</small></span></li></ul></article><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon purple"><Cpu size={18} /></div><div><h2>Requirements</h2><p>Needed to start a local MCP server.</p></div></div><div className="requirement-row"><div><strong>Node.js 22 or newer</strong><small>Required by the JecBridge CLI.</small></div><span className="requirement-status"><i /> Required</span></div><div className="requirement-row"><div><strong>JecBridge CLI</strong><small>Included with this application.</small></div><span className="requirement-status"><i /> Bundled</span></div></article></div><div className="settings-footer"><span>JecBridge Desktop · Version {appInfo?.version || '0.1.0'}</span><button onClick={() => setActivePage('projects')}>Back to projects <ArrowUpRight size={14} /></button></div></div> : <>
          <div className="page-heading">
            <div><div className="eyebrow"><Zap size={13} /> MCP WORKSPACE</div><h1>Your projects</h1><p>Connect your local projects to AI tools from one place.</p></div>
            <button className="primary-button" onClick={() => setModalOpen(true)}><Plus size={17} /> Add project</button>
          </div>

          <div className="stats-row">
            <div className="stat-card"><div className="stat-icon purple"><Folder size={17} /></div><div><small>Total projects</small><strong>{projects.length}</strong></div></div>
            <div className="stat-card"><div className="stat-icon green"><Activity size={17} /></div><div><small>Active connections</small><strong>{projects.filter(p => p.status === 'running').length}</strong></div></div>
            <div className="stat-card"><div className="stat-icon blue"><Link2 size={17} /></div><div><small>MCP servers</small><strong>{projects.filter(p => p.url).length}</strong></div></div>
          </div>

          <div className="section-toolbar"><div><h2>All projects</h2><span>{projects.length} projects</span></div><label className="search-box"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." /></label></div>

          {loading ? <div className="empty-state"><strong>Loading projects...</strong></div> : filteredProjects.length ? <div className="project-grid">
            {filteredProjects.map(project => <article className="project-card" key={project.id}>
              <div className="card-top"><div className="folder-icon"><Folder size={21} /></div><div className="card-menu-wrap"><button className="icon-button subtle" onClick={() => setActiveMenu(activeMenu === project.id ? null : project.id)} aria-label="Project menu"><MoreHorizontal size={19} /></button>{activeMenu === project.id && <div className="dropdown"><button onClick={() => void removeProject(project.id)}><Trash2 size={14} /> Remove</button></div>}</div></div>
              <h3>{project.name}</h3><p className="project-path" title={project.path}>{project.path}</p>
              <div className="card-divider" />
              <div className="card-bottom"><span className={`status ${project.status === 'running' ? 'ready' : ''}`}><i /> {project.status === 'running' ? 'Connected' : project.status === 'starting' ? 'Starting' : 'Ready'}</span><button className="text-action" onClick={() => void manageProject(project)}>{project.status === 'running' || project.status === 'starting' ? 'Stop' : 'Start'} <ArrowUpRight size={14} /></button></div>
              {project.status === 'starting' && !project.url && <div className="endpoint-panel endpoint-loading"><span className="loading-spinner" /><div><strong>Creating MCP connection</strong><small>Waiting for your private endpoint...</small></div></div>}
                {project.url && <div className="endpoint-panel"><div className="endpoint-heading"><span className="endpoint-indicator" /><span>MCP ENDPOINT</span><span className="endpoint-secure">PRIVATE LINK</span></div><div className="endpoint-value" aria-label="Partially hidden MCP endpoint"><span>{project.url.slice(0, Math.ceil(project.url.length / 2))}</span><span className="endpoint-blur">{project.url.slice(Math.ceil(project.url.length / 2))}</span></div><button className="endpoint-copy" onClick={() => copyUrl(project.url)}><Copy size={14} /> Copy endpoint</button><p className="endpoint-hint">The endpoint is partially hidden for privacy. Copy to use the full URL.</p></div>}
              <div className="console-toggle-row"><button className="console-toggle" onClick={() => setConsoleProjectId(project.id)}><Terminal size={13} /> Show console <ArrowUpRight size={12} /></button></div>
                {expandedLogs[project.id] && <pre className="project-logs">{logs[project.id] || 'No console output yet.'}</pre>}
            </article>)}
            <button className="add-card" onClick={() => setModalOpen(true)}><span className="add-card-icon"><Plus size={20} /></span><strong>Add a project</strong><small>Select a folder to create an MCP connection</small></button>
          </div> : <div className="empty-state"><div className="empty-icon"><Search size={23} /></div><strong>{search ? 'No projects found' : 'No projects yet'}</strong><p>{search ? 'Try a different search term.' : 'Get started by adding your first local project.'}</p></div>}

          <div className="tip-banner"><div className="tip-icon"><Terminal size={18} /></div><div><strong>How does JecBridge work?</strong><p>Add a project, start an MCP tunnel, then paste the generated URL into your AI tool.</p></div><button onClick={() => notify('Documentation is coming soon')} aria-label="Learn more"><ArrowUpRight size={17} /></button></div>
          <footer><span>JecBridge Desktop <b>·</b> CLI integration</span><span>Made for local AI workflows</span></footer>
            </>}
        </section>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
        <form className="modal" onSubmit={addProject}>
          <div className="modal-heading"><div className="modal-icon"><FolderPlus size={20} /></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18} /></button></div>
          <h2>Add a project</h2><p className="modal-description">Choose the project folder you want to connect to AI tools.</p>
          <label className="field-label" htmlFor="project-path">Project folder</label>
          <div className="path-input"><Folder size={17} /><input id="project-path" autoFocus value={projectPath} onChange={e => setProjectPath(e.target.value)} placeholder="e.g. C:/Projects/my-app" /><button type="button" onClick={() => void chooseFolder()}><FolderPlus size={15} /> Browse</button></div>
          <div className="field-hint">The project name is detected from the folder name.</div>
          <div className="modal-note"><ShieldCheck size={16} /><span>The selected folder path is stored locally on your computer.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!projectPath.trim()}>Add project <ChevronDown size={15} className="rotate-icon" /></button></div>
        </form>
      </div>}
      {consoleProjectId && <div className="modal-backdrop console-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setConsoleProjectId(null) }}><section className="console-modal" role="dialog" aria-modal="true" aria-labelledby="console-title"><div className="console-modal-heading"><div><div className="console-modal-eyebrow"><Terminal size={13} /> LIVE OUTPUT</div><h2 id="console-title">{projects.find(project => project.id === consoleProjectId)?.name} console</h2></div><button type="button" className="icon-button" onClick={() => setConsoleProjectId(null)} aria-label="Close console"><X size={18} /></button></div><pre className="project-logs console-output">{logs[consoleProjectId] || "No console output yet."}</pre><div className="console-modal-footer"><span>Live process output · Latest 5,000 characters</span><button className="secondary-button" onClick={() => setConsoleProjectId(null)}>Close</button></div></section></div>}
        {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}

export default App
