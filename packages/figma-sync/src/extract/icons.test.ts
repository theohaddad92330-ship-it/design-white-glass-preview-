import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readIcon } from './icons'

const HEADER = '/**\n * @license lucide-react - ISC\n */\n'

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lucide-'))
  for (const [name, src] of Object.entries(files)) writeFileSync(join(dir, name), src)
  return dir
}

describe('readIcon — lucide-react 0.x (.js) et 1.x (.mjs)', () => {
  // #4895.6 — sous lucide-react 1.x, `briefcase` EXISTE (briefcase.mjs) : le build de figma-sync disait
  // « introuvable » parce que le lecteur ne cherchait que `briefcase.js`. `briefcase` est la première icône
  // du tri, donc la première à tomber : ce n'est pas une icône retirée, c'est une extension.
  const v1 = `${HEADER}import createLucideIcon from '../createLucideIcon.mjs';
const __iconData = {
  name: "briefcase",
  size: 24,
  node: [
    ["path", { d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", key: "jecpp" }],
    ["rect", { width: "20", height: "14", x: "2", y: "6", rx: "2", key: "i6l2r4" }]
  ]
};
export { __iconData, Briefcase as default };
`
  it('lit une icône 1.x (.mjs)', () => {
    const svg = readIcon('briefcase', dirWith({ 'briefcase.mjs': v1 }))
    expect(svg).toContain('<path d="M16 20V4')
    expect(svg).toContain('<rect width="20" height="14"')
  })
  it('suit un alias 1.x (.mjs → .mjs)', () => {
    const dir = dirWith({
      'briefcase.mjs': v1,
      'work.mjs': `${HEADER}export { default } from './briefcase.mjs';\n`,
    })
    expect(readIcon('work', dir)).toContain('<rect width="20"')
  })
  it('lit toujours une icône 0.x (.js)', () => {
    const v0 = `import createLucideIcon from '../createLucideIcon.js';\nconst Dot = createLucideIcon("Dot", [["circle", { cx: "12", cy: "12", r: "1", key: "x" }]]);\nexport { Dot as default };\n`
    expect(readIcon('dot', dirWith({ 'dot.js': v0 }))).toContain('<circle cx="12" cy="12" r="1"/>')
  })
  it('sait dire NON : une icône absente lève, nommée', () => {
    expect(() => readIcon('absente', dirWith({}))).toThrow(/Icône lucide introuvable : absente/)
  })
})
