/**
 * Comment une entreprise du corpus rencontre un compte du portefeuille.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FORCES DE RAPPROCHEMENT, JAMAIS UNE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Le domaine racine est FORT.** `thalesgroup.com` ne désigne qu'une
 *   organisation. C'est le rapprochement qu'on privilégie partout où il existe.
 * · **Le nom normalisé est FAIBLE.** « Orange » désigne l'opérateur, une banque
 *   et une commune ; « ROCHE » et « ROCHE BOBOIS » se ressemblent assez pour
 *   qu'un utilisateur ait déjà payé une analyse sur le mauvais. Un rapprochement
 *   par nom seul est donc marqué `inferred`, et l'appelant a le droit de le
 *   refuser.
 *
 * ⚠️ Attacher la mémoire d'un compte au MAUVAIS compte est pire que ne pas avoir
 * de mémoire : l'erreur est invisible, elle se propage dans un prompt, et elle
 * ressort en réunion sous la forme d'une affirmation fausse. C'est pour ça que
 * la fonction rend la FORCE du rapprochement, et pas seulement son résultat.
 *
 * ⚠️ `marketMatchKey` est NOTRE normalisation, appliquée aux DEUX côtés à
 * l'import comme à la lecture. Le corpus a la sienne (sa colonne `cle`), dont on
 * ne connaît pas les règles — elle supprime certains mots outils et pas
 * d'autres. Deux normalisations différentes ne se rencontrent jamais, et croire
 * qu'elles se rencontrent produit un silence total qu'aucun test ne montre.
 */

/** Les formes juridiques et mots de structure qui ne distinguent pas deux entreprises. */
const NOISE_TOKENS: ReadonlySet<string> = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'sci',
  'snc',
  'gie',
  'groupe',
  'group',
  'holding',
  'france',
  'international',
])

/**
 * Le nom, réduit à ce qui le distingue.
 *
 * Minuscules, accents retirés, ponctuation en espaces, formes juridiques
 * écartées, espaces repliés. Rend une chaîne vide quand il ne reste rien — et
 * une clé vide ne rapproche RIEN : c'est un cas qu'il faut traiter, pas un
 * rapprochement universel.
 */
export function marketMatchKey(rawName: string): string {
  const folded = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (folded.length === 0) return ''

  const kept = folded.split(' ').filter(token => token.length > 0 && !NOISE_TOKENS.has(token))

  // Un nom fait ENTIÈREMENT de mots écartés (« Groupe France ») garde sa forme
  // brute : la vider le rapprocherait de tous les autres noms vides.
  return kept.length > 0 ? kept.join(' ') : folded
}

/**
 * Le domaine racine d'une URL — `https://www.thalesgroup.com/fr` → `thalesgroup.com`.
 *
 * `null` quand l'URL est absente, illisible, ou pointe sur un hébergeur qui ne
 * dit rien de l'entreprise. Un `null` est une réponse : il fait retomber le
 * rapprochement sur le nom, avec la force plus faible qui va avec.
 */
export function marketRootDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null

  const trimmed = rawUrl.trim()
  if (trimmed.length === 0) return null

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let host: string
  try {
    host = new URL(withScheme).hostname.toLowerCase()
  } catch {
    return null
  }

  const bare = host.startsWith('www.') ? host.slice(4) : host
  if (bare.length === 0 || !bare.includes('.')) return null

  // Les plateformes ne caractérisent personne : dix mille entreprises partagent
  // `linkedin.com`, et les rapprocher entre elles serait pire qu'un silence.
  const PLATFORMS = new Set(['linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'wix.com', 'wordpress.com'])
  return PLATFORMS.has(bare) ? null : bare
}

/**
 * Ce qu'une résolution rend : la clé du corpus ET comment on y est arrivé.
 *
 * La FORCE voyage avec le résultat, jamais séparément — un appelant qui reçoit
 * une clé sans savoir si elle vient d'un domaine ou d'un nom ne peut pas décider
 * s'il a le droit de s'en servir.
 */
export interface MarketCompanyMatch {
  readonly companyKey: string
  readonly strength: 'domain' | 'inferred'
}
