export {}

type JecBridgeProject = { id: string; name: string; path: string; status: 'ready' | 'starting' | 'running'; url?: string }
type JecBridgeAppInfo = { version: string; electron: string; node: string; platform: string; arch: string }

declare global {
  interface Window {
    jecbridge?: {
      getAppInfo: () => Promise<JecBridgeAppInfo>
      listProjects: () => Promise<JecBridgeProject[]>
      chooseFolder: () => Promise<string | null>
      addProject: (path: string) => Promise<JecBridgeProject[]>
      removeProject: (id: string) => Promise<JecBridgeProject[]>
      startProject: (id: string) => Promise<{ started: boolean }>
      stopProject: (id: string) => Promise<{ stopped: boolean }>
      getLogs: (id: string) => Promise<string>
      onProjectsChanged: (callback: (projects: JecBridgeProject[]) => void) => () => void
      onProcessLog: (callback: (data: { id: string; text: string; url: string | null }) => void) => () => void
      onProcessExit: (callback: (data: { id: string; code: number | null }) => void) => () => void
    }
  }
}
