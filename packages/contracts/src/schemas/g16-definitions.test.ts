import { describe, expect, it } from 'vitest'
import { isNeedVague, missingNeedAxes, NEED_VAGUENESS_AXES } from './need-vagueness.js'
import { detectStaffingCollisions } from './staffing-collision.js'
import type { Submission } from './submission.js'

/**
 * G16 (16/09/2026) — LES DEUX NOTIONS QUE LE DÉPÔT N'AVAIT PAS DÉFINIES.
 *
 * « Collision » et « vague » étaient employés par cinq issues sans qu'aucun
 * critère n'existe dans le produit. Un mot sans définition ne se code ni ne se
 * recette ; ces tests figent les deux définitions tranchées, et surtout leurs
 * BORNES — c'est là que ces notions dérapent.
 */

function submission(over: Partial<Submission>): Submission {
  return {
    id: 's-1',
    projectId: 'p-1',
    projectLabel: null,
    accountId: 'a-1',
    accountName: null,
    needId: 'n-1',
    needRole: null,
    consultantId: 'c-1',
    consultantName: 'Nadia Khelifi',
    stage: 'submitted',
    stageEnteredAt: '2026-09-01T09:00:00.000Z',
    submittedAt: null,
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: null,
    cvSnapshot: null,
    ownerId: null,
    ownerName: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    ...over,
  } as Submission
}

describe('#2107.17 / #2108.18 / #2108.30 — « collision »', () => {
  it('lit un corpus réel — le jeu porte plusieurs positionnements ouverts', () => {
    const corpus = [submission({ id: 's-1' }), submission({ id: 's-2', needId: 'n-2' })]
    expect(corpus).toHaveLength(2)
    expect(detectStaffingCollisions(corpus)).toHaveLength(1)
  })

  it('DEUX positionnements ouverts du MÊME consultant sur DEUX besoins distincts', () => {
    const [collision] = detectStaffingCollisions([
      submission({ id: 's-1', needId: 'n-1' }),
      submission({ id: 's-2', needId: 'n-2' }),
    ])
    expect(collision?.consultantId).toBe('c-1')
    expect(collision?.needIds.sort()).toEqual(['n-1', 'n-2'])
    expect(collision?.submissionIds.sort()).toEqual(['s-1', 's-2'])
  })

  it('sait dire NON — un positionnement CLOS ne dispute plus personne', () => {
    expect(
      detectStaffingCollisions([
        submission({ id: 's-1', needId: 'n-1' }),
        submission({ id: 's-2', needId: 'n-2', stage: 'rejected' }),
      ]),
    ).toEqual([])
  })

  it('témoin — deux lignes sur le MÊME besoin sont un doublon, pas un conflit', () => {
    // Sans ce témoin, « au moins deux positionnements » suffirait, et le
    // détecteur crierait au conflit sur une double saisie.
    expect(detectStaffingCollisions([submission({ id: 's-1' }), submission({ id: 's-2' })])).toEqual([])
  })

  it('un besoin INCONNU ne collisionne avec rien — « non mesuré » n’est pas « en conflit »', () => {
    expect(
      detectStaffingCollisions([submission({ id: 's-1', needId: null }), submission({ id: 's-2', needId: null })]),
    ).toEqual([])
  })

  it('🔴 la collision entre COMMERCIAUX est écartée — le propriétaire ne décide de rien', () => {
    // Décision de Louis du 16/09/2026 : la détecter demanderait un suivi
    // d'activité PAR PERSONNE, ce que « l'analytique mesure le PRODUIT, jamais
    // la personne » interdit. Deux propriétaires différents sur le même compte
    // ne produisent AUCUNE collision, et ce test est ce qui le tient.
    expect(
      detectStaffingCollisions([
        submission({ id: 's-1', consultantId: 'c-1', needId: 'n-1', ownerId: 'u-marc' }),
        submission({ id: 's-2', consultantId: 'c-2', needId: 'n-2', ownerId: 'u-sarah' }),
      ]),
    ).toEqual([])
  })
})

describe('#2178.7 — « besoin vague »', () => {
  it('les TROIS axes manquants, et seulement alors', () => {
    expect(isNeedVague({ skills: [], target_tjm_cents: null, start_on: null })).toBe(true)
    expect(missingNeedAxes({ skills: [], target_tjm_cents: null, start_on: null })).toEqual([...NEED_VAGUENESS_AXES])
  })

  it('sait dire NON — un besoin qui nomme UNE compétence n’est pas vague', () => {
    expect(isNeedVague({ skills: [{ name: 'Go' }], target_tjm_cents: null, start_on: null })).toBe(false)
  })

  it('témoin — un besoin sans TJM reste un besoin normal, pas un besoin vague', () => {
    // C'est la borne qui compte : « vague » ne doit pas devenir un synonyme
    // d'« incomplet », sinon il compte la complétude de NOS champs.
    const need = { skills: [{ name: 'Go' }], target_tjm_cents: null, start_on: '2026-11-02' }
    expect(isNeedVague(need)).toBe(false)
    expect(missingNeedAxes(need)).toEqual(['rate'])
  })

  it('un TJM à zéro est un tarif ANNONCÉ, pas un trou', () => {
    expect(missingNeedAxes({ skills: [], target_tjm_cents: 0, start_on: null })).toEqual(['skills', 'start_date'])
  })
})
