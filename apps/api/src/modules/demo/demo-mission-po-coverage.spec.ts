import { poConsumption } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/** Statuts qui comptent comme des jours CONSOMMÉS d'un bon de commande — le
 *  même filtre que `staffing.service.ts#readTerms` (`status NOT IN
 *  ('expected', 'missing', 'not_required')`) et que `revenue.service.ts`.
 *  ⚠️ `rejected` COMPTE : un relevé rejeté a bien déclaré des jours, le refus
 *  porte sur leur validité, pas sur leur existence — c'est le même filtre que
 *  le serveur applique, pas une interprétation plus prudente. */
const COUNTED_TIMESHEET_STATUSES = new Set(['draft', 'submitted', 'validated', 'disputed', 'rejected'])

/**
 * LA PARITÉ DÉMO DU BON DE COMMANDE D'UNE MISSION (30/08/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_commercial_terms` n'ajoute AUCUNE table : la garde par table reste
 * verte, qu'une ligne porte `po_issued_on`/`po_amount_cents`/`po_volume_days`
 * ou non. Ces trois colonnes existaient depuis le 30/08/2026 et n'étaient
 * écrites NULLE PART, y compris en démonstration — l'onglet « Conditions
 * commerciales » aurait donc affiché « volume non renseigné » sur les NEUF
 * missions de la salle, jamais la barre de consommation qui EST le sujet de
 * ce lot.
 *
 * ⚠️ Les TROIS états du bloc (`PoConsumptionBlock`) comptent, pas seulement
 * le plus favorable :
 *  - volume CONNU et consommation MESURABLE → la barre, avec son pourcentage ;
 *  - volume CONNU, consommation NON mesurable (aucun relevé compté) →
 *    « Consommation non mesurée », jamais « 0 % consommé » ;
 *  - volume NON renseigné → « Volume non renseigné », jamais une barre à 0 %.
 *
 * ⚠️ Chaque état est RECOMPTÉ ici avec la MÊME fonction que le serveur
 * (`poConsumption`, `@bellum/contracts`) et le MÊME filtre de statuts que
 * `staffing.service.ts` sur `mission_timesheets` — jamais cru sur la prose
 * d'un commentaire (« un audit documentaire n'est pas le code »).
 */
describe('parité démo — le bon de commande d’une mission', () => {
  it('la garde LIT quelque chose — la salle porte plusieurs missions', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
  })

  it('au moins une mission montre la BARRE — volume et consommation connus, cohérents avec son relevé', () => {
    const withBar = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.po_volume_days != null && mission.timesheet && COUNTED_TIMESHEET_STATUSES.has(mission.timesheet.status),
    )
    expect(withBar.length).toBeGreaterThan(0)

    for (const mission of withBar) {
      const volumeDays = mission.po_volume_days as number
      const consumedDays = mission.timesheet?.days ?? null
      const consumption = poConsumption(volumeDays, consumedDays)
      // La fonction ne rend `null` QUE si un terme manque — les deux sont
      // connus ici par construction du filtre ci-dessus.
      expect(consumption).not.toBeNull()
      expect(consumption?.percent).toBeGreaterThan(0)
      // Un bon de commande DÉPASSÉ n'est pas ce que cette ligne montre :
      // c'est l'état « en cours », le plus fréquent en clientèle.
      expect(consumption?.remainingDays ?? -1).toBeGreaterThan(0)
      // Jamais un montant/volume à zéro : « 0 » se lirait « pas de bon de
      // commande », une AUTRE réponse que « un bon de 30 jours ».
      expect(volumeDays).toBeGreaterThan(0)
      expect(mission.po_amount_cents ?? 0).toBeGreaterThan(0)
      expect(mission.po_issued_on_days_ago ?? -1).toBeGreaterThan(0)
      // Le bon de commande est ÉMIS avant (ou au pire au) démarrage de la
      // mission — un bon de commande postérieur au début des travaux ne se
      // lirait pas comme un bon de commande.
      expect(mission.po_issued_on_days_ago as number).toBeGreaterThanOrEqual(mission.started_days_ago)
    }
  })

  it('au moins une mission montre « consommation non mesurée » — volume connu, aucun relevé compté', () => {
    const unmeasured = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.po_volume_days != null &&
        (!mission.timesheet || !COUNTED_TIMESHEET_STATUSES.has(mission.timesheet.status)),
    )
    expect(unmeasured.length).toBeGreaterThan(0)
    for (const mission of unmeasured) {
      const consumedDays =
        mission.timesheet && COUNTED_TIMESHEET_STATUSES.has(mission.timesheet.status) ? mission.timesheet.days : null
      expect(poConsumption(mission.po_volume_days as number, consumedDays)).toBeNull()
    }
  })

  it('au moins une mission montre « volume non renseigné » — bon de commande exigé, volume absent', () => {
    const missingVolume = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => mission.requires_po && mission.po_number != null && mission.po_volume_days == null,
    )
    expect(missingVolume.length).toBeGreaterThan(0)
    for (const mission of missingVolume) {
      expect(poConsumption(null, mission.timesheet?.days ?? null)).toBeNull()
    }
  })

  it('la garde sait dire NON — un volume à zéro romprait la règle « jamais un zéro déguisé »', () => {
    expect(poConsumption(0, 10)).toBeNull()
    expect(poConsumption(30, null)).toBeNull()
    expect(poConsumption(null, 18)).toBeNull()
  })
})
