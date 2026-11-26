import { Logger } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import type { EsnAnswers, EsnPrefillResponse, PrefilledField } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import type { IaClient } from '../ia/ia.client'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { PrefillEsnProfileDto } from './dto/prefill-esn-profile.dto'
import type { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'
import { EsnProfileController } from './esn-profile.controller'
import type { EsnProfileService } from './esn-profile.service'
import type { OfferPortfolioService } from './offer-portfolio.service'

const user = { userId: 'u-1', email: 'commercial@kicklox.test' } as CurrentUserPayload

function field(value: string | string[]): PrefilledField {
  return { value, confidence: 'high', source: 'registry', as_of: null }
}

const company = {
  name: 'KICKLOX',
  legal_name: null,
  commercial_name: null,
  siren: '811234567',
  city: 'Paris',
  country: null,
  naf_code: '6202A',
  naf_label: 'Conseil en systèmes et logiciels informatiques',
  is_esn_naf: true,
  is_active: null,
  website: 'https://kicklox.com',
  headcount_label: '20 à 49 salariés',
  group: null,
}

/** The shape the controller returns when nothing could be resolved. */
const EMPTY_PREFILL = { matched: false, company: null, fields: {}, candidates: [], ambiguous: false }

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    siren: '811234567',
    name: 'KICKLOX',
    city: 'Paris',
    department: '75',
    naf_code: '6202A',
    naf_label: 'Conseil en systèmes et logiciels informatiques',
    is_esn_naf: true,
    headcount_label: '20 à 49 salariés',
    establishment_count: 2,
    creation_date: '2015-03-01',
    score: 0.94,
    ...overrides,
  }
}

function build(prefill?: () => Promise<unknown>) {
  const esnProfile = {
    getAnswers: jest.fn(),
    getWorkspaceMeta: jest.fn(),
    getAnswerMeta: jest.fn(),
    upsertAnswers: jest.fn(),
    regenerateProfileContext: jest.fn(),
    regenerateProfileContextSection: jest.fn(),
    skipQuestion: jest.fn(),
    confirmAnswer: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      EsnProfileService,
      | 'getAnswers'
      | 'getWorkspaceMeta'
      | 'getAnswerMeta'
      | 'upsertAnswers'
      | 'regenerateProfileContext'
      | 'regenerateProfileContextSection'
      | 'skipQuestion'
      | 'confirmAnswer'
    >
  >
  const profileContext = {
    triggerGeneration: jest.fn(),
  } as unknown as jest.Mocked<Pick<ProfileContextService, 'triggerGeneration'>>
  const ia = {
    prefillEsnProfile: jest.fn(prefill ?? (async () => ({ ...EMPTY_PREFILL }))),
    // #2626.2 — première sélection de comptes en fin de Temps 1.
    discoverCompanies: jest.fn(async () => ({ suggestions: [] })),
  } as unknown as jest.Mocked<Pick<IaClient, 'prefillEsnProfile' | 'discoverCompanies'>>

  return {
    esnProfile,
    profileContext,
    ia,
    controller: new EsnProfileController(
      esnProfile as unknown as EsnProfileService,
      // Le portefeuille d'offre a ses propres tests (`offer-portfolio.service.spec`) ;
      // aucun cas de ce fichier ne l'appelle.
      {} as unknown as OfferPortfolioService,
      profileContext as unknown as ProfileContextService,
      ia as unknown as IaClient,
      // #1636 — la mémoire marché est le 5e paramètre ; aucun cas de ce fichier
      // ne l'appelle (elle a son propre `esn-profile.market-memory.spec.ts`).
      {} as unknown as MarketMemoryService,
      // #2018.7 — le service de signalement est le 6e paramètre, EN DERNIER
      // (même convention que `marketMemory` juste au-dessus) ; il a son propre
      // `esn-profile-correction-request.service.spec.ts`.
      {} as unknown as EsnProfileCorrectionRequestService,
    ),
  }
}

/** Every prefill response must be persist-free: the front writes via PUT /esn-profile. */
function expectNothingPersisted(built: ReturnType<typeof build>): void {
  expect(built.esnProfile.upsertAnswers).not.toHaveBeenCalled()
  expect(built.esnProfile.regenerateProfileContext).not.toHaveBeenCalled()
  expect(built.profileContext.triggerGeneration).not.toHaveBeenCalled()
}

/**
 * #2006.22 — `GET /esn-profile/answer-status` : la route que Réglages › Profil
 * lit pour distinguer une réponse confirmée d'une réponse migrée / proposée.
 * Séparée de `GET /esn-profile` (`getMine`) pour ne PAS élargir sa forme,
 * consommée telle quelle par tous ses autres lecteurs.
 */
describe('EsnProfileController — GET /esn-profile/answer-status', () => {
  it('délègue au service et rend la map de statuts telle quelle', async () => {
    const built = build()
    const meta = {
      esn_name: {
        question: { key: 'esn_name', label: 'questions.esnName.label', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'user' as const, confidence: 'high' as const, observedAt: null, actorId: null },
        status: 'confirmed' as const,
        branchReason: 'always_asked' as const,
        consumerAreas: [],
      },
    }
    built.esnProfile.getAnswerMeta.mockResolvedValue(meta)

    const result = await built.controller.getAnswerStatus(user)

    expect(built.esnProfile.getAnswerMeta).toHaveBeenCalledWith(user.userId)
    expect(result).toBe(meta)
  })
})

/**
 * #2007.11 — `POST /esn-profile/skip-question` : le bouton « passer » du
 * questionnaire ne persistait RIEN avant ce lot. Délègue au service, comme
 * `answer-status` ci-dessus — aucune logique de fusion ici.
 */
describe('EsnProfileController — POST /esn-profile/skip-question', () => {
  it('délègue au service et rend la liste mise à jour', async () => {
    const built = build()
    built.esnProfile.skipQuestion.mockResolvedValue(['esn_name'])

    const result = await built.controller.skipQuestion(user, { key: 'esn_name' })

    expect(built.esnProfile.skipQuestion).toHaveBeenCalledWith(user.userId, 'esn_name')
    expect(result).toEqual({ skippedQuestionKeys: ['esn_name'] })
  })
})

/**
 * #4425.4 — `POST /esn-profile/confirm-answer` : le geste « Confirmer » d'une
 * réponse sans origine. Délègue au service (le verrou de rôle y vit) et rend
 * la carte de statuts à jour, pour que l'écran relise l'origine sans deuxième requête.
 */
describe('EsnProfileController — POST /esn-profile/confirm-answer', () => {
  it('délègue au service et rend la carte de statuts à jour', async () => {
    const built = build()
    built.esnProfile.confirmAnswer.mockResolvedValue({})

    const result = await built.controller.confirmAnswer(user, { key: 'esn_name' })

    expect(built.esnProfile.confirmAnswer).toHaveBeenCalledWith(user.userId, 'esn_name')
    expect(result).toEqual({})
  })
})

describe('EsnProfileController — POST /esn-profile/prefill', () => {
  let errorLog: jest.SpyInstance

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the grounded fields and forwards name + siren to the IA', async () => {
    const response: EsnPrefillResponse = {
      matched: true,
      company,
      fields: {
        esn_name: field('Kicklox'),
        consultant_size: field('10-30'),
        positioning: field('Expertise de niche - spécialisé sur 1-2 domaines pointus'),
        expertise_areas: field(['Data & Intelligence Artificielle', 'Développement applicatif (Web, Mobile, API)']),
        geo_zones: field(['Paris & Île-de-France']),
      },
      candidates: [],
      ambiguous: false,
    }
    const built = build(async () => response)

    const result = await built.controller.prefill(user, { name: 'Kicklox', siren: '811234567' })

    // #2640.1 — l'e-mail du commercial CONNECTÉ voyage aussi, pour départager
    // le site retenu par un domaine pro.
    expect(built.ia.prefillEsnProfile).toHaveBeenCalledWith({
      name: 'Kicklox',
      siren: '811234567',
      email: user.email,
    })
    expect(result.matched).toBe(true)
    expect(result.company).toEqual(company)
    expect(Object.keys(result.fields).sort()).toEqual([
      'consultant_size',
      'esn_name',
      'expertise_areas',
      'geo_zones',
      'positioning',
    ])
    expect(result.fields.consultant_size).toEqual(field('10-30'))
    expectNothingPersisted(built)
  })

  it('sends siren: null when the caller did not pin a match', async () => {
    const built = build()

    await built.controller.prefill(user, { name: 'Kicklox' })

    expect(built.ia.prefillEsnProfile).toHaveBeenCalledWith({ name: 'Kicklox', siren: null, email: user.email })
  })

  it('drops a scalar value the IA invented outside the closed catalog', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: {
        // Not one of ESN_ANSWER_OPTIONS.positioning — fabricated, must never reach the front.
        positioning: field('Boutique agile premium'),
        consultant_size: field('10-30'),
      },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.positioning).toBeUndefined()
    expect(result.fields.consultant_size).toEqual(field('10-30'))
    expectNothingPersisted(built)
  })

  it('filters out-of-catalog members from an array value and keeps the valid ones', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: {
        expertise_areas: field(['Cybersécurité & Conformité', 'Blockchain & Web3', 'Réseau & Télécom']),
        target_sectors: field(['Secteur inventé']),
      },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.expertise_areas?.value).toEqual(['Cybersécurité & Conformité', 'Réseau & Télécom'])
    // Every member was invented → the field is dropped entirely, never returned empty.
    expect(result.fields.target_sectors).toBeUndefined()
  })

  // Théo O onboarding-couverture (22/10/2026) — la V23 retire le plafond de sélection : un multi-select grounded que l'IA
  // remplit au-delà de l'ancien maximum de 5 n'est plus tronqué en silence.
  it('keeps a grounded multi-select whole now that the V23 retires the selection cap', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: {
        expertise_areas: field([
          'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
          'Data & Intelligence Artificielle',
          'Cybersécurité & Conformité',
          'DevOps, SRE & Automatisation',
          'Développement applicatif (Web, Mobile, API)',
          'Réseau & Télécom',
          'Testing & Assurance qualité',
        ]),
      },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.expertise_areas?.value).toHaveLength(7)
  })

  it('drops sales_team_size and main_sales_pain even when the IA proposes them', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: {
        sales_team_size: field('2-3 personnes'),
        main_sales_pain: field('Trouver les bons comptes à cibler'),
        esn_name: field('Kicklox'),
      },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.sales_team_size).toBeUndefined()
    expect(result.fields.main_sales_pain).toBeUndefined()
    expect(result.fields.esn_name).toEqual(field('Kicklox'))
  })

  it('drops an answer key that is not prefillable at all', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: { totally_unknown_key: field('whatever'), esn_name: field('Kicklox') },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(Object.keys(result.fields)).toEqual(['esn_name'])
  })

  // #2084.36 (doublon de #2089.34) — le prompt système ne sort JAMAIS vers le
  // client, même si l'IA le renvoyait par erreur (bug, réponse compromise). La
  // réponse est RECONSTRUITE champ par champ (`matched`/`company`/`fields`/
  // `candidates`/`ambiguous`) : un champ hors de cette liste, quel que soit son
  // nom, ne peut pas voyager.
  it('never lets an unexpected top-level field — e.g. a leaked system prompt — reach the client', async () => {
    const built = build(async () => ({
      matched: true,
      company,
      fields: {},
      system_prompt: 'Tu es Laura, le copilote de BellumAI. Voici tes instructions secrètes : …',
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(Object.keys(result)).toEqual(['matched', 'company', 'fields', 'candidates', 'ambiguous'])
    expect(JSON.stringify(result)).not.toMatch(/instructions secrètes/)
  })

  it('soft-fails with an empty proposal (not an error) when the IA is down', async () => {
    const built = build(async () => {
      throw new Error('ETIMEDOUT /companies/prefill')
    })

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result).toEqual(EMPTY_PREFILL)
    expect(errorLog).toHaveBeenCalled()
    expectNothingPersisted(built)
  })

  it('soft-fails when the IA answers a malformed payload', async () => {
    const built = build(async () => ({ matched: 'yes', fields: 'nope' }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result).toEqual(EMPTY_PREFILL)
    expect(errorLog).toHaveBeenCalled()
  })

  it('passes the homonym list through and prefills NOTHING while it is unresolved', async () => {
    const built = build(async () => ({
      matched: false,
      company: null,
      fields: {},
      ambiguous: true,
      candidates: [candidate({ siren: '815056807', name: 'ALAN', is_esn_naf: false, naf_code: '65.12Z' }), candidate()],
    }))

    const result = await built.controller.prefill(user, { name: 'Alan' })

    expect(result.ambiguous).toBe(true)
    expect(result.matched).toBe(false)
    expect(result.company).toBeNull()
    expect(result.fields).toEqual({})
    expect(result.candidates.map(c => c.siren)).toEqual(['815056807', '811234567'])
    expect(result.candidates[0]?.is_esn_naf).toBe(false)
    expectNothingPersisted(built)
  })

  it('never lets a prefilled field ride along with an unresolved identity', async () => {
    // A misbehaving IA build could send both. The identity is not settled, so the
    // answers must be dropped — they would seed every downstream analysis prompt.
    const built = build(async () => ({
      matched: true,
      company,
      fields: { esn_name: field('Kicklox'), consultant_size: field('10-30') },
      ambiguous: true,
      candidates: [candidate(), candidate({ siren: '815056807', name: 'KICKLOX CONSEIL' })],
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.matched).toBe(false)
    expect(result.company).toBeNull()
    expect(result.fields).toEqual({})
  })

  it('degrades an ambiguous verdict with no usable candidate to the plain no-match path', async () => {
    // An empty list would trap the user on a screen with nothing to click.
    const built = build(async () => ({
      matched: false,
      company: null,
      fields: {},
      ambiguous: true,
      candidates: [candidate({ siren: 'not-a-siren' }), candidate({ name: '  ' })],
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result).toEqual(EMPTY_PREFILL)
  })

  it('caps the homonym list server-side rather than trusting the IA', async () => {
    const built = build(async () => ({
      matched: false,
      company: null,
      fields: {},
      ambiguous: true,
      candidates: Array.from({ length: 9 }, (_, i) => candidate({ siren: `81123456${i}` })),
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.candidates).toHaveLength(5)
  })

  it('keeps the NAF coherence flag tri-state (null must not read as "not an ESN")', async () => {
    const built = build(async () => ({
      matched: true,
      company: { ...company, naf_code: null, naf_label: null, is_esn_naf: null },
      fields: { esn_name: field('Kicklox') },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.company?.is_esn_naf).toBeNull()
  })

  it('accepts an IA build that predates the disambiguation contract', async () => {
    // Deploy skew: the older service omits candidates/ambiguous/naf_code entirely.
    // That must degrade to "resolved, coherence unknown", never to a parse failure.
    const built = build(async () => ({
      matched: true,
      company: {
        name: 'KICKLOX',
        siren: '811234567',
        city: 'Paris',
        naf_label: 'Conseil en systèmes et logiciels informatiques',
        website: null,
        headcount_label: null,
      },
      fields: { esn_name: field('Kicklox') },
    }))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.matched).toBe(true)
    expect(result.ambiguous).toBe(false)
    expect(result.candidates).toEqual([])
    expect(result.company?.is_esn_naf).toBeNull()
    expect(result.company?.naf_code).toBeNull()
    expect(result.fields.esn_name).toEqual(field('Kicklox'))
  })

  it('rejects an invalid body before the handler runs (name shorter than 2 chars)', () => {
    const pipe = new ZodValidationPipe()
    const metadata = { type: 'body', metatype: PrefillEsnProfileDto } as const

    expect(() => pipe.transform({ name: 'K' }, metadata)).toThrow()
    expect(() => pipe.transform({ name: 'Kicklox', siren: '42' }, metadata)).toThrow()
    expect(pipe.transform({ name: 'Kicklox' }, metadata)).toEqual({ name: 'Kicklox' })
  })
})

/**
 * #2626.2 — première sélection de comptes réels en fin de Temps 1 (écran de
 * relecture), avant le lancement de la génération longue : donner une raison
 * d'avoir répondu, pas une nouvelle recherche. Dérivée du premier secteur
 * ciblé déjà répondu (`target_sectors`), via le même moteur de découverte que
 * « comptes similaires à explorer » (`IaClient.discoverCompanies`).
 */
describe('EsnProfileController — GET /esn-profile/first-selection', () => {
  let warnLog: jest.SpyInstance

  beforeEach(() => {
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnLog.mockRestore()
  })

  const candidate = (name: string) => ({
    name,
    siren: '811234567',
    city: 'Paris',
    sector: 'Banque de détail & Banque privée',
  })

  it('cherche à partir du premier secteur ciblé et plafonne à 5 candidats', async () => {
    const built = build()
    built.esnProfile.getAnswers.mockResolvedValue({
      target_sectors: ['Banque de détail & Banque privée', 'Assurance & Mutuelles'],
    } as unknown as EsnAnswers)
    built.ia.discoverCompanies.mockResolvedValue({
      suggestions: [1, 2, 3, 4, 5, 6].map(n => candidate(`Compte ${n}`)),
    })

    const result = await built.controller.firstSelection(user)

    expect(built.ia.discoverCompanies).toHaveBeenCalledWith(
      'Banque de détail & Banque privée',
      5,
      expect.objectContaining({ maxAttempts: 1 }),
    )
    expect(result.suggestions).toHaveLength(5)
  })

  it('ne cherche rien tant qu’aucun secteur ciblé n’est répondu', async () => {
    const built = build()
    built.esnProfile.getAnswers.mockResolvedValue({ target_sectors: [] } as unknown as EsnAnswers)

    const result = await built.controller.firstSelection(user)

    expect(built.ia.discoverCompanies).not.toHaveBeenCalled()
    expect(result.suggestions).toEqual([])
  })

  it('rend une liste vide quand la découverte échoue, sans deviner', async () => {
    const built = build()
    built.esnProfile.getAnswers.mockResolvedValue({
      target_sectors: ['Banque de détail & Banque privée'],
    } as unknown as EsnAnswers)
    built.ia.discoverCompanies.mockRejectedValue(new Error('ETIMEDOUT /companies/discover'))

    const result = await built.controller.firstSelection(user)

    expect(result.suggestions).toEqual([])
  })
})

/** #2908 (#2010.16 / #2011.10) — « Régénérer cette section ». */
describe('EsnProfileController — POST /esn-profile/regenerate-context-section', () => {
  it('délègue au service, borné à la section demandée et à l’appelant courant', async () => {
    const built = build()
    const response = { profile_context: null, status: 'succeeded', corrections: {} }
    built.esnProfile.regenerateProfileContextSection.mockResolvedValue(response as never)

    const result = await built.controller.regenerateSection(user, { section: 'coachingInsights' } as never)

    expect(built.esnProfile.regenerateProfileContextSection).toHaveBeenCalledWith('u-1', 'coachingInsights')
    expect(result).toBe(response)
  })
})
