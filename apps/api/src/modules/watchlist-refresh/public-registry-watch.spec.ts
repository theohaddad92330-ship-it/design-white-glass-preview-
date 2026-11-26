import { createMockRepository } from '../../database/test-utils'
import { PublicRegistryWatch } from './public-registry-watch'
import { publicAwardsRefreshDays } from './watchlist-refresh.queue'

const NOW = new Date('2026-10-09T08:00:00Z')

function build(state: Record<string, unknown> | null, bodacc: unknown) {
  const announcements = createMockRepository()
  const watchState = createMockRepository()
  watchState.findOne.mockResolvedValue(state)
  const ia = { publicRegistryBodacc: jest.fn().mockResolvedValue(bodacc) }
  const watch = new PublicRegistryWatch(announcements as never, watchState as never, ia as never)
  return { watch, announcements, watchState, ia }
}

const announcement = {
  ref: 'A1',
  url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A1',
  date: '2026-10-05',
  type: 'Procédures collectives',
  kind: 'collective_proceeding',
  tribunal: 'TC Paris',
  label: 'ACME',
}

describe('#3916.a — PublicRegistryWatch.collectBodacc', () => {
  it('premier passage : lit 24 mois et le DIT (firstPass) pour que rien ne sonne sur l’historique', async () => {
    const { watch, ia, announcements, watchState } = build(null, {
      announcements: [announcement],
      truncated: false,
      failed: false,
    })

    const out = await watch.collectBodacc('403355726', NOW)

    expect(ia.publicRegistryBodacc).toHaveBeenCalledWith({
      siren: '403355726',
      since: '2024-10-09',
      until: '2026-10-09',
    })
    expect(out).toEqual({ firstPass: true, failed: false, written: 1 })
    // Écriture idempotente : une annonce relue n'est jamais une seconde ligne.
    const [sql, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (source, siren, ref) DO UPDATE')
    // #3921.2 — la SEULE relecture qui réécrit : une « modification » requalifiée en changement de dirigeant.
    expect(sql).toContain("public_registry_announcements.kind = 'modification' AND EXCLUDED.kind = 'executive_change'")
    // #3916 (15/10) — une annonce déjà rangée SANS lien reçoit celui de la relecture ; un lien posé n'est jamais remplacé.
    expect(sql).toContain('url = COALESCE(public_registry_announcements.url, EXCLUDED.url)')
    expect(sql).toContain('public_registry_announcements.url IS NULL AND EXCLUDED.url IS NOT NULL')
    expect(params).toEqual(
      expect.arrayContaining(['403355726', 'bodacc', 'A1', 'collective_proceeding', '2026-10-05', announcement.url]),
    )
    expect(watchState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ siren: '403355726', bodacc_through: '2026-10-09', bodacc_truncated: false }),
      ['siren'],
    )
  })

  it('passage suivant : repart du dernier jour lu, avec trois jours de chevauchement', async () => {
    const { watch, ia } = build(
      { siren: '403355726', bodacc_through: '2026-10-08' },
      { announcements: [], truncated: false, failed: false },
    )

    const out = await watch.collectBodacc('403355726', NOW)

    expect(ia.publicRegistryBodacc).toHaveBeenCalledWith({
      siren: '403355726',
      since: '2026-10-05',
      until: '2026-10-09',
    })
    expect(out.firstPass).toBe(false)
  })

  it('une panne n’avance JAMAIS le curseur — sinon la fenêtre serait perdue', async () => {
    const { watch, watchState, announcements } = build(
      { siren: '403355726', bodacc_through: '2026-10-01' },
      { announcements: [], truncated: false, failed: true },
    )

    const out = await watch.collectBodacc('403355726', NOW)

    expect(out).toEqual({ firstPass: false, failed: true, written: 0 })
    expect(watchState.upsert).not.toHaveBeenCalled()
    expect(announcements.query).not.toHaveBeenCalled()
  })

  it('le moteur injoignable est une panne, pas un relevé vide', async () => {
    const { watch, ia, watchState } = build(null, null)
    ia.publicRegistryBodacc.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const out = await watch.collectBodacc('403355726', NOW)

    expect(out.failed).toBe(true)
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('une annonce sans date ni identité n’est pas écrite (on n’affiche pas ce qu’on n’a pas)', async () => {
    const { watch, announcements } = build(null, {
      announcements: [
        { ...announcement, date: '' },
        { ...announcement, ref: '' },
      ],
      truncated: false,
      failed: false,
    })

    const out = await watch.collectBodacc('403355726', NOW)

    expect(out.written).toBe(0)
    expect(announcements.query).not.toHaveBeenCalled()
  })
})

describe('#3916.a — rattachement par SIREN uniquement : une société HOMONYME n’est jamais rattachée', () => {
  const SUIVI = '403355726'
  const HOMONYME = '552081317'

  it('la lecture est demandée par SIREN seul (jamais par dénomination) et chaque ligne porte le SIREN demandé', async () => {
    const homonym = { ...announcement, ref: 'H1', label: 'ACME' }
    const own = { ...announcement, ref: 'S1', label: 'ACME' }
    const { watch, ia, announcements } = build(null, { announcements: [own], truncated: false, failed: false })
    ia.publicRegistryBodacc.mockImplementation(async ({ siren }: { siren: string }) => ({
      announcements: siren === SUIVI ? [own] : [homonym],
      truncated: false,
      failed: false,
    }))

    await watch.collectBodacc(SUIVI, NOW)

    // Le client IA ne reçoit ni nom ni dénomination : le SIREN est la seule clé.
    const call = ia.publicRegistryBodacc.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(call).sort()).toEqual(['since', 'siren', 'until'])
    // Les lignes écrites sont rangées sous le SIREN suivi, jamais sous celui de l'homonyme.
    const [, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(expect.arrayContaining([SUIVI, 'S1']))
    expect(params).not.toContain(HOMONYME)
    expect(params).not.toContain('H1')
  })

  it('l’annonce de l’homonyme (même nom, autre SIREN) reste sous SON SIREN ; rowsFor ne filtre que par SIREN', async () => {
    const { watch, announcements } = build(null, null)
    await watch.rowsFor(SUIVI)
    expect(announcements.find).toHaveBeenCalledWith(expect.objectContaining({ where: { siren: SUIVI } }))
    const where = (announcements.find.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(Object.keys(where)).toEqual(['siren'])
  })
})

describe('#3916.b — esn_directory : la procédure collective alimente le risque (S12, PAR-04)', () => {
  function buildWithEsn(esn: Record<string, unknown> | null, proceeding: Record<string, unknown> | null) {
    const announcements = createMockRepository()
    announcements.findOne.mockResolvedValue(proceeding)
    const esnRepo = createMockRepository()
    esnRepo.findOne.mockResolvedValue(esn)
    const watch = new PublicRegistryWatch(
      announcements as never,
      createMockRepository() as never,
      { publicRegistryBodacc: jest.fn() } as never,
      esnRepo as never,
    )
    return { watch, esnRepo, announcements }
  }

  it('une procédure collective récente pose `alerte` avec sa preuve datée', async () => {
    const { watch, esnRepo, announcements } = buildWithEsn(
      { id: 'esn-1', siren: '403355726', riskFlag: 'aucun', riskEvidence: null },
      { kind: 'collective_proceeding', family_label: 'Procédures collectives', published_on: '2026-09-12' },
    )

    expect(await watch.syncEsnRisk('403355726', NOW)).toBe('alerte')

    expect(announcements.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siren: '403355726', kind: 'collective_proceeding' } }),
    )
    expect(esnRepo.update).toHaveBeenCalledWith('esn-1', {
      riskFlag: 'alerte',
      riskEvidence: 'Procédures collectives publiée au BODACC du 2026-09-12',
      riskCheckedAt: NOW,
    })
  })

  it('sans procédure, RIEN n’est écrit : « aucun risque vérifié » serait une affirmation que personne n’a faite', async () => {
    const { watch, esnRepo } = buildWithEsn(
      { id: 'esn-1', siren: '403355726', riskFlag: 'aucun', riskEvidence: null },
      null,
    )

    expect(await watch.syncEsnRisk('403355726', NOW)).toBeNull()
    expect(esnRepo.update).not.toHaveBeenCalled()
  })

  it('réversible : une alerte BODACC dont la procédure est périmée est levée', async () => {
    const { watch, esnRepo } = buildWithEsn(
      {
        id: 'esn-1',
        siren: '403355726',
        riskFlag: 'alerte',
        riskEvidence: 'Liquidation publiée au BODACC du 2023-01-02',
      },
      { kind: 'collective_proceeding', family_label: 'Liquidation', published_on: '2023-01-02' },
    )

    expect(await watch.syncEsnRisk('403355726', NOW)).toBe('aucun')
    expect(esnRepo.update).toHaveBeenCalledWith('esn-1', { riskFlag: 'aucun', riskEvidence: null, riskCheckedAt: NOW })
  })

  it('un SIREN absent du référentiel ESN ne touche à rien', async () => {
    const { watch, esnRepo } = buildWithEsn(null, null)
    expect(await watch.syncEsnRisk('403355726', NOW)).toBeNull()
    expect(esnRepo.update).not.toHaveBeenCalled()
  })
})

describe('#3921.a — PublicRegistryWatch.collectSirene : le relevé du jour, les ouvertures datées et liées', () => {
  function buildSirene(previous: Record<string, unknown> | null, reading: unknown) {
    const announcements = createMockRepository()
    const watchState = createMockRepository()
    const snapshots = createMockRepository()
    snapshots.findOne.mockResolvedValue(previous)
    const ia = { publicRegistryBodacc: jest.fn(), publicRegistrySirene: jest.fn().mockResolvedValue(reading) }
    const watch = new PublicRegistryWatch(
      announcements as never,
      watchState as never,
      ia as never,
      undefined,
      snapshots as never,
    )
    return { watch, ia, announcements, watchState, snapshots }
  }

  const etab = { siret: '40335572600044', isActive: true, periodStartDate: '2026-10-01', city: 'Lyon' }

  it('envoie le relevé d’HIER, stocke celui du jour (effectif compris) et écrit chaque ouverture', async () => {
    const yesterday = [{ siret: '40335572600010', isActive: true, periodStartDate: '2010-01-01', city: 'Paris' }]
    const { watch, ia, snapshots, announcements, watchState } = buildSirene(
      { siren: '403355726', observed_on: '2026-10-08', establishments: yesterday },
      {
        configured: true,
        failed: false,
        establishments: [...yesterday, etab],
        headcountRange: '21',
        openings: [
          {
            siret: '40335572600044',
            date: '2026-10-01',
            label: 'Nouvel établissement — Lyon',
            url: 'https://annuaire-entreprises.data.gouv.fr/etablissement/40335572600044',
          },
        ],
      },
    )

    const out = await watch.collectSirene('403355726', NOW)

    expect(ia.publicRegistrySirene).toHaveBeenCalledWith({ siren: '403355726', previous: yesterday })
    expect(out).toEqual({ configured: true, failed: false, openings: 1 })
    const [snapSql, snapParams] = snapshots.query.mock.calls[0] as [string, unknown[]]
    expect(snapSql).toContain('ON CONFLICT (siren, observed_on)')
    expect(snapParams).toEqual(['403355726', '2026-10-09', '21', JSON.stringify([...yesterday, etab])])
    const [sql, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (source, siren, ref) DO NOTHING')
    expect(params).toEqual([
      '403355726',
      'sirene',
      '40335572600044',
      'new_establishment',
      'Nouvel établissement — Lyon',
      '2026-10-01',
      'https://annuaire-entreprises.data.gouv.fr/etablissement/40335572600044',
    ])
    expect(watchState.upsert).toHaveBeenCalledWith({ siren: '403355726', sirene_checked_at: NOW }, ['siren'])
  })

  it('premier relevé : rien de comparable, la veille l’envoie sans relevé antérieur', async () => {
    const { watch, ia } = buildSirene(null, {
      configured: true,
      failed: false,
      establishments: [etab],
      headcountRange: null,
      openings: [],
    })
    await watch.collectSirene('403355726', NOW)
    expect(ia.publicRegistrySirene).toHaveBeenCalledWith({ siren: '403355726', previous: null })
  })

  it('sans clé INSEE : no-op strict, aucun relevé écrit', async () => {
    const { watch, snapshots, watchState } = buildSirene(null, {
      configured: false,
      failed: false,
      establishments: [],
      headcountRange: null,
      openings: [],
    })
    expect(await watch.collectSirene('403355726', NOW)).toEqual({ configured: false, failed: false, openings: 0 })
    expect(snapshots.query).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('une panne n’écrit JAMAIS un relevé vide — l’ouverture de demain serait perdue', async () => {
    const { watch, snapshots } = buildSirene(null, {
      configured: true,
      failed: true,
      establishments: [],
      headcountRange: null,
      openings: [],
    })
    expect((await watch.collectSirene('403355726', NOW)).failed).toBe(true)
    expect(snapshots.query).not.toHaveBeenCalled()
  })

  describe('#3921 — headcount_change, « observé le … » (décision Louis 13/10/2026)', () => {
    it('deux relevés mesurés avec une tranche différente écrivent un signal `headcount_change` daté par l’observation', async () => {
      const { watch, announcements, snapshots } = buildSirene(null, {
        configured: true,
        failed: false,
        establishments: [],
        headcountRange: '32',
        openings: [],
      })
      snapshots.findOne
        .mockResolvedValueOnce(null) // latestEstablishmentsReading
        .mockResolvedValueOnce({ siren: '403355726', observed_on: '2026-10-05', headcount_range: '21' })

      await watch.collectSirene('403355726', NOW)

      const [sql, params] = announcements.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('ON CONFLICT (source, siren, ref) DO NOTHING')
      expect(params).toEqual([
        '403355726',
        'sirene',
        'headcount:2026-10-09',
        'headcount_change',
        'Effectif observé — 250 à 499 salariés',
        '2026-10-09',
        'https://annuaire-entreprises.data.gouv.fr/entreprise/403355726#effectif-2026-10-09',
      ])
    })

    it('un seul point mesuré (premier relevé) ne produit AUCUN signal — rien à comparer', async () => {
      const { watch, announcements, snapshots } = buildSirene(null, {
        configured: true,
        failed: false,
        establishments: [],
        headcountRange: '21',
        openings: [],
      })
      snapshots.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

      await watch.collectSirene('403355726', NOW)

      expect(announcements.query).not.toHaveBeenCalled()
    })

    it('la même tranche relue ne produit AUCUN signal — ce n’est pas un changement', async () => {
      const { watch, announcements, snapshots } = buildSirene(null, {
        configured: true,
        failed: false,
        establishments: [],
        headcountRange: '21',
        openings: [],
      })
      snapshots.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ siren: '403355726', observed_on: '2026-10-05', headcount_range: '21' })

      await watch.collectSirene('403355726', NOW)

      expect(announcements.query).not.toHaveBeenCalled()
    })

    it('tranche non mesurée (`headcountRange: null`) ne produit AUCUN signal — non mesuré n’est jamais un changement', async () => {
      const { watch, announcements, snapshots } = buildSirene(null, {
        configured: true,
        failed: false,
        establishments: [],
        headcountRange: null,
        openings: [],
      })
      snapshots.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ siren: '403355726', observed_on: '2026-10-05', headcount_range: '21' })

      await watch.collectSirene('403355726', NOW)

      expect(announcements.query).not.toHaveBeenCalled()
    })
  })
})

describe('#3920.8 — PublicRegistryWatch.collectAwards : les marchés attribués lus en continu', () => {
  const award = {
    ref: 'abc123def4567890',
    date: '2026-10-02',
    label: 'TMA du SI achats',
    winner: 'Acme SA',
    url: null,
  }

  function buildAwards(state: Record<string, unknown> | null, reading: unknown) {
    const announcements = createMockRepository()
    const watchState = createMockRepository()
    watchState.findOne.mockResolvedValue(state)
    const ia = { publicRegistryAwards: jest.fn().mockResolvedValue(reading) }
    const watch = new PublicRegistryWatch(announcements as never, watchState as never, ia as never)
    return { watch, ia, announcements, watchState }
  }

  it('premier passage : écrit chaque marché une fois (DO NOTHING), le DIT, et fixe le curseur', async () => {
    const { watch, ia, announcements, watchState } = buildAwards(null, { failed: false, awards: [award] })

    const out = await watch.collectAwards('403355726', 'Mairie X', NOW)

    expect(ia.publicRegistryAwards).toHaveBeenCalledWith({ siren: '403355726', name: 'Mairie X' })
    expect(out).toEqual({ firstPass: true, failed: false, written: 1 })
    const [sql, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (source, siren, ref) DO NOTHING')
    expect(params).toEqual(['403355726', 'decp', award.ref, 'award', 'TMA du SI achats', 'Acme SA', '2026-10-02', null])
    expect(watchState.upsert).toHaveBeenCalledWith({ siren: '403355726', awards_checked_at: NOW }, ['siren'])
  })

  it('curseur déjà posé : ce n’est plus un premier passage', async () => {
    const { watch } = buildAwards(
      { siren: '403355726', awards_checked_at: new Date('2026-10-08T08:00:00Z') },
      {
        failed: false,
        awards: [],
      },
    )
    expect((await watch.collectAwards('403355726', 'Mairie X', NOW)).firstPass).toBe(false)
  })

  it('une panne n’écrit rien et NE fixe PAS le curseur — sinon l’historique sonnerait au retour', async () => {
    const { watch, announcements, watchState } = buildAwards(null, { failed: true, awards: [] })
    expect(await watch.collectAwards('403355726', 'Mairie X', NOW)).toEqual({
      firstPass: true,
      failed: true,
      written: 0,
    })
    expect(announcements.query).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('LUD.1 — un espace industriel relit AUSSI les marchés de son domaine ; un espace IT, un seul appel inchangé', async () => {
    const { watch, ia, announcements } = buildAwards(null, { failed: false, awards: [award] })
    ia.publicRegistryAwards.mockResolvedValueOnce({ failed: false, awards: [award] }).mockResolvedValueOnce({
      failed: false,
      awards: [{ ...award, ref: 'ind0000000000001', label: 'Maîtrise d’œuvre' }],
    })

    const out = await watch.collectAwards('403355726', 'Mairie X', NOW, ['industrial_engineering'])

    expect(ia.publicRegistryAwards).toHaveBeenNthCalledWith(1, { siren: '403355726', name: 'Mairie X' })
    expect(ia.publicRegistryAwards).toHaveBeenNthCalledWith(2, {
      siren: '403355726',
      name: 'Mairie X',
      pack: 'industrial_engineering',
    })
    expect(out.written).toBe(2)
    expect(announcements.query).toHaveBeenCalledTimes(2)

    const it = buildAwards(null, { failed: false, awards: [award] })
    await it.watch.collectAwards('403355726', 'Mairie X', NOW)
    expect(it.ia.publicRegistryAwards).toHaveBeenCalledTimes(1)
  })

  it('un marché sans date ISO ou sans référence n’est jamais écrit', async () => {
    const { watch, announcements } = buildAwards(null, {
      failed: false,
      awards: [
        { ...award, date: 'bientôt' },
        { ...award, ref: '' },
      ],
    })
    expect((await watch.collectAwards('403355726', 'Mairie X', NOW)).written).toBe(0)
    expect(announcements.query).not.toHaveBeenCalled()
  })
})

describe('#3921.9 — PublicRegistryWatch.collectRne : les événements du registre national lus en continu', () => {
  const event = {
    ref: 'pouvoir:r1:a:2026-02-20',
    kind: 'executive_change',
    date: '2026-10-02',
    label: 'Nomination — Jeanne DUPONT (Président)',
    url: 'https://annuaire-entreprises.data.gouv.fr/dirigeants/552059024#evt-2026-10-02',
  }

  function buildRne(state: Record<string, unknown> | null, reading: unknown) {
    const announcements = createMockRepository()
    const watchState = createMockRepository()
    watchState.findOne.mockResolvedValue(state)
    const ia = { publicRegistryRne: jest.fn().mockResolvedValue(reading) }
    const watch = new PublicRegistryWatch(announcements as never, watchState as never, ia as never)
    return { watch, ia, announcements, watchState }
  }

  it('premier passage : écrit chaque événement une fois, daté et typé comme les autres sources, et fixe le curseur', async () => {
    const { watch, announcements, watchState } = buildRne(null, {
      configured: true,
      failed: false,
      events: [event],
    })

    const out = await watch.collectRne('552059024', NOW)

    expect(out).toEqual({ configured: true, firstPass: true, failed: false, written: 1 })
    const [sql, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (source, siren, ref) DO NOTHING')
    // Un site déjà lu par Sirene (même SIRET) n'est pas un second fait.
    expect(sql).toContain("source = 'sirene'")
    expect(params).toEqual(['552059024', 'rne', event.ref, 'executive_change', event.label, '2026-10-02', event.url])
    expect(watchState.upsert).toHaveBeenCalledWith({ siren: '552059024', rne_checked_at: NOW }, ['siren'])
  })

  it('sans identifiants (configured: false) : no-op strict, rien n’est écrit', async () => {
    const { watch, announcements, watchState } = buildRne(null, { configured: false, failed: false, events: [] })
    expect(await watch.collectRne('552059024', NOW)).toEqual({
      configured: false,
      firstPass: true,
      failed: false,
      written: 0,
    })
    expect(announcements.query).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('une panne n’écrit rien et NE fixe PAS le curseur', async () => {
    const { watch, announcements, watchState } = buildRne(null, { configured: true, failed: true, events: [] })
    expect((await watch.collectRne('552059024', NOW)).failed).toBe(true)
    expect(announcements.query).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('un appel IA qui lève est une panne nommée, jamais un vide', async () => {
    const { watch, ia, watchState } = buildRne(null, null)
    ia.publicRegistryRne.mockRejectedValue(new Error('boom'))
    expect((await watch.collectRne('552059024', NOW)).failed).toBe(true)
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('curseur déjà posé : plus un premier passage ; événement sans date ISO, sans référence ou de genre inconnu jamais écrit', async () => {
    const { watch, announcements } = buildRne(
      { siren: '552059024', rne_checked_at: new Date('2026-10-08T08:00:00Z') },
      {
        configured: true,
        failed: false,
        events: [
          { ...event, date: 'bientôt' },
          { ...event, ref: '' },
          { ...event, kind: 'birthdate_leak' },
        ],
      },
    )
    const out = await watch.collectRne('552059024', NOW)
    expect(out.firstPass).toBe(false)
    expect(out.written).toBe(0)
    expect(announcements.query).not.toHaveBeenCalled()
  })
})

describe('#3921.10 — PublicRegistryWatch.syncEsnAwards : les marchés GAGNÉS comptés au référentiel ESN', () => {
  const won = [
    { ref: 'decp:A', date: '2026-10-01', title: 'Maintenance logiciel', durationMonths: 84, endsOn: '2033-10-01' },
    { ref: 'decp:B', date: '2026-03-02', title: 'TMA', durationMonths: null, endsOn: null },
  ]

  function buildEsn(esn: Record<string, unknown> | null, reading: unknown) {
    const announcements = createMockRepository()
    const watchState = createMockRepository()
    const directory = createMockRepository()
    directory.findOne.mockResolvedValue(esn)
    const ia = { publicRegistryAwardsWon: jest.fn().mockResolvedValue(reading) }
    const watch = new PublicRegistryWatch(announcements as never, watchState as never, ia as never, directory as never)
    return { watch, ia, directory }
  }

  it('écrit la liste des marchés gagnés ET la date de lecture sur l’ESN du référentiel', async () => {
    const { watch, ia, directory } = buildEsn({ id: 'esn-1', siren: '326820065' }, { failed: false, awards: won })
    expect(await watch.syncEsnAwards('326820065', NOW)).toBe(2)
    expect(ia.publicRegistryAwardsWon).toHaveBeenCalledWith({ siren: '326820065' })
    // #3921.12 — l'exposition est dérivée des mêmes marchés (deux sur 24 mois = moyenne).
    expect(directory.update).toHaveBeenCalledWith('esn-1', {
      publicAwards: won,
      publicExposure: 'moyenne',
      awardsRefreshedAt: NOW,
    })
  })

  it('une lecture réussie SANS marché écrit une liste vide DATÉE (mesuré à zéro), pas un « non mesuré »', async () => {
    const { watch, directory } = buildEsn({ id: 'esn-1' }, { failed: false, awards: [] })
    expect(await watch.syncEsnAwards('326820065', NOW)).toBe(0)
    expect(directory.update).toHaveBeenCalledWith('esn-1', {
      publicAwards: [],
      publicExposure: 'nulle',
      awardsRefreshedAt: NOW,
    })
  })

  it('une panne n’écrit RIEN — ni liste, ni date : « non mesuré » n’est pas « 0 »', async () => {
    const { watch, directory } = buildEsn({ id: 'esn-1' }, { failed: true, awards: [] })
    expect(await watch.syncEsnAwards('326820065', NOW)).toBeNull()
    expect(directory.update).not.toHaveBeenCalled()
  })

  it('un appel qui lève est une panne : rien d’écrit', async () => {
    const { watch, ia, directory } = buildEsn({ id: 'esn-1' }, null)
    ia.publicRegistryAwardsWon.mockRejectedValue(new Error('boom'))
    expect(await watch.syncEsnAwards('326820065', NOW)).toBeNull()
    expect(directory.update).not.toHaveBeenCalled()
  })

  it('un SIREN absent du référentiel : aucun appel (pas une ESN)', async () => {
    const { watch, ia } = buildEsn(null, { failed: false, awards: won })
    expect(await watch.syncEsnAwards('111111111', NOW)).toBeNull()
    expect(ia.publicRegistryAwardsWon).not.toHaveBeenCalled()
  })

  it('un marché sans date ISO ou sans référence n’est jamais compté', async () => {
    const { watch, directory } = buildEsn(
      { id: 'esn-1' },
      { failed: false, awards: [{ ...won[0], date: 'bientôt' }, { ...won[1], ref: '' }, won[0]] },
    )
    expect(await watch.syncEsnAwards('326820065', NOW)).toBe(1)
    expect(directory.update).toHaveBeenCalledWith('esn-1', {
      publicAwards: [won[0]],
      publicExposure: 'moyenne',
      awardsRefreshedAt: NOW,
    })
  })
})

// #3915.decp — le collecteur DECP en continu (décision Louis 16/10/2026).
describe('#3915.decp — collectAwards : cadence partagée par SIREN, rôle titulaire, attente ≠ panne', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  function buildAwards(state: Record<string, unknown> | null, reading: unknown) {
    const announcements = createMockRepository()
    const watchState = createMockRepository()
    watchState.findOne.mockResolvedValue(state)
    const ia = { publicRegistryAwards: jest.fn().mockResolvedValue(reading) }
    const watch = new PublicRegistryWatch(announcements as never, watchState as never, ia as never)
    return { watch, ia, announcements, watchState }
  }

  it('relu il y a moins de 30 jours (n’importe quel espace) : AUCUN appel à la source', async () => {
    const { watch, ia, watchState } = buildAwards(
      { siren: '403355726', awards_checked_at: new Date('2026-09-20T08:00:00Z') },
      { failed: false, awards: [] },
    )
    expect(await watch.collectAwards('403355726', 'Mairie X', NOW)).toEqual({
      firstPass: false,
      failed: false,
      written: 0,
    })
    expect(ia.publicRegistryAwards).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })

  it('au-delà de la cadence, la source est relue', async () => {
    const { watch, ia } = buildAwards(
      { siren: '403355726', awards_checked_at: new Date('2026-09-01T08:00:00Z') },
      { failed: false, awards: [] },
    )
    await watch.collectAwards('403355726', 'Mairie X', NOW)
    expect(ia.publicRegistryAwards).toHaveBeenCalledTimes(1)
  })

  it('la cadence se règle à UN endroit (PUBLIC_AWARDS_REFRESH_DAYS)', async () => {
    process.env['PUBLIC_AWARDS_REFRESH_DAYS'] = '7'
    const { watch, ia } = buildAwards(
      { siren: '403355726', awards_checked_at: new Date('2026-09-20T08:00:00Z') },
      { failed: false, awards: [] },
    )
    await watch.collectAwards('403355726', 'Mairie X', NOW)
    expect(ia.publicRegistryAwards).toHaveBeenCalledTimes(1)
    expect(publicAwardsRefreshDays()).toBe(7)
    process.env['PUBLIC_AWARDS_REFRESH_DAYS'] = 'n’importe quoi'
    expect(publicAwardsRefreshDays()).toBe(30)
  })

  it('le compte TITULAIRE : genre `award_won`, la partie d’en face est l’acheteur', async () => {
    const { watch, announcements } = buildAwards(null, {
      failed: false,
      awards: [
        {
          ref: 'r1',
          date: '2026-09-01',
          label: 'Expertise DATA-IA',
          role: 'titulaire',
          winner: null,
          buyer: 'Ministère',
          url: null,
        },
      ],
    })
    await watch.collectAwards('428677124', 'Thales', NOW)
    const [, params] = announcements.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual([
      '428677124',
      'decp',
      'r1',
      'award_won',
      'Expertise DATA-IA',
      'Ministère',
      '2026-09-01',
      null,
    ])
  })

  it('l’attente de notre limiteur n’est PAS une panne : rien d’écrit, curseur inchangé, pas `failed`', async () => {
    const { watch, announcements, watchState } = buildAwards(null, { failed: false, deferred: true, awards: [] })
    expect(await watch.collectAwards('403355726', 'Mairie X', NOW)).toEqual({
      firstPass: true,
      failed: false,
      written: 0,
    })
    expect(announcements.query).not.toHaveBeenCalled()
    expect(watchState.upsert).not.toHaveBeenCalled()
  })
})
