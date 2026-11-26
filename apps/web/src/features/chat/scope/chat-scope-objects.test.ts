import { describe, expect, it } from 'vitest'
import {
  consultantScope,
  filterScopeConsultants,
  filterScopeMissions,
  filterScopeNeeds,
  isSameScope,
  missionScope,
  needScope,
  PORTFOLIO_SCOPE,
  scopeAccountId,
  scopeConsultantsFrom,
  scopeMissionsFrom,
  scopeNeedsFrom,
  scopeObjectOf,
  type ChatScope,
} from './chat-scope'

/**
 * #1951.2 / #1951.3 / #1910.5 / #1910.6 / #1910.7 — les portées « un
 * consultant », « un besoin » et « une mission ».
 *
 * La portée voyage comme `accountId` : l'écran DÉSIGNE un objet (nature +
 * identifiant), le serveur en relit le contenu. Le libellé que porte la portée
 * ne sert qu'à l'afficher — il ne part jamais au serveur.
 */

const SOPHIE = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'
const NEED = '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10'
const MISSION = 'c0ffee00-1111-4222-8333-444455556666'

describe('scopeObjectOf — ce qui part au serveur', () => {
  it('un consultant et un besoin partent en nature + identifiant, sans libellé', () => {
    expect(scopeObjectOf({ kind: 'consultant', consultantId: SOPHIE, label: 'Sophie Martin' })).toEqual({
      kind: 'consultant',
      id: SOPHIE,
    })
    expect(scopeObjectOf({ kind: 'need', needId: NEED, label: 'Data engineer · SNCF' })).toEqual({
      kind: 'need',
      id: NEED,
    })
    // #1910.6 — la mission voyage comme les deux autres : nature + identifiant.
    expect(scopeObjectOf({ kind: 'mission', missionId: MISSION, label: 'Refonte SI · SG' })).toEqual({
      kind: 'mission',
      id: MISSION,
    })
  })

  it('sait dire NON — les portées de compte et d’ensemble ne désignent aucun objet', () => {
    expect(scopeObjectOf(PORTFOLIO_SCOPE)).toBeNull()
    expect(scopeObjectOf({ kind: 'none' })).toBeNull()
    expect(scopeObjectOf({ kind: 'account', accountId: 'a-1' })).toBeNull()
  })

  it('une portée objet n’envoie aucun compte : le portefeuille reste lisible côté serveur', () => {
    expect(scopeAccountId({ kind: 'consultant', consultantId: SOPHIE, label: null })).toBeNull()
  })
})

describe('isSameScope — deux portées objet', () => {
  const sophie: ChatScope = { kind: 'consultant', consultantId: SOPHIE, label: 'Sophie Martin' }

  it('le même consultant est la même portée, même si son libellé a changé', () => {
    expect(isSameScope(sophie, { kind: 'consultant', consultantId: SOPHIE, label: null })).toBe(true)
  })

  it('deux consultants, ou un consultant et un besoin au même identifiant, ne le sont pas', () => {
    expect(isSameScope(sophie, { kind: 'consultant', consultantId: NEED, label: null })).toBe(false)
    expect(isSameScope(sophie, { kind: 'need', needId: SOPHIE, label: null })).toBe(false)
  })

  it('#1910.6 — une mission ne se confond ni avec un besoin ni avec une autre mission', () => {
    const refonte: ChatScope = { kind: 'mission', missionId: MISSION, label: 'Refonte SI' }
    expect(isSameScope(refonte, { kind: 'mission', missionId: MISSION, label: null })).toBe(true)
    expect(isSameScope(refonte, { kind: 'mission', missionId: NEED, label: null })).toBe(false)
    expect(isSameScope(refonte, { kind: 'need', needId: MISSION, label: null })).toBe(false)
  })
})

describe('les listes proposées par la modale', () => {
  const consultants = scopeConsultantsFrom([
    {
      id: SOPHIE,
      full_name: 'Sophie Martin',
      title: 'Consultante Java',
      available_from: '2026-10-01',
      archived_at: null,
    },
    { id: 'c-2', full_name: 'Hélène Roy', title: 'Data engineer', available_from: null, archived_at: null },
    { id: 'c-3', full_name: 'Paul Archive', title: null, available_from: null, archived_at: '2026-01-01' },
    { id: 'c-4', full_name: null, title: null, available_from: null, archived_at: null },
  ])

  it('un consultant archivé n’est pas proposé ; un nom absent reste absent', () => {
    expect(consultants.map(c => c.id)).toEqual([SOPHIE, 'c-2', 'c-4'])
    expect(consultants[2]).toEqual({ id: 'c-4', fullName: null, title: null, availableFrom: null })
  })

  it('cherche sans accents ni casse, sur le nom ET le poste', () => {
    expect(filterScopeConsultants(consultants, 'helene').map(c => c.id)).toEqual(['c-2'])
    expect(filterScopeConsultants(consultants, 'JAVA').map(c => c.id)).toEqual([SOPHIE])
    expect(filterScopeConsultants(consultants, '  ')).toHaveLength(3)
  })

  const needs = scopeNeedsFrom([
    { id: NEED, title: 'Data engineer', account_name: 'SNCF' },
    { id: 'n-2', title: 'Architecte cloud', account_name: null },
  ])

  it('cherche un besoin sur son intitulé ET son compte', () => {
    expect(filterScopeNeeds(needs, 'sncf').map(n => n.id)).toEqual([NEED])
    expect(filterScopeNeeds(needs, 'cloud').map(n => n.id)).toEqual(['n-2'])
  })

  /**
   * #1910.6 — LES MISSIONS PROPOSABLES.
   *
   * Une mission TERMINÉE n'est pas proposée : « où en est-on ? » n'a pas de
   * réponse sur une mission close, et la proposer ferait cadrer un fil sur un
   * dossier qui ne bouge plus. Même raison que le consultant archivé.
   */
  const missions = scopeMissionsFrom([
    { id: MISSION, label: 'Refonte du SI paiement', status: 'active', accountName: 'Société Générale' },
    { id: 'm-2', label: 'TMA portail', status: 'onboarding', accountName: null },
    { id: 'm-3', label: 'Ancienne mission', status: 'ended', accountName: 'SNCF' },
    { id: 'm-4', label: 'Mission interrompue', status: 'terminated', accountName: 'SNCF' },
  ])

  it('une mission terminée ou interrompue n’est pas proposée', () => {
    expect(missions.map(m => m.id)).toEqual([MISSION, 'm-2'])
  })

  it('cherche une mission sur son intitulé ET son compte', () => {
    expect(filterScopeMissions(missions, 'societe generale').map(m => m.id)).toEqual([MISSION])
    expect(filterScopeMissions(missions, 'PORTAIL').map(m => m.id)).toEqual(['m-2'])
    expect(filterScopeMissions(missions, '  ')).toHaveLength(2)
  })

  it('le libellé d’une portée nomme ce que Laura va lire', () => {
    expect(consultantScope(consultants[0]!)).toEqual({
      kind: 'consultant',
      consultantId: SOPHIE,
      label: 'Sophie Martin',
    })
    expect(needScope(needs[0]!)).toEqual({ kind: 'need', needId: NEED, label: 'Data engineer · SNCF' })
    expect(needScope(needs[1]!)).toEqual({ kind: 'need', needId: 'n-2', label: 'Architecte cloud' })
    expect(missionScope(missions[0]!)).toEqual({
      kind: 'mission',
      missionId: MISSION,
      label: 'Refonte du SI paiement · Société Générale',
    })
    expect(missionScope(missions[1]!)).toEqual({ kind: 'mission', missionId: 'm-2', label: 'TMA portail' })
  })
})
