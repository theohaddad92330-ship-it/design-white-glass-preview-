/* ------------------------------------------------------------------ */
/*  Horodatage de calcul — « recalculé à 06:12 »                       */
/*                                                                     */
/*  Tome 7, partie A, loi 2 « partout, sans exception », élément n°10 : */
/*  « Horodatage de calcul — “recalculé à 06:12” — à créer — absent    */
/*   de tous les KPI et agrégats. »                                    */
/* ------------------------------------------------------------------ */

/**
 * Le JUMEAU de la complétude, et il répond à l'autre moitié de la question.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE DÉRIVATION EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * « Calculé sur 12 dossiers notés sur 43 » (`deriveCompleteness`) répond à
 * _sur quoi_. Celle-ci répond à _quand_. Les deux qualifient le MÊME chiffre et
 * se posent au même endroit — le `footer` d'une tuile —, parce qu'un nombre
 * affiché sans l'un ni l'autre se lit comme une mesure complète et actuelle.
 *
 * Un chiffre sans sa date de calcul laisse croire qu'il est d'aujourd'hui. Sur
 * un agrégat rafraîchi une fois par nuit, c'est faux la moitié de la journée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS DATES QU'ON NE CONFOND PAS
 * ─────────────────────────────────────────────────────────────────────────
 *  1. **Quand la donnée SOURCE a été observée** — c'est `Provenance` (la source
 *     ET la date), et ce n'est pas ce fichier.
 *  2. **Quand l'AGRÉGAT a été calculé** — c'est ce fichier, et rien d'autre.
 *  3. **Quand l'ÉCRAN a chargé** — ce n'est presque jamais l'information utile,
 *     et c'est la plus facile à afficher par erreur, parce qu'elle est toujours
 *     disponible : il suffit d'un `new Date()`.
 *
 * ⚠️ **Quand un agrégat est calculé à la volée à chaque requête, (2) VAUT (3)**,
 * et l'horodatage n'apprend rien : « il y a une seconde », à chaque
 * rafraîchissement, pour toujours. C'est du bruit, et pire — c'est ainsi qu'une
 * heure de requête se déguise en date de calcul et devient un chiffre inventé.
 *
 * Cette dérivation REFUSE ce cas, structurellement : un horodatage indiscernable
 * de l'instant présent rend `live`, et la primitive n'affiche alors rien. Le
 * refus vit ici et non dans les écrans, exactement pour la raison qui a fait
 * naître `deriveCompleteness` : une règle de bord recopiée dans quatre écrans
 * finit par exister en quatre versions.
 */

/**
 * En deçà de cet écart, un horodatage est celui de la REQUÊTE.
 *
 * Soixante secondes, et le nombre a une raison plutôt qu'un arrondi : c'est
 * l'ordre de grandeur au-dessus de la latence d'un appel (quelques centaines de
 * millisecondes) et l'ordre de grandeur en dessous du plus court cycle de
 * recalcul que le produit connaisse (`staleTime` de 30 s côté requête, et des
 * balayages horaires ou nocturnes côté serveur). Un agrégat réellement recalculé
 * à 06:12 reste donc daté à 06:13 ; un agrégat calculé DANS la requête ne passe
 * jamais.
 *
 * La fenêtre se lit en valeur ABSOLUE : deux machines ne sont jamais à la
 * seconde près, et un serveur en avance de cinq secondes ne doit pas produire
 * « date de calcul inconnue » sur un agrégat parfaitement sain.
 */
export const COMPUTED_AT_LIVE_WINDOW_MS = 60_000

/**
 * Le verdict — quatre états, et ils ne disent pas la même chose.
 *
 * `unknown` ne porte AUCUNE date : c'est tout l'objet du type. Une date de
 * calcul qu'on n'a pas ne devient pas « aujourd'hui » par défaut — c'est
 * « non mesuré n'est jamais 0 », transposé au temps.
 */
export type ComputedAtVerdict =
  | { kind: 'unknown' }
  /** Indiscernable de la requête : il n'y a rien à apprendre, donc rien à dire. */
  | { kind: 'live' }
  /** Le jour même : c'est l'HEURE qui informe (« recalculé à 06:12 »). */
  | { kind: 'sameDay'; at: string; ageMs: number }
  /** Un autre jour : c'est la DATE qui informe ; l'heure seule mentirait par omission. */
  | { kind: 'dated'; at: string; ageMs: number }

/**
 * Quand cet agrégat a-t-il été calculé ?
 *
 * Pure : mêmes entrées → même verdict. `now` est un PARAMÈTRE et non un
 * `new Date()` interne, sans quoi la fonction serait intestable et le verdict
 * dépendrait de l'horloge du runner.
 *
 * Les refus, dans l'ordre où ils se présentent, chacun pour une raison distincte :
 *
 *  1. **Date absente ou illisible** → `unknown`. Le taire ferait passer un
 *     chiffre sans âge pour un chiffre du jour.
 *  2. **Référence illisible** → `unknown`. Sans « maintenant », « il y a deux
 *     heures » n'a pas de sens ; on ne rend pas un verdict daté sur une horloge
 *     qu'on ne sait pas lire.
 *  3. **Indiscernable de la requête** (± {@link COMPUTED_AT_LIVE_WINDOW_MS}) →
 *     `live`. Voir le docblock de tête : c'est le piège central.
 *  4. **Dans le futur au-delà de la fenêtre** → `unknown`. Une horloge déréglée
 *     n'est pas un calcul très frais — même refus que `planFreshness`, qui
 *     écarte déjà une génération de plan datée de demain.
 *
 * Ce qui n'est PAS un refus : un agrégat ancien. Trois semaines est une mesure,
 * et c'est même précisément celle qu'on veut voir.
 *
 * La frontière entre `sameDay` et `dated` est le JOUR CIVIL LOCAL, pas une durée
 * en heures : « recalculé à 23:59 » lu le lendemain matin serait un horodatage
 * qui ment par omission — c'est le jour qui manque, pas l'heure.
 */
export function deriveComputedAt(computedAt: string | Date | null | undefined, now: Date): ComputedAtVerdict {
  if (computedAt === null || computedAt === undefined || computedAt === '') return { kind: 'unknown' }

  const at = computedAt instanceof Date ? computedAt : new Date(computedAt)
  if (Number.isNaN(at.getTime())) return { kind: 'unknown' }
  if (Number.isNaN(now.getTime())) return { kind: 'unknown' }

  const ageMs = now.getTime() - at.getTime()
  if (Math.abs(ageMs) <= COMPUTED_AT_LIVE_WINDOW_MS) return { kind: 'live' }
  if (ageMs < 0) return { kind: 'unknown' }

  const iso = at.toISOString()
  return isSameLocalDay(at, now) ? { kind: 'sameDay', at: iso, ageMs } : { kind: 'dated', at: iso, ageMs }
}

/**
 * Le même jour CIVIL, dans le fuseau de celui qui regarde.
 *
 * Les composantes locales, et non `toISOString().slice(0, 10)` : une comparaison
 * en UTC ferait basculer « aujourd'hui » à 02:00 pour un utilisateur parisien en
 * heure d'été, et « recalculé à 06:12 » se lirait « calculé le 29 » pendant deux
 * heures chaque nuit.
 */
function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
