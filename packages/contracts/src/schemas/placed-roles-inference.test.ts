import { describe, expect, it } from 'vitest'
import {
  type PlacedRolesInferenceInput,
  effectiveInferredPlacedRoles,
  foldForRoleMatch,
  inferPlacedRoles,
  offerMatchesRoleTerms,
} from './placed-roles-inference.js'

// Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026) :
// « Tout le contexte, et sinon on pose la question. »
const EMPTY: PlacedRolesInferenceInput = {
  texts: [],
  offerDomain: null,
  offerDomains: [],
  consultants: [],
  missions: [],
}

const roles = (input: Partial<PlacedRolesInferenceInput>) => inferPlacedRoles({ ...EMPTY, ...input }).map(r => r.role)

describe('inferPlacedRoles — métiers déduits du contexte (11/10)', () => {
  it('ESN cyber : le texte libre de l’onboarding suffit (cas Antoine Meyer)', () => {
    const out = inferPlacedRoles({
      ...EMPTY,
      texts: [
        {
          field: 'positioning',
          text: 'Cabinet spécialisé en cybersécurité : SOC managé, tests d’intrusion et conformité ISO 27001.',
        },
      ],
    })
    expect(out.map(r => r.role)).toEqual(
      expect.arrayContaining(['Consultant cybersécurité', 'Analyste SOC', 'Pentester']),
    )
    const cyber = out.find(r => r.role === 'Consultant cybersécurité')!
    expect(cyber.evidence[0]).toMatchObject({ source: 'onboarding', field: 'positioning' })
    expect(cyber.evidence[0]!.excerpt.toLowerCase()).toContain('cybersécurité')
    expect(cyber.terms).toContain('cybersecurite')
  })

  it('ESN industrie : le portefeuille d’offres nomme les métiers', () => {
    const out = roles({ offerDomains: ['MECHANICAL_ENGINEERING', 'AUTOMATION_ROBOTICS'] })
    expect(out).toEqual(expect.arrayContaining(['Ingénieur mécanique / CAO', 'Automaticien / robotique']))
    expect(out).not.toContain('Développeur')
  })

  it('ESN IT : le vivier (titres + compétences des CV) déduit le métier dès deux consultants', () => {
    const out = inferPlacedRoles({
      ...EMPTY,
      consultants: [
        { title: 'Développeur Java senior', skills: ['Spring'] },
        { title: 'Ingénieur logiciel', skills: ['React', 'TypeScript'] },
      ],
    })
    const dev = out.find(r => r.role === 'Développeur')!
    expect(dev.evidence.map(e => e.source)).toEqual(['talent_pool', 'talent_pool'])
    expect(dev.evidenceCount).toBe(2)
  })

  it('un SEUL consultant ne suffit pas — un indice faible ne fait pas un métier', () => {
    expect(roles({ consultants: [{ title: 'Développeur Java', skills: [] }] })).toEqual([])
  })

  it('une mission gagnée compte comme un indice fort', () => {
    expect(roles({ missions: [{ title: 'Analyste SOC N2', label: 'Run SOC 24/7' }] })).toContain('Analyste SOC')
  })

  it('contexte vide ⇒ aucun métier : on pose la question, on ne devine pas', () => {
    expect(inferPlacedRoles(EMPTY)).toEqual([])
  })

  it('SAIT DIRE NON — mots génériques sans métier (« développement commercial », « qualité de service », « société »)', () => {
    expect(
      roles({
        texts: [
          {
            field: 'positioning',
            text: 'Notre société mise sur le développement commercial, la qualité de service et notre réseau de partenaires.',
          },
        ],
      }),
    ).toEqual([])
  })

  it('le domaine d’offre singulier non ambigu (cyber) est un indice ; esn_it seul n’en est pas un', () => {
    expect(roles({ offerDomain: 'cyber' })).toContain('Consultant cybersécurité')
    expect(roles({ offerDomain: 'esn_it' })).toEqual([])
  })

  it('classe les métiers par force des indices', () => {
    const out = roles({
      texts: [{ field: 'expertise_areas', text: 'Cybersécurité' }],
      consultants: [
        { title: 'Développeur', skills: [] },
        { title: 'Développeur', skills: [] },
      ],
    })
    expect(out[0]).toBe('Consultant cybersécurité')
    expect(out).toContain('Développeur')
  })
})

describe('effectiveInferredPlacedRoles — le déclaré gagne toujours', () => {
  const inferred = inferPlacedRoles({ ...EMPTY, offerDomains: ['CYBER_IAM_GRC'] })

  it('sans métier déclaré : les déduits servent, moins ceux que l’humain a retirés', () => {
    const kept = effectiveInferredPlacedRoles(inferred, [], ['Analyste SOC'])
    expect(kept.map(r => r.role)).toContain('Consultant cybersécurité')
    expect(kept.map(r => r.role)).not.toContain('Analyste SOC')
  })

  it('dès qu’un métier est DÉCLARÉ, les déduits ne pèsent plus (correction humaine jamais écrasée)', () => {
    expect(effectiveInferredPlacedRoles(inferred, ['Data'], [])).toEqual([])
  })
})

describe('offerMatchesRoleTerms — même lecture que le filtre IA', () => {
  it('match par mot entier, insensible aux accents', () => {
    expect(offerMatchesRoleTerms('Analyste SOC H/F', ['soc'])).toBe(true)
    expect(offerMatchesRoleTerms('Chargé de société', ['soc'])).toBe(false)
    expect(offerMatchesRoleTerms('Test d’intrusion senior', ['test d intrusion'])).toBe(true)
    expect(foldForRoleMatch('Ingénieur Sécurité')).toBe('ingenieur securite')
  })
})
