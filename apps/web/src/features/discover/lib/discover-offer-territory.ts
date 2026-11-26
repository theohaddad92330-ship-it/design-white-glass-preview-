/**
 * #2804 (#2291.2) — « offre : territoire », le 3ᵉ des 4 types d'entrée
 * restés à 0 occurrence au tri du 24/09. Tris précédents (25/09, 26/09) :
 * `OfferPortfolio.target_geographies` porte des codes RÉGION (import/
 * questionnaire, ex. Stelya « AURA », « BFC », « PACA ») qui n'ont jamais
 * été reliés au vocabulaire du rail Découvrir — d'où le blocage noté
 * « mapping à écrire ».
 *
 * Le rail expose DÉJÀ un filtre région en codes INSEE mesurés contre le
 * registre (`REGISTRY_REGIONS`, `discover-registry-vocab.ts`, témoin
 * `region=76` → 156). La seule traduction manquante est donc l'abréviation
 * région → ce même code INSEE — jamais une ventilation par département (que
 * les tris précédents visaient à tort et qui aurait dupliqué un vocabulaire
 * déjà résolu à l'échelon région).
 *
 * Cette correspondance est un FAIT géographique (les 18 régions de la
 * réforme territoriale 2016), pas un choix produit : rien à trancher, rien à
 * deviner. Un code non reconnu est écarté SEUL (tolérance par élément, même
 * règle que `knownCodes` côté contrat) — jamais une région entière devinée à
 * sa place.
 */
const OFFER_REGION_TO_INSEE_CODE: ReadonlyMap<string, string> = new Map([
  ['AURA', '84'], // Auvergne-Rhône-Alpes
  ['BFC', '27'], // Bourgogne-Franche-Comté
  ['BRE', '53'], // Bretagne
  ['CVL', '24'], // Centre-Val de Loire
  ['COR', '94'], // Corse
  ['GES', '44'], // Grand Est
  ['HDF', '32'], // Hauts-de-France
  ['IDF', '11'], // Île-de-France
  ['NOR', '28'], // Normandie
  ['NAQ', '75'], // Nouvelle-Aquitaine
  ['OCC', '76'], // Occitanie
  ['PDL', '52'], // Pays de la Loire
  ['PACA', '93'], // Provence-Alpes-Côte d'Azur
  ['GUA', '01'], // Guadeloupe
  ['MTQ', '02'], // Martinique
  ['GUY', '03'], // Guyane
  ['REU', '04'], // La Réunion
  ['MAY', '06'], // Mayotte
])

/** #4307.3 — le code INSEE d'un sigle de région (`IDF`, `occ`), ou `undefined`. */
export function regionCodeOfAbbreviation(abbreviation: string): string | undefined {
  return OFFER_REGION_TO_INSEE_CODE.get(abbreviation.trim().toUpperCase())
}

/** LUDB.2 — les libellés du questionnaire (`geo_zones`, « Lyon & Auvergne-Rhône-Alpes »)
 *  se reconnaissent à leur NOM de région ; « National » / « International » /
 *  « Full remote » ne désignent aucune région et ne sont jamais devinés. */
/** Une écriture se compare sans accent, sans casse, sans ponctuation : « Provence-Alpes-Côte d’Azur » = « provence alpes cote d azur ». */
function foldZone(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** LC.6 — les libellés sont écrits PLIÉS (voir `foldZone`) ; la reconnaissance se fait sur des MOTS entiers. */
const REGION_NAME_TO_ABBREVIATION: readonly (readonly [string, string])[] = [
  ['AUVERGNE RHONE ALPES', 'AURA'],
  ['RHONE ALPES', 'AURA'],
  ['ARA', 'AURA'],
  ['BOURGOGNE FRANCHE COMTE', 'BFC'],
  ['FRANCHE COMTE', 'BFC'],
  ['ILE DE FRANCE', 'IDF'],
  ['HAUTS DE FRANCE', 'HDF'],
  ['PAYS DE LA LOIRE', 'PDL'],
  ['NOUVELLE AQUITAINE', 'NAQ'],
  ['OCCITANIE', 'OCC'],
  ['GRAND EST', 'GES'],
  ['BRETAGNE', 'BRE'],
  ['NORMANDIE', 'NOR'],
  ['CENTRE VAL DE LOIRE', 'CVL'],
  ['PACA', 'PACA'],
  ['PROVENCE ALPES COTE D AZUR', 'PACA'],
  ['COTE D AZUR', 'PACA'],
  // LUDOVIC-C LC.7 / LUDOVIC-E LC.6 — une zone saisie par sa MÉTROPOLE est dans sa région : un fait, pas un choix.
  ['LYON', 'AURA'],
  ['GRENOBLE', 'AURA'],
  ['CLERMONT FERRAND', 'AURA'],
  ['SAINT ETIENNE', 'AURA'],
  ['ANNECY', 'AURA'],
  ['CHAMBERY', 'AURA'],
  ['VALENCE', 'AURA'],
  ['MARSEILLE', 'PACA'],
  ['NICE', 'PACA'],
  ['TOULON', 'PACA'],
  ['AIX EN PROVENCE', 'PACA'],
  ['AVIGNON', 'PACA'],
  ['DIJON', 'BFC'],
  ['BESANCON', 'BFC'],
  // Recette 21/10 B.2 (Simon) — « zone non reconnue : Paris » alors que Paris EST l'Île-de-France.
  ['PARIS', 'IDF'],
  ['LILLE', 'HDF'],
  ['BORDEAUX', 'NAQ'],
  ['TOULOUSE', 'OCC'],
  ['MONTPELLIER', 'OCC'],
  ['NANTES', 'PDL'],
  ['RENNES', 'BRE'],
  ['STRASBOURG', 'GES'],
  // #4816 — « Quéven et Nancy » : Nancy (Grand Est) ne se lisait dans aucune région.
  ['NANCY', 'GES'],
  ['ROUEN', 'NOR'],
  ['ORLEANS', 'CVL'],
  ['TOURS', 'CVL'],
]

/** LUDOVIC-F F.1 (LC.6, Ludovic 20/10) — une valeur du profil peut porter PLUSIEURS zones dans une seule chaîne
 *  (« Auvergne-Rhône-Alpes, Provence-Alpes-Côte d’Azur, Bourgogne-Franche-Comté, Lyon ») : la lecture se fait par
 *  SEGMENT. Avant, seule la première région nommée sortait → `region=84` seul, trois zones sur quatre perdues. */
function splitZones(raw: string): string[] {
  return raw
    .split(/[,;/+&|\n]+|\s+et\s+|\s+and\s+/i)
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

/** Recette 21/10 B.1 (LC.6) — la valeur du profil peut arriver en chaîne unique : itérer la chaîne lirait CARACTÈRE par
 *  caractère (aucune zone reconnue). Une chaîne devient une liste d'un élément, `splitZones` fait le reste. */
function asZoneList(value: readonly string[] | string | null | undefined): readonly string[] {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value : []
}

/** Ces zones ne désignent aucune région et ne sont ni devinées ni signalées comme inconnues. */
const NON_REGION_ZONES: readonly string[] = [
  'NATIONAL',
  'INTERNATIONAL',
  'FULL REMOTE',
  'FRANCE ENTIERE',
  'TOUTE LA FRANCE',
  // #4429 (recette prod 22/10) — « zone non reconnue : Siège » : un type de site ou un mode de travail
  // n'est pas une zone. Non restrictif, ignoré sans bruit — jamais affiché comme zone inconnue.
  'SIEGE',
  'SIEGE SOCIAL',
  'AGENCE',
  'AGENCES',
  'SUR SITE',
  'HYBRIDE',
  'REMOTE',
  'TELETRAVAIL',
  'SANS PREFERENCE',
  'INDIFFERENT',
  'EUROPE',
  'MONDE',
]

const WHOLE_COUNTRY_ZONES: readonly string[] = ['NATIONAL', 'FRANCE ENTIERE', 'TOUTE LA FRANCE']

const INSEE_REGION_CODES: ReadonlySet<string> = new Set(OFFER_REGION_TO_INSEE_CODE.values())

/** Les codes région d'UN segment : sigle, code INSEE écrit tel quel, ou TOUS les noms de région / métropole lus. */
function regionCodesOfSegment(segment: string): string[] {
  const folded = foldZone(segment)
  const direct = OFFER_REGION_TO_INSEE_CODE.get(folded)
  if (direct) return [direct]
  if (INSEE_REGION_CODES.has(folded)) return [folded]
  const padded = ` ${folded} `
  const codes: string[] = []
  for (const [name, abbreviation] of REGION_NAME_TO_ABBREVIATION) {
    const code = OFFER_REGION_TO_INSEE_CODE.get(abbreviation)
    if (code && padded.includes(` ${name} `) && !codes.includes(code)) codes.push(code)
  }
  return codes
}

function isNonRegionZone(segment: string): boolean {
  const padded = ` ${foldZone(segment)} `
  return NON_REGION_ZONES.some(name => padded.includes(` ${name} `))
}

/**
 * Traduit les zones de chasse déclarées au portefeuille d'offre en codes
 * région du rail Découvrir. Une entrée non reconnue est écartée SEULE, jamais
 * devinée (elle se NOMME à l'écran, `unrecognizedZones`). Vide en entrée ⇒ vide
 * en sortie — « aucune préférence » reste « aucune préférence », jamais « France entière ».
 */
export function offerTargetRegionCodes(geographies: readonly string[] | string): string[] {
  const codes: string[] = []
  for (const raw of asZoneList(geographies)) {
    for (const segment of splitZones(raw)) {
      for (const code of regionCodesOfSegment(segment)) {
        if (!codes.includes(code)) codes.push(code)
      }
    }
  }
  return codes
}

/**
 * LUDOVIC-F F.1 — les zones écrites que le rail ne sait pas traduire : elles se NOMMENT à l'écran
 * (« zone non reconnue : X »), jamais ignorées en silence. « National », « International », « Full remote »
 * ne sont pas des zones inconnues : elles ne restreignent rien.
 */
export function unrecognizedZones(...lists: readonly (readonly string[] | string | null | undefined)[]): string[] {
  const unknown: string[] = []
  for (const list of lists) {
    for (const raw of asZoneList(list)) {
      for (const segment of splitZones(raw)) {
        if (isNonRegionZone(segment) || regionCodesOfSegment(segment).length > 0) continue
        if (!unknown.includes(segment)) unknown.push(segment)
      }
    }
  }
  return unknown
}

/**
 * LUDOVIC-C LC.7 — TOUTES les zones de chasse de l'espace : celles du portefeuille d'offre ET
 * celles du profil (`geo_zones`). Mesuré en prod le 19/10 : profil AURA + PACA + BFC + Lyon,
 * portefeuille « AURA » seul ⇒ Découvrir n'affichait qu'AURA (le portefeuille masquait le
 * profil). Un réglage vit à UN endroit (GA-26) : cette fonction est la seule lecture, pour
 * « Ta cible » comme pour le rail. Union sans doublon, ordre du portefeuille puis du profil.
 */
export function huntingRegionCodes(
  portfolioGeographies: readonly string[] | string | null | undefined,
  profileZones: readonly string[] | string | null | undefined,
  companyLocations?: readonly string[] | string | null,
  /** Recette 21/10 U.1 — `ideal_client_territory` : où sont les CLIENTS visés, ajouté à l'union. */
  clientTerritory?: readonly string[] | string | null,
): string[] {
  // Recette 21/10 S.2 — « National / toute la France » : AUCUN filtre de région par défaut.
  if (coversWholeCountry(portfolioGeographies, profileZones, companyLocations)) return []
  const hunting = offerTargetRegionCodes([
    ...asZoneList(portfolioGeographies),
    ...asZoneList(profileZones),
    ...asZoneList(companyLocations),
  ])
  for (const code of clientTerritoryRegionCodes(asZoneList(clientTerritory)).regionCodes) {
    if (!hunting.includes(code)) hunting.push(code)
  }
  return hunting
}

const CLIENT_TERRITORY_REGIONS: Readonly<Record<string, readonly string[]>> = {
  'Clients basés en Île-de-France': ['11'],
  // « Peu importe » est une réponse : aucune contrainte de territoire.
  'Peu importe la localisation du client': [],
}

/** `ideal_client_territory` → régions du rail. « En région » / « international » ne désignent aucune région du rail : elles se nomment. */
export function clientTerritoryRegionCodes(values: readonly string[]): { regionCodes: string[]; leftover: string[] } {
  const regionCodes: string[] = []
  const leftover: string[] = []
  for (const value of values) {
    const codes = CLIENT_TERRITORY_REGIONS[value]
    if (!codes) leftover.push(value)
    else for (const code of codes) if (!regionCodes.includes(code)) regionCodes.push(code)
  }
  return { regionCodes, leftover }
}

/** Recette 21/10 S.2 (Louis 21/10 : « il veut bosser avec toute la France ») — une zone du profil dit
 *  « National / toute la France / France entière » : le rail ne pose alors aucune région. */
export function coversWholeCountry(...lists: readonly (readonly string[] | string | null | undefined)[]): boolean {
  return lists.some(list => asZoneList(list).some(raw => splitZones(raw).some(isWholeCountryZone)))
}

function isWholeCountryZone(segment: string): boolean {
  const padded = ` ${foldZone(segment)} `
  return WHOLE_COUNTRY_ZONES.some(name => padded.includes(` ${name} `))
}
