import { describe, expect, it } from 'vitest'
import {
  CV_VERSION_KINDS,
  diffCvVersions,
  effectiveAnonymisationRule,
  generateCvVersionSchema,
  highlightedSkillsFor,
  initialCvVersionStatus,
  type CvVersion,
} from './cv-version.js'

/**
 * Les cinq versions d'un dossier de compétences (PDF 3 §9).
 *
 * Ce que ce test protège : un dossier appelé « anonyme » qui porterait un nom
 * complet. C'est la pire promesse non tenue possible sur cet écran, parce que
 * celui qui l'envoie ne le relit pas — c'est justement pour ça qu'il a demandé
 * une version anonyme.
 */
describe('effectiveAnonymisationRule', () => {
  it('FORCE l’anonymat sur une version anonyme, quoi qu’on demande', () => {
    expect(effectiveAnonymisationRule('anonyme', 'nom_complet', 'nom_complet')).toBe('initiales')
    expect(effectiveAnonymisationRule('anonyme', undefined, 'nom_complet')).toBe('initiales')
  })

  it('n’anonymise PAS les versions internes', () => {
    // Masquer le nom dans un document que seule l'ESN lit ne protège personne
    // et fait perdre du temps à celui qui le relit.
    for (const kind of ['source', 'enrichi', 'resume'] as const) {
      expect(effectiveAnonymisationRule(kind, 'initiales', 'trigramme')).toBe('nom_complet')
    }
  })

  it('suit la demande, puis le réglage d’espace, sur un CV client', () => {
    expect(effectiveAnonymisationRule('client', 'trigramme', 'nom_complet')).toBe('trigramme')
    expect(effectiveAnonymisationRule('client', undefined, 'prenom_initiale')).toBe('prenom_initiale')
  })

  it('couvre les cinq versions du §9, et pas une sixième', () => {
    // Le « CV optimisé pour un besoin » n'est pas une version : c'est le CV
    // client généré avec un besoin en contexte.
    expect(CV_VERSION_KINDS).toEqual(['source', 'client', 'anonyme', 'enrichi', 'resume'])
  })
})

/**
 * #2333.8/.9/.11 — le statut de départ d'une version.
 *
 * Le consentement expiré PRIME sur la policy d'espace : NO-GO, on n'affirme
 * jamais un dossier prêt à partir d'un accord qui n'est plus valide, même sur
 * un espace qui ne demande aucune validation.
 */
describe('initialCvVersionStatus', () => {
  it('valide seule sur policy « aucune », consentement valide', () => {
    expect(initialCvVersionStatus('aucune', 'valid')).toBe('validated')
    expect(initialCvVersionStatus('aucune', 'none')).toBe('validated')
  })

  it('attend un geste humain sur policy « consultant » ou « recruteur »', () => {
    expect(initialCvVersionStatus('consultant', 'valid')).toBe('pending_validation')
    expect(initialCvVersionStatus('recruteur', 'valid')).toBe('pending_validation')
  })

  it('le consentement EXPIRÉ force la validation, quelle que soit la policy', () => {
    expect(initialCvVersionStatus('aucune', 'expired')).toBe('pending_validation')
    expect(initialCvVersionStatus('consultant', 'expired')).toBe('pending_validation')
  })
})

/**
 * #2187.38 (épopée #2943) — les compétences RETENUES que le besoin ciblé
 * demandait explicitement sont « mises en avant », distinctement des autres
 * compétences retenues. Jamais une compétence absente du CV : cette fonction
 * ne fait qu'INTERSECTER deux listes déjà prouvées, elle n'en invente aucune.
 */
describe('highlightedSkillsFor', () => {
  it('met en avant les compétences retenues qui recoupent le besoin ciblé', () => {
    expect(
      highlightedSkillsFor(['Kubernetes', 'Go', 'Kafka'], [{ term: 'kubernetes' }, { term: 'Terraform' }]),
    ).toEqual(['Kubernetes'])
  })

  it('ne met rien en avant sans besoin ciblé', () => {
    expect(highlightedSkillsFor(['Kubernetes'], [])).toEqual([])
  })

  it('n’ajoute jamais une compétence absente des retenues, même demandée par le besoin', () => {
    // Le besoin peut demander « Rust » sans que le profil le prouve : ce n'est
    // alors ni retenu ni mis en avant, c'est barré ailleurs (excludedSkills).
    expect(highlightedSkillsFor(['Kubernetes'], [{ term: 'Rust' }])).toEqual([])
  })
})

const BASE: CvVersion = {
  id: 'v0000000-0000-4000-8000-000000000001',
  consultantId: 'c0000000-0000-4000-8000-000000000001',
  needId: null,
  opportunityId: null,
  rfpId: null,
  comparableMissionId: null,
  versionKind: 'client',
  templateKey: 'default',
  language: 'fr',
  anonymisationRule: 'nom_complet',
  sections: [
    { title: 'Profil', body: 'Ingénieur plateforme' },
    { title: 'Parcours', body: 'Orange, 2023-2026' },
  ],
  excludedSkills: [],
  changes: [],
  highlightedSkills: [],
  generatedBy: null,
  generatedAt: '2026-09-22T09:00:00.000Z',
  sentToContactId: null,
  status: 'validated',
  validatedBy: null,
  validatedAt: null,
}

/**
 * #2187.42 (épopée #2943) — l'action « Comparer » entre deux versions.
 *
 * Doctrine « on n'affiche pas ce qu'on n'a pas » : une section IDENTIQUE dans
 * les deux versions ne produit AUCUNE ligne de diff.
 */
describe('diffCvVersions', () => {
  it('ne signale RIEN entre deux versions identiques', () => {
    const diff = diffCvVersions(BASE, BASE)
    expect(diff.sections).toEqual([])
    expect(diff.excludedSkillsAdded).toEqual([])
    expect(diff.excludedSkillsRemoved).toEqual([])
  })

  it('signale une section CHANGÉE, jamais les sections identiques', () => {
    const after: CvVersion = {
      ...BASE,
      sections: [
        { title: 'Profil', body: 'Ingénieur plateforme senior' },
        { title: 'Parcours', body: 'Orange, 2023-2026' },
      ],
    }
    const diff = diffCvVersions(BASE, after)
    expect(diff.sections).toEqual([
      { title: 'Profil', before: 'Ingénieur plateforme', after: 'Ingénieur plateforme senior' },
    ])
  })

  it('signale une section AJOUTÉE ou RETIRÉE entre deux versions', () => {
    const after: CvVersion = { ...BASE, sections: [BASE.sections[0]!] }
    const diff = diffCvVersions(BASE, after)
    expect(diff.sections).toEqual([{ title: 'Parcours', before: 'Orange, 2023-2026', after: null }])
  })

  it('signale les compétences barrées et mises en avant AJOUTÉES ou RETIRÉES entre deux versions', () => {
    const before: CvVersion = { ...BASE, excludedSkills: [{ term: 'Kafka', reason: 'absente du CV source' }] }
    const after: CvVersion = { ...BASE, excludedSkills: [], highlightedSkills: ['Kubernetes'] }
    const diff = diffCvVersions(before, after)
    expect(diff.excludedSkillsRemoved).toEqual(['Kafka'])
    expect(diff.excludedSkillsAdded).toEqual([])
    expect(diff.highlightedSkillsAdded).toEqual(['Kubernetes'])
  })
})

/**
 * #2187.25-27 (épopée #2943) — une version cible AU PLUS une source : un
 * besoin, un appel d'offres, ou une mission comparable, jamais deux à la fois.
 */
describe('generateCvVersionSchema — au plus une source', () => {
  const NEED = 'a0000000-0000-4000-8000-000000000001'
  const OPPORTUNITY = 'd0000000-0000-4000-8000-000000000001'
  const RFP = 'b0000000-0000-4000-8000-000000000001'
  const MISSION = 'c0000000-0000-4000-8000-000000000001'

  it('accepte aucune source, ou une seule', () => {
    expect(generateCvVersionSchema.safeParse({}).success).toBe(true)
    expect(generateCvVersionSchema.safeParse({ needId: NEED }).success).toBe(true)
    expect(generateCvVersionSchema.safeParse({ opportunityId: OPPORTUNITY }).success).toBe(true)
    expect(generateCvVersionSchema.safeParse({ rfpId: RFP }).success).toBe(true)
    expect(generateCvVersionSchema.safeParse({ comparableMissionId: MISSION }).success).toBe(true)
  })

  it('refuse DEUX sources à la fois, quelle que soit la combinaison', () => {
    expect(generateCvVersionSchema.safeParse({ needId: NEED, rfpId: RFP }).success).toBe(false)
    expect(generateCvVersionSchema.safeParse({ needId: NEED, comparableMissionId: MISSION }).success).toBe(false)
    expect(generateCvVersionSchema.safeParse({ rfpId: RFP, comparableMissionId: MISSION }).success).toBe(false)
    expect(generateCvVersionSchema.safeParse({ opportunityId: OPPORTUNITY, needId: NEED }).success).toBe(false)
    expect(generateCvVersionSchema.safeParse({ opportunityId: OPPORTUNITY, rfpId: RFP }).success).toBe(false)
  })
})
