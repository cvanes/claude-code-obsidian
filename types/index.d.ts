export type VaultView = {
  dir: string
  file: string | null
  query: string
  showSections: boolean
}

export type SavedNotes = {
  recent: string[]
  starred: string[]
}

declare module 'claude-code' {
  interface PluginState {
    obsidian: { view: VaultView; saved: SavedNotes }
  }
}
