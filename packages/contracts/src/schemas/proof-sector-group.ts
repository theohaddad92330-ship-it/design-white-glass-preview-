import { APPLICATION_SECTORS, APPLICATION_SECTOR_GROUPS, type ApplicationSectorGroup } from './application-sectors.js'

/**
 * #3181.2 / #3247 — LE PONT entre le secteur LIBRE d'une preuve (`Proof.sector`, saisi à la main) et le
 * vocabulaire FERMÉ des secteurs d'application. Une lecture, jamais une devinette : libellé exact
 * (FR ou EN), code, nom de groupe, ou alias NOMMÉ ci-dessous — sinon `null`. Un texte libre routé à
 * travers une table inventée produirait un faux négatif permanent (« aucune preuve dans ce secteur »).
 */
const normalise = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Alias courants — fermés, relisibles, additifs. Chacun ne désigne qu'UN groupe. */
const ALIASES: Readonly<Record<string, ApplicationSectorGroup>> = {
  banque: 'finance',
  assurance: 'finance',
  btp: 'construction',
  pharma: 'sante',
  hopital: 'sante',
  utilities: 'energie',
  logistique: 'transport',
  distribution: 'commerce',
  retail: 'commerce',
  telecom: 'tech',
  telecoms: 'tech',
  it: 'tech',
  administration: 'public',
}

const BY_KEY: ReadonlyMap<string, ApplicationSectorGroup> = new Map([
  ...APPLICATION_SECTORS.flatMap((sector): [string, ApplicationSectorGroup][] => [
    [normalise(sector.labelFr), sector.group],
    [normalise(sector.labelEn), sector.group],
    [normalise(sector.code), sector.group],
  ]),
  ...APPLICATION_SECTOR_GROUPS.map((group): [string, ApplicationSectorGroup] => [normalise(group), group]),
  ...Object.entries(ALIASES),
])

/** #3247 — séparateurs d'un libellé composé : « Secteur — précision (NAF 64.19Z) », « A / B ». */
const COMPOSITE_SEPARATORS = /\s[-–—]\s|[—–()/;,]/u

export function resolveProofSectorGroup(sector: string | null | undefined): ApplicationSectorGroup | null {
  const whole = normalise(sector ?? '')
  if (!whole) return null
  const exact = BY_KEY.get(whole)
  if (exact) return exact
  // Libellé composé : chaque segment est cherché EXACTEMENT ; si les segments qui se lisent
  // désignent deux groupes différents, c'est ambigu → null (jamais un groupe choisi au hasard).
  const groups = new Set<ApplicationSectorGroup>()
  for (const segment of (sector ?? '').split(COMPOSITE_SEPARATORS)) {
    const key = normalise(segment)
    const group = key ? BY_KEY.get(key) : undefined
    if (group) groups.add(group)
  }
  const [only] = groups
  return groups.size === 1 && only ? only : null
}
