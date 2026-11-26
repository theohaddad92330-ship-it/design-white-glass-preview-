import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DecisionQueueService } from './decision-queue.service'
import type { DecisionQueueResult } from './decision-queue'

/**
 * LA FILE DE DÉCISION, pour le bloc « Ce qui demande une décision » (#1647).
 *
 * Consommée CÔTÉ SERVEUR par la console `dashboard-manager`, qui porte le
 * secret interne — même porte que le reste de `internal/admin`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONTRAT, EN TROIS PHRASES
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `items` : les lignes, du plus grave au plus ancien. Chacune porte sa
 *    NATURE, son SUJET, un DÉTAIL CHIFFRÉ, son ANCIENNETÉ (`null` quand la date
 *    de bascule n'est pas enregistrée — jamais `0`) et UNE action, qui est un
 *    lien vers l'écran où le geste existe déjà.
 *  - `natures` : les DOUZE, toujours, dans l'ordre figé. Chacune dit combien de
 *    sujets ont pu être `measured`, combien de lignes elle a `raised`, et —
 *    quand elle n'a rien pu mesurer — `unmeasured`, la RAISON. C'est ce champ
 *    qui distingue « mesuré, rien à signaler » de « pas mesurable », et c'est la
 *    moitié qui compte : une file vide parce qu'on ne sait rien ne se lit pas
 *    comme une file vide parce que tout va bien.
 *  - `items: []` ⇒ l'écran écrit « Rien ne demande de décision aujourd'hui ».
 *
 * ⚠️ LECTURE SEULE. Les gestes que les lignes proposent (émettre une facture,
 * créditer un espace, trancher une suspension) vivent sur les routes qui
 * existaient déjà, chacune avec sa capacité et son journal. Aucune n'est
 * dupliquée ici.
 *
 * ⚠️ `decision-queue` est un chemin LITTÉRAL, et aucun contrôleur de
 * `internal/admin` ne déclare de paramètre au premier segment — il ne peut donc
 * pas être avalé par un `:id` voisin.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class DecisionQueueController {
  constructor(private readonly queue: DecisionQueueService) {}

  /**
   * ⚠️ L'HORLOGE EST LUE ICI, ET NULLE PART AILLEURS. Le service la reçoit, le
   * calcul la reçoit : c'est ce qui rend les deux testables sans figer le temps
   * et sans qu'une spec verte à Paris tombe dans une CI en UTC.
   */
  @Get('decision-queue')
  list(): Promise<DecisionQueueResult> {
    return this.queue.list(new Date())
  }
}
