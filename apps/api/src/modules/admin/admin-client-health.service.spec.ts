import { AdminClientHealthService, type AdminClientRow } from './admin-client-health.service'
import type { ClientPlanGrids } from './client-health-tokens'

/**
 * Ce que le SERVICE décide, par-dessus le calcul pur (#1652).
 *
 * `client-health.spec.ts` garde le score ; celui-ci garde la LECTURE : d'où
 * vient chaque axe, et surtout dans quels cas on refuse de mesurer plutôt que
 * d'écrire un zéro. C'est là que se cache le mensonge le plus facile de cet
 * écran — `user_actions.workspace_id` et `analysis_runs.workspace_id` sont
 * NULLABLES, donc « aucune ligne » ne veut pas dire « rien fait ».
 */

const MAINTENANT = new Date('2026-09-07T12:00:00Z')

function ilYA(jours: number): Date {
  return new Date(MAINTENANT.getTime() - jours * 86_400_000)
}

const GRILLES: ClientPlanGrids = {
  priceCents: { growth: 19900, beta: 0, team: 49900 },
  seatCents: { growth: 5900, beta: 0, team: 9900 },
  seats: { growth: 1, beta: 3, team: 5 },
  labels: { growth: 'Growth', beta: 'Beta', team: 'Entreprise' },
}

type QbResult = { rawMany?: unknown[]; rawOne?: unknown; many?: unknown[]; count?: number }

/** Un query-builder chaînable : chaque méthode se rend elle-même. */
function qb(result: QbResult): unknown {
  const self: Record<string, unknown> = {}
  for (const nom of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'groupBy',
    'limit',
    'offset',
    'setParameter',
    'clone',
  ]) {
    self[nom] = (): unknown => self
  }
  self['getRawMany'] = async (): Promise<unknown[]> => result.rawMany ?? []
  self['getRawOne'] = async (): Promise<unknown> => result.rawOne ?? null
  self['getMany'] = async (): Promise<unknown[]> => result.many ?? []
  self['getCount'] = async (): Promise<number> => result.count ?? result.many?.length ?? 0
  return self
}

function repo(result: QbResult = {}, find: unknown[] = []): never {
  return {
    createQueryBuilder: (): unknown => qb(result),
    find: async (): Promise<unknown[]> => find,
  } as never
}

const ESPACE = {
  id: 'w1',
  name: 'Abricot Labs',
  owner_user_id: 'u-owner',
  created_at: ilYA(200),
}

/** La FORME est annotée : sans elle, `billing_mode` se fige à `'stripe'` et le
 *  cas « client sur facture » ne compilerait pas. */
type Abonnement = {
  user_id: string
  plan: string
  accounts_limit: number
  accounts_used: number
  topup_analyses: number
  rollover_credits: number
  rollover_expires_at: Date | null
  extra_seats: number
  billing_mode: 'stripe' | 'manual'
}

const ABONNEMENT: Abonnement = {
  user_id: 'u-owner',
  plan: 'growth',
  accounts_limit: 250,
  accounts_used: 100,
  topup_analyses: 0,
  rollover_credits: 0,
  rollover_expires_at: null,
  extra_seats: 0,
  billing_mode: 'stripe',
}

/** Monte le service avec des dépôts en carton, et rend la ligne unique. */
async function ligne(over: {
  workspace?: Partial<typeof ESPACE>
  sub?: Partial<Abonnement> | null
  members?: string[]
  lastSeen?: { user_id: string; last_seen_at: Date }[]
  actions?: { workspaceId: string; lastAt: Date | null; kinds: string; rows: string }[]
  catalogue?: string | null
  runs?: { workspaceId: string; total: string; errors: string }[]
  bugs?: { userId: string; total: string }[]
  terms?: unknown[]
}): Promise<AdminClientRow> {
  const members = over.members ?? ['u-owner']
  const sub = over.sub === null ? null : { ...ABONNEMENT, ...over.sub }

  // ⚠️ Le dépôt `actions` sert DEUX requêtes : les agrégats par espace
  // (`getRawMany`) et le catalogue observé (`getRawOne`). Un seul objet répond
  // aux deux — sinon la spec testerait un montage qui n'existe pas.
  const actionsRepo = repo({
    rawMany: over.actions ?? [],
    rawOne:
      over.catalogue === undefined
        ? { kinds: '12' }
        : over.catalogue === null
          ? { kinds: '0' }
          : { kinds: over.catalogue },
  })

  const service = new AdminClientHealthService(
    repo({ many: [{ ...ESPACE, ...over.workspace }], count: 1 }),
    repo({ rawMany: members.map(userId => ({ workspaceId: 'w1', userId })) }),
    repo({}, sub ? [sub] : []),
    repo({}, [{ user_id: 'u-owner', email: 'owner@abricot.test' }]),
    repo({}, over.terms ?? []),
    actionsRepo,
    repo({}, over.lastSeen ?? []),
    repo({ rawMany: over.runs ?? [] }),
    repo({ rawMany: over.bugs ?? [] }),
    async () => GRILLES,
  )

  const rapport = await service.list({ now: MAINTENANT })
  const [premiere] = rapport.rows
  if (!premiere) throw new Error('aucune ligne rendue')
  return premiere
}

describe('le MRR d’un espace', () => {
  it('vaut le prix du palier plus les sièges supplémentaires', async () => {
    const row = await ligne({ sub: { plan: 'growth', extra_seats: 2 } })
    expect(row.mrrCents).toBe(19900 + 2 * 5900)
    expect(row.planLabel).toBe('Growth')
  })

  it('est `null` pour un client SUR FACTURE — un contrat facturé n’est pas du MRR', async () => {
    const row = await ligne({
      sub: { billing_mode: 'manual' },
      terms: [{ workspace_id: 'w1', amount_cents: 240000, period: 'yearly' }],
    })
    expect(row.mrrCents).toBeNull()
    // Et son montant négocié voyage à CÔTÉ, sous son vrai nom.
    expect(row.billing).toEqual({ mode: 'manual', contractedCents: 240000, period: 'yearly' })
  })

  it('est `null` quand le palier n’est pas dans la grille — on ne devine pas un prix', async () => {
    const row = await ligne({ sub: { plan: 'palier-inconnu' } })
    expect(row.mrrCents).toBeNull()
    // Le libellé retombe sur la clé plutôt que d'inventer un nom.
    expect(row.planLabel).toBe('palier-inconnu')
  })

  it('vaut ZÉRO — mesuré — sur un palier gratuit', async () => {
    // Ici zéro est VRAI : l'abonnement existe et ne rapporte rien.
    const row = await ligne({ sub: { plan: 'beta' } })
    expect(row.mrrCents).toBe(0)
  })

  it('est `null` sans abonnement du tout, et le palier aussi', async () => {
    const row = await ligne({ sub: null })
    expect(row.mrrCents).toBeNull()
    expect(row.plan).toBeNull()
    expect(row.billing.mode).toBe('unknown')
  })
})

describe('les sièges et les crédits viennent de l’abonnement du propriétaire', () => {
  it('sièges payés = sièges du palier + sièges supplémentaires', async () => {
    const row = await ligne({ sub: { plan: 'team', extra_seats: 3 } })
    expect(row.seats).toBe(5 + 3)
  })

  it('l’allocation de crédits inclut les recharges, et le report seulement s’il est VALIDE', async () => {
    const perime = await ligne({
      sub: { accounts_limit: 250, topup_analyses: 50, rollover_credits: 30, rollover_expires_at: ilYA(1) },
    })
    expect(perime.creditsAllowance).toBe(300)

    const valide = await ligne({
      sub: {
        accounts_limit: 250,
        topup_analyses: 50,
        rollover_credits: 30,
        rollover_expires_at: new Date(MAINTENANT.getTime() + 86_400_000),
      },
    })
    expect(valide.creditsAllowance).toBe(330)
  })

  it('sans abonnement, sièges et crédits sont `null` — et les deux axes SORTENT', async () => {
    const row = await ligne({ sub: null })
    expect(row.seats).toBeNull()
    expect(row.creditsAllowance).toBeNull()
    expect(row.creditsUsed).toBeNull()
    const axes = new Map(row.health.axes.map(axe => [axe.key, axe]))
    expect(axes.get('credits')?.ratio).toBeNull()
    expect(axes.get('sieges')?.ratio).toBeNull()
  })
})

describe('l’adoption : « aucune ligne estampillée » n’est PAS « zéro fonction utilisée »', () => {
  it('un espace sans aucune ligne dans user_actions sort de l’axe adoption', async () => {
    // ⚠️ `user_actions.workspace_id` est NULLABLE : un espace sans ligne peut
    // simplement ne pas être estampillé. Lui coller 0 inventerait un fait.
    const row = await ligne({ actions: [] })
    const adoption = row.health.axes.find(axe => axe.key === 'adoption')
    expect(adoption?.ratio).toBeNull()
    expect(adoption?.unmeasured).toContain('instrumenté')
  })

  it('un espace qui A des lignes mais aucune dans la fenêtre est mesuré à ZÉRO', async () => {
    const row = await ligne({
      actions: [{ workspaceId: 'w1', lastAt: ilYA(200), kinds: '0', rows: '40' }],
    })
    const adoption = row.health.axes.find(axe => axe.key === 'adoption')
    expect(adoption?.ratio).toBe(0)
    expect(adoption?.detail).toBe('0 fonctions utilisées sur 12 observées')
  })

  it('se rapporte au catalogue OBSERVÉ, pas à une liste écrite à la main', async () => {
    const row = await ligne({
      actions: [{ workspaceId: 'w1', lastAt: ilYA(1), kinds: '6', rows: '400' }],
      catalogue: '12',
    })
    expect(row.health.axes.find(axe => axe.key === 'adoption')?.ratio).toBe(0.5)
  })

  it('un catalogue vide fait SORTIR l’axe pour tout le monde, plutôt que de noter sur zéro', async () => {
    const row = await ligne({
      actions: [{ workspaceId: 'w1', lastAt: ilYA(1), kinds: '6', rows: '400' }],
      catalogue: null,
    })
    expect(row.health.axes.find(axe => axe.key === 'adoption')?.ratio).toBeNull()
  })
})

describe('l’activité prend le plus récent de deux traces partielles', () => {
  it('une connexion plus fraîche que le dernier geste gagne', async () => {
    const row = await ligne({
      actions: [{ workspaceId: 'w1', lastAt: ilYA(40), kinds: '3', rows: '80' }],
      lastSeen: [{ user_id: 'u-owner', last_seen_at: ilYA(2) }],
    })
    expect(row.lastActivityAt).toBe(ilYA(2).toISOString())
    expect(row.health.axes[0]?.ratio).toBe(1)
  })

  it('sans aucune des deux, l’axe sort — il ne vaut pas « trente jours »', async () => {
    const row = await ligne({ actions: [], lastSeen: [] })
    expect(row.lastActivityAt).toBeNull()
    expect(row.health.axes[0]?.ratio).toBeNull()
    expect(row.health.axes[0]?.unmeasured).toContain('aucun geste')
  })
})

describe('les membres actifs', () => {
  it('comptent ceux vus dans les trente derniers jours', async () => {
    const row = await ligne({
      members: ['u-owner', 'u-b', 'u-c'],
      lastSeen: [
        { user_id: 'u-owner', last_seen_at: ilYA(2) },
        { user_id: 'u-b', last_seen_at: ilYA(10) },
        { user_id: 'u-c', last_seen_at: ilYA(90) },
      ],
    })
    expect(row.memberCount).toBe(3)
    expect(row.activeMembers).toBe(2)
  })

  it('sont `null` quand AUCUNE connexion n’est connue — pas zéro', async () => {
    const row = await ligne({ members: ['u-owner', 'u-b'], lastSeen: [] })
    expect(row.memberCount).toBe(2)
    expect(row.activeMembers).toBeNull()
  })
})

describe('les incidents : les erreurs d’analyse ET les retours des membres', () => {
  it('additionnent les analyses en erreur et les bugs signalés', async () => {
    const row = await ligne({
      members: ['u-owner', 'u-b'],
      runs: [{ workspaceId: 'w1', total: '20', errors: '2' }],
      bugs: [
        { userId: 'u-owner', total: '1' },
        { userId: 'u-b', total: '1' },
      ],
    })
    const incidents = row.health.axes.find(axe => axe.key === 'incidents')
    // 4 incidents sur 20 analyses → 1 − 0,2 = 0,8.
    expect(incidents?.ratio).toBeCloseTo(0.8, 5)
    expect(incidents?.detail).toBe('4 incidents sur 20 analyses')
  })

  it('sortent du calcul sans analyse sur la fenêtre — pas de dénominateur', async () => {
    const row = await ligne({ runs: [], bugs: [{ userId: 'u-owner', total: '3' }] })
    const incidents = row.health.axes.find(axe => axe.key === 'incidents')
    expect(incidents?.ratio).toBeNull()
    expect(incidents?.unmeasured).toContain('dénominateur')
  })
})

describe('ce que le rapport dit de lui-même', () => {
  it('nomme sa fenêtre et son catalogue — un dénominateur caché ne se vérifie pas', async () => {
    const service = new AdminClientHealthService(
      repo({ many: [], count: 0 }),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      async () => GRILLES,
    )
    const rapport = await service.list({ now: MAINTENANT })
    expect(rapport).toEqual({
      rows: [],
      total: 0,
      windowDays: 90,
      featureCatalogue: null,
      computedAt: MAINTENANT.toISOString(),
    })
  })

  it('l’adresse du propriétaire remonte telle quelle — c’est l’ÉCRAN qui la masque', async () => {
    // Le masquage est une décision d'affichage (#1670.4, `<MaskedEmail>`), pas
    // une amputation de l'API : la fiche et la révélation au clic en ont besoin.
    const row = await ligne({})
    expect(row.ownerEmail).toBe('owner@abricot.test')
  })
})
