import type { BridgeColleague, MemoryCrossing } from '@bellum/contracts'

/**
 * #2128.20 / #2128.21 — LA PHRASE D'UN CROISEMENT, ÉCRITE À UN SEUL ENDROIT.
 *
 * Ces deux fonctions vivaient dans `MemoryBridgeView.tsx`, le seul écran qui les
 * lisait. Le bandeau Collaboration du dossier (`/accounts/<id>`) annonce
 * désormais les mêmes croisements : les recopier aurait donné deux façons de
 * raconter le même fait, et la première divergence serait passée inaperçue —
 * l'écran de la mémoire collective et le dossier ne s'ouvrent pas ensemble.
 * Une dérivation vit à un seul endroit (GA-26).
 *
 * Rien n'a changé dans le corps des deux fonctions : c'est un DÉPLACEMENT.
 */

/** Le nom du collègue, ou son RÔLE quand le croisement ne désigne pas quelqu'un. */
export function colleagueName(colleague: BridgeColleague, t: (key: string) => string): string {
  return colleague.kind === 'member' ? colleague.displayName : t(`roles.${colleague.role}`)
}

/**
 * La phrase du fait, composée par i18next à partir des champs TYPÉS du détail.
 *
 * ⚠️ C'est ici que « le pont, pas le dossier » devient visible : il n'existe
 * aucun champ `text` à afficher, donc aucune tentation d'en afficher un. Chaque
 * variante lit des enums, des dates, des entiers et des étiquettes d'objet
 * bornées à 80 caractères — rien d'autre n'est disponible.
 */
export function factSentence(
  crossing: MemoryCrossing,
  t: (key: string, options?: Record<string, unknown>) => string,
  month: string | null,
): string {
  const detail = crossing.detail
  const colleague = colleagueName(crossing.colleague, t)

  switch (detail.kind) {
    case 'openDoor':
      return t(detail.stillActive ? 'crossings.openDoor.factActive' : 'crossings.openDoor.factEnded', {
        colleague,
        role: detail.mission.label,
        account: crossing.subject.label,
        // Un mois illisible ne se remplace pas par une date inventée : la
        // phrase perd le complément, elle ne ment pas.
        month: month ?? t('common.unknownMonth'),
      })
    case 'prospectionCollision':
      return t('crossings.prospectionCollision.fact', {
        colleague,
        account: crossing.subject.label,
        // `days` et non `count` : c'est une FENÊTRE d'observation, pas un
        // nombre d'événements. Le passer en `count` ferait pluraliser une
        // phrase qui ne parle d'aucune quantité — et compter les gestes d'un
        // collègue serait de toute façon un classement entre pairs.
        days: detail.withinDays,
      })
    case 'crossStaffing':
      return t('crossings.crossStaffing.fact', {
        consultant: detail.consultant.label,
        need: detail.need.label,
        colleague,
      })
    case 'knownReferencing':
      // Deux absences distinctes : sans rang connu, on ne dit pas « rang 0 » ;
      // sans année, on n'invente pas « depuis 2024 ».
      if (detail.rank === null) {
        return t(
          detail.sinceYear === null ? 'crossings.knownReferencing.factBare' : 'crossings.knownReferencing.factYearOnly',
          {
            year: detail.sinceYear,
          },
        )
      }
      return t(
        detail.sinceYear === null ? 'crossings.knownReferencing.factRankOnly' : 'crossings.knownReferencing.factFull',
        { rank: detail.rank, year: detail.sinceYear },
      )
  }
}

/**
 * Le MOIS du fait, tel que la phrase de G1 l'attend — ou `null`.
 *
 * Lu sur `observedAt`, la date à laquelle le fait a été CONSTATÉ : c'est la
 * seule date que porte le croisement lui-même, et un fait sans date est une
 * rumeur. Une date illisible rend `null` plutôt qu'un mois deviné, et
 * {@link factSentence} écrit alors « à une date non connue » — vrai, et lisible.
 *
 * Vit ici depuis que le dossier annonce les mêmes croisements que l'écran de la
 * mémoire collective : deux formatages du même mois auraient fini par ne pas
 * dire le même (GA-26).
 */
export function crossingMonth(crossing: MemoryCrossing, language: string): string | null {
  const observed = new Date(crossing.observedAt)
  return Number.isFinite(observed.getTime()) ? observed.toLocaleDateString(language, { month: 'long' }) : null
}
