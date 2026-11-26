import { z } from 'zod'
import { briefingBlockStateSchema } from './daily-briefing.js'

/**
 * CE QUI A BOUGÉ DEPUIS LA DERNIÈRE VISITE — les quatre lignes TYPÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc du cockpit existait, monté, visible, et il rendait le journal
 * `user_actions` BRUT : « Analyse terminée · ACME », « Export généré · DELTA ».
 * C'est l'historique de ce que L'UTILISATEUR a fait, pas ce qui a BOUGÉ pendant
 * son absence. Les deux se ressemblent assez pour qu'une passe de vérification
 * ait pu marquer l'item « branché et vu à l'écran » le 27/08/2026 : c'était vrai
 * du CONTENANT, et ça a masqué que son contenu n'avait jamais existé.
 *
 * Les quatre lignes répondent chacune à une question qu'un commercial se pose en
 * ouvrant l'outil le matin, et qu'aucune ligne de journal ne pose :
 *
 *  - `account_signals`     « qu'est-ce qui a bougé chez mes clients ? »
 *  - `replies_received`    « est-ce qu'on m'a répondu ? »
 *  - `job_changes`         « est-ce que quelqu'un que je connais a bougé ? »
 *  - `missions_moving`     « est-ce qu'une mission arrive à échéance ? »
 *  - `attack_angles_added` « un nouvel angle d'attaque est-il apparu chez un compte ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE LIGNE PORTE SON ÉTAT DE MESURE, ET C'EST TOUT L'INTÉRÊT
 * ─────────────────────────────────────────────────────────────────────────────
 * `state` réutilise {@link briefingBlockStateSchema} — les cinq états des blocs
 * du brief — plutôt que d'inventer un vocabulaire de plus. Il sépare les trois
 * situations que « 0 » confond, et qui appellent trois gestes OPPOSÉS :
 *
 *  - `ready` + `count: 0`  → on a su regarder, et il ne s'est rien passé.
 *  - `not_connected` / `missing_scope` → on n'a pas LE DROIT de regarder.
 *    Le geste est d'aller brancher la capacité, pas d'attendre.
 *  - `unavailable`         → la lecture a échoué. Le geste est de réessayer.
 *
 * D'où l'invariant tenu par {@link sinceLastVisitLineSchema} : **`count` n'est
 * un nombre QUE lorsque l'état est `ready`**. Partout ailleurs il vaut `null`,
 * parce que « non mesuré » n'est pas « mesuré à zéro » — et qu'un `?? 0` posé
 * plus loin dans un écran annulerait toute cette distinction.
 */

/**
 * Les cinq lignes, dans l'ordre d'affichage.
 *
 * L'ordre n'est pas alphabétique : il descend du plus extérieur au plus
 * intérieur. Ce qui vient du marché (les signaux) et ce qui vient d'un humain
 * (une réponse) passent avant ce que le produit a déduit tout seul.
 * `attack_angles_added` puis `night_routines_run` ferment la liste : ce sont
 * les deux lignes que NOUS avons produites, jamais un fait externe.
 *
 * Écrit comme un tableau NOMMÉ, et pas enfoui dans le `z.enum`, pour la même
 * raison que {@link INTERVENTION_KINDS} : une garde ne peut comparer que ce qui
 * porte un nom — ici, la garde de parité i18n et la garde de couverture démo,
 * qui exigent toutes deux une réponse écrite pour CHAQUE ligne.
 *
 * #2803 (#2389.4) — `night_routines_run` : les routines de nuit (`RoutineRunEntity`,
 * `routine_runs`) tournent déjà et sont lisibles en entité (même pattern GA-07
 * que `attack_angles_added`), mais n'étaient comptées dans AUCUNE des douze
 * sources du brief. Compte les exécutions qui ont eu quelque chose à dire
 * (`notified = true`) : une routine qui a tourné sans rien trouver n'est pas ce
 * que « depuis ta dernière visite » demande.
 */
export const SINCE_LAST_VISIT_LINES = [
  'account_signals',
  'replies_received',
  'job_changes',
  'missions_moving',
  'attack_angles_added',
  'night_routines_run',
] as const

export const sinceLastVisitLineKindSchema = z.enum(SINCE_LAST_VISIT_LINES)
export type SinceLastVisitLineKind = z.infer<typeof sinceLastVisitLineKindSchema>

/** Un état de ligne qui n'est PAS `ready` — c'est-à-dire un silence à justifier. */
export type SinceLastVisitUnmeasuredState = Exclude<z.infer<typeof briefingBlockStateSchema>, 'ready'>

/**
 * Les silences que CHAQUE ligne peut réellement porter.
 *
 * Ce n'est pas de la documentation : le type de `unmeasuredLine` en dérive, si
 * bien qu'un producteur ne PEUT PAS rendre `not_connected` sur une ligne qui ne
 * dépend d'aucun connecteur — le compilateur le refuse. Et la garde d'i18n lit
 * cette table pour exiger une phrase, en français et en anglais, pour chaque
 * couple (ligne, silence) réellement atteignable.
 *
 * C'est la réponse au défaut « une garde borgne passe au vert » : sans liste
 * NOMMÉE, une garde de traduction ne peut que vérifier les clés qui existent
 * déjà, jamais celles qui manquent.
 *
 *  - `account_signals`, `missions_moving` et `attack_angles_added` lisent NOS
 *    tables : elles ne peuvent qu'échouer, jamais être « non connectées ».
 *  - `replies_received` dépend de la messagerie : les trois silences d'un
 *    connecteur lui sont ouverts.
 *  - `job_changes` peut en plus être TRONQUÉE par sa borne de balayage.
 *  - `night_routines_run` lit `routine_runs`, une table à nous : seul
 *    `unavailable` lui est atteignable, comme `attack_angles_added`.
 */
export const SINCE_LAST_VISIT_UNMEASURED_STATES = {
  account_signals: ['unavailable'],
  replies_received: ['not_connected', 'missing_scope', 'unavailable'],
  job_changes: ['partial', 'unavailable'],
  missions_moving: ['unavailable'],
  attack_angles_added: ['unavailable'],
  night_routines_run: ['unavailable'],
} as const satisfies Record<SinceLastVisitLineKind, readonly SinceLastVisitUnmeasuredState[]>

export const sinceLastVisitLineSchema = z
  .object({
    kind: sinceLastVisitLineKindSchema,
    state: briefingBlockStateSchema,
    /** Clé de raison — jamais une phrase, l'écran localise. `null` si `ready`. */
    reason: z.string().nullable(),
    /**
     * Ce que la ligne compte. `null` dès que l'état n'est pas `ready` :
     * la valeur est INCONNUE, et zéro serait une réponse à une question qu'on
     * n'a pas pu poser.
     */
    count: z.number().int().nonnegative().nullable(),
    /**
     * Le second compteur, quand la ligne en porte un — « 3 signaux SUR 2
     * COMPTES ». `null` quand la ligne n'en a pas (les trois autres) ou quand
     * rien n'est mesuré.
     *
     * Il vit à côté du premier et non fondu dedans, pour la même raison que
     * `overdueCount` / `todayCount` du bloc Tâches : « 3 nouveaux signaux »
     * tout seul laisse croire à trois clients qui bougent.
     */
    scope: z.number().int().nonnegative().nullable(),
  })
  .superRefine((line, ctx) => {
    // L'invariant central, tenu par le contrat lui-même : un producteur qui
    // rendrait `unavailable` avec un `count: 0` réintroduirait exactement le
    // faux zéro que ce contrat existe pour empêcher.
    if (line.state === 'ready' && line.count === null) {
      ctx.addIssue({ code: 'custom', path: ['count'], message: 'une ligne mesurée porte son compte' })
    }
    if (line.state !== 'ready' && line.count !== null) {
      ctx.addIssue({ code: 'custom', path: ['count'], message: 'une ligne non mesurée ne porte AUCUN compte' })
    }
    if (line.state !== 'ready' && line.scope !== null) {
      ctx.addIssue({ code: 'custom', path: ['scope'], message: 'une ligne non mesurée ne porte AUCUN compte' })
    }
    if (line.state !== 'ready' && !line.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'un silence se JUSTIFIE' })
    }
  })
export type SinceLastVisitLine = z.infer<typeof sinceLastVisitLineSchema>

export const sinceLastVisitDigestSchema = z.object({
  /** La fenêtre effectivement interrogée — celle du repère, pas « hier ». */
  since: z.string().datetime({ offset: true }),
  lines: z.array(sinceLastVisitLineSchema),
  /**
   * #2106.30 (épopée #2802) — combien d'actions du plan ont EXPIRÉ (leur
   * `due_date` est dépassée, jamais complétées ni reportées) pendant
   * l'absence. Un agrégat SERVEUR sur la fenêtre ENTIÈRE — jamais les quatre
   * dernières lignes tronquées du Journal, qui sous-compteraient sur une
   * longue absence. `null` = non mesurable (échec de lecture), jamais un
   * zéro fabriqué ; calculé seulement au-delà de {@link LONG_ABSENCE_DAYS}
   * (le résumé condensé est le seul lecteur de ce champ).
   */
  expiredItemsCount: z.number().int().nonnegative().nullable(),
  /**
   * #2106.31 (épopée #2802) — combien d'actions ont été traitées par un
   * AUTRE membre de l'espace pendant l'absence. Même raison qu'au-dessus :
   * un COMPTE serveur sur la fenêtre entière, jamais un filtre posé sur les
   * lignes déjà tronquées du Journal.
   */
  treatedByColleagueCount: z.number().int().nonnegative().nullable(),
})
export type SinceLastVisitDigest = z.infer<typeof sinceLastVisitDigestSchema>

/**
 * Cette ligne a-t-elle quelque chose à dire ?
 *
 * Une ligne mesurée à ZÉRO se tait : « 0 changement de poste » est un zéro
 * décoratif, il occupe une ligne d'un bloc qui doit se lire debout et n'apprend
 * rien. Une ligne NON mesurée, elle, parle toujours — c'est précisément le
 * moment où le silence mentirait.
 *
 * Fonction PURE et partagée : le serveur ne filtre pas (il rend les quatre
 * lignes, sinon un écran ne pourrait pas distinguer « pas de ligne » de « ligne
 * à zéro »), l'écran décide de l'affichage. Une seule règle, un seul endroit.
 */
export function sinceLastVisitLineSpeaks(line: SinceLastVisitLine): boolean {
  return line.state === 'ready' ? (line.count ?? 0) > 0 : true
}
