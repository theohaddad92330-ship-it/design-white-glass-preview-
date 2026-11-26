import { BLOCKER_ACTIONS, INVOICE_BLOCKERS, type InvoiceBlocker, type InvoiceReadiness } from '@bellum/contracts'

/**
 * La bande du bas de l'écran Finance : ce qui bloque de l'argent, et où aller.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SOURCE RETIENT DES NEUF VARIANTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Les neuf maquettes du 26/08 proposent quatre bandes différentes. Une seule
 * survit : « des alertes avec leur montant et un lien. 67 factures manquantes ·
 * 98 420 € · voir. C'est la seule variante qui transforme un chiffre en file de
 * travail. » Les trois autres sont rejetées et la raison est écrite : un
 * journal d'activité « ne fait prendre aucune décision », des actions IA
 * « mélangent des sujets commerciaux sur un écran finance », et une invitation
 * permanente à Laura est « l'aveu que l'écran n'a pas répondu à la question ».
 *
 * La source corrige ensuite sa propre variante, et c'est la règle qui gouverne
 * ce module : « le bloc dit l'état, la bande dit ce que je fais aujourd'hui —
 * triée par gravité, cinq maximum, et elle annonce ce qu'elle replie. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES MONTANTS NE S'ADDITIONNENT PAS ENTRE FILES
 * ─────────────────────────────────────────────────────────────────────────────
 * Une mission peut être bloquée par trois choses à la fois. Elle entre alors
 * dans les trois files, avec son montant : ce sont trois GESTES différents, sur
 * trois écrans différents, et fondre le tout en « 1 mission bloquée » ne dirait
 * pas quoi faire. Conséquence à ne jamais perdre de vue : la somme des lignes
 * de cette bande n'est PAS un total — c'est le même argent vu sous plusieurs
 * empêchements. Aucun total n'est donc affiché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE COULEUR D'ALERTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source rejette le cercle orange de la variante 4 : « l'orange dit "c'est
 * mauvais". Mauvais par rapport à quoi ? Une couleur d'alerte suppose un
 * objectif, et l'objectif n'est pas tranché. » Cette fonction rend donc un
 * ordre de gravité et jamais une couleur : c'est l'ordre qui hiérarchise.
 */

/** Une file de travail : un empêchement, ce qu'il retient, et où le lever.
 *  Non exporté : il n'est consommé que par la signature ci-dessous, et un type
 *  exporté sans consommateur externe fait échouer `pnpm lint:exports:types`. */
type FinanceAlert = {
  /** Le code du bloqueur. Une valeur inconnue de ce navigateur reste telle
   *  quelle plutôt que d'être jetée — le serveur peut être en avance. */
  blocker: string
  /** Combien de mois de mission portent cet empêchement. */
  missions: number
  /**
   * Ce qui est retenu, en centimes. `null` quand AUCUNE ligne du groupe ne
   * porte de montant — « 0 € » se lirait « il n'y a rien à facturer », qui est
   * l'inverse exact de « on ne sait pas encore combien ».
   */
  amountCents: number | null
  /** Combien de lignes n'ont pas pu être chiffrées. Le montant est alors un
   *  PLANCHER, et l'écran le dit. */
  withoutAmount: number
  /** L'écran où le geste se fait. `null` sur un bloqueur inconnu : envoyer
   *  quelqu'un au hasard est pire que ne pas l'envoyer. */
  route: string | null
  /** Le geste, tel que `BLOCKER_ACTIONS` le nomme. `null` si inconnu. */
  action: string | null
}

/** Cinq, comme la file d'intervention du pilotage. Au-delà, la bande cesse
 *  d'être une liste de gestes et redevient un tableau. */
const MAX_ALERTS = 5

export function financeAlerts(
  rows: readonly InvoiceReadiness[],
  options: { max?: number } = {},
): { shown: FinanceAlert[]; hidden: number } {
  const max = options.max ?? MAX_ALERTS
  const groups = new Map<string, { missions: number; amountCents: number | null; withoutAmount: number }>()

  for (const row of rows) {
    for (const blocker of row.blockers) {
      const current = groups.get(blocker) ?? { missions: 0, amountCents: null, withoutAmount: 0 }
      current.missions += 1
      if (row.preparedAmountCents === null) current.withoutAmount += 1
      // Le montant reste `null` tant qu'aucune ligne n'en porte : l'accumulateur
      // ne s'ouvre JAMAIS à zéro, ce qui rendrait « 0 € » indiscernable de
      // « rien n'a pu être chiffré ». C'est aussi pourquoi la somme s'écrit en
      // toutes lettres plutôt qu'avec un repli sur zéro.
      else if (current.amountCents === null) current.amountCents = row.preparedAmountCents
      else current.amountCents += row.preparedAmountCents
      groups.set(blocker, current)
    }
  }

  const ordered = [...groups.entries()]
    .map(([blocker, totals]) => ({
      blocker,
      ...totals,
      route: isKnownBlocker(blocker) ? BLOCKER_ACTIONS[blocker].route : null,
      action: isKnownBlocker(blocker) ? BLOCKER_ACTIONS[blocker].action : null,
    }))
    // `INVOICE_BLOCKERS` est déjà ordonnée par gravité — « le premier bloqueur
    // de la liste est celui qu'il faut traiter en premier ». Recopier un ordre
    // ici en ferait un second, qui divergerait.
    .sort((a, b) => gravity(a.blocker) - gravity(b.blocker))

  return { shown: ordered.slice(0, max), hidden: Math.max(0, ordered.length - max) }
}

function isKnownBlocker(value: string): value is InvoiceBlocker {
  return (INVOICE_BLOCKERS as readonly string[]).includes(value)
}

/** Un code inconnu passe en dernier : on ne peut pas prétendre connaître la
 *  gravité de quelque chose qu'on ne sait pas nommer. */
function gravity(blocker: string): number {
  const index = (INVOICE_BLOCKERS as readonly string[]).indexOf(blocker)
  return index === -1 ? INVOICE_BLOCKERS.length : index
}
