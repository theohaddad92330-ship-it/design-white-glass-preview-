import { NEED_OPEN_STATUSES, RUNNING_MISSION_STATUSES } from '@bellum/contracts'
import { DEMO_FORECAST_HORIZONS_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_FLAGSHIP_NEED, demoInvoiceHistory } from './demo-dataset'

/**
 * #2425 — LA PARITÉ DÉMO DU PRÉVISIONNEL PAR HORIZON (craft rule n°9).
 *
 * Le bloc n'ajoute AUCUNE table : `ForecastHorizonsService` lit des tables
 * déjà semées (`missions`, `opportunities`, `invoice_readiness`,
 * `project_needs`). `demo-coverage.spec.ts` resterait donc vert même si le
 * semis ne portait AUCUN des cas qui remplissent le bloc — et la salle verrait
 * sept composantes « Non mesuré » et zéro décision.
 *
 * Cette garde vérifie les INGRÉDIENTS, lus dans le semis lui-même : retirer le
 * statut `bloque` ou la facture contestée du jeu de démonstration la fait
 * rougir, en nommant le cas manquant.
 */
describe('#2425 — la démo remplit le prévisionnel par horizon', () => {
  const running = new Set<string>(RUNNING_MISSION_STATUSES)
  const missions = DEMO_DELIVERY_CLIENT.missions as ReadonlyArray<{
    status: string
    renewal_status?: string | null
    daily_rate?: number | null
    ends_in_days?: number | null
  }>

  it('est classée SEMÉE, avec sa raison écrite', () => {
    expect(DEMO_FORECAST_HORIZONS_COVERAGE.state).toBe('seede')
    expect(DEMO_FORECAST_HORIZONS_COVERAGE.reason).toContain('ForecastHorizonsService')
  })

  it('carnet : une mission EN COURS, chiffrée, qui finit dans le trimestre — et appelle « sécuriser »', () => {
    expect(
      missions.some(
        mission =>
          running.has(mission.status) &&
          typeof mission.daily_rate === 'number' &&
          typeof mission.ends_in_days === 'number' &&
          mission.ends_in_days > 0 &&
          mission.ends_in_days <= 90,
      ),
    ).toBe(true)
  })

  it('scénario bas : une mission déclarée « bloquée »', () => {
    expect(missions.some(mission => mission.renewal_status === 'bloque')).toBe(true)
  })

  it('référence : un renouvellement DÉCLARÉ (signé ou annoncé)', () => {
    expect(
      missions.some(
        mission => mission.renewal_status === 'renouvele' || mission.renewal_status === 'reconduction_annoncee',
      ),
    ).toBe(true)
  })

  it('cash : une facture non réglée, et une contestée', () => {
    const invoices = demoInvoiceHistory(Date.now())
    expect(invoices.some(invoice => invoice.paidAt === null && invoice.disputedAt === null)).toBe(true)
    expect(invoices.some(invoice => invoice.disputedAt !== null && invoice.disputeResolvedAt === null)).toBe(true)
  })

  it('capacité : un besoin OUVERT (prédicat partagé, pas `open`)', () => {
    expect((NEED_OPEN_STATUSES as readonly string[]).includes(DEMO_FLAGSHIP_NEED.status)).toBe(true)
  })
})
