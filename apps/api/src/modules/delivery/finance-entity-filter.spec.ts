import { FinanceController } from './finance.controller'
import { MissionScoresService } from './mission-scores.service'
import { RevenueService } from './revenue.service'

/**
 * LE FILTRE PAR SOCIÉTÉ — celui qui filtre vraiment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tableau de bord Finance a été livré le 31/08/2026 avec son sélecteur de
 * société DÉSACTIVÉ, et la raison écrite : « aucune des six lectures
 * financières ne prend de société en paramètre ». `missions.legal_entity_id`
 * existait depuis des semaines et n'était lu par personne — le défaut n°1 du
 * dépôt, du code juste que personne n'appelle.
 *
 * Le risque est ASYMÉTRIQUE, et c'est lui qui porte les tests : une lecture qui
 * OUBLIE la société rend un chiffre PLUS GROS, qui a l'air juste. Personne ne le
 * remarque en réunion. C'est pourquoi chaque lecture filtrable est vérifiée une
 * par une, et pourquoi les trois lectures aveugles sont vérifiées comme telles :
 * un jour où l'une d'elles deviendrait filtrable en silence, le total d'une
 * société changerait sans que personne n'ait décidé.
 *
 * ⚠️ La forme du SQL, elle, se teste dans le contrat (`legal-entity.test.ts`) —
 * ici on vérifie le VOYAGE : la route reçoit la société, chaque lecture la
 * reçoit à son tour, et celles qui ne peuvent pas la recevoir n'en voient rien.
 */
function build() {
  const breakdown = jest.fn().mockResolvedValue({ periodMonth: '2026-07-01', lines: [] })
  const aggregate = jest.fn().mockResolvedValue({ marginPercent: null, measured: 0, unmeasured: 0 })
  const marginAlerts = jest.fn().mockResolvedValue({ measured: true, threshold: null, items: [] })
  const scopeInfo = jest.fn().mockResolvedValue({ kind: 'workspace', outsideAnyPortfolio: null })
  const marginByChannel = jest.fn().mockResolvedValue({ periodMonth: '2026-07-01', byChannel: [] })
  const dso = jest.fn().mockResolvedValue({ days: null })
  const revenue = { breakdown, aggregate, marginAlerts, scopeInfo, marginByChannel, dso } as never

  const forecast = jest.fn().mockResolvedValue({ months: [], lines: [] })
  const contractedMargin = jest
    .fn()
    .mockResolvedValue({ marginPercent: null, measured: 0, unmeasured: 0, measurability: null })
  const capacity = jest.fn().mockResolvedValue({})
  const scores = { forecast, capacity, contractedMargin } as never

  const workspaceContext = {
    // `owner` : la portée de l'ESPACE, pour que le seul resserrement observé
    // dans ces tests soit celui de la SOCIÉTÉ.
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  } as never

  const propagation = { financeDigest: jest.fn().mockResolvedValue({ accounts: [], consultants: [] }) } as never

  const horizons = { compute: jest.fn() } as never

  const controller = new FinanceController(revenue, scores, propagation, workspaceContext, horizons)
  return { controller, breakdown, aggregate, marginAlerts, marginByChannel, forecast, contractedMargin, capacity, dso }
}

const USER = { userId: 'u-1' } as never
const ACME = '99999999-9999-4999-8999-999999999999'

describe('le filtre par société traverse les lectures financières', () => {
  it('les quatre chiffres d’affaires reçoivent la société', async () => {
    const { controller, breakdown } = build()
    await controller.revenueBreakdown(USER, '2026-07', undefined, ACME)
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', ACME)
  })

  it('la marge d’espace ET ses alertes reçoivent la MÊME société', async () => {
    // Une alerte tirée sur l'espace entier sous un agrégat filtré enverrait un
    // responsable renégocier le TJM d'une mission d'une AUTRE société.
    const { controller, aggregate, marginAlerts } = build()
    await controller.margin(USER, '2026-07', undefined, ACME)
    expect(aggregate).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', ACME)
    expect(marginAlerts).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, ACME)
  })

  it('la marge par canal reçoit la société', async () => {
    const { controller, marginByChannel } = build()
    await controller.marginChannels(USER, '2026-07', ACME)
    expect(marginByChannel).toHaveBeenCalledWith('ws-1', '2026-07', ACME)
  })

  it('le prévisionnel reçoit la société', async () => {
    const { controller, forecast } = build()
    await controller.forecast(USER, '3', undefined, ACME)
    expect(forecast).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, 3, ACME)
  })

  it('une société ILLISIBLE ne filtre rien plutôt que de refuser', async () => {
    // Même règle que sur la portée : un lien collé de travers doit montrer
    // quelque chose. Ce qui protège du mensonge, c'est que « toutes les
    // sociétés » est le défaut — jamais une société devinée.
    const { controller, breakdown } = build()
    await controller.revenueBreakdown(USER, '2026-07', undefined, 'pas-un-uuid')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
  })

  it('sans société demandée, les lectures reçoivent `null` — pas `undefined`', async () => {
    // Un `undefined` qui traverse trois couches finit par être lu comme « pas
    // de paramètre » à un endroit et « paramètre absent de la requête » à un
    // autre. Une seule valeur pour « toutes les sociétés ».
    const { controller, breakdown } = build()
    await controller.revenueBreakdown(USER, '2026-07')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
  })
})

describe('les trois lectures que la société ne gouverne PAS', () => {
  it('la capacité ne reçoit AUCUNE société — elle décrit l’ÉQUIPE', async () => {
    // Un consultant n'est rattaché à aucune société de l'ESN. Lui en inventer
    // une pour les besoins d'un filtre produirait une capacité fausse.
    const { controller, capacity } = build()
    await controller.capacity(USER, '2026-07')
    expect(capacity).toHaveBeenCalledWith('ws-1', '2026-07')
  })

  it('le délai de paiement ne reçoit AUCUNE société — c’est une médiane à plancher', async () => {
    const { controller, dso } = build()
    await controller.dso(USER)
    expect(dso).toHaveBeenCalledWith('ws-1')
  })
})

describe('la marge du prévisionnel CONTRACTUALISÉ', () => {
  it('voyage avec le prévisionnel, sur la même portée et la même société', async () => {
    const { controller, contractedMargin } = build()
    const response = await controller.forecast(USER, '3', undefined, ACME)
    expect(contractedMargin).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, 3, ACME)
    // Elle est SERVIE à côté des trois lignes, jamais fondue dedans : une
    // quatrième ligne de prévisionnel se lirait comme un quatrième montant.
    expect(response).toHaveProperty('contractedMargin')
  })
})
