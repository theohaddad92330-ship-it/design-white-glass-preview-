import { i18n } from '@/i18n'

/**
 * La locale d'AFFICHAGE — celle de l'application, jamais celle du runtime.
 *
 * `(2241).toLocaleString()` et `date.toLocaleDateString()` sans argument lisent
 * la locale du NAVIGATEUR. Un commercial français dont Chrome est en anglais
 * lisait « 2,241 » sous « Contacts découverts » et « 8/29/2026 » sous « Vu le ».
 * L'application, elle, sait dans quelle langue elle parle : c'est celle-là qui
 * doit décider.
 *
 * Le couple vit ici et nulle part ailleurs (GA-26) : `money.ts` le lit, les
 * écrans passent par les fonctions ci-dessous. La garde
 * `locale-is-the-app-not-the-runtime.test.ts` refuse tout appel nu.
 *
 * `en-GB` plutôt que `en-US` : le produit est vendu en Europe, et `en-US`
 * écrirait « 8/29/2026 » là où toute la clientèle lit le jour en premier.
 */
export function appLocale(): 'fr-FR' | 'en-GB' {
  return i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
}

/**
 * Un nombre entier, groupé selon la langue de l'app.
 *
 * ⚠️ Suppose une valeur MESURÉE. Une valeur absente ne s'affiche jamais « 0 » :
 * c'est à l'appelant de rendre « non mesuré » avant d'appeler.
 */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(appLocale()).format(value)
}

/**
 * Une date, jour compris, dans la langue de l'app.
 *
 * Accepte ce que les écrans ont sous la main — un `Date`, ou la chaîne ISO que
 * rend l'API. Une chaîne illisible rend `null` plutôt qu'« Invalid Date » :
 * une donnée qu'on ne sait pas lire vaut `null`, jamais une valeur de
 * remplissage, et c'est à l'appelant de dire « non mesuré ».
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  // ⚠️ `new Date(null)` rend l'époque Unix — « 01/01/1970 » à la place d'une
  //    absence. Une valeur absente sort d'ici en `null`, jamais en date.
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(appLocale(), options).format(date)
}

/** Une date AVEC son heure — pour un horodatage de diagnostic, pas pour un écran métier. */
export function formatDateTime(value: Date | string | number | null | undefined): string | null {
  return formatDate(value, { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Un MOIS seul, dans la langue de l'app — `YYYY-MM` en entrée, la forme que
 * l'API rend pour un mois de facturation ou de relevé. (30/08/2026, D782)
 *
 * Avant cette fonction, un écran qui recevait un mois n'avait que deux
 * choix : l'afficher BRUT (« 2026-07 », lisible par une machine, par personne
 * d'autre — c'est le défaut mesuré sur la fiche d'une mission) ou réécrire son
 * propre `Intl.DateTimeFormat` sur place, ce que `PlanningPage.tsx` fait déjà
 * une fois. Une dérivation vit à un seul endroit (GA-26) : elle vit ICI,
 * comme `formatDate` deux fonctions plus haut, pas dans un second composant.
 *
 * ⚠️ `timeZone: 'UTC'` : un mois n'a ni jour ni heure de référence — seul le
 * `-01T00:00:00Z` qu'on lui donne ici en tient lieu. Sans ce réglage,
 * `Intl.DateTimeFormat` relit ce minuit UTC dans le fuseau du NAVIGATEUR, et
 * un utilisateur à l'ouest de l'UTC verrait le mois PRÉCÉDENT — exactement le
 * genre d'écart d'un jour que ce dépôt a déjà payé ailleurs sur des dates.
 *
 * Même régime que `formatDate` : une valeur illisible rend `null`, jamais une
 * date de remplissage — c'est à l'appelant de dire « non mesuré ».
 */
export function formatMonth(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(`${value}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(appLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

/**
 * UNE PÉRIODE — « 8 mai → 1 oct. 2026 ». (#1381)
 *
 * ⚠️ Elle existe pour la même raison que {@link formatMonth} : sans elle, un
 * écran qui montre un début ET une fin n'a que deux choix — poser deux
 * `formatDate` côte à côte avec un tiret entre les deux (ce que faisaient la
 * table de `/missions/suivi` et la fiche d'une mission, en `08/05/2026 –
 * 01/10/2026`, deux dates NUMÉRIQUES que rien ne relie), ou réécrire son propre
 * `Intl.DateTimeFormat`. Une dérivation vit à un seul endroit (GA-26).
 *
 * Deux choix de forme, et chacun a sa raison :
 *  - **l'année ne s'écrit qu'une fois** quand les deux bornes la partagent.
 *    « 8 mai 2026 → 1 oct. 2026 » fait lire deux fois le même millésime pour
 *    rien, et c'est la moitié de la longueur d'une cellule de tableau.
 *  - **une flèche, pas un tiret.** Un tiret entre deux dates se lit aussi bien
 *    « de … à … » que « moins » ; la flèche dit le sens, ce qui est exactement
 *    l'information qu'une période porte.
 *
 * ⚠️ **`null` dès qu'une des deux bornes manque.** Une période à une seule
 * borne n'est pas une période : c'est un début sans fin (ou l'inverse), et
 * seul l'appelant sait comment le NOMMER — « sans date de fin » n'est pas la
 * même chose sur une mission en cours et sur une mission terminée. Rendre
 * « 8 mai → … » ici obligerait ce fichier à parler français.
 */
export function formatDateRange(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
): string | null {
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const endLabel = formatDate(end, full)
  if (endLabel === null) return null
  const startLabel = formatDate(start, sameYear(start, end) ? { day: 'numeric', month: 'short' } : full)
  if (startLabel === null) return null
  return `${startLabel} → ${endLabel}`
}

/** Les deux bornes tombent-elles la même année ? Une borne illisible : non. */
function sameYear(start: Date | string | number | null | undefined, end: Date | string | number | null | undefined) {
  const a = start === null || start === undefined || start === '' ? null : new Date(start)
  const b = end === null || end === undefined || end === '' ? null : new Date(end)
  if (a === null || b === null || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false
  return a.getFullYear() === b.getFullYear()
}
