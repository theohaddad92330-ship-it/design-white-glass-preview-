/**
 * LA CLÉ D'IDEMPOTENCE D'UN GESTE (#1952.38, #1959.18).
 *
 * ⚠️ LA RÈGLE, EN UNE PHRASE — c'est l'arbitrage de ce lot :
 * **la clé identifie le GESTE, pas le rendu ni le contenu — un jeton opaque
 * tiré UNE seule fois pour les coordonnées de ce geste (l'écran d'où il part,
 * le type d'action, sa cible, et les valeurs que l'utilisateur a lui-même
 * décidées), gardé dans le `localStorage` de l'ORIGINE tant que personne n'a
 * vu son issue — donc rejoué à l'identique par un double clic, un remontage,
 * un rafraîchissement OU UN AUTRE ONGLET — et relâché seulement quand l'écran
 * a rendu une issue CONNUE, pour qu'un geste délibérément refait porte une
 * clé neuve.**
 *
 * Les quatre défauts que cette règle ferme, et pourquoi aucune règle plus
 * simple ne les ferme tous les quatre :
 *
 *  - **Une clé tirée par rendu** (ce que faisait `ActionCenter`, #1959.18 :
 *    `useMemo(() => crypto.randomUUID())`) est stable entre deux rendus et
 *    seulement entre eux. Un remontage — un onglet qu'on quitte et rouvre, un
 *    rafraîchissement pendant que la requête est en vol — en fabrique une
 *    seconde, et le serveur voit deux gestes là où il n'y en avait qu'un.
 *
 *  - **Aucune clé du tout** (ce que faisaient les trois appelants web,
 *    #1952.38) : la protection existe côté routeur et ne protège rien. Un
 *    double clic ou un renvoi réseau exécute DEUX fois une action qui SORT du
 *    produit.
 *
 *  - **Une clé dérivée du seul contenu** est refusée par le contrat lui-même
 *    (voir `actionDispatchIdempotencyKeySchema`, D520, et la fiche mémoire
 *    `deterministic-jobid-trap`) : « même cible + même type d'action » ferait
 *    d'un deuxième envoi VOULU — une relance trois semaines plus tard — le
 *    rejeu d'un double clic, et le bloquerait pour toujours. D'où le jeton
 *    opaque : le contenu choisit le CASIER, il n'est jamais la clé.
 *
 *  - **#1959.20 — une clé gardée dans `sessionStorage`** protège un onglet et
 *    lui seul : un SECOND onglet ouvert sur la même conversation démarre avec
 *    un `sessionStorage` VIDE (c'est la seule différence physique entre deux
 *    onglets de la même origine) et tirait donc un jeton NEUF pour le même
 *    geste — mesuré le 12/09, encore vrai le 18/09 malgré les commentaires
 *    `#1959.3`/`#1959.4` qui le croyaient déjà fermé. `localStorage`, lui, est
 *    commun à tous les onglets de la même origine : le remplacer ferme ce
 *    chemin SANS toucher `tab-identity.ts`, qui résout un problème différent
 *    (quel COOKIE une requête doit présenter quand ce navigateur porte
 *    plusieurs sessions) — et sans risque de collision entre deux comptes
 *    partageant un navigateur : le serveur dédoublonne sur `(workspace_id,
 *    idempotency_key)`, jamais sur la clé seule, donc un jeton relu par un
 *    AUTRE espace n'y produit jamais un effet.
 *
 *  Ce que `localStorage` ne peut PAS fermer, et qu'aucun mécanisme purement
 *  client ne peut fermer : deux onglets sur deux MACHINES différentes (deux
 *  utilisateurs, chacun son navigateur) ne partagent aucun stockage. Pour les
 *  chemins où le geste n'est pas déjà dédoublonné par le contenu côté serveur
 *  (l'export CRM et l'épinglage mémoire le sont, par exemple), une course
 *  vraiment simultanée entre deux machines reste un risque résiduel — GA-26
 *  interdit d'inventer ici un second mécanisme pour le fermer.
 *
 * Ce que ce module ne fait PAS, et ne fera pas : il ne décide d'envoyer quoi
 * que ce soit. Une écriture sortante passe par sa porte d'approbation, avant
 * comme après ce lot ; on ne dédoublonne que la TENTATIVE.
 */

/** Un geste réclamé : la clé à envoyer, et la façon de déclarer qu'il est fini. */
export type GestureIdempotency = {
  /** À passer tel quel dans `idempotencyKey`. Opaque côté serveur. */
  readonly key: string
  /**
   * Déclare ce geste TERMINÉ : la prochaine réclamation des mêmes coordonnées
   * tirera une clé neuve.
   *
   * ⚠️ À n'appeler que sur une issue CONNUE (`done`, `queued`, `skipped`,
   * `failed`). Jamais sur `unknown`, jamais sur une erreur réseau : la requête
   * a peut-être abouti, et relâcher la clé autoriserait un re-clic à refaire
   * partir un envoi déjà parti. Doctrine « un timeout n'est pas un échec :
   * `unknown` ARRÊTE la reprise » — garder la clé est ce qui fait tenir ce
   * refus sur le second appel, puisque le routeur relit alors le résultat
   * `unknown` au lieu de rejouer l'effet.
   */
  readonly release: () => void
}

/** Espace de noms du stockage — voisin de `bellum.tab.user` (`tab-identity.ts`). */
const SLOT_PREFIX = 'bellum.gesture.'

/**
 * Borne du jeton envoyé. `actionDispatchIdempotencyKeySchema` accepte 200
 * caractères mais `POST /action-os/runs` s'arrête à 120 : on tient la plus
 * étroite des deux, sans quoi une clé refusée par le serveur ne dédoublonnerait
 * plus rien — le défaut d'origine par un autre chemin.
 */
const MAX_KEY_LENGTH = 120
/** Ce qui reste au préfixe lisible une fois le jeton (36 caractères) réservé. */
const MAX_SCOPE_LENGTH = 60

/**
 * Repli quand le stockage de l'origine est refusé (navigation privée verrouillée,
 * quota plein). Il ne survit ni à un rafraîchissement ni à un autre onglet —
 * mais il survit à un remontage, donc la moitié utile du dédoublonnage tient
 * encore, et surtout rien ne jette.
 */
const inMemory = new Map<string, string>()

/**
 * #1959.20 — `localStorage`, PAS `sessionStorage`.
 *
 * `sessionStorage` est propre à l'onglet ; un second onglet sur la même
 * conversation en tirerait un jeton neuf pour le même geste, exactement le
 * défaut mesuré le 12/09 (voir la doc du module). `localStorage` est commun à
 * tous les onglets de la même origine, sans risque de collision entre deux
 * comptes qui partageraient un navigateur : le serveur dédoublonne sur
 * `(workspace_id, idempotency_key)`, jamais sur la clé seule.
 */
function gestureStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function readSlot(slot: string): string | null {
  try {
    const stored = gestureStorage()?.getItem(slot)
    if (stored) return stored
  } catch {
    // Lecture refusée — on retombe sur le repli, jamais sur une exception.
  }
  return inMemory.get(slot) ?? null
}

function writeSlot(slot: string, key: string): void {
  try {
    const storage = gestureStorage()
    if (storage) {
      storage.setItem(slot, key)
      return
    }
  } catch {
    // Quota plein ou stockage refusé : le repli mémoire prend la suite.
  }
  inMemory.set(slot, key)
}

function clearSlot(slot: string): void {
  try {
    gestureStorage()?.removeItem(slot)
  } catch {
    // idem
  }
  inMemory.delete(slot)
}

/**
 * Les coordonnées du geste, sérialisées SANS ambiguïté.
 *
 * `JSON.stringify` et non une concaténation : une note saisie par l'utilisateur
 * peut contenir le séparateur, et `['a|b','c']` ne doit jamais désigner le même
 * casier que `['a','b|c']`. `null` et `''` sont ramenés l'un sur l'autre — « pas
 * de note » et « note vide » décrivent la même décision.
 */
function slotOf(scope: string, decision: readonly (string | number | null | undefined)[]): string {
  return `${SLOT_PREFIX}${scope}.${JSON.stringify(decision.map(part => (part === null || part === undefined ? '' : String(part))))}`
}

function newToken(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // `crypto.randomUUID` n'existe pas partout (contexte non sécurisé, vieux
    // moteur). Un jeton moins joli vaut mieux qu'un geste sans clé.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

// #1959.20 — clé d'idempotence fournie par l'écran, pas par le serveur.
/**
 * Réclame la clé d'idempotence du geste `scope` décidé par `decision`.
 *
 * À appeler AU CLIC, jamais au rendu : un écran qui réclame une clé pour une
 * carte que personne ne confirmera écrirait un casier pour rien.
 *
 * @param scope   d'où part le geste et ce qu'il fait — `'action-os.run'`,
 *                `'chat-card.schedule_reminder'`. Court, stable, lisible dans
 *                `action_dispatch_attempts` quand on enquête.
 * @param decision ce qui distingue CE geste d'un autre du même type : sa cible,
 *                et les valeurs que l'utilisateur a choisies (l'échéance, la
 *                note, le contact). Jamais une date « maintenant », jamais un
 *                aléa — ils feraient un geste neuf à chaque rendu.
 */
export function gestureIdempotency(
  scope: string,
  decision: readonly (string | number | null | undefined)[],
): GestureIdempotency {
  const slot = slotOf(scope, decision)
  // La clé ENTIÈRE est ce qu'on range, pas seulement le jeton : ce qui a été
  // envoyé au serveur et ce qu'on relira au prochain clic sont alors le même
  // objet, et non deux dérivations à garder d'accord (fiche mémoire
  // `cache-key-rewritten-by-hand`).
  const key = readSlot(slot) ?? `${scope.slice(0, MAX_SCOPE_LENGTH)}:${newToken()}`.slice(0, MAX_KEY_LENGTH)
  writeSlot(slot, key)
  return { key, release: () => clearSlot(slot) }
}
