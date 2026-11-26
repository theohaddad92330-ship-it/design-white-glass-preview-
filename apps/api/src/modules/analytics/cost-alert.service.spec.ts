import { CostAlertService } from './cost-alert.service'

/**
 * Le passage quotidien de coûts, vu du dehors.
 *
 * Trois choses y sont défendues, et les trois disent la même :
 *
 * 1. **Un total qui laisse des lignes de côté est un PLANCHER, et il le dit.**
 *    Le contexte le savait déjà (`unpricedLines`) ; le MESSAGE, celui qu'un
 *    humain lit dans Sentry, ne le disait pas. Un total partiel affiché sans le
 *    dire est plus dangereux qu'une absence : celui qui le lit décide dessus.
 * 2. **L'écart entre le poids d'un crédit et son coût réel devient une alerte.**
 *    « Un enrichissement coûte 0,41 € du crédit contre 0,06 € pour un export :
 *    la grille ne reflète pas le coût réel, et c'est exploitable. » Un écart de
 *    ce genre se creuse en silence et se découvre sur une facture.
 * 3. **Le coût qui ne débite AUCUN crédit se mesure à part.** Le copilote est
 *    gratuit par décision produit ; s'il devient l'essentiel de la facture, le
 *    prix d'un crédit ne dit plus rien du coût du service.
 *
 * Aucun second cron : tout se branche sur le passage qui existe déjà, sous le
 * seul interrupteur `COST_ALERT_DAILY_USD`.
 */

type LoggedError = { message: string; meta: Record<string, unknown> }
type CostRow = { environment?: string | null }

function setup(rows: CostRow[], ledgerRows: unknown[] = []) {
  const costs = {
    // Simule le VRAI comportement de Postgres plutôt que de rendre `rows` tel
    // quel : un mock qui ignore `where` prouverait que le service ENVOIE le
    // bon filtre, jamais qu'il ne LIT que ce que Postgres aurait filtré — et
    // c'est exactement cette confusion qui a laissé passer le défaut n6.
    find: jest.fn().mockImplementation((options: { where?: { environment?: string } } = {}) => {
      const wanted = options.where?.environment
      // Égalité STRICTE, jamais un COALESCE : une ligne héritée (environnement
      // NULL/absent) ne matche aucun `wanted` non nul, exactement comme
      // `environment = $2` en SQL.
      return Promise.resolve(wanted == null ? rows : rows.filter(row => row.environment === wanted))
    }),
  }
  const ledger = { find: jest.fn().mockResolvedValue(ledgerRows) }
  // ⚠️ Positionnel : (costs, locks, observability, ledger). Le registre de
  // crédits a été ajouté EN DERNIER pour ne pas décaler `locks` — un `undefined`
  // passé pour un verrou ne lève pas, il rend le test silencieusement faux.
  const service = new CostAlertService(costs as never, undefined, undefined, ledger as never)
  const logged: LoggedError[] = []
  jest
    .spyOn(service['logger'], 'error')
    .mockImplementation((message: unknown, meta?: unknown) =>
      logged.push({ message: String(message), meta: (meta ?? {}) as Record<string, unknown> }),
    )
  return { service, logged, costs, ledger }
}

const cost = (
  over: Partial<{
    workspace_id: string | null
    cost_usd: string | null
    provider: string
    feature: string
    environment: string | null
  }>,
) => ({
  workspace_id: 'ws1',
  cost_usd: '1',
  provider: 'anthropic',
  feature: 'analysis',
  // Par défaut une ligne de PRODUCTION : les tests déjà écrits n'ont pas à
  // savoir que l'alerte filtre désormais par environnement.
  environment: 'production',
  ...over,
})

const debit = (over: Partial<{ resource: string; delta: number; reason: string | null }>) => ({
  resource: 'analysis_slot',
  delta: -1,
  reason: null,
  ...over,
})

describe('CostAlertService — le passage quotidien', () => {
  afterEach(() => jest.restoreAllMocks())

  describe('sans seuil déclaré', () => {
    it('ne lit RIEN — ni les coûts, ni le registre de crédits', async () => {
      delete process.env['COST_ALERT_DAILY_USD']
      const { service, costs, ledger, logged } = setup([cost({})])

      await service.runDailyCheck(new Date())

      expect(costs.find).not.toHaveBeenCalled()
      expect(ledger.find).not.toHaveBeenCalled()
      expect(logged).toEqual([])
    })
  })

  describe('le filtre d’environnement — Défaut B, n6', () => {
    it('interroge le registre filtré sur la production — jamais dev + prod additionnés', async () => {
      const { service, costs } = setup([cost({})])

      await service.check(5)

      expect(costs.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ environment: 'production' }) }),
      )
    })

    it('ne compte que la ligne de PRODUCTION — la ligne de dev et la ligne héritée (environnement inconnu) n’entrent pas', async () => {
      const { service, logged } = setup([
        cost({ cost_usd: '100', environment: 'production' }),
        cost({ cost_usd: '999', environment: 'development' }),
        // Ligne héritée, écrite avant la colonne `environment` : `null`, jamais
        // « production » par défaut.
        cost({ cost_usd: '999', environment: null }),
      ])

      await service.check(5)

      const alert = logged.find(entry => entry.message.includes('au-dessus du seuil'))
      expect(alert).toBeDefined()
      const contexts = alert?.meta['contexts'] as Record<string, Record<string, unknown>>
      // Seule la ligne de production (100 $) compte — jamais 100 + 999 + 999.
      expect(contexts['cost']?.['totalUsd']).toBe(100)
      expect(alert?.message).toContain('100')
    })
  })

  describe('le dépassement de seuil', () => {
    it('dit que le total est un PLANCHER quand des lignes ne sont pas tarifées', async () => {
      const { service, logged } = setup([cost({ cost_usd: '10' }), cost({ cost_usd: null })])

      await service.check(5)

      const alert = logged.find(entry => entry.message.includes('au-dessus du seuil'))
      expect(alert).toBeDefined()
      expect(alert?.message).toContain('plancher')
      expect(alert?.message).toContain('1')
    })

    it('n’annonce pas un plancher quand tout est tarifé', async () => {
      const { service, logged } = setup([cost({ cost_usd: '10' })])

      await service.check(5)

      const alert = logged.find(entry => entry.message.includes('au-dessus du seuil'))
      expect(alert?.message).not.toContain('plancher')
    })

    it('nomme les familles de coût FIXE que ce total ne contient pas', async () => {
      // « Le zéro est un trou, pas un fait » : aucun coût fixe n'est mesuré
      // dans le dépôt, donc tout total de coût est structurellement un
      // plancher. Le taire ferait décider sur un chiffre optimiste.
      const { service, logged } = setup([cost({ cost_usd: '10' })])

      await service.check(5)

      const alert = logged.find(entry => entry.message.includes('au-dessus du seuil'))
      const contexts = alert?.meta['contexts'] as Record<string, Record<string, unknown>> | undefined
      expect(contexts?.['cost']?.['fixedCostFamiliesNotMeasured']).toBeDefined()
      expect((contexts?.['cost']?.['fixedCostFamiliesNotMeasured'] as unknown[]).length).toBeGreaterThan(0)
    })
  })

  describe('l’écart entre le poids d’un crédit et son coût', () => {
    it('alerte quand un crédit coûte plus du double selon l’action', async () => {
      const { service, logged } = setup(
        [cost({ feature: 'analysis', cost_usd: '10' }), cost({ feature: 'enrichment', cost_usd: '40' })],
        [debit({ resource: 'analysis_slot', delta: -100 }), debit({ resource: 'enrichment_credit', delta: -10 })],
      )

      // Seuil très haut : SEULE l'alerte d'écart doit partir.
      await service.check(10_000)

      const alert = logged.find(entry => entry.message.includes('poids d’un crédit'))
      expect(alert).toBeDefined()
      const contexts = alert?.meta['contexts'] as Record<string, Record<string, unknown>>
      expect(contexts['creditCost']?.['ratio']).toBe(40)
      expect(contexts['creditCost']?.['dearest']).toBe('enrichment')
    })

    it('se tait quand l’écart reste sous le seuil', async () => {
      const { service, logged } = setup(
        [cost({ feature: 'analysis', cost_usd: '10' }), cost({ feature: 'enrichment', cost_usd: '10' })],
        [debit({ resource: 'analysis_slot', delta: -10 }), debit({ resource: 'enrichment_credit', delta: -10 })],
      )

      await service.check(10_000)

      expect(logged.find(entry => entry.message.includes('poids d’un crédit'))).toBeUndefined()
    })

    it('se tait quand l’écart n’est pas MESURABLE — le silence n’est pas un verdict', async () => {
      // Une seule famille mesurable : rendre « rapport 1 » dirait « tout va
      // bien » là où la bonne réponse est « on ne sait pas ». On ne dit rien,
      // et surtout on n'alerte pas à tort.
      const { service, logged } = setup(
        [cost({ feature: 'analysis', cost_usd: '10' })],
        [debit({ resource: 'analysis_slot', delta: -10 })],
      )

      await service.check(10_000)

      expect(logged.find(entry => entry.message.includes('poids d’un crédit'))).toBeUndefined()
    })
  })

  describe('le coût qui ne débite aucun crédit', () => {
    it('alerte quand il devient la majorité de la dépense', async () => {
      const { service, logged } = setup(
        [cost({ feature: 'analysis', cost_usd: '1' }), cost({ feature: 'chat', cost_usd: '9' })],
        [debit({ resource: 'analysis_slot', delta: -8 })],
      )

      await service.check(10_000)

      const alert = logged.find(entry => entry.message.includes('ne débite aucun crédit'))
      expect(alert).toBeDefined()
      const contexts = alert?.meta['contexts'] as Record<string, Record<string, unknown>>
      expect(contexts['creditCost']?.['uncreditedShare']).toBeCloseTo(0.9, 6)
    })

    it('ne dit rien quand aucune dépense n’est mesurée — 0 % serait un mensonge', async () => {
      const { service, logged } = setup([], [])

      await service.check(10_000)

      expect(logged).toEqual([])
    })
  })

  // #3223 (intégration G 11/10) — l'échantillon du juge « recommandation générique »
  // tourne SOUS LE MÊME VERROU que le passage du matin, et AVANT les alertes qui le
  // lisent : un second `@Cron` aurait demandé un second verrou (et un import de
  // service inter-modules de plus, GA-07).
  describe('l’échantillon du juge, sous le même verrou', () => {
    // `runMorningAlerts` est privé : on l'atteint par une vue typée, sans `any`.
    const morningOf = (service: CostAlertService) =>
      service as unknown as { runMorningAlerts: (now: Date) => Promise<void> }

    it('est tiré AVANT les alertes du matin', async () => {
      delete process.env['COST_ALERT_DAILY_USD']
      const order: string[] = []
      const judge = { runNightly: jest.fn(async () => void order.push('judge')) }
      const costs = { find: jest.fn().mockResolvedValue([]) }
      const service = new CostAlertService(costs as never, undefined, undefined, undefined, judge as never)
      jest.spyOn(morningOf(service), 'runMorningAlerts').mockImplementation(async () => void order.push('alerts'))
      const now = new Date('2026-10-12T05:05:00Z')

      await service.runDailyCheck(now)

      expect(judge.runNightly).toHaveBeenCalledWith(now)
      expect(order).toEqual(['judge', 'alerts'])
    })

    it('sans juge câblé, le passage du matin tourne seul', async () => {
      const { service } = setup([])
      const morning = jest.spyOn(morningOf(service), 'runMorningAlerts').mockResolvedValue(undefined)

      await service.runDailyCheck(new Date())

      expect(morning).toHaveBeenCalledTimes(1)
    })
  })
})
