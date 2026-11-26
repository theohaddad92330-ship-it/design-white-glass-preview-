/**
 * Référentiel administratif français : département (code INSEE) → nom et
 * région. Une nomenclature publique, pas une donnée du client — la même pour
 * tous les espaces.
 *
 * #3742 / recette 07/10 (Arquus) — le filtre « Localisation » de l'onglet
 * Contacts doit croiser une RÉGION (« Bourgogne-Franche-Comté ») avec des
 * contacts qui ne portent qu'une ville ou un code postal. La table partielle
 * de `siteGeo.ts` (la Nièvre, le Jura, la Saône-et-Loire… manquaient) vit
 * désormais ici, complète, et `siteGeo` la relit (GA-26 : un seul endroit).
 */
const DEPARTMENTS: Record<string, readonly [name: string, region: string]> = {
  '01': ['Ain', 'Auvergne-Rhône-Alpes'],
  '02': ['Aisne', 'Hauts-de-France'],
  '03': ['Allier', 'Auvergne-Rhône-Alpes'],
  '04': ['Alpes-de-Haute-Provence', "Provence-Alpes-Côte d'Azur"],
  '05': ['Hautes-Alpes', "Provence-Alpes-Côte d'Azur"],
  '06': ['Alpes-Maritimes', "Provence-Alpes-Côte d'Azur"],
  '07': ['Ardèche', 'Auvergne-Rhône-Alpes'],
  '08': ['Ardennes', 'Grand Est'],
  '09': ['Ariège', 'Occitanie'],
  '10': ['Aube', 'Grand Est'],
  '11': ['Aude', 'Occitanie'],
  '12': ['Aveyron', 'Occitanie'],
  '13': ['Bouches-du-Rhône', "Provence-Alpes-Côte d'Azur"],
  '14': ['Calvados', 'Normandie'],
  '15': ['Cantal', 'Auvergne-Rhône-Alpes'],
  '16': ['Charente', 'Nouvelle-Aquitaine'],
  '17': ['Charente-Maritime', 'Nouvelle-Aquitaine'],
  '18': ['Cher', 'Centre-Val de Loire'],
  '19': ['Corrèze', 'Nouvelle-Aquitaine'],
  '2A': ['Corse-du-Sud', 'Corse'],
  '2B': ['Haute-Corse', 'Corse'],
  '21': ["Côte-d'Or", 'Bourgogne-Franche-Comté'],
  '22': ["Côtes-d'Armor", 'Bretagne'],
  '23': ['Creuse', 'Nouvelle-Aquitaine'],
  '24': ['Dordogne', 'Nouvelle-Aquitaine'],
  '25': ['Doubs', 'Bourgogne-Franche-Comté'],
  '26': ['Drôme', 'Auvergne-Rhône-Alpes'],
  '27': ['Eure', 'Normandie'],
  '28': ['Eure-et-Loir', 'Centre-Val de Loire'],
  '29': ['Finistère', 'Bretagne'],
  '30': ['Gard', 'Occitanie'],
  '31': ['Haute-Garonne', 'Occitanie'],
  '32': ['Gers', 'Occitanie'],
  '33': ['Gironde', 'Nouvelle-Aquitaine'],
  '34': ['Hérault', 'Occitanie'],
  '35': ['Ille-et-Vilaine', 'Bretagne'],
  '36': ['Indre', 'Centre-Val de Loire'],
  '37': ['Indre-et-Loire', 'Centre-Val de Loire'],
  '38': ['Isère', 'Auvergne-Rhône-Alpes'],
  '39': ['Jura', 'Bourgogne-Franche-Comté'],
  '40': ['Landes', 'Nouvelle-Aquitaine'],
  '41': ['Loir-et-Cher', 'Centre-Val de Loire'],
  '42': ['Loire', 'Auvergne-Rhône-Alpes'],
  '43': ['Haute-Loire', 'Auvergne-Rhône-Alpes'],
  '44': ['Loire-Atlantique', 'Pays de la Loire'],
  '45': ['Loiret', 'Centre-Val de Loire'],
  '46': ['Lot', 'Occitanie'],
  '47': ['Lot-et-Garonne', 'Nouvelle-Aquitaine'],
  '48': ['Lozère', 'Occitanie'],
  '49': ['Maine-et-Loire', 'Pays de la Loire'],
  '50': ['Manche', 'Normandie'],
  '51': ['Marne', 'Grand Est'],
  '52': ['Haute-Marne', 'Grand Est'],
  '53': ['Mayenne', 'Pays de la Loire'],
  '54': ['Meurthe-et-Moselle', 'Grand Est'],
  '55': ['Meuse', 'Grand Est'],
  '56': ['Morbihan', 'Bretagne'],
  '57': ['Moselle', 'Grand Est'],
  '58': ['Nièvre', 'Bourgogne-Franche-Comté'],
  '59': ['Nord', 'Hauts-de-France'],
  '60': ['Oise', 'Hauts-de-France'],
  '61': ['Orne', 'Normandie'],
  '62': ['Pas-de-Calais', 'Hauts-de-France'],
  '63': ['Puy-de-Dôme', 'Auvergne-Rhône-Alpes'],
  '64': ['Pyrénées-Atlantiques', 'Nouvelle-Aquitaine'],
  '65': ['Hautes-Pyrénées', 'Occitanie'],
  '66': ['Pyrénées-Orientales', 'Occitanie'],
  '67': ['Bas-Rhin', 'Grand Est'],
  '68': ['Haut-Rhin', 'Grand Est'],
  '69': ['Rhône', 'Auvergne-Rhône-Alpes'],
  '70': ['Haute-Saône', 'Bourgogne-Franche-Comté'],
  '71': ['Saône-et-Loire', 'Bourgogne-Franche-Comté'],
  '72': ['Sarthe', 'Pays de la Loire'],
  '73': ['Savoie', 'Auvergne-Rhône-Alpes'],
  '74': ['Haute-Savoie', 'Auvergne-Rhône-Alpes'],
  '75': ['Paris', 'Île-de-France'],
  '76': ['Seine-Maritime', 'Normandie'],
  '77': ['Seine-et-Marne', 'Île-de-France'],
  '78': ['Yvelines', 'Île-de-France'],
  '79': ['Deux-Sèvres', 'Nouvelle-Aquitaine'],
  '80': ['Somme', 'Hauts-de-France'],
  '81': ['Tarn', 'Occitanie'],
  '82': ['Tarn-et-Garonne', 'Occitanie'],
  '83': ['Var', "Provence-Alpes-Côte d'Azur"],
  '84': ['Vaucluse', "Provence-Alpes-Côte d'Azur"],
  '85': ['Vendée', 'Pays de la Loire'],
  '86': ['Vienne', 'Nouvelle-Aquitaine'],
  '87': ['Haute-Vienne', 'Nouvelle-Aquitaine'],
  '88': ['Vosges', 'Grand Est'],
  '89': ['Yonne', 'Bourgogne-Franche-Comté'],
  '90': ['Territoire de Belfort', 'Bourgogne-Franche-Comté'],
  '91': ['Essonne', 'Île-de-France'],
  '92': ['Hauts-de-Seine', 'Île-de-France'],
  '93': ['Seine-Saint-Denis', 'Île-de-France'],
  '94': ['Val-de-Marne', 'Île-de-France'],
  '95': ["Val-d'Oise", 'Île-de-France'],
  '971': ['Guadeloupe', 'Guadeloupe'],
  '972': ['Martinique', 'Martinique'],
  '973': ['Guyane', 'Guyane'],
  '974': ['La Réunion', 'La Réunion'],
  '976': ['Mayotte', 'Mayotte'],
}

type FrenchDepartment = { code: string; name: string; region: string }

/** Le département d'un code postal français (5 chiffres), ou `null`. */
export function departmentFromPostalCode(postal: string | null | undefined): FrenchDepartment | null {
  const digits = (postal ?? '').trim()
  if (!/^\d{5}$/.test(digits)) return null
  const overseas = digits.slice(0, 3)
  if (digits.startsWith('97') && DEPARTMENTS[overseas]) return departmentByCode(overseas)
  if (digits.startsWith('20')) {
    // Corse : 200xx/201xx = Corse-du-Sud, 202xx/206xx = Haute-Corse.
    return departmentByCode(Number(digits.slice(0, 3)) < 202 ? '2A' : '2B')
  }
  return departmentByCode(digits.slice(0, 2))
}

export function departmentByCode(code: string): FrenchDepartment | null {
  const entry = DEPARTMENTS[code]
  return entry ? { code, name: entry[0], region: entry[1] } : null
}

const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const REGION_BY_NAME = new Map(Object.values(DEPARTMENTS).map(([, region]) => [normalise(region), region] as const))
const DEPARTMENT_BY_NAME = new Map(
  Object.entries(DEPARTMENTS).map(([code, [name]]) => [normalise(name), departmentByCode(code)!] as const),
)
// Anciennes régions encore écrites dans les fiches (« Bourgogne, France »).
const LEGACY_REGIONS: Record<string, string> = {
  bourgogne: 'Bourgogne-Franche-Comté',
  'franche comte': 'Bourgogne-Franche-Comté',
  alsace: 'Grand Est',
  lorraine: 'Grand Est',
  'champagne ardenne': 'Grand Est',
  aquitaine: 'Nouvelle-Aquitaine',
  limousin: 'Nouvelle-Aquitaine',
  'poitou charentes': 'Nouvelle-Aquitaine',
  auvergne: 'Auvergne-Rhône-Alpes',
  'rhone alpes': 'Auvergne-Rhône-Alpes',
  'midi pyrenees': 'Occitanie',
  'languedoc roussillon': 'Occitanie',
  picardie: 'Hauts-de-France',
  'nord pas de calais': 'Hauts-de-France',
  'haute normandie': 'Normandie',
  'basse normandie': 'Normandie',
  centre: 'Centre-Val de Loire',
  'ile de france': 'Île-de-France',
  paca: "Provence-Alpes-Côte d'Azur",
}

/** La région française nommée par ce libellé (nom actuel ou ancien), ou `null`. */
export function regionFromLabel(label: string): string | null {
  const key = normalise(label)
  return REGION_BY_NAME.get(key) ?? LEGACY_REGIONS[key] ?? null
}

/** Le département nommé par ce libellé (« Nièvre », « Côte-d'Or »), ou `null`. */
export function departmentFromLabel(label: string): FrenchDepartment | null {
  return DEPARTMENT_BY_NAME.get(normalise(label)) ?? null
}

/**
 * #3709 — villes françaises courantes → code de département, pour un contact
 * dont la fiche ne dit que « Paris » ou « Versailles » (ni code postal, ni
 * site connu du compte). Table volontairement courte : les grandes villes et
 * les communes d'ESN/industrie les plus fréquentes ; une ville absente reste
 * sans département (rien n'est deviné).
 */
const CITY_DEPARTMENT_CODE: Record<string, string> = {
  paris: '75',
  versailles: '78',
  'saint germain en laye': '78',
  'montigny le bretonneux': '78',
  'velizy villacoublay': '78',
  'boulogne billancourt': '92',
  nanterre: '92',
  'la defense': '92',
  courbevoie: '92',
  puteaux: '92',
  'issy les moulineaux': '92',
  'levallois perret': '92',
  neuilly: '92',
  'neuilly sur seine': '92',
  clamart: '92',
  chaville: '92',
  'saint denis': '93',
  montreuil: '93',
  creteil: '94',
  'ivry sur seine': '94',
  massy: '91',
  evry: '91',
  'cergy pontoise': '95',
  cergy: '95',
  lyon: '69',
  bron: '69',
  villeurbanne: '69',
  marseille: '13',
  'aix en provence': '13',
  toulouse: '31',
  blagnac: '31',
  nice: '06',
  'sophia antipolis': '06',
  nantes: '44',
  bordeaux: '33',
  merignac: '33',
  lille: '59',
  strasbourg: '67',
  montpellier: '34',
  rennes: '35',
  grenoble: '38',
  toulon: '83',
  dijon: '21',
  garchizy: '58',
  nevers: '58',
  'clermont ferrand': '63',
  rouen: '76',
  'le havre': '76',
  reims: '51',
  metz: '57',
  nancy: '54',
  angers: '49',
  tours: '37',
  orleans: '45',
  caen: '14',
  brest: '29',
  limoges: '87',
  poitiers: '86',
  besancon: '25',
  mulhouse: '68',
  'le mans': '72',
  amiens: '80',
  annecy: '74',
  pau: '64',
  bayonne: '64',
  perpignan: '66',
  avignon: '84',
  'saint etienne': '42',
  valence: '26',
  chambery: '73',
  'le creusot': '71',
  'chalon sur saone': '71',
  belfort: '90',
  montbeliard: '25',
  sochaux: '25',
  bourges: '18',
  roanne: '42',
  'saint nazaire': '44',
  lorient: '56',
  vannes: '56',
}

/** Le département d'une ville française COURANTE (table courte), ou `null`. */
export function departmentFromCity(label: string): FrenchDepartment | null {
  const code = CITY_DEPARTMENT_CODE[normalise(label)]
  return code ? departmentByCode(code) : null
}

export { normalise as normaliseGeoLabel }
