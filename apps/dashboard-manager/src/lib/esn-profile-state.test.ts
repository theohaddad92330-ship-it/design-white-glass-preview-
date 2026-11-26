import { describe, expect, it } from 'vitest'
import { describeEsnProfile } from './esn-profile-state'
import type { AdminWorkspaceEsnProfile } from './admin'

/**
 * #1671-ter — « le propriétaire a-t-il rempli la fiche de son ESN ? »
 *
 * Le cas réel : APRICOT LABS, 07/09/2026. La réponse n'était lisible qu'en base
 * de production, et il a fallu un aller-retour pour la trancher.
 */

const FICHE: AdminWorkspaceEsnProfile = {
  canonical: true,
  heldByUserId: 'adel',
  heldByEmail: 'adel@apricotlabs.fr',
  version: 3,
  updatedAt: '2026-09-04T17:50:51.000Z',
  answers: [
    { key: 'esn_name', scope: 'company', filled: true },
    { key: 'positioning', scope: 'company', filled: false },
    { key: 'main_sales_pain', scope: 'personal', filled: true },
  ],
  companyFilled: 1,
  companyTotal: 2,
}

describe('describeEsnProfile', () => {
  it('rend la fiche et son compte de faits sur l’entreprise', () => {
    const state = describeEsnProfile(FICHE)

    expect(state.kind).toBe('present')
    if (state.kind !== 'present') throw new Error('état inattendu')
    expect(state.companyFilled).toBe(1)
    expect(state.companyTotal).toBe(2)
    expect(state.heldByEmail).toBe('adel@apricotlabs.fr')
  })

  it('SAIT DIRE NON — pas de ligne canonique, pas de fiche', () => {
    expect(describeEsnProfile({ ...FICHE, canonical: false })).toEqual({ kind: 'none' })
  })

  it('DISTINGUE « je ne sais pas » de « il n’y en a pas »', () => {
    // Le défaut qu'on refuse : un écran qui lit ce qui MANQUE sans lire
    // l'INTERRUPTEUR annonce une panne au repos. Ici, l'API ancienne (champ
    // absent) ne se lit pas « aucune fiche ».
    expect(describeEsnProfile(undefined)).toEqual({ kind: 'unavailable' })
    expect(describeEsnProfile(undefined)).not.toEqual(describeEsnProfile({ ...FICHE, canonical: false }))
  })

  it('NE TRANSPORTE AUCUNE VALEUR de réponse', () => {
    // La stratégie commerciale d'un client (positionnement, secteurs visés) ne
    // sort pas vers une console d'opérateur. La garde porte sur la FORME.
    const state = describeEsnProfile(FICHE)
    if (state.kind !== 'present') throw new Error('état inattendu')

    for (const answer of state.answers) {
      expect(Object.keys(answer).sort()).toEqual(['filled', 'key', 'scope'])
    }
  })
})
