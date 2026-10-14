export type FileKind = 'note' | 'code' | 'image' | 'other'

const CODE_EXTENSIONS = new Set([
  'txt', 'json', 'yaml', 'yml', 'csv', 'tsv', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx',
  'py', 'sh', 'sql', 'toml', 'ini', 'canvas', 'base', 'log',
])

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/')
}

export function parentOf(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

export function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

export function extensionOf(path: string): string {
  const name = baseName(path)
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
}

export function displayName(path: string): string {
  return baseName(path).replace(/\.md$/, '')
}

export function fileKind(path: string): FileKind {
  const extension = extensionOf(path)
  if (extension === 'md') return 'note'
  if (extension === 'png') return 'image'
  return CODE_EXTENSIONS.has(extension) ? 'code' : 'other'
}

export function quotePath(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path
}

export function reference(path: string): string {
  return `@${quotePath(path)}`
}

export function toFileUrl(path: string): string {
  return `file://${encodeURI(path)}`
}

export function fromFileUrl(url: string): string {
  return decodeURI(url.replace(/^file:\/\//, ''))
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 40)}\n\n… truncated`
}
