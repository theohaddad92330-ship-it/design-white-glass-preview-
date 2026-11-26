import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import {
  effectiveEntryStrategy,
  esnArchetypeSchema,
  esnArchetypeValues,
  kpiTargetsSchema,
  profileContextRevisionSchema,
  profileContextRevisionSummarySchema,
  profileContextResponseSchema,
  profileContextSchema,
  applyProfileContextCorrections,
  correctProfileContextFieldInputSchema,
  mergeRegeneratedProfileContextSection,
  profileContextCorrectionsSchema,
  profileContextStatusSchema,
  profileContextStatusValues,
  profileContradictionSchema,
  recordAuditMoveDecisionSchema,
  regenerateProfileContextSectionInputSchema,
  sellingPostureSchema,
  sellingPostureValues,
  welcomeSummarySchema,
} from './profile-context.js'

const VALID_PROFILE_CAMEL = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque'],
    decisionLevel: 'director',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 10,
    firecrawlPagesCount: 5,
    contactsTarget: 30,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: ['data'],
  },
  messagingStyle: {
    tone: 'directExpert',
    messageLength: 'standard',
    valuePropositionAngle: 'expertise data',
    differentiationPoints: ['spécialisation'],
    avoid: ['volume'],
  },
  coachingInsights: {
    mainWeakness: 'prospection irrégulière',
    keyAdvice: 'régularité bat intensité',
    cadenceRecommendation: {
      analysesPerWeek: 5,
      messagesPerDay: 10,
      followUpsPerWeek: 20,
    },
    kpiTargets: {
      accountsPerMonth: 15,
      rdvPerMonth: 4,
      conversionRateTarget: '20%',
    },
  },
  bellumPhrases: {
    welcome: 'Bienvenue !',
    firstAnalysisCta: 'Commencez ici',
    weeklySummaryIntro: 'Cette semaine',
    emptyState: 'Pipeline vide',
    scoreContext: 'Score > 7',
  },
} as const

const VALID_PROFILE_LEGACY_SNAKE = {
  esn_archetype: 'boutique_expert',
  selling_posture: 'expertise_rare',
  ideal_account_profile: {
    size: 'eti',
    sectors_priority: ['Banque'],
    decision_level: 'director',
    entry_strategy: 'bottom_up',
  },
  analysis_parameters: {
    brave_queries_count: 10,
    firecrawl_pages_count: 5,
    contacts_target: 30,
    analysis_depth: 'standard',
    max_tokens_research: 12000,
    focus_areas: ['data'],
  },
} as const

describe('esnArchetypeSchema', () => {
  it('exposes the canonical camelCase values via esnArchetypeValues', () => {
    expect(esnArchetypeValues).toEqual([
      'soloHunter',
      'boutiqueExpert',
      'midMarketChallenger',
      'scaleUp',
      'enterprisePlayer',
    ])
  })

  it('migrates legacy snake_case values to camelCase', () => {
    // Older Supabase rows + earlier Claude outputs persisted snake_case. The
    // preprocess keeps them parseable until a backfill rewrites storage.
    expect(esnArchetypeSchema.parse('solo_hunter')).toBe('soloHunter')
    expect(esnArchetypeSchema.parse('boutique_expert')).toBe('boutiqueExpert')
    expect(esnArchetypeSchema.parse('enterprise_player')).toBe('enterprisePlayer')
  })
})

describe('sellingPostureSchema', () => {
  it('exposes the canonical camelCase values via sellingPostureValues', () => {
    expect(sellingPostureValues).toEqual([
      'expertiseRare',
      'volumeFlexible',
      'strategicConsulting',
      'nearshoreCompetitive',
      'nicheVerticals',
    ])
  })

  it('accepts the canonical camelCase values', () => {
    for (const value of sellingPostureValues) {
      expect(sellingPostureSchema.parse(value)).toBe(value)
    }
  })

  it('migrates the legacy French `conseil_strategique` to `strategicConsulting`', () => {
    // Backwards-compat for Supabase rows + older Claude outputs that may
    // still carry the French value. Drop the preprocess once the values are
    // backfilled in storage.
    expect(sellingPostureSchema.parse('conseil_strategique')).toBe('strategicConsulting')
  })

  it('migrates legacy snake_case values to camelCase', () => {
    expect(sellingPostureSchema.parse('expertise_rare')).toBe('expertiseRare')
    expect(sellingPostureSchema.parse('strategic_consulting')).toBe('strategicConsulting')
  })

  it('rejects unknown postures', () => {
    expect(() => sellingPostureSchema.parse('mystery')).toThrow()
  })
})

describe('profileContextStatusSchema', () => {
  it('exposes the canonical status values, including the new `validated` state', () => {
    expect(profileContextStatusValues).toEqual(['not_generated', 'generating', 'succeeded', 'validated', 'failed'])
  })

  it('accepts every canonical status value', () => {
    for (const value of profileContextStatusValues) {
      expect(profileContextStatusSchema.parse(value)).toBe(value)
    }
  })

  it('rejects a status outside the list', () => {
    expect(() => profileContextStatusSchema.parse('generated')).toThrow()
  })
})

// D9 — décision Louis 14/09/2026 : valider le contexte commercial. `GET
// /profile-context/me` doit porter l'état de validation — `validatedAt` —
// pour que l'écran d'audit commercial distingue un contexte « validé » d'un
// contexte simplement « généré ».
describe('profileContextResponseSchema — validatedAt (D9)', () => {
  it('accepts a null validatedAt (contexte jamais validé, ou régénéré depuis)', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.validatedAt).toBeNull()
  })

  it('accepts an ISO validatedAt on a validated context', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'validated',
      failureReason: null,
      validatedAt: '2026-09-14T10:00:00.000Z',
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.validatedAt).toBe('2026-09-14T10:00:00.000Z')
  })

  it('rejects a response missing validatedAt — it is ADDED, never optional: the caller must say non-mesuré explicitly', () => {
    expect(() =>
      profileContextResponseSchema.parse({ profile_context: null, status: 'not_generated', withheld: null }),
    ).toThrow()
  })
})

// #2073.8 — LA STRATÉGIE CHOISIE, distincte du champ CALCULÉ par le
// profileur. Même discipline que `validatedAt`/`withheld` : ADDED, jamais
// optionnel.
describe('profileContextResponseSchema — chosenEntryStrategy (#2073.8)', () => {
  it('accepts a null chosenEntryStrategy — aucun choix explicite', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.chosenEntryStrategy).toBeNull()
  })

  it('accepts one of the four known entry strategies', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: 'multiThread',
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.chosenEntryStrategy).toBe('multiThread')
  })

  it('rejects an unknown strategy value — jamais une valeur devinée', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'succeeded',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: 'sideways',
        auditMoveDecisions: {},
        sourceHealth: null,
        corrections: {},
      }),
    ).toThrow()
  })

  it('rejects a response missing chosenEntryStrategy — ADDED, jamais optionnel', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'not_generated',
        failureReason: null,
        validatedAt: null,
        withheld: null,
      }),
    ).toThrow()
  })
})

// #2074.16 — la décision humaine (valider/modifier/écarter) sur un mouvement
// d'audit proposé (`AuditMove`, commercial-audit-moves.ts, verrouillé ce
// soir — ce fichier ne l'importe pas, `ruleId` reste une chaîne libre).
// Même discipline que `chosenEntryStrategy` : ADDED, jamais optionnel, une
// correction humaine gagne toujours et n'est jamais réécrite par une
// régénération du profil (colonne séparée de `profile_context`).
describe('profileContextResponseSchema — auditMoveDecisions (#2074.16)', () => {
  it('accepts an empty record — aucune décision', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.auditMoveDecisions).toEqual({})
  })

  it('accepts a decision keyed by ruleId, with one of the three human statuses', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: { no_contact_reached: { status: 'valide', decidedAt: '2026-09-22T20:00:00.000Z' } },
      sourceHealth: null,
      corrections: {},
    })
    expect(result.auditMoveDecisions.no_contact_reached).toEqual({
      status: 'valide',
      decidedAt: '2026-09-22T20:00:00.000Z',
    })
  })

  it('rejects an unknown decision status — jamais une valeur devinée', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'succeeded',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: null,
        auditMoveDecisions: { no_contact_reached: { status: 'propose', decidedAt: '2026-09-22T20:00:00.000Z' } },
        corrections: {},
      }),
    ).toThrow()
  })

  it('rejects a response missing auditMoveDecisions — ADDED, jamais optionnel', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'not_generated',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: null,
      }),
    ).toThrow()
  })
})

describe('recordAuditMoveDecisionSchema (#2074.16)', () => {
  it('accepts a ruleId and one of the three human statuses', () => {
    const result = recordAuditMoveDecisionSchema.parse({ ruleId: 'no_contact_reached', status: 'modifie' })
    expect(result).toEqual({ ruleId: 'no_contact_reached', status: 'modifie' })
  })

  it('#2074.16 — carries the move shown (subject/reason/expectedResult), never an empty subject', () => {
    const move = {
      ruleId: 'offerWithoutProof',
      status: 'valide',
      subject: 'Publier une référence',
      reason: 'Aucune preuve',
    }
    expect(recordAuditMoveDecisionSchema.parse(move)).toEqual(move)
    expect(() => recordAuditMoveDecisionSchema.parse({ ...move, subject: '  ' })).toThrow()
  })

  it('rejects "propose" — jamais un geste humain, c’est le statut dérivé par défaut', () => {
    expect(() => recordAuditMoveDecisionSchema.parse({ ruleId: 'no_contact_reached', status: 'propose' })).toThrow()
  })
})

// #2062.1 / #2069.1 — ce qui est RETENU à la lecture se nomme, avec sa date.
// Même discipline que `validatedAt` : le champ est ADDED, jamais optionnel.
// C'est cette discipline qui a fait échouer les deux cas ci-dessus à
// l'intégration — les deux lots sont partis de la même règle sans se voir.
describe('profileContextResponseSchema — withheld (#2062.1 / #2069.1)', () => {
  it('accepts a null withheld — rien n’a été retenu, et ce fait se DIT', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.withheld).toBeNull()
  })

  it('names the withheld fields AND the date of the snapshot they come from', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: { fields: ['welcomeSummary.scoringPersonalization'], storedAt: '2026-09-01T08:00:00.000Z' },
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.withheld?.fields).toEqual(['welcomeSummary.scoringPersonalization'])
    expect(result.withheld?.storedAt).toBe('2026-09-01T08:00:00.000Z')
  })

  it('accepts an unreadable storedAt as null — jamais une date devinée', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: { fields: ['welcomeSummary.firstAnalysisSuggestions'], storedAt: null },
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.withheld?.storedAt).toBeNull()
  })

  it('rejects a response missing withheld — ADDED, jamais optionnel : un appelant ne doit pas confondre « rien retenu » et « pas encore lu »', () => {
    expect(() =>
      profileContextResponseSchema.parse({ profile_context: null, status: 'not_generated', validatedAt: null }),
    ).toThrow()
  })
})

describe('profileContextSchema', () => {
  it('accepts a fully-populated valid profile with camelCase keys + values', () => {
    const result = profileContextSchema.parse(VALID_PROFILE_CAMEL)
    expect(result.esnArchetype).toBe('boutiqueExpert')
    expect(result.sellingPosture).toBe('expertiseRare')
    expect(result.analysisParameters?.contactsTarget).toBe(30)
    expect(result.idealAccountProfile?.sectorsPriority).toEqual(['Banque'])
  })

  it('migrates legacy snake_case enum values inside a full profile', () => {
    const result = profileContextSchema.parse({
      ...VALID_PROFILE_CAMEL,
      esnArchetype: 'boutique_expert',
      sellingPosture: 'conseil_strategique',
    })
    expect(result.esnArchetype).toBe('boutiqueExpert')
    expect(result.sellingPosture).toBe('strategicConsulting')
  })

  it('rejects an unknown archetype', () => {
    expect(() => profileContextSchema.parse({ ...VALID_PROFILE_CAMEL, esnArchetype: 'unicornHunter' })).toThrow()
  })

  it('rejects out-of-range contactsTarget', () => {
    expect(() =>
      profileContextSchema.parse({
        ...VALID_PROFILE_CAMEL,
        analysisParameters: {
          ...VALID_PROFILE_CAMEL.analysisParameters,
          contactsTarget: 5, // below the [10, 120] floor
        },
      }),
    ).toThrow()

    expect(() =>
      profileContextSchema.parse({
        ...VALID_PROFILE_CAMEL,
        analysisParameters: {
          ...VALID_PROFILE_CAMEL.analysisParameters,
          contactsTarget: 500, // above the ceiling
        },
      }),
    ).toThrow()
  })

  it('requires the two top-level enums (esnArchetype + sellingPosture)', () => {
    // Destructure the required field out — `partial` is typed as the rest,
    // no `as Record<string, unknown>` cast needed.
    const { esnArchetype: _omitted, ...partial } = VALID_PROFILE_CAMEL
    expect(() => profileContextSchema.parse(partial)).toThrow()
  })

  it('still parses (via passthrough) legacy snake_case payloads from Supabase', () => {
    // The Python prompt + Pydantic still dump snake_case keys. `.passthrough()`
    // lets these payloads parse so the contract migration can land without a
    // Supabase data migration. Use `toHaveProperty` so we assert on the
    // runtime shape without casting away from `ProfileContext`.
    const parsed = profileContextSchema.parse({
      esnArchetype: 'boutiqueExpert', // required typed key
      sellingPosture: 'expertiseRare',
      ...VALID_PROFILE_LEGACY_SNAKE, // legacy nested blocks ride along untyped
    })
    expect(parsed).toHaveProperty('analysis_parameters', VALID_PROFILE_LEGACY_SNAKE.analysis_parameters)
    expect(parsed).toHaveProperty('ideal_account_profile', VALID_PROFILE_LEGACY_SNAKE.ideal_account_profile)
    // The typed accessor stays undefined when only snake_case was provided.
    expect(parsed.analysisParameters).toBeUndefined()
    expect(parsed.idealAccountProfile).toBeUndefined()
  })

  it('exposes a revision summary (metadata only) and a full revision (with context)', () => {
    const summary = profileContextRevisionSummarySchema.parse({
      version: 2,
      schema_version: 1,
      created_at: '2026-06-10T10:00:00.000Z',
      was_last_validated: false,
    })
    expect(summary.version).toBe(2)

    const full = profileContextRevisionSchema.parse({
      version: 2,
      schema_version: 1,
      created_at: '2026-06-10T10:00:00.000Z',
      was_last_validated: true,
      profile_context: VALID_PROFILE_CAMEL,
    })
    expect(full.profile_context.esnArchetype).toBe('boutiqueExpert')
  })

  it('rejects a non-positive revision version', () => {
    expect(() =>
      profileContextRevisionSummarySchema.parse({ version: 0, schema_version: 1, created_at: 'x' }),
    ).toThrow()
  })

  it('composes with agentEnvelopeSchema', () => {
    const envelopeSchema = agentEnvelopeSchema(profileContextSchema)
    const result = envelopeSchema.parse({
      status: 'success',
      data: VALID_PROFILE_CAMEL,
      error: null,
      meta: {
        agent_name: 'profiler',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
        prompt_name: 'bellum_profiler',
        model: 'claude-opus-4-5',
      },
    })
    expect(result.data?.esnArchetype).toBe('boutiqueExpert')
  })
})

describe('welcomeSummarySchema', () => {
  const BASE_SUMMARY = {
    profileRecap: 'Vous êtes une ESN.',
    searchesPersonalization: 'Les recherches cibleront en priorité "data".',
    contactsPersonalization: 'Les contacts identifiés seront "DSI".',
    messagesPersonalization: 'Les messages seront rédigés "expert direct".',
    scoringPersonalization: 'Le scoring évaluera la maturité data.',
  }

  it('accepts an EMPTY firstAnalysisSuggestions list (#2069 — no name to reuse, no name invented)', () => {
    // apps/ia/app/models/profile_context.py:441 sets `default_factory=list` and
    // `max_length=4` on `first_analysis_suggestions` — no `min_length`. A
    // `.min(3)` on this side would make the TypeScript contract lie about a
    // floor the prompt no longer guarantees.
    const result = welcomeSummarySchema.parse({ ...BASE_SUMMARY, firstAnalysisSuggestions: [] })
    expect(result.firstAnalysisSuggestions).toEqual([])
  })

  it('still rejects more than 4 suggestions', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      companyName: `Entreprise ${i}`,
      sector: 'Banque',
      reason: 'Match sectoriel',
    }))
    expect(() => welcomeSummarySchema.parse({ ...BASE_SUMMARY, firstAnalysisSuggestions: five })).toThrow()
  })
})

/**
 * #2088.34 — la tension que LAURA elle-même repère, distincte des huit
 * détecteurs déterministes (`buildQuestionnaireContradictions`). Doctrine
 * tranchée le 18/09/2026 : une hypothèse du modèle peut sortir avec son
 * `reasoning`, jamais comme un fait établi — donc `statement` (la phrase, non
 * accusatoire) ET `reasoning` (consultable) sont tous deux requis quand le
 * bloc est présent ; absent → `null`, jamais deviné.
 */
describe('profileContradictionSchema (#2088.34)', () => {
  it('accepts a statement + reasoning pair', () => {
    const result = profileContradictionSchema.parse({
      statement: 'Tu as sélectionné dix secteurs prioritaires alors que ton équipe compte deux personnes.',
      reasoning: 'Ça vient de `priority_sectors` (10 valeurs) et `sales_team_size` (2-3 personnes).',
    })
    expect(result.statement).toContain('dix secteurs')
  })

  it('rejects a statement without its reasoning — the hypothesis must stay consultable', () => {
    expect(() => profileContradictionSchema.parse({ statement: 'Tu as dit X et Y.' })).toThrow()
  })

  it('profileContextSchema accepts a context with NO contradiction (null, never guessed)', () => {
    const result = profileContextSchema.parse({
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      contradiction: null,
    })
    expect(result.contradiction ?? null).toBeNull()
  })

  it('profileContextSchema carries a contradiction when the profiler emits one', () => {
    const result = profileContextSchema.parse({
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      contradiction: {
        statement: 'Tu as dit X et Y.',
        reasoning: 'Les deux réponses citées.',
      },
    })
    expect(result.contradiction?.statement).toBe('Tu as dit X et Y.')
  })
})

/**
 * #2118.16 — « la stratégie validée à l'audit » a DEUX sources depuis #2073.8 :
 * la CHOISIE (`profiles.chosen_entry_strategy`) et la CALCULÉE par le profileur
 * (`idealAccountProfile.entryStrategy`). La règle — la choisie si elle existe,
 * sinon la calculée — vit ICI, une seule fois (GA-26) : l'audit et le moteur la
 * lisent tous les deux.
 */
describe('effectiveEntryStrategy — la choisie gagne, la calculée est le repli', () => {
  it('la stratégie CHOISIE gagne sur la calculée', () => {
    expect(effectiveEntryStrategy('referral', 'topDown')).toBe('referral')
  })

  it('sans choix, la calculée fait foi', () => {
    expect(effectiveEntryStrategy(null, 'bottomUp')).toBe('bottomUp')
    expect(effectiveEntryStrategy(undefined, 'multiThread')).toBe('multiThread')
  })

  it('SAIT DIRE NON — une valeur hors catalogue ne passe pas, jamais une stratégie devinée', () => {
    expect(effectiveEntryStrategy('sideways', 'topDown')).toBe('topDown')
    expect(effectiveEntryStrategy(null, 'n/a')).toBeNull()
    expect(effectiveEntryStrategy(null, null)).toBeNull()
  })
})

// #2067.2 — la cible partenaires suit l'archétype. C'est la TROISIÈME cible de
// `kpiTargets`, de la même nature que ses deux sœurs (un nombre visé par mois,
// écrit par le moteur) — à une différence près, qui est tout le point : les
// comptes et les rendez-vous existent TOUJOURS, les partenaires non. Une ESN
// sans porte partenaire n'a pas de cible partenaires : elle est ABSENTE, et
// l'absence se dit `null`, jamais `0` (doctrine GA-18 / GA-19).
describe('kpiTargetsSchema — partnersPerMonth (#2067.2)', () => {
  const BASE = { accountsPerMonth: 15, rdvPerMonth: 4, conversionRateTarget: '20%' }

  it('accepte une cible partenaires chiffrée', () => {
    expect(kpiTargetsSchema.parse({ ...BASE, partnersPerMonth: 3 }).partnersPerMonth).toBe(3)
  })

  it('accepte une ESN sans porte partenaire : champ absent ou null', () => {
    expect(kpiTargetsSchema.parse(BASE).partnersPerMonth).toBeUndefined()
    expect(kpiTargetsSchema.parse({ ...BASE, partnersPerMonth: null }).partnersPerMonth).toBeNull()
  })

  it('REFUSE 0 : une cible absente ne se dit jamais « 0 » (GA-18 / GA-19)', () => {
    expect(kpiTargetsSchema.safeParse({ ...BASE, partnersPerMonth: 0 }).success).toBe(false)
  })

  it('REFUSE un nombre négatif ou fractionnaire', () => {
    expect(kpiTargetsSchema.safeParse({ ...BASE, partnersPerMonth: -2 }).success).toBe(false)
    expect(kpiTargetsSchema.safeParse({ ...BASE, partnersPerMonth: 1.5 }).success).toBe(false)
  })

  it('reste additif : un profil DÉJÀ en base, sans le champ, se lit toujours', () => {
    expect(profileContextSchema.safeParse(VALID_PROFILE_CAMEL).success).toBe(true)
  })
})

// #2012.12 (épopée #2776) — couverture réduite par source facultative du
// Profileur (`AgentMeta.source_health`, jusque-là jetée à la frontière API).
// Même discipline que `chosenEntryStrategy`/`auditMoveDecisions` : ADDED,
// jamais optionnel — un appelant ne doit pas confondre « rien n'est en
// panne » et « pas encore lu ».
describe('profileContextResponseSchema — sourceHealth (#2012.12)', () => {
  it('accepts a null sourceHealth — aucun signal encore posé', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.sourceHealth).toBeNull()
  })

  it('accepts a record of known source-health statuses', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: { market_memory: 'down' },
      corrections: {},
    })
    expect(result.sourceHealth).toEqual({ market_memory: 'down' })
  })

  it('rejects an unknown status value — jamais une valeur devinée', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'succeeded',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: null,
        auditMoveDecisions: {},
        sourceHealth: { market_memory: 'excellent' },
        corrections: {},
      }),
    ).toThrow()
  })

  it('rejects a response missing sourceHealth — ADDED, jamais optionnel', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'not_generated',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: null,
        auditMoveDecisions: {},
        corrections: {},
      }),
    ).toThrow()
  })
})

// #2908 (#2010.4) — l'état « corrigé » éditable, champ par champ. Colonne
// séparée de `profile_context` (`profiles.profile_context_corrections`),
// jamais réécrite par une régénération : même discipline que
// `auditMoveDecisions` (#2074.16) juste au-dessus.
describe('profileContextResponseSchema — corrections (#2908 / #2010.4)', () => {
  it('accepts an empty record — aucune correction', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {},
    })
    expect(result.corrections).toEqual({})
  })

  it('accepts a correction keyed by field path, with its value and date', () => {
    const result = profileContextResponseSchema.parse({
      profile_context: null,
      status: 'succeeded',
      failureReason: null,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      sourceHealth: null,
      corrections: {
        'welcomeSummary.profileRecap': { value: 'Texte corrigé', correctedAt: '2026-09-26T20:00:00.000Z' },
      },
    })
    expect(result.corrections['welcomeSummary.profileRecap']).toEqual({
      value: 'Texte corrigé',
      correctedAt: '2026-09-26T20:00:00.000Z',
    })
  })

  it('rejects a response missing corrections — ADDED, jamais optionnel', () => {
    expect(() =>
      profileContextResponseSchema.parse({
        profile_context: null,
        status: 'not_generated',
        failureReason: null,
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: null,
        auditMoveDecisions: {},
        sourceHealth: null,
      }),
    ).toThrow()
  })

  it('rejects an empty value — jamais une correction vide', () => {
    expect(
      profileContextCorrectionsSchema.safeParse({ 'welcomeSummary.profileRecap': { value: '', correctedAt: 'x' } })
        .success,
    ).toBe(false)
  })
})

describe('correctProfileContextFieldInputSchema (#2908 / #2010.4)', () => {
  it('accepts a known correctable field and a non-empty value', () => {
    const result = correctProfileContextFieldInputSchema.parse({
      field: 'welcomeSummary.profileRecap',
      value: 'Texte corrigé',
    })
    expect(result).toEqual({ field: 'welcomeSummary.profileRecap', value: 'Texte corrigé' })
  })

  it('REFUSE un champ hors de la liste fermée — jamais un chemin JSON deviné', () => {
    expect(
      correctProfileContextFieldInputSchema.safeParse({ field: 'messagingStyle.valuePropositionAngle', value: 'x' })
        .success,
    ).toBe(false)
    expect(correctProfileContextFieldInputSchema.safeParse({ field: 'anything.goes', value: 'x' }).success).toBe(false)
  })

  it('REFUSE une valeur vide — jamais une correction qui efface sans rien dire', () => {
    expect(
      correctProfileContextFieldInputSchema.safeParse({ field: 'welcomeSummary.profileRecap', value: '' }).success,
    ).toBe(false)
  })
})

describe('applyProfileContextCorrections (#2908 / #2010.4)', () => {
  const WITH_SUMMARY = {
    ...VALID_PROFILE_CAMEL,
    welcomeSummary: {
      profileRecap: 'Vous êtes une ESN.',
      searchesPersonalization: 'Les recherches cibleront en priorité "data".',
      contactsPersonalization: 'Les contacts identifiés seront "DSI".',
      messagesPersonalization: 'Les messages seront rédigés "expert direct".',
      scoringPersonalization: 'Le scoring évaluera la maturité data.',
      firstAnalysisSuggestions: [],
    },
  }

  it('overlays a correction onto the generated content', () => {
    const result = applyProfileContextCorrections(WITH_SUMMARY, {
      'welcomeSummary.profileRecap': { value: 'Texte corrigé', correctedAt: '2026-09-26T20:00:00.000Z' },
    })
    expect(result?.welcomeSummary?.profileRecap).toBe('Texte corrigé')
  })

  it('leaves the content untouched when there is no correction for it', () => {
    const result = applyProfileContextCorrections(WITH_SUMMARY, {})
    expect(result).toEqual(WITH_SUMMARY)
  })

  it('does nothing when the context has no welcomeSummary to correct — jamais un bloc inventé', () => {
    const result = applyProfileContextCorrections(VALID_PROFILE_CAMEL, {
      'welcomeSummary.profileRecap': { value: 'Texte corrigé', correctedAt: '2026-09-26T20:00:00.000Z' },
    })
    expect(result).toEqual(VALID_PROFILE_CAMEL)
  })

  it('is a no-op on a null context — jamais une donnée inventée', () => {
    expect(
      applyProfileContextCorrections(null, {
        'welcomeSummary.profileRecap': { value: 'x', correctedAt: '2026-09-26T20:00:00.000Z' },
      }),
    ).toBeNull()
  })
})

describe('regenerateProfileContextSectionInputSchema (#2908 / #2010.16 / #2011.10)', () => {
  it('accepts each of the two known regenerable sections', () => {
    expect(regenerateProfileContextSectionInputSchema.parse({ section: 'welcomeSummary' })).toEqual({
      section: 'welcomeSummary',
    })
    expect(regenerateProfileContextSectionInputSchema.parse({ section: 'coachingInsights' })).toEqual({
      section: 'coachingInsights',
    })
  })

  it('REFUSE une section hors de la liste fermée — jamais un chemin JSON deviné', () => {
    expect(regenerateProfileContextSectionInputSchema.safeParse({ section: 'messagingStyle' }).success).toBe(false)
    expect(regenerateProfileContextSectionInputSchema.safeParse({ section: 'anything' }).success).toBe(false)
  })
})

describe('mergeRegeneratedProfileContextSection (#2908 / #2010.16 / #2011.10)', () => {
  const REGENERATED = {
    ...VALID_PROFILE_CAMEL,
    coachingInsights: {
      ...VALID_PROFILE_CAMEL.coachingInsights,
      mainWeakness: 'nouvelle fragilité',
      keyAdvice: 'nouveau conseil',
    },
    messagingStyle: {
      ...VALID_PROFILE_CAMEL.messagingStyle,
      valuePropositionAngle: 'jamais retenu — pas la section demandée',
    },
  }

  it('replaces only the requested section, byte-identical elsewhere', () => {
    const result = mergeRegeneratedProfileContextSection(VALID_PROFILE_CAMEL, 'coachingInsights', REGENERATED)
    expect(result.coachingInsights).toEqual(REGENERATED.coachingInsights)
    expect(result.messagingStyle).toEqual(VALID_PROFILE_CAMEL.messagingStyle)
    expect(result.bellumPhrases).toEqual(VALID_PROFILE_CAMEL.bellumPhrases)
  })

  it('falls back to the fresh generation in full when nothing was stored yet', () => {
    const result = mergeRegeneratedProfileContextSection(null, 'welcomeSummary', REGENERATED)
    expect(result).toEqual(REGENERATED)
  })
})
