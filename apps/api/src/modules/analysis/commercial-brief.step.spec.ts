import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Logger } from '@nestjs/common'
import { HttpError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import type { CommercialBrief } from '@bellum/contracts'
import { CommercialBriefStep } from './commercial-brief.step'
import { toCommercialBriefContext, type CommercialBriefContextSource } from './commercial-brief-context-source'

/**
 * Chantier « briefs comptes » (01/10/2026) — l'API est le SEUL endroit qui
 * décide d'écrire `raw_analysis.commercial_brief`. Ce fichier prouve les deux
 * branches : 0 violation ⇒ écrit ; ≥ 1 violation ⇒ RIEN d'écrit, les codes
 * journalisés, jamais le contenu (le dossier reste sans onglet : on n'affiche
 * pas ce qu'on n'a pas).
 */

const ACCOUNT = 'acc-1'
const WORKSPACE = 'ws-1'

function validBrief(over: Partial<CommercialBrief> = {}): CommercialBrief {
  return {
    account_name: 'BPCE',
    generated_at: '2026-10-01T08:00:00.000Z',
    scope: 'france',
    headquarters: { label: 'Tours Duo', city: 'Paris', address: '7 promenade Germaine Sablon, 75013 Paris' },
    kpis: [{ label: 'SIÈGE', value: 'Paris 13e', caption: 'Tours Duo' }],
    what_i_know: [
      {
        rubric: 'IDENTITÉ',
        known: 'Deuxième groupe bancaire français.',
        meaning: 'Un compte à plusieurs portes : ne jamais l’attaquer comme un seul client.',
      },
    ],
    charts: [],
    entities: [],
    sites: [{ name: 'Tours Duo', city: 'Paris 13e', country: 'FR', kind: 'headquarters' }],
    prices: [{ label: 'Développeur Java senior', amount_eur_per_day: 620, channel: 'direct' }],
    esn: [{ name: 'Sopra Steria', evidence_level: 'observed', proof: 'Offres d’emploi citant le client.' }],
    people: [],
    sections: [],
    guardrails: [{ point: 'Siège', detail: 'Tours Duo, Paris 13e — jamais Strasbourg.' }],
    ...over,
  }
}

const RAW_ANALYSIS = {
  description: 'Groupe bancaire coopératif',
  sites_france: [{ city: 'Paris' }],
  // Notre plan et nos scores — ne décrivent pas le compte, n'entrent pas.
  angles: [{ title: 'angle secret' }],
  commercial_score: 82,
  judge: { verdict: 'ok' },
  plan: { actions: [] },
}

function setup(
  opts: {
    brief?: unknown
    iaError?: Error
    enabled?: string
    headquarters?: { value: string; source: string } | null
    raw?: Record<string, unknown>
    website?: string | null
    costUsd?: number | null
  } = {},
) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) =>
    sql.trim().startsWith('SELECT')
      ? [{ company_name: 'BPCE', website: opts.website ?? null, raw_analysis: opts.raw ?? RAW_ANALYSIS }]
      : [],
  )
  const dataSource = { query }
  const ia = {
    commercialBrief: opts.iaError
      ? jest.fn().mockRejectedValue(opts.iaError)
      : jest.fn().mockResolvedValue({
          brief: opts.brief ?? validBrief(),
          inputChars: 12_000,
          costUsd: opts.costUsd === undefined ? 0.11 : opts.costUsd,
        }),
  }
  const contextSource: CommercialBriefContextSource = {
    contextFor: jest.fn().mockResolvedValue({
      headquarters:
        opts.headquarters === undefined
          ? { value: '7 promenade Germaine Sablon, 75013 Paris', source: 'registry' }
          : opts.headquarters,
      internalFacts: { sector: 'Banque' },
    }),
  }
  const config = { get: jest.fn((key: string) => (key === 'COMMERCIAL_BRIEF_ENABLED' ? opts.enabled : undefined)) }
  const step = new CommercialBriefStep(ia as never, dataSource as never, config as never, contextSource)
  // Les écritures du BRIEF — le compteur d'échec `_api_metrics` est compté à part.
  const writes = () =>
    query.mock.calls.filter(([sql]) => /UPDATE\s+accounts/i.test(String(sql)) && !/_api_metrics/.test(String(sql)))
  const metricWrites = () => query.mock.calls.filter(([sql]) => /_api_metrics/.test(String(sql)))
  return { step, ia, query, writes, metricWrites, contextSource }
}

describe('toCommercialBriefContext — ce que le brief a le droit de lire de la façade', () => {
  const view = (over: Record<string, unknown> = {}) =>
    ({
      accountId: ACCOUNT,
      companyName: { state: 'known', value: 'BPCE', provenance: { source: 'registry', observedAt: null } },
      sector: { state: 'known', value: 'Banque', provenance: { source: 'dataforge', observedAt: null } },
      headquarters: {
        state: 'known',
        value: 'Paris 13e',
        provenance: { source: 'human_correction', observedAt: null },
      },
      marketMemory: { provenance: { source: 'market_memory', observedAt: null }, read: { status: 'unavailable' } },
      incumbentEsn: { state: 'unknown' },
      technologies: { state: 'unknown' },
      entryPaths: { state: 'unknown' },
      recommendations: [{ text: 'relancer le DSI', nature: 'inference' }],
      conflicts: [],
      dataforge: { provenance: null, status: { nextAction: 'Appeler', recommendedStrategy: 'Attaque frontale' } },
      ...over,
    }) as never

  it('garde le siège résolu AVEC son échelon (une correction humaine gagne toujours)', () => {
    expect(toCommercialBriefContext(view()).headquarters).toEqual({ value: 'Paris 13e', source: 'human_correction' })
  })

  it('ne transmet ni nos recommandations ni le statut de prospection — zéro donnée de notre propre activité', () => {
    const facts = JSON.stringify(toCommercialBriefContext(view()).internalFacts)
    expect(facts).not.toContain('relancer')
    expect(facts).not.toContain('Appeler')
    expect(facts).not.toContain('Attaque frontale')
    expect(toCommercialBriefContext(view()).internalFacts).toEqual({ sector: 'Banque' })
  })

  it('une mémoire marché illisible n’entre pas (on n’interprète pas un silence) ; siège inconnu ⇒ null', () => {
    const ctx = toCommercialBriefContext(view({ headquarters: { state: 'unknown' } }))
    expect(ctx.headquarters).toBeNull()
    expect(ctx.internalFacts).not.toHaveProperty('market_observations')
  })
})

describe('CommercialBriefStep — brief commercial de tout compte payant', () => {
  let warn: jest.SpyInstance
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('0 violation ⇒ écrit raw_analysis.commercial_brief, scopé au compte ET à l’espace', async () => {
    const { step, writes } = setup()
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(writes()).toHaveLength(1)
    const [sql, params] = writes()[0] as [string, unknown[]]
    expect(sql).toMatch(/jsonb_build_object\('commercial_brief'/)
    expect(sql).toMatch(/workspace_id = \$3/)
    expect(JSON.parse(params[0] as string).account_name).toBe('BPCE')
    expect(params.slice(1)).toEqual([ACCOUNT, WORKSPACE])
  })

  it('n’envoie au modèle que les FAITS du dossier — ni notre plan, ni nos scores, ni la télémétrie', async () => {
    const { step, ia } = setup()
    await step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    const input = ia.commercialBrief.mock.calls[0][0]
    expect(input.accountName).toBe('BPCE')
    expect(Object.keys(input.dossier).sort()).toEqual(['description', 'sites_france'])
    expect(input.internalFacts).toEqual({ sector: 'Banque' })
    expect(input.headquarters).toEqual({ value: '7 promenade Germaine Sablon, 75013 Paris', source: 'registry' })
  })

  it('siège CONTREDIT par un site ⇒ rien n’est écrit, le code est journalisé, jamais le contenu', async () => {
    const strasbourg = validBrief({
      sites: [{ name: 'Siège régional', city: 'Strasbourg', country: 'FR', kind: 'headquarters' }],
    })
    const { step, writes } = setup({ brief: strasbourg })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('rejected')
    expect(writes()).toHaveLength(0)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('HQ_CONTRADICTED')
    expect(logged).not.toContain('Strasbourg')
    expect(logged).not.toContain('Siège régional')
  })

  it('siège contredit par le SIÈGE RÉSOLU du compte (incident BPCE) ⇒ rejeté', async () => {
    const strasbourg = validBrief({ headquarters: { label: 'Siège', city: 'Strasbourg' }, sites: [] })
    const { step, writes } = setup({ brief: strasbourg })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('rejected')
    expect(writes()).toHaveLength(0)
    expect(JSON.stringify(warn.mock.calls)).toContain('HQ_CONTRADICTS_RECORD')
  })

  it('siège résolu inconnu ⇒ le contrôle du registre ne s’invente pas, le brief passe sur ses propres contrôles', async () => {
    const { step, writes } = setup({ headquarters: null })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(writes()).toHaveLength(1)
  })

  it('notre propre activité commerciale dans le brief ⇒ rejeté (OWN_PERFORMANCE)', async () => {
    const own = validBrief({ kpis: [{ label: 'TAUX DE RÉPONSE', value: '12 %' }] })
    const { step, writes } = setup({ brief: own })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('rejected')
    expect(writes()).toHaveLength(0)
    expect(JSON.stringify(warn.mock.calls)).toContain('OWN_PERFORMANCE')
  })

  it('hors contrat (clé inconnue) ⇒ rien n’est écrit', async () => {
    const { step, writes } = setup({ brief: { ...validBrief(), statut_relation: 'client' } })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('rejected')
    expect(writes()).toHaveLength(0)
    expect(JSON.stringify(warn.mock.calls)).toContain('OFF_CONTRACT')
  })

  it('COMMERCIAL_BRIEF_ENABLED=false ⇒ aucun appel modèle, aucune écriture', async () => {
    const { step, ia, writes } = setup({ enabled: 'false' })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('disabled')
    expect(ia.commercialBrief).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
  })

  it('sans espace de travail ⇒ ne lit rien (la façade exige un espace)', async () => {
    const { step, ia } = setup()
    await expect(step.produceCommercialBrief(ACCOUNT, null)).resolves.toBe('skipped')
    expect(ia.commercialBrief).not.toHaveBeenCalled()
  })

  // Point 46 (briefs comptes) — le coût de l'appel modèle du brief rejoint le
  // coût du RUN d'analyse (`analysis_runs.cost_eur`, même colonne que les autres phases).
  const runCostWrites = (query: jest.Mock) =>
    query.mock.calls.filter(([sql]) => /UPDATE\s+analysis_runs/i.test(String(sql)))

  it('le coût du brief s’AJOUTE au coût du dernier run du compte (cost_eur), jamais il ne l’écrase', async () => {
    const { step, query } = setup({ costUsd: 0.11 })
    await step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    const writes = runCostWrites(query)
    expect(writes).toHaveLength(1)
    const [sql, params] = writes[0] as [string, unknown[]]
    expect(sql).toMatch(/cost_eur\s*=\s*COALESCE\(cost_eur,\s*0\)\s*\+\s*\$1/)
    expect(sql).toMatch(/ORDER BY created_at DESC\s+LIMIT 1/)
    expect(params).toEqual([0.11, ACCOUNT])
  })

  it('un brief REJETÉ a quand même coûté un appel ⇒ son coût est compté', async () => {
    const { step, query } = setup({ brief: { ...validBrief(), statut_relation: 'client' } })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('rejected')
    expect(runCostWrites(query)).toHaveLength(1)
  })

  it('coût inconnu (null) ou nul ⇒ aucune écriture de coût inventée', async () => {
    const unknown = setup({ costUsd: null })
    await unknown.step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    expect(runCostWrites(unknown.query)).toHaveLength(0)
    const zero = setup({ costUsd: 0 })
    await zero.step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    expect(runCostWrites(zero.query)).toHaveLength(0)
  })

  it('une écriture de coût en échec ne fait pas perdre le brief', async () => {
    const { step, query, writes } = setup()
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/UPDATE\s+analysis_runs/i.test(sql)) throw new Error('db down')
      return base(sql, params)
    })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(writes()).toHaveLength(1)
  })

  // Point 45 — rattrapage : un brief existant reste INTACT sauf `force`.
  it('keepExisting : un brief déjà là ⇒ aucun appel modèle, aucune écriture, aucun coût', async () => {
    const { step, ia, writes, query } = setup({ raw: { ...RAW_ANALYSIS, commercial_brief: validBrief() } })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE, { keepExisting: true })).resolves.toBe('exists')
    expect(ia.commercialBrief).not.toHaveBeenCalled()
    expect(writes()).toHaveLength(0)
    expect(runCostWrites(query)).toHaveLength(0)
  })

  it('keepExisting sans brief ⇒ produit ; l’UPDATE refuse d’écraser un brief apparu entre-temps', async () => {
    const { step, writes } = setup()
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE, { keepExisting: true })).resolves.toBe('written')
    expect(String(writes()[0][0])).toMatch(/NOT \(COALESCE\(raw_analysis, '\{\}'::jsonb\) \? 'commercial_brief'\)/)
  })

  it('sans keepExisting (nouvelle analyse, ou force) ⇒ le brief existant est remplacé', async () => {
    const { step, writes } = setup({ raw: { ...RAW_ANALYSIS, commercial_brief: validBrief() } })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(String(writes()[0][0])).not.toMatch(/\? 'commercial_brief'/)
  })

  it('le site connu du compte (colonne website) entre dans le dossier du brief', async () => {
    const { step, ia } = setup({ website: 'https://bpce.fr' })
    await step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    expect(ia.commercialBrief.mock.calls[0][0].dossier.website).toBe('https://bpce.fr')
  })

  it('une panne IA ne jette jamais — le dossier est déjà livré', async () => {
    const { step, writes } = setup({ iaError: new Error('IA 503 commercial_brief_unavailable') })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('failed')
    expect(writes()).toHaveLength(0)
  })

  // 12/10/2026 — l'échec était silencieux : le WARN porte désormais statut + code.
  it('le WARN d’un 502 IA porte le statut et le code detail, jamais le corps', async () => {
    const http = new HttpError(
      502,
      '{"detail":"commercial_brief_failed","dossier":"SECRET"}',
      false,
      '/commercial-brief',
    )
    const { step } = setup({ iaError: new TechnicalError('HTTP request failed', { cause: http }) })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('failed')
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('"status":502')
    expect(logged).toContain('commercial_brief_failed')
    expect(logged).not.toContain('SECRET')
  })

  // 15/10/2026 — 0 compte sur 79 avait un brief et rien ne le disait : l'échec se compte.
  it('un échec IA est compté dans _api_metrics.commercial_brief_status, sans faux brief', async () => {
    const { step, writes, metricWrites } = setup({ iaError: new Error('boom') })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('failed')
    expect(writes()).toHaveLength(0)
    const [sql, params] = metricWrites()[0]
    expect(sql).toContain('commercial_brief_status')
    expect(params).toEqual(['failed', ACCOUNT, WORKSPACE])
    expect(String(sql)).not.toContain("'commercial_brief'")
  })

  it('un brief écrit ne compte aucun échec', async () => {
    const { step, metricWrites } = setup()
    await step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    expect(metricWrites()).toHaveLength(0)
  })

  it('si le compteur lui-même échoue, le step reste non bloquant', async () => {
    const { step, query } = setup({ iaError: new Error('boom') })
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/_api_metrics/.test(sql)) throw new Error('db down')
      return base(sql, params)
    })
    await expect(step.produceCommercialBrief(ACCOUNT, WORKSPACE)).resolves.toBe('failed')
  })

  it('le WARN d’un délai dépassé dit timeout', async () => {
    const timeout = new HttpTimeoutError(360_000, '/commercial-brief')
    const { step } = setup({ iaError: new TechnicalError('HTTP request failed', { cause: timeout }) })
    await step.produceCommercialBrief(ACCOUNT, WORKSPACE)
    expect(JSON.stringify(warn.mock.calls)).toContain('"detail":"timeout"')
  })

  it('l’appel IA du brief attend plus longtemps que l’IA (360 s > 300 s)', () => {
    const source = readFileSync(join(__dirname, '../ia/ia.client.ts'), 'utf8')
    const call = source.slice(source.indexOf("template: '/commercial-brief'"))
    expect(call.slice(0, 900)).toContain('timeoutMs: 360_000')
  })
})
