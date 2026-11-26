import {
  ADV_BLOCKERS,
  ADV_RESERVED_BLOCKERS,
  ACTIONABLE_RENEWAL_WINDOWS,
  assessAdvDossier,
  renewalWindow,
  type AdvBlocker,
} from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE L'ADMINISTRATION DES VENTES (31/08/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ALORS QUE `demo-coverage.spec.ts` EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les TABLES : elle vérifie que
 * `mission_adv_records` est classée et que le semis contient bien un
 * `INSERT INTO`. C'est nécessaire et insuffisant — et le dépôt a déjà payé
 * l'écart deux fois. Une table peut être pleine et l'écran rendre `[]` quand
 * même, parce que son FILTRE porte sur autre chose que l'existence des lignes.
 *
 * L'écran ADV a exactement ce piège, et il est daté : sa file retient les
 * démarrages DU MOIS OBSERVÉ et les renouvellements à traiter. Un dossier semé
 * « il y a vingt-quatre jours » tombe dans le mois courant les jours pairs du
 * calendrier et en sort les autres — l'écran s'ouvrirait donc VIDE en réunion
 * un jour sur deux, sans qu'aucune CI ne l'ait jamais vu. Cette garde-ci lit
 * le semis COMME L'ÉCRAN le lira.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE RECOMPTE, ELLE NE CROIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les motifs sont recalculés avec {@link assessAdvDossier} — la fonction que le
 * serveur appelle — et la fenêtre de renouvellement avec {@link renewalWindow},
 * celle qu'utilise `GET /delivery/renewals`. Jamais sur la prose d'un
 * commentaire : « un audit documentaire n'est pas le code ».
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

/** Le semis exprime les dates en JOURS relatifs ; l'écran raisonne en dates. */
function endsOn(mission: DemoMission): string | null {
  if (mission.ends_in_days === null) return null
  const date = new Date(Date.now() + mission.ends_in_days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

/**
 * Les missions que `renewalsToAct` retiendrait — fenêtre actionnable OU fin
 * inconnue, exactement le filtre du service. Ce sont les seules qui sont dans
 * la file QUEL QUE SOIT le jour de la démonstration.
 */
function alwaysInQueue(): DemoMission[] {
  return DEMO_DELIVERY_CLIENT.missions.filter(mission => {
    const window = renewalWindow(endsOn(mission))
    return window === 'unknown' || ACTIONABLE_RENEWAL_WINDOWS.includes(window)
  })
}

/** Le dossier ADV d'une mission du semis, tel que le serveur le composera. */
function blockersOf(mission: DemoMission): AdvBlocker[] {
  const adv = 'adv' in mission ? mission.adv : undefined
  return assessAdvDossier({
    kind: 'renewal',
    billingContactId: mission.billing_contact ? 'un-contact' : null,
    requiresPo: mission.requires_po,
    poNumber: mission.po_number,
    clientBillingReference: adv?.client_billing_reference ?? null,
    paymentTermsDays: adv?.payment_terms_days ?? null,
    paymentDetailsTransmittedAt: adv?.payment_details_transmitted_days_ago == null ? null : new Date().toISOString(),
    // Le semis DÉSIGNE l'entité par son nom ; elle est résolue sur
    // `account_entities` à l'insertion. On vérifie ici que le nom EXISTE dans
    // la salle — un nom qui ne résout pas produirait un dossier « complet »
    // silencieusement incomplet.
    clientEntityId: adv?.client_entity ? 'une-entite' : null,
  }).blockers
}

describe('parité démo — l’administration des ventes', () => {
  it('la garde LIT quelque chose — la salle porte plusieurs missions', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
    expect(ADV_BLOCKERS.length).toBeGreaterThan(0)
  })

  it('la file ADV n’est JAMAIS vide, quel que soit le jour de la démonstration', () => {
    // Le piège daté : un dossier semé « ce mois-ci » sort de la période un jour
    // sur deux. Les renouvellements, eux, sont là tous les jours de l'année.
    expect(alwaysInQueue().length).toBeGreaterThan(2)
  })

  it('CHAQUE motif réellement calculé est visible dans la salle', () => {
    const produced = new Set(alwaysInQueue().flatMap(blockersOf))
    const missing = ADV_BLOCKERS.filter(blocker => !ADV_RESERVED_BLOCKERS.includes(blocker) && !produced.has(blocker))
    // Si ce test tombe : une pastille de l'écran restera à zéro devant un
    // prospect, et personne ne saura si c'est parce que tout va bien ou parce
    // que la salle est amputée.
    expect(missing).toEqual([])
  })

  it('la salle montre AUSSI un dossier complet — sinon l’écran n’est qu’une liste rouge', () => {
    const complete = alwaysInQueue().filter(mission => blockersOf(mission).length === 0)
    expect(complete.length).toBeGreaterThan(0)
  })

  it('l’entité désignée par le semis EXISTE dans la salle', () => {
    // Un nom qui ne résout pas rendrait le dossier « complet » silencieusement
    // incomplet. Le semis crie déjà dans les logs ; ici, la CI le refuse.
    const names = new Set(DEMO_DELIVERY_CLIENT.entities.map(entity => entity.name))
    const designated = DEMO_DELIVERY_CLIENT.missions
      .map(mission => ('adv' in mission ? mission.adv?.client_entity : null))
      .filter((name): name is string => Boolean(name))
    expect(designated.length).toBeGreaterThan(0)
    expect(designated.filter(name => !names.has(name))).toEqual([])
  })

  it('AUCUNE mission du semis ne porte de moyen de paiement', () => {
    // Ce qui est semé de la transmission est une DATE relative, et rien d'autre.
    const serialised = JSON.stringify(DEMO_DELIVERY_CLIENT.missions).toLowerCase()
    for (const forbidden of ['iban', 'bic:', 'swift']) expect(serialised).not.toContain(forbidden)
  })
})
