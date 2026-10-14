import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On } from 'claude-code'

const VAULT = '/My Vault'
const PLAN = `${VAULT}/Projects/Big Plan.md`
const OPTIONS = { options: { vaultPath: VAULT } }
const PANE = {
  plugin: 'obsidian',
  component: 'Pane',
  requestId: 'obsidian',
  props: {
    title: 'Obsidian',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const entry = (name: string, kind: FsEntry['kind']): FsEntry => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })

const FOLDERS: Record<string, FsEntry[]> = {
  [VAULT]: [entry('Todo.md', 'file'), entry('.obsidian', 'dir'), entry('data.json', 'file'), entry('Projects', 'dir')],
  [`${VAULT}/Projects`]: [entry('Big Plan.md', 'file')],
}

const FILES: Record<string, string> = {
  [PLAN]: '# Goals\nShip it\n## Risks\nNone',
  [`${VAULT}/Todo.md`]: 'See [[Big Plan|the plan]]',
  [`${VAULT}/data.json`]: '{ "a": 1 }',
  '/home/Library/Application Support/obsidian/obsidian.json': JSON.stringify({
    vaults: { a: { path: '/closed' }, b: { path: VAULT, open: true } },
  }),
}

function fakeVault(on: On) {
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home' : undefined }))
  on('fs.list', ($, e) => ({ value: FOLDERS[e.path] ?? [] }))
  on('fs.read', ($, e) => ({ value: FILES[e.path] ?? '' }))
}

function recordPrompt(on: On): string[] {
  const inserted: string[] = []
  on('prompt.fill', ($, e) => (inserted.push(e.text), { isFilled: true }))
  return inserted
}

async function openPlan($: Engine) {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'entry:Projects' })
  await ui.press({ key: 'entry:Big Plan.md' })
  return ui
}

test('lists folders first and hides dotfiles', OPTIONS, async ($, on) => {
  fakeVault(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  const labels = ['entry:Projects', 'entry:data.json', 'entry:Todo.md'].map(key => ui.find({ key }))
  expect((await Promise.all(labels)).map(found => found?.text)).toEqual(['▸ Projects', '  data.json', '  Todo'])
  expect(await ui.find({ key: 'entry:.obsidian' })).toBeUndefined()
})

test('opening a note renders its markdown', OPTIONS, async ($, on) => {
  fakeVault(on)

  const ui = await openPlan($)

  expect(await ui.find({ type: 'Markdown' })).toMatchObject({ props: { text: FILES[PLAN] } })
})

test('opening a code file renders it as code', OPTIONS, async ($, on) => {
  fakeVault(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'entry:data.json' })

  expect(await ui.find({ type: 'Code' })).toMatchObject({ props: { source: '{ "a": 1 }' } })
})

test('insert puts a quoted @ reference into the prompt', OPTIONS, async ($, on) => {
  fakeVault(on)
  const inserted = recordPrompt(on)
  const ui = await openPlan($)

  await ui.press({ key: 'insert' })

  expect(inserted).toEqual([`@"${PLAN}" `])
})

test('copy quotes a path that has spaces', OPTIONS, async ($, on) => {
  fakeVault(on)
  const copied: string[] = []
  on('ui.copy', ($, e) => (copied.push(e.text), { value: { isCopied: true } }))
  const ui = await openPlan($)

  await ui.press({ key: 'copy' })

  expect(copied).toEqual([`"${PLAN}"`])
})

test('selecting a section inserts it as a quote', OPTIONS, async ($, on) => {
  fakeVault(on)
  const inserted = recordPrompt(on)
  const ui = await openPlan($)
  await ui.press({ key: 'sections' })

  await ui.press({ key: 'section:1' })

  expect(inserted).toEqual([`From @"${PLAN}":\n> ## Risks\n> None\n`])
})

test('pressing a wikilink opens the linked note', OPTIONS, async ($, on) => {
  fakeVault(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'entry:Todo.md' })

  await ui.press({ key: 'note', link: { href: `file://${encodeURI(PLAN)}` } })

  expect(await ui.find({ type: 'Markdown' })).toMatchObject({ props: { text: FILES[PLAN] } })
})

test('search finds notes in subfolders', OPTIONS, async ($, on) => {
  fakeVault(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.input({ key: 'search', text: 'plan', kind: 'change' })

  expect(await ui.find({ key: 'match:Projects/Big Plan.md' })).toBeDefined()
})

test('uses the vault Obsidian has open when no vault path is set', async ($, on) => {
  fakeVault(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ key: 'entry:Projects' })).toBeDefined()
})

test('the close button closes the pane', OPTIONS, async ($, on) => {
  fakeVault(on)
  const closed: string[] = []
  on('ui.close', ($, e) => (closed.push(e.id), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'close' })

  expect(closed).toEqual(['obsidian'])
})
