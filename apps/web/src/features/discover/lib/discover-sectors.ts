import {
  APPLICATION_SECTORS,
  APPLICATION_SECTOR_GROUPS,
  sectorCodesForGroup,
  type ApplicationSectorGroup,
} from '@bellum/contracts'

/**
 * Les secteurs de Découvrir — la MÊME liste que partout ailleurs dans Bellum.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE MODULE CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Découvrir portait sa PROPRE liste de dix secteurs, écrite à la main dans
 * `discover-query.ts`. Ce n'étaient pas des secteurs : c'étaient les dix
 * GROUPES du vocabulaire partagé, recopiés avec d'autres libellés. Deux
 * conséquences, toutes deux vues à l'écran le 04/09/2026 :
 *
 *  · le secteur prioritaire d'une cible (« Aéronautique & Défense ») n'était
 *    cochable NULLE PART, parce que le vocabulaire partagé le sépare en deux —
 *    `aerospace` et `defense`, « des cycles, des habilitations et des acheteurs
 *    différents » ;
 *  · « Industrie » valait la section NAF `C` entière, soit les divisions 10 à
 *    33 : un fabricant de dispositifs médicaux remontait sous le même filtre
 *    qu'un avionneur.
 *
 * Un réglage vit à un seul endroit (loi 1 du tome 7). Une TAXINOMIE aussi.
 */

/** Les groupes, dans l'ordre du vocabulaire partagé — l'écran ne réordonne pas. */
export const SECTOR_GROUP_ORDER: readonly ApplicationSectorGroup[] = APPLICATION_SECTOR_GROUPS

/** Accents et casse retirés : « Énergie » et « energie » sont le même mot. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Les secteurs partagés reconnus dans des libellés libres (le profil ESN écrit
 * « Aéronautique & Défense », pas `aerospace`).
 *
 * La reconnaissance porte sur le libellé FR **et** EN — le produit est bilingue
 * et un profil saisi en anglais ne doit pas perdre sa cible. Un libellé
 * composite en nomme plusieurs : « Aéronautique & Défense » contient
 * « aéronautique » et « défense », donc rend les deux.
 *
 * ⚠️ Un libellé non reconnu n'ajoute RIEN. Un secteur faux est pire qu'aucun
 * secteur : il remplacerait la liste de l'utilisateur par une autre, sans le
 * dire.
 */
export function matchApplicationSectors(labels: readonly string[]): string[] {
  const found: string[] = []
  for (const label of labels) {
    const folded = fold(label)
    if (!folded) continue

    // 1. Le libellé nomme-t-il un secteur PRÉCIS ? « Aéronautique & Défense »
    //    contient « aéronautique » et « défense », donc rend les deux.
    let matchedHere = false
    for (const sector of APPLICATION_SECTORS) {
      const terms = [sector.labelFr, sector.labelEn]
        .flatMap(value => fold(value).split(/\s*&\s*/))
        .map(term => term.trim())
        .filter(term => term.length >= 4)
      if (terms.some(term => folded.includes(term))) {
        matchedHere = true
        if (!found.includes(sector.code)) found.push(sector.code)
      }
    }
    if (matchedHere) continue

    // 2. Sinon, nomme-t-il un GROUPE ? Un profil ESN écrit souvent large —
    //    « Banque », « Industrie », « Santé ». Aucun libellé fin ne les
    //    contient (« Banque de détail & privée » ne contient pas « banque »
    //    comme terme entier), et s'arrêter là ferait perdre la cible de
    //    quelqu'un qui a rempli son profil correctement. Le groupe entier est
    //    la lecture honnête de « je cible la banque ».
    const group = GROUP_ALIASES.find(entry => entry.terms.some(term => folded.includes(term)))
    if (!group) continue
    for (const code of sectorCodesForGroup(group.group)) if (!found.includes(code)) found.push(code)
  }
  return found
}

/** Les mots LARGES d'un profil ESN → le groupe qu'ils désignent. Repris des
 *  anciens `SECTOR_ALIASES` de Découvrir, qui rendaient déjà ce service — c'est
 *  la seule part de l'ancienne liste qui valait d'être gardée. */
const GROUP_ALIASES: ReadonlyArray<{ group: ApplicationSectorGroup; terms: string[] }> = [
  { group: 'tech', terms: ['informatique', 'numerique', 'digital', 'logiciel', 'software', 'telecom'] },
  { group: 'finance', terms: ['banque', 'bank', 'assurance', 'insurance', 'finance', 'mutuelle'] },
  { group: 'energie', terms: ['energie', 'energy', 'utilities'] },
  { group: 'industrie', terms: ['industrie', 'industry', 'manufacturing', 'manufacturiere'] },
  { group: 'sante', terms: ['sante', 'health', 'hopital', 'medico'] },
  { group: 'commerce', terms: ['commerce', 'distribution', 'retail'] },
  { group: 'transport', terms: ['transport', 'logistique', 'logistics'] },
  { group: 'construction', terms: ['construction', 'btp', 'batiment'] },
  { group: 'public', terms: ['public', 'collectivite', 'administration', 'government'] },
  { group: 'process', terms: ['chimie', 'chemical', 'agroalimentaire', 'procede'] },
]

/** L'état d'un groupe face à une sélection : rien, une partie, ou tout. C'est
 *  ce que la pastille de groupe doit MONTRER — un groupe à moitié coché qui
 *  s'affiche comme décoché fait recliquer pour rien. */
export function groupSelectionState(
  sectors: readonly string[],
  group: ApplicationSectorGroup,
): 'none' | 'partial' | 'all' {
  const members = sectorCodesForGroup(group)
  const picked = members.filter(code => sectors.includes(code))
  if (picked.length === 0) return 'none'
  return picked.length === members.length ? 'all' : 'partial'
}

interface GroupToggleResult {
  sectors: string[]
  /** Combien de sous-secteurs du groupe N'ONT PAS pu entrer sous le plafond de
   *  {@link MAX_SEARCH_SECTORS} — `0` si tout est entré, ou si le groupe se
   *  RETIRE (un retrait ne heurte jamais le plafond). */
  droppedCount: number
  /** #3815 — recette prod 08/10 : « 6 sous-secteurs non ajoutés » NOMMAIT un
   *  compte, jamais les 6. Les codes eux-mêmes, dans l'ordre du groupe — à
   *  l'écran de les traduire et de les lister (ou de les mettre en
   *  info-bulle). Vide si tout est entré, ou si le groupe se RETIRE. */
  droppedCodes: string[]
}

/**
 * Le clic sur une pastille de GROUPE.
 *
 * ⚠️ Un groupe PARTIELLEMENT coché se COMPLÈTE, il ne se vide pas. Le geste
 * attendu quand on clique « Industrie » après avoir coché « Aéronautique » est
 * « prends tout l'industrie », jamais « perds ce que j'avais choisi ». Seul un
 * groupe déjà complet se retire.
 *
 * #3815 — « clic sur secteur refusé alors que le compteur affiche 3/5 » : un
 * groupe de 8 secteurs (`industrie`) cliqué à 3/5 visait 11, le plafond
 * REFUSAIT tout en bloc. Ça AJOUTE désormais ce qui tient sous le plafond et
 * NOMME (`droppedCount`) ce qui n'a pas tenu, au lieu d'un refus muet.
 */
export function sectorsForGroupToggle(sectors: readonly string[], group: ApplicationSectorGroup): GroupToggleResult {
  const members = sectorCodesForGroup(group)
  if (groupSelectionState(sectors, group) === 'all') {
    return { sectors: sectors.filter(code => !members.includes(code)), droppedCount: 0, droppedCodes: [] }
  }
  const next = [...sectors]
  const droppedCodes: string[] = []
  for (const code of members) {
    if (next.includes(code)) continue
    if (next.length >= MAX_SEARCH_SECTORS) {
      droppedCodes.push(code)
      continue
    }
    next.push(code)
  }
  return { sectors: next, droppedCount: droppedCodes.length, droppedCodes }
}

/**
 * KEVIN-FIX K.5 (recette prod 20/10) — le plafond se dit AVANT le clic : « Industrie et fabrication » ajoutait
 * 5 sous-secteurs d'un coup et saturait 5/5, le message « 3 non ajoutés » n'arrivait qu'après. Ce que le clic
 * sur un groupe FERA, lu sur la même règle que le clic (`sectorsForGroupToggle`, GA-26) : combien il en ajoutera,
 * combien ne tiendront pas, combien de places restent.
 */
export function groupAddPreview(
  sectors: readonly string[],
  group: ApplicationSectorGroup,
): { willAdd: number; missing: number; room: number } {
  const room = Math.max(0, MAX_SEARCH_SECTORS - sectors.length)
  const { sectors: next, droppedCount } = sectorsForGroupToggle(sectors, group)
  return { willAdd: Math.max(0, next.length - sectors.length), missing: droppedCount, room }
}

/**
 * Les dix anciennes clés de Découvrir → les secteurs fins du groupe qu'elles
 * désignaient réellement.
 *
 * ⚠️ Sans cette table, toute recherche DÉJÀ ENREGISTRÉE perdrait son périmètre
 * en silence — `pickKnown` écartait simplement les clés inconnues. « On archive,
 * on ne supprime pas » vaut aussi pour un critère de recherche.
 */
const LEGACY_SECTOR_GROUP: Readonly<Record<string, ApplicationSectorGroup>> = {
  it: 'tech',
  telecom: 'tech',
  finance: 'finance',
  energy: 'energie',
  industry: 'industrie',
  health: 'sante',
  retail: 'commerce',
  transport: 'transport',
  construction: 'construction',
  public: 'public',
}

// V4-CORRECTIFS-C 4284.23 — `?sectors=…,media` : un surnom de lien partagé qui désigne UN secteur fin, pas un
// groupe. Sans lui `migrateLegacySectors` l'écartait en silence et l'URL était réécrite sans le secteur.
const SECTOR_ALIAS: Readonly<Record<string, string>> = {
  media: 'media_entertainment',
  medias: 'media_entertainment',
}

const KNOWN_SECTOR_CODES: ReadonlySet<string> = new Set(APPLICATION_SECTORS.map(sector => sector.code))

/**
 * R22-DV5 — un lien profond `/discover?sectors=…` écrit à la main (ou par un tiers) ne porte pas toujours le code
 * exact : « Nuclear », « Nucléaire » étaient IGNORÉS sans un mot et le filtre n'était pas posé. Le code se
 * reconnaît sans casse, et le libellé (fr ou en, accents pliés) vaut son code. Un mot inconnu reste inconnu.
 */
function sectorTokenToCode(raw: string): string {
  if (KNOWN_SECTOR_CODES.has(raw) || SECTOR_ALIAS[raw] || LEGACY_SECTOR_GROUP[raw]) return raw
  const wanted = fold(raw.trim())
  if (!wanted) return raw
  const found = APPLICATION_SECTORS.find(
    sector => fold(sector.code) === wanted || fold(sector.labelFr) === wanted || fold(sector.labelEn) === wanted,
  )
  return found?.code ?? fold(raw.trim())
}

/** Une sélection persistée → la sélection fine d'aujourd'hui. Un code déjà fin
 *  traverse intact ; `all` et l'inconnu n'ajoutent rien (« all » n'a jamais été
 *  une valeur, seulement l'absence de contrainte). */
export function migrateLegacySectors(sectors: readonly string[]): string[] {
  const out: string[] = []
  for (const given of sectors) {
    const raw = sectorTokenToCode(given)
    if (KNOWN_SECTOR_CODES.has(raw)) {
      if (!out.includes(raw)) out.push(raw)
      continue
    }
    const alias = SECTOR_ALIAS[raw]
    if (alias) {
      if (!out.includes(alias)) out.push(alias)
      continue
    }
    const group = LEGACY_SECTOR_GROUP[raw]
    if (!group) continue
    for (const code of sectorCodesForGroup(group)) if (!out.includes(code)) out.push(code)
  }
  return out
}

/**
 * Le libellé d'un secteur partagé, dans la langue courante.
 *
 * ⚠️ Il n'y a volontairement PAS de clé i18n `sectors.<code>` pour les 41
 * secteurs : le vocabulaire partagé porte DÉJÀ `labelFr` et `labelEn`, et les
 * recopier dans `discover.json` ferait vivre la même liste à trois endroits —
 * dont deux que personne ne penserait à mettre à jour en ajoutant un secteur.
 *
 * Un code inconnu rend le code lui-même : lisible, jamais vide, et il se
 * remarque en relecture au lieu de disparaître.
 */
export function applicationSectorLabel(code: string, language: string): string {
  const sector = APPLICATION_SECTORS.find(entry => entry.code === code)
  if (!sector) return code
  return language.toLowerCase().startsWith('en') ? sector.labelEn : sector.labelFr
}

/**
 * #3528 (Louis 01/10) — « limiter la recherche à 5 secteurs/sous-secteurs maxi
 * pour avoir une recherche plus fine ». Une recherche à dix secteurs est une
 * recherche sur « presque tout » : le plafond force le choix. Un seul endroit
 * (GA-26) : le sélecteur du rail ET le choix quand « Appliquer ma cible »
 * en ramène davantage lisent cette valeur.
 */
export const MAX_SEARCH_SECTORS = 5

/**
 * Recette 21/10 D.2 (LC.3) — le groupe « Industrie et fabrication » remplissait les 5 secteurs autorisés : énergie
 * et transport du profil (Enedis, SNCF, EDF) n'étaient jamais cherchés, sans que l'écran le dise. Le plafond
 * ne se relève pas en silence ; ce qui reste hors de la recherche SE NOMME. Les secteurs du profil que la
 * sélection ACTIVE ne couvre pas, dans l'ordre du profil. Aucune sélection de secteur = pas de contrainte
 * de secteur (rien n'est « non cherché »).
 */
export function profileSectorsNotSearched(profileSectors: readonly string[], searched: readonly string[]): string[] {
  if (searched.length === 0) return []
  const searchedSet = new Set(searched)
  return profileSectors.filter(code => !searchedSet.has(code))
}

/**
 * #4294.7 — « Secteur privé » : le pendant de « Secteur public » (le groupe `public` du vocabulaire partagé). Il
 * n'invente aucune liste : c'est l'exclusion des secteurs de ce groupe, croisée sur les NAF qu'ils portent
 * (`nafPrefixesForSectors`, le même chemin que « Secteurs exclus »). Un compte au NAF illisible n'est jamais retiré.
 */
const PUBLIC_SECTOR_CODES: readonly string[] = sectorCodesForGroup('public')

/** La puce est allumée quand TOUS les secteurs publics sont exclus. */
export function privateSectorActive(excludeSectors: readonly string[]): boolean {
  return PUBLIC_SECTOR_CODES.every(code => excludeSectors.includes(code))
}

/** Allume : ajoute les secteurs publics aux exclus (le reste est gardé) ; éteint : les retire, rien d'autre ne bouge. */
export function togglePrivateSector(excludeSectors: readonly string[]): string[] {
  if (privateSectorActive(excludeSectors)) return excludeSectors.filter(code => !PUBLIC_SECTOR_CODES.includes(code))
  return [...excludeSectors, ...PUBLIC_SECTOR_CODES.filter(code => !excludeSectors.includes(code))]
}
