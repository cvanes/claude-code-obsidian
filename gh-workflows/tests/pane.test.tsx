import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'gh-workflows',
  component: 'Pane',
  requestId: 'gh-workflows',
  props: {
    title: 'Workflows',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const RUNS = [
  {
    databaseId: 1,
    workflowName: 'CI',
    displayTitle: 'Add pane',
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    createdAt: '1970-01-01T00:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
  },
]

function fakeGh(on: On): string[][] {
  const calls: string[][] = []
  on('process.run', ($, e) => {
    calls.push([...e.argv])
    const stdout = e.argv[0] === 'git' ? 'main' : e.argv[2] === 'view' ? 'o/r' : JSON.stringify(RUNS)
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return calls
}

const runListCalls = (calls: string[][]) => calls.filter(argv => argv[1] === 'run').length

async function mountPane($: Engine) {
  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('lists the runs for the current branch', async ($, on) => {
  mock.clock(on)
  const calls = fakeGh(on)

  const ui = await mountPane($)

  expect(await ui.find({ type: 'Link' })).toMatchObject({ props: { label: 'CI', href: RUNS[0]!.url } })
  expect(calls).toContainEqual(expect.arrayContaining(['run', 'list', '--branch', 'main']))
})

test('polls while the pane is open', async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeGh(on)
  await mountPane($)
  const before = runListCalls(calls)

  await clock.advance(10_000)

  expect(runListCalls(calls)).toBe(before + 1)
})

test('stops polling when the close button is pressed', async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeGh(on)
  on('ui.close', () => ({ value: undefined }))
  const ui = await mountPane($)
  await ui.press({ key: 'close' })
  await ui.unmount()
  const before = runListCalls(calls)

  await clock.advance(30_000)

  expect(runListCalls(calls)).toBe(before)
})
