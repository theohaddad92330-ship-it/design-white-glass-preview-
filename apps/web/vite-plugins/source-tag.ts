import path from 'node:path'
import { parseSync } from '@swc/core'
import type { PluginOption } from 'vite'

/**
 * Stamps every host JSX element with `data-bellum-src="file:line:col"` so the
 * in-app bug reporter can name the exact line of source behind whatever the
 * user clicked — in production too, where React strips `_debugSource` and the
 * minifier mangles component names.
 *
 * Implementation: parse with SWC, then splice the attribute into the original
 * text right after each opening tag name. No codegen, so the output stays
 * byte-identical apart from the inserted attributes and line numbers never
 * shift (an attribute is always inserted on the line it documents).
 */

const ATTRIBUTE = 'data-bellum-src'
/**
 * SWC reports a module's span from its first *token*, so a file opening with a
 * comment would make us mis-locate every span. Parsing a one-byte statement
 * ahead of the source pins the base to a known offset.
 */
const PROLOGUE = ';'

type Span = { start: number; end: number }
type Node = { type?: string; span?: Span; [key: string]: unknown }

export function sourceTag({ root, enabled = true }: { root: string; enabled?: boolean }): PluginOption {
  return {
    name: 'bellum-source-tag',
    enforce: 'pre',
    apply: () => enabled,
    transform(code, id) {
      const [filename] = id.split('?')
      if (!filename || !filename.endsWith('.tsx')) return null
      if (filename.includes('/node_modules/')) return null
      if (!code.includes('<')) return null

      const relative = path.relative(root, filename)
      // Only stamp first-party sources; anything outside the repo is noise.
      if (relative.startsWith('..')) return null

      let inserts: { at: number; text: string }[]
      try {
        inserts = collectInserts(code, relative)
      } catch {
        // A file we can't parse is a file the react plugin will report on
        // properly a moment later — never fail the build here.
        return null
      }
      if (inserts.length === 0) return null

      // Splice back-to-front so earlier offsets stay valid.
      let out = code
      for (let i = inserts.length - 1; i >= 0; i -= 1) {
        const { at, text } = inserts[i]!
        out = `${out.slice(0, at)}${text}${out.slice(at)}`
      }
      return { code: out, map: null }
    },
  }
}

function collectInserts(code: string, relative: string): { at: number; text: string }[] {
  const parsed = PROLOGUE + code
  const module = parseSync(parsed, { syntax: 'typescript', tsx: true, target: 'es2022' })
  // SWC spans are UTF-8 byte offsets into a process-global source map. The
  // prologue pins the base; byte offsets then have to be mapped back to JS
  // string indices or every accented character shifts the result.
  const base = (module as unknown as Node).span?.start ?? 0
  const toByteOffset = makeByteToCharIndex(parsed)
  const toCharIndex = (spanStart: number) => toByteOffset(spanStart - base) - PROLOGUE.length
  const lineStarts = buildLineStarts(code)
  const inserts: { at: number; text: string }[] = []

  walk(module as unknown as Node, node => {
    if (node.type !== 'JSXOpeningElement') return
    const name = node.name as Node | undefined
    // Host elements only (`div`, `button`): a capitalised or dotted name is a
    // component, whose own render output gets stamped where it is authored.
    if (!name || name.type !== 'Identifier') return
    const tag = String(name['value'] ?? '')
    if (!tag || tag[0] !== tag[0]!.toLowerCase()) return

    const nameSpan = name.span
    const elementSpan = node.span
    if (!nameSpan || !elementSpan) return

    const attributes = (node['attributes'] as Node[] | undefined) ?? []
    if (attributes.some(isSourceAttribute)) return

    const { line, column } = positionOf(toCharIndex(elementSpan.start), lineStarts)
    inserts.push({
      at: toCharIndex(nameSpan.end),
      text: ` ${ATTRIBUTE}="${relative}:${line}:${column}"`,
    })
  })

  return inserts.sort((a, b) => a.at - b.at)
}

function isSourceAttribute(attribute: Node): boolean {
  const name = attribute['name'] as Node | undefined
  return name?.type === 'Identifier' && name['value'] === ATTRIBUTE
}

function walk(node: Node | Node[] | null | undefined, visit: (node: Node) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'span') continue
    walk(node[key] as Node, visit)
  }
}

/**
 * Maps a UTF-8 byte offset to a JS string index. Pure ASCII files — most of
 * them — take the identity fast path and allocate nothing.
 */
function makeByteToCharIndex(code: string): (byteOffset: number) => number {
  if (!hasNonAscii(code)) return byteOffset => byteOffset

  const charToByte = new Uint32Array(code.length + 1)
  let bytes = 0
  for (let index = 0; index < code.length; index += 1) {
    charToByte[index] = bytes
    const codePoint = code.codePointAt(index)!
    bytes += utf8Length(codePoint)
    if (codePoint > 0xffff) {
      // Surrogate pair: the trailing unit shares the character's end offset.
      index += 1
      charToByte[index] = bytes
    }
  }
  charToByte[code.length] = bytes

  return byteOffset => {
    let low = 0
    let high = code.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (charToByte[mid]! < byteOffset) low = mid + 1
      else high = mid
    }
    return low
  }
}

/** Any code unit above 127 makes a UTF-8 byte offset diverge from a string index. */
function hasNonAscii(code: string): boolean {
  for (let index = 0; index < code.length; index += 1) {
    if (code.charCodeAt(index) > 127) return true
  }
  return false
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

function buildLineStarts(code: string): number[] {
  const starts = [0]
  for (let i = 0; i < code.length; i += 1) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

function positionOf(offset: number, lineStarts: number[]): { line: number; column: number } {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (lineStarts[mid]! <= offset) low = mid
    else high = mid - 1
  }
  return { line: low + 1, column: offset - lineStarts[low]! + 1 }
}
