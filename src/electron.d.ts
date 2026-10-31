export {}

type JecBridgeProject = { id: string; name: string; path: string; status: 'ready' | 'starting' | 'running'; url?: string; enabled?: boolean; allowAllCommands?: boolean; enabledSkillIds?: string[] }
type JecBridgeSkill = { id: string; name: string; description: string; category: string; createdAt: string; updatedAt: string; projects?: { id: string; name: string }[] }
type JecBridgeAppInfo = { version: string; electron: string; node: string; platform: string; arch: string }

declare global {
  interface Window {
    jecbridge?: {
      getAppInfo: () => Promise<JecBridgeAppInfo>
      checkForUpdates: () => Promise<{ status: string; version?: string | null }>
      downloadUpdate: () => Promise<{ downloaded: boolean }>
      installUpdate: () => Promise<{ installing: boolean }>
      onUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void
      listProjects: () => Promise<JecBridgeProject[]>
      chooseFolder: () => Promise<string | null>
      addProject: (path: string, allowAllCommands?: boolean) => Promise<JecBridgeProject[]>
      removeProject: (id: string) => Promise<JecBridgeProject[]>
      setProjectEnabled: (id: string, enabled: boolean) => Promise<JecBridgeProject[]>
      setProjectSkills: (id: string, skillIds: string[]) => Promise<JecBridgeProject[]>
      listSkills: () => Promise<JecBridgeSkill[]>
      readSkill: (id: string) => Promise<JecBridgeSkill & { content: string }>
      saveSkill: (input: { id?: string; name: string; description: string; content: string; category?: string }) => Promise<JecBridgeSkill[]>
      deleteSkill: (id: string) => Promise<{ skills: JecBridgeSkill[]; affectedProjects: string[] }>
      chooseSkillFolder: () => Promise<string | null>
      importSkill: (folder: string) => Promise<JecBridgeSkill[]>
      startProject: (id: string) => Promise<{ started: boolean }>
      stopProject: (id: string) => Promise<{ stopped: boolean }>
      getLogs: (id: string) => Promise<string>
      onProjectsChanged: (callback: (projects: JecBridgeProject[]) => void) => () => void
      onProcessLog: (callback: (data: { id: string; text: string; url: string | null }) => void) => () => void
      onProcessExit: (callback: (data: { id: string; code: number | null }) => void) => () => void
    }
  }
}
