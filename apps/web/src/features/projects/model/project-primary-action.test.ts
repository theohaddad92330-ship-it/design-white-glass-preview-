import { describe, expect, it } from 'vitest'
import { primaryActionForProject } from './project-primary-action'

/**
 * #2171.16 — UN SEUL CTA PRINCIPAL, texte différent par étape. La fonction
 * est PURE (aucun composant à monter) : elle mappe l'étape réelle du projet
 * (et, sur `profiles_submitted`, le signal `interview_count`) vers un
 * libellé et une section à atteindre — jamais une étape inventée.
 */
describe('primaryActionForProject', () => {
  it.each([
    ['detected', 'qualify'],
    ['potential', 'qualify'],
    ['qualified', 'qualify'],
    ['confirmed', 'launchMatching'],
    ['negotiation', 'secureAgreements'],
  ] as const)('étape %s → %s', (stage, labelKey) => {
    expect(primaryActionForProject({ stage, interview_count: undefined })?.labelKey).toBe(labelKey)
  })

  it('profils présentés SANS entretien prévu → suivre les retours', () => {
    expect(primaryActionForProject({ stage: 'profiles_submitted', interview_count: 0 })?.labelKey).toBe('followUp')
  })

  it('profils présentés AVEC au moins un entretien → préparer l’entretien', () => {
    expect(primaryActionForProject({ stage: 'profiles_submitted', interview_count: 2 })?.labelKey).toBe(
      'prepareInterview',
    )
  })

  it('gagné : aucune action — le bouton dédié « créer la mission » la porte déjà (#1327)', () => {
    expect(primaryActionForProject({ stage: 'won', interview_count: undefined })).toBeNull()
  })

  it.each(['lost', 'dormant'] as const)('%s : rien à pousser en avant', stage => {
    expect(primaryActionForProject({ stage, interview_count: undefined })).toBeNull()
  })

  it('étape inconnue (deploy-skew) : aucune action plutôt qu’une devinée', () => {
    expect(primaryActionForProject({ stage: 'not-a-real-stage', interview_count: undefined })).toBeNull()
  })
})

// #4291.7 (recette 23/10, démo forfait) — « Plan stratégique 2029 » affichait « Lancer le matching » : en espace forfait /
// conseil une demande confirmée est un projet à cadrer, pas un besoin à staffer.
describe('primaryActionForProject — profil forfait / conseil (#4291.7)', () => {
  it('forfait : une demande confirmée se CADRE (périmètre, sponsor, budget), le matching n’est pas l’action principale', () => {
    const action = primaryActionForProject({ stage: 'confirmed' }, 'forfait_conseil')
    expect(action?.labelKey).toBe('frameProject')
    expect(action?.anchor).toBe('project-framing')
  })

  it('NON : staffing ou profil inconnu gardent « Lancer le matching » ; les autres étapes forfait ne bougent pas', () => {
    expect(primaryActionForProject({ stage: 'confirmed' }, 'staffing')?.labelKey).toBe('launchMatching')
    expect(primaryActionForProject({ stage: 'confirmed' }, null)?.labelKey).toBe('launchMatching')
    expect(primaryActionForProject({ stage: 'qualified' }, 'forfait_conseil')?.labelKey).toBe('qualify')
    expect(primaryActionForProject({ stage: 'negotiation' }, 'forfait_conseil')?.labelKey).toBe('secureAgreements')
  })
})
