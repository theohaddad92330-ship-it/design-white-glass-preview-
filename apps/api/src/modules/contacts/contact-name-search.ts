/**
 * #3489 — « Laura dit n'avoir aucune fiche Armelle Soussin » alors que la
 * fiche du compte la cite. La recherche libre de contacts (`q`) faisait un
 * `full_name ILIKE '%Armelle Soussin%'` : la phrase entière, accents et ordre
 * compris. « SOUSSIN Armelle », « Armelle  Soussin » (double espace) ou
 * « Armèle Soussin » ne la trouvaient pas — et le modèle, qui lit une liste
 * vide, conclut qu'il n'y a pas de fiche.
 *
 * Le nom se cherche donc PAR MOTS : chaque mot tapé doit se trouver quelque
 * part dans le nom, dans n'importe quel ordre, sans accent ni casse. Les deux
 * côtés se plient (colonne ET terme), sinon rien ne se rencontre.
 */
const ACCENTED = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ’‘'
const UNACCENTED = "aaaaaaceeeeiiiinooooouuuuyy''"

/**
 * #3710 — « Directeur des systèmes d’information groupe » (apostrophe
 * typographique ’) restait introuvable quand la recherche tapait l'apostrophe
 * droite ' du clavier. Les deux se plient sur la même apostrophe droite,
 * comme les accents se plient déjà sur leur lettre nue.
 */
export function foldSearchTerm(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase()
}

export function searchTokens(query: string): string[] {
  return foldSearchTerm(query)
    .split(/[\s,;]+/)
    .filter(token => token.length > 0)
}

/** `(folded(col) LIKE :qn0 AND folded(col) LIKE :qn1 …)` + ses paramètres ; `null` sans mot. */
export function nameTokensClause(
  column: string,
  query: string,
  /** #3710.6 — préfixe des paramètres : deux colonnes dans le même WHERE ne se marchent pas dessus. */
  paramPrefix = 'qn',
): { sql: string; params: Record<string, string> } | null {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return null
  const folded = `translate(lower(${column}), '${ACCENTED}', '${UNACCENTED}')`
  const params: Record<string, string> = {}
  const parts = tokens.map((token, index) => {
    params[`${paramPrefix}${index}`] = `%${token}%`
    return `${folded} LIKE :${paramPrefix}${index}`
  })
  return { sql: `(${parts.join(' AND ')})`, params }
}

/**
 * #4386.2 — les formes juridiques et mots de groupe qu'on tape après une société : ils ne sont pas
 * toujours dans le nom stocké (« BELLUM » pour « Bellum SAS »), donc ils ne doivent jamais devenir un mot
 * OBLIGATOIRE. Écartés seulement s'il reste un autre mot : une requête faite d'un suffixe seul le garde.
 */
const COMPANY_SUFFIXES: ReadonlySet<string> = new Set([
  'sas',
  'sasu',
  'sa',
  'sarl',
  'eurl',
  'snc',
  'scop',
  'se',
  'inc',
  'ltd',
  'llc',
  'gmbh',
  'group',
  'groupe',
])

/**
 * #4386.2 — la recherche globale « prénom nom entreprise » : CHAQUE mot doit se trouver dans AU MOINS UNE
 * des colonnes (nom OU entreprise), dans n'importe quel ordre, sans accent ni casse. Les mots restent des
 * PARAMÈTRES liés (`:qx0…`) — jamais concaténés au SQL.
 */
export function crossFieldTokensClause(
  columns: readonly string[],
  query: string,
  paramPrefix = 'qx',
): { sql: string; params: Record<string, string> } | null {
  const all = searchTokens(query)
  const meaningful = all.filter(token => !COMPANY_SUFFIXES.has(token.replace(/\./g, '')))
  const tokens = meaningful.length > 0 ? meaningful : all
  if (tokens.length === 0 || columns.length === 0) return null
  const params: Record<string, string> = {}
  const groups = tokens.map((token, index) => {
    params[`${paramPrefix}${index}`] = `%${token}%`
    const any = columns
      .map(column => `translate(lower(${column}), '${ACCENTED}', '${UNACCENTED}') LIKE :${paramPrefix}${index}`)
      .join(' OR ')
    return `(${any})`
  })
  return { sql: `(${groups.join(' AND ')})`, params }
}
