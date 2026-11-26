/**
 * Théo DS — la correspondance des jetons de la maquette V22 vers `--bellum-*`.
 *
 * Source : `docs/maquettes/theo-v22/_ds/releve.md` (branche `claude/theo-v22-ds-releve`),
 * §1.1 (couleurs calculées), §1.2 (ombre, rayon, mouvement), §1.6 (contraste AA).
 *
 * Chaque ligne ci-dessous est un jeton de Théo et le jeton du dépôt qui le PORTE.
 * Les valeurs sont lues dans `tokens.css` (jamais recopiées ailleurs que dans
 * cette table de vérité) : si quelqu'un remet l'ancienne rampe zinc, ce test
 * tombe. Les écarts ASSUMÉS sont dans `ECARTS` avec leur raison — une garde qui
 * ne sait pas dire pourquoi elle tolère un écart l'invente.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DURATION, EASE } from '@bellum/ui'

const TOKENS = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

/** Déclarations à plat d'un sélecteur (tous ses blocs), comme `theme-parity.test.ts`. */
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const own = (match[1] ?? '').trim().split('\n').pop()?.trim()
    if (own !== selector) continue
    for (const decl of (match[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out[decl[1] as string] = (decl[2] as string).trim()
    }
  }
  return out
}

const light = declarations(':root')
const dark = { ...light, ...declarations('.dark') }

/** [jeton Théo, jeton repo, clair, sombre] — relevé §1.1. */
const CORRESPONDANCE: ReadonlyArray<readonly [string, string, string, string]> = [
  ['--primary', '--bellum-primary', '#5b3ee8', '#6545ef'],
  ['--primary-hover', '--bellum-primary-hover', '#3a26a0', '#7556f4'],
  ['--accent', '--bellum-text-accent', '#5b3ee8', '#9e87ff'],
  ['--accent-bg', '--bellum-accent-bg', '#f4f2ff', '#221b3c'],
  ['--accent-line', '--bellum-accent-line', '#e0d9ff', '#40305f'],
  ['--bg', '--bellum-bg', '#f5f5f8', '#0b0b0e'],
  ['--surface', '--bellum-surface-1', '#ffffff', '#151518'],
  ['--surface2', '--bellum-surface-2', '#f1f2f6', '#1e1e23'],
  ['--sidebar', '--bellum-sidebar', '#ffffff', '#131316'],
  ['--border', '--bellum-border', '#e5e6ee', '#2b2b32'],
  ['--border2', '--bellum-border-strong', '#d4d4d8', '#3c3c45'],
  ['--text', '--bellum-text-primary', '#1c1c28', '#f2f2f5'],
  ['--secondary', '--bellum-text-secondary', '#5d5e70', '#b2b1bd'],
  ['--success', '--bellum-success-text', '#0a6b4a', '#6ee7b7'],
  ['--success-bg', '--success-soft-bg', '#dbf3e9', '#15332b'],
  ['--warning', '--bellum-warning-text', '#7d5206', '#fcd34d'],
  ['--warning-bg', '--warning-soft-bg', '#fbeed3', '#3a2d17'],
  ['--danger', '--danger-soft-text', '#9c211a', '#fca5a5'],
  ['--danger-bg', '--danger-soft-bg', '#fce5e3', '#3a2024'],
  ['--info', '--info-soft-text', '#14568c', '#7dd3fc'],
  ['--info-bg', '--info-soft-bg', '#dfeefb', '#182e40'],
  ['--accent-bg (badge purple)', '--accent-soft-bg', '#f4f2ff', '#221b3c'],
  ['--accent (badge purple)', '--accent-soft-text', '#5b3ee8', '#9e87ff'],
  ['--on-primary', '--bellum-on-primary', '#ffffff', '#ffffff'],
  ['--v22-hover', '--bellum-row-hover', '#f1f2f6', '#202027'],
]

/**
 * Écarts ASSUMÉS — le jeton de Théo échoue une règle du dépôt, on garde la
 * teinte de Théo la plus proche qui la passe (relevé §1.6).
 */
const ECARTS: ReadonlyArray<readonly [string, string, string, string, string]> = [
  // Théo `--muted` #727385 : 4,28:1 sur `--bg`, 4,17:1 sur `--surface2` (ÉCHEC AA).
  // Même teinte, luminance abaissée jusqu'au premier pas qui passe partout.
  ['--muted', '--bellum-text-muted', '#6c6d7e', '#9695a4', 'AA sur --bg et --surface2 (D79)'],
]

const lower = (v: string | undefined) => (v ?? '').toLowerCase()

describe('Théo DS — correspondance des jetons (relevé §1.1)', () => {
  it('la garde lit bien les deux thèmes — sinon elle serait verte pour toujours', () => {
    expect(Object.keys(light).length).toBeGreaterThan(30)
    expect(lower(light['--bellum-bg'])).toMatch(/^#[0-9a-f]{6}$/)
    expect(lower(dark['--bellum-bg'])).toMatch(/^#[0-9a-f]{6}$/)
  })

  for (const [theo, repo, clair, sombre] of CORRESPONDANCE) {
    it(`${theo} → ${repo} : ${clair} / ${sombre}`, () => {
      expect(lower(light[repo]), `clair ${repo}`).toBe(clair)
      expect(lower(dark[repo]), `sombre ${repo}`).toBe(sombre)
    })
  }

  for (const [theo, repo, clair, sombre, raison] of ECARTS) {
    it(`${theo} → ${repo} : écart assumé (${raison})`, () => {
      expect(lower(light[repo])).toBe(clair)
      expect(lower(dark[repo])).toBe(sombre)
    })
  }

  it('sait dire NON — une valeur de l’ancienne rampe zinc ne passe pas pour du Théo', () => {
    const ancien: Record<string, string> = { '--bellum-bg': '#ffffff' }
    const [, repo, clair] = CORRESPONDANCE.find(([, r]) => r === '--bellum-bg') ?? []
    expect(lower(ancien[repo as string])).not.toBe(clair)
  })
})

describe('Théo DS — forme, ombre, mouvement (relevé §1.2, §3.2)', () => {
  // Coque Théo (23/10/2026) — les maquettes APPLIQUÉES rendent la carte à 10 px (prod : 8) ; 18 px était la
  // strate V2 du prototype, que les maquettes appliquées n'ont pas gardée.
  it('rayons : carte 10 px, surcouche 12 px, contrôle 8 px, badge 6 px', () => {
    expect(light['--bellum-radius-card']).toBe('10px')
    expect(light['--bellum-radius-overlay']).toBe('12px')
    expect(light['--bellum-radius-control']).toBe('8px')
    expect(light['--bellum-radius-badge']).toBe('6px')
  })

  it('ombres : carte diffuse SANS liseré, surcouche — un jeton par thème', () => {
    for (const vars of [light, declarations('.dark')]) {
      expect(vars['--bellum-shadow-card'], 'ombre de carte').toBeTruthy()
      expect(vars['--bellum-shadow-overlay'], 'ombre de surcouche').toBeTruthy()
      // Théo : l'ombre ne dessine pas le contour — la bordure s'en charge.
      expect(vars['--bellum-shadow-card']).not.toMatch(/0 0 0 1px/)
    }
  })

  it('police : la pile système de la maquette (aucune police chargée), déclarée UNE fois (GA-26)', () => {
    const sans = light['--bellum-font-sans'] ?? ''
    expect(sans.split(',')[0]?.trim()).toBe('-apple-system')
    expect(sans).toMatch(/BlinkMacSystemFont/)
    expect(sans).not.toMatch(/Geist/)
    expect(light['--bellum-font-mono'] ?? '').toMatch(/^ui-monospace/)
    // Aucune autre famille écrite en dur dans la feuille de jetons : les styles typographiques la lisent.
    expect(TOKENS.replace(/--bellum-font-(sans|mono):[^;]+;/g, '')).not.toMatch(/['"]Geist|font-family:\s*['"A-Z]/)
  })

  it('les jetons CSS de mouvement sont DÉRIVÉS de motion.ts (GA-25, GA-26)', () => {
    expect(light['--bellum-motion-immediate']).toBe(`${Math.round(DURATION.immediate * 1000)}ms`)
    expect(light['--bellum-motion-perceptible']).toBe(`${Math.round(DURATION.perceptible * 1000)}ms`)
    expect(light['--bellum-motion-narrative']).toBe(`${Math.round(DURATION.narrative * 1000)}ms`)
    expect(light['--bellum-ease-out']).toBe(`cubic-bezier(${EASE.out.join(', ')})`)
  })
})

/**
 * Le miroir HSL shadcn de `index.css` : le commentaire de ce fichier promet que
 * « quand un `--bellum-*` bouge, son jumeau bouge », mais rien ne le rejouait.
 * Avec la bascule Théo, toute la rampe bouge : on vérifie chaque jumeau, à
 * l'arrondi HSL près (un triplet entier perd jusqu'à ~3 niveaux par canal).
 */
const INDEX = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')

function mirror(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of INDEX.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const own = (match[1] ?? '').trim().split('\n').pop()?.trim()
    if (own !== selector) continue
    const body = match[2] ?? ''
    if (!body.includes('--muted-foreground')) continue
    for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[decl[1] as string] = (decl[2] as string).trim()
  }
  return out
}

function hslToRgb(triplet: string): number[] {
  const m = triplet.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) throw new Error(`triplet HSL illisible : ${triplet}`)
  const h = Number(m[1])
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255))
}

function hexToRgb(hex: string): number[] {
  const raw = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16))
}

const JUMEAUX: ReadonlyArray<readonly [string, string]> = [
  ['--background', '--bellum-bg'],
  ['--foreground', '--bellum-text-primary'],
  ['--card', '--bellum-surface-1'],
  ['--popover', '--bellum-surface-1'],
  ['--primary', '--bellum-primary'],
  ['--secondary', '--bellum-surface-2'],
  ['--muted', '--bellum-surface-2'],
  ['--muted-foreground', '--bellum-text-secondary'],
  ['--accent', '--bellum-primary'],
  ['--border', '--bellum-border'],
  ['--input', '--bellum-border'],
  ['--ring', '--bellum-focus-ring'],
]

describe('Théo DS — le miroir HSL shadcn suit tokens.css (GA-26)', () => {
  const themes = [
    ['clair', mirror(':root'), light],
    ['sombre', mirror('.dark'), dark],
  ] as const

  it('lit bien les deux miroirs', () => {
    for (const [, hsl] of themes) expect(Object.keys(hsl).length).toBeGreaterThan(15)
  })

  for (const [theme, hsl, vars] of themes) {
    for (const [shadcn, bellum] of JUMEAUX) {
      it(`${theme} — ${shadcn} est le jumeau de ${bellum}`, () => {
        const a = hslToRgb(hsl[shadcn] ?? '')
        const b = hexToRgb(vars[bellum] ?? '')
        const ecart = Math.max(...a.map((v, i) => Math.abs(v - (b[i] as number))))
        expect(
          ecart,
          `${shadcn} ${hsl[shadcn]} → rgb(${a.join(',')}) vs ${bellum} ${vars[bellum]}`,
        ).toBeLessThanOrEqual(3)
      })
    }
  }

  it('sait dire NON — un triplet de l’ancienne rampe (blanc) n’est pas le jumeau du fond Théo', () => {
    const a = hslToRgb('0 0% 100%')
    const b = hexToRgb('#f5f5f8')
    expect(Math.max(...a.map((v, i) => Math.abs(v - (b[i] as number))))).toBeGreaterThan(3)
  })
})
