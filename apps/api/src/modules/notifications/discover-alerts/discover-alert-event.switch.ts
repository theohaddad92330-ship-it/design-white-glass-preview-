import { killSwitchCut } from '../../../common/kill-switches'

/**
 * L'INTERRUPTEUR DE LA DÉTECTION — #2151.14.
 *
 * Il est SÉPARÉ de l'interrupteur d'ENVOI, celui que `discover-alert-gate.ts` lit
 * (et qu'il est le seul à lire — une garde d'architecture le vérifie, raison
 * pour laquelle ce fichier ne le NOMME pas). Cet interrupteur-là ouvre l'envoi
 * sortant : éteint par défaut, en attente d'une pièce juridique. Celui-ci coupe
 * la DÉTECTION : allumé par défaut, comme tout kill-switch. Les confondre ferait
 * l'un des deux — ou bien Aujourd'hui n'afficherait jamais rien tant que l'envoi
 * n'est pas ouvert, ou bien ouvrir la détection ouvrirait l'envoi. Ni l'un ni
 * l'autre n'est la décision.
 *
 * Il est lu par le REGISTRE (`apps/api/src/common/kill-switches.ts`) et par lui
 * seul — GA-84 / GA-85 le vérifient, et l'état est publié à l'opérateur sur
 * `GET internal/telemetry/kill-switches`.
 */
export function discoverAlertEventsDisabled(): boolean {
  return killSwitchCut('discover.alert_events')
}
