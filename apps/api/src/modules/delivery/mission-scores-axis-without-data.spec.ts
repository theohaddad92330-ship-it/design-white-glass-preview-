import { MissionScoresService } from './mission-scores.service'

/**
 * #2587 — zéro ligne n'est pas zéro risque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, VU EN PRODUCTION LE 18/09
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet « Risque & opportunité » d'une mission SANS AUCUN relevé d'activité
 * affichait les axes « Relevés d'activité » et « Paiement » à **0** — un axe
 * rassurant — au lieu de « non mesuré ». La cause : `disputed`, `missing` et
 * `overdue_invoices` sont des `COUNT(*)` sur un SOUS-ENSEMBLE de lignes, et un
 * `COUNT(*)` ne rend jamais `null`. Rien, dans la requête d'avant, ne comptait
 * le TOTAL de lignes observées — donc rien ne pouvait distinguer « douze
 * relevés remis, aucun litigieux » (une mesure) de « aucun relevé du tout »
 * (une inconnue). Le second cas comptait comme le premier, dans le sens le
 * plus dangereux : un axe non mesuré RESTAIT dans le dénominateur et rendait
 * le score global plus sain qu'il ne l'est (GA-18 / GA-19).
 *
 * ⚠️ Un test qui ne vérifie QUE le cas « sans donnée » ne prouve rien : il
 * passerait aussi bien si l'axe rendait `null` pour toute mission, y compris
 * une mission dont les relevés sont réellement propres. Chaque test ci-dessous
 * joue donc les DEUX cas — la mesure et l'inconnue — pour le même axe.
 */

type RowOverrides = Partial<{
  disputed: string | null
  missing: string | null
  timesheets_total: string | null
  overdue_invoices: string | null
  invoices_total: string | null
}>

/** Une ligne de la requête de `MissionScoresService.scores`, avec des valeurs
 *  neutres sur les axes hors sujet — seuls les axes testés varient. */
function row(overrides: RowOverrides) {
  return {
    id: 'mission-1',
    label: 'Mission de test',
    ends_on: null,
    started_on: null,
    daily_rate: null,
    loaded_daily_cost_cents: null,
    disputed: '0',
    missing: '0',
    timesheets_total: '0',
    overdue_invoices: '0',
    invoices_total: '0',
    consultants: '0',
    account_needs: '0',
    account_missions: '0',
    ...overrides,
  }
}

async function scores(overrides: RowOverrides) {
  const service = new MissionScoresService({ manager: { query: async () => [row(overrides)] } } as never)
  const result = await service.scores('workspace-1', 'mission-1')
  if (!result) throw new Error('scores() a rendu null — la ligne factice n’a pas été lue')
  return result
}

describe('#2587 — un axe SANS DONNÉE sort du dénominateur, il ne vaut pas zéro', () => {
  it('relevés d’activité : aucun relevé ⇒ `null` ; douze relevés dont zéro litigieux ⇒ `0`', async () => {
    // Aucun relevé du tout — total à zéro : l'axe est une INCONNUE.
    const withoutData = await scores({ disputed: '0', missing: '0', timesheets_total: '0' })
    expect(withoutData.risk.notEvaluable).toContain('timesheets')
    expect(withoutData.risk.evaluated.some(axis => axis.axis === 'timesheets')).toBe(false)

    // Douze relevés remis, aucun litigieux ni manquant — total réel : l'axe
    // est une MESURE, et zéro est la bonne réponse.
    const withData = await scores({ disputed: '0', missing: '0', timesheets_total: '12' })
    expect(withData.risk.evaluated).toContainEqual({ axis: 'timesheets', value: 0 })
    expect(withData.risk.notEvaluable).not.toContain('timesheets')
  })

  it('paiement : aucune facture suivie ⇒ `null` ; cinq factures dont zéro en retard ⇒ `0`', async () => {
    // Aucune ligne `invoice_readiness` — total à zéro : on ne sait pas si la
    // mission paie bien ou si sa facturation n'est simplement pas suivie.
    const withoutData = await scores({ overdue_invoices: '0', invoices_total: '0' })
    expect(withoutData.risk.notEvaluable).toContain('payment')
    expect(withoutData.risk.evaluated.some(axis => axis.axis === 'payment')).toBe(false)

    // Cinq factures suivies, aucune en retard — total réel : zéro est mesuré.
    const withData = await scores({ overdue_invoices: '0', invoices_total: '5' })
    expect(withData.risk.evaluated).toContainEqual({ axis: 'payment', value: 0 })
    expect(withData.risk.notEvaluable).not.toContain('payment')
  })

  it('un relevé litigieux compte bien dans le risque quand le total est réel', async () => {
    const result = await scores({ disputed: '1', missing: '0', timesheets_total: '3' })
    expect(result.risk.evaluated).toContainEqual({ axis: 'timesheets', value: 50 })
  })

  it('une facture en retard compte bien dans le risque quand le total est réel', async () => {
    const result = await scores({ overdue_invoices: '1', invoices_total: '2' })
    expect(result.risk.evaluated).toContainEqual({ axis: 'payment', value: 40 })
  })
})
