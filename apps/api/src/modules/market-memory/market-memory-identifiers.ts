/**
 * LES IDENTIFIANTS DIRECTS — la liste fermée de ce que la mémoire marché ne garde JAMAIS d'une personne.
 *
 * Décision Louis 02/11/2026 (verbatim) : « tout mettre comme donnée sauf le nom et prénom et genre, num et adresse
 * mail ; pour le reste tu peux te servir de toutes les données ». Par équivalence, sont aussi exclus : URL de profil
 * (LinkedIn…), photo, adresse postale, date de naissance / âge. Renversement PARTIEL et daté de GA-352 : le garde
 * ne dit plus « aucune colonne désignant un individu » mais « aucune colonne d'IDENTIFIANT DIRECT ».
 *
 * UN seul module (GA-26) : la garde d'architecture (GA-352), l'import des parcours et la lecture de colonnes
 * l'importent tous. Comparaison par TOKEN exact (jamais par sous-chaîne : `nom_entreprise` n'est pas un nom de
 * personne — le token `entreprise` l'en distingue).
 */
export const DIRECT_IDENTIFIER_FAMILIES = [
  'nom',
  'prenom',
  'nom_complet',
  'genre',
  'telephone',
  'email',
  'url_profil',
  'photo',
  'adresse_postale',
  'naissance_age',
] as const

const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const tokensOf = (column: string): string[] =>
  fold(column)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0)

/** Tokens qui désignent à eux seuls un identifiant direct, où qu'ils soient dans le nom de colonne. */
const IDENTIFIER_TOKENS: ReadonlySet<string> = new Set([
  'prenom',
  'firstname',
  'lastname',
  'surname',
  'fullname',
  'gender',
  'genre',
  'civilite',
  'sexe',
  'telephone',
  'tel',
  'phone',
  'gsm',
  'mobile',
  'portable',
  'email',
  'mail',
  'courriel',
  'linkedin',
  'viadeo',
  'github',
  'xing',
  'photo',
  'avatar',
  'picture',
  'adresse',
  'address',
  'street',
  'rue',
  'postal',
  'postale',
  'naissance',
  'birth',
  'birthday',
  'birthdate',
  'age',
])

/** Un nom de colonne à token `nom` / `name` est une PERSONNE, sauf s'il nomme une organisation ou un objet. */
const ORGANISATION_QUALIFIERS: ReadonlySet<string> = new Set([
  'entreprise',
  'company',
  'societe',
  'esn',
  'client',
  'organisation',
  'groupe',
  'site',
  'poste',
  'techno',
  'ville',
  'region',
  'pays',
  'mission',
])

export function isDirectIdentifierColumn(column: string): boolean {
  const tokens = tokensOf(column)
  if (tokens.some(token => IDENTIFIER_TOKENS.has(token))) return true
  // `url` / `profile` / `profil` : une URL de profil (pas l'URL d'un site d'entreprise).
  if (tokens.includes('profil') || tokens.includes('profile')) return true
  if (tokens.includes('nom') || tokens.includes('name')) {
    return !tokens.some(token => ORGANISATION_QUALIFIERS.has(token))
  }
  return false
}

/** La première colonne d'identifiant direct d'un entête, ou `null`. */
export function findDirectIdentifierColumn(header: readonly string[]): string | null {
  return header.find(isDirectIdentifierColumn) ?? null
}

/**
 * Retire les identifiants directs d'un enregistrement DÈS LA LECTURE. Ce qui sort n'a jamais porté la valeur
 * ailleurs qu'en mémoire de lecture : ni écrit, ni journalisé, même temporairement.
 */
export function stripDirectIdentifiers(record: Readonly<Record<string, string>>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [column, value] of Object.entries(record)) {
    if (!isDirectIdentifierColumn(column)) kept[column] = value
  }
  return kept
}
