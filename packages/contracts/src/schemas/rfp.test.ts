import { describe, expect, it } from 'vitest'
import type { RfpAnswerVersion } from './rfp.js'
import {
  assignRfpSectionOwnerSchema,
  rfpReferenceKey,
  rfpDuplicateMatchKindSchema,
  addRfpRequirementCommentSchema,
  RFP_ANSWER_VERSIONS_MAX,
  withAnswerVersion,
  assessRfpActionability,
  computeRfpCompliance,
  computeRfpImportPreviewIndicators,
  createRfpRequestSchema,
  findRfpSimilarityDuplicate,
  RFP_EXTRACTION_CATEGORIES,
  rfpAnswerStatusSchema,
  rfpDocumentExtractionSchema,
  rfpDuplicateMatchSchema,
  rfpExtractedFieldSchema,
  rfpImportDraftSchema,
  rfpImportPreviewSchema,
  rfpRequirementSchema,
  rfpSchema,
  type RfpActionabilityInput,
  type RfpDuplicateCandidate,
  type RfpImportDraft,
  type RfpRequirement,
} from './rfp.js'

const DOCUMENT_HASH = 'a'.repeat(64)

/**
 * Le rapport de conformité (addendum final p66, p68).
 *
 * Il ne dit pas « c'est bon » : il compte ce qui MANQUE. Une réponse exportée
 * avec trois exigences obligatoires sans source est une réponse qu'on perd, et
 * le savoir avant l'envoi est tout l'intérêt du studio.
 */

function requirement(over: Partial<RfpRequirement> = {}): RfpRequirement {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    rfp_id: '22222222-2222-4222-8222-222222222222',
    section: null,
    text: 'Hébergement des données en France',
    weight: 'mandatory',
    kind: 'security',
    owner_role: 'security',
    answer_status: 'to_produce',
    answer_source: null,
    answer_text: null,
    risk: null,
    source_document: null,
    ...over,
  }
}

describe('conformité RFP', () => {
  it('refuse l’export tant qu’une obligatoire n’est pas validée', () => {
    const report = computeRfpCompliance([requirement()])
    expect(report.mandatoryUnanswered).toBe(1)
    expect(report.exportReady).toBe(false)
  })

  it('autorise l’export quand tout est validé et sourcé', () => {
    const report = computeRfpCompliance([
      requirement({ answer_status: 'validated', answer_source: 'politique sécurité 2026' }),
    ])
    expect(report.exportReady).toBe(true)
  })

  it('une ambiguïté bloque l’export — elle cache peut-être une obligation', () => {
    // Trancher une ambiguïté à la place du client est la façon la plus courante
    // de perdre un lot.
    const report = computeRfpCompliance([
      requirement({ answer_status: 'validated', answer_source: 'x' }),
      requirement({ id: 'b', weight: 'ambiguous', answer_status: 'validated', answer_source: 'y' }),
    ])
    expect(report.ambiguous).toBe(1)
    expect(report.exportReady).toBe(false)
  })

  it('signale une réponse rédigée SANS source comme un engagement non prouvé', () => {
    // C'est la pire des données fictives : un engagement contractuel inventé.
    const report = computeRfpCompliance([requirement({ answer_status: 'drafted', answer_source: null })])
    expect(report.unprovenCommitments).toHaveLength(1)
    expect(report.exportReady).toBe(false)
  })

  it('ne compte pas une exigence informative comme un manque', () => {
    // Elle n'engage à rien : la faire remonter noierait les vrais trous.
    const report = computeRfpCompliance([requirement({ weight: 'informative' })])
    expect(report.pendingByOwner).toEqual({})
    expect(report.exportReady).toBe(true)
  })

  // #2957 (#2181.19/.20/.22/.23) — le registre `STATUTS` du studio de réponse
  // (#2181) nomme sept statuts ; seuls quatre existaient (`to_produce`,
  // `reused`, `drafted`, `validated`). Les quatre manquants n'engagent aucune
  // logique nouvelle dans `computeRfpCompliance` : ils restent, comme
  // `to_produce`/`drafted`/`reused`, des états NON validés — une obligatoire
  // dans l'un de ces états manque toujours sa réponse validée.
  it.each(['to_complete', 'to_validate', 'blocked', 'not_applicable'] as const)(
    'accepte le statut « %s » dans le schéma et le compte comme non validé',
    status => {
      expect(rfpAnswerStatusSchema.safeParse(status).success).toBe(true)
      const report = computeRfpCompliance([requirement({ answer_status: status })])
      expect(report.mandatoryUnanswered).toBe(1)
      expect(report.exportReady).toBe(false)
    },
  )

  it('ventile ce qui reste à produire par rôle', () => {
    const report = computeRfpCompliance([
      requirement({ owner_role: 'security' }),
      requirement({ id: 'b', owner_role: 'security' }),
      requirement({ id: 'c', owner_role: 'legal', weight: 'desirable' }),
    ])
    expect(report.pendingByOwner).toEqual({ security: 2, legal: 1 })
  })

  it('rend un rapport honnête sur un dossier vide', () => {
    const report = computeRfpCompliance([])
    expect(report).toMatchObject({ total: 0, mandatory: 0, mandatoryUnanswered: 0, exportReady: true })
  })

  it('accepte la forme de dossier annoncée', () => {
    const now = new Date().toISOString()
    expect(() =>
      rfpSchema.parse({
        id: '33333333-3333-4333-8333-333333333333',
        workspace_id: '44444444-4444-4444-8444-444444444444',
        account_id: null,
        title: 'AO industrialisation MLOps',
        issuer: null,
        source_format: 'docx',
        status: 'analysed',
        due_at: null,
        lots: ['Lot 1'],
        decision: null,
        requirements: [],
        document_extraction: null,
        created_at: now,
        updated_at: now,
      }),
    ).not.toThrow()
  })
})

/**
 * #2957 (#2181.10/.14) — la STRUCTURE demandée par #2181 nomme `preuve` et
 * `confiance` par exigence, distincts de `answer_source` (la RÉFÉRENCE — un
 * document, un expert) : `evidence` porte le TEXTE de la preuve elle-même,
 * `confidence` la confiance de la personne qui répond dans SA réponse —
 * jamais une probabilité de résultat commercial (doctrine c26).
 */
describe('preuve et confiance par exigence (#2181.10/.14)', () => {
  it('accepte evidence et confidence, tous deux nullable', () => {
    const parsed = rfpRequirementSchema.safeParse({
      ...requirement(),
      evidence: 'Extrait de la politique sécurité 2026, §4.2.',
      confidence: 'high',
    })
    expect(parsed.success).toBe(true)
  })

  it('un dossier antérieur à ce chantier reste valide — les deux champs sont absents, jamais un défaut fabriqué', () => {
    const withoutNewFields = requirement() as Record<string, unknown>
    delete withoutNewFields['evidence']
    delete withoutNewFields['confidence']
    const parsed = rfpRequirementSchema.safeParse(withoutNewFields)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.evidence ?? null).toBeNull()
      expect(parsed.data.confidence ?? null).toBeNull()
    }
  })

  it('refuse une confiance hors catalogue', () => {
    const parsed = rfpRequirementSchema.safeParse({ ...requirement(), confidence: 'certain' })
    expect(parsed.success).toBe(false)
  })
})

/**
 * #2056.14 — un AO reçu n'est pas une opportunité traitable. Cinq choses le
 * disent, et le moteur doit pouvoir dire LEQUEL manque, jamais un simple compte.
 */
describe('assessRfpActionability (#2056.14)', () => {
  const allConfirmed: RfpActionabilityInput = {
    briefAvailable: true,
    clientResponsive: true,
    economicsKnown: true,
    capacityConfirmed: true,
    ownerAssigned: true,
  }

  it('est traitable seulement quand les CINQ sont confirmés', () => {
    expect(assessRfpActionability(allConfirmed)).toEqual({ actionable: true, missing: [] })
  })

  it('nomme le seul axe manquant', () => {
    const result = assessRfpActionability({ ...allConfirmed, capacityConfirmed: false })
    expect(result).toEqual({ actionable: false, missing: ['capacite'] })
  })

  it('un axe NON MESURÉ (null) manque aussi — jamais confondu avec « confirmé » (GA-18/GA-19)', () => {
    const result = assessRfpActionability({ ...allConfirmed, ownerAssigned: null })
    expect(result.actionable).toBe(false)
    expect(result.missing).toEqual(['responsable'])
  })

  it('reçu (brief disponible) ne veut pas dire traitable — un AO sans rien de plus manque les quatre autres', () => {
    const result = assessRfpActionability({
      briefAvailable: true,
      clientResponsive: null,
      economicsKnown: null,
      capacityConfirmed: null,
      ownerAssigned: null,
    })
    expect(result.actionable).toBe(false)
    expect(result.missing).toEqual(['retour', 'economie', 'capacite', 'responsable'])
  })
})

/**
 * #2180.2 / #2180.4 — DÉTECTION de plusieurs documents à l'intake.
 *
 * `documents` est ADDITIF : l'intake mono-document (`text`/`fileBase64` seuls)
 * doit continuer à valider EXACTEMENT comme avant. En dessous de deux entrées,
 * ce n'est pas un regroupement — un seul document utilise les champs du dessus.
 */
describe('createRfpRequestSchema — intake multi-documents (#2180.2, #2180.4)', () => {
  it('valide toujours un intake mono-document sans `documents`', () => {
    const parsed = createRfpRequestSchema.safeParse({ title: 'AO', text: 'contenu' })
    expect(parsed.success).toBe(true)
  })

  it('accepte au moins deux documents détectés', () => {
    const parsed = createRfpRequestSchema.safeParse({
      title: 'AO',
      documents: [
        { text: 'cahier des charges', fileName: 'cctp.pdf' },
        { text: 'bordereau de prix', fileName: 'bpu.xlsx' },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse un regroupement à un seul document — ce n’est pas un regroupement', () => {
    const parsed = createRfpRequestSchema.safeParse({
      title: 'AO',
      documents: [{ text: 'seul document' }],
    })
    expect(parsed.success).toBe(false)
  })
})

/**
 * #2180.5 / #2180.6 / #2180.41-46 — l'écran de preview d'import.
 *
 * `computeRfpImportPreviewIndicators` est une fonction PURE, comme
 * `computeRfpCompliance` : l'API et l'écran doivent l'exécuter à l'identique.
 */
describe('computeRfpImportPreviewIndicators (#2180.41-46)', () => {
  function draft(over: Partial<RfpImportDraft> = {}): RfpImportDraft {
    return {
      account_id: null,
      title: 'AO',
      issuer: null,
      source_format: 'pasted',
      due_at: null,
      lots: [],
      source_text: null,
      decision: null,
      requirements: [],
      document_hash: DOCUMENT_HASH,
      document_extraction: null,
      ...over,
    }
  }

  it('compte le total et les obligatoires — les deux seuls axes réellement calculés', () => {
    const indicators = computeRfpImportPreviewIndicators(
      draft({
        requirements: [
          requirement({ weight: 'mandatory' }),
          requirement({ id: 'b', weight: 'desirable' }),
          requirement({ id: 'c', weight: 'mandatory' }),
        ],
      }),
    )
    expect(indicators.totalRequirements).toBe(3)
    expect(indicators.mandatoryRequirements).toBe(2)
  })

  it('reprend l’échéance du dossier telle quelle', () => {
    const indicators = computeRfpImportPreviewIndicators(draft({ due_at: '2026-12-01T00:00:00.000Z' }))
    expect(indicators.dueAt).toBe('2026-12-01T00:00:00.000Z')
  })

  it('nomme « non mesuré » (null) les deux axes sans détection — jamais un zéro fabriqué', () => {
    // #2180.43/.46 : aucune détection de complétude documentaire ni
    // d'extraction de coût n'existe encore. Un score n'est jamais nu : l'axe
    // reste NOMMÉ, jamais tu à zéro.
    const indicators = computeRfpImportPreviewIndicators(draft({ requirements: [requirement()] }))
    expect(indicators.missingDocuments).toBeNull()
    expect(indicators.estimatedCost).toBeNull()
  })

  it('#2180.35/.44 — sans extraction documentaire, les contradictions restent « non mesuré »', () => {
    const indicators = computeRfpImportPreviewIndicators(draft({ document_extraction: null }))
    expect(indicators.contradictions).toBeNull()
  })

  it('#2180.35/.44 — une extraction SANS désaccord entre documents compte zéro, un zéro MESURÉ', () => {
    const indicators = computeRfpImportPreviewIndicators(
      draft({
        document_extraction: {
          legal_entity: { value: 'Client A', source_document: 'a.pdf', page: '1', confidence: 'high', status: 'found' },
        },
      }),
    )
    expect(indicators.contradictions).toBe(0)
  })

  it('#2180.35/.44 — compte les catégories dont le statut porte une contradiction réelle', () => {
    const indicators = computeRfpImportPreviewIndicators(
      draft({
        document_extraction: {
          legal_entity: { value: null, source_document: null, page: null, confidence: null, status: 'contradiction' },
          calendar: { value: null, source_document: null, page: null, confidence: null, status: 'contradiction' },
          pricing: { value: '10 000 €', source_document: 'a.pdf', page: '3', confidence: 'high', status: 'found' },
        },
      }),
    )
    expect(indicators.contradictions).toBe(2)
  })

  it('un dossier vide reste honnête — zéro exigence, jamais fabriqué', () => {
    const indicators = computeRfpImportPreviewIndicators(draft())
    expect(indicators.totalRequirements).toBe(0)
    expect(indicators.mandatoryRequirements).toBe(0)
  })
})

describe('rfpImportDraftSchema (#2180.5)', () => {
  it('accepte le brouillon d’un import mono-document', () => {
    const parsed = rfpImportDraftSchema.safeParse({
      account_id: null,
      title: 'AO industrialisation',
      issuer: null,
      source_format: 'pasted',
      due_at: null,
      lots: [],
      source_text: 'contenu',
      decision: null,
      requirements: [requirement()],
      document_hash: DOCUMENT_HASH,
      document_extraction: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('#2180.40 — refuse un brouillon sans hash documentaire, jamais un « non mesuré » silencieux', () => {
    const parsed = rfpImportDraftSchema.safeParse({
      account_id: null,
      title: 'AO industrialisation',
      issuer: null,
      source_format: 'pasted',
      due_at: null,
      lots: [],
      source_text: 'contenu',
      decision: null,
      requirements: [],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('rfpImportPreviewSchema / rfpDuplicateMatchSchema (#2180.36-40)', () => {
  const base = {
    draft: {
      account_id: null,
      title: 'AO',
      issuer: null,
      source_format: 'pasted' as const,
      due_at: null,
      lots: [],
      source_text: null,
      decision: null,
      requirements: [],
      document_hash: DOCUMENT_HASH,
      document_extraction: null,
    },
    indicators: {
      totalRequirements: 0,
      mandatoryRequirements: 0,
      dueAt: null,
      missingDocuments: null,
      contradictions: null,
      estimatedCost: null,
    },
  }

  it('accepte l’absence de doublon — une recherche réellement faite, pas « non mesuré »', () => {
    expect(rfpImportPreviewSchema.safeParse({ ...base, duplicateOf: null }).success).toBe(true)
  })

  it('porte le dossier trouvé quand le hash correspond à un import déjà présent dans l’espace', () => {
    const match = { id: '33333333-3333-4333-8333-333333333333', title: 'AO existant', matchedOn: ['hash'] }
    expect(rfpDuplicateMatchSchema.safeParse(match).success).toBe(true)
    expect(rfpImportPreviewSchema.safeParse({ ...base, duplicateOf: match }).success).toBe(true)
  })

  it('refuse un doublon sans critère nommé — jamais un doublon muet', () => {
    expect(rfpDuplicateMatchSchema.safeParse({ id: '33333333-3333-4333-8333-333333333333', title: 'AO' }).success).toBe(
      false,
    )
  })
})

describe('findRfpSimilarityDuplicate (#2180.36-38)', () => {
  const candidate = (patch: Partial<RfpDuplicateCandidate> = {}): RfpDuplicateCandidate => ({
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Refonte SI comptable',
    issuer: 'Société Générale',
    due_at: '2026-11-30T00:00:00.000Z',
    ...patch,
  })

  it('ne propose rien sur un seul critère concordant — un titre proche seul ne suffit pas', () => {
    const match = findRfpSimilarityDuplicate({ title: 'Refonte SI comptable', issuer: null, due_at: null }, [
      candidate({ issuer: null, due_at: null }),
    ])
    expect(match).toBeNull()
  })

  it('propose le doublon quand le titre (distance d’édition) ET l’émetteur concordent', () => {
    const match = findRfpSimilarityDuplicate(
      { title: 'Refonte SI Comptable ', issuer: 'société générale', due_at: null },
      [candidate({ due_at: null })],
    )
    expect(match).toEqual({ id: candidate().id, title: candidate().title, matchedOn: ['title', 'issuer'] })
  })

  it('propose le doublon quand le titre ET la date limite (même jour) concordent', () => {
    const match = findRfpSimilarityDuplicate(
      { title: 'Refonte SI comptable', issuer: null, due_at: '2026-11-30T09:00:00.000Z' },
      [candidate({ issuer: null })],
    )
    expect(match?.matchedOn.sort()).toEqual(['due_at', 'title'])
  })

  it('ne propose rien quand les titres divergent franchement, même émetteur et date identiques', () => {
    const match = findRfpSimilarityDuplicate(
      { title: 'Support poste de travail', issuer: 'Société Générale', due_at: '2026-11-30T09:00:00.000Z' },
      [candidate()],
    )
    expect(match).toBeNull()
  })

  it('ne compare jamais un critère absent des deux côtés — deux émetteurs `null` ne concordent pas', () => {
    const match = findRfpSimilarityDuplicate(
      { title: 'Refonte SI comptable', issuer: null, due_at: '2026-11-30T09:00:00.000Z' },
      [candidate({ issuer: null, due_at: null })],
    )
    expect(match).toBeNull()
  })
})

/**
 * #2957 — l'extraction document (#2180.9-.26) : douze catégories, chacune
 * avec sa provenance. Distincte de `requirements[]` (une ligne de conformité
 * par exigence) — c'est une structure de DOSSIER.
 */
describe('rfpExtractedFieldSchema / rfpDocumentExtractionSchema (#2957)', () => {
  it('accepte un champ TROUVÉ avec sa provenance complète', () => {
    const parsed = rfpExtractedFieldSchema.safeParse({
      value: 'Société Générale SA',
      source_document: 'CCTP.pdf',
      page: '3',
      confidence: 'high',
      status: 'found',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepte un champ NON TROUVÉ — value null, jamais un texte de remplissage', () => {
    const parsed = rfpExtractedFieldSchema.safeParse({
      value: null,
      source_document: null,
      page: null,
      confidence: null,
      status: 'not_found',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse un statut hors catalogue — un statut inventé ne se glisse pas dans le contrat', () => {
    const parsed = rfpExtractedFieldSchema.safeParse({
      value: null,
      source_document: null,
      page: null,
      confidence: null,
      status: 'guessed',
    })
    expect(parsed.success).toBe(false)
  })

  it('porte exactement les douze catégories nommées par l’épopée, chacune optionnelle', () => {
    expect(RFP_EXTRACTION_CATEGORIES).toHaveLength(12)
    const parsed = rfpDocumentExtractionSchema.safeParse({})
    expect(parsed.success).toBe(true)
  })

  it('accepte une extraction partielle — un dossier peut ne renseigner qu’une catégorie', () => {
    const parsed = rfpDocumentExtractionSchema.safeParse({
      legal_entity: { value: 'SG SA', source_document: null, page: null, confidence: 'high', status: 'found' },
    })
    expect(parsed.success).toBe(true)
  })
})

// #2957 (#2181.15/.16) — commentaires et versions par exigence.
describe('commentaires et versions par exigence (#2181.15/.16)', () => {
  const base = {
    answer_text: 'Hébergement en France, certifié HDS.',
    answer_status: 'drafted',
    answer_source: 'Réf. X',
  }
  const at = new Date('2026-09-28T12:00:00.000Z')

  it('un commentaire vide ou trop long est refusé', () => {
    expect(addRfpRequirementCommentSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(addRfpRequirementCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false)
    expect(addRfpRequirementCommentSchema.parse({ body: '  à revoir  ' }).body).toBe('à revoir')
  })

  it('réécrire la réponse archive l’ancienne, la plus récente en tête', () => {
    const next = withAnswerVersion(base, { ...base, answer_text: 'Nouvelle réponse' }, 'u-1', at)
    expect(next.versions).toEqual([
      {
        answer_text: 'Hébergement en France, certifié HDS.',
        answer_status: 'drafted',
        answer_source: 'Réf. X',
        replaced_at: '2026-09-28T12:00:00.000Z',
        replaced_by: 'u-1',
      },
    ])
  })

  it('sait dire NON — changer autre chose que le texte ne crée aucune version', () => {
    expect(withAnswerVersion(base, { ...base, answer_status: 'validated' }, 'u-1', at).versions).toBeUndefined()
  })

  it('sait dire NON — une première réponse (rien avant) ne crée aucune version', () => {
    const empty = { ...base, answer_text: null }
    expect(withAnswerVersion(empty, { ...empty, answer_text: 'Première' }, 'u-1', at).versions).toBeUndefined()
  })

  it('garde une taille bornée — la plus ancienne sort au-delà du plafond', () => {
    let current: typeof base & { versions?: RfpAnswerVersion[] } = base
    for (let index = 0; index < RFP_ANSWER_VERSIONS_MAX + 3; index += 1) {
      current = withAnswerVersion(current, { ...current, answer_text: `v${index}` }, null, at)
    }
    expect(current.versions).toHaveLength(RFP_ANSWER_VERSIONS_MAX)
  })
})

// #2957 (#2180.39) — le doublon par RÉFÉRENCE de consultation : un critère EXACT
// une fois la ponctuation et la casse retirées, sans seuil de similarité.
describe('rfpReferenceKey (#2180.39)', () => {
  it('rend la même clé pour la même référence écrite différemment', () => {
    expect(rfpReferenceKey('2026-INFRA-042')).toBe('2026INFRA042')
    expect(rfpReferenceKey('  2026 / infra / 042 ')).toBe('2026INFRA042')
  })

  it('sait dire NON — rien, ou trop court pour identifier une consultation', () => {
    expect(rfpReferenceKey(null)).toBeNull()
    expect(rfpReferenceKey(undefined)).toBeNull()
    expect(rfpReferenceKey('  ')).toBeNull()
    expect(rfpReferenceKey('A-1')).toBeNull()
  })

  it('le critère « reference » est un type de concordance nommé', () => {
    expect(rfpDuplicateMatchKindSchema.parse('reference')).toBe('reference')
  })
})

// #2957 (#2181.40) — attribuer une section entière à un rôle.
describe('assignRfpSectionOwnerSchema (#2181.40)', () => {
  it('accepte une section nommée ou « sans section », refuse un rôle inconnu', () => {
    expect(assignRfpSectionOwnerSchema.parse({ section: 'Sécurité', owner_role: 'legal' }).section).toBe('Sécurité')
    expect(assignRfpSectionOwnerSchema.parse({ section: null, owner_role: 'sales' }).section).toBeNull()
    expect(assignRfpSectionOwnerSchema.safeParse({ section: 'Sécurité', owner_role: 'ceo' }).success).toBe(false)
  })
})
