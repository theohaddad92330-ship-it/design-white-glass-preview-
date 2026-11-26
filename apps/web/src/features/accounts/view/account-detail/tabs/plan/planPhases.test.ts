/**
 * #1888 — « je veux que les phases soient repliées par défaut, genre la
 * première quand on l'a pas commencée est ouverte, puis c'est la 2 etc, que ce
 * soit aussi organique à l'intérieur ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE QUE CE FICHIER EXISTE POUR ÉVITER
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur d'AVANCEMENT n'est pas un état » : un ✓ posé sur la règle
 * `index < indexCourant` a déjà fait conclure l'inverse du vrai dans ce dépôt.
 * `firstUnfinishedPhaseIndex` ne regarde donc JAMAIS un rang — elle interroge
 * l'état RÉEL de chaque action (`ActionPlanItem.done`, persisté côté serveur,
 * ou la case cochée localement quand personne n'est connecté).
 *
 * Les deux tests « sait dire NON » sont les deux derniers : une phase faite
 * APRÈS une phase inachevée ne fait pas avancer le curseur, et une phase
 * seulement ENTAMÉE reste celle qui appelle une action.
 */
import { describe, expect, it } from 'vitest'
import type { PlanWeek } from '../../helpers/plan'
import { firstUnfinishedPhaseIndex } from './planPhases'

/** Trois phases de 2 actions — la forme que `normalizePlanWeeks` produit. */
function weeks(counts: number[] = [2, 2, 2]): PlanWeek[] {
  return counts.map((count, index) => ({
    week: index + 1,
    title: `Phase ${index + 1}`,
    items: Array.from({ length: count }, (_item, step) => ({ text: `action ${index}-${step}` })),
  }))
}

/** `done` décrit, phase par phase, les étapes FAITES — l'état, pas le rang. */
function doneAt(done: ReadonlyArray<ReadonlyArray<number>>) {
  return (weekIndex: number, stepIndex: number) => (done[weekIndex] ?? []).includes(stepIndex)
}

describe('firstUnfinishedPhaseIndex — la phase qui appelle une action', () => {
  it('rien de commencé : c’est la première phase qui s’ouvre', () => {
    expect(firstUnfinishedPhaseIndex(weeks(), doneAt([]))).toBe(0)
  })

  it('la première phase terminée : c’est la 2 — « puis c’est la 2 etc »', () => {
    expect(firstUnfinishedPhaseIndex(weeks(), doneAt([[0, 1]]))).toBe(1)
  })

  it('les deux premières terminées : c’est la 3', () => {
    expect(
      firstUnfinishedPhaseIndex(
        weeks(),
        doneAt([
          [0, 1],
          [0, 1],
        ]),
      ),
    ).toBe(2)
  })

  it('tout est fait : aucune phase ne s’ouvre — plus rien n’appelle une action', () => {
    expect(
      firstUnfinishedPhaseIndex(
        weeks(),
        doneAt([
          [0, 1],
          [0, 1],
          [0, 1],
        ]),
      ),
    ).toBeNull()
  })

  it('un plan sans phase ne désigne rien', () => {
    expect(firstUnfinishedPhaseIndex([], doneAt([]))).toBeNull()
  })

  it('une phase SANS action est sautée : « rien à faire » n’est pas « à faire »', () => {
    expect(firstUnfinishedPhaseIndex(weeks([0, 2]), doneAt([]))).toBe(1)
  })

  // ── Les deux preuves qu’on lit un ÉTAT, et pas un rang ────────────────────

  it('sait dire NON : une phase 3 déjà faite ne fait PAS avancer le curseur au-delà de la 2 inachevée', () => {
    // Le défaut qu'une lecture positionnelle produirait : « la dernière cochée
    // est la 3, donc on en est à la 4 ». L'état dit l'inverse — la 2 n'est pas
    // finie, c'est elle qui appelle une action.
    const done = doneAt([[0, 1], [], [0, 1]])
    expect(firstUnfinishedPhaseIndex(weeks(), done)).toBe(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas : une phase seulement ENTAMÉE reste ouverte', () => {
    // Une action sur deux faite dans la phase 1 : elle n'est pas terminée, donc
    // elle reste celle qu'on ouvre — on ne saute pas à la 2 au premier ✓.
    expect(firstUnfinishedPhaseIndex(weeks(), doneAt([[0]]))).toBe(0)
  })
})
