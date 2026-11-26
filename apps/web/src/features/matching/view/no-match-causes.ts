import type { ExclusionReason, MatchRun } from '@bellum/contracts'

/**
 * #2178.1-.6 / #2178.9 — LE DIAGNOSTIC NOMMÉ D'UN ZÉRO RÉSULTAT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #2178 REPROCHAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne jamais afficher seulement "28 profils ne collent pas" » — `MatchDrawer`
 * groupait déjà les motifs avec leur compteur (`Bucket`, bloc « Écartés »),
 * mais REPLIÉS par défaut sous un bloc qu'il faut dérouler : c'est un compteur,
 * pas un diagnostic. Cette fonction ne recalcule RIEN — elle relit `exclusionCounts`
 * (déjà tallié côté serveur) et `notEvaluable` (déjà dans le `MatchRun`), pour
 * les nommer en TÊTE quand la question se pose vraiment (zéro recommandé, zéro
 * limite — même garde que `nextBestMoveOptions`, apps/api/…/next-best-move.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX SOURCES, JAMAIS FONDUES
 * ─────────────────────────────────────────────────────────────────────────────
 * Un profil ÉCARTÉ (`excluded`, sévérité `blocking`/`warning`) et un profil NON
 * ÉVALUABLE (`notEvaluable`, sévérité `not_evaluable`) ne disent pas la même
 * chose : le premier NE CONVIENT PAS, le second n'a simplement PAS PU être
 * jugé — données manquantes, pas un refus. Les fondre ferait passer une
 * absence de preuve pour un rejet. `source` distingue les deux même quand le
 * NOM du motif coïncide.
 *
 * #2178.6 (« données du vivier incomplètes ») et #2178.9 (« aucune preuve
 * disponible ») sont, dans ce dépôt, LA MÊME réalité : `no_skills_recorded`
 * est l'UNIQUE motif de sévérité `not_evaluable` (`EXCLUSION_SEVERITY`,
 * packages/contracts/src/schemas/match.ts). On ne fabrique pas deux causes
 * distinctes là où le code n'en connaît qu'une (doctrine « on n'affiche pas ce
 * qu'on n'a pas ») — les deux points de l'issue se lisent sur LA MÊME ligne.
 */
interface NoMatchCause {
  reason: ExclusionReason
  source: 'excluded' | 'notEvaluable'
  count: number
}

export function noMatchCauses(
  run: Pick<MatchRun, 'recommended' | 'borderline' | 'exclusionCounts' | 'notEvaluable'>,
): NoMatchCause[] {
  // La question ne se pose pas : au moins un profil est défendable.
  if (run.recommended.length > 0 || run.borderline.length > 0) return []

  const causes: NoMatchCause[] = run.exclusionCounts.map(entry => ({
    reason: entry.reason,
    source: 'excluded' as const,
    count: entry.count,
  }))

  const notEvaluableCounts = new Map<ExclusionReason, number>()
  for (const result of run.notEvaluable) {
    for (const exclusion of result.exclusions) {
      if (exclusion.severity !== 'not_evaluable') continue
      notEvaluableCounts.set(exclusion.reason, (notEvaluableCounts.get(exclusion.reason) ?? 0) + 1)
    }
  }
  for (const [reason, count] of notEvaluableCounts) {
    causes.push({ reason, source: 'notEvaluable', count })
  }

  // Le motif le plus fréquent en tête — même critère que `nextBestMoveOptions`
  // côté serveur : c'est le critère le plus limitant.
  return causes.sort((a, b) => b.count - a.count)
}
