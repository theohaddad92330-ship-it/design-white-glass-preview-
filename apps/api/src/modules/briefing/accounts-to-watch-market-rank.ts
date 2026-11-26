/**
 * #1637 — LA MÉMOIRE MARCHÉ SUR « COMPTES À SURVEILLER » (/briefing).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MÊME MÉCANISME QUE LE COCKPIT (#1573.5 / #1574.1), APPLIQUÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour #1637, mot pour mot : « Market Memory ne crée jamais un signal ou
 * une urgence. Elle améliore uniquement le ranking d'un événement réel. »
 *
 * Chaque compte de cette liste porte DÉJÀ un signal réel — c'est le critère
 * qui l'a fait entrer dans `accountsToWatch`, avant que ce fichier n'existe.
 * Cette fonction ne SÉLECTIONNE rien : elle ne fait que réordonner un ensemble
 * déjà décidé ailleurs (`BriefingService.buildAccountsToWatch`). La mémoire
 * marché ne peut donc jamais faire apparaître un compte qui n'a pas bougé.
 *
 * L'ordre, dans le même esprit que `withDormantMarketPaths` côté cockpit :
 *  1. une détection EXACTE (le signal vient d'apparaître) passe avant une
 *     détection « suivie depuis » (backfill : on sait seulement qu'elle était
 *     DÉJÀ là) — c'est la clé d'URGENCE, et la mémoire marché ne la dépasse
 *     jamais ;
 *  2. le POTENTIEL STRUCTUREL observé, seulement pour départager deux comptes
 *     à égalité sur (1) — voir GA-262 ;
 *  3. la date de détection, la plus récente d'abord ;
 *  4. le nom de l'entreprise, pour un ordre déterministe en dernier recours.
 *
 * ⚠️ GA-262 balaie ce fichier : la clé de marché doit rester APRÈS la clé
 * d'urgence dans le comparateur, et son rang doit rester une PRÉSENCE
 * (`!= null ? 1 : 0`), jamais un volume.
 */

/** La forme minimale qu'une entrée de `accountsToWatch` doit porter ici. */
export type WatchedAccount = {
  accountId: string
  companyName: string
  /** QUAND le signal a été repéré, ou `null` si la date est illisible. */
  detectedAt: string | null
  /** `false` = backfill : le signal était DÉJÀ là, on ne sait pas depuis quand. */
  detectionExact: boolean
}

/**
 * #1637 — le MÊME rang que le cockpit (`marketPotentialRank`, `dormantMarketRank`
 * dans `cockpit-perspective.service.ts`) : une PRÉSENCE, jamais un volume.
 *
 * Trier sur le NOMBRE de parcours ferait remonter les grandes entreprises — le
 * corpus en porte mécaniquement plus — c'est-à-dire ferait de ce tri une
 * mesure de TAILLE. C'est exactement le refus déjà inscrit contre
 * `externalization_score` (#1640.6, GA-257).
 */
export function accountsToWatchMarketRank(marketPaths: number | null): number {
  return marketPaths != null ? 1 : 0
}

/** `null` = date illisible, rangée APRÈS toute date connue à l'intérieur du
 *  même palier d'exactitude — une absence de date n'est ni la plus récente
 *  ni la plus ancienne, elle est inconnue. */
function compareDetectedAt(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return Date.parse(right) - Date.parse(left)
}

/**
 * Réordonne `accountsToWatch` — jamais ne le filtre ni ne l'étend.
 *
 * `marketPaths` est absent pour tout compte non couvert (lecture indisponible,
 * ou compte sous le seuil) : ces comptes valent `accountsToWatchMarketRank(null)`,
 * c'est-à-dire `0`, exactement comme un compte explicitement `null`. Une
 * mémoire marché indisponible pour TOUS les comptes rend donc un ordre
 * identique à celui d'avant ce lot — la fonction est un no-op silencieux sur
 * une carte vide.
 */
export function rankAccountsToWatchByMarket<T extends WatchedAccount>(
  accounts: readonly T[],
  marketPaths: ReadonlyMap<string, number | null>,
): T[] {
  return [...accounts].sort(
    (left, right) =>
      Number(right.detectionExact) - Number(left.detectionExact) ||
      accountsToWatchMarketRank(marketPaths.get(right.accountId) ?? null) -
        accountsToWatchMarketRank(marketPaths.get(left.accountId) ?? null) ||
      compareDetectedAt(left.detectedAt, right.detectedAt) ||
      left.companyName.localeCompare(right.companyName),
  )
}

/**
 * #1637 — LES DEUX BLOCS DE `/briefing` MONTRENT LE MÊME ORDRE.
 *
 * Le lot qui a posé `rankAccountsToWatchByMarket` a réordonné `accountsToWatch`
 * dans le CONTRÔLEUR, alors que les cartes « À faire maintenant » sont
 * construites dans le SERVICE, à partir de la liste d'AVANT le tri. Avant ce
 * lot les deux ordres étaient arbitraires — mais IDENTIQUES ; après, ils
 * divergeaient. Un même écran affichait les mêmes comptes dans deux ordres,
 * ce qui se lit comme deux classements contradictoires.
 *
 * ⚠️ Le geste tient dans le contrôleur EXPRÈS. Déplacer le calcul dans
 * `BriefingService` consommerait le dernier slot de GA-07 (254/254, au
 * plafond) : un service qui importerait le service d'un autre module dans un
 * fichier qui n'en importait aucun ferait échouer la CI.
 *
 * Les cartes de compte gardent LEURS EMPLACEMENTS dans la liste : seul leur
 * ordre relatif change. Sans ça, un compte remonterait au-dessus d'une réunion
 * à préparer ou d'une relance en retard — et « la mémoire marché ne fabrique
 * jamais d'urgence » vaut aussi entre familles de cartes, pas seulement à
 * l'intérieur d'une liste de comptes.
 */
export function reorderAccountActions<A extends { id: string; kind: string }>(
  actions: readonly A[],
  orderedAccounts: readonly WatchedAccount[],
): A[] {
  const rang = new Map(orderedAccounts.map((account, index) => [`account:${account.accountId}`, index]))
  const emplacements: number[] = []
  const cartes: A[] = []
  actions.forEach((action, index) => {
    if (action.kind !== 'account') return
    emplacements.push(index)
    cartes.push(action)
  })
  if (cartes.length < 2) return [...actions]

  // ⚠️ Une carte dont le compte n'est PAS dans la liste ordonnée garde sa place
  // relative en fin de groupe plutôt que de remonter : `?? Number.MAX_SAFE_INTEGER`
  // est un « je ne sais pas », jamais un « premier ».
  cartes.sort(
    (left, right) => (rang.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rang.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  )
  const resultat = [...actions]
  emplacements.forEach((emplacement, index) => {
    const carte = cartes[index]
    if (carte) resultat[emplacement] = carte
  })
  return resultat
}
