import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, FsEntry, Register, RenderElement, RenderSurface } from 'claude-code'

import type { VaultView } from '../types'
import { findNote, linkWikilinks, quoteSection, sectionBody, splitNote } from './markdown'
import type { Section } from './markdown'
import {
  displayName,
  fileKind,
  fromFileUrl,
  joinPath,
  parentOf,
  quotePath,
  reference,
  toFileUrl,
  truncate,
} from './paths'

const PANE = 'obsidian'
const TITLE = 'Obsidian'
const PANE_COLUMNS = 40
const MAX_TEXT = 10000
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_INDEX = 10000
const MAX_MATCHES = 50
const OBSIDIAN_CONFIG = 'Library/Application Support/obsidian/obsidian.json'

const view = atom({ plugin: 'obsidian', key: 'view' } as const, {
  dir: '',
  file: null,
  query: '',
} as VaultView)

let configuredVault = ''
let vault: Promise<string | undefined> | undefined
let index: Promise<string[]> | undefined

type Ui = Elements['terminal']
type ObsidianConfig = { vaults?: Record<string, { path: string; open?: boolean }> }
type Context = { ui: Ui; root: string; width: number; surface: RenderSurface }

function isVisible(entry: FsEntry): boolean {
  return !entry.name.startsWith('.') && entry.kind !== 'other'
}

function byFolderThenName(a: FsEntry, b: FsEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
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

async function listFolder($: EngineInterface, root: string, dir: string): Promise<FsEntry[]> {
  return (await $.fs.list(joinPath(root, dir))).filter(isVisible).sort(byFolderThenName)
}

async function walkVault($: EngineInterface, root: string): Promise<string[]> {
  const files: string[] = []
  const pending = ['']
  while (pending.length > 0 && files.length < MAX_INDEX) {
    const dir = pending.shift()!
    for (const entry of await listFolder($, root, dir).catch(() => [])) {
      const path = joinPath(dir, entry.name)
      if (entry.kind === 'dir') pending.push(path)
      else files.push(path)
    }
  }
  return files
}

function vaultIndex($: EngineInterface, root: string): Promise<string[]> {
  index ??= walkVault($, root)
  return index
}

async function readText($: EngineInterface, path: string): Promise<string> {
  try {
    return await $.fs.read(path)
  } catch (error) {
    return `Could not read this file: ${String(error)}`
  }
}

async function insertIntoPrompt($: EngineInterface, text: string) {
  const filled = await $.prompt.fill({ text, mode: 'insert' })
  $.ui.toast(filled.isFilled ? 'Inserted into prompt' : `Could not insert: ${filled.refusal ?? 'no prompt'}`)
}

async function copyText($: EngineInterface, text: string, surface: RenderSurface) {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `Copied ${text}` : `Could not copy: ${copied.reason}`)
}

async function openFile($: EngineInterface, file: string) {
  await update($, view, v => ({ ...v, dir: parentOf(file), file, query: '' }))
}

async function openLink($: EngineInterface, root: string, href: string) {
  const file = fromFileUrl(href).slice(root.length + 1)
  await openFile($, file)
}

function toolbar($: EngineInterface, ctx: Context, buttons: RenderElement[]) {
  const { ui } = ctx
  const close = () => void $.ui.close({ id: PANE })

  return (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={2} marginBottom={1}>
      {buttons}
      <ui.Button key="close" hotkey="x" role="dismiss" dimColor onPress={close}>Close</ui.Button>
    </ui.Box>
  )
}

function heading(ctx: Context, title: string, subtitle?: string) {
  const { ui, width } = ctx

  return (
    <ui.Box flexDirection="column" marginBottom={1}>
      {title && <ui.Text bold color="magenta" wrap="truncate-start">{title}</ui.Text>}
      {subtitle && <ui.Text dimColor wrap="truncate-start">{subtitle}</ui.Text>}
      <ui.Text dimColor>{'─'.repeat(width)}</ui.Text>
    </ui.Box>
  )
}

function fileButton($: EngineInterface, ctx: Context, prefix: string, file: string, label = displayName(file)) {
  const { ui } = ctx
  return (
    <ui.Button key={`${prefix}:${file}`} plain onPress={() => void openFile($, file)}>
      {`  ${label}`}
    </ui.Button>
  )
}

function searchBox($: EngineInterface, ctx: Context, query: string) {
  const { ui } = ctx
  if (!('Input' in ui)) return null
  const search = (value: string) => void update($, view, v => ({ ...v, query: value }))

  return (
    <ui.Box marginBottom={1}>
      <ui.Input key="search" label="Search" placeholder="note name…" value={query} onInput={search} onSubmit={search} />
    </ui.Box>
  )
}

async function renderMatches($: EngineInterface, ctx: Context, query: string) {
  const { ui, root } = ctx
  const wanted = query.toLowerCase()
  const matches = (await vaultIndex($, root)).filter(file => file.toLowerCase().includes(wanted)).slice(0, MAX_MATCHES)

  return (
    <ui.Box flexDirection="column">
      {matches.length === 0 && <ui.Text dimColor>No matches.</ui.Text>}
      {matches.map(file => fileButton($, ctx, 'match', file, file.replace(/\.md$/, '')))}
    </ui.Box>
  )
}

function entryButton($: EngineInterface, ctx: Context, dir: string, entry: FsEntry) {
  const { ui } = ctx
  const path = joinPath(dir, entry.name)
  const isFolder = entry.kind === 'dir'
  const open = () =>
    void (isFolder ? update($, view, v => ({ ...v, dir: path, file: null })) : openFile($, path))

  return (
    <ui.Button key={`entry:${entry.name}`} plain onPress={open}>
      {isFolder ? `▸ ${entry.name}` : `  ${displayName(entry.name)}`}
    </ui.Button>
  )
}

async function renderFolder($: EngineInterface, ctx: Context, { dir, query }: VaultView) {
  const { ui, root } = ctx
  const up = () => void update($, view, v => ({ ...v, dir: parentOf(dir), file: null }))
  const insertFolder = () => void insertIntoPrompt($, `${reference(joinPath(root, dir))} `)
  const buttons = dir
    ? [
        <ui.Button key="up" hotkey="u" onPress={up}>↑ Up</ui.Button>,
        <ui.Button key="insert" hotkey="i" onPress={insertFolder}>Insert</ui.Button>,
      ]
    : []

  return (
    <ui.Box flexDirection="column">
      {toolbar($, ctx, buttons)}
      {searchBox($, ctx, query)}
      {query ? (
        await renderMatches($, ctx, query)
      ) : (
        <ui.Box flexDirection="column">
          {heading(ctx, dir.split('/').join(' › '))}
          {(await listFolder($, root, dir)).map(entry => entryButton($, ctx, dir, entry))}
        </ui.Box>
      )}
    </ui.Box>
  )
}

function noteMarkdown($: EngineInterface, ctx: Context, key: string, text: string, toUrl: (target: string) => string | undefined) {
  const { ui, root } = ctx
  return (
    <ui.Markdown
      key={key}
      text={truncate(linkWikilinks(text, toUrl), MAX_TEXT)}
      onLinkPress={link => void (link.href.startsWith('file://') && openLink($, root, link.href))}
    />
  )
}

function sectionBlock(
  $: EngineInterface,
  ctx: Context,
  section: Section,
  i: number,
  path: string,
  toUrl: (target: string) => string | undefined,
) {
  const { ui } = ctx
  const body = sectionBody(section)
  const insert = () => void insertIntoPrompt($, quoteSection(section, reference(path)))

  return (
    <ui.Box key={`block:${i}`} flexDirection="column" marginTop={1}>
      <ui.Box flexDirection="row" gap={1}>
        <ui.Box flexShrink={1}>
          <ui.Text bold color={section.level === 1 ? 'magenta' : undefined}>{section.heading}</ui.Text>
        </ui.Box>
        <ui.Button key={`section:${i}`} plain dimColor onPress={insert}>⧉</ui.Button>
      </ui.Box>
      {body && noteMarkdown($, ctx, `body:${i}`, body, toUrl)}
    </ui.Box>
  )
}

async function renderNote($: EngineInterface, ctx: Context, path: string) {
  const { ui, root } = ctx
  const { preamble, sections } = splitNote(await readText($, path))
  const files = await vaultIndex($, root)
  const toUrl = (target: string) => {
    const found = findNote(files, target)
    return found ? toFileUrl(joinPath(root, found)) : undefined
  }

  return (
    <ui.Box flexDirection="column">
      {preamble && noteMarkdown($, ctx, 'preamble', preamble, toUrl)}
      {sections.map((section, i) => sectionBlock($, ctx, section, i, path, toUrl))}
    </ui.Box>
  )
}

async function renderImage($: EngineInterface, ctx: Context, path: string) {
  const { ui, width, surface } = ctx
  if (surface !== 'terminal') return <ui.Text dimColor>Image previews show in the terminal only.</ui.Text>

  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) return <ui.Text dimColor>Image too large to preview.</ui.Text>
  return <ui.Image source={{ png: base64 }} columns={width} rows={Math.round(width / 2)} alt={displayName(path)} />
}

async function renderPreview($: EngineInterface, ctx: Context, file: string) {
  const { ui, root } = ctx
  const path = joinPath(root, file)
  const kind = fileKind(file)

  if (kind === 'note') return renderNote($, ctx, path)
  if (kind === 'image') return renderImage($, ctx, path)
  if (kind === 'code') return <ui.Code source={truncate(await readText($, path), MAX_TEXT)} path={file} wrap="wrap" />
  return <ui.Text dimColor>No preview for this file type. Insert or copy its path to share it.</ui.Text>
}

async function renderFile($: EngineInterface, ctx: Context, file: string) {
  const { ui, root, surface } = ctx
  const path = joinPath(root, file)
  const back = () => void update($, view, v => ({ ...v, file: null }))

  const buttons = [
    <ui.Button key="back" hotkey="b" onPress={back}>← Back</ui.Button>,
    <ui.Button key="insert" hotkey="i" variant="primary" onPress={() => void insertIntoPrompt($, `${reference(path)} `)}>
      Insert
    </ui.Button>,
    <ui.Button key="copy" hotkey="c" onPress={press => void copyText($, quotePath(path), press.surface ?? surface)}>
      Copy
    </ui.Button>,
  ]

  return (
    <ui.Box flexDirection="column">
      {toolbar($, ctx, buttons)}
      {heading(ctx, displayName(file), parentOf(file) || undefined)}
      {await renderPreview($, ctx, file)}
    </ui.Box>
  )
}

export const register: Register = (on, options) => {
  configuredVault = typeof options.vaultPath === 'string' ? options.vaultPath : ''
  vault = undefined
  index = undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'obsidian', description: 'Browse your Obsidian vault and share notes as context' })
    return next(e)
  })

  on('command.run', { command: 'obsidian' }, async $ => {
    index = undefined
    await $.ui.open({ id: PANE, title: TITLE, focus: true, columns: PANE_COLUMNS })
    return { text: 'Obsidian pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Ui
    const root = await vaultRoot($)
    if (!root) return <ui.Text dimColor>No Obsidian vault found. Set vaultPath in /config.</ui.Text>

    const ctx: Context = { ui, root, width: Math.max(1, e.props.bodyColumns - 2), surface: e.surface }
    const current = await read($, view)
    const body = current.file
      ? await renderFile($, ctx, current.file)
      : await renderFolder($, ctx, current)
    return <ui.Box paddingX={1} minHeight={e.props.scroll.bodyRows}>{body}</ui.Box>
  })
}
