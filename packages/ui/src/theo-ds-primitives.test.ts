import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { theoTheme } from '../tailwind.config'

/**
 * Théo DS — les primitives de `packages/ui` portent les jetons de la maquette V22.
 *
 * Source : `docs/maquettes/theo-v22/_ds/releve.md` §2 (composants). Ce test lit
 * les sources, comme les autres gardes du paquet : jsdom ne calcule ni la
 * cascade ni Tailwind, la classe écrite est la seule preuve disponible ici.
 *
 * Les rôles (rayon de carte, ombre de surcouche…) sont des NOMS Tailwind qui
 * pointent sur les jetons `--bellum-*` de `apps/web/src/styles/tokens.css` :
 * un réglage, un endroit (GA-26), et aucune valeur arbitraire (GA-250).
 */

const SRC = __dirname
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

/** Le fichier SANS ses commentaires : un commentaire qui cite l'ancienne classe ne compte pas. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('Théo DS — le thème Tailwind partagé (§1.2, §1.5, §3.2)', () => {
  it('nomme les rayons par rôle, sur les jetons', () => {
    expect(theoTheme.borderRadius).toEqual({
      card: 'var(--bellum-radius-card)',
      overlay: 'var(--bellum-radius-overlay)',
      control: 'var(--bellum-radius-control)',
      badge: 'var(--bellum-radius-badge)',
    })
  })

  it('nomme les ombres de carte et de surcouche', () => {
    expect(theoTheme.boxShadow).toEqual({
      card: 'var(--bellum-shadow-card)',
      overlay: 'var(--bellum-shadow-overlay)',
    })
  })

  it('expose les durées et la courbe de motion.ts, jamais une valeur libre (GA-25)', () => {
    expect(theoTheme.transitionDuration).toEqual({
      immediate: 'var(--bellum-motion-immediate)',
      perceptible: 'var(--bellum-motion-perceptible)',
      narrative: 'var(--bellum-motion-narrative)',
    })
    expect(theoTheme.transitionTimingFunction).toEqual({ 'bellum-out': 'var(--bellum-ease-out)' })
  })

  it("l'application web consomme CE thème, elle ne le recopie pas (GA-26)", () => {
    const web = readFileSync(join(SRC, '../../../apps/web/tailwind.config.ts'), 'utf8')
    expect(web).toMatch(/import \{[^}]*theoTheme[^}]*\} from '@bellum\/ui\/tailwind\.config'/)
    expect(web).toMatch(/\.\.\.theoTheme\.borderRadius/)
  })
})

describe('Théo DS — Bouton (§2.1, §2.2)', () => {
  const src = code('components/button.tsx')

  it('rayon de contrôle 8 px, anneau de focus 2 px décalé de 3 px', () => {
    expect(src).toContain('rounded-control')
    expect(src).toContain('focus-visible:ring-2')
    expect(src).toContain('focus-visible:ring-offset-[3px]')
    expect(src).not.toMatch(/(?<![\w-])rounded-md(?![\w-])/)
  })

  it('le remplissage primaire est thématisé (Théo l’éclaircit en sombre, et au survol)', () => {
    expect(src).toContain('bg-[var(--bellum-primary)]')
    expect(src).toContain('hover:bg-[var(--bellum-primary-hover)]')
    expect(src).toContain('text-[var(--bellum-on-primary)]')
  })

  it('porte les variantes de Théo : soft et plain', () => {
    const soft = src.match(/\bsoft:\s*'([^']*)'/)?.[1] ?? ''
    expect(soft).toContain('bg-[var(--bellum-accent-bg)]')
    expect(soft).toContain('border-[var(--bellum-accent-line)]')
    expect(src).toMatch(/plain:\s*'[^']*text-\[var\(--bellum-text-secondary\)\]/)
  })

  it('sait dire NON — la teinte FIXE de la gamme ne remplit plus le bouton par défaut', () => {
    expect(src).not.toMatch(/default:\s*'bg-\[var\(--bellum-primary-500\)\]/)
  })
})

describe('Théo DS — Badge (§2.3)', () => {
  const src = code('components/badge.tsx')

  it('rayon 6 px, plus une pilule', () => {
    expect(src).toContain('rounded-badge')
    expect(src).not.toContain('rounded-full')
  })

  for (const [variant, tone] of [
    ['primary', 'accent'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['danger', 'danger'],
    ['info', 'info'],
  ] as const) {
    it(`${variant} : aplat --${tone}-soft-bg + texte --${tone}-soft-text (AA, contrast.test.ts)`, () => {
      const line = src.match(new RegExp(`\\b${variant}:\\s*'([^']*)'`))?.[1] ?? ''
      expect(line, `variante ${variant} introuvable`).not.toBe('')
      expect(line).toContain(`bg-[var(--${tone}-soft-bg)]`)
      expect(line).toContain(`text-[var(--${tone}-soft-text)]`)
      expect(line).not.toContain('color-mix')
    })
  }
})

describe('Théo DS — Carte (§2.5)', () => {
  const src = code('components/card.tsx')

  it('rayon de carte 18 px, contour par la bordure', () => {
    expect(src).toContain('rounded-card')
    expect(src).toContain('ring-border')
    expect(src).not.toMatch(/(?<![\w-])rounded-(?:t-|b-)?xl(?![\w-])/)
  })
})

describe('Théo DS — Champs (§2.13)', () => {
  for (const file of ['components/input.tsx', 'components/textarea.tsx']) {
    it(`${file} : rayon de contrôle, bordure --border2, halo de focus 3 px --accent-bg`, () => {
      const src = code(file)
      expect(src).toContain('rounded-control')
      expect(src).toContain('border-[var(--bellum-border-strong)]')
      expect(src).toContain('focus-visible:border-[var(--bellum-text-accent)]')
      expect(src).toContain('focus-visible:ring-[3px]')
      expect(src).toContain('focus-visible:ring-[var(--bellum-accent-bg)]')
    })
  }
})

describe('Théo DS — Interrupteur (§2.13, GA-35)', () => {
  const src = code('components/switch.tsx')

  it('piste au repos --border2, cochée --primary', () => {
    expect(src).toContain('data-[state=unchecked]:bg-[var(--bellum-border-strong)]')
    expect(src).toContain('data-[state=checked]:bg-[var(--bellum-primary)]')
  })

  it("la zone tactile élargie EXISTE (un ::after sans content n'a pas de boîte) et atteint 44 px au doigt", () => {
    expect(src).toContain("after:content-['']")
    const y = Number(src.match(/pointer-coarse:after:-inset-y-(\d+)/)?.[1] ?? 0) * 4 * 2
    expect(20 + y, 'hauteur visible 20 px + extension').toBeGreaterThanOrEqual(44)
  })
})

describe('Théo DS — Onglets (§2.8)', () => {
  const src = code('components/tabs.tsx')

  it('une variante « soulignement » à côté du segmenté, actif = trait 2 px primaire + texte accent', () => {
    expect(src).toMatch(/variant\?: 'segmented' \| 'underline'/)
    expect(src).toContain('data-variant={variant}')
    expect(src).toContain('group-data-[variant=underline]/tabs-list:border-b-2')
    expect(src).toContain('group-data-[variant=underline]/tabs-list:data-[state=active]:border-[var(--bellum-primary)]')
    expect(src).toContain(
      'group-data-[variant=underline]/tabs-list:data-[state=active]:text-[var(--bellum-text-accent)]',
    )
  })
})

describe('Théo DS — Barre latérale (§2.18)', () => {
  const src = code('components/sidebar.tsx')

  it('232 px de large', () => {
    expect(src).toContain("const SIDEBAR_WIDTH = '14.5rem'")
  })

  it("entrée active = aplat --accent-bg + texte accent (les couleurs `sidebar-accent` n'existent dans aucun thème)", () => {
    expect(src).toContain('data-[active=true]:bg-[var(--bellum-accent-bg)]')
    expect(src).toContain('data-[active=true]:text-[var(--bellum-text-accent)]')
    expect(src).not.toMatch(/(?<![\w-])(?:bg|text)-sidebar-accent/)
  })
})

describe('Théo DS — Surcouches : menu, modale, tiroir (§2.10–2.12)', () => {
  for (const file of ['components/dropdown-menu.tsx', 'components/dialog.tsx', 'components/sheet.tsx']) {
    it(`${file} : rayon de surcouche 12 px, ombre de surcouche`, () => {
      const src = code(file)
      expect(src).toContain('rounded-overlay')
      expect(src).toContain('shadow-overlay')
      expect(src).not.toMatch(/(?<![\w-])shadow-(?:md|lg)(?![\w-])/)
    })
  }
})

describe('Théo DS — Tableau (§2.7)', () => {
  const src = code('components/table.tsx')

  it('en-tête --muted (AA, corrigé) sur --surface2, survol de ligne --v22-hover', () => {
    expect(src).toContain('bg-[var(--bellum-surface-2)]')
    expect(src).toContain('text-[var(--bellum-text-muted)]')
    expect(src).toContain('hover:bg-[var(--bellum-row-hover)]')
  })
})
