import { describe, expect, it } from 'vitest'
import { resolveSavedBranches } from './reply-branch'

/**
 * #1953.11 / #1953.22 — LA PROVENANCE SURVIT AU RECHARGEMENT.
 *
 * Défaut mesuré en production le 16/09/2026 (SHA servi 4897da487, fil
 * b04ed923-26ee-4b03-802d-a9c209d4b2c5) : « Modifier ma demande » étiquetait
 * bien la réponse abandonnée — « Réponse remplacée à 15:05 — conservée pour
 * mémoire » — puis un rechargement complet de la page faisait disparaître
 * l'étiquette. Zéro élément du DOM portant « remplac ». Les deux échanges se
 * retrouvaient côte à côte, sans rien qui dise que le second est une réédition
 * du premier.
 *
 * Cette fonction est la porte de retour : ce que l'API sert
 * (`superseded_at`, `branch_of_message_id`, `branch_kind`) redevient ce que
 * l'écran sait afficher (`supersededAt`, `branchOf`).
 */
describe('resolveSavedBranches — ce qu’un fil relu redit de ses branches', () => {
  const first = {
    id: 'm-1',
    created_at: '2026-09-16T13:02:00.000Z',
    superseded_at: '2026-09-16T13:05:00.000Z',
    branch_of_message_id: null,
    branch_kind: null,
  }
  const second = {
    id: 'm-2',
    created_at: '2026-09-16T13:07:00.000Z',
    superseded_at: null,
    branch_of_message_id: 'm-1',
    branch_kind: 'edit',
  }

  it('LIT quelque chose — la réponse remplacée retrouve son heure', () => {
    const resolved = resolveSavedBranches([first, second])
    expect(resolved.get('m-1')?.supersededAt).toEqual(new Date('2026-09-16T13:05:00.000Z'))
  })

  it('la réédition DÉSIGNE la réponse dont elle repart, avec son heure', () => {
    const resolved = resolveSavedBranches([first, second])
    expect(resolved.get('m-2')?.branchOf).toEqual({
      kind: 'edit',
      previousTimestamp: new Date('2026-09-16T13:02:00.000Z'),
    })
  })

  it('TÉMOIN — un échange ordinaire ne gagne RIEN', () => {
    const plain = { id: 'm-9', created_at: '2026-09-16T13:00:00.000Z' }
    const resolved = resolveSavedBranches([plain])
    expect(resolved.get('m-9')).toBeUndefined()
  })

  it('une nature INCONNUE n’invente pas une branche — jamais une valeur devinée', () => {
    const resolved = resolveSavedBranches([first, { ...second, branch_kind: 'fusion' }])
    expect(resolved.get('m-2')?.branchOf).toBeUndefined()
  })

  it('la réponse d’origine hors de la fenêtre lue : la branche reste, son heure est `null`', () => {
    // Le fil est lu par tranche (50 messages) : la réponse dont on repart peut
    // être plus haut. « Non mesuré » n'est pas une heure inventée.
    const resolved = resolveSavedBranches([second])
    expect(resolved.get('m-2')?.branchOf).toEqual({ kind: 'edit', previousTimestamp: null })
  })

  it('une date illisible ne devient JAMAIS une heure — elle disparaît', () => {
    const resolved = resolveSavedBranches([
      { ...first, created_at: 'pas-une-date', superseded_at: 'pas-une-date' },
      second,
    ])
    expect(resolved.get('m-1')?.supersededAt).toBeUndefined()
    expect(resolved.get('m-2')?.branchOf).toEqual({ kind: 'edit', previousTimestamp: null })
  })
})
