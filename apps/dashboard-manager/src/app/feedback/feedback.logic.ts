import type { FeedbackItem } from '@/lib/feedback'

/**
 * #1658.2 — LES TROIS CHOSES QUE L'ÉCRAN DES RETOURS N'AVAIT PAS : le délai de
 * réponse, le regroupement par ÉCRAN, et le lien vers l'espace qui a remonté.
 *
 * Tout ce qui se DÉCIDE vit ici, en fonctions pures : l'environnement de test du
 * back-office est `node`, rien n'y est mis en page, et c'est donc ici — pas dans
 * le JSX — que les vrais défauts se trouvent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI LE DÉLAI EST UNE UNION ET NON UN `number | null`
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois situations se ressemblent et ne disent pas la même chose :
 *   · quelqu'un a répondu, et on sait quand ;
 *   · personne n'a répondu, et le retour attend depuis N heures ;
 *   · on n'a pas pu regarder (GitHub muet, intégration éteinte).
 * Un champ nullable les écrase en deux cas, et le lecteur écrit alors
 * `delai ?? 0` — c'est-à-dire « répondu en zéro minute » sur un retour que
 * personne n'a lu. Le cliquet GA-19 compte précisément ces `?? 0` dans
 * `apps/dashboard-manager`, et la bonne réponse n'est pas de le monter : c'est
 * de rendre le zéro IMPOSSIBLE À ÉCRIRE. Après `if (delai.etat === 'repondu')`,
 * TypeScript sait que `msEcoules` est un nombre, et aucun repli n'a plus lieu
 * d'être. On retire le MOYEN, pas seulement l'occasion — c'est le geste que
 * #1650 a posé la veille sur `CelluleAnalyses`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS CODÉ ICI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * La nature `feedback_unanswered` de la file de décision (#1647) **n'existe pas
 * dans ce fichier**. L'issue la décrit (« sans réponse depuis 48 h »), mais la
 * file typée est livrée ailleurs, et deux dérivations du même seuil
 * divergeraient au premier ajustement (GA-26). Ce module se contente
 * d'EXPOSER de quoi la construire : un retour à brancher est exactement un
 * `{ etat: 'en_attente' }`, et `msEcoules` y porte l'attente. La file lira ce
 * champ ; elle ne le recalculera pas.
 */

/**
 * Sous ce nombre de retours RÉPONDUS, il n'y a pas de médiane.
 *
 * Trois, et la raison n'est pas statistique : une médiane sur deux valeurs est
 * leur moyenne, elle bouge de moitié à chaque nouvelle réponse, et elle se lit
 * pourtant comme un délai typique. « Trop peu de retours » est une réponse ;
 * « 4 h » calculé sur deux retours est une affirmation fausse.
 *
 * ⚠️ CE SEUIL N'EST NI `COHORT_MIN_SPACES` NI `MIN_DISTINCT_SESSIONS_FOR_A_METRIC`,
 * et ce n'est pas une recopie même s'ils valent des nombres voisins. Les trois
 * protègent trois choses différentes :
 *  · `COHORT_MIN_SPACES` (3 espaces) protège l'ANONYMAT des membres d'une
 *    cohorte — sous le seuil, la ligne désigne des clients ;
 *  · `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` (5 sessions, `@bellum/contracts`)
 *    protège les PERSONNES dans l'analytique produit — sous le seuil, une
 *    moyenne parle de quelqu'un ;
 *  · celui-ci protège la LECTURE d'un chiffre sur NOTRE propre réactivité. Il ne
 *    concerne aucune personne : les retours mesurés sont les nôtres, pas ceux
 *    d'un utilisateur. Les aligner reviendrait à masquer une médiane
 *    parfaitement publiable au motif qu'un autre seuil, qui protège autre chose,
 *    est plus haut.
 */
export const MIN_RETOURS_POUR_UNE_MEDIANE = 3

/** Le délai de réponse d'UN retour. Trois états, jamais deux. */
export type DelaiReponse =
  /** Quelqu'un a répondu. `msEcoules` = de l'ouverture à la première réponse. */
  | { etat: 'repondu'; msEcoules: number; premiereReponseAt: string }
  /** Personne n'a répondu. `msEcoules` = l'attente À CE JOUR, qui grandit. */
  | { etat: 'en_attente'; msEcoules: number }
  /** On n'a pas pu regarder, ou il n'y a nulle part où répondre. */
  | { etat: 'inconnu'; raison: string }

/** La médiane des délais, en tête d'écran. Trois états, pour la même raison. */
type MedianeDelai =
  | { etat: 'mesuree'; msEcoules: number; retenus: number }
  | { etat: 'trop_peu'; retenus: number }
  | { etat: 'inconnue'; raison: string }

/**
 * Le délai d'un retour.
 *
 * `maintenant` est un PARAMÈTRE : une dérivation qui lit l'horloge passe à Paris
 * et échoue sur un exécuteur CI en UTC. `responsesAvailable` vient de l'API et
 * porte la distinction qui compte — sans lui, « personne n'a répondu » et
 * « GitHub n'a pas répondu » se ressembleraient, et l'écran annoncerait une
 * dette de réponse un jour de panne.
 */
export function delaiDeReponse(
  item: FeedbackItem,
  options: { maintenant: Date; responsesAvailable: boolean },
): DelaiReponse {
  const ouverture = instantValide(item.created_at)
  if (!ouverture) return { etat: 'inconnu', raison: 'date d’ouverture illisible' }

  // Un retour sans issue n'a nulle part où recevoir une réponse : ce n'est pas
  // une attente de 48 h, c'est une question qui n'a jamais été posée.
  if (item.github_issue_number == null) {
    return { etat: 'inconnu', raison: 'aucune issue — il n’y a nulle part où répondre' }
  }
  if (!options.responsesAvailable) {
    return { etat: 'inconnu', raison: 'les réponses n’ont pas pu être lues (GitHub muet ou intégration éteinte)' }
  }

  const premiereReponseAt = item.first_response_at ?? null
  const reponse = instantValide(premiereReponseAt)
  if (reponse === null || premiereReponseAt === null) {
    return { etat: 'en_attente', msEcoules: Math.max(0, options.maintenant.getTime() - ouverture) }
  }

  // Une réponse ANTÉRIEURE à l'ouverture est une horloge cassée, pas un délai
  // négatif : on ne rend pas un nombre qu'on sait faux.
  const ecart = reponse - ouverture
  if (ecart < 0) return { etat: 'inconnu', raison: 'réponse datée avant l’ouverture — horodatage incohérent' }
  return { etat: 'repondu', msEcoules: ecart, premiereReponseAt }
}

/**
 * La médiane des délais RÉPONDUS.
 *
 * ⚠️ Les retours EN ATTENTE ne comptent pas : leur délai n'est pas encore connu,
 * il ne fait que grandir. Les inclure ferait baisser la médiane chaque fois
 * qu'un retour reste sans réponse — l'inverse de ce qu'elle doit dire. C'est la
 * même règle qu'un axe non mesuré qui sort du dénominateur.
 */
export function medianeDesDelais(delais: readonly DelaiReponse[]): MedianeDelai {
  const inconnus = delais.filter(delai => delai.etat === 'inconnu').length
  const repondus = delais
    .map(delai => (delai.etat === 'repondu' ? delai.msEcoules : null))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b)

  // Tout est illisible : on ne dit pas « trop peu de retours », qui laisserait
  // croire qu'on a compté. On dit qu'on n'a pas pu regarder.
  if (repondus.length === 0 && inconnus === delais.length && delais.length > 0) {
    return { etat: 'inconnue', raison: 'aucun délai n’a pu être lu' }
  }
  if (repondus.length < MIN_RETOURS_POUR_UNE_MEDIANE) return { etat: 'trop_peu', retenus: repondus.length }

  // ⚠️ Aucun `?? 0` ici, et c'est délibéré : le seuil ci-dessus garantit au
  // moins trois valeurs, donc les deux indices du milieu EXISTENT. Écrire un
  // repli sur zéro « au cas où » ferait tomber la médiane à quelques
  // millisecondes le jour où l'indice serait faux — un chiffre absurde, mais
  // affiché comme s'il était mesuré. On préfère que ce cas casse bruyamment.
  const milieu = Math.floor(repondus.length / 2)
  const haut = repondus[milieu] as number
  const msEcoules = repondus.length % 2 === 1 ? haut : ((repondus[milieu - 1] as number) + haut) / 2
  return { etat: 'mesuree', msEcoules, retenus: repondus.length }
}

/** Un groupe de retours qui parlent du MÊME écran. */
type GroupeEcran = {
  /** La route normalisée (`/analysis/:id`), ou `null` quand elle est inconnue. */
  ecran: string | null
  /** Ce qui s'affiche en titre. Un écran inconnu porte son nom, pas une route
   *  devinée : on ne range pas un retour sous une page où il n'a pas été écrit. */
  libelle: string
  items: FeedbackItem[]
}

/** `/analysis/9f2c…-…` → `/analysis/:id`. Un identifiant dans une route ferait
 *  autant de groupes que de dossiers, ce qui est l'inverse d'un regroupement. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Un segment purement numérique est un identifiant lui aussi (`/run/1287`). */
const NOMBRE = /^\d+$/

/**
 * L'écran d'un retour, normalisé.
 *
 * ⚠️ L'ORDRE DES SOURCES EST UNE DÉCISION. `client_context.appContext.route` est
 * la route telle que l'APPLICATION la connaît — c'est-à-dire déjà un motif, pas
 * une instance. `page_url` n'est qu'un repli, pour les retours antérieurs à ce
 * champ. Lire l'URL d'abord referait le travail que le client a déjà fait, et
 * moins bien.
 *
 * `null` quand aucune des deux n'est lisible : « écran inconnu » est une
 * réponse, une route devinée n'en est pas une.
 */
export function ecranDe(item: FeedbackItem): string | null {
  const route = item.client_context?.appContext?.route?.trim()
  if (route) return normaliserRoute(route)

  const url = item.page_url?.trim()
  if (!url) return null
  try {
    return normaliserRoute(new URL(url).pathname)
  } catch {
    return url.startsWith('/') ? normaliserRoute(url.split('?')[0] ?? '') : null
  }
}

function normaliserRoute(chemin: string): string | null {
  const sansQuery = chemin.split('?')[0] ?? ''
  const segments = sansQuery
    .split('/')
    .filter(Boolean)
    .map(segment => (UUID.test(segment) || NOMBRE.test(segment) ? ':id' : segment))
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

/**
 * Les retours groupés par écran, du plus signalé au moins signalé.
 *
 * C'est la lecture que l'issue demande : « un regroupement par ÉCRAN concerné,
 * pas seulement par date ». Trier par VOLUME plutôt que par nom est ce qui la
 * rend utile — la question posée est « quel écran fait le plus mal », et un tri
 * alphabétique la noierait. À volume égal, l'ordre est l'alphabet, pour que deux
 * chargements de la même page ne rendent pas deux ordres.
 *
 * ⚠️ Le groupe « écran inconnu » se range EN DERNIER quel que soit son volume :
 * il n'est pas un écran, c'est un défaut d'instrumentation. Le laisser prendre la
 * première place ferait passer une lacune pour la pire page du produit.
 */
export function grouperParEcran(items: readonly FeedbackItem[]): GroupeEcran[] {
  const parEcran = new Map<string | null, FeedbackItem[]>()
  for (const item of items) {
    const ecran = ecranDe(item)
    const liste = parEcran.get(ecran) ?? []
    liste.push(item)
    parEcran.set(ecran, liste)
  }

  return [...parEcran.entries()]
    .map(([ecran, liste]) => ({
      ecran,
      libelle: ecran ?? 'Écran non estampillé',
      items: liste,
    }))
    .sort((a, b) => {
      if (a.ecran === null) return 1
      if (b.ecran === null) return -1
      if (b.items.length !== a.items.length) return b.items.length - a.items.length
      return a.libelle.localeCompare(b.libelle, 'fr')
    })
}

/** `null`/illisible rend `null` — jamais l'époque Unix, qui afficherait 1970. */
function instantValide(valeur: string | null): number | null {
  if (!valeur) return null
  const ms = new Date(valeur).getTime()
  return Number.isNaN(ms) ? null : ms
}
