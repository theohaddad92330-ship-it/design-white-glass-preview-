/**
 * Les dates de la console, à UN seul endroit (#1668 §4.2, loi 1 du tome 7).
 *
 * LE DÉFAUT QU'ELLES CORRIGENT
 * Vercel fait tourner le serveur en UTC ; l'opérateur lit son écran à Paris.
 * Un `toLocaleString('fr-FR')` sans fuseau rend donc DEUX chaînes différentes
 * pour le même instant — `14:32` côté serveur, `16:32` côté navigateur. Dans un
 * composant client, cette chaîne est produite deux fois, et React voit un texte
 * qui ne correspond pas : ce sont les erreurs d'hydratation **#418 / #423 /
 * #425** mesurées en production le 07/09/2026 sur `/`, `/feedback` et
 * `/banners`. Le triplet est UN seul écart, pas trois défauts.
 *
 * Et sur les pages rendues côté serveur, où l'hydratation ne peut rien casser,
 * le même oubli produisait une faute plus discrète et plus grave : **toute la
 * console affichait des heures UTC sans le dire**, donc deux heures trop tôt,
 * huit mois durant.
 *
 * ⚠️ POURQUOI UN FUSEAU EN DUR, ET PAS CELUI DU LECTEUR
 * Un back-office d'opérateur n'est pas un produit international : la langue est
 * déjà `fr-FR` partout hors `/monitoring`, et l'équipe qui le lit est à Paris.
 * Surtout, prendre le fuseau du LECTEUR ferait revenir exactement le défaut
 * qu'on corrige — le serveur ne le connaît pas au moment du rendu.
 *
 * ⚠️ UNE DATE SEULE N'A PAS DE FUSEAU. `2026-09-05` est un jour du calendrier,
 * pas un instant : `jourSeul()` la lit en UTC et la rend en UTC. Passer une
 * date seule par le chemin des instants la décale d'un jour près de minuit —
 * c'est ce que faisaient `esn-directory` et `users-directory`.
 */

/** Le fuseau de la console. Un réglage, un endroit. */
export const FUSEAU_CONSOLE = 'Europe/Paris'

/** La langue de la console. `/monitoring` est bilingue par exception assumée. */
export const LANGUE_CONSOLE = 'fr-FR'

type Entree = string | number | Date | null | undefined

function versDate(valeur: Entree): Date | null {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const d = valeur instanceof Date ? valeur : new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Le socle : formate un INSTANT dans le fuseau de la console.
 *
 * `sansValeur` est rendu tel quel quand la date est absente ou illisible — une
 * date qu'on n'a pas ne s'affiche jamais comme une date qu'on aurait.
 */
export function formaterInstant(valeur: Entree, options: Intl.DateTimeFormatOptions = {}, sansValeur = '—'): string {
  const d = versDate(valeur)
  if (!d) return sansValeur
  return d.toLocaleString(LANGUE_CONSOLE, { timeZone: FUSEAU_CONSOLE, ...options })
}

/** `05/09/2026 16:32:10` — la forme par défaut de la console. */
export function dateEtHeure(valeur: Entree, sansValeur = '—'): string {
  return formaterInstant(valeur, {}, sansValeur)
}

/** `05/09/2026` — le jour d'un INSTANT, lu à Paris. */
export function jour(valeur: Entree, sansValeur = '—'): string {
  return formaterInstant(valeur, { day: '2-digit', month: '2-digit', year: 'numeric' }, sansValeur)
}

/** `05/09/26` — le jour d'un instant, compact, pour les colonnes serrées. */
export function jourCompact(valeur: Entree, sansValeur = '—'): string {
  return formaterInstant(valeur, { day: '2-digit', month: '2-digit', year: '2-digit' }, sansValeur)
}

/** `05/09 16:32` — ce que les tableaux de supervision affichent. */
export function jourEtHeureCourte(valeur: Entree, sansValeur = '—'): string {
  const d = versDate(valeur)
  if (!d) return sansValeur
  const date = formaterInstant(d, { day: '2-digit', month: '2-digit' })
  const heure = formaterInstant(d, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${heure}`
}

/** `05/09 16:32:10` — la même, à la seconde, pour les files de jobs. */
export function jourEtHeurePrecise(valeur: Entree, sansValeur = '—'): string {
  const d = versDate(valeur)
  if (!d) return sansValeur
  const date = formaterInstant(d, { day: '2-digit', month: '2-digit' })
  const heure = formaterInstant(d, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return `${date} ${heure}`
}

/**
 * Une DURÉE écoulée, en clair (« 15 min », « 3 h 20 », « 2 j 5 h ») — pas un
 * instant. Sert à répondre « depuis quand ? » sur un job de file coincé
 * (#1662.1) : `ends_at`/`starts_at` sont des instants (→ `formaterInstant`),
 * un ÂGE en millisecondes n'en est pas un.
 *
 * ⚠️ `null`/`undefined`/négatif rendent `sansValeur`, jamais « 0 min » —
 * l'absence de job en attente n'est pas une file qui attend depuis zéro
 * minute (doctrine `UnknownValue`, gardes GA-18/GA-19). Ce repli est une
 * CEINTURE : l'appelant porte désormais la distinction dans son TYPE
 * (`QueueOldestWaiting`, une union à trois états), si bien que cette fonction
 * ne reçoit un âge que lorsqu'il a été mesuré.
 */
export function dureeEcoulee(ms: number | null | undefined, sansValeur = '—'): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return sansValeur
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const heures = Math.floor(minutes / 60)
  const resteMin = minutes % 60
  if (heures < 24) return resteMin > 0 ? `${heures} h ${resteMin}` : `${heures} h`
  const jours = Math.floor(heures / 24)
  const resteH = heures % 24
  return resteH > 0 ? `${jours} j ${resteH} h` : `${jours} j`
}

/**
 * `05/09/2026` à partir d'une DATE SEULE (`YYYY-MM-DD`).
 *
 * ⚠️ Lue ET rendue en UTC, à dessein. Un jour du calendrier n'a pas d'instant :
 * lui en donner un le fait basculer d'un jour dès que le fuseau change de côté
 * de minuit. C'est le seul endroit de ce fichier où le fuseau de la console ne
 * s'applique pas, et c'est pour la même raison qu'il s'applique partout ailleurs.
 */
export function jourSeul(valeur: string | null | undefined, sansValeur = '—'): string {
  if (!valeur) return sansValeur
  const jourIso = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? `${valeur}T00:00:00Z` : valeur
  const d = new Date(jourIso)
  if (Number.isNaN(d.getTime())) return sansValeur
  return d.toLocaleDateString(LANGUE_CONSOLE, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
