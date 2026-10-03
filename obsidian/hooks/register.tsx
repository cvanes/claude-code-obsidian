import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, FsEntry, Register, RenderElement, RenderSurface } from 'claude-code'

import type { VaultView } from '../types'

const PANE = 'obsidian'
const TITLE = 'Obsidian'
const PANE_COLUMNS = 40
const MAX_MARKDOWN = 10000
const OBSIDIAN_CONFIG = 'Library/Application Support/obsidian/obsidian.json'

const view = atom({ plugin: 'obsidian', key: 'view' } as const, {
  dir: '',
  file: null,
} as VaultView)

let configuredVault = ''
let vault: Promise<string | undefined> | undefined

type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Markdown'>
type ObsidianConfig = { vaults?: Record<string, { path: string; open?: boolean }> }

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/')
}

function parentOf(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

function visibleEntries(entries: FsEntry[]): FsEntry[] {
  const isNote = (entry: FsEntry) => entry.kind === 'file' && entry.name.endsWith('.md')
  return entries
    .filter(entry => !entry.name.startsWith('.'))
    .filter(entry => entry.kind === 'dir' || isNote(entry))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

function truncate(text: string): string {
  return text.length <= MAX_MARKDOWN ? text : `${text.slice(0, MAX_MARKDOWN)}\n\n_… note truncated_`
}

async function openVault($: EngineInterface): Promise<string | undefined> {
  const home = await $.env.get('HOME')
  if (!home) return undefined
  try {
    const config: ObsidianConfig = JSON.parse(await $.fs.read(joinPath(home, OBSIDIAN_CONFIG)))
    const vaults = Object.values(config.vaults ?? {})
    return (vaults.find(vault => vault.open) ?? vaults[0])?.path
  } catch {
    return undefined
  }
}

function vaultRoot($: EngineInterface): Promise<string | undefined> {
  vault ??= configuredVault ? Promise.resolve(configuredVault) : openVault($)
  return vault
}

async function readNote($: EngineInterface, path: string): Promise<string> {
  try {
    return truncate(await $.fs.read(path))
  } catch (error) {
    return `_Could not read this note: ${String(error)}_`
  }
}

async function copyPath($: EngineInterface, path: string, surface: RenderSurface) {
  const copied = await $.ui.copy({ text: path, surface })
  $.ui.toast(copied.isCopied ? `Copied ${path}` : `Could not copy: ${copied.reason}`)
}

function header($: EngineInterface, ui: Ui, buttons: RenderElement[], title: string, width: number) {
  const { Box, Text, Button } = ui
  const close = () => void $.ui.close({ id: PANE })

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" gap={2}>
        {buttons}
        <Button key="close" hotkey="x" role="dismiss" dimColor onPress={close}>Close</Button>
      </Box>
      {title && (
        <Box marginTop={1}>
          <Text bold color="magenta" wrap="truncate-start">{title}</Text>
        </Box>
      )}
      <Text dimColor>{'─'.repeat(width)}</Text>
    </Box>
  )
}

async function renderNote($: EngineInterface, ui: Ui, root: string, file: string, width: number) {
  const { Box, Text, Button, Markdown } = ui
  const path = joinPath(root, file)
  const back = () => void update($, view, v => ({ ...v, file: null }))
  const name = file.split('/').pop()!.replace(/\.md$/, '')
  const buttons = [
    <Button key="back" hotkey="b" onPress={back}>← Back</Button>,
    <Button key="copy" hotkey="c" variant="primary" onPress={press => void copyPath($, path, press.surface)}>
      Copy path
    </Button>,
  ]

  return (
    <Box flexDirection="column">
      {header($, ui, buttons, name, width)}
      {parentOf(file) && <Text dimColor wrap="truncate-start">{parentOf(file)}</Text>}
      <Box marginTop={1}>
        <Markdown text={await readNote($, path)} />
      </Box>
    </Box>
  )
}

async function renderFolder($: EngineInterface, ui: Ui, root: string, dir: string, width: number) {
  const { Box, Text, Button } = ui
  const entries = visibleEntries(await $.fs.list(joinPath(root, dir)))
  const open = (entry: FsEntry) => () =>
    void update($, view, v =>
      entry.kind === 'dir' ? { dir: joinPath(dir, entry.name), file: null } : { ...v, file: joinPath(dir, entry.name) },
    )
  const up = () => void update($, view, () => ({ dir: parentOf(dir), file: null }))
  const buttons = dir ? [<Button key="up" hotkey="u" onPress={up}>↑ Up</Button>] : []

  return (
    <Box flexDirection="column">
      {header($, ui, buttons, dir.split('/').join(' › '), width)}
      {entries.length === 0 && <Text dimColor>No notes here.</Text>}
      {entries.map(entry => (
        <Button key={`entry:${entry.name}`} plain onPress={open(entry)}>
          {entry.kind === 'dir' ? `▸ ${entry.name}` : `  ${entry.name.replace(/\.md$/, '')}`}
        </Button>
      ))}
    </Box>
  )
}

export const register: Register = (on, options) => {
  configuredVault = typeof options.vaultPath === 'string' ? options.vaultPath : ''
  vault = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'obsidian', description: 'Browse your Obsidian vault in a side pane' })
    return next(e)
  })

  on('command.run', { command: 'obsidian' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true, columns: PANE_COLUMNS })
    return { text: 'Obsidian pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const root = await vaultRoot($)
    if (!root) return <ui.Text dimColor>No Obsidian vault found. Set vaultPath in /config.</ui.Text>

    const { dir, file } = await read($, view)
    const width = Math.max(1, e.props.bodyColumns - 2)
    const body = file ? await renderNote($, ui, root, file, width) : await renderFolder($, ui, root, dir, width)
    return <ui.Box paddingX={1}>{body}</ui.Box>
  })
}
