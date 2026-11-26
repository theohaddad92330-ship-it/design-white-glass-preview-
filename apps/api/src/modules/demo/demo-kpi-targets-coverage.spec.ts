import {
  KPI_TARGETS,
  compareToTarget,
  computeDso,
  kpiTarget,
  unmeasuredShare,
  type KpiTargetStatus,
} from '@bellum/contracts'
import { DEMO_KPI_TARGET_TILES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, demoInvoiceHistory } from './demo-dataset'

/**
 * « ET EN DÉMONSTRATION, LES CIBLES CHIFFRÉES MONTRENT QUOI ? » — la garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE TIENT, ET POURQUOI LA GARDE PAR TABLE NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cibles n'ajoutent AUCUNE table : elles se posent sur des chiffres déjà
 * semés. `demo-coverage.spec.ts` ne peut donc pas poser la question, et c'est
 * exactement le silence qui fait découvrir une pilule grise en réunion.
 *
 * Elle ne se contente pas de lire la déclaration : elle REJOUE le calcul sur le
 * jeu de données, comme la garde du coût de l'intermédiation le fait déjà. Une
 * déclaration qui dit « seedé » sans que personne ne recompte est un registre
 * qui se déclare implémenté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX ÉTATS AU MOINS, ET C'EST LA VRAIE EXIGENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une salle où toutes les pilules seraient vertes montrerait un produit qui dit
 * toujours oui — donc un produit qui ne sert à rien. Une salle où toutes
 * seraient orange montrerait un produit qui ne sait pas reconnaître ce qui va
 * bien. La démonstration doit porter les DEUX : le délai de paiement dans sa
 * cible, la part de marge non mesurée franchement au-dessus de la sienne.
 */
describe('couverture des cibles chiffrées en démonstration', () => {
  const declared = Object.keys(DEMO_KPI_TARGET_TILES)
  const targeted = KPI_TARGETS.map(target => target.kpi)

  it('lit vraiment quelque chose — trois corpus non vides', () => {
    // Une garde qui parcourt une liste vide passe au vert sans rien vérifier.
    expect(declared.length).toBeGreaterThanOrEqual(8)
    expect(targeted.length).toBeGreaterThanOrEqual(10)
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThanOrEqual(6)
    expect(demoInvoiceHistory(Date.now()).length).toBeGreaterThanOrEqual(13)
  })

  it('classe CHAQUE cible du produit — aucune ne reste sans réponse', () => {
    const unanswered = targeted.filter(key => !(key in DEMO_KPI_TARGET_TILES))
    expect(unanswered).toEqual([])
  })

  it('ne garde AUCUNE entrée périmée — une cible retirée emporte sa déclaration', () => {
    // Le sens inverse : une justification qui survit à la cible qu'elle nommait
    // est une ligne morte que le prochain lecteur prendra pour une décision.
    const stale = declared.filter(key => !targeted.includes(key))
    expect(stale).toEqual([])
  })

  it('chaque raison est ÉCRITE, pas cochée', () => {
    // ⚠️ Jest n'accepte pas le second argument de `expect` (vitest si) : les
    // clés fautives sont donc collectées et rendues d'un coup, ce qui dit AUSSI
    // lesquelles plutôt que de s'arrêter à la première.
    const thin = Object.entries(DEMO_KPI_TARGET_TILES)
      .filter(([, entry]) => entry.reason.trim().length <= 60)
      .map(([key]) => key)
    expect(thin).toEqual([])
    const wrongState = Object.entries(DEMO_KPI_TARGET_TILES)
      .filter(([, entry]) => entry.state !== 'seede' && entry.state !== 'vide_a_dessein')
      .map(([key]) => key)
    expect(wrongState).toEqual([])
  })

  /**
   * Le délai de paiement — l'état VERT de la salle, recompté.
   *
   * Mêmes refus, dans le même ordre, que `RevenueService.dso()` : les impayées
   * sortent (`WHERE ir.paid_at IS NOT NULL`), les contestées sortent dans le
   * `WHERE` et sont COMPTÉES, et `slice(0, 10)` reproduit le `to_char`.
   */
  function demoDso(now: number) {
    const rows = demoInvoiceHistory(now).filter(row => row.paidAt !== null)
    const disputed = rows.filter(row => row.disputedAt !== null).length
    const measured = rows.filter(row => row.disputedAt === null)
    return computeDso(
      measured.map(row => ({ invoicedAt: row.invoicedAt.slice(0, 10), paidAt: (row.paidAt ?? '').slice(0, 10) })),
      { disputed },
    )
  }

  it('la salle montre au moins une pilule DANS la cible — le délai de paiement', () => {
    const target = kpiTarget('dso_days')!
    const result = demoDso(Date.now())
    expect(result.days).toBe(32)
    expect(compareToTarget(result.days, target)).toBe<KpiTargetStatus>('on_target')
    expect(DEMO_KPI_TARGET_TILES.dso_days?.state).toBe('seede')
  })

  it('SAIT DIRE NON — sans factures, la pilule n’est pas verte, elle est muette', () => {
    // La contrepartie obligatoire, et elle porte le piège du lot : un délai de
    // paiement qu'on ne sait pas calculer ne vaut pas 0 jour. Traité comme un
    // zéro, il passerait « < 65 j » haut la main et s'afficherait VERT — « on
    // est payé le jour même », sur un espace où l'on ne sait rien.
    const target = kpiTarget('dso_days')!
    const empty = computeDso([], { disputed: 0 })
    expect(empty.days).toBeNull()
    expect(compareToTarget(empty.days, target)).toBe<KpiTargetStatus>('unmeasured')
    expect(compareToTarget(empty.days, target)).not.toBe('on_target')
  })

  /**
   * La part de marge non mesurée — l'état ORANGE de la salle, recompté.
   *
   * ⚠️ La population est celle de `RevenueService.aggregate` : une mission entre
   * dans le calcul si elle porte un TJM, un coût chargé ET des jours déclarés.
   * Il manque un terme ⇒ elle est comptée « non mesurée », jamais à 0 %.
   *
   * Le relevé compte comme le SQL le compte : les états `expected`, `missing` et
   * `not_required` sont écartés par la jointure (`revenue.service.ts`), donc un
   * relevé attendu ne fournit pas de jours.
   */
  const IGNORED_TIMESHEET_STATES = new Set(['expected', 'missing', 'not_required'])

  function demoMarginRows() {
    return DEMO_DELIVERY_CLIENT.missions.map(mission => ({
      dailyRateCents: mission.daily_rate === null || mission.daily_rate === undefined ? null : mission.daily_rate * 100,
      dailyCostCents: mission.loaded_daily_cost_cents ?? null,
      days:
        mission.timesheet && !IGNORED_TIMESHEET_STATES.has(mission.timesheet.status) ? mission.timesheet.days : null,
    }))
  }

  it('la salle montre au moins une pilule HORS cible — la part de marge non mesurée', () => {
    const target = kpiTarget('unmeasured_margin')!
    const rows = demoMarginRows()
    const measured = rows.filter(
      row => row.dailyRateCents !== null && row.dailyCostCents !== null && row.days !== null && row.days > 0,
    ).length
    const unmeasured = rows.length - measured

    // Le jeu porte les DEUX populations : sans mission mesurée, la part vaudrait
    // 100 % pour une mauvaise raison ; sans mission non mesurée, la pilule
    // serait verte et ne démontrerait rien.
    expect(measured).toBeGreaterThan(0)
    expect(unmeasured).toBeGreaterThan(0)

    const share = unmeasuredShare(measured, unmeasured)
    expect(share).not.toBeNull()
    expect(compareToTarget(share, target)).toBe<KpiTargetStatus>('off_target')
    expect(DEMO_KPI_TARGET_TILES.unmeasured_margin?.state).toBe('seede')
  })

  it('un espace SANS mission ne montre pas « 0 % non mesuré » — le zéro qui ment du bon côté', () => {
    // Il tombe du BON côté de la cible, et c'est ce qui le rend dangereux : un
    // espace vide afficherait la meilleure complétude possible, en vert, sans
    // avoir rien mesuré.
    const target = kpiTarget('unmeasured_margin')!
    expect(unmeasuredShare(0, 0)).toBeNull()
    expect(compareToTarget(unmeasuredShare(0, 0), target)).toBe<KpiTargetStatus>('unmeasured')
  })

  it('les deux états de la salle ne sont pas le MÊME état', () => {
    // La propriété qui porte tout ce fichier : une démonstration monochrome ne
    // prouve rien, quelle que soit sa couleur.
    const states = new Set<KpiTargetStatus>([
      compareToTarget(demoDso(Date.now()).days, kpiTarget('dso_days')!),
      compareToTarget(
        unmeasuredShare(
          demoMarginRows().filter(
            row => row.dailyRateCents !== null && row.dailyCostCents !== null && row.days !== null && row.days > 0,
          ).length,
          demoMarginRows().filter(
            row => row.dailyRateCents === null || row.dailyCostCents === null || row.days === null || row.days <= 0,
          ).length,
        ),
        kpiTarget('unmeasured_margin')!,
      ),
    ])
    expect(states.size).toBe(2)
  })
})
