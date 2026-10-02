export type VaultView = { dir: string; file: string | null }

declare module 'claude-code' {
  interface PluginState {
    obsidian: { view: VaultView }
  }
}
