export type VaultView = {
  dir: string
  file: string | null
  query: string
}

declare module 'claude-code' {
  interface PluginState {
    obsidian: { view: VaultView }
  }
}
