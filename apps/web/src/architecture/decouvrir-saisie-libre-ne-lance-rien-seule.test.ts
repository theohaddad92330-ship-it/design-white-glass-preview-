import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import discoverFr from '@/i18n/locales/fr/discover.json'
import discoverEn from '@/i18n/locales/en/discover.json'

/**
 * #4493 (décision Louis 24/10, contrat du lot DÉCOUVRIR) — REVIENT SUR #3646 (05/10/2026) : la barre
 * « Quel marché veux-tu explorer ? » de la maquette V22 retrouve son champ libre et son bouton « Explorer ».
 *
 * Ce qui ne bouge pas, et que cette garde tient à la place de l'ancienne (`decouvrir-sans-saisie-libre`) :
 * - le champ écrit `filters.freetext`, le MÊME champ du contrat (recherches enregistrées, URL, `q=`) — jamais
 *   un second état ;
 * - #4490 — rien ne part tout seul : la recherche ne part qu'au geste (envoi du formulaire), jamais d'un
 *   effet de rendu ni d'une frappe.
 *
 * Une règle qui n'est pas gardée redevient une opinion : la garde lit `FilterRail.tsx` et les deux langues,
 * et sait dire NON sur une source fabriquée.
 */
const HERE = new URL('.', import.meta.url).pathname
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const rail = stripComments(readFileSync(join(HERE, '../features/discover/view/FilterRail.tsx'), 'utf8'))

/** Le champ libre écrit `freetext` sur les filtres reçus. */
const WRITES_FREETEXT = /onChange\(\{\s*\.\.\.filters,\s*freetext:\s*event\.target\.value\s*\}\)/
/** Un lancement depuis un effet (ou à la frappe) : interdit. */
const launchesAlone = (source: string) =>
  /useEffect\(\(\)\s*=>[\s\S]{0,200}?onSubmit\(/.test(source) || /freetext:[^}]*\}\)\s*;?\s*onSubmit\(/.test(source)

describe('Découvrir — la saisie libre revient, et ne lance rien seule (#4493, revient sur #3646)', () => {
  it('FilterRail rend le champ libre, branché sur `filters.freetext`', () => {
    expect(rail).toContain('role="search"')
    expect(WRITES_FREETEXT.test(rail)).toBe(true)
  })

  it('la recherche part à l’envoi du formulaire, jamais d’un effet ni d’une frappe', () => {
    expect(rail).toMatch(
      /onSubmit=\{event => \{\s*event\.preventDefault\(\)\s*if \(runnable && !loading\) onSubmit\(\)/,
    )
    expect(launchesAlone(rail)).toBe(false)
  })

  it('les deux langues nomment le champ et son bouton', () => {
    for (const locale of [discoverFr, discoverEn]) {
      expect(locale.explore.label).toBeTruthy()
      expect(locale.explore.placeholder).toBeTruthy()
      expect(locale.explore.submit).toBeTruthy()
    }
  })

  it('sait dire NON — un lancement à l’arrivée ou à la frappe est vu', () => {
    expect(launchesAlone('useEffect(() => { onSubmit() }, [])')).toBe(true)
    expect(launchesAlone('onChange({ ...filters, freetext: v }); onSubmit()')).toBe(true)
    expect(launchesAlone('onClick={() => onSubmit()}')).toBe(false)
    expect(WRITES_FREETEXT.test('onChange({ ...filters, keywords: event.target.value })')).toBe(false)
  })
})
