/**
 * #4574 (décision Louis 25/10/2026) — le nom d'une personne se tape dans le champ libre du rail,
 * sans champ dédié : « Marion Sagnard chez Bedrock ». Cette lecture dit si la phrase désigne une
 * PERSONNE et, si oui, quel nom et quelle entreprise supposée partent à la recherche par nom.
 *
 * Mesure (apps/ia, 25/10) : `discover_request_reading.py` lit le TYPE d'entreprise, le secteur et le
 * lieu ; il ne reconnaît aucun nom de personne — « chez » n'y est qu'un mot de liaison. La
 * reconnaissance vit donc ici, côté écran, où la recherche par nom (`contactsApi.searchByName`) est
 * déjà appelée : aucun moteur n'est rouvert (#4386, #2727).
 *
 * DÉTERMINISTE et PRUDENTE : un nom propre est reconnu à sa forme (deux à quatre mots à majuscule
 * initiale, particules permises, éventuellement suivis de « chez / at / @ » + entreprise). Au moindre
 * doute — un mot du métier, du numérique, une phrase — rien n'est reconnu et la recherche garde
 * le chemin d'avant. Jamais un nom deviné, jamais un homonyme fabriqué.
 */
export interface PersonNameQuery {
  fullName: string
  /** L'entreprise supposée (« chez Bedrock ») — resserre les homonymes. Absente = non citée. */
  organizationName?: string
}

const ORGANIZATION_CONNECTOR = /\s+(?:chez|at|@)\s+/i
const NAME_TOKEN = /^\p{Lu}[\p{L}'’-]+$/u
const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'den', 'di', 'da', 'dos', 'el', 'al'])

/**
 * Des mots du métier ou du numérique : une phrase qui en porte un parle d'un marché, pas d'une personne
 * (« Consultant SAP », « Cloud Azure »). Pliés : minuscules, sans accent.
 */
const NON_NAME_WORDS = new Set([
  'esn',
  'ssii',
  'cloud',
  'data',
  'devops',
  'cyber',
  'cybersecurite',
  'securite',
  'sap',
  'java',
  'python',
  'azure',
  'aws',
  'gcp',
  'consultant',
  'consultants',
  'developpeur',
  'developpeurs',
  'engineer',
  'manager',
  'directeur',
  'directrice',
  'responsable',
  'chef',
  'projet',
  'projets',
  'entreprise',
  'entreprises',
  'societe',
  'groupe',
  'banque',
  'assurance',
  'industrie',
  'conseil',
  'informatique',
  'numerique',
  'digital',
  'architecte',
  'expert',
  'experts',
  'freelance',
  'recrute',
  'recrutement',
  'france',
  'paris',
  'lyon',
  'lille',
  'toulouse',
  'nantes',
  'bordeaux',
  'marseille',
])

const fold = (word: string): string => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function isPersonName(name: string): boolean {
  const tokens = name.split(' ')
  if (tokens.length < 2 || tokens.length > 4) return false
  const [first] = tokens
  if (!first || !NAME_TOKEN.test(first)) return false
  // Une particule ne ferme ni n'ouvre un nom : « de La Fontaine », jamais « Marion de ».
  const last = tokens[tokens.length - 1] ?? ''
  if (PARTICLES.has(last.toLowerCase())) return false
  return tokens.every(token => {
    if (NON_NAME_WORDS.has(fold(token))) return false
    return NAME_TOKEN.test(token) || PARTICLES.has(token)
  })
}

/**
 * #4574.7 — le nom d'une personne se lit aussi depuis la vue ENTREPRISES (« le moteur reconnaît qu'on cherche une
 * personne ») : la recherche part sur la vue des personnes (`switchToContacts`), là où vit la carte. Dans une autre vue
 * (besoins, partenaires…), rien ne change : un nom de personne n'y est pas lu.
 */
export function personNameForView(
  resultType: string,
  freetext: string,
): { query: PersonNameQuery; switchToContacts: boolean } | null {
  if (resultType !== 'contacts' && resultType !== 'accounts') return null
  const query = readPersonNameQuery(freetext)
  return query ? { query, switchToContacts: resultType === 'accounts' } : null
}

export function readPersonNameQuery(freetext: string): PersonNameQuery | null {
  const text = freetext.trim().replace(/\s+/g, ' ')
  if (!text) return null
  const [namePart = '', ...rest] = text.split(ORGANIZATION_CONNECTOR)
  const organization = rest.join(' ').trim()
  // Un connecteur sans entreprise derrière (« Marion Sagnard chez ») n'est pas une demande lisible.
  if (rest.length > 0 && !organization) return null
  if (!isPersonName(namePart)) return null
  return organization ? { fullName: namePart, organizationName: organization } : { fullName: namePart }
}
