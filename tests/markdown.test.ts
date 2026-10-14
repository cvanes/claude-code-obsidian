import { expect, test } from 'claude-code/testing'

import { findNote, linkWikilinks, sections } from '../hooks/markdown'
import { reference } from '../hooks/paths'

test('sections split a note by heading and ignore headings in code fences', () => {
  const note = '# One\nText\n```\n# not a heading\n```\n## Two\nMore'

  const found = sections(note)

  expect(found.map(section => section.heading)).toEqual(['One', 'Two'])
})

test('wikilinks become links to the resolved note, keeping their alias', () => {
  const toUrl = (target: string) => (target === 'Plan' ? 'file:///v/Plan.md' : undefined)

  const linked = linkWikilinks('See [[Plan|the plan]] and [[Missing]]', toUrl)

  expect(linked).toBe('See [the plan](file:///v/Plan.md) and Missing')
})

test('notes are found by name regardless of folder or case', () => {
  const files = ['Projects/Big Plan.md', 'Todo.md']

  const found = findNote(files, 'big plan')

  expect(found).toBe('Projects/Big Plan.md')
})

test('references quote paths with spaces only', () => {
  const paths = ['/v/Plan.md', '/v/Big Plan.md']

  const references = paths.map(reference)

  expect(references).toEqual(['@/v/Plan.md', '@"/v/Big Plan.md"'])
})
