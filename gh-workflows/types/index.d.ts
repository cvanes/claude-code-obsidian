export type WorkflowRun = {
  id: number
  workflow: string
  title: string
  status: string
  conclusion: string
  event: string
  createdAt: string
  url: string
}

export type WorkflowsView = {
  repo: string
  branch: string
  runs: WorkflowRun[]
  error: string | null
  updatedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'gh-workflows': { view: WorkflowsView }
  }
}
