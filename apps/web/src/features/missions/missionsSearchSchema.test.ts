import { describe, expect, it } from 'vitest'
import { missionsSearchSchema } from '@/routes/missions/index'

const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const CONSULTANT = '44444444-4444-4444-8444-444444444444'

/**
 * §4.4 — le paramètre du lien de source est DÉCLARÉ sur la route.
 *
 * Sans `validateSearch`, TanStack Router jette la recherche avant que l'écran
 * la voie : `/missions?accountId=…` ouvrait la liste ENTIÈRE des missions,
 * c'est-à-dire un lien qui ment sur sa source.
 */
describe('missionsSearchSchema — ce que le lien de source a le droit de porter', () => {
  it('accepte les deux filtres du contrat de propagation', () => {
    expect(missionsSearchSchema.parse({ accountId: ACCOUNT })).toEqual({
      accountId: ACCOUNT,
      consultantId: undefined,
    })
    expect(missionsSearchSchema.parse({ consultantId: CONSULTANT })).toEqual({
      accountId: undefined,
      consultantId: CONSULTANT,
    })
  })

  it('REFUSE ce qui n’est pas un identifiant — et retombe sur « pas de filtre »', () => {
    // `.catch(undefined)` plutôt qu'une page en erreur : un lien collé de
    // travers doit montrer quelque chose, et c'est le choix déjà fait pour le
    // board (`delivery.controller.ts`). Ce qui compte est qu'aucune pastille ne
    // s'affiche alors — l'écran n'affirme un périmètre que quand il en tient un.
    expect(missionsSearchSchema.parse({ accountId: 'tout-sauf-un-uuid' }).accountId).toBeUndefined()
    expect(missionsSearchSchema.parse({ accountId: 42 }).accountId).toBeUndefined()
    expect(missionsSearchSchema.parse({ consultantId: '' }).consultantId).toBeUndefined()
  })

  it('ignore une recherche vide sans lever', () => {
    expect(missionsSearchSchema.parse({})).toEqual({ accountId: undefined, consultantId: undefined })
  })

  it('est IDEMPOTENT — le routeur reparse sa propre sortie à chaque navigation', () => {
    const once = missionsSearchSchema.parse({ accountId: ACCOUNT })
    expect(missionsSearchSchema.parse(once)).toEqual(once)
  })

  // #4351.1 — la liste (ex-« En cours ») s'ouvre par `?vue=liste`, jamais par une valeur libre.
  it('accepte `vue=liste` et jette toute autre valeur', () => {
    expect(missionsSearchSchema.parse({ vue: 'liste' }).vue).toBe('liste')
    expect(missionsSearchSchema.parse({ vue: 'nimporte' }).vue).toBeUndefined()
  })
})
