import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { WorkflowRun, WorkflowsView } from '../types'

const PANE = 'gh-workflows'
const TITLE = 'Workflows'
const PANE_COLUMNS = 50
const POLL_MS = 10_000
const RUN_LIMIT = 15
const RUN_FIELDS = 'databaseId,workflowName,displayTitle,status,conclusion,event,createdAt,url'

const view = atom({ plugin: 'gh-workflows', key: 'view' } as const, {
  repo: '',
  branch: '',
  runs: [],
  error: null,
  updatedAt: null,
} as WorkflowsView)

let watch: Timer | undefined

type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'>
type GhRun = {
  databaseId: number
  workflowName: string
  displayTitle: string
  status: string
  conclusion: string
  event: string
  createdAt: string
  url: string
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  success: { icon: '✓', color: 'green' },
  failure: { icon: '✗', color: 'red' },
  startup_failure: { icon: '✗', color: 'red' },
  timed_out: { icon: '✗', color: 'red' },
  cancelled: { icon: '⊘', color: 'gray' },
  skipped: { icon: '−', color: 'gray' },
  in_progress: { icon: '●', color: 'yellow' },
  queued: { icon: '○', color: 'yellow' },
}

function statusIcon(run: WorkflowRun) {
  const key = run.status === 'completed' ? run.conclusion : run.status
  return STATUS_ICONS[key] ?? { icon: '○', color: 'gray' }
}

function age(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / (60 * 24))}d ago`
}

function toRun(run: GhRun): WorkflowRun {
  return {
    id: run.databaseId,
    workflow: run.workflowName,
    title: run.displayTitle,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    createdAt: run.createdAt,
    url: run.url,
  }
}

async function gh($: EngineInterface, argv: string[]): Promise<string> {
  const result = await $.process.run(argv)
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `${argv.join(' ')} failed`)
  return result.stdout.trim()
}

async function fetchView($: EngineInterface): Promise<Omit<WorkflowsView, 'updatedAt'>> {
  const branch = await gh($, ['git', 'branch', '--show-current'])
  const repo = await gh($, ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const runs: GhRun[] = JSON.parse(
    await gh($, ['gh', 'run', 'list', '--branch', branch, '--limit', String(RUN_LIMIT), '--json', RUN_FIELDS]),
  )
  return { repo, branch, runs: runs.map(toRun), error: null }
}

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  try {
    const fresh = await fetchView($)
    await update($, view, () => ({ ...fresh, updatedAt: now }))
  } catch (error) {
    await update($, view, v => ({ ...v, error: error instanceof Error ? error.message : String(error), updatedAt: now }))
  }
}

function startWatching($: EngineInterface) {
  if (watch) return
  watch = $.clock.every(POLL_MS, () => void refresh($))
  void refresh($)
}

function stopWatching() {
  watch?.cancel()
  watch = undefined
}

function renderRun(ui: Ui, run: WorkflowRun, now: number) {
  const { Box, Text, Link } = ui
  const { icon, color } = statusIcon(run)

  return (
    <Box key={`run:${run.id}`} flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={color}>{icon}</Text>
        <Link href={run.url} label={run.workflow} />
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor wrap="truncate-end">
          {run.title} · {run.event} · {age(run.createdAt, now)}
        </Text>
      </Box>
    </Box>
  )
}

async function renderPane($: EngineInterface, ui: Ui, width: number) {
  const { Box, Text, Button } = ui
  const { repo, branch, runs, error, updatedAt } = await read($, view)
  const now = await $.clock.now()
  const close = () => {
    stopWatching()
    void $.ui.close({ id: PANE })
  }
  const refreshNow = () => void refresh($)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Button key="refresh" hotkey="r" onPress={refreshNow}>Refresh</Button>
        <Button key="close" hotkey="x" role="dismiss" dimColor onPress={close}>Close</Button>
      </Box>
      {repo && <Text bold color="magenta" wrap="truncate-start">{repo}</Text>}
      {branch && <Text dimColor>⎇ {branch}</Text>}
      <Text dimColor>{'─'.repeat(width)}</Text>
      <Box flexDirection="column" marginTop={1}>
        {updatedAt === null && <Text dimColor>Loading runs…</Text>}
        {error && <Text color="red">{error}</Text>}
        {updatedAt !== null && !error && runs.length === 0 && <Text dimColor>No runs on this branch.</Text>}
        {runs.map(run => renderRun(ui, run, now))}
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  stopWatching()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gh-workflows', description: 'Show live GitHub Actions runs for this branch' })
    return next(e)
  })

  on('command.run', { command: 'gh-workflows' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true, columns: PANE_COLUMNS })
    return { text: 'Workflows pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    startWatching($)
    return renderPane($, $.ui.resolve(e), Math.max(1, e.props.bodyColumns - 2))
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopWatching()
    return next(e)
  })
}
