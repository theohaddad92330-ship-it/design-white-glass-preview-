/**
 * #1632.5 / #1576 — L'AFFINITÉ TECHNOLOGIQUE ENTRE DEUX ENTREPRISES OBSERVÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RÉPOND, ET CE QU'ELLE NE RÉPOND PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ces deux entreprises tournent-elles dans le même environnement
 * technologique ? » — et rien d'autre. Elle ne note pas, ne classe pas, ne rend
 * aucun scalaire : elle rend la LISTE des technologies communes qui distinguent
 * réellement, ou une liste vide quand il n'y a rien à dire.
 *
 * Un score de proximité (« similarité 0,84 ») est refusé nommément par le retour
 * qui commande ce fichier, et par la doctrine du dépôt (`c26_probabilite`) : un
 * nombre sans ses axes se lit comme une probabilité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TECHNO UBIQUITAIRE NE COMPTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une technologie très ubiquitaire doit peser moins qu'une techno
 * discriminante » (#1632). Trois entreprises sur quatre du corpus portent `sql` :
 * le partage de `sql` ne rapproche personne de personne — il dit seulement que
 * les deux font de l'informatique. Ce qui rapproche, c'est ce que peu d'autres
 * partagent.
 *
 * La fréquence est donc MESURÉE sur le corpus (sur combien d'entreprises la
 * techno est observée), jamais devinée depuis une liste de mots écrite à la
 * main : une liste de « technos courantes » vieillit et personne ne la relit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE N'EST PAS `matchingExpertises`, ET IL NE FAUT PAS LE REFAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `matchingExpertises` rapproche une pile observée des EXPERTISES DÉCLARÉES par
 * une ESN — deux vocabulaires différents, saisis par deux humains, d'où son
 * appariement tolérant et ses précautions sur les mots courts (`C#`, `Go`).
 *
 * Ici les deux côtés sortent de la MÊME table (`market_company_stack`), donc du
 * même vocabulaire, produit par la même ingestion. Une comparaison EXACTE après
 * normalisation est la bonne réponse : y remettre de la tolérance rapprocherait
 * `java` et `javascript`, qui ne sont pas la même compétence.
 */

/**
 * Combien de technologies communes il faut, au minimum, pour qu'on ait le droit
 * de parler d'environnement proche.
 *
 * Trois, comme le retour l'écrit : « utiliser au minimum 3 technologies communes
 * suffisamment discriminantes ». Sous ce seuil on ne dit RIEN — une techno
 * partagée est une coïncidence, deux est une famille (un langage et sa base de
 * données), trois commence à décrire un environnement.
 */
export const MARKET_TECHNO_AFFINITY_MIN_COMMON = 3

/**
 * Au-dessus de quelle PART des entreprises couvertes une technologie cesse de
 * distinguer quoi que ce soit.
 *
 * ⚠️ **C'est le seul nombre de ce lot qui ne soit pas ancré sur une mesure**, et
 * il faut le dire : la distribution des fréquences par techno du corpus ne se
 * lit pas depuis un poste de développement (aucun accès à la base). Un quart a
 * été retenu comme la borne la plus conservatrice qui laisse encore passer
 * quelque chose : une techno présente sur plus d'une entreprise couverte sur
 * quatre est, par construction, incapable de séparer deux entreprises prises au
 * hasard.
 *
 * La mesure qui le calibrera, quand elle sera possible :
 *
 * ```sql
 * SELECT techno, count(DISTINCT company_key) AS entreprises
 *   FROM market_company_stack GROUP BY techno ORDER BY entreprises DESC LIMIT 40;
 * ```
 *
 * Il vit ICI et nulle part ailleurs (GA-26) : un seuil recopié côté serveur et
 * côté écran diverge le jour où l'un des deux bouge.
 */
export const MARKET_TECHNO_UBIQUITY_MAX_SHARE = 0.25

/**
 * Combien de technologies la raison NOMME.
 *
 * Trois — « Environnement technologique proche de Thales : Java, C++, Python ».
 * Au-delà, la phrase déborde de la carte (288 px de colonne) et se tronque, ce
 * qui rendrait la raison moins lisible que le secteur qu'elle remplace.
 */
export const MARKET_TECHNO_AFFINITY_MAX_SHOWN = 3

/** Même normalisation des deux côtés — les deux listes viennent de la même
 *  table, la casse et les espaces sont les seuls écarts possibles. */
function fold(techno: string): string {
  return techno.trim().toLowerCase()
}

/**
 * Les technologies communes qui DISTINGUENT, de la plus rare à la plus
 * répandue — ou une liste vide quand il n'y a rien d'affirmable.
 *
 * Rend `[]`, et jamais une liste partielle, dans quatre cas :
 *
 *  - un des deux côtés n'a pas de pile observée (rien à comparer) ;
 *  - `corpusCompanies` est nul ou négatif — **la fréquence n'a pas pu être
 *    mesurée**. Une mesure impossible ne dit jamais « tout va bien » : sans
 *    dénominateur, aucune techno ne peut être déclarée discriminante ;
 *  - une techno commune est ABSENTE de la table des fréquences : sa fréquence
 *    est inconnue, et « inconnu » n'est pas « rare ». Elle ne compte pas ;
 *  - il reste moins de {@link MARKET_TECHNO_AFFINITY_MIN_COMMON} technologies
 *    discriminantes.
 *
 * @param reference     pile observée du compte de référence (celui du portefeuille)
 * @param candidate     pile observée de l'entreprise suggérée
 * @param frequency     par techno, sur combien d'entreprises du corpus elle est observée
 * @param corpusCompanies nombre d'entreprises du corpus qui portent une pile
 */
export function discriminantCommonTechnos(
  reference: readonly string[],
  candidate: readonly string[],
  frequency: ReadonlyMap<string, number>,
  corpusCompanies: number,
): string[] {
  if (corpusCompanies <= 0) return []
  if (reference.length === 0 || candidate.length === 0) return []

  const ceiling = corpusCompanies * MARKET_TECHNO_UBIQUITY_MAX_SHARE
  const candidateSet = new Set(candidate.map(fold))

  const discriminant: { techno: string; companies: number }[] = []
  const seen = new Set<string>()
  for (const raw of reference) {
    const techno = fold(raw)
    if (!techno || seen.has(techno) || !candidateSet.has(techno)) continue
    seen.add(techno)
    const companies = frequency.get(techno)
    // Fréquence inconnue ⇒ on ne peut pas affirmer qu'elle est rare.
    if (typeof companies !== 'number' || !Number.isFinite(companies)) continue
    if (companies > ceiling) continue
    discriminant.push({ techno, companies })
  }

  if (discriminant.length < MARKET_TECHNO_AFFINITY_MIN_COMMON) return []

  return discriminant
    .sort((a, b) => a.companies - b.companies || a.techno.localeCompare(b.techno))
    .slice(0, MARKET_TECHNO_AFFINITY_MAX_SHOWN)
    .map(entry => entry.techno)
}
