import { describe, expect, it } from 'vitest'
import type { BriefingAction } from '@bellum/contracts'
import { briefingActionUrgencyTier } from './urgency-tier'

/**
 * #2389.6 — DISTINGUER URGENT / IMPORTANT / OPPORTUNITÉ / ADMINISTRATIF.
 *
 * Les quatre définitions viennent du corps de l'issue #2389 (« STRUCTURE »,
 * §DISTINCTION), pas d'une opinion :
 *   URGENT        deadline ou perte immédiate ;
 *   IMPORTANT     impact fort sans urgence immédiate ;
 *   OPPORTUNITÉ   action à potentiel ;
 *   ADMINISTRATIF à traiter mais ne doit pas écraser le commercial.
 *
 * Un timeout n'est pas un échec (doctrine) : l'absence d'échéance ne rend
 * jamais « urgent » par défaut, elle laisse la classification du GENRE de
 * carte décider.
 */
function action(
  partial: Partial<Pick<BriefingAction, 'kind' | 'expiresAt'>>,
): Pick<BriefingAction, 'kind' | 'expiresAt'> {
  return { kind: 'follow_up', expiresAt: null, ...partial }
}

const NOW = new Date('2026-09-22T09:00:00.000Z')

describe('briefingActionUrgencyTier — #2389.6', () => {
  it('un conflit d’agenda est URGENT — deux rendez-vous qui se chevauchent, maintenant', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'conflict' }), NOW)).toBe('urgent')
  })

  it('une mission qui se termine est URGENT — c’est une échéance', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'mission_end' }), NOW)).toBe('urgent')
  })

  it('une échéance dans l’heure rend n’importe quelle carte URGENT', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'follow_up', expiresAt: '2026-09-22T09:30:00.000Z' }), NOW)).toBe(
      'urgent',
    )
  })

  it('une échéance dans trois jours ne rend PAS urgent — ce n’est pas immédiat', () => {
    expect(
      briefingActionUrgencyTier(action({ kind: 'follow_up', expiresAt: '2026-09-25T09:00:00.000Z' }), NOW),
    ).not.toBe('urgent')
  })

  it('préparer un rendez-vous non imminent est IMPORTANT, pas urgent', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'meeting_prep' }), NOW)).toBe('important')
  })

  it('une relance sans réponse est IMPORTANT', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'follow_up' }), NOW)).toBe('important')
  })

  it('une réponse positive à enchaîner est IMPORTANT', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'reply' }), NOW)).toBe('important')
  })

  it('un signal frais sur un compte est une OPPORTUNITÉ — action à potentiel', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'account' }), NOW)).toBe('opportunity')
  })

  it('un besoin ouvert sans shortlist est une OPPORTUNITÉ', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'need_stale' }), NOW)).toBe('opportunity')
  })

  // #2106.6 — un consultant qui se libère bientôt est une action À POTENTIEL
  // (le proposer sur un besoin), même famille que `account`/`need_stale` :
  // aucune perte immédiate, rien à écraser sur le commercial.
  it('un consultant qui se libère bientôt est une OPPORTUNITÉ', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'consultant_available' }), NOW)).toBe('opportunity')
  })

  it('une tâche est ADMINISTRATIVE — à traiter sans écraser le commercial', () => {
    expect(briefingActionUrgencyTier(action({ kind: 'task' }), NOW)).toBe('administrative')
  })

  it('les quatre valeurs couvrent les huit genres de carte, aucun n’est oublié', () => {
    const kinds: BriefingAction['kind'][] = [
      'meeting_prep',
      'follow_up',
      'reply',
      'account',
      'mission_end',
      'conflict',
      'task',
      'need_stale',
      'consultant_available',
    ]
    for (const kind of kinds) {
      expect(['urgent', 'important', 'opportunity', 'administrative']).toContain(
        briefingActionUrgencyTier(action({ kind }), NOW),
      )
    }
  })
})
