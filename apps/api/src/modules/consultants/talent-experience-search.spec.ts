import { TalentService } from './talent.service'

/**
 * #3889.1 (lot I02) — « qui a travaillé chez <compte> ? » : une expérience
 * déclarée dans un CV AUTORISÉ est retrouvée sans qu'une affectation de
 * mission Bellum existe. Le critère sait dire NON : consentement absent ou
 * expiré, client masqué, fiche archivée — rien de tout ça ne sort.
 */
const WS = 'ws-1'
const NOW = new Date('2026-10-09T10:00:00.000Z')

const consultant = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  workspace_id: WS,
  full_name: `Nom ${id}`,
  title: 'Data engineer',
  consent_given_at: new Date('2026-01-01T00:00:00.000Z'),
  consent_expires_at: null,
  archived_at: null,
  ...over,
})
const experience = (consultant_id: string, over: Record<string, unknown> = {}) => ({
  id: `e-${consultant_id}`,
  consultant_id,
  workspace_id: WS,
  entreprise: 'Capgemini',
  client_final: 'Sanofi',
  client_masked: false,
  role: 'Data engineer',
  date_debut: '2023-01-01',
  date_fin: '2024-06-30',
  ...over,
})

function make(experiences: unknown[], consultants: unknown[]) {
  // La base applique les filtres de la requête : le double les rejoue (masqué exclu, archivé exclu).
  const exp = {
    find: jest.fn(async () => (experiences as { client_masked: boolean }[]).filter(row => row.client_masked === false)),
  }
  const cons = {
    find: jest.fn(async () => (consultants as { archived_at: Date | null }[]).filter(row => row.archived_at === null)),
  }
  const service = new TalentService(
    cons as never,
    {} as never,
    exp as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { service, exp, cons }
}

describe('TalentService.findByExperienceClient (#3889.1)', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW))
  afterEach(() => jest.useRealTimers())

  it('retrouve un consultant dont un CV autorisé déclare une expérience chez le compte', async () => {
    const { service } = make([experience('c1')], [consultant('c1')])
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.total).toBe(1)
    expect(out.items[0]).toMatchObject({ consultantId: 'c1', fullName: 'Nom c1' })
    expect(out.items[0]?.experiences[0]).toMatchObject({ client: 'Sanofi', role: 'Data engineer' })
  })

  it('sait dire NON : consentement absent ou expiré → absent du résultat', async () => {
    const noConsent = consultant('c2', { consent_given_at: null })
    const expired = consultant('c3', { consent_expires_at: new Date('2026-06-01T00:00:00.000Z') })
    const { service } = make([experience('c2'), experience('c3')], [noConsent, expired])
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.total).toBe(0)
    expect(out.items).toEqual([])
  })

  it('sait dire NON : un client masqué ne sort jamais, une fiche archivée non plus', async () => {
    const { service } = make(
      [experience('c4', { client_masked: true }), experience('c5')],
      [consultant('c4'), consultant('c5', { archived_at: new Date('2026-05-01T00:00:00.000Z') })],
    )
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.total).toBe(0)
  })

  it('un nom vide ne cherche rien (jamais « tout le vivier »)', async () => {
    const { service, exp } = make([experience('c1')], [consultant('c1')])
    const out = await service.findByExperienceClient(WS, '   ')
    expect(out).toEqual({ items: [], total: 0, withheldForConsent: 0 })
    expect(exp.find).not.toHaveBeenCalled()
  })

  it('regroupe plusieurs expériences d’un même consultant en une seule ligne', async () => {
    const { service } = make(
      [experience('c1'), { ...experience('c1'), id: 'e2', role: 'Architecte data' }],
      [consultant('c1')],
    )
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.total).toBe(1)
    expect(out.items[0]?.experiences).toHaveLength(2)
  })

  // #3889.3 (lot M13, 09/10) — « un projet documentaire conserve sa nature et sa source ».
  it('#3889.3 — un projet décrit dans le CV garde sa nature, sa période et sa preuve', async () => {
    const row = experience('c1', {
      contexte: 'Programme « Data Lake R&D » — migration des pipelines cliniques',
      preuve: 'Sanofi (via Capgemini) — Data engineer, 2023-2024 : programme Data Lake R&D',
    })
    const { service } = make([row], [consultant('c1')])
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.items[0]?.experiences[0]).toEqual({
      client: 'Sanofi',
      role: 'Data engineer',
      from: '2023-01-01',
      to: '2024-06-30',
      project: 'Programme « Data Lake R&D » — migration des pipelines cliniques',
      nature: 'cv_experience',
      source: 'Sanofi (via Capgemini) — Data engineer, 2023-2024 : programme Data Lake R&D',
    })
  })

  // #3935 (lot P03, décision Louis 09/10) — une date gardée à l'ANNÉE sort à
  // l'année (« 2019 ») : Laura ne lit jamais « 2019-01-01 », un janvier inventé.
  it('#3935 — une période lue à l’année sort à l’année, jamais un 1er janvier', async () => {
    const row = experience('c1', {
      date_debut: '2019-01-01',
      date_debut_precision: 'year',
      date_fin: '2021-03-01',
      date_fin_precision: 'month',
    })
    const { service } = make([row], [consultant('c1')])
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.items[0]?.experiences[0]).toMatchObject({ from: '2019', to: '2021-03' })
  })

  it('#3889.3 — sait dire NON : sans projet ni preuve écrits, rien n’est inventé (null, jamais « »)', async () => {
    const row = experience('c1', { contexte: '   ', preuve: null })
    const { service } = make([row], [consultant('c1')])
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.items[0]?.experiences[0]).toMatchObject({ project: null, source: null, nature: 'cv_experience' })
  })

  // #4287.8 (recette prod 19/10) — « aucun consultant avec une expérience déclarée chez Sanofi » : le vide muet ne dit pas
  // POURQUOI. Les fiches écartées faute de consentement se COMPTENT (jamais se nomment) : Laura peut dire l'écart.
  it('#4287.8 — compte, sans les nommer, les CV écartés faute de consentement', async () => {
    const noConsent = consultant('c2', { consent_given_at: null })
    const expired = consultant('c3', { consent_expires_at: new Date('2026-06-01T00:00:00.000Z') })
    const { service } = make(
      [experience('c1'), experience('c2'), experience('c3')],
      [consultant('c1'), noConsent, expired],
    )
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.total).toBe(1)
    expect(out.withheldForConsent).toBe(2)
    expect(JSON.stringify(out)).not.toContain('Nom c2')
    expect(JSON.stringify(out)).not.toContain('Nom c3')
  })

  it('#4287.8 — un client masqué ou une fiche archivée ne se compte jamais (rien ne fuit)', async () => {
    const { service } = make(
      [experience('c4', { client_masked: true }), experience('c5')],
      [consultant('c4'), consultant('c5', { archived_at: new Date('2026-05-01T00:00:00.000Z') })],
    )
    const out = await service.findByExperienceClient(WS, 'Sanofi')
    expect(out.withheldForConsent).toBe(0)
  })
})
