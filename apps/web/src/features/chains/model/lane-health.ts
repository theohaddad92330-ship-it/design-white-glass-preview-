import type { ChainLane } from '../api'

/**
 * CE QUI DEMANDE L'ATTENTION D'UN MANAGER — un seul prédicat (#1504).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran compte les parcours « avec blocage » EN HAUT, et les FILTRE en bas.
 * Deux chemins qui décideraient chacun de leur côté finiraient par diverger, et
 * le symptôme est silencieux : « 6 parcours bloqués » au-dessus de quatre
 * cartes, sans qu'aucun test ne tombe. C'est le défaut payé au lot 9 sur les
 * quatre compteurs de `/actions/sequences`.
 *
 * Donc : le compteur additionne ce que cette fonction rend, le filtre garde ce
 * qu'elle rend. Un test compare l'égalité des deux chemins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE APPELLE « BLOQUÉ »
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux causes, et elles ne se soignent pas pareil :
 *  - `awaitingDecision` — quelqu'un doit répondre à une porte. Le geste est
 *    connu et il tient en un clic.
 *  - `stalled` — le dossier n'a pas bougé depuis plus d'une semaine, porte ou
 *    pas. Personne n'attend rien de précis : c'est justement le problème.
 *
 * Les deux comptent, parce que les deux répondent à la question de la page :
 * « qu'est-ce que je dois débloquer maintenant ? ».
 */
export function needsAttention(lane: ChainLane): boolean {
  return countOf(lane.awaitingDecision) > 0 || countOf(lane.stalled) > 0
}

/**
 * Un compteur servi par une API qui ne le connaît pas encore vaut ZÉRO, pas NaN.
 *
 * ⚠️ Ce n'est pas de la prudence gratuite. Le web est servi par Vercel en deux
 * minutes, l'API par Railway en dix : pendant ce quart d'heure, un écran neuf
 * interroge l'API PRÉCÉDENTE. `sum + undefined` vaut `NaN`, et l'entête aurait
 * affiché « NaN dossiers suivis » à tout le monde. Mesuré en production le
 * 05/09/2026 — l'écran est carrément tombé sur `chain.purpose`, et ces trois
 * sommes étaient le défaut suivant sur le même chemin.
 *
 * Ici, zéro est VRAI : une API qui ne compte pas encore les dossiers bloqués
 * n'en signale aucun. Ce n'est pas « non mesuré » déguisé en « 0 » — la
 * distinction vaut pour les DURÉES, qui restent `null`.
 */
export function countOf(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

/**
 * L'ÉTAPE OÙ LES DOSSIERS ATTENDENT LE PLUS LONGTEMPS.
 *
 * ⚠️ Ce n'est PAS « l'étape la plus lente » au sens d'une durée de traversée :
 * la table ne porte pas d'horodatage par transition, seulement la date du
 * dernier mouvement. Ce qui se mesure honnêtement est l'ancienneté médiane des
 * dossiers ARRÊTÉS là — et c'est ce que l'écran nomme.
 *
 * Une étape sans personne n'est jamais candidate : elle n'a pas de médiane, et
 * `0` en tiendrait lieu, ce qui la ferait gagner ou perdre pour une raison
 * fausse. `null` quand rien n'est mesurable — un tableau de bord qui ne sait pas
 * le dit, il ne dit pas « tout va bien ».
 */
export function slowestStep(lanes: ChainLane[]): { lane: ChainLane; position: number; days: number } | null {
  let best: { lane: ChainLane; position: number; days: number } | null = null
  for (const lane of lanes) {
    for (const entry of lane.positions) {
      // `null` = personne ici ; `undefined` = l'API ne sait pas encore le dire.
      // Les deux se traitent pareil : rien à classer.
      if (countOf(entry.count) === 0 || !Number.isFinite(entry.medianDaysAtPosition)) continue
      const days = entry.medianDaysAtPosition as number
      if (!best || days > best.days) {
        best = { lane, position: entry.position, days }
      }
    }
  }
  return best
}

/** Les totaux de l'entête. Ils lisent les MÊMES champs que les cartes. */
export function boardTotals(lanes: ChainLane[]): { tracked: number; awaitingDecision: number; stalled: number } {
  return {
    tracked: lanes.reduce((sum, lane) => sum + countOf(lane.total), 0),
    awaitingDecision: lanes.reduce((sum, lane) => sum + countOf(lane.awaitingDecision), 0),
    stalled: lanes.reduce((sum, lane) => sum + countOf(lane.stalled), 0),
  }
}

/**
 * COMBIEN DE DOSSIERS LE MOTEUR NE SAIT PAS PLACER (#1507 §6).
 *
 * ⚠️ Un total, mais jamais à la place des raisons : « à déterminer » est un
 * geste différent selon qu'on n'a rien lu ou qu'on a lu un état qu'aucune étape
 * ne décrit. Le panneau montre le détail ; ce compteur ne sert qu'à savoir s'il
 * faut l'ouvrir.
 *
 * `undefined` vaut ZÉRO, et zéro est VRAI ici : une API qui ne compte pas encore
 * les indéterminés n'en signale aucun. La distinction « non mesuré ≠ 0 » vaut
 * pour les DURÉES, qui restent `null`.
 */
export function undeterminedOf(lane: ChainLane): number {
  return (lane.undetermined ?? []).reduce((sum, entry) => sum + countOf(entry.count), 0)
}
