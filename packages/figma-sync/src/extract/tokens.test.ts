import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractTokens, readSources, REPO_ROOT } from './tokens'

/*
 * Le VRAI fichier d'abord : un extracteur testé seulement sur un fixture peut
 * être vert pendant que tokens.css a changé de forme sous lui.
 */
describe('extractTokens — sur les vrais fichiers du dépôt', () => {
  const set = extractTokens(readSources())

  it('extrait la rampe primaire complète 50 → 900, en primitives', () => {
    const names = set.primitives.map(p => p.name)
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(names).toContain(`primary/${step}`)
    }
    const p500 = set.primitives.find(p => p.name === 'primary/500')
    expect(p500?.cssVar).toBe('--bellum-primary-500')
    // #5b3ee8
    expect(p500?.value.r).toBeCloseTo(0x5b / 255, 5)
    expect(p500?.value.a).toBe(1)
  })

  it('range les quatre couleurs sémantiques en primitives', () => {
    const names = set.primitives.map(p => p.name)
    expect(names).toEqual(
      expect.arrayContaining(['semantic/success', 'semantic/warning', 'semantic/danger', 'semantic/info']),
    )
  })

  it('donne deux modes aux couleurs de surface, pris dans :root et .dark', () => {
    const bg = set.colors.find(c => c.cssVar === '--bellum-bg')
    expect(bg?.name).toBe('bg/default')
    // Théo DS §1.1 — #f5f5f8 en clair, #0b0b0e en sombre.
    expect(bg?.light).toEqual({ kind: 'color', rgba: { r: 0xf5 / 255, g: 0xf5 / 255, b: 0xf8 / 255, a: 1 } })
    expect(bg?.dark.kind).toBe('color')
    if (bg?.dark.kind === 'color') expect(bg.dark.rgba.r).toBeCloseTo(0x0b / 255, 5)
  })

  it('garde un var(--bellum-primary-…) comme ALIAS, pas comme valeur recopiée', () => {
    const halo = set.colors.find(c => c.cssVar === '--bellum-guide-halo')
    expect(halo?.light).toEqual({ kind: 'alias', ref: '--bellum-primary-500' })
    expect(halo?.dark).toEqual({ kind: 'alias', ref: '--bellum-primary-400' })
  })

  it('garde le rgba en {r,g,b,a}, y compris la syntaxe à espaces `rgb(9 9 11 / 0.38)`', () => {
    const veil = set.colors.find(c => c.cssVar === '--bellum-guide-veil')
    expect(veil?.light).toEqual({ kind: 'color', rgba: { r: 9 / 255, g: 9 / 255, b: 11 / 255, a: 0.38 } })
    // Théo DS §1.1 — les `-bg` sombres sont devenus opaques ; la bordure douce reste translucide.
    const soft = set.colors.find(c => c.cssVar === '--accent-soft-border')
    expect(soft?.name).toBe('soft/accent/border')
    expect(soft?.dark).toEqual({ kind: 'color', rgba: { r: 139 / 255, g: 92 / 255, b: 246 / 255, a: 0.42 } })
  })

  it('un token déclaré seulement dans :root vaut la même chose dans les deux modes (la cascade)', () => {
    const base = set.colors.find(c => c.cssVar === '--bg-base')
    expect(base?.light).toEqual({ kind: 'alias', ref: '--bellum-bg' })
    expect(base?.dark).toEqual(base?.light)
  })

  it('résout color-mix(in srgb, var(--X) N%, transparent) PAR MODE — même RVB que --X, alpha = N/100', () => {
    // --border-subtle: color-mix(in srgb, var(--bellum-border) 60%, transparent)
    // --bellum-border : #e5e6ee en clair, #2b2b32 en sombre (Théo DS §1.1).
    const subtle = set.colors.find(c => c.cssVar === '--border-subtle')
    expect(subtle?.name).toBe('legacy/border-subtle')
    expect(subtle?.light).toEqual({ kind: 'color', rgba: { r: 0xe5 / 255, g: 0xe6 / 255, b: 0xee / 255, a: 0.6 } })
    expect(subtle?.dark).toEqual({ kind: 'color', rgba: { r: 0x2b / 255, g: 0x2b / 255, b: 0x32 / 255, a: 0.6 } })
    // --border-active: color-mix(in srgb, var(--bellum-primary-500) 40%, transparent)
    // --bellum-primary-500 est une primitive : même valeur dans les deux modes.
    const active = set.colors.find(c => c.cssVar === '--border-active')
    expect(active?.light).toEqual({ kind: 'color', rgba: { r: 0x5b / 255, g: 0x3e / 255, b: 0xe8 / 255, a: 0.4 } })
    expect(active?.dark).toEqual(active?.light)
    expect(set.skipped.map(s => s.cssVar)).not.toContain('--border-subtle')
    expect(set.skipped.map(s => s.cssVar)).not.toContain('--border-active')
  })

  it('liste la hauteur de barre mobile (dépend du viewport) sans l’inventer — exclusion VOULUE, pas une anomalie', () => {
    const skipped = set.skipped.find(s => s.cssVar === '--bellum-mobile-nav-height')
    expect(skipped?.reason).toMatch(/viewport/)
    expect(skipped?.intended).toBe(true)
  })

  it('extrait les rayons de tokens.css et le --radius shadcn de index.css', () => {
    expect(set.radius).toEqual([
      // Théo DS §1.5 — les rayons par rôle, déclarés avant l'échelle historique.
      { name: 'role/card', cssVar: '--bellum-radius-card', value: 10 },
      { name: 'role/overlay', cssVar: '--bellum-radius-overlay', value: 12 },
      { name: 'role/control', cssVar: '--bellum-radius-control', value: 8 },
      { name: 'role/badge', cssVar: '--bellum-radius-badge', value: 6 },
      { name: 'sm', cssVar: '--radius-sm', value: 6 },
      { name: 'md', cssVar: '--radius-md', value: 10 },
      { name: 'lg', cssVar: '--radius-lg', value: 14 },
      { name: 'xl', cssVar: '--radius-xl', value: 20 },
      { name: 'shadcn', cssVar: '--radius', value: 10 },
      { name: 'rounded-sm', className: 'rounded-sm', value: 6 },
      { name: 'rounded-md', className: 'rounded-md', value: 8 },
      { name: 'rounded-xl', className: 'rounded-xl', value: 12 },
    ])
  })

  it('rayons Tailwind des composants : calc(var(--radius) - n) du config, sinon le thème par défaut installé', () => {
    // rounded-md = calc(var(--radius) - 2px) (tailwind.config.ts) ; rounded-xl = 0.75rem (défaut Tailwind 3.4).
    expect(set.radius.find(r => r.name === 'rounded-md')?.value).toBe(8)
    expect(set.radius.find(r => r.name === 'rounded-xl')?.value).toBe(12)
  })

  it('ombres Tailwind des composants (shadow-xs/sm/md/lg) extraites du thème installé — xs ajoutée au config (apps/web/tailwind.config.ts)', () => {
    const md = set.shadows.find(s => s.name === 'md')
    expect(md?.className).toBe('shadow-md')
    expect(md?.light).toHaveLength(2)
    expect(md?.light[0]).toMatchObject({ x: 0, y: 4, blur: 6, spread: -1, color: { r: 0, g: 0, b: 0, a: 0.1 } })
    expect(md?.dark).toEqual(md?.light)
    expect(set.shadows.map(s => s.name)).toEqual(expect.arrayContaining(['xs', 'sm', 'md', 'lg']))
    const xs = set.shadows.find(s => s.name === 'xs')
    expect(xs?.className).toBe('shadow-xs')
    expect(xs?.light).toEqual([{ x: 0, y: 1, blur: 2, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.05 } }])
    expect(xs?.dark).toEqual(xs?.light)
    expect(set.skipped.map(s => s.cssVar)).not.toContain('shadow-xs')
  })

  it('extrait les z-index de tailwind.config.ts', () => {
    expect(set.zIndex).toEqual([
      { name: 'nav', value: 40 },
      { name: 'overlay', value: 60 },
      { name: 'guide', value: 65 },
      { name: 'toast', value: 70 },
      { name: 'widget', value: 80 },
      { name: 'picker', value: 90 },
      { name: 'devtools', value: 100 },
    ])
  })

  it('pose l’échelle d’espacement Tailwind utilisée (4 → 64)', () => {
    expect(set.spacing.map(s => s.value)).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64])
    expect(set.spacing[0]).toEqual({ name: '1', value: 4 })
  })

  it('extrait les ombres par mode, anneau de bordure résolu ET nommé', () => {
    const card = set.shadows.find(s => s.cssVar === '--shadow-card')
    expect(card?.light).toHaveLength(2)
    expect(card?.light[0]).toMatchObject({ x: 0, y: 1, blur: 3, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.08 } })
    expect(card?.dark[0]?.color.a).toBe(0.3)
    expect(card?.light[1]).toMatchObject({ x: 0, y: 0, blur: 0, spread: 1, ref: '--bellum-border' })
    // #e5e6ee en clair, #2b2b32 en sombre (Théo DS §1.1)
    expect(card?.light[1]?.color.r).toBeCloseTo(0xe5 / 255, 5)
    expect(card?.dark[1]?.color.r).toBeCloseTo(0x2b / 255, 5)
    expect(set.shadows.filter(s => s.cssVar).map(s => s.cssVar)).toEqual([
      '--bellum-shadow-card',
      '--bellum-shadow-overlay',
      '--shadow-card',
      '--shadow-elevated',
      '--shadow-glow-violet',
    ])
  })

  it('Théo DS — lit les rayons et ombres PAR RÔLE (`--bellum-radius-*`, `--bellum-shadow-*`), sans les écarter comme couleurs', () => {
    expect(set.radius).toEqual(
      expect.arrayContaining([
        { name: 'role/card', cssVar: '--bellum-radius-card', value: 10 },
        { name: 'role/overlay', cssVar: '--bellum-radius-overlay', value: 12 },
        { name: 'role/control', cssVar: '--bellum-radius-control', value: 8 },
        { name: 'role/badge', cssVar: '--bellum-radius-badge', value: 6 },
      ]),
    )
    const overlay = set.shadows.find(s => s.cssVar === '--bellum-shadow-overlay')
    expect(overlay?.name).toBe('role/overlay')
    expect(overlay?.light[0]).toMatchObject({ x: 0, y: 12, blur: 40, spread: 0 })
    expect(overlay?.dark[0]?.color.a).toBe(0.53)
    const skippedVars = set.skipped.map(s => s.cssVar)
    expect(skippedVars).not.toContain('--bellum-radius-card')
    expect(skippedVars).not.toContain('--bellum-shadow-card')
  })

  it('Théo DS — les jetons CSS de mouvement sont écartés À DESSEIN : la valeur se lit dans motion.ts', () => {
    const motion = set.skipped.find(s => s.cssVar === '--bellum-motion-immediate')
    expect(motion?.intended).toBe(true)
    expect(motion?.reason).toMatch(/motion\.ts/)
    expect(set.skipped.find(s => s.cssVar === '--bellum-ease-out')?.intended).toBe(true)
  })

  it('extrait les sept styles de texte (famille, poids, taille, interligne, approche)', () => {
    expect(set.textStyles.map(t => t.name)).toEqual(['display', 'title', 'heading', 'body', 'caption', 'label', 'mono'])
    expect(set.textStyles.find(t => t.name === 'caption')).toEqual({
      name: 'caption',
      className: '.text-caption',
      fontFamily: 'SF Pro',
      fontWeight: 500,
      fontSize: 12,
      lineHeight: 1.4,
      letterSpacingEm: 0.03,
      color: '--bellum-text-muted',
    })
    expect(set.textStyles.find(t => t.name === 'mono')?.fontFamily).toBe('SF Mono')
  })

  it('extrait le mouvement de motion.ts (courbes et durées en ms)', () => {
    expect(set.motion.ease).toContainEqual({ name: 'out', bezier: [0.32, 0.72, 0, 1] })
    expect(set.motion.durations).toEqual([
      { name: 'immediate', ms: 160 },
      { name: 'perceptible', ms: 260 },
      { name: 'narrative', ms: 400 },
      { name: 'ambient', ms: 1600 },
    ])
  })

  it('le JSON commité est à jour (relancer `pnpm --filter @bellum/figma-sync extract`)', () => {
    const committed = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/figma-sync/generated/tokens.json'), 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(set)))
  })
})

describe('extractTokens — un token absent ou illisible est SIGNALÉ, jamais inventé', () => {
  const fixture = readFileSync(resolve(__dirname, 'fixtures/broken-tokens.css'), 'utf8')
  const set = extractTokens({
    tokensCss: { path: 'fixtures/broken-tokens.css', content: fixture },
    indexCss: { path: 'fixtures/index.css', content: ':root { --radius: nope; }' },
    tailwindConfig: { path: 'fixtures/tailwind.config.ts', content: 'export default {}' },
    motionTs: { path: 'fixtures/motion.ts', content: '' },
    tailwindDefaults: { path: 'fixtures/config.full.js', content: '' },
  })

  it('une couleur illisible ne devient pas une couleur', () => {
    expect(set.primitives.find(p => p.cssVar === '--bellum-primary-500')).toBeUndefined()
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--bellum-primary-500', source: 'fixtures/broken-tokens.css:3' }),
    )
  })

  it('un palier de rampe absent est nommé', () => {
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--bellum-primary-900', reason: expect.stringMatching(/absent/) }),
    )
  })

  it('un alias vers un token inconnu est refusé', () => {
    expect(set.colors.find(c => c.cssVar === '--bellum-bg')).toBeUndefined()
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--bellum-bg', reason: expect.stringMatching(/inconnu/) }),
    )
  })

  it('un token clair sans valeur sombre n’en reçoit pas une devinée', () => {
    expect(set.colors.find(c => c.cssVar === '--bg-glass')).toBeUndefined()
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--bg-glass', reason: expect.stringMatching(/sombre/) }),
    )
  })

  it('un rayon illisible, des z-index et un mouvement absents sont signalés', () => {
    expect(set.radius).toEqual([])
    expect(set.zIndex).toEqual([])
    expect(set.motion).toEqual({ ease: [], durations: [] })
    const reasons = set.skipped.map(s => s.cssVar)
    expect(reasons).toEqual(
      expect.arrayContaining(['--radius', 'zIndex', 'EASE', 'DURATION', 'rounded-xl', 'shadow-md']),
    )
  })

  it('un style de texte sans `font:` lisible est signalé', () => {
    expect(set.textStyles).toEqual([])
    expect(set.skipped).toContainEqual(expect.objectContaining({ cssVar: '.text-display' }))
  })

  it('un color-mix hors du cas trivial (deux couleurs opaques, un autre espace que srgb) reste écarté', () => {
    expect(set.colors.find(c => c.cssVar === '--border-two-opaque')).toBeUndefined()
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--border-two-opaque', reason: expect.stringMatching(/color-mix/) }),
    )
    expect(set.colors.find(c => c.cssVar === '--border-other-space')).toBeUndefined()
    expect(set.skipped).toContainEqual(
      expect.objectContaining({ cssVar: '--border-other-space', reason: expect.stringMatching(/color-mix/) }),
    )
  })
})
