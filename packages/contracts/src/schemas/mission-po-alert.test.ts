import { describe, expect, it } from 'vitest'
import { poConsumption } from './staffing.js'
import {
  PO_AMENDMENT_ALERT_PERCENT,
  PO_CONSUMPTION_ALERTS,
  poConsumptionAfterExtension,
  poConsumptionAlert,
  poConsumptionOverviewSchema,
} from './mission-po-alert.js'

/**
 * Les tests portent sur les INVARIANTS du seuil, pas sur le nombre 90 : si
 * quelqu'un décide un jour 85, la seule chose qui doit changer est la constante.
 * Épingler « 90 » dans dix assertions ferait de la valeur un fait de test au
 * lieu d'un réglage.
 */

/** Le raccourci de lecture : un volume et une consommation, tels que le
 *  serveur les rend — `poConsumption` reste le SEUL calcul du pourcentage. */
function alertFor(volumeDays: number | null, consumedDays: number | null) {
  return poConsumptionAlert({ volumeDays, consumption: poConsumption(volumeDays, consumedDays) })
}

describe('poConsumptionAlert — un bon de commande qui se vide se dit AVANT le dépassement', () => {
  it('ne rend jamais autre chose que la liste fermée', () => {
    for (const [volume, consumed] of [
      [null, null],
      [50, null],
      [50, 0],
      [50, 10],
      [50, 45],
      [50, 60],
      [0, 10],
    ] as const) {
      expect(PO_CONSUMPTION_ALERTS).toContain(alertFor(volume, consumed))
    }
  })

  it('un bon de commande sans VOLUME connu n’est pas « à 0 % » — il est non mesuré', () => {
    // Le piège que ce module existe pour refuser : le zéro tombe du bon côté,
    // et « 0 % consommé » se lit comme une bonne nouvelle sur un bon de
    // commande dont on ignore jusqu'à la taille.
    expect(alertFor(null, 12)).toBe('unmeasured')
    expect(alertFor(null, null)).toBe('unmeasured')
  })

  it('une consommation non mesurable n’est pas « rien consommé »', () => {
    expect(alertFor(50, null)).toBe('unmeasured')
  })

  it('un volume à zéro ne se divise pas — non mesuré, jamais 100 %', () => {
    expect(alertFor(0, 10)).toBe('unmeasured')
  })

  it('sous le seuil, rien à annoncer', () => {
    const belowDays = Math.floor((PO_AMENDMENT_ALERT_PERCENT / 100) * 100) - 1
    expect(alertFor(100, belowDays)).toBe('ok')
    expect(alertFor(100, 0)).toBe('ok')
  })

  it('AU seuil, l’alerte est armée — la borne est incluse', () => {
    // Une borne exclusive ferait passer « pile 90 % » pour « rien à signaler »,
    // c'est-à-dire le cas exact que le seuil existe pour attraper.
    expect(alertFor(100, PO_AMENDMENT_ALERT_PERCENT)).toBe('approaching')
  })

  it('un DÉPASSEMENT reste un dépassement, il n’est pas absorbé par l’anticipation', () => {
    // Les deux appellent des gestes différents : demander un avenant avant, et
    // constater qu'on travaille hors bon de commande après.
    expect(alertFor(50, 60)).toBe('overrun')
  })

  it('un bon de commande PILE épuisé n’est pas « dépassé de 0 jour »', () => {
    // 100 % consommé, zéro jour restant : rien n'a été dépassé, et il n'y a
    // plus rien à consommer. C'est le moment le plus urgent pour l'avenant, pas
    // un dépassement à raconter.
    expect(alertFor(50, 50)).toBe('approaching')
  })

  it('le seuil est un POURCENTAGE utilisable, entre l’ouverture et le dépassement', () => {
    expect(PO_AMENDMENT_ALERT_PERCENT).toBeGreaterThan(0)
    expect(PO_AMENDMENT_ALERT_PERCENT).toBeLessThan(100)
  })
})

describe('poConsumptionAfterExtension — #2783, l’impact d’une prolongation AVANT l’avenant', () => {
  it('projette la consommation après les jours en plus, sans recalculer poConsumption', () => {
    const result = poConsumptionAfterExtension({ volumeDays: 50, consumedDays: 30, extraDays: 15 })
    expect(result?.before).toEqual(poConsumption(50, 30))
    expect(result?.after).toEqual(poConsumption(50, 45))
    expect(result?.alertBefore).toBe('ok')
    expect(result?.alertAfter).toBe('approaching')
  })

  it('une prolongation peut faire basculer vers le dépassement', () => {
    const result = poConsumptionAfterExtension({ volumeDays: 50, consumedDays: 40, extraDays: 20 })
    expect(result?.after?.remainingDays).toBe(-10)
    expect(result?.alertAfter).toBe('overrun')
  })

  it('sans volume connu, aucune projection — jamais « 0 % » déguisé', () => {
    expect(poConsumptionAfterExtension({ volumeDays: null, consumedDays: 10, extraDays: 5 })).toBeNull()
    expect(poConsumptionAfterExtension({ volumeDays: 50, consumedDays: null, extraDays: 5 })).toBeNull()
  })

  it('des jours négatifs ne se projettent pas — une prolongation retire des jours, ce n’est plus une extension', () => {
    expect(poConsumptionAfterExtension({ volumeDays: 50, consumedDays: 10, extraDays: -5 })).toBeNull()
  })
})

describe('poConsumptionOverviewSchema — #2783, le volume de PO à l’échelle de l’espace', () => {
  it('accepte quatre compteurs et deux comptes d’avenants, tous des entiers non négatifs', () => {
    const parsed = poConsumptionOverviewSchema.safeParse({
      ok: 3,
      approaching: 1,
      overrun: 0,
      unmeasured: 2,
      amendments: { accepted: 1, simulated: 0 },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse un compteur négatif — un volume ne se compte jamais en dessous de zéro', () => {
    const parsed = poConsumptionOverviewSchema.safeParse({
      ok: -1,
      approaching: 0,
      overrun: 0,
      unmeasured: 0,
      amendments: { accepted: 0, simulated: 0 },
    })
    expect(parsed.success).toBe(false)
  })
})
