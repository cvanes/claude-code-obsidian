import { baseName, displayName } from './paths'

export type Section = { heading: string; level: number; text: string }

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/
const WIKILINK = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g

export type Note = { preamble: string; sections: Section[] }

export function splitNote(markdown: string): Note {
  const preamble: string[] = []
  const found: Section[] = []
  let isInFence = false
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) isInFence = !isInFence
    const heading = isInFence ? null : HEADING.exec(line)
    if (heading) found.push({ heading: heading[2]!, level: heading[1]!.length, text: line })
    else if (found.length > 0) found[found.length - 1]!.text += `\n${line}`
    else preamble.push(line)
  }
  return {
    preamble: preamble.join('\n').trim(),
    sections: found.map(section => ({ ...section, text: section.text.trim() })),
  }
}

export function sectionBody(section: Section): string {
  return section.text.split('\n').slice(1).join('\n').trim()
}

export function quoteSection(section: Section, source: string): string {
  const quoted = section.text.split('\n').map(line => `> ${line}`).join('\n')
  return `From ${source}:\n${quoted}\n`
}

export function findNote(files: readonly string[], target: string): string | undefined {
  const wanted = target.trim().toLowerCase()
  const matches = (file: string) =>
    [file, file.replace(/\.md$/, ''), baseName(file), displayName(file)].some(name => name.toLowerCase() === wanted)
  return files.find(matches)
}

export function linkWikilinks(markdown: string, toUrl: (target: string) => string | undefined): string {
  return markdown.replace(WIKILINK, (whole, embed: string, target: string, heading = '', alias?: string) => {
    const label = alias ?? `${target}${heading}`
    const url = toUrl(target)
    if (!url) return embed ? whole : label
    return `[${label}](${url})`
  })
}
