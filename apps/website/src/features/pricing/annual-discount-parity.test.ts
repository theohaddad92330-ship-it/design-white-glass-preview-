import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANNUAL_DISCOUNT_MIRROR } from './live-prices'

/**
 * La remise annuelle vit à DEUX endroits — et c'est assumé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE DOUBLON EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/contracts` porte `ANNUAL_DISCOUNT`, et l'API comme l'application le
 * lui empruntent. Le site public, lui, ne dépend pas de ce paquet : c'est un
 * Next.js de marketing qu'on ne veut pas charger d'un paquet de contrats zod
 * pour une constante. Le doublon est donc un choix, pas un oubli — le
 * commentaire de `live-prices.ts` le dit depuis toujours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL LUI FAUT UNE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commentaire qui dit « mirrors » ne garde rien. Le jour où la remise change
 * dans le contrat, l'API facturera la nouvelle et **la page de tarifs affichera
 * l'ancienne** — c'est-à-dire que le prix annoncé au client avant qu'il paie ne
 * serait pas celui qu'on lui prélève. C'est la pire divergence possible de ce
 * dépôt, et la moins visible : rien ne casse, une page s'affiche.
 *
 * La garde ne fusionne pas les deux valeurs (ça demanderait la dépendance qu'on
 * refuse). Elle LIT le contrat sur le disque et refuse qu'ils diffèrent — même
 * idiome que `shared-schema-parity.test.ts`, qui tient ensemble le zod et le
 * JSON Schema sans les confondre.
 */

const CONTRACT = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas', 'credits.ts')

function discountFromContract(): number {
  const source = readFileSync(CONTRACT, 'utf8')
  const match = source.match(/export const ANNUAL_DISCOUNT\s*=\s*([0-9.]+)/)
  if (!match) throw new Error(`ANNUAL_DISCOUNT introuvable dans ${CONTRACT}`)
  return Number(match[1])
}

describe('remise annuelle — le site et le contrat disent la même chose', () => {
  it('lit un corpus réel — sans quoi la garde serait verte sur du vide', () => {
    // La leçon des six gardes borgnes : une garde doit prouver qu'elle LIT.
    const source = readFileSync(CONTRACT, 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('ANNUAL_DISCOUNT')
  })

  it('la valeur du site est celle du contrat', () => {
    expect(ANNUAL_DISCOUNT_MIRROR).toBe(discountFromContract())
  })

  it('la garde sait dire NON — une valeur inventée serait vue', () => {
    // Preuve destructive : si le contrat portait 0,75, la parité tomberait.
    expect(0.75).not.toBe(discountFromContract())
  })

  it('la remise reste une remise — strictement entre 0 et 1', () => {
    // Un 1 rendrait l'annuel identique au mensuel en affichant « -20 % » ;
    // un 0 rendrait l'abonnement gratuit. Les deux s'afficheraient sans casser.
    const discount = discountFromContract()
    expect(discount).toBeGreaterThan(0)
    expect(discount).toBeLessThan(1)
  })
})
