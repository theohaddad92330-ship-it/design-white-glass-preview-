import { LONG_ABSENCE_DAYS, sinceLastVisitLineSpeaks } from '@bellum/contracts'
import type {
  ActionHistoryItem,
  ActionHistoryResponse,
  SinceLastSeen,
  SinceLastVisitDigest,
  SinceLastVisitLine,
} from '@bellum/contracts'

/**
 * Combien de lignes de JOURNAL le bloc montre avant de replier.
 *
 * « Aujourd’hui » se lit debout, avant une réunion : un bloc qui s'allonge cesse
 * d'être lu, et le Journal existe déjà pour la lecture longue. Quatre lignes
 * tiennent sous le pouce sur un téléphone sans pousser l'agenda hors de l'écran.
 * Ce qui déborde n'est pas caché — il est COMPTÉ et annoncé.
 *
 * ⚠️ À ne pas confondre avec les QUATRE LIGNES TYPÉES (`SINCE_LAST_VISIT_LINES`
 * du contrat), qui répondent à « qu'est-ce qui a bougé ? ». Le journal, lui,
 * répond à « qu'ai-je fait ? ». Le nombre est le même par hasard.
 */
export const SINCE_LAST_VISIT_MAX_ROWS = 4

/**
 * Ce que le bloc a le droit d'afficher, et rien d'autre.
 *
 * Trois de ces cinq états sont des SILENCES, et ils n'appellent pas le même
 * geste : `up_to_date` (« on a regardé, rien n'a bougé »), `unreadable` (« on
 * n'a pas pu regarder ») et `first_visit` (« il n'existe pas de depuis »).
 * Rendus du même gris, ils se confondent — et un commercial qui les confond
 * cesse de croire le bloc.
 */
/** Les cinq états du bloc. NON exporté : il n'est consommé que par la
 *  fonction ci-dessous et par le composant, qui l'infère du retour.
 *  L'exporter ferait échouer `pnpm lint:exports:types` — la règle du dépôt
 *  est qu'un type consommé dans son seul fichier ne s'exporte pas. */
type SinceLastVisitState =
  | { kind: 'loading' }
  | { kind: 'first_visit' }
  | { kind: 'unreadable' }
  | { kind: 'up_to_date'; since: string }
  | {
      kind: 'changed'
      since: string
      /** Les lignes typées qui ONT quelque chose à dire — un compte non nul, ou
       *  un silence à justifier. Vide quand la lecture des quatre a échoué. */
      lines: SinceLastVisitLine[]
      items: ActionHistoryItem[]
      hidden: number
      /**
       * Les DEUX lectures ne tombent pas ensemble, et une seule qui tombe ne
       * doit pas effacer l'autre : un changement de poste reste vrai quand le
       * journal ne répond pas. Ce qui a échoué est NOMMÉ, jamais tu.
       */
      failed: ('digest' | 'journal')[]
      /**
       * #2106.29/.32/.33 — le résumé condensé de longue absence (>=
       * {@link LONG_ABSENCE_DAYS}). `null` sous le seuil : rien à condenser,
       * les lignes ci-dessus suffisent déjà à la lecture.
       *
       * Volontairement des SCALAIRES, jamais une liste : `topLine` est LA
       * ligne déjà mesurée dont le compte est le plus haut — jamais un score
       * ni une probabilité, le plus haut des comptes RÉELS — et `null` quand
       * aucune ligne n'a de compte à comparer (tout est silence).
       *
       * #2106.30/.31 (épopée #2802) — `expiredItemsCount` (ce qui a expiré
       * sans être traité) et `treatedByColleagueCount` (ce qu'un AUTRE membre
       * a traité) viennent du DIGEST serveur, jamais recalculés côté client :
       * les deux exigent un agrégat sur la fenêtre ENTIÈRE, que le client ne
       * peut pas reconstituer depuis les quatre lignes tronquées du Journal.
       */
      longAbsence: {
        topLine: SinceLastVisitLine | null
        openTasksCount: number | null
        expiredItemsCount: number | null
        treatedByColleagueCount: number | null
      } | null
    }

type QueryLike<T> = { data?: T; isLoading: boolean; isError: boolean }

/**
 * Traduit les TROIS lectures du serveur — le repère de dernière visite, les
 * quatre lignes typées et la fenêtre du journal — en UN état affichable.
 *
 * Fonction PURE : c'est ce qui permet de vérifier les états sans monter un arbre
 * React ni un client de requêtes, donc de vérifier ceux qu'un rendu ne montre
 * presque jamais (le repère illisible, le total sans lignes, une lecture sur
 * deux qui tombe).
 *
 * ⚠️ L'ordre des tests n'est pas cosmétique. Le repère est lu EN PREMIER : sans
 * lui on ne sait même pas quelle fenêtre interroger, et se replier sur « c'est
 * ta première visite » parce que sa lecture a échoué effacerait, aux yeux d'un
 * habitué, tout ce qui a bougé cette nuit.
 *
 * ⚠️ `up_to_date` exige que les DEUX lectures aient répondu. C'est le défaut que
 * ce bloc a déjà commis sous une autre forme : « tu es à jour » posé sur une
 * lecture qui a échoué est le mensonge le plus coûteux de l'écran, parce qu'il
 * est rassurant.
 */
export function sinceLastVisitState(input: {
  lastSeen: QueryLike<SinceLastSeen>
  digest: QueryLike<SinceLastVisitDigest>
  history: QueryLike<ActionHistoryResponse>
  maxRows?: number
  /** Pour dater l'absence. Défaut `new Date()` : les appelants qui ne
   *  condensent rien (la quasi-totalité des tests existants) n'ont rien à
   *  passer. */
  now?: Date
  /** #2106.32 — les tâches encore ouvertes, déjà lues ailleurs sur le brief
   *  (`data.tasks`). `null` = non fourni ou non mesuré : jamais un zéro
   *  fabriqué. */
  openTasksCount?: number | null
}): SinceLastVisitState {
  const maxRows = input.maxRows ?? SINCE_LAST_VISIT_MAX_ROWS
  const now = input.now ?? new Date()
  const openTasksCount = input.openTasksCount ?? null

  if (input.lastSeen.isError) return { kind: 'unreadable' }
  if (input.lastSeen.isLoading || !input.lastSeen.data) return { kind: 'loading' }

  const since = input.lastSeen.data.since
  // Aucune visite précédente enregistrée : il n'y a pas de fenêtre, donc rien à
  // compter. Écrire « 0 changement » se lirait « il ne se passe rien ici ».
  if (since === null) return { kind: 'first_visit' }

  if (input.digest.isLoading || input.history.isLoading) return { kind: 'loading' }

  const digestFailed = input.digest.isError || !input.digest.data
  const total = input.history.data?.pagination.totalItems ?? 0
  const items = input.history.data?.data.slice(0, maxRows) ?? []
  // Un total sans une seule ligne à nommer : on sait que quelque chose a bougé
  // et on ne peut rien en dire. « et 3 autres » au-dessus du vide serait faux —
  // le seul énoncé vrai est qu'on n'a pas pu lire le journal.
  const journalFailed = input.history.isError || !input.history.data || (total > 0 && items.length === 0)

  if (digestFailed && journalFailed) return { kind: 'unreadable' }

  // Le serveur rend les QUATRE lignes toujours — sinon l'écran ne pourrait pas
  // distinguer « ligne absente » de « ligne à zéro ». C'est ici qu'on décide de
  // n'en montrer aucune qui n'ait rien à dire, avec la règle du contrat.
  const lines = digestFailed ? [] : (input.digest.data?.lines ?? []).filter(sinceLastVisitLineSpeaks)

  // Les deux lectures ont répondu, et aucune n'a rien à raconter.
  if (!digestFailed && !journalFailed && lines.length === 0 && total === 0) {
    return { kind: 'up_to_date', since }
  }

  const failed: ('digest' | 'journal')[] = []
  if (digestFailed) failed.push('digest')
  if (journalFailed) failed.push('journal')

  return {
    kind: 'changed',
    since,
    lines,
    items: journalFailed ? [] : items,
    hidden: journalFailed ? 0 : Math.max(0, total - items.length),
    failed,
    longAbsence:
      daysSince(since, now) >= LONG_ABSENCE_DAYS
        ? {
            topLine: mostImportantLine(lines),
            openTasksCount,
            expiredItemsCount: digestFailed ? null : (input.digest.data?.expiredItemsCount ?? null),
            treatedByColleagueCount: digestFailed ? null : (input.digest.data?.treatedByColleagueCount ?? null),
          }
        : null,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Combien de jours PLEINS séparent `since` de `now`. */
function daysSince(since: string, now: Date): number {
  return (now.getTime() - Date.parse(since)) / DAY_MS
}

/**
 * #2106.29 — LA ligne la plus significative parmi les quatre déjà mesurées.
 *
 * Jamais un score, jamais une probabilité (doctrine) : le plus haut des
 * comptes RÉELS déjà rendus par le serveur. Une ligne NON mesurée n'a pas de
 * compte à comparer — elle ne peut donc jamais gagner, quel que soit son
 * silence. `null` quand aucune ligne mesurée n'a de compte (tout est silence
 * ou zéro), plutôt que d'en fabriquer une.
 */
function mostImportantLine(lines: readonly SinceLastVisitLine[]): SinceLastVisitLine | null {
  let best: SinceLastVisitLine | null = null
  for (const line of lines) {
    if (line.state !== 'ready' || line.count === null) continue
    if (!best || line.count > (best.count ?? -1)) best = line
  }
  return best
}
