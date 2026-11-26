/**
 * #1635.4 — LE RECOUPEMENT ENTRE UNE EXPERTISE DÉCLARÉE ET UNE PILE OBSERVÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION À PART, ET TESTÉE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le seul endroit du lot où deux vocabulaires écrits par des humains
 * différents se rencontrent : `esn_profiles.expertise_areas`, saisi au
 * questionnaire (« Cloud & DevOps », « Data »), et `market_company_stack.techno`,
 * extrait du corpus (« devops », « Kubernetes »). Un rapprochement naïf est
 * faux dans les deux sens, et les deux fautes se voient à l'écran :
 *
 * · `includes` sur la chaîne entière rapproche « Java » et « JavaScript », qui
 *   ne sont pas la même compétence ;
 * · l'égalité stricte rate « Cloud & DevOps » contre « DevOps », qui l'est.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE NE PROMET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux libellés se recoupent s'ils partagent au moins un JETON significatif,
 * une fois pliés (minuscules, accents retirés, ponctuation coupée). Un jeton
 * est significatif s'il fait au moins trois caractères et n'est pas un mot de
 * liaison.
 *
 * Ce n'est pas une ontologie et ça ne prétend pas en être une : « React » et
 * « front-end » ne se recoupent pas ici, et c'est assumé. C'est aussi pour ça
 * que l'écran AFFICHE les expertises qui ont servi de critère (`expertises` du
 * contrat) — le lecteur juge le rapprochement, il ne le subit pas.
 *
 * ⚠️ Et ça ne produit AUCUNE gradation. « Forte affinité » exigerait de
 * normaliser par cohorte — un grand compte cite mécaniquement plus de
 * technologies, donc recoupe plus souvent — exactement la question ouverte qui
 * tient `MARKET_MEMORY_SCORING_ENABLED` à `false`.
 */

/**
 * Les mots vides, NOMMÉS UN PAR UN — et c'est délibéré.
 *
 * La première version filtrait par LONGUEUR (« sous trois lettres, ce n'est pas
 * un sujet »). Le test l'a prise en flagrant délit : elle jetait `C#` et `Go`,
 * qui sont des technologies, pour attraper « et » et « de », qui sont deux mots.
 * Un filtre de longueur ne sait pas distinguer un mot court d'un NOM court —
 * seule une liste le sait, et une liste se relit.
 *
 * `it` y figure sans être un mot de liaison : « IT » recoupe la moitié du
 * corpus (« Infrastructure IT », « Projets IT ») et ne dit donc rien d'une
 * expertise en particulier.
 */
const EMPTY_TOKENS: ReadonlySet<string> = new Set([
  'et',
  'de',
  'du',
  'la',
  'le',
  'les',
  'des',
  'aux',
  'ou',
  'en',
  'un',
  'une',
  'par',
  'pour',
  'avec',
  'dans',
  'sur',
  'and',
  'the',
  'for',
  'with',
  'it',
])

/**
 * Le plancher d'un jeton : DEUX caractères.
 *
 * Une lettre seule (« R », « C ») recouperait trop pour vouloir dire quoi que
 * ce soit ; deux suffisent à porter un nom (`Go`, `C#`). Ce que ça laisse
 * passer est nommé au-dessus, ce que ça coupe est une lettre isolée.
 */
const MIN_TOKEN_LENGTH = 2

/**
 * Plie un libellé en jetons comparables.
 *
 * `NFD` + retrait des diacritiques : « Sécurité » et « Securite » sont le même
 * mot, et le corpus n'est pas normalisé de la même façon que la saisie.
 */
export function expertiseTokens(label: string): ReadonlySet<string> {
  const folded = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const tokens = folded.split(/[^a-z0-9+#]+/).filter(token => {
    if (token.length < MIN_TOKEN_LENGTH) return false
    return !EMPTY_TOKENS.has(token)
  })
  return new Set(tokens)
}

/**
 * Vrai si la pile observée d'une entreprise recoupe au moins une expertise.
 *
 * Sans expertise déclarée, la réponse est FAUX et non « toutes » : la question
 * ne se pose pas, et l'appelant doit alors ne rien afficher du tout plutôt
 * qu'un « 0 sur 38 » qui se lirait « ton portefeuille ne te correspond pas ».
 */
export function stackMatchesExpertises(observedStack: readonly string[], expertises: readonly string[]): boolean {
  return matchingExpertises(observedStack, expertises).length > 0
}

/**
 * #1591.1 — LES expertises déclarées qui recoupent, une par une.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GRANULARITÉ, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `stackMatchesExpertises` répond « ce compte me correspond-il », ce qui suffit
 * à un AGRÉGAT de portefeuille (#1635.4). L'écran de lancement pose la question
 * un cran plus bas — « LAQUELLE de mes expertises pousser sur ce compte » —
 * et marque « Recommandé » celles qui recoupent.
 *
 * ⚠️ Les deux réponses sortent de la MÊME fonction, et c'est tout l'objet de ce
 * découpage : un second appariement écrit côté web aurait ré-appris à ses
 * dépens que `C#` et `Go` sont des noms et pas des mots courts (voir la liste
 * de mots vides ci-dessus, payée le 08/09/2026). `stackMatchesExpertises` est
 * désormais un cas particulier de celle-ci, pas une seconde implémentation.
 *
 * L'ordre des expertises RENDUES est celui des expertises DÉCLARÉES : l'écran
 * doit pouvoir marquer une liste que l'utilisateur reconnaît, pas la
 * ré-ordonner selon un critère qu'on ne lui explique pas.
 */
export function matchingExpertises(observed: readonly string[], expertises: readonly string[]): string[] {
  if (expertises.length === 0 || observed.length === 0) return []

  const observedTokens = new Set<string>()
  for (const label of observed) {
    for (const token of expertiseTokens(label)) observedTokens.add(token)
  }
  if (observedTokens.size === 0) return []

  return expertises.filter(expertise => {
    for (const token of expertiseTokens(expertise)) {
      if (observedTokens.has(token)) return true
    }
    return false
  })
}
