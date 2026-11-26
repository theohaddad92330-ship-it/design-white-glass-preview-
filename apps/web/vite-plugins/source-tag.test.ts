import { describe, expect, it } from 'vitest'
import { sourceTag } from './source-tag'

const ROOT = '/repo'

type TransformFn = (code: string, id: string) => { code: string; map: null } | null

/** The plugin object exposes `transform` as a plain function here. */
function transformer(enabled = true): TransformFn {
  const plugin = sourceTag({ root: ROOT, enabled }) as { transform: TransformFn }
  return plugin.transform.bind(plugin)
}

describe('sourceTag', () => {
  it('stamps host elements with their repo-relative source position', () => {
    const code = ['export function A() {', '  return <div className="x">hi</div>', '}'].join('\n')
    const result = transformer()(code, '/repo/apps/web/src/A.tsx')

    expect(result?.code).toContain('data-bellum-src="apps/web/src/A.tsx:2:10"')
  })

  it('keeps line numbers stable — the attribute lands on the line it documents', () => {
    const code = [
      'const a = 1',
      'export const B = () => (',
      '  <section>',
      '    <span>x</span>',
      '  </section>',
      ')',
    ].join('\n')
    const out = transformer()(code, '/repo/apps/web/src/B.tsx')?.code ?? ''

    const lines = out.split('\n')
    expect(lines).toHaveLength(6)
    expect(lines[2]).toContain(':3:3"')
    expect(lines[3]).toContain(':4:5"')
  })

  it('leaves components alone — only real DOM nodes get stamped', () => {
    const code = 'export const C = () => <Button variant="x"><Icon.Left /></Button>'
    const out = transformer()(code, '/repo/apps/web/src/C.tsx')?.code ?? ''

    expect(out).not.toContain('data-bellum-src')
  })

  it('does not stamp twice when the attribute is already authored', () => {
    const code = 'export const D = () => <div data-bellum-src="manual">x</div>'
    // Nothing left to insert, so the file is handed back untouched (null).
    expect(transformer()(code, '/repo/apps/web/src/D.tsx')).toBeNull()
  })

  it('preserves attributes, self-closing tags and expressions', () => {
    const code = 'export const E = ({ v }: { v: string }) => <input value={v} disabled />'
    const out = transformer()(code, '/repo/apps/web/src/E.tsx')?.code ?? ''

    expect(out).toContain('<input data-bellum-src="apps/web/src/E.tsx:1:44" value={v} disabled />')
  })

  it('stays aligned after non-ASCII text — SWC spans are byte offsets', () => {
    const code = [
      '// Résumé du compte — accents, emoji 🚀 et guillemets « »',
      'export const F = () => (',
      '  <div title="crédité">',
      '    <p>Déjà vu</p>',
      '  </div>',
      ')',
    ].join('\n')
    const out = transformer()(code, '/repo/apps/web/src/F.tsx')?.code ?? ''

    expect(out).toContain('<div data-bellum-src="apps/web/src/F.tsx:3:3" title="crédité">')
    expect(out).toContain('<p data-bellum-src="apps/web/src/F.tsx:4:5">Déjà vu</p>')
  })

  it('skips non-tsx files, node_modules and sources outside the repo', () => {
    const transform = transformer()
    expect(transform('const a = <div />', '/repo/apps/web/src/x.ts')).toBeNull()
    expect(transform('<div />', '/repo/node_modules/pkg/y.tsx')).toBeNull()
    expect(transform('<div />', '/elsewhere/z.tsx')).toBeNull()
  })

  it('never throws the build on a file it cannot parse', () => {
    expect(transformer()('export const F = () => <div', '/repo/apps/web/src/F.tsx')).toBeNull()
  })
})
