import { describe, expect, it } from 'vitest'
import {
  beginCriticalOperation,
  isCriticalOperationInFlight,
  runOrDeferWhileCriticalOperation,
} from '@/lib/critical-operation-guard'

/**
 * #3822.5 — mesuré en recette prod le 07/10 : un enrichissement de lot de 12
 * contacts interrompu par le rechargement automatique de build périmé
 * (`stale-build.ts`) perdait la sélection ET le récapitulatif, alors que
 * trois contacts avaient déjà été débités côté serveur. `recoverFromStaleBuild`
 * ne savait rien d'un lot payant en vol — il rechargeait sans jamais regarder.
 * Ce garde est ce que `recoverFromStaleBuild` consulte avant de recharger.
 */
describe('critical-operation-guard', () => {
  it("n'est pas en vol tant que rien ne l'a déclaré", () => {
    expect(isCriticalOperationInFlight()).toBe(false)
  })

  it('se déclare en vol entre le début et la fin', () => {
    const end = beginCriticalOperation()
    expect(isCriticalOperationInFlight()).toBe(true)
    end()
    expect(isCriticalOperationInFlight()).toBe(false)
  })

  it('reste en vol tant que TOUS les lots imbriqués ne sont pas terminés', () => {
    const endFirst = beginCriticalOperation()
    const endSecond = beginCriticalOperation()
    endFirst()
    expect(isCriticalOperationInFlight()).toBe(true)
    endSecond()
    expect(isCriticalOperationInFlight()).toBe(false)
  })

  it('un second appel à la même fin de lot est sans effet (pas de compte négatif)', () => {
    const end = beginCriticalOperation()
    end()
    end()
    expect(isCriticalOperationInFlight()).toBe(false)
  })

  it('exécute immédiatement quand rien n’est en vol', () => {
    let ran = false
    runOrDeferWhileCriticalOperation(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  it('diffère l’action tant qu’un lot est en vol, puis la joue à sa fin', () => {
    const end = beginCriticalOperation()
    let ran = false
    runOrDeferWhileCriticalOperation(() => {
      ran = true
    })
    expect(ran).toBe(false)

    end()
    expect(ran).toBe(true)
  })

  it('ne garde que la DERNIÈRE action différée — inutile de rejouer les essais intermédiaires', () => {
    const end = beginCriticalOperation()
    const calls: string[] = []
    runOrDeferWhileCriticalOperation(() => calls.push('premier'))
    runOrDeferWhileCriticalOperation(() => calls.push('second'))

    end()
    expect(calls).toEqual(['second'])
  })
})
