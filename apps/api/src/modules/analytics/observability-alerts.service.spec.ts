import { ObservabilityAlertsService } from './observability-alerts.service'

/**
 * Ce que ces tests défendent : **une alerte qui n'a aucun destinataire n'est pas
 * une alerte.**
 *
 * Le calcul est testé à côté (`observability-alerts.spec.ts`). Ici on vérifie la
 * moitié qui manquait au dépôt : que le passage LIT la base, qu'il ÉMET en
 * `error` (le seul niveau capturé par Sentry), qu'il n'émet RIEN quand il n'a
 * rien pu mesurer — et qu'il le DIT alors, plutôt que de se taire comme si tout
 * allait bien.
 */

const MINUTE = 60_000
const NOW = new Date('2026-08-29T08:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

type Row = Record<string, unknown>

/** Un run terminé en une minute — le cas nominal. */
const okRun = (): Row => ({
  status: 'completed',
  created_at: ago(30 * MINUTE),
  completed_at: ago(29 * MINUTE),
  workspace_id: 'ws1',
})

/** Un run terminé en quarante minutes — bien au-delà du seuil par défaut. */
const slowRun = (): Row => ({
  status: 'completed',
  created_at: ago(50 * MINUTE),
  completed_at: ago(10 * MINUTE),
  workspace_id: 'ws1',
})

/** #2441.4 — un tour de chat répondu en cinq secondes — sous le seuil par défaut (10 s). */
const okChatTurn = (): Row => ({ user_at: ago(30 * MINUTE), assistant_at: ago(30 * MINUTE - 5_000) })

/** #2441.4 — un tour de chat répondu en douze minutes — au-delà du seuil par défaut (10 s). */
const slowChatTurn = (): Row => ({ user_at: ago(50 * MINUTE), assistant_at: ago(38 * MINUTE) })

function build(rows: {
  runs: Row[]
  judges: Row[]
  chatTurns?: Row[]
  securityEvents?: Row[]
  refundEvents?: Row[]
  leakEvents?: Row[]
  crossTenantEvents?: Row[]
  injectionEvents?: Row[]
  escalationEvents?: Row[]
  dataExportEvents?: Row[]
}) {
  const query = jest.fn(async (sql: string) =>
    sql.includes('chat_messages')
      ? (rows.chatTurns ?? [])
      : sql.includes("kind = 'data_export'")
        ? (rows.dataExportEvents ?? [])
        : sql.includes("kind = 'cross_tenant_suspected'")
          ? (rows.crossTenantEvents ?? [])
          : sql.includes("kind = 'permission_escalated'")
            ? (rows.escalationEvents ?? [])
            : sql.includes("kind = 'injection_suspected'")
              ? (rows.injectionEvents ?? [])
              : sql.includes("kind = 'leak_detected'")
                ? (rows.leakEvents ?? [])
                : sql.includes('security_events')
                  ? (rows.securityEvents ?? [])
                  : sql.includes('credit_ledger')
                    ? (rows.refundEvents ?? [])
                    : sql.includes('judge')
                      ? rows.judges
                      : rows.runs,
  )
  const service = new ObservabilityAlertsService({ query } as never)
  const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
  const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
  const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined)
  return { service, error, log, warn, query }
}

const previousDisabled = process.env['OBSERVABILITY_ALERTS_DISABLED']

afterEach(() => {
  if (previousDisabled === undefined) delete process.env['OBSERVABILITY_ALERTS_DISABLED']
  else process.env['OBSERVABILITY_ALERTS_DISABLED'] = previousDisabled
  jest.restoreAllMocks()
})

describe('ObservabilityAlertsService', () => {
  it('émet une ERREUR quand la latence dépasse le seuil — donc dans Sentry', () => {
    // `error` et pas `warn` : un `warn` ne part pas, c'est la leçon du bloc
    // agenda resté « vide » pendant des jours.
    const { service, error } = build({ runs: Array.from({ length: 20 }, slowRun), judges: [] })

    return service.check(NOW).then(() => {
      const latency = error.mock.calls.find(call => String(call[0]).includes('Latence'))
      expect(latency).toBeDefined()
      const meta = latency?.[1] as { tags: Record<string, string>; contexts: Record<string, unknown> }
      expect(meta.tags['alert.key']).toBe('latency')
      expect((meta.contexts['observability'] as { sample: number }).sample).toBe(20)
    })
  })

  it('n’émet RIEN quand tout est sous les seuils', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
    })

    await service.check(NOW)

    expect(error).not.toHaveBeenCalled()
  })

  it('#2441.4 — émet une ERREUR quand le p95 du chat dépasse 10 s', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, slowChatTurn),
    })

    await service.check(NOW)

    const chat = error.mock.calls.find(call => String(call[0]).includes('chat'))
    expect(chat).toBeDefined()
    const meta = chat?.[1] as { tags: Record<string, string>; contexts: Record<string, unknown> }
    expect(meta.tags['alert.key']).toBe('chat_latency')
    expect((meta.contexts['observability'] as { sample: number }).sample).toBe(20)
  })

  it('épopée #2879 — émet une ERREUR quand les accès refusés dépassent le seuil (20/24 h)', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      securityEvents: Array.from({ length: 21 }, () => ({ created_at: ago(10 * MINUTE) })),
    })

    await service.check(NOW)

    const denied = error.mock.calls.find(call => String(call[0]).includes('Accès refusés'))
    expect(denied).toBeDefined()
    const meta = denied?.[1] as { tags: Record<string, string>; contexts: Record<string, unknown> }
    expect(meta.tags['alert.key']).toBe('authorization_denied')
    expect((meta.contexts['observability'] as { value: number; sample: number }).value).toBe(21)
  })

  it('épopée #2879 — AUCUN accès refusé n’émet rien : zéro constaté est un zéro vrai, pas un silence suspect', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      securityEvents: [],
    })

    await service.check(NOW)

    expect(error.mock.calls.find(call => String(call[0]).includes('Accès refusés'))).toBeUndefined()
  })

  it('épopée #2879 — émet une ERREUR quand les remboursements nocturnes dépassent le seuil (20/24 h)', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      refundEvents: Array.from({ length: 21 }, () => ({ created_at: ago(10 * MINUTE) })),
    })

    await service.check(NOW)

    const refund = error.mock.calls.find(call => String(call[0]).includes('Remboursements'))
    expect(refund).toBeDefined()
    const meta = refund?.[1] as { tags: Record<string, string>; contexts: Record<string, unknown> }
    expect(meta.tags['alert.key']).toBe('abnormal_refund')
    expect((meta.contexts['observability'] as { value: number; sample: number }).value).toBe(21)
  })

  it('épopée #2879 — AUCUN remboursement n’émet rien : zéro constaté est un zéro vrai, pas un silence suspect', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      refundEvents: [],
    })

    await service.check(NOW)

    expect(error.mock.calls.find(call => String(call[0]).includes('Remboursements'))).toBeUndefined()
  })

  it('épopée #2879 — émet une ERREUR quand une fuite d’identité dépasse le seuil (défaut 1/24 h)', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      leakEvents: [{ created_at: ago(10 * MINUTE) }, { created_at: ago(20 * MINUTE) }],
    })

    await service.check(NOW)

    const leak = error.mock.calls.find(call => String(call[0]).includes('Fuites'))
    expect(leak).toBeDefined()
    const meta = leak?.[1] as { tags: Record<string, string>; contexts: Record<string, unknown> }
    expect(meta.tags['alert.key']).toBe('leak_detected')
    expect((meta.contexts['observability'] as { value: number; sample: number }).value).toBe(2)
  })

  it('épopée #2879 — AUCUNE fuite détectée n’émet rien : zéro constaté est un zéro vrai, pas un silence suspect', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      leakEvents: [],
    })

    await service.check(NOW)

    expect(error.mock.calls.find(call => String(call[0]).includes('Fuites'))).toBeUndefined()
  })

  it('épopée #2879 (#2442.14) — émet une ERREUR sur un soupçon cross-tenant et un soupçon d’injection (seuil 1)', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
      crossTenantEvents: [{ created_at: ago(10 * MINUTE) }, { created_at: ago(20 * MINUTE) }],
      injectionEvents: Array.from({ length: 6 }, (_, i) => ({ created_at: ago((5 + i) * MINUTE) })),
    })

    await service.check(NOW)

    const keys = error.mock.calls.map(
      call => (call[1] as { tags?: Record<string, string> } | undefined)?.tags?.['alert.key'],
    )
    expect(keys).toContain('cross_tenant_suspected')
    expect(keys).toContain('injection_suspected')
    const inj = error.mock.calls.find(
      call => (call[1] as { tags?: Record<string, string> })?.tags?.['alert.key'] === 'injection_suspected',
    )
    expect(
      ((inj?.[1] as { contexts: Record<string, unknown> }).contexts['observability'] as { value: number }).value,
    ).toBe(6)
  })

  describe('épopée #2879 (#2442.14) — escalade de permission (seuil 10)', () => {
    const base = () => ({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
    })
    const escalations = (n: number) => Array.from({ length: n }, (_, i) => ({ created_at: ago((5 + i) * MINUTE) }))
    const keysOf = (error: { mock: { calls: unknown[][] } }) =>
      error.mock.calls.map(call => (call[1] as { tags?: Record<string, string> } | undefined)?.tags?.['alert.key'])

    it('onze tentatives (au-delà du seuil de 10) déclenchent l’alerte', async () => {
      const { service, error } = build({ ...base(), escalationEvents: escalations(11) })
      await service.check(NOW)
      expect(keysOf(error)).toContain('permission_escalated')
    })

    it('dix tentatives (le seuil lui-même) ne la déclenchent pas', async () => {
      const { service, error } = build({ ...base(), escalationEvents: escalations(10) })
      await service.check(NOW)
      expect(keysOf(error)).not.toContain('permission_escalated')
    })
  })

  describe('épopée #2879 (#2442.14) — export massif (seuil 20 par espace)', () => {
    const base = () => ({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
    })
    const exportsOf = (workspaceId: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ created_at: ago((5 + i) * MINUTE), workspace_id: workspaceId }))
    const keysOf = (error: { mock: { calls: unknown[][] } }) =>
      error.mock.calls.map(call => (call[1] as { tags?: Record<string, string> } | undefined)?.tags?.['alert.key'])

    it('21 exports d’UN espace dans la journée déclenchent l’alerte', async () => {
      const { service, error } = build({ ...base(), dataExportEvents: exportsOf('w1', 21) })
      await service.check(NOW)
      expect(keysOf(error)).toContain('mass_export')
    })

    it('20 exports d’un espace (le seuil lui-même) ne la déclenchent pas', async () => {
      const { service, error } = build({ ...base(), dataExportEvents: exportsOf('w1', 20) })
      await service.check(NOW)
      expect(keysOf(error)).not.toContain('mass_export')
    })

    it('15 + 15 exports de DEUX espaces ne se cumulent pas : le seuil se lit par espace', async () => {
      const { service, error } = build({
        ...base(),
        dataExportEvents: [...exportsOf('w1', 15), ...exportsOf('w2', 15)],
      })
      await service.check(NOW)
      expect(keysOf(error)).not.toContain('mass_export')
    })
  })

  it('épopée #2879 (#2442.14) — zéro soupçon constaté n’émet rien', async () => {
    const { service, error } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: Array.from({ length: 20 }, () => ({ account_id: 'a', verdict: 'pass' })),
      chatTurns: Array.from({ length: 20 }, okChatTurn),
    })

    await service.check(NOW)

    const keys = error.mock.calls.map(
      call => (call[1] as { tags?: Record<string, string> } | undefined)?.tags?.['alert.key'],
    )
    expect(keys).not.toContain('cross_tenant_suspected')
    expect(keys).not.toContain('injection_suspected')
  })

  it('n’émet AUCUNE alerte de seuil sur un échantillon trop mince — et le DIT', async () => {
    // Le piège que ce test ferme : trois runs suffisent à produire un taux
    // d'erreur de 33 %, qui dépasse tous les seuils. Une alerte qui part sur
    // trois observations apprend à ignorer les alertes.
    const { service, error, log } = build({ runs: [okRun(), okRun(), slowRun()], judges: [] })

    await service.check(NOW)

    expect(error.mock.calls.filter(call => String(call[0]).includes('seuil'))).toEqual([])
    const said = log.mock.calls.map(call => String(call[0])).join(' ')
    expect(said).toContain('non mesurables')
    expect(said).toContain('sample_too_small')
  })

  it('une base illisible ne devient pas « aucune erreur, aucune lenteur »', async () => {
    const query = jest.fn(async () => {
      throw new Error('connection refused')
    })
    const service = new ObservabilityAlertsService({ query } as never)
    const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
    const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined)

    await service.check(NOW)

    expect(error.mock.calls.filter(call => String(call[0]).includes('seuil'))).toEqual([])
    expect(log.mock.calls.map(call => String(call[0])).join(' ')).toContain('no_observation')
  })

  it('un dossier SANS verdict de juge ne se compte pas comme propre', async () => {
    // 20 dossiers produits, 4 jugés dont 3 signalés, 16 sans verdict : le taux
    // est 75 % sur 4 observations — donc trop mince pour alerter, et surtout
    // pas 15 % sur 20, qui serait le chiffre si l'absence valait « pass ».
    const { service, error, log } = build({
      runs: Array.from({ length: 20 }, okRun),
      judges: [
        ...Array.from({ length: 3 }, (_, i) => ({ account_id: `f${i}`, verdict: 'flagged' })),
        { account_id: 'p', verdict: 'pass' },
        ...Array.from({ length: 16 }, (_, i) => ({ account_id: `n${i}`, verdict: null })),
      ],
    })

    await service.check(NOW)

    expect(error.mock.calls.find(call => String(call[0]).includes('juge'))).toBeUndefined()
    expect(log.mock.calls.map(call => String(call[0])).join(' ')).toContain('hallucination (sample_too_small, 4 obs.)')
  })

  it('le bris de glace arrête le passage sans rien lire', async () => {
    process.env['OBSERVABILITY_ALERTS_DISABLED'] = 'true'
    const { service, query, error } = build({ runs: Array.from({ length: 20 }, slowRun), judges: [] })

    await service.runDailyCheck(NOW)

    expect(query).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

/**
 * LA CÉCITÉ DOIT ATTEINDRE QUELQU'UN — mesuré et corrigé le 30/08/2026.
 *
 * La ligne « non mesurables » existait bel et bien, et elle PART : le test
 * ci-dessus le prouvait déjà. Ce qu'il ne disait pas, c'est **par quel canal**.
 * Elle sortait en `logger.log`, donc au niveau winston `info` ; or
 * `SentryWinstonTransport` est instancié sans options (`logger.service.ts`) et
 * vaut `level: 'error'`. Un `info` ne franchit jamais le transport.
 *
 * Conséquence exacte : sous vingt observations par jour — le cas NOMINAL d'un
 * produit jeune — les quatre alertes se taisent toutes, la ligne qui l'explique
 * n'atteint personne, et le silence redevient indiscernable de la santé. C'est
 * le défaut que ce chantier existe pour supprimer, reproduit à l'intérieur de sa
 * propre correction.
 *
 * ⚠️ #4458 (Louis, tri Sentry 22/10/2026) — renversement ASSUMÉ du canal : la
 * cécité part en `warn` (journaux Railway), plus en `error`. Elle se répétait
 * dans Sentry comme une panne alors qu'elle dit seulement le volume d'un
 * produit jeune. Elle s'annonce toujours, une fois par changement d'état.
 */
describe('la cécité des alertes s’ANNONCE, elle ne se consigne pas seulement', () => {
  /** Dix-neuf runs (et dix-neuf tours de chat) : un de moins que les vingt exigés par défaut. */
  const thin = () => ({
    runs: Array.from({ length: 19 }, okRun),
    judges: [],
    chatTurns: Array.from({ length: 19 }, okChatTurn),
  })
  const healthy = () => ({
    runs: Array.from({ length: 25 }, okRun),
    judges: Array.from({ length: 25 }, (_, i) => ({ account_id: `a${i}`, verdict: 'pass' })),
    chatTurns: Array.from({ length: 25 }, okChatTurn),
  })

  /** Rejoue un passage sur un autre échantillon, sur LE MÊME service. */
  const feed = (service: ObservabilityAlertsService, rows: { runs: Row[]; judges: Row[]; chatTurns?: Row[] }) => {
    ;(service as unknown as { runs: { query: jest.Mock } }).runs = {
      query: jest.fn(async (sql: string) =>
        sql.includes('chat_messages') ? (rows.chatTurns ?? []) : sql.includes('judge') ? rows.judges : rows.runs,
      ),
    }
  }

  const blindCalls = (spy: jest.SpyInstance) =>
    spy.mock.calls.map(call => String(call[0])).filter(message => message.includes('aveugle'))

  // #4458 (Louis, tri Sentry 22/10/2026) — un échantillon trop petit est un signal MÉTIER
  // (produit jeune), pas une panne : `warn` (journaux Railway), plus une exception Sentry.
  it('#4458 — part en warn, jamais en error (n’alimente plus Sentry)', async () => {
    const { service, error } = build(thin())

    await service.check(NOW)

    expect(blindCalls(error)).toEqual([])
  })

  it('part dans les journaux, et nomme les quatre alertes', async () => {
    const { service, warn } = build(thin())

    await service.check(NOW)

    const [alert] = blindCalls(warn)
    expect(alert).toBeDefined()
    for (const key of ['latency', 'error', 'hallucination', 'no_outcome', 'chat_latency']) expect(alert).toContain(key)
  })

  it('porte les chiffres au CONTEXTE, jamais dans le message', async () => {
    // Sentry regroupe par texte : un échantillon dans le titre créerait une
    // issue neuve et un e-mail de plus chaque matin, et l'anti-bruit se
    // retournerait en bruit.
    const { service, warn } = build(thin())

    await service.check(NOW)

    const call = warn.mock.calls.find(entry => String(entry[0]).includes('aveugle'))
    expect(call).toBeDefined()
    // Sans cette ligne, l'assertion suivante passerait sur une chaîne vide.
    expect(String(call?.[0])).not.toMatch(/\d/)
    const meta = call?.[1] as { contexts: { observability: { blind: Array<{ sample: number }> } } }
    expect(meta.contexts.observability.blind).toHaveLength(5)
    expect(meta.contexts.observability.blind[0]?.sample).toBe(19)
  })

  it('ne se répète pas tant que la cécité ne CHANGE pas', async () => {
    // Le patron déjà éprouvé par `StatusMonitorService` : une alerte identique
    // répétée tous les matins apprend à ignorer les alertes.
    const { service, warn } = build(thin())

    await service.check(NOW)
    feed(service, thin())
    await service.check(NOW)

    expect(blindCalls(warn)).toHaveLength(1)
  })

  it('se ré-arme quand la mesure redevient possible', async () => {
    // Sans ré-armement, une cécité qui revient après une accalmie ne se dirait
    // plus jamais.
    const { service, warn, log } = build(thin())

    await service.check(NOW)
    expect(blindCalls(warn)).toHaveLength(1)

    feed(service, healthy())
    await service.check(NOW)
    expect(log.mock.calls.map(call => String(call[0])).join(' ')).toContain('de nouveau toutes mesurables')

    feed(service, thin())
    await service.check(NOW)
    expect(blindCalls(warn)).toHaveLength(2)
  })

  it('ne dit rien du tout quand les quatre mesures sont possibles', async () => {
    const { service, warn, log } = build(healthy())

    await service.check(NOW)

    expect(blindCalls(warn)).toEqual([])
    expect(log.mock.calls.map(call => String(call[0])).join(' ')).not.toContain('non mesurables')
  })
})

/**
 * Le passage du matin ATTEINT les quatre alertes.
 *
 * Sans ce test, le service pourrait être parfait et n'être appelé par personne —
 * le défaut n°1 du dépôt. Le `@Cron` et le verrou vivent chez
 * {@link CostAlertService} (les cinq alertes sont un seul paquet, un seul
 * verrou) ; c'est donc là que se vérifie qu'elles partent.
 */
describe('le tick de 07:05 déclenche les quatre alertes', () => {
  it('appelle le passage d’observabilité après l’alerte de coût', async () => {
    const { CostAlertService } = await import('./cost-alert.service')
    const observability = { runDailyCheck: jest.fn(async () => undefined) }
    const costs = { find: jest.fn(async () => []) }
    const service = new CostAlertService(costs as never, undefined, observability as never)

    await service.runDailyCheck(NOW)

    expect(observability.runDailyCheck).toHaveBeenCalledWith(NOW)
  })

  it('tourne même SANS seuil de coût — les quatre autres alertes ont un défaut', async () => {
    // Le piège que ce test ferme : l'ancien `runDailyCheck` sortait avant tout
    // quand `COST_ALERT_DAILY_USD` était absent. Y greffer les quatre autres
    // sans déplacer ce retour les aurait rendues muettes en production, où le
    // seuil de coût n'est pas posé.
    const previous = process.env['COST_ALERT_DAILY_USD']
    delete process.env['COST_ALERT_DAILY_USD']
    try {
      const { CostAlertService } = await import('./cost-alert.service')
      const observability = { runDailyCheck: jest.fn(async () => undefined) }
      const costs = { find: jest.fn(async () => []) }
      const service = new CostAlertService(costs as never, undefined, observability as never)

      await service.runDailyCheck(NOW)

      expect(costs.find).not.toHaveBeenCalled()
      expect(observability.runDailyCheck).toHaveBeenCalledWith(NOW)
    } finally {
      if (previous !== undefined) process.env['COST_ALERT_DAILY_USD'] = previous
    }
  })
})
