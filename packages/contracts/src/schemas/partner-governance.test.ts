import { describe, expect, it } from 'vitest'
import {
  PARTNER_GOVERNANCE_DIMENSIONS,
  PARTNER_GOVERNANCE_STATUSES,
  deriveGovernanceStatus,
  partnerGovernanceReadiness,
  type PartnerGovernanceFields,
} from './partner-governance.js'

const EMPTY: PartnerGovernanceFields = {
  entryDoorScope: null,
  accountsAccessible: null,
  accountsForbidden: null,
  profilesSought: null,
  domainsCovered: null,
  marginFloorPercent: null,
  marginSharePercent: null,
  accountOwnership: null,
  actionOwnership: null,
  presentationTerms: null,
  paymentTerms: null,
  delayTerms: null,
  ourContactName: null,
  ourContactEmail: null,
  durationTerms: null,
  exitConditions: null,
  referencingProof: null,
  confidentialityLevel: null,
}

const FULL: PartnerGovernanceFields = {
  entryDoorScope: 'Grands comptes bancaires Sud-Ouest',
  accountsAccessible: ['Société Générale', 'BNP Paribas'],
  accountsForbidden: ['Crédit Agricole'],
  profilesSought: ['Data engineer senior'],
  domainsCovered: ['Data', 'Cloud'],
  marginFloorPercent: 12,
  marginSharePercent: 30,
  accountOwnership: 'partner',
  actionOwnership: 'shared',
  presentationTerms: 'CV anonymisé avant présentation',
  paymentTerms: '45 jours fin de mois',
  delayTerms: '48h pour répondre à un brief',
  ourContactName: 'Julie Marchand',
  ourContactEmail: 'julie@bellum-it.com',
  durationTerms: '12 mois reconductibles',
  exitConditions: 'Préavis de 30 jours',
  referencingProof: 'Mail de référencement du 12/09/2026',
  confidentialityLevel: 'restricted',
}

describe('partnerGovernanceReadiness', () => {
  it('nomme les dix-huit dimensions cadrées et manquantes quand rien n’est cadré', () => {
    const readiness = partnerGovernanceReadiness({ fields: EMPTY, nonSolicitation: null, partnerContactName: null })
    expect(readiness.framed).toEqual([])
    expect(readiness.missing).toHaveLength(PARTNER_GOVERNANCE_DIMENSIONS.length)
    expect(readiness.accountsConcerned).toEqual([])
    expect(readiness.profilesConcerned).toEqual([])
  })

  it('classe le risque « blocking » quand marge, non-contournement ou comptes accessibles manquent', () => {
    const readiness = partnerGovernanceReadiness({ fields: EMPTY, nonSolicitation: null, partnerContactName: null })
    expect(readiness.risk).toBe('blocking')
    expect(readiness.nextValidation).toBe('accounts_accessible')
  })

  it('ne fait AUCUNE ligne « comptes interdits » manquante si le champ vaut un tableau vide déclaré', () => {
    const readiness = partnerGovernanceReadiness({
      fields: { ...FULL, accountsForbidden: [] },
      nonSolicitation: true,
      partnerContactName: 'Un contact',
    })
    expect(readiness.missing).not.toContain('accounts_forbidden')
  })

  it('tout cadré + non-contournement déclaré + contact des deux côtés → risque « none »', () => {
    const readiness = partnerGovernanceReadiness({
      fields: FULL,
      nonSolicitation: true,
      partnerContactName: 'Business manager',
    })
    expect(readiness.framed).toHaveLength(PARTNER_GOVERNANCE_DIMENSIONS.length)
    expect(readiness.missing).toEqual([])
    expect(readiness.risk).toBe('none')
    expect(readiness.nextValidation).toBeNull()
    expect(readiness.accountsConcerned).toEqual(['Société Générale', 'BNP Paribas'])
    expect(readiness.profilesConcerned).toEqual(['Data engineer senior'])
  })

  it('l’interlocuteur de chaque côté ne se cadre que si LES DEUX contacts sont connus', () => {
    const oursOnly = partnerGovernanceReadiness({
      fields: { ...FULL, ourContactName: 'Julie' },
      nonSolicitation: true,
      partnerContactName: null,
    })
    expect(oursOnly.missing).toContain('counterpart_contacts')

    const both = partnerGovernanceReadiness({
      fields: { ...FULL, ourContactName: 'Julie' },
      nonSolicitation: true,
      partnerContactName: 'Un contact',
    })
    expect(both.missing).not.toContain('counterpart_contacts')
  })
})

describe('deriveGovernanceStatus', () => {
  it('rend "historical" quand la relation est retirée, quel que soit le reste', () => {
    const readiness = partnerGovernanceReadiness({ fields: FULL, nonSolicitation: true, partnerContactName: 'x' })
    const status = deriveGovernanceStatus({ stage: 'retire', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('historical')
  })

  it('rend "blocked" quand blockedAt est posé, avant même de regarder la préparation', () => {
    const readiness = partnerGovernanceReadiness({ fields: EMPTY, nonSolicitation: null, partnerContactName: null })
    const status = deriveGovernanceStatus({
      stage: 'flux_actif',
      pausedAt: null,
      blockedAt: '2026-09-20T00:00:00.000Z',
      readiness,
    })
    expect(status).toBe('blocked')
  })

  it('rend "rules_missing" quand le risque est bloquant et la relation n’est ni pausée ni bloquée', () => {
    const readiness = partnerGovernanceReadiness({ fields: EMPTY, nonSolicitation: null, partnerContactName: null })
    const status = deriveGovernanceStatus({ stage: 'flux_actif', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('rules_missing')
  })

  it('rend "active" quand le risque est nul et le flux est actif', () => {
    const readiness = partnerGovernanceReadiness({ fields: FULL, nonSolicitation: true, partnerContactName: 'x' })
    const status = deriveGovernanceStatus({ stage: 'flux_actif', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('active')
  })

  it('rend "qualified" quand le risque est nul mais le partenaire n’est pas encore en flux actif', () => {
    const readiness = partnerGovernanceReadiness({ fields: FULL, nonSolicitation: true, partnerContactName: 'x' })
    const status = deriveGovernanceStatus({ stage: 'contacte', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('qualified')
  })

  it('rend "observed" quand rien n’est cadré et rien n’a commencé (stage "identifie")', () => {
    const readiness = partnerGovernanceReadiness({ fields: EMPTY, nonSolicitation: null, partnerContactName: null })
    const status = deriveGovernanceStatus({ stage: 'identifie', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('observed')
  })

  it('rend "to_qualify" quand une partie du cadre est posée mais le risque reste "attention"', () => {
    const readiness = partnerGovernanceReadiness({
      fields: { ...FULL, presentationTerms: null },
      nonSolicitation: true,
      partnerContactName: 'x',
    })
    const status = deriveGovernanceStatus({ stage: 'identifie', pausedAt: null, blockedAt: null, readiness })
    expect(status).toBe('to_qualify')
  })

  it('expose exactement les huit statuts attendus, dans l’ordre du retour #3270', () => {
    expect(PARTNER_GOVERNANCE_STATUSES).toEqual([
      'observed',
      'to_qualify',
      'qualified',
      'rules_missing',
      'active',
      'paused',
      'blocked',
      'historical',
    ])
  })
})
