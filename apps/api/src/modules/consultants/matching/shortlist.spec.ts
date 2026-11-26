import type { MatchNeed, MatchResult, MatchRun } from '@bellum/contracts'
import { REDACTED_FINANCE_FIELDS, SHORTLIST_MAX, normaliseMatchWeights, shortlistEntrySchema } from '@bellum/contracts'
import { ShortlistService, buildEntry } from './shortlist.service'

const RESULT: MatchResult = {
  consultantId: '22222222-2222-4222-8222-222222222222',
  axes: [{ axis: 'availability', score: 100, weight: 12, detail: 'disponible le 2026-09-15', evidence: [] }],
  correspondenceScore: 84,
  pushableScore: 71,
  bucket: 'recommended',
  exclusions: [],
  skills: [
    {
      term: 'spark',
      label: 'Spark',
      required: true,
      status: 'matched',
      coverage: 1,
      level: 'expert',
      source: 'mission',
      proof: 'mission Orange, 18 mois',
      levelUnknown: false,
    },
    {
      term: 'python',
      label: 'Python',
      required: true,
      status: 'matched',
      coverage: 0.7,
      level: 'confirme',
      source: 'cv',
      proof: 'CV',
      levelUnknown: false,
    },
    {
      term: 'databricks',
      label: 'Databricks',
      required: false,
      status: 'missing',
      coverage: 0,
      level: null,
      source: null,
      proof: null,
      levelUnknown: false,
    },
  ],
  gaps: ['databricks (souhaitée) — non prouvé'],
  adjacency: [],
  questionsToValidate: [],
  flags: [],
}

describe('la fiche courte d’une shortlist (§9.1)', () => {
  const identity = { fullName: 'Sophie M.', title: 'Data Engineer' }

  it('ne retient que les compétences qui ont MATCHÉ', () => {
    const entry = buildEntry(RESULT, 1, identity, { dailyRateCents: 62000 })
    expect(entry.skills.map(skill => skill.label)).toEqual(['Spark', 'Python'])
  })

  it('porte la phrase de disponibilité telle que l’axe l’a écrite', () => {
    expect(buildEntry(RESULT, 1, identity, { dailyRateCents: null }).availability).toBe('disponible le 2026-09-15')
  })

  it('borne les preuves à trois et n’en invente aucune', () => {
    const entry = buildEntry(RESULT, 1, identity, { dailyRateCents: null })
    expect(entry.proofs.length).toBeLessThanOrEqual(3)
    // Deux compétences prouvées : la liste est plus courte, elle n'est pas
    // complétée par une phrase de remplissage.
    expect(entry.proofs).toEqual(['mission Orange, 18 mois', 'CV'])
  })

  it('rend le TJM à null quand il n’est pas renseigné — jamais zéro', () => {
    expect(buildEntry(RESULT, 1, identity, { dailyRateCents: null }).dailyRateCents).toBeNull()
  })

  it('garde `dailyRateCents` HORS de la rédaction financière unique (D45)', () => {
    // Mesure du 28/08/2026 : ce que ce service met à `null` sans `finance:read`
    // n'est ni un coût ni une marge — c'est le TJM du profil, un prix de VENTE,
    // que le board rend inconditionnellement. Ce n'est donc PAS la même chose
    // que `margin` / `marginPercent` / `loadedDailyCostCents` / `terms`, et le
    // verser dans `redactFinance` masquerait partout un chiffre que le produit
    // montre exprès. La clé n'est pas dans la liste rédigée, et elle doit y
    // rester absente.
    expect(REDACTED_FINANCE_FIELDS).not.toContain('dailyRateCents')
    // Et la clé est déjà PRÉSENTE et vide — jamais retirée : sur ce point-là,
    // ce service était conforme à D45 avant D45.
    const entry = buildEntry(RESULT, 1, identity, { dailyRateCents: null })
    expect('dailyRateCents' in entry).toBe(true)
  })

  it('reprend les manques, qui alimenteront le dossier de compétences', () => {
    expect(buildEntry(RESULT, 1, identity, { dailyRateCents: null }).gaps).toEqual([
      'databricks (souhaitée) — non prouvé',
    ])
  })

  it('recopie l’identité au lieu de la référencer', () => {
    // Le vivier évolue ; une shortlist doit dire ce qui a été proposé, pas ce
    // qui est vrai aujourd'hui.
    const entry = buildEntry(RESULT, 3, identity, { dailyRateCents: 62000 })
    expect(entry.fullName).toBe('Sophie M.')
    expect(entry.rank).toBe(3)
  })

  it('survit à une identité inconnue sans inventer un nom', () => {
    expect(buildEntry(RESULT, 1, undefined, { dailyRateCents: null }).fullName).toBe('')
  })
})

describe('le plafond', () => {
  it('est de cinq — au-delà, ce n’est plus une shortlist', () => {
    expect(SHORTLIST_MAX).toBe(5)
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  D48 · 26/08/2026 — un snapshot écrit TOUJOURS tout                        */
/*                                                                            */
/*  Le snapshot était figé avec `dailyRateCents: canReadFinance ? … : null` :  */
/*  un droit de LECTURE décidait de ce qui s'ÉCRIT, et la valeur était perdue  */
/*  DÉFINITIVEMENT — un lecteur qui a le droit ne la récupérait jamais.        */
/*  Ce qui se fige en base ne dépend pas de qui déclenche ; la rédaction se    */
/*  fait à la lecture, où elle a un sens (`redactFinance` s'applique à la      */
/*  réponse, jamais à l'insertion).                                           */
/* ────────────────────────────────────────────────────────────────────────── */

const NEED_ID = '33333333-3333-4333-8333-333333333333'
const RUN_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const WORKSPACE_ID = '66666666-6666-4666-8666-666666666666'
const RATE_CENTS = 62_000

const NEED: MatchNeed = {
  needId: NEED_ID,
  role: 'Data Engineer',
  accountName: 'ACME',
  accountSector: null,
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: 60_000,
  contractKind: null,
}

const RUN: MatchRun = {
  runId: RUN_ID,
  need: NEED,
  weights: normaliseMatchWeights({}),
  threshold: 60,
  evaluatedCount: 1,
  prefilteredCount: 0,
  truncated: false,
  recommended: [RESULT],
  borderline: [],
  excluded: [],
  notEvaluable: [],
  exclusionCounts: [],
  identities: [],
  nextBestMove: null,
  feedbackLearnings: [],
  createdAt: '2026-08-26T09:00:00.000Z',
}

function makeShortlistService() {
  const created: Record<string, unknown>[] = []
  const shortlists = {
    create: jest.fn((entity: Record<string, unknown>) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => ({
      ...entity,
      id: '77777777-7777-4777-8777-777777777777',
      created_at: new Date('2026-08-26T09:00:00.000Z'),
    })),
  }
  const entries = {
    create: jest.fn((entity: Record<string, unknown>) => {
      created.push(entity)
      return entity
    }),
    save: jest.fn(async (rows: unknown) => rows),
  }
  const commercialTransitions = { record: jest.fn(async () => undefined) }
  const service = new ShortlistService(shortlists as never, entries as never, commercialTransitions as never)
  return { service, shortlists, entries, created, commercialTransitions }
}

describe('ShortlistService.create — ce qui se FIGE en base', () => {
  it('écrit le TJM dans le snapshot, quel que soit le droit de qui déclenche', async () => {
    const { service, created } = makeShortlistService()
    const outcome = await service.create({
      run: RUN,
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, RATE_CENTS]]),
    })

    expect('shortlist' in outcome).toBe(true)
    // Ce qui part vers la BASE — pas ce qui revient dans la réponse : c'est
    // l'écriture qui perdait la donnée.
    expect(created).toHaveLength(1)
    const snapshot = shortlistEntrySchema.parse(created[0]?.['snapshot'])
    expect(snapshot.dailyRateCents).toBe(RATE_CENTS)
  })

  it('écrit `null` quand le TJM n’est pas RENSEIGNÉ — l’absence reste une absence', async () => {
    // La seule raison légitime d'un `null` : le talent n'a pas de TJM. Jamais
    // « celui qui a cliqué n'avait pas le droit de le lire ».
    const { service, created } = makeShortlistService()
    await service.create({
      run: RUN,
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, null]]),
    })
    const snapshot = shortlistEntrySchema.parse(created[0]?.['snapshot'])
    expect(snapshot.dailyRateCents).toBeNull()
  })

  it('n’accepte plus de booléen de droit : l’écriture ne se règle pas par une permission', () => {
    // La garde qui sait dire NON. Elle lit la SIGNATURE : tant que le service
    // accepte un `canReadFinance`, quelqu'un le rebranchera « juste pour
    // masquer », et la perte de donnée reviendra.
    const source = ShortlistService.prototype.create.toString()
    expect(source.length).toBeGreaterThan(100)
    expect(source).not.toContain('canReadFinance')
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  #2320.1 (LOT r3, épopée #2967) — LA SHORTLIST ENTRE DANS LE JOURNAL        */
/*  besoin→shortlist→positionnement→mission (#2320.23). Elle était le seul    */
/*  des quatre sujets déclarés sans aucun appelant.                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe('ShortlistService.create — journalise sa création (#2320.1)', () => {
  it('écrit une transition shortlist, de null à `draft`, sur le journal commercial', async () => {
    const { service, commercialTransitions } = makeShortlistService()
    const outcome = await service.create({
      run: RUN,
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, RATE_CENTS]]),
    })
    expect('shortlist' in outcome).toBe(true)
    const shortlistId = 'shortlist' in outcome ? outcome.shortlist.id : null
    expect(commercialTransitions.record).toHaveBeenCalledTimes(1)
    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        subjectType: 'shortlist',
        subjectId: shortlistId,
        fromState: null,
        toState: 'draft',
        actorId: USER_ID,
      }),
    )
  })

  it('ne journalise rien quand la création est refusée (trop de profils, ou un profil hors run)', async () => {
    const { service, commercialTransitions } = makeShortlistService()
    const tooMany = Array.from({ length: SHORTLIST_MAX + 1 }, (_, index) => `id-${index}`)
    await service.create({
      run: RUN,
      consultantIds: tooMany,
      identities: new Map(),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map(),
    })
    expect(commercialTransitions.record).not.toHaveBeenCalled()
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  #2320.17 (épopée #2967) — LA SHORTLIST FIGE LES INCONNUES QU'ELLE A VUES  */
/*                                                                            */
/*  « Match → Shortlist » ne doit pas effacer les profils NON ÉVALUABLES du   */
/*  run : les figer sur la shortlist est ce qui rend une revue possible après */
/*  coup — sans ça, rien ne prouve que le créateur les a vus avant de choisir.*/
/* ────────────────────────────────────────────────────────────────────────── */

describe('ShortlistService.create — les inconnues du run se figent avec la shortlist (#2320.17)', () => {
  const NOT_EVALUABLE: MatchResult = {
    ...RESULT,
    consultantId: '88888888-8888-4888-8888-888888888888',
    bucket: 'not_evaluable',
  }

  it('recopie les identifiants NON ÉVALUABLES du run au moment de la création', async () => {
    const { service, shortlists } = makeShortlistService()
    await service.create({
      run: { ...RUN, notEvaluable: [NOT_EVALUABLE] },
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, RATE_CENTS]]),
    })
    expect(shortlists.create).toHaveBeenCalledWith(
      expect.objectContaining({ reviewed_unknown_ids: [NOT_EVALUABLE.consultantId] }),
    )
  })

  it('est un tableau VIDE — jamais absent — quand le run n’avait aucune inconnue', async () => {
    const { service, shortlists } = makeShortlistService()
    await service.create({
      run: RUN,
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, RATE_CENTS]]),
    })
    expect(shortlists.create).toHaveBeenCalledWith(expect.objectContaining({ reviewed_unknown_ids: [] }))
  })

  it('rend `reviewedUnknownIds` dans la réponse — la revue doit être LISIBLE, pas seulement stockée', async () => {
    const { service } = makeShortlistService()
    const outcome = await service.create({
      run: { ...RUN, notEvaluable: [NOT_EVALUABLE] },
      consultantIds: [RESULT.consultantId],
      identities: new Map([[RESULT.consultantId, { fullName: 'Sophie M.', title: 'Data Engineer' }]]),
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      rates: new Map([[RESULT.consultantId, RATE_CENTS]]),
    })
    expect('shortlist' in outcome && outcome.shortlist.reviewedUnknownIds).toEqual([NOT_EVALUABLE.consultantId])
  })
})
