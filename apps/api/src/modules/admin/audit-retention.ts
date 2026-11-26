import { BACKOFFICE_AUDIT_CATEGORIES, BACKOFFICE_AUDIT_RETENTION_MONTHS } from '@bellum/contracts'
import type { BackofficeAuditCategory } from '@bellum/contracts'

/**
 * LA RÈGLE DE RÉTENTION DU JOURNAL D'AUDIT, EN LOGIQUE PURE (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART, SANS BASE NI HORLOGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq fenêtres, dont une infinie, et une arithmétique de mois qui a un piège
 * (le 31 mars moins un mois n'est pas le 31 février). Mélanger ça à un
 * repository rendrait la règle invérifiable autrement qu'en lançant une purge.
 *
 * ⚠️ `now` est un PARAMÈTRE, jamais `new Date()` à l'intérieur : un test qui lit
 * l'horloge passe en janvier et échoue en février.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « ON ARCHIVE, ON NE SUPPRIME PAS » — CE QUE CETTE PURGE RESPECTE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt protège un FAIT MÉTIER périmé : il redevient inconnu
 * avec sa date, il ne disparaît pas. Une rétention légale est l'autre moitié de
 * la même exigence — conserver sans fin des données personnelles d'opérateurs
 * n'est pas une vertu, c'est un défaut (art. 5-1-e).
 *
 * Les deux se concilient par une seule règle : **une purge ne laisse jamais un
 * trou silencieux.** Elle écrit, DANS LE JOURNAL LUI-MÊME, une ligne
 * `retention.purge` qui dit ce qui a été effacé, de quelle catégorie, jusqu'à
 * quelle date et quand. Cette ligne-là est de catégorie `suppression`, donc
 * PERMANENTE : l'histoire des purges survit aux purges. Sans elle, un journal
 * d'audit qui rétrécit serait indiscernable d'un journal qu'on a nettoyé.
 */

/** Ce qu'une catégorie doit purger à un instant donné. */
export type RetentionWindow = {
  readonly category: BackofficeAuditCategory
  /** La fenêtre en mois, ou `null` quand la catégorie est conservée pour toujours. */
  readonly months: number | null
  /**
   * Tout ce qui est STRICTEMENT antérieur part. `null` ⇒ rien ne part, jamais.
   *
   * ⚠️ `null` n'est pas « l'époque zéro » : une date de repli ici viderait la
   * catégorie que l'issue demande justement de garder pour toujours.
   */
  readonly cutoff: Date | null
}

/**
 * Retire `months` mois à `at`, en UTC, sans jamais déborder sur le mois suivant.
 *
 * ⚠️ LE PIÈGE : `setUTCMonth(m - 1)` sur un 31 mars donne le 3 mars (février
 * n'a pas de 31). Une purge qui déborde ainsi effacerait jusqu'à trois jours de
 * TROP, chaque 29, 30 et 31 du mois. On CLAMPE donc au dernier jour du mois
 * visé, ce qui rend la fenêtre au pire un jour plus GÉNÉREUSE — jamais plus
 * courte. Entre garder un jour de trop et effacer un jour de trop, un journal
 * d'audit n'hésite pas.
 */
export function subtractMonthsUtc(at: Date, months: number): Date {
  const year = at.getUTCFullYear()
  const month = at.getUTCMonth() - months
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(at.getUTCDate(), lastDayOfTargetMonth),
      at.getUTCHours(),
      at.getUTCMinutes(),
      at.getUTCSeconds(),
      at.getUTCMilliseconds(),
    ),
  )
}

/** La date avant laquelle une ligne de cette catégorie n'a plus lieu d'être. */
export function cutoffFor(category: BackofficeAuditCategory, now: Date): Date | null {
  const months = BACKOFFICE_AUDIT_RETENTION_MONTHS[category]
  if (months === null) return null
  return subtractMonthsUtc(now, months)
}

/**
 * Le plan complet, une entrée par catégorie — y compris celles qui ne purgent
 * pas.
 *
 * ⚠️ Les catégories PERMANENTES restent dans le plan, avec `cutoff: null`.
 * Les retirer ferait de « conservée pour toujours » une absence, et une absence
 * ne se distingue pas d'un oubli. L'écran affiche ce plan tel quel.
 */
export function retentionPlan(now: Date): RetentionWindow[] {
  return BACKOFFICE_AUDIT_CATEGORIES.map(category => ({
    category,
    months: BACKOFFICE_AUDIT_RETENTION_MONTHS[category],
    cutoff: cutoffFor(category, now),
  }))
}

/** Les seules catégories qu'une purge a le droit de toucher. */
export function purgeableWindows(now: Date): (RetentionWindow & { cutoff: Date })[] {
  return retentionPlan(now).filter((window): window is RetentionWindow & { cutoff: Date } => window.cutoff !== null)
}

/** Ce qu'une passe de purge a réellement effacé, catégorie par catégorie. */
export type PurgeTally = {
  readonly category: BackofficeAuditCategory
  readonly months: number
  readonly cutoff: Date
  readonly deleted: number
}

/**
 * La phrase que la ligne `retention.purge` porte — « dis ce qui a été purgé et
 * quand », en un `detail` borné à 500 caractères.
 *
 * ⚠️ Elle ne dit RIEN du contenu effacé : ni acteur, ni sujet, ni note. Un
 * résumé de purge qui recopierait ce qu'il efface annulerait la purge.
 */
export function describePurge(tallies: readonly PurgeTally[]): string {
  const touched = tallies.filter(tally => tally.deleted > 0)
  if (touched.length === 0) return 'Aucune ligne échue : rien n’a été effacé.'
  return touched
    .map(tally => `${tally.category} : ${tally.deleted} ligne(s) antérieure(s) au ${tally.cutoff.toISOString()}`)
    .join(' · ')
    .slice(0, 500)
}
