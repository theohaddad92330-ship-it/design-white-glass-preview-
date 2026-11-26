import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentAddressOf } from '@/lib/legacy-addresses'
import { NAV_SECTIONS } from './sections'

/**
 * #2182 → #4197 (L6) → #4349 — TALENTS = LE VIVIER SEUL, ET LES ANCIENNES
 * ADRESSES N'ONT PAS DISPARU EN ROUTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET CE QUI TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Du 16/09 au 14/10/2026, le Vivier était une page unique à vues (`?view=`).
 * Le 14/10, Talents prenait trois onglets (« Besoins ouverts », « Vivier »,
 * « Positionnements »). Le 19/10/2026, Louis RENVERSE cet arbitrage (#4349 :
 * « les positionnements, il ne sert à rien » ; #4344 : les besoins vivent dans
 * Affaires) : Talents = le Vivier seul, sans onglet.
 *
 * Ce qui tient, et que cette garde protège : la raison du 27/08/2026 — ces
 * écrans « n'étaient atteignables que par une URL tapée à la main » — reste
 * écrite dans `sections.ts`, et elle reste HONORÉE : les positionnements ont une
 * porte visible (depuis le 24/10/2026, #4528 : Affaires › Présentations), et aucune
 * ancienne adresse ne rend « introuvable ».
 */

const ROUTES = join(__dirname, '..', '..', 'routes')
const SECTIONS = join(__dirname, 'sections.ts')

function source(...parts: string[]): string {
  return readFileSync(join(ROUTES, ...parts), 'utf8')
}

/** Les commentaires ne sont pas du code : un `redirect` cité dans un docblock
 *  n'en est pas un, et cette garde n'existe que pour lire ce qui s'exécute. */
function stripComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('#4349 — Talents : le Vivier seul, et les anciennes adresses', () => {
  const sections = readFileSync(SECTIONS, 'utf8')

  it('lit un corpus réel — les routes et le fichier des sections', () => {
    // Sans ce contrôle, tout le reste pourrait passer sur des fichiers vides.
    expect(sections.length).toBeGreaterThan(5000)
    expect(source('consultants', 'index.tsx').length).toBeGreaterThan(200)
  })

  it('la section Talents est le Vivier, sans onglet (décision Louis du 19/10/2026)', () => {
    const talents = NAV_SECTIONS.find(section => section.key === 'talents')
    expect(talents).toBeDefined()
    expect(talents?.to).toBe('/consultants')
    expect(talents?.tabs).toEqual([])
  })

  it('l’ancien pool et les positionnements n’ont plus de fichier de route (#4359)', () => {
    expect(() => source('consultants', 'pool.tsx')).toThrow()
    expect(() => source('consultants', 'submissions.tsx')).toThrow()
    expect(currentAddressOf('/consultants/pool')).toBe('/consultants')
  })

  it('#4528 — le Vivier ne monte plus les positionnements : ils vivent à UN endroit, Affaires › Présentations', () => {
    const page = stripComments(
      readFileSync(join(__dirname, '..', '..', 'features', 'consultants', 'view', 'ConsultantsPage.tsx'), 'utf8'),
    )
    expect(page.length).toBeGreaterThan(1000)
    expect(page).not.toContain('id="positionnements"')
    expect(page).not.toMatch(/SubmissionsView|AddPresentationDialog/)
  })

  it('`?view=submissions` et `#positionnements` redirigent depuis `/consultants` vers Affaires › Présentations', () => {
    const index = stripComments(source('consultants', 'index.tsx'))
    expect(index).toContain("to: '/projects/presentations'")
    expect(index).not.toContain("hash: 'positionnements'")
  })

  it('la raison du 27/08/2026 est ÉCRITE là où quelqu’un la relira', () => {
    // Sans cette phrase, le prochain passage retirerait un onglet « pour
    // simplifier » sans savoir qu'un écran n'était, avant lui, atteignable que
    // par une URL tapée à la main.
    expect(sections).toContain('27/08/2026')
    expect(sections).toContain('atteignables que par une URL tapée à la main')
  })

  it('témoin — la garde n’attrape pas une route ordinaire, qui ne redirige pas', () => {
    // `/consultants/` redirige SEULEMENT pour `?view=submissions` (conditionnel,
    // dans `beforeLoad`) : la forme lue existe bien dans ce fichier.
    expect(stripComments(source('consultants', 'index.tsx'))).toContain('redirect(')
  })
})
