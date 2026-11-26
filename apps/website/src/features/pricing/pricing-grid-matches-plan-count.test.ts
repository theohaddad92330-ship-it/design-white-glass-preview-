import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — la grille des forfaits déclarait `xl:grid-cols-4` pour
 * TROIS cartes (Free, Growth, Entreprise — voir `messages/fr/pricing.json`,
 * un seul item dans `plans.items`), sur les deux écrans qui rendent les
 * forfaits (`landing/Pricing.tsx` et `pricing/PricingPlans.tsx`). Une
 * quatrième colonne vide sur grand écran se lit comme un forfait manquant.
 *
 * ⚠️ La grille de RÈGLES du bandeau (`PricingPlans.tsx`, juste en dessous,
 * `lg:grid-cols-4`) N'EST PAS visée : elle rend QUATRE notes statiques
 * (crédit, report, annuel, sur-mesure) — quatre colonnes pour quatre
 * éléments est le compte juste, et cette garde ne la touche pas.
 */

const SRC = join(__dirname, '../..')
const WEBSITE_ROOT = join(__dirname, '../../..')

function readSource(relPath: string): string {
  return readFileSync(join(SRC, relPath), 'utf8')
}

describe('la grille des forfaits porte autant de colonnes que de forfaits (3)', () => {
  it('landing/Pricing.tsx : xl:grid-cols-3, jamais 4', () => {
    const source = readSource('features/landing/Pricing.tsx')
    expect(source).not.toMatch(/xl:grid-cols-4/)
    expect(source).toMatch(/xl:grid-cols-3/)
  })

  it('pricing/PricingPlans.tsx : la grille des FORFAITS (Free + items + Entreprise) est en xl:grid-cols-3', () => {
    const source = readSource('features/pricing/PricingPlans.tsx')
    const plansGrid = source.match(/<div className="mx-auto grid max-w-6xl items-stretch gap-4[^"]*">/)
    expect(plansGrid, 'la grille des forfaits (FreePlanCard/PlanCard/EnterprisePlanCard)').not.toBeNull()
    expect(plansGrid?.[0]).toMatch(/xl:grid-cols-3/)
    expect(plansGrid?.[0]).not.toMatch(/xl:grid-cols-4/)
  })

  it('témoin — le bandeau de RÈGLES (4 notes statiques) reste en lg:grid-cols-4, il n’est pas visé', () => {
    const source = readSource('features/pricing/PricingPlans.tsx')
    const notesGrid = source.match(/<div className="mx-auto mt-8 grid max-w-6xl[^"]*">/)
    expect(notesGrid, 'le bandeau de règles').not.toBeNull()
    expect(notesGrid?.[0]).toMatch(/lg:grid-cols-4/)
  })

  it('3 forfaits au total sur PricingPlans (Free + 1 item + Entreprise) — la donnée qui justifie 3 colonnes', () => {
    const items = JSON.parse(readFileSync(join(WEBSITE_ROOT, 'messages/fr/pricing.json'), 'utf8')) as {
      plans: { items: unknown[] }
    }
    // Free + items + Entreprise = 3 cartes rendues par PricingPlans.tsx.
    expect(items.plans.items.length + 2).toBe(3)
  })
})
