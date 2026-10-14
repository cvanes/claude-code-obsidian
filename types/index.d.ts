export type VaultView = {
  dir: string
  file: string | null
  query: string
  showSections: boolean
}

declare module 'claude-code' {
  interface PluginState {
    obsidian: { view: VaultView }
  }
}
