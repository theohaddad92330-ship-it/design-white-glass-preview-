import type { Repository } from 'typeorm'
import { ORG_REPORTING_INFLUENCE_TOPIC, orgGraphSchema } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { OrgGraphVersionService } from './org-graph.service'

function storedGraph() {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [{ id: 'e-tf1', name: 'TF1', type: 'groupe', parentId: null, confidence: 85 }],
    people: [
      { id: 'p-jean-dupont', fullName: 'Jean Dupont', entityId: 'e-tf1', identityStatus: 'classified', confidence: 85 },
      {
        id: 'p-marie-martin',
        fullName: 'Marie Martin',
        entityId: 'e-tf1',
        identityStatus: 'classified',
        confidence: 70,
      },
    ],
    buyingCommittee: [{ personId: 'p-jean-dupont', role: 'economic_buyer' }],
    recommendedPath: [{ step: 1, personId: 'p-jean-dupont', objective: 'ouvrir' }],
  })
}

type Harness = {
  service: OrgGraphVersionService
  queries: Array<{ sql: string; params: unknown[] }>
}

function makeService(
  account: Partial<AccountEntity> | null,
  opts: { rows?: Partial<AccountEntity>[]; lockLost?: boolean } = {},
): Harness {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const repo = {
    findOne: jest.fn(async () => account as AccountEntity | null),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        limit: jest.fn(() => qb),
        getMany: jest.fn(async () => (opts.rows ?? []) as AccountEntity[]),
      }
      return qb
    }),
    manager: {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        // Ce que PostgreSQL rend sur un `UPDATE … RETURNING` : la ligne
        // trouvée, ou AUCUNE quand la garde de version n'a pas matché.
        // `lockLost` simule un autre commercial passé entre-temps.
        if (!/^\s*UPDATE accounts/.test(sql)) return []
        return opts.lockLost ? [] : [{ org_graph_version: 2 }]
      }),
    },
  } as unknown as Repository<AccountEntity>
  return { service: new OrgGraphVersionService(repo), queries }
}

describe('OrgGraphVersionService.recordCorrection', () => {
  it('bump la version à chaque correction, même un simple « utile »', async () => {
    const { service, queries } = makeService({
      id: 'a1',
      org_graph_version: 3,
      org_rejected_items: [],
      raw_analysis: {} as never,
    })

    const result = await service.recordCorrection({
      accountId: 'a1',
      target: 'play',
      targetRef: 'Prise de contact DSI',
      verdict: 'utile',
    })

    expect(result).toEqual({ graphVersion: 4, rejected: null })
    expect(queries[0]?.params[1]).toBe(4)
    expect(queries[0]?.params[2]).toBe('[]')
  })

  it("mémorise le contact signalé parti et l'élague du graphe stocké (sans full rerun)", async () => {
    const { service, queries } = makeService({
      id: 'a1',
      org_graph_version: 1,
      org_rejected_items: [],
      raw_analysis: { org: { orgGraph: storedGraph() } } as never,
    })

    const result = await service.recordCorrection({
      accountId: 'a1',
      target: 'contact',
      targetRef: 'Jean Dupont',
      verdict: 'obsolete',
    })

    expect(result?.graphVersion).toBe(2)
    expect(result?.rejected?.sourceId).toBe('p-jean-dupont')

    const [, , rejectedJson, graphJson] = queries[0]?.params as [string, number, string, string]
    expect(JSON.parse(rejectedJson)).toEqual([{ sourceId: 'p-jean-dupont', reason: expect.any(String) }])
    const rewritten = JSON.parse(graphJson)
    expect(rewritten.graphVersion).toBe(2)
    expect(rewritten.people.map((p: { id: string }) => p.id)).toEqual(['p-marie-martin'])
    expect(rewritten.buyingCommittee).toEqual([])
    expect(rewritten.recommendedPath).toEqual([])
    expect(rewritten.rejectedItems).toHaveLength(1)
  })

  it('laisse le blob intact sur un dossier ANTÉRIEUR (aucun orgGraph stocké) — seule la version bouge', async () => {
    const { service, queries } = makeService({
      id: 'legacy',
      org_graph_version: 1,
      org_rejected_items: [],
      raw_analysis: { org: { organigramme: [] } } as never,
    })

    const result = await service.recordCorrection({
      accountId: 'legacy',
      target: 'contact',
      targetRef: 'Jean Dupont',
      verdict: 'faux',
    })

    expect(result?.graphVersion).toBe(2)
    // 4e paramètre = le graphe réécrit ; NULL ⇒ le CASE laisse `raw_analysis` tel quel.
    expect((queries[0]?.params as unknown[])[3]).toBeNull()
  })

  it('ne fait jamais échouer un retour utilisateur quand la base tousse', async () => {
    const repo = {
      findOne: jest.fn(async () => {
        throw new Error('connection reset')
      }),
    } as unknown as Repository<AccountEntity>
    const service = new OrgGraphVersionService(repo)

    await expect(
      service.recordCorrection({ accountId: 'a1', target: 'contact', targetRef: 'X', verdict: 'faux' }),
    ).resolves.toBeNull()
  })

  it('sur un compte introuvable : aucune écriture', async () => {
    const { service, queries } = makeService(null)
    await expect(
      service.recordCorrection({ accountId: 'ghost', target: 'contact', targetRef: 'X', verdict: 'faux' }),
    ).resolves.toBeNull()
    expect(queries).toEqual([])
  })
})

/**
 * Les QUATRE écritures qui précédaient le ledger étaient des read-then-write :
 * elles lisaient `org_graph_version`, ajoutaient 1, et écrivaient sans regarder
 * si quelqu'un était passé entre les deux. Deux gestes concurrents écrivaient
 * donc la même version, et le second effaçait le premier en silence.
 *
 * Elles rendent désormais `null` — le contrat best-effort qu'elles avaient
 * déjà, et que leurs appelants savent lire — plutôt que d'annoncer un succès
 * qui a écrasé le travail d'un autre.
 */
describe('le verrou sur les écritures qui précédaient le ledger', () => {
  /** Le graphe de référence, plus UN lien non vérifié — sinon
   *  `applyRelationVerification` n'a rien à écrire et le test passerait au
   *  vert sur une écriture qui n'a pas eu lieu. */
  const withEdge = () => ({
    ...storedGraph(),
    hierarchyEdges: [
      {
        fromId: 'p-marie-martin',
        toId: 'p-jean-dupont',
        type: 'reports_to' as const,
        sourceIds: [],
        confidence: 60,
        verified: false,
      },
    ],
  })

  const account = () =>
    ({
      id: 'a1',
      org_graph_version: 2,
      org_rejected_items: [],
      org_declared_people: [],
      company_name: 'TF1',
      website: null,
      raw_analysis: { org: { orgGraph: withEdge() } },
    }) as unknown as Partial<AccountEntity>

  it('pose la garde de version DANS le WHERE de chaque écriture', async () => {
    const cases: Array<[string, (s: OrgGraphVersionService) => Promise<unknown>]> = [
      [
        'recordCorrection',
        s => s.recordCorrection({ accountId: 'a1', target: 'contact', targetRef: 'Jean Dupont', verdict: 'faux' }),
      ],
      [
        'declarePeople',
        s =>
          s.declarePeople({
            accountId: 'a1',
            people: [{ fullName: 'Zoé Marchand', declaredAt: '2026-08-29T10:00:00.000Z' }],
          }),
      ],
      ['recomputePath', s => s.recomputePath('a1')],
      [
        'applyRelationVerification',
        s =>
          s.applyRelationVerification('a1', {
            fromId: 'p-marie-martin',
            toId: 'p-jean-dupont',
            type: 'reports_to',
            verdict: {
              verified: true,
              confidence: 95,
              sources: [{ id: 's-off', kind: 'official_site', grounding: 'A' }],
            },
          }),
      ],
    ]

    const guarded: string[] = []
    for (const [name, run] of cases) {
      const { service, queries } = makeService(account())
      await run(service)
      const update = queries.find(q => /UPDATE accounts/.test(q.sql))
      if (!update) throw new Error(`${name} n’écrit pas`)
      const sql = update.sql.replace(/\s+/g, ' ')
      if (!sql.includes('COALESCE(org_graph_version, 1) = $')) {
        throw new Error(`${name} écrit SANS garde de version`)
      }
      if (!sql.includes('RETURNING org_graph_version')) {
        throw new Error(`${name} n’a aucun moyen de savoir si sa garde a tenu`)
      }
      guarded.push(name)
    }
    // La garde LIT quelque chose : les QUATRE écritures ont été exercées, pas
    // une boucle vide qui passe au vert sur zéro cas.
    expect(guarded).toEqual(['recordCorrection', 'declarePeople', 'recomputePath', 'applyRelationVerification'])
  })

  it('rend `null` quand quelqu’un est passé entre la lecture et l’écriture', async () => {
    // `lockLost` : l'UPDATE conditionnel ne trouve aucune ligne. Avant, ces
    // méthodes annonçaient quand même un succès — et le geste de l'autre
    // avait disparu.
    const { service: a } = makeService(account(), { lockLost: true })
    await expect(
      a.recordCorrection({ accountId: 'a1', target: 'contact', targetRef: 'Jean Dupont', verdict: 'faux' }),
    ).resolves.toBeNull()

    const { service: b } = makeService(account(), { lockLost: true })
    await expect(
      b.declarePeople({
        accountId: 'a1',
        people: [{ fullName: 'Zoé Marchand', declaredAt: '2026-08-29T10:00:00.000Z' }],
      }),
    ).resolves.toBeNull()

    const { service: c } = makeService(account(), { lockLost: true })
    await expect(c.recomputePath('a1')).resolves.toBeNull()

    const { service: d } = makeService(account(), { lockLost: true })
    await expect(
      d.applyRelationVerification('a1', {
        fromId: 'p-marie-martin',
        toId: 'p-jean-dupont',
        type: 'reports_to',
        verdict: {
          verified: true,
          confidence: 95,
          sources: [{ id: 's-off', kind: 'official_site', grounding: 'A' }],
        },
      }),
    ).resolves.toBeNull()
  })
})

describe('OrgGraphVersionService.recomputePath', () => {
  it('réécrit le chemin et bump la version, sans aucun appel de recherche', async () => {
    const { service, queries } = makeService({
      id: 'a1',
      org_graph_version: 2,
      raw_analysis: { org: { orgGraph: storedGraph() } } as never,
    })

    const result = await service.recomputePath('a1')

    expect(result).toEqual({ graphVersion: 3, steps: 2 })
    expect(queries).toHaveLength(1)
    expect(queries[0]?.params[1]).toBe(3)
    const written = JSON.parse(String(queries[0]?.params[2]))
    expect(written.recommendedPath.map((s: { personId: string }) => s.personId)).toEqual([
      'p-jean-dupont', // siège au comité (economic_buyer) — une lecture d'achat établie
      'p-marie-martin', // rôle inconnu : le moins informatif, donc en dernier
    ])
    expect(written.graphVersion).toBe(3)
  })

  it("sur un dossier sans graphe stocké : aucune écriture, refus explicite à l'appelant", async () => {
    const { service, queries } = makeService({ id: 'a1', org_graph_version: 1, raw_analysis: {} as never })

    await expect(service.recomputePath('a1')).resolves.toBeNull()
    expect(queries).toEqual([])
  })

  it('sur un compte introuvable : aucune écriture', async () => {
    const { service, queries } = makeService(null)

    await expect(service.recomputePath('ghost')).resolves.toBeNull()
    expect(queries).toEqual([])
  })
})

describe('OrgGraphVersionService.memoryFor', () => {
  it("agrège la mémoire de TOUS les dossiers de l'entreprise dans le workspace", async () => {
    const { service } = makeService(null, {
      rows: [
        { org_graph_version: 3, org_rejected_items: [{ sourceId: 'p-jean-dupont', reason: 'parti' }] },
        { org_graph_version: 2, org_rejected_items: [{ sourceId: 'p-vieux-run', reason: 'bruit' }] },
      ] as Partial<AccountEntity>[],
    })

    const memory = await service.memoryFor({ accountId: 'a2', workspaceId: 'ws1', companyName: 'TF1' })

    expect(memory.graphVersion).toBe(3)
    expect(memory.rejectedItems.map(r => r.sourceId)).toEqual(['p-jean-dupont', 'p-vieux-run'])
  })

  it('rend la mémoire vide (= comportement d’avant) quand il n’y a rien à se rappeler', async () => {
    const { service } = makeService(null, { rows: [] })
    await expect(service.memoryFor({ accountId: 'a1', workspaceId: 'ws1', companyName: 'TF1' })).resolves.toEqual({
      graphVersion: 1,
      rejectedItems: [],
    })
  })

  it('dégrade en mémoire vide plutôt que de bloquer un lancement', async () => {
    const repo = {
      createQueryBuilder: jest.fn(() => {
        throw new Error('boom')
      }),
    } as unknown as Repository<AccountEntity>
    const service = new OrgGraphVersionService(repo)

    await expect(service.memoryFor({ accountId: 'a1', workspaceId: 'ws1', companyName: 'TF1' })).resolves.toEqual({
      graphVersion: 1,
      rejectedItems: [],
    })
  })
})

/* ------------------------------------------------------------------ */
/*  D360 — le lien à vérifier, dans SES DEUX formes                    */
/* ------------------------------------------------------------------ */

describe('relationToVerify — une hypothèse de rattachement est un lien vérifiable', () => {
  /** Le graphe tel que l'assembleur le produit depuis le correctif P0 : aucun
   *  `reports_to`, le rattachement rangé en influence. Mesuré le 30/08. */
  function graphWithHypothesis() {
    return orgGraphSchema.parse({
      ...storedGraph(),
      influenceEdges: [
        {
          fromId: 'p-marie-martin',
          toId: 'p-jean-dupont',
          topic: ORG_REPORTING_INFLUENCE_TOPIC,
          stance: 'unknown',
          confidence: 15,
          reasoning: 'N+1 supposé par le modèle à partir du poste — aucune source n’a observé ce rattachement.',
        },
      ],
    })
  }

  const account = (graph: unknown): Partial<AccountEntity> => ({
    id: 'a1',
    company_name: 'TF1',
    website: 'https://tf1.fr',
    raw_analysis: { org: { orgGraph: graph } } as never,
  })

  it('trouve les deux noms alors qu’AUCUN `reports_to` n’existe dans le graphe', async () => {
    const graph = graphWithHypothesis()
    // Le fait qui a rendu le bouton mort, écrit noir sur blanc.
    expect(graph.hierarchyEdges.filter(e => e.type === 'reports_to')).toHaveLength(0)
    const { service } = makeService(account(graph))

    await expect(
      service.relationToVerify('a1', { fromId: 'p-marie-martin', toId: 'p-jean-dupont', type: 'reports_to' }),
    ).resolves.toEqual({ company: 'TF1', website: 'https://tf1.fr', fromName: 'Marie Martin', toName: 'Jean Dupont' })
  })

  it('refuse un lien que RIEN ne porte — ni ligne, ni hypothèse', async () => {
    const { service } = makeService(account(graphWithHypothesis()))
    await expect(
      // Le sens inverse n'est supposé nulle part : on ne fabrique pas la
      // relation qu'on vérifie.
      service.relationToVerify('a1', { fromId: 'p-jean-dupont', toId: 'p-marie-martin', type: 'reports_to' }),
    ).resolves.toBeNull()
  })

  it('refuse une cible ENTITÉ — le vérificateur cherche deux noms de PERSONNES', async () => {
    // C'est le 412 que les « 4 vues » servaient sur chaque `member_of`, et la
    // raison pour laquelle le bouton en a été retiré (D362).
    const graph = orgGraphSchema.parse({
      ...storedGraph(),
      hierarchyEdges: [
        { fromId: 'p-marie-martin', toId: 'e-tf1', type: 'member_of', sourceIds: [], confidence: 55, verified: false },
      ],
    })
    const { service } = makeService(account(graph))
    await expect(
      service.relationToVerify('a1', { fromId: 'p-marie-martin', toId: 'e-tf1', type: 'member_of' }),
    ).resolves.toBeNull()
  })
})
