import { expect, test } from 'claude-code/testing'

import { findNote, linkWikilinks, splitNote } from '../hooks/markdown'
import { reference } from '../hooks/paths'

test('a note splits into its preamble and sections, ignoring headings in code fences', () => {
  const note = 'Intro\n# One\nText\n```\n# not a heading\n```\n## Two\nMore'

  const { preamble, sections } = splitNote(note)

  expect([preamble, ...sections.map(section => section.heading)]).toEqual(['Intro', 'One', 'Two'])
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
