import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, Folder,
  FolderPlus, LayoutGrid, Link2, MoreHorizontal, Plus, Search,
  Settings2, ShieldCheck, Terminal, Trash2, X, Zap, Info, Cpu, Monitor,
} from 'lucide-react'
import './App.css'
import './skill-ui.css'

type Project = {
  enabled?: boolean
  allowAllCommands?: boolean
  enabledSkillIds?: string[]
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
  const [activePage, setActivePage] = useState<'projects' | 'skills' | 'settings'>('projects')
  const [skills, setSkills] = useState<{ id: string; name: string; description: string; category: string; projects?: { id: string; name: string }[] }[]>([])
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const [skillProjectId, setSkillProjectId] = useState<string | null>(null)
  const [skillDraft, setSkillDraft] = useState({ id: '', name: '', description: '', content: '', category: 'General' })
  const [allowAllCommands, setAllowAllCommands] = useState(true)
  const [appInfo, setAppInfo] = useState<{ version: string; electron: string; node: string; platform: string; arch: string } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; percent?: number; message?: string }>({ status: 'idle' })
  

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (window.jecbridge) {
          const saved = await window.jecbridge.listProjects()
          const loadedSkills = await window.jecbridge.listSkills()
          if (active) setSkills(loadedSkills)
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
      const offUpdate = window.jecbridge?.onUpdateStatus(status => {
        setUpdateStatus(status)
        if (status.status === 'available') notify(`Version ${status.version} is available`)
        else if (status.status === 'downloaded') notify(`Version ${status.version} is ready to install`)
        else if (status.status === 'error') notify(status.message || 'Update failed')
        else if (status.status === 'latest') notify('You are using the latest version')
      })
    return () => { active = false; offProjects?.(); offLogs?.(); offExit?.(); offUpdate?.() }
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
        const next = await window.jecbridge.addProject(path, allowAllCommands)
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
        <button className={`nav-item ${activePage === 'skills' ? 'active' : ''}`} onClick={() => setActivePage('skills')}><Zap size={17} /> My Skills <span className="nav-count">{skills.length}</span></button>
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

        <section className="content">{activePage === 'skills' ? <div className="settings-page"><div className="page-heading"><div><div className="eyebrow"><Zap size={13} /> GLOBAL LIBRARY</div><h1>My Skills</h1><p>Reusable instructions shared across selected projects.</p></div><div><button className="secondary-button" onClick={async () => { if (!window.jecbridge) return; const folder = await window.jecbridge.chooseSkillFolder(); if (folder) { try { setSkills(await window.jecbridge.importSkill(folder)); notify('Skill imported') } catch (error) { notify(error instanceof Error ? error.message : 'Import failed') } } }}>Import folder</button> <button className="primary-button" onClick={() => { setSkillDraft({ id: '', name: '', description: '', content: '', category: 'General' }); setSkillEditorOpen(true) }}><Plus size={15}/> Create skill</button></div></div><div className="project-grid">{skills.map(skill => <article className="project-card" key={skill.id}><div className="card-top"><div className="folder-icon"><Zap size={20}/></div><span className="status">{skill.projects?.length || 0} projects</span></div><h3>{skill.name}</h3><p className="project-path">{skill.description}</p><div className="card-divider"/><div className="card-bottom"><button className="text-action" onClick={async () => { if (!window.jecbridge) return; const item = await window.jecbridge.readSkill(skill.id); setSkillDraft({ id: item.id, name: item.name, description: item.description, content: item.content, category: item.category || 'General' }); setSkillEditorOpen(true) }}>Edit</button><button className="text-action" onClick={async () => { if (!window.jecbridge || !window.confirm(`Delete ${skill.name} from ${skill.projects?.length || 0} projects?`)) return; try { const result = await window.jecbridge.deleteSkill(skill.id); setSkills(result.skills); setProjects(await window.jecbridge.listProjects()); notify('Skill deleted') } catch (error) { notify(error instanceof Error ? error.message : 'Delete failed') } }}><Trash2 size={13}/> Delete</button></div></article>)}</div>{!skills.length && <div className="empty-state"><strong>No skills yet</strong><p>Create a skill or import a folder containing SKILL.md.</p></div>}</div> : activePage === 'settings' ? <div className="settings-page"><div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> APP SETTINGS</div><h1>Settings</h1><p>Application details, runtime requirements and security.</p></div></div><div className="settings-layout"><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Info size={18} /></div><div><h2>About JecBridge Desktop</h2><p>Your local bridge between project folders and AI tools.</p></div></div><div className="app-identity"><div className="app-identity-mark"><img src="./icon.svg" alt="" /></div><div><strong>JecBridge Desktop</strong><span>Desktop MCP workspace</span></div><b>v{appInfo?.version || '2.0.0'}</b></div><div className="settings-detail-list"><div><span>Application version</span><strong>{appInfo?.version || '2.0.0'}</strong></div><div><span>Electron</span><strong>{appInfo?.electron || '—'}</strong></div><div><span>Node.js requirement</span><strong>22 or newer</strong></div><div><span>Node.js runtime</span><strong>{appInfo?.node || '—'}</strong></div></div></article><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon blue"><Monitor size={18} /></div><div><h2>System information</h2><p>Workspace overview.</p></div></div><div className="settings-detail-list"><div><span>Projects in workspace</span><strong>{projects.length}</strong></div><div><span>Active MCP connections</span><strong>{projects.filter(project => project.status === 'running').length}</strong></div><div><span>Application platform</span><strong>{appInfo ? `${appInfo.platform} · ${appInfo.arch}` : '—'}</strong></div></div></article><article className="settings-card security-card"><div className="settings-card-heading"><div className="settings-icon green"><ShieldCheck size={18} /></div><div><h2>Privacy & security</h2><p>How JecBridge protects local project access.</p></div></div><ul className="security-list"><li><Check size={15} /><span><strong>Local project list</strong><small>Project folder paths are stored in this device's app data.</small></span></li><li><Check size={15} /><span><strong>Private MCP endpoints</strong><small>Tunnel URLs are secret access links. Do not share them publicly.</small></span></li><li><Check size={15} /><span><strong>Isolated renderer</strong><small>Node integration is disabled and access is exposed through a restricted preload bridge.</small></span></li></ul></article><article className="settings-card"><div className="settings-card-heading"><div className="settings-icon purple"><Cpu size={18} /></div><div><h2>Requirements</h2><p>Needed to start a local MCP server.</p></div></div><div className="requirement-row"><div><strong>Node.js 22 or newer</strong><small>Required by the JecBridge CLI.</small></div><span className="requirement-status"><i /> Required</span></div><div className="requirement-row"><div><strong>JecBridge CLI</strong><small>Included with this application.</small></div><span className="requirement-status"><i /> Bundled</span></div></article></div><div className="settings-footer"><span>JecBridge Desktop · Version {appInfo?.version || '2.0.0'}</span><div className="update-actions"><span className={`update-state update-${updateStatus.status}`}>{updateStatus.status === 'available' ? `Version ${updateStatus.version} available` : updateStatus.status === 'downloading' ? `Downloading · ${updateStatus.percent || 0}%` : updateStatus.status === 'downloaded' ? `Version ${updateStatus.version} ready` : updateStatus.status === 'latest' ? 'You are up to date' : updateStatus.status === 'checking' ? 'Checking for updates…' : updateStatus.status === 'error' ? 'Update check failed' : 'Updates'}</span>{updateStatus.status === 'available' ? <button onClick={async () => { try { await window.jecbridge?.downloadUpdate() } catch (error) { notify(error instanceof Error ? error.message : 'Download failed') } }}>Download update</button> : updateStatus.status === 'downloaded' ? <button onClick={() => window.jecbridge?.installUpdate()}>Restart & install</button> : <button disabled={updateStatus.status === 'checking' || updateStatus.status === 'downloading'} onClick={async () => { if (!window.jecbridge) return; setUpdateStatus({ status: 'checking' }); try { const result = await window.jecbridge.checkForUpdates(); if (result.status === 'development') { setUpdateStatus({ status: 'development' }); notify('Updates are checked in packaged builds only') } } catch (error) { setUpdateStatus({ status: 'error', message: error instanceof Error ? error.message : 'Update check failed' }); notify(error instanceof Error ? error.message : 'Update check failed') } }}>Check for updates</button>}</div><button onClick={() => setActivePage('projects')}>Back to projects <ArrowUpRight size={14} /></button></div></div> : <>
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
              <div className="console-toggle-row"><button className="console-toggle" onClick={() => setSkillProjectId(project.id)}>Skills ({project.enabledSkillIds?.length || 0})</button><label className={`project-switch ${project.enabled === false ? 'is-off' : 'is-on'}`} title={project.status === 'running' || project.status === 'starting' ? 'Stop the connection before changing project status' : (project.enabled === false ? 'Enable project' : 'Disable project')}><span>{project.enabled === false ? 'Disabled' : 'Enabled'}</span><input type="checkbox" role="switch" checked={project.enabled !== false} disabled={project.status === 'running' || project.status === 'starting'} onChange={async event => { if (!window.jecbridge) return; try { setProjects(await window.jecbridge.setProjectEnabled(project.id, event.target.checked)); notify(event.target.checked ? 'Project enabled' : 'Project disabled') } catch (error) { notify(error instanceof Error ? error.message : 'Could not update project') } }}/><i /></label><button className="console-toggle" onClick={() => setConsoleProjectId(project.id)}><Terminal size={13} /> Show console <ArrowUpRight size={12} /></button></div>
                {expandedLogs[project.id] && <pre className="project-logs">{logs[project.id] || 'No console output yet.'}</pre>}
            </article>)}
            <button className="add-card" onClick={() => setModalOpen(true)}><span className="add-card-icon"><Plus size={20} /></span><strong>Add a project</strong><small>Select a folder to create an MCP connection</small></button>
          </div> : <div className="empty-state"><div className="empty-icon"><Search size={23} /></div><strong>{search ? 'No projects found' : 'No projects yet'}</strong><p>{search ? 'Try a different search term.' : 'Get started by adding your first local project.'}</p></div>}

          <div className="tip-banner"><div className="tip-icon"><Terminal size={18} /></div><div><strong>How does JecBridge work?</strong><p>Add a project, start an MCP tunnel, then paste the generated URL into your AI tool.</p></div><button onClick={() => notify('Documentation is coming soon')} aria-label="Learn more"><ArrowUpRight size={17} /></button></div>
          <footer><span>JecBridge Desktop <b>·</b> CLI integration</span><span>Made for local AI workflows</span></footer>
            </>}
        </section>
      </main>

      {skillEditorOpen && <div className="modal-backdrop skill-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSkillEditorOpen(false) }}><form className="modal skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-modal-title" onSubmit={async event => { event.preventDefault(); if (!window.jecbridge) return; try { setSkills(await window.jecbridge.saveSkill(skillDraft)); setSkillEditorOpen(false); notify('Skill saved') } catch (error) { notify(error instanceof Error ? error.message : 'Could not save skill') } }}><div className="skill-modal-top"><div className="skill-modal-brand"><div className="modal-icon"><Zap size={20}/></div><div><span className="skill-modal-kicker">GLOBAL SKILL LIBRARY</span><h2 id="skill-modal-title">{skillDraft.id ? 'Edit skill' : 'Create a skill'}</h2></div></div><button type="button" className="icon-button" onClick={() => setSkillEditorOpen(false)} aria-label="Close"><X size={18}/></button></div><p className="modal-description">Create reusable instructions that your selected projects can share. Updates apply everywhere this skill is enabled.</p><div className="skill-form-grid"><div className="skill-form-field"><label className="field-label" htmlFor="skill-name">Skill name</label><input id="skill-name" className="skill-text-input" value={skillDraft.name} onChange={e => setSkillDraft(v => ({...v,name:e.target.value}))} placeholder="e.g. React expert" required maxLength={60}/><small>A clear, recognizable name.</small></div><div className="skill-form-field"><label className="field-label" htmlFor="skill-category">Category</label><select id="skill-category" className="skill-text-input" value={skillDraft.category} onChange={e => setSkillDraft(v => ({...v,category:e.target.value}))}><option>General</option><option>Development</option><option>Design</option><option>Marketing</option><option>Data</option><option>DevOps</option><option>Writing</option></select><small>Helps organize your library.</small></div></div><div className="skill-form-field"><label className="field-label" htmlFor="skill-description">Description</label><input id="skill-description" className="skill-text-input" value={skillDraft.description} onChange={e => setSkillDraft(v => ({...v,description:e.target.value}))} placeholder="What should this skill help the AI do?" required maxLength={180}/><small>Shown in your skill library so you can find it quickly.</small></div><div className="skill-form-field skill-instructions-field"><div className="instructions-label-row"><label className="field-label" htmlFor="skill-content">Instructions</label><span>MARKDOWN SUPPORTED</span></div><textarea id="skill-content" className="skill-textarea" rows={10} value={skillDraft.content} onChange={e => setSkillDraft(v => ({...v,content:e.target.value}))} placeholder={'# Role\nDescribe what the AI should do...\n\n## Guidelines\n- Add clear, actionable steps\n- Include examples when useful'} required/><small>Write specific steps, rules and examples. These instructions are shared with every project using this skill.</small></div><div className="skill-modal-tip"><ShieldCheck size={16}/><span><strong>One skill, many projects</strong> — save it once and manage which projects can use it from each project card.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSkillEditorOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!skillDraft.name.trim() || !skillDraft.description.trim() || !skillDraft.content.trim()}>{skillDraft.id ? 'Save changes' : 'Create skill'} <ArrowUpRight size={14}/></button></div></form></div>}
        {skillProjectId && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSkillProjectId(null) }}><section className="modal"><div className="modal-heading"><div className="modal-icon"><Zap size={20}/></div><button className="icon-button" onClick={() => setSkillProjectId(null)}><X size={18}/></button></div><h2>Project skills</h2><p className="modal-description">Choose global skills for this project. Changes to a skill are shared automatically.</p>{skills.map(skill => <label className="requirement-row" key={skill.id}><span><strong>{skill.name}</strong><small>{skill.description}</small></span><input type="checkbox" checked={(projects.find(p => p.id === skillProjectId)?.enabledSkillIds || []).includes(skill.id)} onChange={async event => { if (!window.jecbridge) return; const project = projects.find(p => p.id === skillProjectId); if (!project) return; const ids = project.enabledSkillIds || []; try { setProjects(await window.jecbridge.setProjectSkills(project.id, event.target.checked ? [...ids, skill.id] : ids.filter(id => id !== skill.id))) } catch (error) { notify(error instanceof Error ? error.message : 'Could not update skills') } }}/></label>)}<div className="modal-actions"><button className="primary-button" onClick={() => setSkillProjectId(null)}>Done</button></div></section></div>}
        {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
        <form className="modal" onSubmit={addProject}>
          <div className="modal-heading"><div className="modal-icon"><FolderPlus size={20} /></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18} /></button></div>
          <h2>Add a project</h2><p className="modal-description">Choose the project folder you want to connect to AI tools.</p>
          <label className="field-label" htmlFor="project-path">Project folder</label>
          <div className="path-input"><Folder size={17} /><input id="project-path" autoFocus value={projectPath} onChange={e => setProjectPath(e.target.value)} placeholder="e.g. C:/Projects/my-app" /><button type="button" onClick={() => void chooseFolder()}><FolderPlus size={15} /> Browse</button></div>
          <div className="field-hint">The project name is detected from the folder name.</div><label className="requirement-row"><span><strong>Allow all commands</strong><small>Disable to use only commands permitted by JecBridge. Enabling this gives the connected AI broad command access.</small></span><input type="checkbox" checked={allowAllCommands} onChange={event => setAllowAllCommands(event.target.checked)}/></label>
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
