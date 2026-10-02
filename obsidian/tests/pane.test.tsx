import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On } from 'claude-code'

const VAULT = '/vault'
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
  [VAULT]: [entry('Todo.md', 'file'), entry('.obsidian', 'dir'), entry('image.png', 'file'), entry('Projects', 'dir')],
  [`${VAULT}/Projects`]: [entry('Plan.md', 'file')],
}

const NOTES: Record<string, string> = {
  [`${VAULT}/Projects/Plan.md`]: '# The plan',
  '/home/Library/Application Support/obsidian/obsidian.json': JSON.stringify({
    vaults: { a: { path: '/closed' }, b: { path: VAULT, open: true } },
  }),
}

function fakeVault(on: On) {
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home' : undefined }))
  on('fs.list', ($, e) => ({ value: FOLDERS[e.path] ?? [] }))
  on('fs.read', ($, e) => ({ value: NOTES[e.path] ?? '' }))
}

async function mountPane($: Engine) {
  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('lists folders before notes and hides dotfiles and attachments', OPTIONS, async ($, on) => {
  fakeVault(on)

  const ui = await mountPane($)

  const labels = [await ui.find({ key: 'entry:Projects' }), await ui.find({ key: 'entry:Todo.md' })]
  expect(labels.map(found => found?.text)).toEqual(['Projects/', 'Todo'])
  expect(await ui.find({ key: 'entry:.obsidian' })).toBeUndefined()
  expect(await ui.find({ key: 'entry:image.png' })).toBeUndefined()
})

test('opening a note renders its markdown', OPTIONS, async ($, on) => {
  fakeVault(on)
  const ui = await mountPane($)

  await ui.press({ key: 'entry:Projects' })
  await ui.press({ key: 'entry:Plan.md' })

  expect(await ui.find({ type: 'Markdown' })).toMatchObject({ props: { text: '# The plan' } })
})

test('copy path puts the note’s absolute path on the clipboard', OPTIONS, async ($, on) => {
  fakeVault(on)
  const copied: string[] = []
  on('ui.copy', ($, e) => (copied.push(e.text), { value: { isCopied: true } }))
  const ui = await mountPane($)
  await ui.press({ key: 'entry:Projects' })
  await ui.press({ key: 'entry:Plan.md' })

  await ui.press({ key: 'copy' })

  expect(copied).toEqual([`${VAULT}/Projects/Plan.md`])
})

test('uses the vault Obsidian has open when no vault path is set', async ($, on) => {
  fakeVault(on)

  const ui = await mountPane($)

  expect(await ui.find({ key: 'entry:Projects' })).toBeDefined()
})
